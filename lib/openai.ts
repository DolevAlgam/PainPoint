// This file handles the OpenAI API integration for transcription and analysis
import OpenAI from "openai";

// The maximum size OpenAI can process per request (25MB)
const MAX_OPENAI_CHUNK_SIZE = 25 * 1024 * 1024;

// Function to split an audio file into chunks below the OpenAI size limit
async function splitAudioIntoChunks(file: File): Promise<File[]> {
  if (file.size <= MAX_OPENAI_CHUNK_SIZE) {
    return [file]; // No need to split
  }

  // For MVP simplicity, we'll just use simple blob slicing
  // In a production app, you'd use a more sophisticated audio chunking method
  // that ensures proper audio boundaries
  
  const totalChunks = Math.ceil(file.size / (MAX_OPENAI_CHUNK_SIZE * 0.95)); // 0.95 to leave some buffer
  let chunks: File[] = [];
  
  // Create a reasonable overlap to avoid cutting off words at chunk boundaries
  // Each chunk will overlap with the next by ~5% of the max size
  const chunkSize = Math.floor(MAX_OPENAI_CHUNK_SIZE * 0.95);
  const overlap = Math.floor(MAX_OPENAI_CHUNK_SIZE * 0.05);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i === 0 ? 0 : i * chunkSize - overlap;
    const end = Math.min((i + 1) * chunkSize, file.size);
    
    const blobChunk = file.slice(start, end, file.type);
    const chunkName = `${file.name.split('.')[0]}_part${i+1}.${file.name.split('.').pop()}`;
    chunks.push(new File([blobChunk], chunkName, { type: file.type }));
  }
  
  return chunks;
}

