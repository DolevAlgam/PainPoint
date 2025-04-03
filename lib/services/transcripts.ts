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
    // Get the recording
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError) throw recordingError;
    if (!recording) throw new Error(`Recording with id ${recordingId} not found`);

    // Get the recording URL
    const recordingUrl = await getRecordingURL(recording.file_path);
    if (!recordingUrl) throw new Error(`Could not get URL for recording ${recordingId}`);

    // Get the user's OpenAI API key
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) throw new Error('OpenAI API key not found');

    // Download the file
    const response = await fetch(recordingUrl);
    if (!response.ok) throw new Error('Failed to download recording file');
    
    const blob = await response.blob();
    const file = new File([blob], recording.file_name, { type: blob.type });

    // Transcribe the file using OpenAI
    const transcriptionText = await transcribeAudio(file, apiKey);

    // Create the transcript
    const transcript: NewTranscript = {
      meeting_id: meetingId,
      recording_id: recordingId,
      content: transcriptionText,
      user_id: userId
    };

    const { data, error } = await supabase
      .from('transcripts')
      .insert(transcript)
      .select()
      .single();

    if (error) throw error;
    
    // Update the meeting
    await supabase
      .from('meetings')
      .update({ 
        has_transcript: true 
      })
      .eq('id', meetingId);
      
    return data;
  } catch (error) {
    console.error(`Error generating transcript for recording ${recordingId}:`, error);
    // Rethrow the error so it can be handled by the caller
    throw error;
  }
} 