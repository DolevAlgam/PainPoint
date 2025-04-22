"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const openai_1 = __importDefault(require("openai"));
// Create a Supabase client with the service role key for admin access
const adminSupabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const handler = async (event) => {
    for (const record of event.Records) {
        try {
            console.log('Processing SQS message:', record.body);
            const message = JSON.parse(record.body);
            const { transcriptId, meetingId, userId } = message;
            if (!transcriptId || !meetingId || !userId) {
                console.error('Missing required parameters in SQS message');
                continue;
            }
            await processAnalysisInBackground(transcriptId, meetingId, userId);
        }
        catch (error) {
            console.error('Error processing SQS message:', error);
        }
    }
};
exports.handler = handler;
async function processAnalysisInBackground(transcriptId, meetingId, userId) {
    try {
        // Get the transcript content
        const { data: transcript, error: transcriptError } = await adminSupabase
            .from('transcripts')
            .select('content')
            .eq('id', transcriptId)
            .single();
        if (transcriptError || !transcript) {
            console.error('Error fetching transcript:', transcriptError);
            throw new Error(`Transcript not found: ${(transcriptError === null || transcriptError === void 0 ? void 0 : transcriptError.message) || 'Unknown error'}`);
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
        if (!(userSettings === null || userSettings === void 0 ? void 0 : userSettings.openai_api_key)) {
            throw new Error('No OpenAI API key found in user settings. Please add your API key in settings.');
        }
        const apiKey = userSettings.openai_api_key;
        // Update the meeting to show analysis has started
        await adminSupabase
            .from('meetings')
            .update({
            analysis_status: 'in_progress'
        })
            .eq('id', meetingId);
        // Analyze the transcript using OpenAI
        const painPointsData = await analyzePainPoints(transcript.content, apiKey);
        // First, delete all existing pain points for this meeting
        const { error: deleteError } = await adminSupabase
            .from('pain_points')
            .delete()
            .eq('meeting_id', meetingId);
        if (deleteError) {
            console.error('Error deleting existing pain points:', deleteError);
            throw new Error(`Failed to delete existing pain points: ${deleteError.message}`);
        }
        // Create pain points in the database
        const painPoints = painPointsData.map((pp) => ({
            meeting_id: meetingId,
            title: pp.title,
            description: pp.description,
            root_cause: pp.rootCause,
            impact: pp.impact,
            user_id: userId,
            citations: pp.citations || null
        }));
        const { error: createError } = await adminSupabase
            .from('pain_points')
            .insert(painPoints);
        if (createError) {
            console.error('Error creating pain points:', createError);
            await adminSupabase
                .from('meetings')
                .update({
                analysis_status: 'failed',
                analysis_error: createError.message
            })
                .eq('id', meetingId);
            return;
        }
        // Update the meeting status
        await adminSupabase
            .from('meetings')
            .update({
            has_analysis: true,
            status: 'analyzed',
            analysis_status: 'completed',
            analysis_outdated: false
        })
            .eq('id', meetingId);
        console.log(`Analysis completed successfully for meeting: ${meetingId}`);
    }
    catch (error) {
        console.error('Background analysis error:', error);
        // Update the meeting to show analysis failed
        await adminSupabase
            .from('meetings')
            .update({
            analysis_status: 'failed',
            analysis_error: error.message
        })
            .eq('id', meetingId);
    }
}
// Analyze pain points from transcript
async function analyzePainPoints(transcript, apiKey) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // 1. Initialize the OpenAI client
    const openai = new openai_1.default({
        apiKey
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
5. Impact level (ONLY if Impact is referenced by ICP, and you can classify it as High/Medium/Low, otherwise indicate "Not explicitly mentioned")

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
        const roughAnalysisText = roughAnalysisResponse.output_text ||
            // Try content path for message content
            ((_d = (_c = (_b = (_a = roughAnalysisResponse.output) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text) ||
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
                const outputText = structuredJsonResponse.output_text;
                if (outputText && typeof outputText === 'string') {
                    try {
                        // Parse the JSON string
                        const parsedData = JSON.parse(outputText);
                        painPoints = parsedData.pain_points || [];
                    }
                    catch (e) {
                        console.error("Error parsing output_text JSON:", e);
                    }
                }
                // If no output_text or parsing failed, try other formats
                else {
                    // Try to access the content property
                    if ((_h = (_g = (_f = (_e = structuredJsonResponse.output) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.content) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.text) {
                        try {
                            const contentText = structuredJsonResponse.output[0].content[0].text;
                            const parsedData = JSON.parse(contentText);
                            painPoints = parsedData.pain_points || [];
                        }
                        catch (e) {
                            console.error("Error parsing content text:", e);
                        }
                    }
                }
            }
        }
        catch (e) {
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
                rootCause: rootCause, // camelCase for the service
                impact: impact, // same field name
                citations: citations // same field name
            };
        }) : [];
        // Triple-check our transformed data before returning
        // Filter out any items with null properties
        const safeTransformedPainPoints = transformedPainPoints.filter(point => {
            const hasValidProps = point.title &&
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
    }
    catch (error) {
        console.error("Analysis error:", error);
        throw error;
    }
}
