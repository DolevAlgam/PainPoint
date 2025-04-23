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
      .neq('id', null);
    
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
    // Get the last analysis timestamp
    const { data, error } = await adminSupabase
      .from('meta_data')
      .select('value')
      .eq('key', 'last_pain_point_analysis')
      .maybeSingle();

    if (error) {
      console.error('Error fetching last analysis timestamp:', error);
      return true; // Default to refresh if we can't check
    }

    if (!data?.value) {
      return true; // No previous analysis, need to refresh
    }

    // Check if it's been more than 24 hours since last analysis
    const lastAnalysis = new Date(data.value);
    const now = new Date();
    const hoursSinceLastAnalysis = (now.getTime() - lastAnalysis.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastAnalysis >= 24;
  } catch (error) {
    console.error('Error checking refresh status:', error);
    return true; // Default to refresh on error
  }
}

/**
 * Update the timestamp of the last analysis
 */
async function updateLastAnalysisTimestamp() {
  try {
    const { error } = await adminSupabase
      .from('meta_data')
      .upsert({
        key: 'last_pain_point_analysis',
        value: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating last analysis timestamp:', error);
    }
  } catch (error) {
    console.error('Error updating last analysis timestamp:', error);
  }
}

// Analyze common pain points from multiple transcripts
async function analyzeCommonPainPoints(painPoints: any[], apiKey: string): Promise<any[]> {
  console.log(`🔍 OpenAI Service: analyzeCommonPainPoints called with ${painPoints.length} pain points`)
  // 1. Initialize the OpenAI client
  const openai = new OpenAI({ 
    apiKey
  });

  try {
    /**
     * First Call: Use o1 for deep analysis of pain points to identify patterns
     * and semantic clustering of related issues.
     */
    console.log("🔍 OpenAI Service: Making o1 API call for pain point analysis")
    const startTime = Date.now();
    const roughAnalysisResponse = await openai.responses.create({
      model: "o1",
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: `Analyze the provided pain points from different customer meetings and identify common themes or patterns.
Your task is to semantically cluster these pain points, even if they are described with different terminology.

# Your Task:
1. Analyze all pain points based on their descriptions, titles, and root causes
2. Group them into meaningful clusters based on the underlying issues they represent
3. Provide a representative name and description for each cluster
4. Include IDs of all pain points belonging to each cluster
5. Summarize the common themes across industries when applicable

# Important Rules:
1. Do NOT create generic clusters. Each cluster must be based on ACTUAL similar pain points
2. Pain points may be worded differently but represent the same underlying issue - group these together
3. Create clusters that have real business meaning - not merely linguistic similarities
4. For each cluster, calculate the average impact level where possible
5. Provide a detailed analysis of why you grouped certain pain points together

# Output Format:
For each cluster, provide:
1. A clear, concise name for this group of similar pain points
2. A 3-4 sentence description of the common theme
3. Number of pain points in this cluster
4. List of IDs of all pain points in this cluster
5. Summary of impact levels (how many high/medium/low)
6. List of all industries where this pain point was mentioned
7. List of company names that mentioned this pain point
8. Your reasoning for why these pain points belong together

PAIN POINTS TO ANALYZE:
${JSON.stringify(painPoints, null, 2)}`
            }
          ]
        }
      ],
      // Return plain text for the thorough analysis
      text: {
        format: { type: "text" }
      },
      reasoning: { effort: "high" },
      tools: [],
      store: false
    });
    console.log(`🔍 OpenAI Service: o1 API call completed in ${(Date.now() - startTime) / 1000} seconds`)

    /**
     * Extract the deep analysis text from o1's response.
     */
    const roughAnalysisText = 
      (roughAnalysisResponse as any).output_text || 
      // Try content path for message content
      ((roughAnalysisResponse as any).output?.[1]?.content?.[0]?.text) ||
      // Fallback
      "No analysis text returned.";
    
    console.log(`🔍 OpenAI Service: Got analysis text of ${roughAnalysisText.length} characters`)

    /**
     * Second Call: Use GPT-4o to transform the textual analysis into structured JSON
     * This is similar to how analyzePainPoints uses GPT-4o to parse the o1 output
     */
    console.log("🔍 OpenAI Service: Making GPT-4o API call to parse the analysis")
    const jsonStartTime = Date.now();
    const structuredJsonResponse = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `Convert the following pain point cluster analysis into a structured JSON format.

Here is the analysis text to parse. You MUST base your JSON strictly on this text and not add or remove clusters:
${roughAnalysisText}

# JSON Output Requirements
- Return only valid JSON
- Follow this schema precisely
- The output should be a SINGLE OBJECT with a 'clusters' property containing the array of cluster objects
- Each cluster should be an object in the clusters array
- Include all clusters mentioned in the analysis

# IMPORTANT RULES:
1. Include ALL clusters from the analysis in the 'clusters' array
2. Keep numeric values (like counts) as integers, not strings
3. Make sure the JSON is valid and follows the exact schema
4. Do not add any explanations before or after the JSON
5. Don't make up any information - if something isn't in the analysis, use empty arrays or zeros
6. Your output must have format: { "clusters": [ {...}, {...}, ... ] }
7. Each impact_summary object MUST have exactly these fields: High, Medium, Low, Unknown (integers)
8. Do not add any additional fields to any object that are not specified in the schema
`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pain_point_clusters",
          strict: true,
          schema: {
            type: "object",
            properties: {
              clusters: {
                type: "array",
                description: "An array of pain point clusters",
                items: {
                  type: "object",
                  properties: {
                    cluster_name: {
                      type: "string",
                      description: "A concise name for this cluster of similar pain points"
                    },
                    description: {
                      type: "string", 
                      description: "A 1-2 sentence description of the common theme"
                    },
                    count: {
                      type: "integer",
                      description: "Number of pain points in this cluster"
                    },
                    pain_point_ids: {
                      type: "array",
                      description: "Array of IDs of all pain points in this cluster",
                      items: {
                        type: "string"
                      }
                    },
                    impact_summary: {
                      type: "object",
                      properties: {
                        High: { type: "integer" },
                        Medium: { type: "integer" },
                        Low: { type: "integer" },
                        Unknown: { type: "integer" }
                      },
                      required: ["High", "Medium", "Low", "Unknown"],
                      additionalProperties: false
                    },
                    industries: {
                      type: "array",
                      description: "Array of all industries where this pain point was mentioned",
                      items: {
                        type: "string"
                      }
                    },
                    companies: {
                      type: "array",
                      description: "Array of company names that mentioned this pain point",
                      items: {
                        type: "string"
                      }
                    }
                  },
                  required: ["cluster_name", "description", "count", "pain_point_ids", "impact_summary", "industries", "companies"],
                  additionalProperties: false
                }
              }
            },
            required: ["clusters"],
            additionalProperties: false
          }
        }
      },
      reasoning: {},
      tools: [],
      temperature: 0.2,
      max_output_tokens: 10000,
      top_p: 1,
      store: false
    });
    console.log(`🔍 OpenAI Service: GPT-4o API call completed in ${(Date.now() - jsonStartTime) / 1000} seconds`)

    // Extract the clusters from the GPT-4o response
    let clusters = [];
    
    try {
      console.log("🔍 OpenAI Service: Extracting clusters from response")
      // For OpenAI API responses
      if (structuredJsonResponse && typeof structuredJsonResponse === 'object') {
        if ((structuredJsonResponse as any).output_text) {
          try {
            const parsedData = JSON.parse((structuredJsonResponse as any).output_text);
            clusters = parsedData.clusters || [];
            console.log(`🔍 OpenAI Service: Successfully parsed clusters from output_text: ${clusters.length} found`)
          } catch (e) {
            console.error("❌ OpenAI Service: Error parsing output_text JSON:", e);
          }
        } else if ((structuredJsonResponse as any).output?.[0]?.content?.[0]?.text) {
          try {
            const contentText = (structuredJsonResponse as any).output[0].content[0].text;
            const parsedData = JSON.parse(contentText);
            clusters = parsedData.clusters || [];
            console.log(`🔍 OpenAI Service: Successfully parsed clusters from content: ${clusters.length} found`)
          } catch (e) {
            console.error("❌ OpenAI Service: Error parsing content text:", e);
          }
        }
      }
    } catch (e) {
      console.error("❌ OpenAI Service: Error extracting clusters from response:", e);
    }

    console.log(`🔍 OpenAI Service: Returning ${clusters.length} clusters`)
    return clusters;
  } catch (error) {
    console.error("❌ OpenAI Service: Pain point cluster analysis error:", error);
    throw error;
  }
} 