export async function transcribeAudio(file: File, apiKey: string): Promise<string> {
  try {
    // Split file into chunks if needed
    const chunks = await splitAudioIntoChunks(file);
    
    // If only one chunk, use the existing method
    if (chunks.length === 1) {
      return await transcribeSingleChunk(chunks[0], apiKey);
    }
    
    // Otherwise, transcribe each chunk and combine the results
    const transcriptions = await Promise.all(
      chunks.map(async (chunk, index) => {
        return await transcribeSingleChunk(chunk, apiKey);
      })
    );
    
    // Join all transcriptions with a space separator
    return transcriptions.join(' ');
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

// This handles the actual API call to OpenAI
async function transcribeSingleChunk(file: File, apiKey: string): Promise<string> {
  try {
    // Create a FormData object to send the file
    const formData = new FormData()
    formData.append("file", file)
    formData.append("model", "gpt-4o-transcribe")
    formData.append("language", "en")
    formData.append("response_format", "json")

    // Make the API request
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return data.text
  } catch (error) {
    console.error(`Error transcribing chunk: ${error}`)
    throw error
  }
}

export async function analyzePainPoints(transcript: string, apiKey: string): Promise<any> {
  // 1. Initialize the OpenAI client
  const openai = new OpenAI({ 
    apiKey,
    dangerouslyAllowBrowser: true  // Allow usage in browser environments
  });

  try {
    /**
     * First Call: Get a rough/plain text analysis.
     * Adjust the prompt and roles as needed for your use case.
     */
    const roughAnalysisResponse = await openai.responses.create({
      model: "o1",
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: `Analyze the transcript of a discovery, exploration, and pain meeting between an early-stage startup founder and a potential Ideal Customer Profile (ICP). 

# Your Task
Extract the pain points and challenges discussed by the potential ICP, with supporting evidence from the transcript.

# Requirements
1. For each pain point:
   - Identify the core issue/challenge as a SHORT, concise title
   - Provide a FULL description of the pain point
   - Include DIRECT QUOTES from the transcript that support this pain point
   - ONLY extract root causes that are EXPLICITLY mentioned (don't infer them)
   - ONLY note impact levels (High/Medium/Low) if EXPLICITLY stated (don't guess)

2. DO NOT invent, infer, or assume information that isn't directly stated in the transcript.

3. For each finding, include exact quotes from the transcript as citations. These should be verbatim snippets that clearly show:
   - The pain point being described
   - Any explicit mention of root causes
   - Any explicit mention of impact level

# Output Format
For each pain point, provide:
1. A short, descriptive title (4-8 words)
2. A full description of the pain point
3. Direct transcript citations for the pain point (exact quotes)
4. Root cause (ONLY if explicitly stated, otherwise indicate "Not explicitly mentioned")
5. Impact level (ONLY if explicitly stated as High/Medium/Low, otherwise indicate "Not explicitly mentioned")

TRANSCRIPT:
${transcript}`
            }
          ]
        }
      ],
      // Return plain text
      text: {
        format: { type: "text" }
      },
      reasoning: { effort: "high" },
      tools: [],
      store: false
    });

    /**
     * Extract the rough analysis text.
     * The o1 model puts the analysis in output_text
     */
    const roughAnalysisText = 
      (roughAnalysisResponse as any).output_text || 
      // Try content path for message content
      ((roughAnalysisResponse as any).output?.[1]?.content?.[0]?.text) ||
      // Fallback
      "No rough analysis text returned.";
    

    /**
     * Second Call: Request a strict JSON response with a defined schema.
     * We feed the rough analysis text into the system prompt, so GPT
     * can refine it into a JSON structure matching your schema.
     */
    const structuredJsonResponse = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `Structure the analysis into JSON, focusing on pain points with their citations, root causes (if explicitly mentioned), and impact levels (if explicitly mentioned).

Here is the rough analysis text to reference. You MUST use ONLY these pain points and not make up anything:
${roughAnalysisText}

# JSON Output Requirements
- Return only valid JSON
- Follow this schema precisely:
  - pain_points: array of objects, each with:
    - title: Short, concise title of the pain point (5-10 words max)
    - description: Full description of the pain point
    - citations: Array of direct quotes from the transcript that support this pain point
    - root_cause: If explicitly mentioned in the transcript, include as a string. Otherwise, use null.
    - impact: If explicitly mentioned as "High", "Medium", or "Low", include as a string. Otherwise, use null.

# IMPORTANT RULES:
1. Include DIRECT citations/quotes from the transcript
2. For root_cause: You MUST include this field but set it to null if not explicitly stated
3. For impact: You MUST include this field but set it to null if not clearly stated as High/Medium/Low
4. Keep titles short and descriptive
5. Use the EXACT pain points from the analysis text above - do not create generic examples
`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pain_points",
          strict: true,
          schema: {
            type: "object",
            properties: {
              pain_points: {
                type: "array",
                description: "A list of identified pain points.",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description: "Short, concise title of the pain point (5-10 words max)."
                    },
                    description: {
                      type: "string", 
                      description: "Full description of the pain point."
                    },
                    citations: {
                      type: "array",
                      description: "Direct quotes from the transcript that support this pain point.",
                      items: {
                        type: "string"
                      }
                    },
                    root_cause: {
                      type: ["string", "null"],
                      description: "Root cause, ONLY if explicitly mentioned in the transcript."
                    },
                    impact: {
                      type: ["string", "null"],
                      description: "Impact level (High/Medium/Low), ONLY if explicitly mentioned."
                    }
                  },
                  required: ["title", "description", "citations", "root_cause", "impact"],
                  additionalProperties: false
                }
              }
            },
            required: ["pain_points"],
            additionalProperties: false
          }
        }
      },
      reasoning: {},
      tools: [],
      temperature: 0.2, // Low temperature for more deterministic output
      max_output_tokens: 10000,
      top_p: 1,
      store: false
    });

    // The second call returns a structured JSON response
    // We need to extract just the pain_points array from the response for compatibility with existing code
    let painPoints = [];
    
    try {
      // For OpenAI API responses
      if (structuredJsonResponse && typeof structuredJsonResponse === 'object') {
        // First try to get the output_text which has the JSON string
        const outputText = (structuredJsonResponse as any).output_text;
        
        if (outputText && typeof outputText === 'string') {
          try {
            // Parse the JSON string
            const parsedData = JSON.parse(outputText);
            painPoints = parsedData.pain_points || [];
          } catch (e) {
            console.error("Error parsing output_text JSON:", e);
          }
        } 
        // If no output_text or parsing failed, try other formats
        else {
          // Try to access the content property
          if ((structuredJsonResponse as any).output?.[0]?.content?.[0]?.text) {
            try {
              const contentText = (structuredJsonResponse as any).output[0].content[0].text;
              const parsedData = JSON.parse(contentText);
              painPoints = parsedData.pain_points || [];
            } catch (e) {
              console.error("Error parsing content text:", e);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error extracting pain points from response:", e);
    }
    
    
    // Transform the pain points to match the expected database schema
    const transformedPainPoints = Array.isArray(painPoints) ? painPoints.map(point => {
      // Ensure root_cause is a string even if null in the original
      const rootCause = point.root_cause !== null && typeof point.root_cause === 'string' && point.root_cause.trim() !== ''
        ? point.root_cause
        : "Not explicitly mentioned";

      // Ensure impact has a valid value
      const impact = point.impact !== null && typeof point.impact === 'string' &&
        ['High', 'Medium', 'Low'].includes(point.impact)
        ? point.impact
        : "Not explicitly mentioned"; // Default to indicate that impact was not specified

      // Join citations into a single string
      const citations = Array.isArray(point.citations) 
        ? point.citations.join("\n\n") 
        : "";

      // Create an object with the correct field names for the database
      return {
        title: point.title || "Unspecified Pain Point",
        description: point.description || point.title || "Unspecified Pain Point",
        rootCause: rootCause,        // camelCase for the service
        impact: impact,              // same field name
        citations: citations         // same field name
      };
    }) : [];
    
    // Triple-check our transformed data before returning
    // Filter out any items with null properties
    const safeTransformedPainPoints = transformedPainPoints.filter(point => {
      const hasValidProps = 
        point.title && 
        typeof point.title === 'string' && 
        point.description && 
        typeof point.description === 'string' &&
        point.rootCause && 
        typeof point.rootCause === 'string' &&
        point.impact && 
        typeof point.impact === 'string';
      
      if (!hasValidProps) {
        console.warn('Filtering out invalid pain point:', point);
      }
      
      return hasValidProps;
    });
    
    
    // Return the safe transformed points that match the database schema
    return safeTransformedPainPoints;
  } catch (error) {
    console.error("Analysis error:", error);
    throw error;
  }
}

// Translation function for future implementation
export async function translateAudio(file: File, apiKey: string): Promise<string> {
  try {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("model", "whisper-1")
    formData.append("prompt", "Translate to English")

    const response = await fetch("https://api.openai.com/v1/audio/translations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return data.text
  } catch (error) {
    console.error("Translation error:", error)
    throw error
  }
}

