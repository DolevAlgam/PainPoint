import { NextRequest, NextResponse } from 'next/server';
import { getRecordingURL } from '@/lib/services/recordings';
import { getOpenAIApiKey } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { spawn, execFile } from 'child_process';
import { createReadStream, createWriteStream, promises as fs, unlink } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

// Maximum file size for OpenAI API (25MB)
const MAX_CHUNK_SIZE_MB = 25;
// We'll use 5-minute segments to ensure we stay under the size limit
const CHUNK_DURATION_SECONDS = 300;
// Overlap between chunks to avoid cutting off sentences (10 seconds)
const OVERLAP_SECONDS = 10;

// Create a Supabase client with the service role key for admin access
// This bypasses RLS policies
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: NextRequest) {
  // Add timeout for the request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60 * 1000); // 60 second timeout for initial request
  
  try {
    const data = await req.json();
    const { recordingId, meetingId, userId } = data;

    console.log('Transcription request received:', { recordingId, meetingId, userId });

    if (!recordingId || !meetingId || !userId) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get the recording info - first log the query we're about to make
    console.log(`Looking for recording with ID: ${recordingId}`);
    
    try {
      // Try using the admin Supabase client directly
      const { data: recordingCheck, error: checkError } = await adminSupabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId);
        
      if (checkError) {
        console.error('Error checking for recording:', checkError);
        clearTimeout(timeoutId);
        return NextResponse.json(
          { error: `Database error when checking recording: ${checkError.message}` },
          { status: 500 }
        );
      }
      
      // Log how many recordings were found
      console.log(`Found ${recordingCheck?.length || 0} recordings with ID ${recordingId}:`, recordingCheck);
      
      if (!recordingCheck || recordingCheck.length === 0) {
        // Try an alternative query approach
        console.log('Trying alternative query approach...');
        const { data: altCheck } = await adminSupabase
          .from('recordings')
          .select('*');
          
        console.log(`Found ${altCheck?.length || 0} total recordings in database`);
        
        // Check if the ID exists in any format variations
        const matchingRecording = altCheck?.find(r => 
          r.id === recordingId || 
          r.id.toString() === recordingId.toString()
        );
        
        if (matchingRecording) {
          console.log('Found matching recording with alternative approach:', matchingRecording);
          // Use this recording instead
          const recording = matchingRecording;
          const recordingUrl = await getRecordingURL(recording.file_path, adminSupabase);
          
          // Continue with the transcription process...
          if (!recordingUrl) {
            console.error(`Failed to generate URL for file path: ${recording.file_path}`);
            clearTimeout(timeoutId);
            return NextResponse.json(
              { error: 'Could not generate download URL for recording' },
              { status: 500 }
            );
          }
          
          // Create initial transcript record
          console.log('Creating initial transcript record');
          let transcriptId: string; // Define transcriptId at a higher scope
          
          try {
            const { data: initialTranscript, error: initialError } = await adminSupabase
              .from('transcripts')
              .insert({
                meeting_id: meetingId,
                recording_id: recording.id, // Use the matched recording ID
                content: "Transcription in progress...",
                user_id: userId
              })
              .select()
              .single();
            
            if (initialError) {
              console.error('Error creating initial transcript:', initialError);
              clearTimeout(timeoutId);
              return NextResponse.json(
                { error: `Failed to create initial transcript: ${initialError.message}` },
                { status: 500 }
              );
            }
            
            // Verify the transcript was created by querying it back
            console.log(`Verifying transcript with ID: ${initialTranscript.id}`);
            const { data: transcriptCheck, error: checkError } = await adminSupabase
              .from('transcripts')
              .select('*')
              .eq('id', initialTranscript.id)
              .single();
            
            if (checkError) {
              console.error(`Error verifying transcript: ${checkError.message}`);
            } else {
              console.log('Transcript verified:', transcriptCheck);
            }
            
            transcriptId = initialTranscript.id; // Assign to the outer scope variable
            console.log(`Created initial transcript with ID: ${transcriptId}`);
            
            // Process in the background
            processTranscriptionInBackground(userId, meetingId, recording.id)
              .catch(err => {
                console.error('Background transcription failed:', err);
                // Update transcript to indicate failure
                adminSupabase
                  .from('transcripts')
                  .update({ 
                    content: `Transcription failed: ${err.message}`
                  })
                  .eq('recording_id', recording.id)
                  .eq('meeting_id', meetingId);
              });
            
            // Return with transcript ID
            clearTimeout(timeoutId);
            return NextResponse.json({
              success: true,
              message: 'Transcription started',
              transcriptId
            });
          } catch (err: any) {
            console.error('Unexpected error creating transcript:', err);
            clearTimeout(timeoutId);
            return NextResponse.json(
              { error: `Unexpected error: ${err.message}` },
              { status: 500 }
            );
          }
        }
        
        // If we still can't find it, return an error
        clearTimeout(timeoutId);
        return NextResponse.json(
          { error: `Recording with ID ${recordingId} not found` },
          { status: 404 }
        );
      }
      
      // We found at least one matching recording, use the first one
      const recording = recordingCheck[0];
      console.log(`Using recording: ${recording.file_name} (${recording.id})`);
      
      // Get the recording URL
      const recordingUrl = await getRecordingURL(recording.file_path, adminSupabase);
      if (!recordingUrl) {
        console.error(`Failed to generate URL for file path: ${recording.file_path}`);
        clearTimeout(timeoutId);
        return NextResponse.json(
          { error: 'Could not generate download URL for recording' },
          { status: 500 }
        );
      }
      
      // Create an initial transcript record to show processing has started
      console.log('Creating initial transcript record');
      let transcriptId: string; // Define transcriptId at a higher scope
      
      try {
        const { data: initialTranscript, error: initialError } = await adminSupabase
          .from('transcripts')
          .insert({
            meeting_id: meetingId,
            recording_id: recording.id,
            content: "Transcription in progress...",
            user_id: userId
          })
          .select()
          .single();
        
        if (initialError) {
          console.error('Error creating initial transcript:', initialError);
          clearTimeout(timeoutId);
          return NextResponse.json(
            { error: `Failed to create initial transcript: ${initialError.message}` },
            { status: 500 }
          );
        }
        
        // Verify the transcript was created by querying it back
        console.log(`Verifying transcript with ID: ${initialTranscript.id}`);
        const { data: transcriptCheck, error: checkError } = await adminSupabase
          .from('transcripts')
          .select('*')
          .eq('id', initialTranscript.id)
          .single();
        
        if (checkError) {
          console.error(`Error verifying transcript: ${checkError.message}`);
        } else {
          console.log('Transcript verified:', transcriptCheck);
        }
        
        transcriptId = initialTranscript.id; // Assign to the outer scope variable
        console.log(`Created initial transcript with ID: ${transcriptId}`);
      } catch (err: any) {
        console.error('Unexpected error creating transcript:', err);
        clearTimeout(timeoutId);
        return NextResponse.json(
          { error: `Unexpected error: ${err.message}` },
          { status: 500 }
        );
      }
      
      // Process in the background
      processTranscriptionInBackground(userId, meetingId, recording.id)
        .catch(err => {
          console.error('Background transcription failed:', err);
          // Update the transcript to indicate failure
          adminSupabase
            .from('transcripts')
            .update({ 
              content: `Transcription failed: ${err.message}`
            })
            .eq('recording_id', recording.id)
            .eq('meeting_id', meetingId);
        });
        
      // Return immediately with the transcript ID
      clearTimeout(timeoutId);
      return NextResponse.json({
        success: true,
        message: 'Transcription started',
        transcriptId
      });
    } catch (queryError: any) {
      console.error('Error during recording lookup:', queryError);
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: `Error during recording lookup: ${queryError.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Transcription request error:', error);
    clearTimeout(timeoutId);
    
    // Check for abort error specifically
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out. Your recording may be too large to process.' },
        { status: 504 }  // Gateway Timeout
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'An error occurred processing the request' },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// This function runs in the background after the API has responded
async function processTranscriptionInBackground(
  userId: string, 
  meetingId: string, 
  recordingId: string
): Promise<void> {
  let tempDir = '';
  let apiKey = '';
  
  try {
    // Retrieve user's OpenAI API key from users metadata
    console.log('Retrieving user OpenAI API key');
    const { data: userData, error: userError } = await adminSupabase
      .from('users')  // Correct table name in Supabase
      .select('*')
      .eq('id', userId)
      .single();
    
    if (userError) {
      console.error('Error fetching user from users table:', userError.message);
      // Try alternative approach using auth API
      try {
        console.log('Trying alternative approach to fetch user data via auth API...');
        const { data: authUser, error: authError } = await adminSupabase.auth.admin.getUserById(userId);
        
        if (authError) throw authError;
        
        if (authUser?.user?.user_metadata?.openai_api_key) {
          apiKey = authUser.user.user_metadata.openai_api_key;
          console.log('Found API key in user metadata using auth API');
        } else {
          // Fallback to environment variable
          console.log('No API key found in auth user metadata, falling back to environment variable');
          apiKey = process.env.OPENAI_API_KEY || '';
          
          if (!apiKey) {
            throw new Error('No OpenAI API key available. Please add your API key in settings.');
          }
        }
      } catch (authApiError: any) {
        console.error('Error with auth API:', authApiError.message);
        // Continue with fallback to environment variable
        console.log('Falling back to environment variable after all user fetch methods failed');
        apiKey = process.env.OPENAI_API_KEY || '';
        
        if (!apiKey) {
          throw new Error('No OpenAI API key available. Please add your API key in settings.');
        }
      }
    } else {
      // Try to get API key from user metadata in users table
      if (userData?.openai_api_key) {
        apiKey = userData.openai_api_key;
        console.log('Found API key in users table');
      } else if (userData?.metadata?.openai_api_key) {
        apiKey = userData.metadata.openai_api_key;
        console.log('Found API key in users metadata field');
      } else {
        // Fallback to environment variable
        console.log('No API key found in users table, falling back to environment variable');
        apiKey = process.env.OPENAI_API_KEY || '';
        
        if (!apiKey) {
          throw new Error('No OpenAI API key available. Please add your API key in settings.');
        }
      }
    }
    
    // Update transcript status to processing  
    console.log('Updating transcript to show processing started');
    const { error: processUpdateError } = await adminSupabase
      .from('transcripts')
      .update({
        content: 'Processing audio file...'
      })
      .eq('recording_id', recordingId)
      .eq('meeting_id', meetingId);

    if (processUpdateError) {
      console.error('Error updating transcript for processing:', processUpdateError);
    } else {
      console.log('Successfully updated transcript for processing');
    }
    
    // Get recording from database
    console.log(`Fetching recording: ${recordingId}`);
    const { data: recording, error: recordingError } = await adminSupabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
    
    if (recordingError || !recording) {
      throw new Error(`Failed to fetch recording: ${recordingError?.message || 'Recording not found'}`);
    }
    
    // Get signed URL for the recording
    console.log(`Getting signed URL for recording: ${recording.file_path}`);
    const recordingUrl = await getRecordingURL(recording.file_path, adminSupabase);
    if (!recordingUrl) {
      throw new Error('Could not generate download URL for recording');
    }
    
    // Create a unique temp directory for this transcription job
    const timestamp = Date.now();
    tempDir = path.join(os.tmpdir(), `transcript_${meetingId}_${timestamp}`);
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`Created temp directory: ${tempDir}`);
    
    // Download the audio file
    const audioFilePath = path.join(tempDir, 'audio.mp3');
    console.log(`Downloading audio file to: ${audioFilePath}`);
    
    await downloadFile(recordingUrl, audioFilePath);
    
    // Verify the audio file was downloaded successfully
    if (!await fileExists(audioFilePath)) {
      throw new Error(`Failed to download audio file to ${audioFilePath}`);
    }
    
    const stats = await fs.stat(audioFilePath);
    console.log(`Downloaded audio file (${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);
    
    // Update progress
    console.log('Updating transcript to show splitting started');
    const { error: splitUpdateError } = await adminSupabase
      .from('transcripts')
      .update({ 
        content: 'Splitting audio into segments...'
      })
      .eq('recording_id', recordingId)
      .eq('meeting_id', meetingId);

    if (splitUpdateError) {
      console.error('Error updating transcript for splitting:', splitUpdateError);
    } else {
      console.log('Successfully updated transcript for splitting');
    }
    
    // Split the audio file into segments
    const segmentsDir = path.join(tempDir, 'segments');
    console.log(`Splitting audio file into segments in: ${segmentsDir}`);
    
    const segmentFiles = await splitAudioFile(audioFilePath, segmentsDir);
    console.log(`Split audio into ${segmentFiles.length} segments`);
    
    // Update progress after splitting
    console.log('Updating transcript to show transcription started');
    const { error: transcriptionUpdateError } = await adminSupabase
      .from('transcripts')
      .update({ 
        content: `Transcribing ${segmentFiles.length} segments...`
      })
      .eq('recording_id', recordingId)
      .eq('meeting_id', meetingId);

    if (transcriptionUpdateError) {
      console.error('Error updating transcript for transcription:', transcriptionUpdateError);
    } else {
      console.log('Successfully updated transcript for transcription');
    }
    
    // Process each segment to transcribe
    const segmentTranscriptions: string[] = [];
    
    // Define a concurrency limit to avoid overwhelming the API and memory
    const MAX_CONCURRENT_REQUESTS = 10;

    // Create arrays to track segment processing
    const allSegments = [...segmentFiles];
    const processedResults = new Array(segmentFiles.length).fill(null);
    let completedCount = 0;

    // Update the transcript with initial information about parallel processing
    console.log(`Starting parallel transcription of ${allSegments.length} segments with max ${MAX_CONCURRENT_REQUESTS} concurrent requests`);
    await adminSupabase
      .from('transcripts')
      .update({
        content: `Starting parallel transcription of ${allSegments.length} segments...`
      })
      .eq('recording_id', recordingId)
      .eq('meeting_id', meetingId);

    // Process segments in batches with limited concurrency
    while (completedCount < allSegments.length) {
      // Calculate how many new tasks we can start
      const pendingCount = allSegments.length - completedCount;
      const batchSize = Math.min(MAX_CONCURRENT_REQUESTS, pendingCount);
      
      console.log(`Processing batch of ${batchSize} segments (${completedCount + 1} to ${completedCount + batchSize} of ${allSegments.length})`);
      
      // Update transcript status for this batch - MOVED outside the loop
      const { error: batchUpdateError } = await adminSupabase
        .from('transcripts')
        .update({
          content: `Transcribing segments ${completedCount + 1}-${completedCount + batchSize} of ${allSegments.length}...`
        })
        .eq('recording_id', recordingId)
        .eq('meeting_id', meetingId);
        
      if (batchUpdateError) {
        console.error(`Error updating transcript for batch ${completedCount + 1}-${completedCount + batchSize}:`, batchUpdateError);
      } else {
        console.log(`Successfully updated transcript for batch ${completedCount + 1}-${completedCount + batchSize}`);
      }
      
      // Start a batch of transcription tasks
      const batchPromises = [];
      
      for (let i = 0; i < batchSize; i++) {
        const segmentIndex = completedCount + i;
        const segmentFile = allSegments[segmentIndex];
        
        // Create a promise for this segment's transcription
        const processPromise = (async () => {
          const segmentNum = segmentIndex + 1;
          console.log(`Starting transcription of segment ${segmentNum}/${allSegments.length}: ${segmentFile}`);
          
          try {
            // Process this segment
            const segmentText = await transcribeAudioChunk(segmentFile, apiKey);
            
            // Store the result in its original order position
            processedResults[segmentIndex] = segmentText;
            console.log(`Completed transcription of segment ${segmentNum}/${allSegments.length}`);
            
            // Clean up the segment file to free disk space
            try {
              await fs.unlink(segmentFile);
            } catch (unlinkError) {
              console.error(`Warning: Could not delete segment file ${segmentFile}: ${unlinkError}`);
            }
            
            return { success: true, index: segmentIndex };
          } catch (segmentError: any) {
            console.error(`Error processing segment ${segmentNum}: ${segmentError.message}`);
            return { success: false, index: segmentIndex, error: segmentError };
          }
        })();
        
        batchPromises.push(processPromise);
      }
      
      // Wait for all tasks in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Check for errors in batch
      const errors = batchResults.filter(result => !result.success);
      if (errors.length > 0) {
        const error = errors[0].error;
        throw new Error(`Failed to transcribe segment ${errors[0].index + 1}: ${error.message}`);
      }
      
      // Update completed count
      completedCount += batchSize;
      
      // Update progress in the database periodically (after each batch)
      const progressPercentage = Math.round((completedCount / allSegments.length) * 100);
      console.log(`Completed ${completedCount}/${allSegments.length} segments (${progressPercentage}%)`);

      // Update the transcript with current progress
      const { error: progressUpdateError } = await adminSupabase
        .from('transcripts')
        .update({
          content: `Transcription progress: ${progressPercentage}% (${completedCount}/${allSegments.length} segments complete)`
        })
        .eq('recording_id', recordingId)
        .eq('meeting_id', meetingId);

      if (progressUpdateError) {
        console.error('Error updating progress in transcript:', progressUpdateError);
      } else {
        console.log(`Updated transcript with progress: ${progressPercentage}%`);
      }
    }

    // All segments have been processed, collect the results in correct order
    segmentTranscriptions.push(...processedResults.filter(Boolean));

    // Ensure we have all segments
    if (segmentTranscriptions.length !== segmentFiles.length) {
      console.error(`Warning: Expected ${segmentFiles.length} transcriptions but got ${segmentTranscriptions.length}`);
    }
    
    // Combine all transcriptions with special handling for overlapping content
    const combinedTranscription = combineOverlappingTranscriptions(segmentTranscriptions, OVERLAP_SECONDS);
    console.log('Combined transcription:', combinedTranscription);
    // Save the final transcript
    console.log('Saving final transcript');
    const { data: updateResult, error: updateError } = await adminSupabase
      .from('transcripts')
      .update({
        content: combinedTranscription
      })
      .eq('recording_id', recordingId)
      .eq('meeting_id', meetingId);

    if (updateError) {
      console.error('Error updating transcript:', updateError);
    } else {
      console.log('Transcript update result:', updateResult);
      
      // Update meeting record to indicate transcript is available
      console.log(`Updating meeting ${meetingId} to set has_transcript=true`);
      const { data: meetingUpdate, error: meetingUpdateError } = await adminSupabase
        .from('meetings')
        .update({ has_transcript: true })
        .eq('id', meetingId);
        
      if (meetingUpdateError) {
        console.error(`Error updating meeting status: ${meetingUpdateError.message}`);
      } else {
        console.log('Successfully updated meeting has_transcript status to true');
      }
    }

    console.log(`Transcription completed successfully for meeting: ${meetingId}, recording: ${recordingId}`);
    
    // And also let's try a different approach for finding the transcript by id
    // In one of the error loggers, add a check by transcript id
    try {
      console.log('Checking if transcript exists by id');
      const { data: transcripts, error: listError } = await adminSupabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('recording_id', recordingId);
        
      if (listError) {
        console.error('Error listing transcripts:', listError);
      } else {
        console.log(`Found ${transcripts.length} transcripts for this recording:`, transcripts);
      }
    } catch (e) {
      console.error('Error checking transcripts:', e);
    }
    
  } catch (error: any) {
    console.error(`Transcription failed: ${error.message}`);
    
    // Update transcript status to failed
    try {
      await adminSupabase
        .from('transcripts')
        .update({
          content: `Transcription failed: ${error.message}`
        })
        .eq('recording_id', recordingId)
        .eq('meeting_id', meetingId);
    } catch (updateError) {
      console.error(`Failed to update transcript status: ${updateError}`);
    }
  } finally {
    // Clean up temporary directory
    if (tempDir) {
      try {
        console.log(`Cleaning up temp directory: ${tempDir}`);
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Warning: Could not clean up temp directory: ${cleanupError}`);
      }
    }
  }
}

// Helper function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper function to download a file from a URL
async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  
  const fileStream = createWriteStream(outputPath);
  
  return new Promise((resolve, reject) => {
    // Handle different stream implementations
    if (response.body && 'getReader' in response.body) {
      // Web Streams API approach
      const reader = response.body.getReader();
      
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(Buffer.from(value));
          }
          fileStream.end();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      processStream().catch(reject);
      fileStream.on('error', reject);
    } else if (response.body) {
      // Node.js ReadableStream approach
      const stream = response.body as unknown as NodeJS.ReadableStream;
      stream.pipe(fileStream);
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    } else {
      // Fallback for older implementations
      response.arrayBuffer().then(buffer => {
        fileStream.write(Buffer.from(buffer));
        fileStream.end();
        resolve();
      }).catch(reject);
    }
  });
}

// Split audio file into manageable segments for transcription
async function splitAudioFile(
  inputFile: string, 
  outputDir: string, 
  segmentDuration: number = 300 // 5 minutes per segment by default
): Promise<string[]> {
  try {
    console.log(`Splitting audio file: ${inputFile} into ${segmentDuration}-second segments`);
    
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });
    
    // Get audio duration and format
    const fileInfo = await getAudioFileInfo(inputFile);
    console.log(`Audio file duration: ${fileInfo.duration} seconds, format: ${fileInfo.format}`);
    
    // Determine optimal segment duration based on file size
    const stats = await fs.stat(inputFile);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    // Adjust segment duration based on file size to prevent memory issues
    // Smaller segments for larger files
    let adjustedSegmentDuration = segmentDuration;
    if (fileSizeMB > 50) {
      adjustedSegmentDuration = 120; // 2 minutes for very large files
      console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
    } else if (fileSizeMB > 30) {
      adjustedSegmentDuration = 180; // 3 minutes for large files
      console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
    }
    
    // For very short files, don't split
    if (fileInfo.duration <= adjustedSegmentDuration) {
      console.log('Audio file is short enough, no need to split');
      const outputFile = path.join(outputDir, 'segment_000.mp3');
      
      // Copy the file instead of creating a symbolic link (more reliable)
      await fs.copyFile(inputFile, outputFile);
      return [outputFile];
    }
    
    // Calculate number of segments needed
    const segmentCount = Math.ceil(fileInfo.duration / adjustedSegmentDuration);
    console.log(`Splitting into ${segmentCount} segments of ${adjustedSegmentDuration} seconds each`);
    
    const segmentFiles: string[] = [];
    
    // Process each segment one at a time to reduce memory usage
    for (let i = 0; i < segmentCount; i++) {
      // Calculate segment start time with overlap
      // First segment starts at 0, others start OVERLAP_SECONDS before their normal position
      const startTime = i === 0 ? 0 : i * adjustedSegmentDuration - OVERLAP_SECONDS;
      
      // Ensure we don't go negative with start time
      const safeStartTime = Math.max(0, startTime);
      
      // For the duration, add overlap to most segments except potentially the last one
      // The last segment might need special handling to not exceed file duration
      const remainingDuration = fileInfo.duration - safeStartTime;
      const segmentDurationWithOverlap = i < segmentCount - 1 
        ? adjustedSegmentDuration + OVERLAP_SECONDS 
        : remainingDuration;
      
      const segmentFile = path.join(outputDir, `segment_${i.toString().padStart(3, '0')}.mp3`);
      segmentFiles.push(segmentFile);
      
      console.log(`Segment ${i+1}/${segmentCount}: ${safeStartTime}s to ${safeStartTime + segmentDurationWithOverlap}s`);
      
      // Use execFile to run ffmpeg as a separate process with robust error handling
      await new Promise<void>((resolve, reject) => {
        const ffmpegArgs = [
          '-y', // Overwrite output files without asking
          '-i', inputFile,
          '-ss', safeStartTime.toString(),
          '-t', segmentDurationWithOverlap.toString(),
          '-acodec', 'libmp3lame',
          '-ar', '16000', // Reduce to 16kHz sample rate to reduce file size
          '-ac', '1',     // Convert to mono
          '-b:a', '48k',  // Even lower bitrate for smaller file size
          segmentFile
        ];
        
        // Run ffmpeg as a separate process
        const ffmpegProcess = execFile('ffmpeg', ffmpegArgs);
        
        // Clean up and resolve/reject based on process exit
        ffmpegProcess.on('error', (error) => {
          console.error(`FFmpeg process error: ${error.message}`);
          reject(error);
        });
        
        ffmpegProcess.on('exit', (code) => {
          if (code === 0) {
            console.log(`Created segment ${i+1}/${segmentCount}: ${segmentFile}`);
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });
      });
      
      // Verify the segment was created successfully
      if (!await fileExists(segmentFile)) {
        throw new Error(`Failed to create segment file: ${segmentFile}`);
      }
      
      // Check segment file size
      const segmentStats = await fs.stat(segmentFile);
      const segmentSizeMB = segmentStats.size / (1024 * 1024);
      console.log(`Segment ${i+1} size: ${segmentSizeMB.toFixed(2)}MB`);
      
      // If segment is still too large, we need to reduce quality further
      if (segmentSizeMB > 20) {
        console.warn(`Segment ${i+1} is still large (${segmentSizeMB.toFixed(2)}MB), consider further quality reduction`);
      }
    }
    
    return segmentFiles;
  } catch (error: any) {
    console.error(`Error splitting audio file: ${error.message}`);
    throw error;
  }
}

// Get audio file information (duration, format)
async function getAudioFileInfo(filePath: string): Promise<{duration: number, format: string}> {
  return new Promise((resolve, reject) => {
    const ffprobeArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration,format_name',
      '-of', 'json',
      filePath
    ];
    
    execFile('ffprobe', ffprobeArgs, (error, stdout) => {
      if (error) {
        reject(new Error(`FFprobe failed: ${error.message}`));
        return;
      }
      
      try {
        const data = JSON.parse(stdout);
        const duration = parseFloat(data.format.duration);
        const format = data.format.format_name;
        resolve({ duration, format });
      } catch (parseError: any) {
        reject(new Error(`Failed to parse FFprobe output: ${parseError.message}`));
      }
    });
  });
}

// Transcribe an audio chunk using OpenAI API
async function transcribeAudioChunk(filePath: string, apiKey: string): Promise<string> {
  try {
    // Check if file exists and get size
    if (!await fileExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const stats = await fs.stat(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB > MAX_CHUNK_SIZE_MB) {
      throw new Error(`File size (${fileSizeMB.toFixed(2)}MB) exceeds OpenAI's ${MAX_CHUNK_SIZE_MB}MB limit`);
    }
    
    // Log the chunk size for monitoring
    console.log(`Transcribing audio chunk: ${filePath} (${fileSizeMB.toFixed(2)}MB)`);
    
    // Get the file name from the path
    const fileName = path.basename(filePath);
    
    // Initialize the newer OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    console.log(`Sending ${fileName} to OpenAI API using whisper-1 model (${fileSizeMB.toFixed(2)}MB)`);
    
    // Use the createReadStream approach recommended by OpenAI
    const fileStream = createReadStream(filePath);
    
    // Create transcription using the proper file format for Node.js
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
      response_format: "json",
      language: "en"
    });
    
    // Return the transcribed text
    return transcriptionResponse.text || "";
    
  } catch (error: any) {
    console.error(`Error transcribing audio chunk: ${error.message}`);
    throw error;
  }
}

