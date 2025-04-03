import { supabase } from '../supabase';
import type { Database } from '../database.types';

export type Company = Database['public']['Tables']['companies']['Row'];
export type NewCompany = Database['public']['Tables']['companies']['Insert'];

// Add types for Industry
export type Industry = Database['public']['Tables']['industries']['Row'];
export type NewIndustry = Database['public']['Tables']['industries']['Insert'];

export async function getCompanies() {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching companies:', error);
    return [];
  }
}

export async function getCompany(id: string) {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching company with id ${id}:`, error);
    return null;
  }
}

export async function createCompany(company: NewCompany) {
  try {
    const { data, error } = await supabase
      .from('companies')
      .insert(company)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating company:', error);
    return null;
  }
}

export async function updateCompany(id: string, updates: Partial<Company>) {
  try {
    const { data, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating company with id ${id}:`, error);
    return null;
  }
}

export async function deleteCompany(id: string) {
  try {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error deleting company with id ${id}:`, error);
    return false;
  }
}

// --- Industry Functions ---

export async function getIndustries(): Promise<Industry[]> {
  try {
    // RLS policy ensures only user's industries are fetched
    const { data, error } = await supabase
      .from('industries')
      .select('*')
      .order('name'); // Sort alphabetically

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching industries:', error);
    return [];
  }
}

export async function createIndustry(industry: NewIndustry): Promise<Industry | null> {
  try {
    // RLS policy ensures user_id is checked on insert
    const { data, error } = await supabase
      .from('industries')
      .insert(industry)
      .select()
      .single();

    if (error) {
        // Handle potential unique constraint violation (name + user_id)
        if (error.message.includes('duplicate key value violates unique constraint')) {
             console.warn('Attempted to create duplicate industry:', industry.name);
             // Optionally, fetch and return the existing industry if needed
             return null; // Or handle as needed - returning null indicates it wasn't newly created
        } else {
            throw error; // Re-throw other errors
        }
    }
    return data;
  } catch (error) {
    console.error('Error creating industry:', error);
    return null;
  }
} 