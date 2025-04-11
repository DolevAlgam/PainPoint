import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

// Create a Supabase client with SERVICE_ROLE which bypasses RLS policies
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const { improvements, positives, features, userId, anonymous } = await request.json()
    
    // Validate at least one field has content
    if (!improvements && !positives && !features) {
      return NextResponse.json(
        { error: 'Please fill out at least one feedback field' },
        { status: 400 }
      )
    }
    
    // Validate user ID
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }
    
    // Check if anonymous is a boolean or convert it
    const isAnonymous = typeof anonymous === 'boolean' ? anonymous : false;
    
    // Insert feedback with the admin client that bypasses RLS
    const { data, error } = await supabaseAdmin
      .from('feedback')
      .insert({
        user_id: userId,
        improvements: improvements || null,
        positives: positives || null,
        features: features || null,
        anonymous: isAnonymous
      })
      .select()
    
    if (error) {
      console.error('Feedback submission error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
} 