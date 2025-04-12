import { SQSEvent, SQSHandler } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Create a Supabase client with the service role key for admin access
const adminSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      console.log('Processing SQS message:', record.body);
      const message = JSON.parse(record.body);
      const { transcriptId, meetingId, userId } = message;
      
      if (!transcriptId || !meetingId || !userId) {
        console.error('Missing required parameters in SQS message');
        continue;
      }
      
      await processAnalysisInBackground(transcriptId, meetingId, userId);
    } catch (error) {
      console.error('Error processing SQS message:', error);
    }
  }
};

// This is adapted from the existing processAnalysisInBackground function
async function processAnalysisInBackground(
  transcriptId: string,
  meetingId: string,
  userId: string
): Promise<void> {
  try {
    // Get the transcript content
    const { data: transcript, error: transcriptError } = await adminSupabase
      .from('transcripts')
      .select('content')
      .eq('id', transcriptId)
      .single();

    if (transcriptError || !transcript) {
      console.error('Error fetching transcript:', transcriptError);
      throw new Error(`Transcript not found: ${transcriptError?.message || 'Unknown error'}`);
    }
    
    // Get the user's OpenAI API key from user_settings table
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
    
    const apiKey = userSettings.openai_api_key;

    // Update the meeting to show analysis has started
    await adminSupabase
      .from('meetings')
      .update({
        analysis_status: 'in_progress'
      })
      .eq('id', meetingId);
      
    // Analyze the transcript using OpenAI
    const painPointsData = await analyzePainPoints(transcript.content, apiKey);

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
      
    console.log(`Analysis completed successfully for meeting: ${meetingId}`);
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

// Analyze pain points from transcript
async function analyzePainPoints(transcriptContent: string, apiKey: string): Promise<any[]> {
  console.log('Analyzing transcript to extract pain points');
  
  // Create OpenAI API instance
  const openai = new OpenAI({
    apiKey: apiKey
  });
  
  // Prepare the prompt
  const systemMessage = `
    You are an expert at analyzing sales call transcripts to identify customer pain points.
    Extract the key pain points discussed in the conversation.
    For each pain point, provide:
    1. A concise title (1-5 words)
    2. A brief description (1-2 sentences)
    3. The likely root cause
    4. Impact level (High, Medium, or Low)
    5. Specific transcript citations that mention this pain point (exact quotes)
  `;
  
  // Call OpenAI API
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: `Here is the transcript:\n\n${transcriptContent}` }
    ],
    temperature: 0.5,
    response_format: { type: "json_object" }
  });
  
  // Parse the response
  const content = response.choices[0]?.message?.content || "{}";
  try {
    const result = JSON.parse(content);
    return result.painPoints || [];
  } catch (error) {
    console.error('Error parsing OpenAI response:', error);
    return [];
  }
} 