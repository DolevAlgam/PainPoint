import { SQSEvent, SQSHandler } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Create a Supabase client with the service role key for admin access
const adminSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      console.log('Processing SQS message:', record.body);
      const message = JSON.parse(record.body);
      const { userId, forceRefresh = false } = message;
      
      if (!userId) {
        console.error('Missing required parameters in SQS message');
        continue;
      }
      
      await processAnalysisInBackground(userId, forceRefresh);
    } catch (error) {
      console.error('Error processing SQS message:', error);
    }
  }
};

// This is adapted from the existing processAnalysisInBackground function
async function processAnalysisInBackground(
  userId: string,
  forceRefresh: boolean = false
): Promise<void> {
  try {
    // Skip processing if not forcing refresh and there's no new data
    if (!forceRefresh) {
      const shouldRefresh = await shouldRefreshClusters();
      if (!shouldRefresh) {
        console.log("No refresh needed, using existing clusters");
        return;
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
      throw new Error('Failed to retrieve OpenAI API key from user settings');
    }
    
    if (!userSettings?.openai_api_key) {
      throw new Error('No OpenAI API key found in user settings. Please add your API key in settings.');
    }
    
    const apiKey = userSettings.openai_api_key;
    
    // Get all pain points with their meeting and company information
    console.log("Fetching all pain points for analysis");
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

    // Use the analyzeCommonPainPoints function
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

// Analyze common pain points function
async function analyzeCommonPainPoints(painPointsContext: any[], apiKey: string): Promise<any[]> {
  console.log('Analyzing common pain points');
  
  // Create OpenAI API instance
  const openai = new OpenAI({
    apiKey: apiKey
  });
  
  // Prepare the prompt
  const systemMessage = `
    You are an expert at analyzing customer pain points across multiple sales conversations.
    Given a list of individual pain points from different customer conversations,
    identify common themes or clusters of related pain points.
    For each cluster, provide:
    1. A descriptive name for the cluster
    2. A brief description of the common issue
    3. IDs of the pain points that belong to this cluster
    4. A summary of the impact based on the individual pain point impacts
    5. List of industries affected
    6. List of companies experiencing this issue
  `;
  
  // Call OpenAI API
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: `Here are the pain points to analyze:\n\n${JSON.stringify(painPointsContext, null, 2)}` }
    ],
    temperature: 0.5,
    response_format: { type: "json_object" }
  });
  
  // Parse the response
  const content = response.choices[0]?.message?.content || "{}";
  try {
    const result = JSON.parse(content);
    return result.clusters || [];
  } catch (error) {
    console.error('Error parsing OpenAI response:', error);
    return [];
  }
} 