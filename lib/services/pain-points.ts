import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { analyzePainPoints } from '../openai';
import { getOpenAIApiKey } from '../supabase';

export type PainPoint = Database['public']['Tables']['pain_points']['Row'];
export type NewPainPoint = Database['public']['Tables']['pain_points']['Insert'];

export async function getPainPoints(meetingId: string) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`Error fetching pain points for meeting ${meetingId}:`, error);
    return [];
  }
}

export async function getPainPoint(id: string) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching pain point with id ${id}:`, error);
    return null;
  }
}

export async function createPainPoint(painPoint: NewPainPoint) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .insert(painPoint)
      .select()
      .single();

    if (error) throw error;
    
    // Update the meeting to indicate it has analysis
    await supabase
      .from('meetings')
      .update({ 
        has_analysis: true,
        status: 'analyzed'
      })
      .eq('id', painPoint.meeting_id);
      
    return data;
  } catch (error) {
    console.error('Error creating pain point:', error);
    return null;
  }
}

export async function updatePainPoint(id: string, updates: Partial<PainPoint>) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating pain point with id ${id}:`, error);
    return null;
  }
}

export async function deletePainPoint(id: string, meetingId: string) {
  try {
    const { error } = await supabase
      .from('pain_points')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Check if this was the only pain point for the meeting
    const { data: remainingPainPoints, error: checkError } = await supabase
      .from('pain_points')
      .select('id')
      .eq('meeting_id', meetingId);

    if (checkError) throw checkError;

    // If no pain points left, update the meeting
    if (remainingPainPoints.length === 0) {
      await supabase
        .from('meetings')
        .update({ 
          has_analysis: false 
        })
        .eq('id', meetingId);
    }

    return true;
  } catch (error) {
    console.error(`Error deleting pain point with id ${id}:`, error);
    return false;
  }
}

export async function generatePainPointsFromTranscript(transcript: string, meetingId: string, userId: string) {
  try {
    // Get the user's OpenAI API key
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) throw new Error('OpenAI API key not found');

    // Analyze the transcript using OpenAI
    const painPointsData = await analyzePainPoints(transcript, apiKey);

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

    const { data, error } = await supabase
      .from('pain_points')
      .insert(painPoints)
      .select();

    if (error) throw error;
    
    // Update the meeting
    await supabase
      .from('meetings')
      .update({ 
        has_analysis: true,
        status: 'analyzed'
      })
      .eq('id', meetingId);
      
    return data;
  } catch (error) {
    console.error(`Error generating pain points for meeting ${meetingId}:`, error);
    return null;
  }
}

export async function getAllPainPoints() {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select(`
        *,
        meetings (
          id,
          date,
          contacts (
            id,
            name,
            role
          ),
          companies (
            id,
            name,
            industry
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching all pain points:', error);
    return [];
  }
}

export async function getMostCommonPainPoints(limit = 10) {
  try {
    // This is a simplified approach. In a real app with a lot of data,
    // you might want to use a more efficient SQL query.
    const { data, error } = await supabase
      .from('pain_points')
      .select(`
        *,
        meetings (
          companies (
            id,
            name,
            industry
          )
        )
      `);

    if (error) throw error;

    // Group by title and count occurrences
    const painPointCounts = (data || []).reduce((acc: any, pp: any) => {
      const title = pp.title.toLowerCase();
      if (!acc[title]) {
        acc[title] = {
          title: pp.title,
          count: 0,
          impact: { High: 0, Medium: 0, Low: 0 },
          industries: new Set(),
          example: pp
        };
      }
      acc[title].count += 1;
      acc[title].impact[pp.impact] += 1;
      acc[title].industries.add(pp.meetings.companies.industry);
      return acc;
    }, {});

    // Convert to array and sort by count
    const result = Object.values(painPointCounts)
      .map((item: any) => ({
        ...item,
        industries: Array.from(item.industries)
      }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, limit);

    return result;
  } catch (error) {
    console.error('Error fetching most common pain points:', error);
    return [];
  }
} 