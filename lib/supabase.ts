import { createClient } from '@supabase/supabase-js';

// These values should come from environment variables in production
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create a single supabase client for the browser
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to save and retrieve the user's OpenAI API key securely
// We'll store it in the user_settings table
export async function saveOpenAIApiKey(apiKey: string) {
  try {
    const { data: user } = await supabase.auth.getUser();
    
    if (!user.user) {
      throw new Error('User not authenticated');
    }
    
    const userId = user.user.id;
    
    // Check if the user already has a settings record
    const { data: existingSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', userId)
      .single();
      
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "row not found" error
      throw fetchError;
    }
    
    if (existingSettings) {
      // Update existing settings
      const { error } = await supabase
        .from('user_settings')
        .update({ openai_api_key: apiKey })
        .eq('user_id', userId);
        
      if (error) throw error;
    } else {
      // Insert new settings
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: userId, openai_api_key: apiKey });
        
      if (error) throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    return false;
  }
}

// Add debug logs to getOpenAIApiKey
export async function getOpenAIApiKey(): Promise<string | null> {
  console.log("🔍 Supabase Service: getOpenAIApiKey called")
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log("🔍 Supabase Service: No session found, returning null")
      return null;
    }

    console.log("🔍 Supabase Service: Fetching OpenAI API key from user_settings table")
    const userId = session.user.id;
    
    const { data, error } = await supabase
      .from('user_settings')
      .select('openai_api_key')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error("❌ Supabase Service: Error fetching OpenAI API key:", error)
      return null;
    }
    
    if (!data || !data.openai_api_key) {
      console.log("🔍 Supabase Service: OpenAI API key not found in user_settings")
      return null;
    }

    console.log("🔍 Supabase Service: OpenAI API key retrieved successfully")
    return data.openai_api_key;
  } catch (error) {
    console.error("❌ Supabase Service: Error getting OpenAI API key:", error)
    return null;
  }
} 