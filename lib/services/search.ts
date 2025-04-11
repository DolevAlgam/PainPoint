import { supabase } from '../supabase';
import type { Database } from '../database.types';

export type Contact = Database['public']['Tables']['contacts']['Row'];
export type Meeting = Database['public']['Tables']['meetings']['Row'];
export type Company = Database['public']['Tables']['companies']['Row'];
export type PainPoint = Database['public']['Tables']['pain_points']['Row'];

export type SearchResult = {
  id: string;
  title: string;
  description: string;
  type: 'contact' | 'meeting' | 'company' | 'pain-point';
  link: string;
};

export async function searchAll(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  const trimmedQuery = query.trim();
  const results: SearchResult[] = [];
  
  // Search contacts
  const contacts = await searchContacts(trimmedQuery);
  results.push(...contacts);
  
  // Search companies
  const companies = await searchCompanies(trimmedQuery);
  results.push(...companies);
  
  // Search meetings
  const meetings = await searchMeetings(trimmedQuery);
  results.push(...meetings);
  
  // Search pain points
  const painPoints = await searchPainPoints(trimmedQuery);
  results.push(...painPoints);
  
  return results;
}

async function searchContacts(query: string): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        *,
        companies (
          id,
          name,
          industry
        )
      `)
      .or(`name.ilike.%${query}%,email.ilike.%${query}%,role.ilike.%${query}%`);

    if (error) throw error;
    
    return (data || []).map(contact => ({
      id: contact.id,
      title: contact.name,
      description: `${contact.email} • ${contact.role} at ${contact.companies?.name || 'Unknown Company'}`,
      type: 'contact',
      link: `/contacts/${contact.id}`
    }));
  } catch (error) {
    console.error('Error searching contacts:', error);
    return [];
  }
}

async function searchCompanies(query: string): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.%${query}%,industry.ilike.%${query}%`);

    if (error) throw error;
    
    return (data || []).map(company => ({
      id: company.id,
      title: company.name,
      description: `Industry: ${company.industry}`,
      type: 'company',
      link: `/contacts?company=${company.id}`
    }));
  } catch (error) {
    console.error('Error searching companies:', error);
    return [];
  }
}

async function searchMeetings(query: string): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        contacts (
          id,
          name
        ),
        companies (
          id,
          name
        )
      `)
      .or(`notes.ilike.%${query}%`);

    if (error) throw error;
    
    return (data || []).map(meeting => {
      const contactName = meeting.contacts?.name || 'Unknown Contact';
      const companyName = meeting.companies?.name || 'Unknown Company';
      const meetingDate = new Date(meeting.date).toLocaleDateString();
      
      return {
        id: meeting.id,
        title: `Meeting with ${contactName}`,
        description: `${meetingDate} • ${companyName} • Status: ${meeting.status}`,
        type: 'meeting',
        link: `/meetings/${meeting.id}`
      };
    });
  } catch (error) {
    console.error('Error searching meetings:', error);
    return [];
  }
}

async function searchPainPoints(query: string): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select(`
        *,
        meetings (
          id,
          contacts (
            id,
            name
          ),
          companies (
            id,
            name
          )
        )
      `)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,root_cause.ilike.%${query}%`);

    if (error) throw error;
    
    return (data || []).map(painPoint => {
      const meetingId = painPoint.meeting_id;
      const contactName = painPoint.meetings?.contacts?.name || 'Unknown Contact';
      const companyName = painPoint.meetings?.companies?.name || 'Unknown Company';
      
      return {
        id: painPoint.id,
        title: painPoint.title,
        description: `Impact: ${painPoint.impact} • ${companyName} • ${contactName}`,
        type: 'pain-point',
        link: `/meetings/${meetingId}?tab=pain-points`
      };
    });
  } catch (error) {
    console.error('Error searching pain points:', error);
    return [];
  }
} 