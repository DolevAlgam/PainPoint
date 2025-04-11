import { NextRequest, NextResponse } from 'next/server';
import { analyzePainPoints } from '@/lib/openai';
import { createClient } from '@supabase/supabase-js';
import { getOpenAIApiKey } from '@/lib/supabase';

// Create a Supabase client with the service role key for admin access
// This bypasses RLS policies
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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

    // Return immediately to acknowledge receipt of the request
    const response = NextResponse.json({
      success: true,
      message: 'Analysis started',
      status: 'in_progress'
    });

    // Process in the background
    const apiKey = userSettings.openai_api_key;
    processAnalysisInBackground(transcript.content, meetingId, userId, apiKey);

    return response;
  } catch (error: any) {
    console.error('Transcript analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred processing the request' },
      { status: 500 }
    );
  }
}

// This function runs in the background after the API has responded
async function processAnalysisInBackground(
  transcriptContent: string,
  meetingId: string,
  userId: string,
  apiKey: string
): Promise<void> {
  try {
    // Analyze the transcript using OpenAI
    const painPointsData = await analyzePainPoints(transcriptContent, apiKey);

    // First, delete all existing pain points for this meeting
    const { error: deleteError } = await adminSupabase
      .from('pain_points')
      .delete()
      .eq('meeting_id', meetingId);

    if (deleteError) {
      console.error('Error deleting existing pain points:', deleteError);
      throw new Error(`Failed to delete existing pain points: ${deleteError.message}`);
    }

    // Create pain points in the database
    const painPoints = painPointsData.map((pp: any) => ({
      meeting_id: meetingId,
      title: pp.title,
      description: pp.description,
      root_cause: pp.rootCause,
      impact: pp.impact,
      user_id: userId,
      citations: pp.citations || null
    }));

    const { error: createError } = await adminSupabase
      .from('pain_points')
      .insert(painPoints);

    if (createError) {
      console.error('Error creating pain points:', createError);
      await adminSupabase
        .from('meetings')
        .update({ 
          analysis_status: 'failed',
          analysis_error: createError.message
        })
        .eq('id', meetingId);
      return;
    }
    
    // Update the meeting status
    await adminSupabase
      .from('meetings')
      .update({ 
        has_analysis: true,
        status: 'analyzed',
        analysis_status: 'completed',
        analysis_outdated: false
      })
      .eq('id', meetingId);
  } catch (error: any) {
    console.error('Background analysis error:', error);
    // Update the meeting to show analysis failed
    await adminSupabase
      .from('meetings')
      .update({ 
        analysis_status: 'failed',
        analysis_error: error.message
      })
      .eq('id', meetingId);
  }
} 