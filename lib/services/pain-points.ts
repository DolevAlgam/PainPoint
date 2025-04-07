import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { analyzePainPoints, analyzeCommonPainPoints } from '../openai';
import { getOpenAIApiKey } from '../supabase';

export type PainPoint = Database['public']['Tables']['pain_points']['Row'];
export type NewPainPoint = Database['public']['Tables']['pain_points']['Insert'];
export type PainPointCluster = Database['public']['Tables']['pain_point_clusters']['Row'];

export async function getPainPoints(meetingId: string) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`Error fetching pain points for meeting ${meetingId}:`, error);
    return [];
  }
}

export async function getPainPoint(id: string) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching pain point with id ${id}:`, error);
    return null;
  }
}

export async function createPainPoint(painPoint: NewPainPoint) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .insert(painPoint)
      .select()
      .single();

    if (error) throw error;
    
    // Update the meeting to indicate it has analysis
    await supabase
      .from('meetings')
      .update({ 
        has_analysis: true,
        status: 'analyzed'
      })
      .eq('id', painPoint.meeting_id);
      
    return data;
  } catch (error) {
    console.error('Error creating pain point:', error);
    return null;
  }
}

export async function updatePainPoint(id: string, updates: Partial<PainPoint>) {
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating pain point with id ${id}:`, error);
    return null;
  }
}

export async function deletePainPoint(id: string, meetingId: string) {
  try {
    const { error } = await supabase
      .from('pain_points')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Check if this was the only pain point for the meeting
    const { data: remainingPainPoints, error: checkError } = await supabase
      .from('pain_points')
      .select('id')
      .eq('meeting_id', meetingId);

    if (checkError) throw checkError;

    // If no pain points left, update the meeting
    if (remainingPainPoints.length === 0) {
      await supabase
        .from('meetings')
        .update({ 
          has_analysis: false 
        })
        .eq('id', meetingId);
    }

    return true;
  } catch (error) {
    console.error(`Error deleting pain point with id ${id}:`, error);
    return false;
  }
}

export async function generatePainPointsFromTranscript(transcript: string, meetingId: string, userId: string) {
  try {
    // Get the user's OpenAI API key
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) throw new Error('OpenAI API key not found');

    // Analyze the transcript using OpenAI
    const painPointsData = await analyzePainPoints(transcript, apiKey);

    // Create pain points in the database
    const painPoints = painPointsData.map((pp: any) => ({
      meeting_id: meetingId,
      title: pp.title,
      description: pp.description,
      root_cause: pp.rootCause,
      impact: pp.impact,
      user_id: userId,
      citations: pp.citations || null
    }));

    const { data, error } = await supabase
      .from('pain_points')
      .insert(painPoints)
      .select();

    if (error) throw error;
    
    // Update the meeting
    await supabase
      .from('meetings')
      .update({ 
        has_analysis: true,
        status: 'analyzed'
      })
      .eq('id', meetingId);
      
    return data;
  } catch (error) {
    console.error(`Error generating pain points for meeting ${meetingId}:`, error);
    return null;
  }
}

