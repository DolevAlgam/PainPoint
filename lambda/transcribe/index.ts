import { SQSEvent, Context } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsp } from 'fs';
import { File } from 'formdata-node';

// Maximum retries for API calls
const MAX_RETRIES = 3;
// Retry delay in milliseconds (exponential backoff)
const RETRY_DELAY_MS = 1000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Maximum file size for OpenAI API (25MB)
const MAX_CHUNK_SIZE_MB = 25;
// We'll use 5-minute segments to ensure we stay under the size limit
const CHUNK_DURATION_SECONDS = 300;
// Overlap between chunks to avoid cutting off sentences (10 seconds)
const OVERLAP_SECONDS = 10;
// Maximum recursion depth for segment splitting
const MAX_RECURSION_DEPTH = 5;
// Minimum segment duration (30 seconds)
const MIN_SEGMENT_DURATION = 30;

// Get the path to the ffmpeg binaries
const FFMPEG_PATH = path.join(__dirname, 'bin', 'ffmpeg');
const FFPROBE_PATH = path.join(__dirname, 'bin', 'ffprobe');

// Helper function to add retry logic to API calls
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = RETRY_DELAY_MS): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0 || !isRetryableError(error)) {
      throw error;
    }
    
    console.log(`API call failed, retrying in ${delay}ms (${retries} retries left)...`, error.message);
    
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry with exponential backoff
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// Helper function to determine if an error is retryable
function isRetryableError(error: any): boolean {
  // Connection errors, timeouts, and server errors are retryable
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  
  // Check for network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
      error.message.includes('Connection error') || error.type === 'system') {
    return true;
  }
  
  // Check for specific HTTP status codes
  if (error.status && retryableStatuses.includes(error.status)) {
    return true;
  }
  
  return false;
}

