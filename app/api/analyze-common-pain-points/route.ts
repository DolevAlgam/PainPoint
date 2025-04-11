import { NextRequest, NextResponse } from 'next/server';
import { analyzeCommonPainPoints } from '@/lib/openai';
import { createClient } from '@supabase/supabase-js';
import { getOpenAIApiKey } from '@/lib/supabase';

// Create a Supabase client with the service role key for admin access
// This bypasses RLS policies
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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

    const apiKey = userSettings.openai_api_key;

    // Start the background processing and return immediately
    console.log("Starting background analysis process");
    const response = NextResponse.json({
      success: true,
      message: 'Analysis started',
      status: 'in_progress'
    });

    // Process in the background
    processAnalysisInBackground(userId, apiKey);

    return response;
  } catch (error: any) {
    console.error('Common pain points analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred processing the request' },
      { status: 500 }
    );
  }
}

// This function runs in the background after the API has responded
async function processAnalysisInBackground(userId: string, apiKey: string): Promise<void> {
  try {
    console.log("Fetching all pain points for analysis");
    // Get all pain points with their meeting and company information
    const { data, error } = await adminSupabase
      .from('pain_points')
      .select(`
        id,
        title,
        description,
        root_cause,
        impact,
        created_at,
        meetings:meeting_id (
          id,
          date,
          contacts:contact_id (
            id, 
            name,
            role
          ),
          companies:company_id (
            id,
            name,
            industry
          )
        )
      `);

    if (error) throw error;
    console.log(`Fetched ${data?.length || 0} pain points`);
    
    if (!data || data.length === 0) {
      console.log("No pain points found");
      return;
    }

    // Prepare the pain points for analysis by creating a structured summary
    console.log("Preparing pain points for analysis");
    const painPointsContext = data.map(pp => {
      // Use type assertion to handle complex nested structure
      const meeting = pp.meetings as any;
      
      return {
        id: pp.id,
        title: pp.title,
        description: pp.description,
        root_cause: pp.root_cause,
        impact: pp.impact,
        company: meeting?.companies?.name || 'Unknown',
        industry: meeting?.companies?.industry || 'Unknown',
        contact: meeting?.contacts?.name || 'Unknown',
      };
    });

    // Use the analyzeCommonPainPoints function from openai.ts for analysis
    console.log("Calling OpenAI for pain point analysis");
    const clusters = await analyzeCommonPainPoints(painPointsContext, apiKey);
    console.log(`Received ${clusters.length} clusters from OpenAI`);

    // Create a mapping of pain point ID to data for easy lookup
    console.log("Creating pain point ID mapping");
    const painPointsMap = data.reduce((acc: any, pp: any) => {
      acc[pp.id] = pp;
      return acc;
    }, {});

    // Enhance each cluster with example pain points
    console.log("Enhancing clusters with examples");
    const enhancedClusters = clusters.map((cluster: any) => {
      // Get all pain points as examples
      const examples = cluster.pain_point_ids
        .map((id: string) => painPointsMap[id])
        .filter(Boolean);

      return {
        ...cluster,
        examples
      };
    });

    // Store the results in the database
    console.log("Storing pain point clusters in database");
    await storePainPointClusters(enhancedClusters);
  } catch (error) {
    console.error('Background analysis error:', error);
  }
}

/**
 * Store pain point clusters in the database
 */
async function storePainPointClusters(clusters: any[]) {
  try {
    // First clear existing clusters
    console.log("Deleting existing clusters");
    const { error: deleteError } = await adminSupabase
      .from('pain_point_clusters')
      .delete()
      .filter('id', 'is', 'not.null');
    
    if (deleteError) {
      console.error('Error deleting existing clusters:', deleteError);
    }

    // Insert new clusters
    console.log("Inserting new clusters");
    let successCount = 0;
    for (const cluster of clusters) {
      try {
        const { error } = await adminSupabase
          .from('pain_point_clusters')
          .insert({
            cluster_name: cluster.cluster_name,
            description: cluster.description,
            count: cluster.count, 
            pain_point_ids: cluster.pain_point_ids,
            impact_summary: cluster.impact_summary,
            industries: cluster.industries,
            companies: cluster.companies,
            examples: cluster.examples ? JSON.stringify(cluster.examples) : null,
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error('Error storing cluster:', error);
        } else {
          successCount++;
          console.log(`Saved cluster: ${cluster.cluster_name}`);
        }
      } catch (insertErr) {
        console.error('Error inserting cluster:', insertErr);
      }
    }

    // Update the last analysis timestamp
    console.log(`Successfully stored ${successCount} of ${clusters.length} clusters`);
    await updateLastAnalysisTimestamp();
  } catch (error) {
    console.error('Error storing pain point clusters:', error);
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
 * Update the timestamp of the last analysis
 */
async function updateLastAnalysisTimestamp() {
  try {
    const timestamp = new Date().toISOString();
    
    // Check if record exists
    const { data } = await adminSupabase
      .from('meta_data')
      .select('*')
      .eq('key', 'last_pain_point_analysis')
      .maybeSingle();
    
    if (data) {
      // Update existing record
      await adminSupabase
        .from('meta_data')
        .update({ value: timestamp })
        .eq('key', 'last_pain_point_analysis');
    } else {
      // Insert new record
      await adminSupabase
        .from('meta_data')
        .insert({ key: 'last_pain_point_analysis', value: timestamp });
    }
  } catch (error) {
    console.error('Error updating last analysis timestamp:', error);
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