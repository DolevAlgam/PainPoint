import { supabase } from '../supabase';
import type { Database } from '../database.types';

export type Contact = Database['public']['Tables']['contacts']['Row'];
export type NewContact = Database['public']['Tables']['contacts']['Insert'];

// Add types for Role
export type Role = Database['public']['Tables']['roles']['Row'];
export type NewRole = Database['public']['Tables']['roles']['Insert'];

export async function getContacts() {
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
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return [];
  }
}

export async function getContact(id: string) {
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
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching contact with id ${id}:`, error);
    return null;
  }
}

export async function createContact(contact: NewContact) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .insert(contact)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating contact:', error);
    return null;
  }
}

export async function updateContact(id: string, updates: Partial<Contact>) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating contact with id ${id}:`, error);
    return null;
  }
}

export async function deleteContact(id: string) {
  try {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error deleting contact with id ${id}:`, error);
    return false;
  }
}

export async function searchContacts(query: string) {
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
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error searching contacts:', error);
    return [];
  }
}

// --- Role Functions ---

export async function getRoles(): Promise<Role[]> {
  try {
    // RLS policy ensures only user's roles are fetched
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('name'); // Sort alphabetically

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching roles:', error);
    return [];
  }
}

export async function createRole(role: NewRole): Promise<Role | null> {
  try {
    // RLS policy ensures user_id is checked on insert
    const { data, error } = await supabase
      .from('roles')
      .insert(role)
      .select()
      .single();

    if (error) {
        // Handle potential unique constraint violation (name + user_id)
        if (error.message.includes('duplicate key value violates unique constraint')) {
            console.warn('Attempted to create duplicate role:', role.name);
            // Optionally, fetch and return the existing role if needed
            return null; // Or handle as needed - returning null indicates it wasn't newly created
        } else {
            throw error; // Re-throw other errors
        }
    }
    return data;
  } catch (error) {
    console.error('Error creating role:', error);
    return null;
  }
} 