// Helper function to intelligently combine transcriptions from overlapping segments
function combineOverlappingTranscriptions(transcriptions: string[], overlapSeconds: number): string {
  if (transcriptions.length <= 1) {
    return transcriptions.join('');
  }
  
  // Function to split a transcription into words
  const getWords = (text: string) => text.trim().split(/\s+/);
  
  let result = transcriptions[0];
  
  // Process each subsequent transcription
  for (let i = 1; i < transcriptions.length; i++) {
    const current = transcriptions[i];
    
    // Estimate how many words might be in the overlap region
    // Assuming average speaking rate of ~150 words per minute = 2.5 words per second
    const estimatedOverlapWordCount = Math.round(overlapSeconds * 2.5);
    
    // Get the last N words from the previous combined result
    const prevWords = getWords(result);
    const prevTail = prevWords.slice(Math.max(0, prevWords.length - estimatedOverlapWordCount * 2));
    
    // Get the first N words from the current segment
    const currentWords = getWords(current);
    const currentHead = currentWords.slice(0, Math.min(currentWords.length, estimatedOverlapWordCount * 2));
    
    // Try to find overlap by matching sequences of words
    let bestMatch = {
      overlapStart: 0,
      overlapLength: 0
    };
    
    // Look for matching sequences
    for (let j = 1; j < prevTail.length; j++) {
      let matchLength = 0;
      
      // Count how many consecutive words match
      while (
        j + matchLength < prevTail.length && 
        matchLength < currentHead.length && 
        prevTail[j + matchLength].toLowerCase() === currentHead[matchLength].toLowerCase()
      ) {
        matchLength++;
      }
      
      // Update best match if this one is better
      if (matchLength > bestMatch.overlapLength) {
        bestMatch = {
          overlapStart: j,
          overlapLength: matchLength
        };
      }
    }
    
    // If we found a good overlap (at least 2 words), merge based on that
    if (bestMatch.overlapLength >= 2) {
      // Get the index in the full result where the overlap starts
      const overlapStartInResult = prevWords.length - prevTail.length + bestMatch.overlapStart;
      
      // Merge: keep everything up to the overlap, then add current segment from after the overlap
      result = prevWords.slice(0, overlapStartInResult).join(' ') + ' ' + current;
      
      console.log(`Found overlap of ${bestMatch.overlapLength} words between segments ${i-1} and ${i}`);
    } else {
      // No good overlap found, just concatenate with a space
      result += ' ' + current;
      console.log(`No significant overlap found between segments ${i-1} and ${i}`);
    }
  }
  
  return result;
} 