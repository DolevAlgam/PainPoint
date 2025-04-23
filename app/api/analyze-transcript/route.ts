import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';

// Create a Supabase client with the service role key for admin access
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Configure AWS SDK
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: new AWS.Credentials({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }),
});

const ANALYZE_TRANSCRIPT_QUEUE_URL = process.env.ANALYZE_TRANSCRIPT_QUEUE_URL || '';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { transcriptId, meetingId, userId } = data;

    console.log('Transcript analysis request received:', { transcriptId, meetingId, userId });

    if (!transcriptId || !meetingId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get the transcript content
    const { data: transcript, error: transcriptError } = await adminSupabase
      .from('transcripts')
      .select('*')
      .eq('id', transcriptId)
      .single();

    if (transcriptError || !transcript) {
      console.error('Error fetching transcript:', transcriptError);
      return NextResponse.json(
        { error: `Transcript not found: ${transcriptError?.message || 'Unknown error'}` },
        { status: 404 }
      );
    }

    // Get the user's OpenAI API key from user_settings table
    const { data: userSettings, error: settingsError } = await adminSupabase
      .from('user_settings')
      .select('openai_api_key')
      .eq('user_id', userId)
      .single();
    
    if (settingsError) {
      console.error('Error fetching user settings:', settingsError.message);
      return NextResponse.json(
        { error: 'Failed to retrieve OpenAI API key from user settings' },
        { status: 500 }
      );
    }
    
    if (!userSettings?.openai_api_key) {
      return NextResponse.json(
        { error: 'No OpenAI API key found in user settings. Please add your API key in settings.' },
        { status: 400 }
      );
    }

    // Update the meeting to show analysis has started
    await adminSupabase
      .from('meetings')
      .update({
        analysis_status: 'in_progress'
      })
      .eq('id', meetingId);

    // Send message to SQS queue
    console.log('Sending message to SQS queue for background processing');
    
    // Check if queue URL is configured
    if (!ANALYZE_TRANSCRIPT_QUEUE_URL) {
      console.error('ANALYZE_TRANSCRIPT_QUEUE_URL environment variable is not set');
      
      // Return success but log the error
      return NextResponse.json({
        success: true,
        message: 'Analysis started (without SQS)',
        status: 'in_progress'
      });
    }
    
    const sqsParams = {
      QueueUrl: ANALYZE_TRANSCRIPT_QUEUE_URL,
      MessageBody: JSON.stringify({
        transcriptId,
        meetingId,
        userId
      })
    };
    
    try {
      const sqsResponse = await sqs.sendMessage(sqsParams).promise();
      console.log('Successfully sent message to SQS queue:', sqsResponse.MessageId);
    } catch (sqsError: any) {
      console.error('Error sending message to SQS queue:', sqsError);
      // Continue even if SQS fails - the analysis_status is already set
    }

    // Return immediately to acknowledge receipt of the request
    return NextResponse.json({
      success: true,
      message: 'Analysis started',
      status: 'in_progress'
    });
  } catch (error: any) {
    console.error('Transcript analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred processing the request' },
      { status: 500 }
    );
  }
} 