"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const openai_1 = __importDefault(require("openai"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs_1 = require("fs");
const formdata_node_1 = require("formdata-node");
// Initialize Supabase client
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
// Maximum file size for OpenAI API (25MB)
const MAX_CHUNK_SIZE_MB = 25;
// We'll use 5-minute segments to ensure we stay under the size limit
const CHUNK_DURATION_SECONDS = 300;
// Overlap between chunks to avoid cutting off sentences (10 seconds)
const OVERLAP_SECONDS = 10;
// Get the path to the ffmpeg binaries
const FFMPEG_PATH = path.join(__dirname, 'bin', 'ffmpeg');
const FFPROBE_PATH = path.join(__dirname, 'bin', 'ffprobe');
const handler = async (event, context) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        let recordingId;
        let tempDir;
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
            await fs_1.promises.mkdir(tempDir, { recursive: true });
            console.log(`Created temp directory: ${tempDir}`);
            // Download the audio file
            const audioFilePath = path.join(tempDir, 'audio.m4a');
            console.log(`Downloading audio file to: ${audioFilePath}`);
            const response = await (0, node_fetch_1.default)(signedUrlData.signedUrl);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }
            const fileBuffer = await response.buffer();
            await fs_1.promises.writeFile(audioFilePath, fileBuffer);
            // Verify the audio file was downloaded successfully
            if (!await fileExists(audioFilePath)) {
                throw new Error(`Failed to download audio file to ${audioFilePath}`);
            }
            const stats = await fs_1.promises.stat(audioFilePath);
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
            const openai = new openai_1.default({
                apiKey: userSettings.openai_api_key
            });
            // Split the audio file into segments
            const segmentsDir = path.join(tempDir, 'segments');
            console.log(`Splitting audio file into segments in: ${segmentsDir}`);
            const segmentFiles = await splitAudioFile(audioFilePath, segmentsDir);
            console.log(`Split audio into ${segmentFiles.length} segments`);
            // Process each segment to transcribe
            const segmentTranscriptions = [];
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
                            const fileBuffer = await fs_1.promises.readFile(segmentFile);
                            const file = new formdata_node_1.File([fileBuffer], path.basename(segmentFile), { type: 'audio/m4a' });
                            // Call OpenAI Whisper API
                            const transcription = await openai.audio.transcriptions.create({
                                file: file,
                                model: "whisper-1",
                                language: "en",
                                response_format: "text"
                            });
                            // Store the result in its original order position
                            processedResults[segmentIndex] = transcription;
                            console.log(`Completed transcription of segment ${segmentNum}/${allSegments.length}`);
                            // Clean up the segment file to free disk space
                            try {
                                await fs_1.promises.unlink(segmentFile);
                            }
                            catch (unlinkError) {
                                console.error(`Warning: Could not delete segment file ${segmentFile}: ${unlinkError}`);
                            }
                            return { success: true, index: segmentIndex };
                        }
                        catch (segmentError) {
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
                const { error: progressUpdateError } = await supabase
                    .from('transcripts')
                    .update({
                    content: `Transcription progress: ${progressPercentage}% (${completedCount}/${allSegments.length} segments complete)`
                })
                    .eq('recording_id', recordingId);
                if (progressUpdateError) {
                    console.error('Error updating progress in transcript:', progressUpdateError);
                }
                else {
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
            }
            else {
                console.log('Successfully updated meeting has_transcript status to true');
            }
            console.log(`Transcription completed successfully for meeting: ${meetingId}, recording: ${recordingId}`);
        }
        catch (error) {
            console.error(`Transcription failed: ${error.message}`);
            // Update transcript with error message
            try {
                if (recordingId) {
                    await supabase
                        .from('transcripts')
                        .update({ content: `Transcription failed: ${error.message}` })
                        .eq('recording_id', recordingId);
                }
            }
            catch (updateError) {
                console.error('Error updating transcript content:', updateError);
            }
            // Clean up temp directory if it exists
            if (tempDir) {
                try {
                    console.log(`Cleaning up temp directory: ${tempDir}`);
                    await fs_1.promises.rm(tempDir, { recursive: true, force: true });
                }
                catch (cleanupError) {
                    console.error('Error cleaning up temp directory:', cleanupError);
                }
            }
        }
    }
};
exports.handler = handler;
// Helper function to check if a file exists
async function fileExists(filePath) {
    try {
        await fs_1.promises.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
// Split audio file into manageable segments for transcription
async function splitAudioFile(inputFile, outputDir, segmentDuration = 300 // 5 minutes per segment by default
) {
    try {
        console.log(`Splitting audio file: ${inputFile} into ${segmentDuration}-second segments`);
        // Create output directory if it doesn't exist
        await fs_1.promises.mkdir(outputDir, { recursive: true });
        // Get audio duration and format
        const fileInfo = await getAudioFileInfo(inputFile);
        console.log(`Audio file duration: ${fileInfo.duration} seconds, format: ${fileInfo.format}`);
        // Determine optimal segment duration based on file size
        const stats = await fs_1.promises.stat(inputFile);
        const fileSizeMB = stats.size / (1024 * 1024);
        // Adjust segment duration based on file size to prevent memory issues
        // Smaller segments for larger files
        let adjustedSegmentDuration = segmentDuration;
        if (fileSizeMB > 50) {
            adjustedSegmentDuration = 60; // 1 minute for very large files
            console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
        }
        else if (fileSizeMB > 30) {
            adjustedSegmentDuration = 120; // 2 minutes for large files
            console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), reducing segment duration to ${adjustedSegmentDuration} seconds`);
        }
        // For very short files, don't split
        if (fileInfo.duration <= adjustedSegmentDuration) {
            console.log('Audio file is short enough, no need to split');
            const outputFile = path.join(outputDir, 'segment_000.m4a');
            await fs_1.promises.copyFile(inputFile, outputFile);
            return [outputFile];
        }
        // Calculate number of segments needed
        const segmentCount = Math.ceil(fileInfo.duration / adjustedSegmentDuration);
        console.log(`Splitting into ${segmentCount} segments of ${adjustedSegmentDuration} seconds each`);
        const segmentFiles = [];
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
                exec(ffmpegCommand.join(' '), (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error splitting segment ${i}:`, error);
                        reject(error);
                    }
                    else {
                        resolve(true);
                    }
                });
            });
            // Verify the segment size
            const segmentStats = await fs_1.promises.stat(segmentFile);
            const segmentSizeMB = segmentStats.size / (1024 * 1024);
            console.log(`Segment ${i} size: ${segmentSizeMB.toFixed(2)}MB`);
            if (segmentStats.size > 25 * 1024 * 1024) { // 25MB limit
                console.warn(`Segment ${i} is too large (${segmentSizeMB.toFixed(2)}MB), reducing duration`);
                // If segment is too large, reduce duration and try again
                adjustedSegmentDuration = Math.floor(adjustedSegmentDuration * 0.8); // Reduce by 20%
                return splitAudioFile(inputFile, outputDir, adjustedSegmentDuration);
            }
        }
        return segmentFiles;
    }
    catch (error) {
        console.error('Error splitting audio file:', error);
        throw error;
    }
}
// Get audio file information using ffprobe
async function getAudioFileInfo(filePath) {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
        exec(`"${FFPROBE_PATH}" -v error -show_entries format=duration,format_name -of json "${filePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error('Error getting file info:', error);
                reject(error);
            }
            else {
                try {
                    const info = JSON.parse(stdout);
                    resolve({
                        duration: parseFloat(info.format.duration),
                        format: info.format.format_name
                    });
                }
                catch (e) {
                    reject(e);
                }
            }
        });
    });
}
// Combine transcriptions with handling for overlapping content
function combineOverlappingTranscriptions(transcriptions, overlapSeconds) {
    if (transcriptions.length === 0)
        return '';
    if (transcriptions.length === 1)
        return transcriptions[0];
    // For MVP purposes, simply concatenate the transcriptions
    // In a production system, you would implement smart overlap detection
    return transcriptions.join('\n\n');
}
