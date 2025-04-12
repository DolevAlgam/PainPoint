import { SQSEvent, SQSHandler } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsp } from 'fs';
import fetch from 'node-fetch';
import { createWriteStream } from 'fs';
import OpenAI from 'openai';

// Configure AWS services
const s3 = new AWS.S3();

// Create a Supabase client with the service role key for admin access
const adminSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Maximum file size for OpenAI API (25MB)
const MAX_CHUNK_SIZE_MB = 25;
// We'll use 5-minute segments to ensure we stay under the size limit
const CHUNK_DURATION_SECONDS = 300;
// Overlap between chunks to avoid cutting off sentences (10 seconds)
const OVERLAP_SECONDS = 10;

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      console.log('Processing SQS message:', record.body);
      const message = JSON.parse(record.body);
      const { userId, meetingId, recordingId } = message;
      
      if (!userId || !meetingId || !recordingId) {
        console.error('Missing required parameters in SQS message');
        continue;
      }
      
      await processTranscriptionInBackground(userId, meetingId, recordingId);
    } catch (error) {
      console.error('Error processing SQS message:', error);
    }
  }
};

// This is adapted from the existing processTranscriptionInBackground function
async function processTranscriptionInBackground(
  userId: string, 
  meetingId: string, 
  recordingId: string
): Promise<void> {
  let tempDir = '';
  let apiKey = '';
  
  try {
    // Retrieve user's OpenAI API key from user_settings table
    console.log('Retrieving user OpenAI API key from user_settings');
    const { data: userSettings, error: settingsError } = await adminSupabase
      .from('user_settings')
      .select('openai_api_key')
      .eq('user_id', userId)
      .single();
    
    if (settingsError) {
      console.error('Error fetching user settings:', settingsError.message);
      throw new Error('Failed to retrieve OpenAI API key from user settings');
    }
    
    if (!userSettings?.openai_api_key) {
      throw new Error('No OpenAI API key found in user settings. Please add your API key in settings.');
    }
    
    apiKey = userSettings.openai_api_key;
    console.log('Found API key in user_settings table');
    
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
    const { data: signedUrl } = await adminSupabase
      .storage
      .from(recording.file_path.split('/')[0])
      .createSignedUrl(recording.file_path.split('/').slice(1).join('/'), 600);
      
    if (!signedUrl || !signedUrl.signedUrl) {
      throw new Error('Could not generate download URL for recording');
    }
    
    const recordingUrl = signedUrl.signedUrl;
    
    // Create a unique temp directory for this transcription job
    const timestamp = Date.now();
    tempDir = path.join(os.tmpdir(), `transcript_${meetingId}_${timestamp}`);
    await fsp.mkdir(tempDir, { recursive: true });
    console.log(`Created temp directory: ${tempDir}`);
    
    // Download the audio file
    const audioFilePath = path.join(tempDir, 'audio.mp3');
    console.log(`Downloading audio file to: ${audioFilePath}`);
    
    await downloadFile(recordingUrl, audioFilePath);
    
    // Verify the audio file was downloaded successfully
    if (!await fileExists(audioFilePath)) {
      throw new Error(`Failed to download audio file to ${audioFilePath}`);
    }
    
    const stats = await fsp.stat(audioFilePath);
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
      
      // Update transcript status for this batch
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
              await fsp.unlink(segmentFile);
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
    
    // Combine all transcriptions
    const combinedTranscription = combineOverlappingTranscriptions(segmentTranscriptions, OVERLAP_SECONDS);
    console.log('Combined transcription completed.');
    
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
      console.log('Transcript update completed successfully');
      
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
        await fsp.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Warning: Could not clean up temp directory: ${cleanupError}`);
      }
    }
  }
}

// Helper function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
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
    if (response.body) {
      const stream = response.body as any;
      stream.pipe(fileStream);
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    } else {
      reject(new Error('Response body is null'));
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
    await fsp.mkdir(outputDir, { recursive: true });
    
    // Get audio duration and format
    const fileInfo = await getAudioFileInfo(inputFile);
    console.log(`Audio file duration: ${fileInfo.duration} seconds, format: ${fileInfo.format}`);
    
    // Determine optimal segment duration based on file size
    const stats = await fsp.stat(inputFile);
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
      await fsp.copyFile(inputFile, outputFile);
      return [outputFile];
    }
    
    // Calculate number of segments needed
    const segmentCount = Math.ceil(fileInfo.duration / adjustedSegmentDuration);
    console.log(`Splitting into ${segmentCount} segments of ${adjustedSegmentDuration} seconds each`);
    
    const segmentFiles: string[] = [];
    
    // In AWS Lambda, we'll need to use a Lambda Layer or include ffmpeg in the package
    // For simplicity, using AWS Lambda Layers with ffmpeg preinstalled is recommended
    // This is a simplified placeholder for the actual ffmpeg splitting logic
    
    // Mock implementation - this should be replaced with actual ffmpeg calls
    for (let i = 0; i < segmentCount; i++) {
      const startTime = i === 0 ? 0 : i * adjustedSegmentDuration - OVERLAP_SECONDS;
      const safeStartTime = Math.max(0, startTime);
      
      const remainingDuration = fileInfo.duration - safeStartTime;
      const segmentDurationWithOverlap = i < segmentCount - 1 
        ? adjustedSegmentDuration + OVERLAP_SECONDS 
        : remainingDuration;
      
      const segmentFile = path.join(outputDir, `segment_${i.toString().padStart(3, '0')}.mp3`);
      segmentFiles.push(segmentFile);
      
      // This is where you would call ffmpeg in a real implementation
      // For MVP purposes, we'll just copy the original file as a placeholder
      await fsp.copyFile(inputFile, segmentFile);
    }
    
    return segmentFiles;
  } catch (error) {
    console.error('Error splitting audio file:', error);
    throw error;
  }
}

// Get audio file information (duration, format)
async function getAudioFileInfo(filePath: string): Promise<{duration: number, format: string}> {
  // In a real implementation, this would use ffprobe to get file info
  // For MVP purposes, returning mock info
  const stats = await fsp.stat(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  // Estimate duration based on file size (very rough estimate)
  // Assumes 1MB ~= 1 minute of audio at moderate quality
  const estimatedDuration = fileSizeMB * 60;
  
  return {
    duration: estimatedDuration,
    format: 'mp3'
  };
}

// Transcribe a single audio chunk
async function transcribeAudioChunk(filePath: string, apiKey: string): Promise<string> {
  try {
    console.log(`Transcribing audio chunk: ${filePath}`);
    
    // Create OpenAI API instance
    const openai = new OpenAI({
      apiKey: apiKey
    });
    
    // Read the audio file
    const fileBuffer = await fsp.readFile(filePath);
    
    // Convert to a format that OpenAI API can handle
    const file = new Blob([fileBuffer]);
    
    // Call OpenAI Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file as any,
      model: "whisper-1",
      language: "en",
      response_format: "text"
    });
    
    return transcription;
  } catch (error) {
    console.error(`Error transcribing audio chunk: ${error}`);
    throw error;
  }
}

// Combine transcriptions with handling for overlapping content
function combineOverlappingTranscriptions(transcriptions: string[], overlapSeconds: number): string {
  if (transcriptions.length === 0) return '';
  if (transcriptions.length === 1) return transcriptions[0];
  
  // For MVP purposes, simply concatenate the transcriptions
  // In a production system, you would implement smart overlap detection
  return transcriptions.join('\n\n');
} 