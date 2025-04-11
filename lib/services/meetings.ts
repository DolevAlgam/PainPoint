import { supabase } from '../supabase';
import type { Database } from '../database.types';

export type Meeting = Database['public']['Tables']['meetings']['Row'];
export type NewMeeting = Database['public']['Tables']['meetings']['Insert'];

export async function getMeetings() {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name,
          email,
          role
        ),
        companies (
          id,
          name,
          industry
        )
      `)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return [];
  }
}

export async function getMeeting(id: string) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name,
          email,
          role
        ),
        companies (
          id,
          name,
          industry
        ),
        recordings (id, file_path, file_name),
        transcripts (id, content),
        pain_points (id, title, description, root_cause, impact)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching meeting with id ${id}:`, error);
    return null;
  }
}

export async function createMeeting(meeting: NewMeeting) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .insert(meeting)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating meeting:', error);
    return null;
  }
}

export async function updateMeeting(id: string, updates: Partial<Meeting>) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating meeting with id ${id}:`, error);
    return null;
  }
}

export async function deleteMeeting(id: string) {
  try {
    const { error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error deleting meeting with id ${id}:`, error);
    return false;
  }
}

export async function getUpcomingMeetings() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name,
          email,
          role
        ),
        companies (
          id,
          name,
          industry
        )
      `)
      .gte('date', today)
      .order('date')
      .order('time');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching upcoming meetings:', error);
    return [];
  }
}

export async function getRecentMeetings(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name,
          email,
          role
        ),
        companies (
          id,
          name,
          industry
        )
      `)
      .eq('status', 'completed')
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching recent meetings:', error);
    return [];
  }
}

export async function getAnalyzedMeetings() {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name,
          email,
          role
        ),
        companies (
          id,
          name,
          industry
        )
      `)
      .eq('status', 'analyzed')
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching analyzed meetings:', error);
    return [];
  }
}

export async function getMeetingsByContactId(contactId: string) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name,
          email,
          role
        ),
        companies (
          id,
          name,
          industry
        ),
        transcripts (id)
      `)
      .eq('contact_id', contactId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`Error fetching meetings for contact ${contactId}:`, error);
    return [];
  }
} 