import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { transcribeAudio } from '../openai';
import { getOpenAIApiKey } from '../supabase';
import { getRecordingURL } from './recordings';

export type Transcript = Database['public']['Tables']['transcripts']['Row'];
export type NewTranscript = Database['public']['Tables']['transcripts']['Insert'];

export async function getTranscripts(meetingId: string) {
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`Error fetching transcripts for meeting ${meetingId}:`, error);
    return [];
  }
}

export async function getTranscript(id: string) {
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching transcript with id ${id}:`, error);
    return null;
  }
}

export async function createTranscript(transcript: NewTranscript) {
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .insert(transcript)
      .select()
      .single();

    if (error) throw error;
    
    // Update the meeting to indicate it has a transcript
    await supabase
      .from('meetings')
      .update({ 
        has_transcript: true 
      })
      .eq('id', transcript.meeting_id);
      
    return data;
  } catch (error) {
    console.error('Error creating transcript:', error);
    return null;
  }
}

export async function updateTranscript(id: string, updates: Partial<Transcript>) {
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating transcript with id ${id}:`, error);
    return null;
  }
}

export async function deleteTranscript(id: string, meetingId: string) {
  try {
    const { error } = await supabase
      .from('transcripts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Check if this was the only transcript for the meeting
    const { data: remainingTranscripts, error: checkError } = await supabase
      .from('transcripts')
      .select('id')
      .eq('meeting_id', meetingId);

    if (checkError) throw checkError;

    // If no transcripts left, update the meeting
    if (remainingTranscripts.length === 0) {
      await supabase
        .from('meetings')
        .update({ 
          has_transcript: false 
        })
        .eq('id', meetingId);
    }

    return true;
  } catch (error) {
    console.error(`Error deleting transcript with id ${id}:`, error);
    return false;
  }
}

export async function generateTranscript(recordingId: string, meetingId: string, userId: string) {
  try {
    // First verify the recording exists in the database
    const { data: recordingCheck, error: checkError } = await supabase
      .from('recordings')
      .select('id, file_name')
      .eq('id', recordingId);
      
    if (checkError) {
      console.error('Error checking recording existence:', checkError);
      throw new Error(`Database error when checking recording: ${checkError.message}`);
    }
    
    if (!recordingCheck || recordingCheck.length === 0) {
      throw new Error(`Recording with ID ${recordingId} not found in database`);
    }
    
    // Reset outdated flags first, regardless of whether the transcription succeeds
    await supabase
      .from('meetings')
      .update({
        transcript_outdated: false,
        analysis_outdated: true // Mark analysis as outdated if a new transcript is generated
      })
      .eq('id', meetingId);
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recordingId,
        meetingId,
        userId
      }),
    });
    
    const responseText = await response.text();
    
    let data;
    try {
      // Convert the response text back to JSON
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse response JSON:', e);
      throw new Error(`Invalid JSON response: ${responseText}`);
    }
    
    if (!response.ok) {
      console.error('Transcription request failed:', data);
      throw new Error(`Transcription request failed: ${data.error || response.statusText}`);
    }
    
    // Return the initial transcript record
    const { data: transcript, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('id', data.transcriptId)
      .single();
      
    if (error) {
      console.error('Error fetching transcript:', error);
      throw error;
    }
    
    return transcript;
  } catch (error) {
    console.error(`Error generating transcript for recording ${recordingId}:`, error);
    // Rethrow the error so it can be handled by the caller
    throw error;
  }
} 