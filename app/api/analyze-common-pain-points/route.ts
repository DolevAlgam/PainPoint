import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';

// Create a Supabase client with the service role key for admin access
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Configure AWS SDK
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-west-2',
  credentials: new AWS.Credentials({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }),
});

const ANALYZE_PAIN_POINTS_QUEUE_URL = process.env.ANALYZE_PAIN_POINTS_QUEUE_URL || '';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { userId, forceRefresh = false } = data;

    console.log('Common pain points analysis request received:', { userId, forceRefresh });

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Check if we should use cached results
    if (!forceRefresh) {
      console.log("Checking for cached clusters");
      const cachedClusters = await getCachedPainPointClusters();
      
      if (cachedClusters && cachedClusters.length > 0) {
        console.log("Checking if refresh is needed");
        const shouldRefresh = await shouldRefreshClusters();
        
        // Return cached results, but indicate if a refresh is needed
        console.log("Using cached results");
        const lastUpdated = await getLastClusterAnalysisTime();
        return NextResponse.json({
          clusters: cachedClusters,
          lastUpdated: lastUpdated,
          needsRefresh: shouldRefresh
        });
      }
    }

    // Get the user's OpenAI API key from user_settings table
    const { data: userSettings, error: settingsError } = await adminSupabase
      .from('user_settings')
      .select('openai_api_key')
      .eq('user_id', userId)
      .single();
    
    if (settingsError) {
      console.error('Error fetching user settings:', settingsError.message);
      return NextResponse.json(
        { error: 'Failed to retrieve OpenAI API key from user settings' },
        { status: 500 }
      );
    }
    
    if (!userSettings?.openai_api_key) {
      return NextResponse.json(
        { error: 'No OpenAI API key found in user settings. Please add your API key in settings.' },
        { status: 400 }
      );
    }

    // Send message to SQS queue
    console.log('Sending message to SQS queue for background processing');
    
    // Check if queue URL is configured
    if (!ANALYZE_PAIN_POINTS_QUEUE_URL) {
      console.error('ANALYZE_PAIN_POINTS_QUEUE_URL environment variable is not set');
      
      // Return success but log the error
      return NextResponse.json({
        success: true,
        message: 'Analysis started (without SQS)',
        status: 'in_progress'
      });
    }
    
    const sqsParams = {
      QueueUrl: ANALYZE_PAIN_POINTS_QUEUE_URL,
      MessageBody: JSON.stringify({
        userId,
        forceRefresh
      }),
      MessageDeduplicationId: `analyze-pain-points-${userId}-${Date.now()}`,
      MessageGroupId: `analyze-pain-points`
    };
    
    try {
      const sqsResponse = await sqs.sendMessage(sqsParams).promise();
      console.log('Successfully sent message to SQS queue:', sqsResponse.MessageId);
    } catch (sqsError: any) {
      console.error('Error sending message to SQS queue:', sqsError);
      // Continue even if SQS fails
    }

    // Return immediately to acknowledge receipt of the request
    return NextResponse.json({
      success: true,
      message: 'Analysis started',
      status: 'in_progress'
    });
  } catch (error: any) {
    console.error('Common pain points analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred processing the request' },
      { status: 500 }
    );
  }
}

/**
 * Get cached pain point clusters from the database
 */
async function getCachedPainPointClusters() {
  try {
    const { data, error } = await adminSupabase
      .from('pain_point_clusters')
      .select('*')
      .order('count', { ascending: false });

    if (error) {
      console.error('Error fetching cached clusters:', error);
      return null;
    }
    
    // Parse the examples JSON back to objects
    try {
      return data.map(cluster => ({
        ...cluster,
        examples: cluster.examples ? JSON.parse(cluster.examples) : []
      }));
    } catch (parseError) {
      console.error('Error parsing cluster examples JSON:', parseError);
      // Return clusters without examples as fallback
      return data.map(cluster => ({
        ...cluster,
        examples: []
      }));
    }
  } catch (error) {
    console.error('Error retrieving cached clusters:', error);
    return null;
  }
}

/**
 * Check if there are new pain points since the last analysis
 */
async function shouldRefreshClusters() {
  try {
    // Get the latest pain point creation time
    const { data: latestPainPoint, error: painPointError } = await adminSupabase
      .from('pain_points')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (painPointError) {
      console.error('Error checking latest pain point:', painPointError);
      return true; // Refresh to be safe
    }

    // Get the last analysis time
    const { data: lastAnalysis, error: metaError } = await adminSupabase
      .from('meta_data')
      .select('value')
      .eq('key', 'last_pain_point_analysis')
      .maybeSingle();

    if (metaError || !lastAnalysis) {
      return true; // No record found, should refresh
    }

    // Compare timestamps
    const lastAnalysisTime = new Date(lastAnalysis.value);
    const latestPainPointTime = new Date(latestPainPoint.created_at);

    // If there are pain points created after the last analysis, refresh is needed
    return latestPainPointTime > lastAnalysisTime;
  } catch (error) {
    console.error('Error checking if clusters should be refreshed:', error);
    return true; // Refresh to be safe
  }
}

/**
 * Get the timestamp of the last analysis
 */
async function getLastClusterAnalysisTime() {
  try {
    const { data, error } = await adminSupabase
      .from('meta_data')
      .select('value')
      .eq('key', 'last_pain_point_analysis')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.value;
  } catch (error) {
    console.error('Error getting last analysis time:', error);
    return null;
  }
} 