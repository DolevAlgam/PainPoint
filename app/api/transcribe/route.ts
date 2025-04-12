import { NextRequest, NextResponse } from 'next/server';
import { getRecordingURL } from '@/lib/services/recordings';
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Create a Supabase client with the service role key for admin access
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Configure AWS SDK
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-west-2',
  credentials: new AWS.Credentials({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }),
});

const TRANSCRIBE_QUEUE_URL = process.env.TRANSCRIBE_QUEUE_URL || '';

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

    // Get the recording info
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
        clearTimeout(timeoutId);
        return NextResponse.json(
          { error: `Recording with ID ${recordingId} not found` },
          { status: 404 }
        );
      }
      
      // We found at least one matching recording, use the first one
      const recording = recordingCheck[0];
      console.log(`Using recording: ${recording.file_name} (${recording.id})`);
      
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

      // Update meeting with outdated flags immediately
      try {
        await adminSupabase
          .from('meetings')
          .update({
            transcript_outdated: false,
            analysis_outdated: true // Mark analysis as outdated if a new transcript is generated
          })
          .eq('id', meetingId);
      } catch (updateError: any) {
        console.error('Error updating meeting:', updateError);
        // Continue even if this fails
      }
      
      // Send message to SQS queue
      console.log('Sending message to SQS queue for background processing');
      
      // Check if queue URL is configured
      if (!TRANSCRIBE_QUEUE_URL) {
        console.error('TRANSCRIBE_QUEUE_URL environment variable is not set');
        
        // Fall back to returning success but log the error
        clearTimeout(timeoutId);
        return NextResponse.json({
          success: true,
          message: 'Transcription started (without SQS)',
          transcriptId
        });
      }
      
      const sqsParams = {
        QueueUrl: TRANSCRIBE_QUEUE_URL,
        MessageBody: JSON.stringify({
          userId,
          meetingId,
          recordingId: recording.id
        }),
        MessageDeduplicationId: `transcript-${meetingId}-${recording.id}-${Date.now()}`,
        MessageGroupId: `transcript-${meetingId}`
      };
      
      try {
        const sqsResponse = await sqs.sendMessage(sqsParams).promise();
        console.log('Successfully sent message to SQS queue:', sqsResponse.MessageId);
      } catch (sqsError: any) {
        console.error('Error sending message to SQS queue:', sqsError);
        // Continue even if SQS fails - the transcript record is already created
      }
      
      // Return with transcript ID
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