export const handler = async (event: SQSEvent, context: Context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    let recordingId: string | undefined;
    let tempDir: string | undefined;
    
    try {
      const { userId, meetingId, recordingId: rid } = JSON.parse(record.body);
      recordingId = rid; // Store in outer scope
      console.log('Processing recording:', { userId, meetingId, recordingId });

      // Get recording info from Supabase
      const { data: recording, error: recordingError } = await supabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .single();

      if (recordingError) {
        console.error('Error fetching recording:', recordingError);
        throw recordingError;
      }

      // Get signed URL for the recording
      const bucketName = 'recordings';
      const filePath = recording.file_path;
      console.log('Attempting to get signed URL with:', {
        bucketName,
        filePath,
        fullPath: recording.file_path
      });

      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from(bucketName)
        .createSignedUrl(filePath, 600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Error getting signed URL:', {
          error: signedUrlError,
          bucketName,
          filePath,
          fullPath: recording.file_path
        });
        throw new Error('Failed to get signed URL for recording');
      }

      // Create a unique temp directory for this transcription job
      const timestamp = Date.now();
      tempDir = path.join(os.tmpdir(), `transcript_${meetingId}_${timestamp}`);
      await fsp.mkdir(tempDir, { recursive: true });
      console.log(`Created temp directory: ${tempDir}`);

      // Download the audio file
      const audioFilePath = path.join(tempDir, 'audio.m4a');
      console.log(`Downloading audio file to: ${audioFilePath}`);
      
      const response = await fetch(signedUrlData.signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      
      const fileBuffer = await response.buffer();
      await fsp.writeFile(audioFilePath, fileBuffer);
      
      // Verify the audio file was downloaded successfully
      if (!await fileExists(audioFilePath)) {
        throw new Error(`Failed to download audio file to ${audioFilePath}`);
      }
      
      const stats = await fsp.stat(audioFilePath);
      console.log(`Downloaded audio file (${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);

      // Get user's OpenAI API key
      const { data: userSettings, error: settingsError } = await supabase
        .from('user_settings')
        .select('openai_api_key')
        .eq('user_id', userId)
        .single();

      if (settingsError || !userSettings?.openai_api_key) {
        throw new Error('Failed to retrieve OpenAI API key from user settings');
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: userSettings.openai_api_key
      });

      // Split the audio file into segments
      const segmentsDir = path.join(tempDir, 'segments');
      console.log(`Splitting audio file into segments in: ${segmentsDir}`);
      
      const segmentFiles = await splitAudioFile(audioFilePath, segmentsDir);
      console.log(`Split audio into ${segmentFiles.length} segments`);

      // Process each segment to transcribe
      const segmentTranscriptions: string[] = [];
      
      // Define a concurrency limit to avoid overwhelming the API and memory
      const MAX_CONCURRENT_REQUESTS = 10;

      // Create arrays to track segment processing
      const allSegments = [...segmentFiles];
      const processedResults = new Array(segmentFiles.length).fill(null);
      let completedCount = 0;

      // Process segments in batches with limited concurrency
      while (completedCount < allSegments.length) {
        // Calculate how many new tasks we can start
        const pendingCount = allSegments.length - completedCount;
        const batchSize = Math.min(MAX_CONCURRENT_REQUESTS, pendingCount);
        
        console.log(`Processing batch of ${batchSize} segments (${completedCount + 1} to ${completedCount + batchSize} of ${allSegments.length})`);
        
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
              // Read the segment file
              const fileBuffer = await fsp.readFile(segmentFile);
              const file = new File([fileBuffer], path.basename(segmentFile), { type: 'audio/m4a' });
              
              // Call OpenAI GPT-4o-transcribe API with retry logic
              const transcription = await withRetry(async () => {
                return await openai.audio.transcriptions.create({
                  file: file,
                  model: "gpt-4o-transcribe",
                  language: "en",
                  response_format: "text"
                });
              });
              
              // Store the result in its original order position
              processedResults[segmentIndex] = transcription;
              console.log(`Completed transcription of segment ${segmentNum}/${allSegments.length}`);
              
              // Clean up the segment file to free disk space
              try {
                await fsp.unlink(segmentFile);
              } catch (unlinkError) {
                console.error(`Warning: Could not delete segment file ${segmentFile}: ${unlinkError}`);
              }
              
              return { success: true, index: segmentIndex };
            } catch (segmentError: any) {
              // Enhanced error logging
              console.error(`Error processing segment ${segmentIndex + 1}:`, {
                error: segmentError,
                message: segmentError.message,
                name: segmentError.name,
                code: segmentError.code,
                stack: segmentError.stack,
                response: segmentError.response?.data,
                status: segmentError.response?.status,
                headers: segmentError.response?.headers,
                segmentSize: (await fsp.stat(segmentFile)).size,
                segmentPath: segmentFile
              });
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
        const { error: progressUpdateError } = await supabase
          .from('transcripts')
          .update({
            content: `Transcription progress: ${progressPercentage}% (${completedCount}/${allSegments.length} segments complete)`
          })
          .eq('recording_id', recordingId);

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
      const { error: updateError } = await supabase
        .from('transcripts')
        .update({
          content: combinedTranscription
        })
        .eq('recording_id', recordingId);

      if (updateError) {
        console.error('Error updating transcript:', updateError);
        throw updateError;
      }

      console.log('Transcript update completed successfully');
      
      // Update meeting record to indicate transcript is available
      console.log(`Updating meeting ${meetingId} to set has_transcript=true`);
      const { error: meetingUpdateError } = await supabase
        .from('meetings')
        .update({ has_transcript: true })
        .eq('id', meetingId);
        
      if (meetingUpdateError) {
        console.error(`Error updating meeting status: ${meetingUpdateError.message}`);
      } else {
        console.log('Successfully updated meeting has_transcript status to true');
      }

      console.log(`Transcription completed successfully for meeting: ${meetingId}, recording: ${recordingId}`);
    } catch (error: any) {
      console.error(`Transcription failed: ${error.message}`);
      
      // Update transcript with error message
      try {
        if (recordingId) {
          await supabase
            .from('transcripts')
            .update({ content: `Transcription failed: ${error.message}` })
            .eq('recording_id', recordingId);
        }
      } catch (updateError) {
        console.error('Error updating transcript content:', updateError);
      }

      // Clean up temp directory if it exists
      if (tempDir) {
        try {
          console.log(`Cleaning up temp directory: ${tempDir}`);
          await fsp.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Error cleaning up temp directory:', cleanupError);
        }
      }
    }
  }
};

// Helper function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Split audio file into manageable segments for transcription
async function splitAudioFile(
  inputFile: string, 
  outputDir: string, 
  segmentDuration: number = CHUNK_DURATION_SECONDS,
  recursionDepth: number = 0
): Promise<string[]> {
  try {
    if (recursionDepth >= MAX_RECURSION_DEPTH) {
      throw new Error(`Maximum recursion depth (${MAX_RECURSION_DEPTH}) reached while trying to split audio file`);
    }

    console.log(`Splitting audio file: ${inputFile} into ${segmentDuration}-second segments (recursion depth: ${recursionDepth})`);
    
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
    if (fileSizeMB > 100) {
      adjustedSegmentDuration = 30; // 30 seconds for very large files
      console.log(`Very large file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
    } else if (fileSizeMB > 50) {
      adjustedSegmentDuration = 60; // 1 minute for large files
      console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
    } else if (fileSizeMB > 30) {
      adjustedSegmentDuration = 120; // 2 minutes for medium files
      console.log(`Medium file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
    }
    
    // Ensure we don't go below minimum segment duration
    if (adjustedSegmentDuration < MIN_SEGMENT_DURATION) {
      console.warn(`Warning: Calculated segment duration (${adjustedSegmentDuration}s) is below minimum (${MIN_SEGMENT_DURATION}s). Using minimum duration.`);
      adjustedSegmentDuration = MIN_SEGMENT_DURATION;
    }
    
    // For very short files, don't split
    if (fileInfo.duration <= adjustedSegmentDuration) {
      console.log('Audio file is short enough, no need to split');
      const outputFile = path.join(outputDir, 'segment_000.m4a');
      await fsp.copyFile(inputFile, outputFile);
      return [outputFile];
    }
    
    // Calculate number of segments needed
    const segmentCount = Math.ceil(fileInfo.duration / adjustedSegmentDuration);
    console.log(`Splitting into ${segmentCount} segments of ${adjustedSegmentDuration} seconds each`);
    
    const segmentFiles: string[] = [];
    
    // Use ffmpeg to split the audio file
    for (let i = 0; i < segmentCount; i++) {
      const startTime = i === 0 ? 0 : i * adjustedSegmentDuration - OVERLAP_SECONDS;
      const safeStartTime = Math.max(0, startTime);
      
      const remainingDuration = fileInfo.duration - safeStartTime;
      const segmentDurationWithOverlap = i < segmentCount - 1 
        ? adjustedSegmentDuration + OVERLAP_SECONDS 
        : remainingDuration;
      
      const segmentFile = path.join(outputDir, `segment_${i.toString().padStart(3, '0')}.m4a`);
      segmentFiles.push(segmentFile);
      
      // Use ffmpeg to split the audio with proper encoding
      const ffmpegCommand = [
        `"${FFMPEG_PATH}"`,
        '-i', inputFile,
        '-ss', safeStartTime.toString(),
        '-t', segmentDurationWithOverlap.toString(),
        '-c:a', 'aac', // Use AAC codec for better compression
        '-b:a', '128k', // Set bitrate to 128kbps to control file size
        '-y', // Overwrite output file if it exists
        segmentFile
      ];
      
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(ffmpegCommand.join(' '), (error: any, stdout: any, stderr: any) => {
          if (error) {
            console.error(`Error splitting segment ${i}:`, error);
            reject(error);
          } else {
            resolve(true);
          }
        });
      });
      
      // Verify the segment size
      const segmentStats = await fsp.stat(segmentFile);
      const segmentSizeMB = segmentStats.size / (1024 * 1024);
      console.log(`Segment ${i} size: ${segmentSizeMB.toFixed(2)}MB`);
      
      if (segmentStats.size > MAX_CHUNK_SIZE_MB * 1024 * 1024) {
        console.warn(`Segment ${i} is too large (${segmentSizeMB.toFixed(2)}MB > ${MAX_CHUNK_SIZE_MB}MB), reducing duration`);
        
        // Calculate new duration based on the size ratio
        const sizeRatio = segmentSizeMB / MAX_CHUNK_SIZE_MB;
        const newDuration = Math.floor(adjustedSegmentDuration / sizeRatio);
        
        // Ensure we don't go below minimum duration
        const nextDuration = Math.max(MIN_SEGMENT_DURATION, newDuration);
        
        console.log(`Recalculating with new duration: ${nextDuration} seconds (was ${adjustedSegmentDuration}s)`);
        
        // Clean up the current segment before retrying
        try {
          await fsp.unlink(segmentFile);
        } catch (unlinkError) {
          console.error(`Warning: Could not delete segment file ${segmentFile}: ${unlinkError}`);
        }
        
        // Recursively try again with the new duration
        return splitAudioFile(inputFile, outputDir, nextDuration, recursionDepth + 1);
      }
    }
    
    return segmentFiles;
  } catch (error) {
    console.error('Error splitting audio file:', error);
    throw error;
  }
}

// Get audio file information using ffprobe
async function getAudioFileInfo(filePath: string): Promise<{duration: number, format: string}> {
  const { exec } = require('child_process');
  
  return new Promise((resolve, reject) => {
    exec(`"${FFPROBE_PATH}" -v error -show_entries format=duration,format_name -of json "${filePath}"`, 
      (error: any, stdout: any, stderr: any) => {
        if (error) {
          console.error('Error getting file info:', error);
          reject(error);
        } else {
          try {
            const info = JSON.parse(stdout);
            resolve({
              duration: parseFloat(info.format.duration),
              format: info.format.format_name
            });
          } catch (e) {
            reject(e);
          }
        }
      });
  });
}

// Combine transcriptions with handling for overlapping content
function combineOverlappingTranscriptions(transcriptions: string[], overlapSeconds: number): string {
  if (transcriptions.length === 0) return '';
  if (transcriptions.length === 1) return transcriptions[0];
  
  // For MVP purposes, simply concatenate the transcriptions
  // In a production system, you would implement smart overlap detection
  return transcriptions.join('\n\n');
} 