export async function getAllPainPoints() {
  console.log("🔍 PainPoints Service: getAllPainPoints called")
  try {
    const { data, error } = await supabase
      .from('pain_points')
      .select(`
        *,
        meetings (
          id,
          date,
          contacts (
            id,
            name,
            role
          ),
          companies (
            id,
            name,
            industry
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log(`🔍 PainPoints Service: getAllPainPoints returned ${data?.length || 0} items`)
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching all pain points:', error);
    return [];
  }
}

export async function getMostCommonPainPoints(limit = 10) {
  try {
    // This is a simplified approach. In a real app with a lot of data,
    // you might want to use a more efficient SQL query.
    const { data, error } = await supabase
      .from('pain_points')
      .select(`
        *,
        meetings (
          companies (
            id,
            name,
            industry
          )
        )
      `);

    if (error) throw error;

    // Group by title and count occurrences
    const painPointCounts = (data || []).reduce((acc: any, pp: any) => {
      const title = pp.title.toLowerCase();
      if (!acc[title]) {
        acc[title] = {
          title: pp.title,
          count: 0,
          impact: { High: 0, Medium: 0, Low: 0 },
          industries: new Set(),
          example: pp
        };
      }
      acc[title].count += 1;
      acc[title].impact[pp.impact] += 1;
      acc[title].industries.add(pp.meetings.companies.industry);
      return acc;
    }, {});

    // Convert to array and sort by count
    const result = Object.values(painPointCounts)
      .map((item: any) => ({
        ...item,
        industries: Array.from(item.industries)
      }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, limit);

    return result;
  } catch (error) {
    console.error('Error fetching most common pain points:', error);
    return [];
  }
}

export async function getCommonPainPointsWithAI(forceRefresh = false) {
  console.log(`🔍 PainPoints Service: getCommonPainPointsWithAI called with forceRefresh=${forceRefresh}`)
  try {
    // Check if we should use cached results
    if (!forceRefresh) {
      console.log("🔍 PainPoints Service: Checking for cached clusters")
      const cachedClusters = await getCachedPainPointClusters();
      console.log(`🔍 PainPoints Service: Found ${cachedClusters?.length || 0} cached clusters`)
      
      if (cachedClusters && cachedClusters.length > 0) {
        console.log("🔍 PainPoints Service: Checking if refresh is needed")
        const shouldRefresh = await shouldRefreshClusters();
        console.log(`🔍 PainPoints Service: Should refresh? ${shouldRefresh}`)
        
        // If there's no need to refresh, return the cached results
        if (!shouldRefresh) {
          console.log("🔍 PainPoints Service: Using cached results")
          const lastUpdated = await getLastClusterAnalysisTime();
          console.log(`🔍 PainPoints Service: Last updated: ${lastUpdated}`)
          return {
            clusters: cachedClusters,
            lastUpdated: lastUpdated,
            needsRefresh: false
          };
        }
      }
    }

    console.log("🔍 PainPoints Service: Fetching all pain points for analysis")
    // First, get all pain points with their meeting and company information
    const { data, error } = await supabase
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
    console.log(`🔍 PainPoints Service: Fetched ${data?.length || 0} pain points`)
    
    if (!data || data.length === 0) {
      console.log("🔍 PainPoints Service: No pain points found, returning empty result")
      return {
        clusters: [],
        lastUpdated: null,
        needsRefresh: false
      };
    }

    // Get the user's OpenAI API key
    console.log("🔍 PainPoints Service: Getting OpenAI API key")
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) {
      console.error("❌ PainPoints Service: OpenAI API key not found")
      throw new Error('OpenAI API key not found');
    }

    // Prepare the pain points for analysis by creating a structured summary
    console.log("🔍 PainPoints Service: Preparing pain points for analysis")
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

    // Use the analyzeCommonPainPoints function from openai.ts for o1-powered analysis
    console.log("🔍 PainPoints Service: Calling OpenAI for pain point analysis")
    const clusters = await analyzeCommonPainPoints(painPointsContext, apiKey);
    console.log(`🔍 PainPoints Service: Received ${clusters.length} clusters from OpenAI`)

    // Create a mapping of pain point ID to data for easy lookup
    console.log("🔍 PainPoints Service: Creating pain point ID mapping")
    const painPointsMap = data.reduce((acc: any, pp: any) => {
      acc[pp.id] = pp;
      return acc;
    }, {});

    // Enhance each cluster with example pain points
    console.log("🔍 PainPoints Service: Enhancing clusters with examples")
    const enhancedClusters = clusters.map((cluster: any) => {
      // Get the first 3 pain points as examples
      const examples = cluster.pain_point_ids
        .slice(0, 3)
        .map((id: string) => painPointsMap[id])
        .filter(Boolean);

      return {
        ...cluster,
        examples
      };
    });

    // Store the results in the database
    console.log("🔍 PainPoints Service: Storing pain point clusters in database")
    await storePainPointClusters(enhancedClusters);
    console.log("🔍 PainPoints Service: Clusters stored successfully")

    // Sort clusters by count and return all clusters
    console.log(`🔍 PainPoints Service: Returning ${enhancedClusters.length} clusters`)
    return {
      clusters: enhancedClusters
        .sort((a: any, b: any) => b.count - a.count),
      lastUpdated: new Date().toISOString(),
      needsRefresh: false
    };

  } catch (error) {
    console.error('❌ Error analyzing common pain points with AI:', error);
    console.log("🔍 PainPoints Service: Getting last analysis time after error")
    const lastUpdated = await getLastClusterAnalysisTime();
    return {
      clusters: [],
      lastUpdated: lastUpdated,
      needsRefresh: true
    };
  }
}

/**
 * Store pain point clusters in the database
 */
async function storePainPointClusters(clusters: any[]) {
  console.log(`🔍 PainPoints Service: storePainPointClusters called with ${clusters.length} clusters`)
  try {
    // First, try to clear existing clusters with a more robust approach
    console.log("🔍 PainPoints Service: Deleting existing clusters")
    let deleteSuccess = false;
    let retryCount = 0;
    
    while (!deleteSuccess && retryCount < 3) {
      try {
        // Get existing clusters first to see what we're dealing with
        const { data: existingClusters, error: fetchError } = await supabase
          .from('pain_point_clusters')
          .select('id')
          .limit(500);
        
        if (fetchError) {
          console.warn('⚠️ Error fetching existing clusters:', fetchError);
        } else {
          console.log(`🔍 Found ${existingClusters?.length || 0} existing clusters`);
        }
        
        // Try two approaches for deletion
        if (retryCount === 0) {
          // First attempt: bulk delete
          const { error: deleteError } = await supabase
            .from('pain_point_clusters')
            .delete()
            .filter('id', 'is', 'not.null');
          
          if (deleteError) {
            console.warn(`⚠️ Bulk deletion failed (attempt ${retryCount + 1})`, deleteError);
            retryCount++;
          } else {
            console.log("✅ Existing clusters deleted successfully via bulk delete");
            deleteSuccess = true;
          }
        } else {
          // Second attempt: if we have fewer than 50 clusters, delete them individually
          // This is a fallback approach
          if (existingClusters && existingClusters.length > 0) {
            let individualDeleteSuccess = true;
            for (const cluster of existingClusters) {
              const { error: singleDeleteError } = await supabase
                .from('pain_point_clusters')
                .delete()
                .eq('id', cluster.id);
              
              if (singleDeleteError) {
                console.warn(`⚠️ Failed to delete cluster ${cluster.id}:`, singleDeleteError);
                individualDeleteSuccess = false;
              }
            }
            
            if (individualDeleteSuccess) {
              console.log("✅ Existing clusters deleted successfully via individual deletes");
              deleteSuccess = true;
            } else {
              console.warn(`⚠️ Some individual deletions failed (attempt ${retryCount + 1})`);
              retryCount++;
            }
          } else {
            // No clusters found to delete or couldn't fetch them
            console.log("✅ No existing clusters found to delete or couldn't fetch them");
            deleteSuccess = true; // Consider this a success case
          }
        }
      } catch (deleteErr) {
        console.error(`❌ Caught error during deletion attempt ${retryCount + 1}:`, deleteErr);
        retryCount++;
        
        // Short delay before retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    if (!deleteSuccess) {
      console.warn("⚠️ Could not delete existing clusters after multiple attempts - will try to insert new clusters anyway");
    }

    // Insert new clusters
    console.log("🔍 PainPoints Service: Inserting new clusters")
    let successCount = 0;
    for (const cluster of clusters) {
      try {
        const { data, error } = await supabase
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
          })
          .select();

        if (error) {
          console.error('❌ Error storing cluster:', error);
        } else {
          successCount++;
          console.log(`✅ Saved cluster: ${cluster.cluster_name}`);
        }
      } catch (insertErr) {
        console.error('❌ Caught error inserting cluster:', insertErr);
      }
    }

    // Update the last analysis timestamp
    console.log(`🔍 PainPoints Service: Successfully stored ${successCount} of ${clusters.length} clusters`);
    await updateLastAnalysisTimestamp();
    console.log("🔍 PainPoints Service: Clusters stored successfully")

    return successCount > 0;
  } catch (error) {
    console.error('❌ Error storing pain point clusters:', error);
    return false;
  }
}

/**
 * Get cached pain point clusters from the database
 */
async function getCachedPainPointClusters() {
  console.log("🔍 PainPoints Service: getCachedPainPointClusters called")
  try {
    const { data, error } = await supabase
      .from('pain_point_clusters')
      .select('*')
      .order('count', { ascending: false });

    if (error) {
      console.error('❌ Error fetching cached clusters:', error);
      return null;
    }

    console.log(`🔍 PainPoints Service: Retrieved ${data.length} cached clusters`)
    
    // Parse the examples JSON back to objects
    console.log("🔍 PainPoints Service: Parsing examples JSON")
    try {
      return data.map(cluster => ({
        ...cluster,
        examples: cluster.examples ? JSON.parse(cluster.examples) : []
      }));
    } catch (parseError) {
      console.error('❌ Error parsing cluster examples JSON:', parseError);
      // Return clusters without examples as fallback
      return data.map(cluster => ({
        ...cluster,
        examples: []
      }));
    }
  } catch (error) {
    console.error('❌ Error retrieving cached clusters:', error);
    return null;
  }
}

/**
 * Check if there are new pain points since the last analysis
 */
async function shouldRefreshClusters() {
  try {
    // Get the latest pain point creation time
    const { data: latestPainPoint, error: painPointError } = await supabase
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
    const { data: lastAnalysis, error: metaError } = await supabase
      .from('meta_data')
      .select('value')
      .eq('key', 'last_pain_point_analysis')
      .maybeSingle();

    if (metaError) {
      console.log("🔍 PainPoints Service: Error fetching meta_data:", metaError);
      return true; // No record found, should refresh
    }

    if (!lastAnalysis) {
      console.log("🔍 PainPoints Service: No last_pain_point_analysis found in meta_data");
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
    console.log("🔍 PainPoints Service: Updating last analysis timestamp to", timestamp);
    
    // Check if record exists
    try {
      const { data, error: checkError } = await supabase
        .from('meta_data')
        .select('*')
        .eq('key', 'last_pain_point_analysis')
        .maybeSingle();
      
      if (checkError) {
        console.error('❌ Error checking meta_data:', checkError);
        // Try to insert anyway
        await insertMetaData(timestamp);
        return;
      }
      
      if (data) {
        console.log("🔍 PainPoints Service: Updating existing meta_data record");
        // Update existing record
        const { error } = await supabase
          .from('meta_data')
          .update({ value: timestamp })
          .eq('key', 'last_pain_point_analysis');
          
        if (error) {
          console.error('❌ Error updating last analysis timestamp:', error);
          // If update fails, try to insert
          await insertMetaData(timestamp);
        } else {
          console.log("✅ Last analysis timestamp updated successfully");
        }
      } else {
        // No record exists, insert new one
        await insertMetaData(timestamp);
      }
    } catch (error) {
      console.error('❌ Error in updateLastAnalysisTimestamp:', error);
      // Try to insert anyway
      await insertMetaData(timestamp);
    }
  } catch (error) {
    console.error('❌ Error updating analysis timestamp:', error);
  }
}

/**
 * Helper function to insert a new record in meta_data
 */
async function insertMetaData(timestamp: string) {
  try {
    console.log("🔍 PainPoints Service: Creating new meta_data record");
    const { data, error } = await supabase
      .from('meta_data')
      .insert({ key: 'last_pain_point_analysis', value: timestamp })
      .select();
      
    if (error) {
      console.error('❌ Error inserting last analysis timestamp:', error);
    } else {
      console.log("✅ New meta_data record created successfully");
    }
  } catch (error) {
    console.error('❌ Error in insertMetaData:', error);
  }
}

/**
 * Get the timestamp of the last clustering analysis
 */
export async function getLastClusterAnalysisTime() {
  try {
    console.log("🔍 PainPoints Service: Getting last cluster analysis time");
    const { data, error } = await supabase
      .from('meta_data')
      .select('value')
      .eq('key', 'last_pain_point_analysis')
      .maybeSingle();
    
    if (error) {
      console.error('❌ Error fetching last analysis time:', error);
      return null;
    }
    
    if (!data) {
      console.log("🔍 PainPoints Service: No last_pain_point_analysis found in meta_data");
      return null;
    }
    
    console.log("🔍 PainPoints Service: Found last analysis time:", data.value);
    return data.value;
  } catch (error) {
    console.error('❌ Error fetching last analysis time:', error);
    return null;
  }
} 