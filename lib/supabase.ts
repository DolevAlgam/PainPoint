import { createClient } from '@supabase/supabase-js';

// These values should come from environment variables in production
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create a single supabase client for the browser
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to save and retrieve the user's OpenAI API key securely
// We'll store it in the user's metadata
export async function saveOpenAIApiKey(apiKey: string) {
  try {
    const { data: user } = await supabase.auth.getUser();
    
    if (!user.user) {
      throw new Error('User not authenticated');
    }
    
    // Update user metadata with encrypted API key
    // In a production app, you'd want to encrypt this
    const { error } = await supabase.auth.updateUser({
      data: { openai_api_key: apiKey }
    });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    return false;
  }
}

export async function getOpenAIApiKey() {
  try {
    const { data: user } = await supabase.auth.getUser();
    
    if (!user.user) {
      throw new Error('User not authenticated');
    }
    
    // Return the API key from user metadata
    return user.user.user_metadata.openai_api_key || '';
  } catch (error) {
    console.error('Error getting API key:', error);
    return '';
  }
} 