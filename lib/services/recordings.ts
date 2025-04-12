import { supabase } from '../supabase';
import type { Database } from '../database.types';

export type Recording = Database['public']['Tables']['recordings']['Row'];
export type NewRecording = Database['public']['Tables']['recordings']['Insert'];

export async function getRecordings(meetingId: string) {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`Error fetching recordings for meeting ${meetingId}:`, error);
    return [];
  }
}

export async function getRecording(id: string) {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching recording with id ${id}:`, error);
    return null;
  }
}

export async function createRecording(recording: NewRecording) {
  try {
    // Check if there are any existing recordings for this meeting
    const { data: existingRecordings, error: checkError } = await supabase
      .from('recordings')
      .select('id, file_path')
      .eq('meeting_id', recording.meeting_id);
      
    if (checkError) throw checkError;
    
    // Check if we have existing transcripts/analysis that will need updating
    const { data: existingMeeting } = await supabase
      .from('meetings')
      .select('has_transcript, has_analysis')
      .eq('id', recording.meeting_id)
      .single();
      
    const hasExistingTranscript = existingMeeting?.has_transcript;
    const hasExistingAnalysis = existingMeeting?.has_analysis;
    
    // If there are existing recordings, delete them
    if (existingRecordings && existingRecordings.length > 0) {
      for (const existingRecording of existingRecordings) {
        // Delete file from storage if file_path exists
        if (existingRecording.file_path) {
          await supabase
            .storage
            .from('recordings')
            .remove([existingRecording.file_path]);
        }
        
        // Delete the recording record
        await supabase
          .from('recordings')
          .delete()
          .eq('id', existingRecording.id);
      }
    }
    
    // Now create the new recording
    const { data, error } = await supabase
      .from('recordings')
      .insert(recording)
      .select()
      .single();

    if (error) throw error;
    
    // Update the meeting to indicate it has a recording
    // If transcript/analysis existed, mark them as outdated but don't remove them
    await supabase
      .from('meetings')
      .update({ 
        has_recording: true,
        status: 'completed',
        transcript_outdated: hasExistingTranscript ? true : false,
        analysis_outdated: hasExistingAnalysis ? true : false
      })
      .eq('id', recording.meeting_id);
      
    return data;
  } catch (error) {
    console.error('Error creating recording:', error);
    return null;
  }
}

export async function updateRecording(id: string, updates: Partial<Recording>) {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating recording with id ${id}:`, error);
    return null;
  }
}

export async function deleteRecording(id: string, meetingId: string) {
  try {
    // Get the recording to delete its file from storage
    const { data: recording } = await supabase
      .from('recordings')
      .select('file_path')
      .eq('id', id)
      .single();

    if (recording?.file_path) {
      // Delete the file from storage
      const { error: storageError } = await supabase
        .storage
        .from('recordings')
        .remove([recording.file_path]);

      if (storageError) throw storageError;
    }

    // Delete the recording entry
    const { error } = await supabase
      .from('recordings')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Check if this was the only recording for the meeting
    const { data: remainingRecordings, error: checkError } = await supabase
      .from('recordings')
      .select('id')
      .eq('meeting_id', meetingId);

    if (checkError) throw checkError;

    // If no recordings left, update the meeting
    if (remainingRecordings.length === 0) {
      await supabase
        .from('meetings')
        .update({ 
          has_recording: false 
        })
        .eq('id', meetingId);
    }

    return true;
  } catch (error) {
    console.error(`Error deleting recording with id ${id}:`, error);
    return false;
  }
}

export async function uploadRecordingFile(file: File, path: string) {
  try {
    // Use resumable uploads for files larger than 6MB (Supabase recommendation)
    if (file.size > 6 * 1024 * 1024) {
      // We're using the resumable upload endpoint
      const { data, error } = await supabase
        .storage
        .from('recordings')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          duplex: 'half'  // Enable resumable upload with half-duplex mode
        });

      if (error) throw error;
      return data;
    } else {
      // Use standard upload for smaller files
      const { data, error } = await supabase
        .storage
        .from('recordings')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Error uploading recording file:', error);
    return null;
  }
}

export async function getRecordingURL(path: string, adminClient?: any) {
  try {
    // Use the provided admin client if available, otherwise use the regular client
    const client = adminClient || supabase;
    
    // Use signed URL instead of public URL
    const { data, error } = await client
      .storage
      .from('recordings')
      .createSignedUrl(path, 60 * 60); // Create a signed URL valid for 1 hour
    
    if (error) {
      // Keep error logging for debugging issues
      console.error(`Error getting recording URL for path ${path}:`, error);
      throw error;
    }

    // Remove debug logging in production
    // console.log("Generated recording signed URL:", data.signedUrl);
    return data.signedUrl;
  } catch (error) {
    // Keep error logging for debugging issues
    console.error(`Error getting recording URL for path ${path}:`, error);
    return null;
  }
}