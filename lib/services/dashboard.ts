import { supabase } from '../supabase';

// Dashboard metrics data
export async function getDashboardMetrics() {
  try {
    // Get contacts count
    const { count: contactsCount, error: contactsError } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });
      
    if (contactsError) throw contactsError;
    
    // Get meetings count
    const { count: meetingsCount, error: meetingsError } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true });
      
    if (meetingsError) throw meetingsError;
    
    // Get transcripts count
    const { count: transcriptsCount, error: transcriptsError } = await supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true });
      
    if (transcriptsError) throw transcriptsError;
    
    // Get pain points count
    const { count: painPointsCount, error: painPointsError } = await supabase
      .from('pain_points')
      .select('*', { count: 'exact', head: true });
      
    if (painPointsError) throw painPointsError;
    
    // Get weekly counts for change calculations
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const isoDate = oneWeekAgo.toISOString();
    
    // Contacts this week
    const { count: contactsThisWeek, error: contactsWeekError } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', isoDate);
      
    if (contactsWeekError) throw contactsWeekError;
    
    // Meetings this week
    const { count: meetingsThisWeek, error: meetingsWeekError } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', isoDate);
      
    if (meetingsWeekError) throw meetingsWeekError;
    
    // Transcripts this week
    const { count: transcriptsThisWeek, error: transcriptsWeekError } = await supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', isoDate);
      
    if (transcriptsWeekError) throw transcriptsWeekError;
    
    // Pain points this week
    const { count: painPointsThisWeek, error: painPointsWeekError } = await supabase
      .from('pain_points')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', isoDate);
      
    if (painPointsWeekError) throw painPointsWeekError;
    
    return {
      contacts: {
        total: contactsCount || 0,
        weeklyChange: contactsThisWeek || 0
      },
      meetings: {
        total: meetingsCount || 0,
        weeklyChange: meetingsThisWeek || 0
      },
      transcripts: {
        total: transcriptsCount || 0,
        weeklyChange: transcriptsThisWeek || 0
      },
      painPoints: {
        total: painPointsCount || 0,
        weeklyChange: painPointsThisWeek || 0
      }
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return {
      contacts: { total: 0, weeklyChange: 0 },
      meetings: { total: 0, weeklyChange: 0 },
      transcripts: { total: 0, weeklyChange: 0 },
      painPoints: { total: 0, weeklyChange: 0 }
    };
  }
}

// Get upcoming meetings
export async function getUpcomingMeetings(limit = 3) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        id,
        date,
        time,
        contact_id,
        contacts:contacts (
          name
        ),
        company_id,
        companies:companies (
          name
        )
      `)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(limit);
      
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching upcoming meetings:', error);
    return [];
  }
}

// Get recently analyzed conversations
export async function getRecentAnalysis(limit = 3) {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        id,
        date,
        contact_id,
        contacts:contacts (
          name
        ),
        company_id,
        companies:companies (
          name
        ),
        pain_points (id)
      `)
      .eq('has_analysis', true)
      .order('date', { ascending: false })
      .limit(limit);
      
    if (error) throw error;
    
    return data?.map(meeting => ({
      id: meeting.id,
      date: meeting.date,
      contactName: meeting.contacts?.name || '',
      company: meeting.companies?.name || '',
      painPoints: meeting.pain_points ? meeting.pain_points.length : 0
    })) || [];
  } catch (error) {
    console.error('Error fetching recent analysis:', error);
    return [];
  }
}

// Get most common pain points
export async function getCommonPainPoints(limit = 3) {
  try {
    // Fetch all pain points
    const { data: painPointsData, error: painPointsError } = await supabase
      .from('pain_points')
      .select('id, title, meeting_id')
      .order('created_at', { ascending: false });
    
    if (painPointsError) throw painPointsError;
    
    // Fetch meeting details for each pain point
    const meetingIds = [...new Set(painPointsData?.map(pp => pp.meeting_id) || [])];
    
    if (meetingIds.length === 0) return [];
    
    const { data: meetingsData, error: meetingsError } = await supabase
      .from('meetings')
      .select(`
        id,
        company_id,
        companies:companies (
          name
        )
      `)
      .in('id', meetingIds);
      
    if (meetingsError) throw meetingsError;
    
    // Create a lookup map for meetings
    const meetingsMap = new Map();
    meetingsData?.forEach(meeting => {
      meetingsMap.set(meeting.id, meeting);
    });
    
    // Process and aggregate the data
    const painPointsMap = new Map();
    
    painPointsData?.forEach(painPoint => {
      const title = painPoint.title;
      const meeting = meetingsMap.get(painPoint.meeting_id);
      const company = meeting?.companies?.name;
      
      if (!painPointsMap.has(title)) {
        painPointsMap.set(title, {
          title,
          count: 1,
          companies: company ? [company] : []
        });
      } else {
        const existing = painPointsMap.get(title);
        existing.count += 1;
        if (company && !existing.companies.includes(company)) {
          existing.companies.push(company);
        }
      }
    });
    
    // Convert to array, sort by count, and take the top 'limit' items
    const result = Array.from(painPointsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return result;
  } catch (error) {
    console.error('Error fetching common pain points:', error);
    return [];
  }
} 