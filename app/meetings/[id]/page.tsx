"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { getMeeting, updateMeeting } from "@/lib/services/meetings"
import { getRecordings, getRecording } from "@/lib/services/recordings"
import { getTranscripts, generateTranscript } from "@/lib/services/transcripts"
import { getPainPoints } from "@/lib/services/pain-points"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import { FileAudio, Play, FileText, BrainCircuit, ArrowLeft, Upload, Loader2, AlertCircle } from "lucide-react"
import Link from "next/link"
import RecordingUploader from "@/components/recording-uploader"
import { Textarea } from "@/components/ui/textarea"
import { getRecordingURL } from "@/lib/services/recordings"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { supabase } from "@/lib/supabase"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip"

export default function MeetingDetailPage() {
  const params = useParams()
  const meetingId = params.id as string
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  
  const [meeting, setMeeting] = useState<any>(null)
  const [recordings, setRecordings] = useState<any[]>([])
  const [transcripts, setTranscripts] = useState<any[]>([])
  const [painPoints, setPainPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentTab, setCurrentTab] = useState("details")
  
  const [showUploader, setShowUploader] = useState(false)
  const [isGeneratingTranscript, setIsGeneratingTranscript] = useState(false)
  const [isAnalyzingTranscript, setIsAnalyzingTranscript] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<string | null>(null)
  const [showApiKeyError, setShowApiKeyError] = useState(false)
  const [showTranscriptTool, setShowTranscriptTool] = useState(false)
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null)
  const [transcriptPollingInterval, setTranscriptPollingInterval] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function loadMeetingData() {
      if (!user || !meetingId) return

      setLoading(true)
      try {
        const [meetingData, recordingsData, transcriptsData, painPointsData] = await Promise.all([
          getMeeting(meetingId),
          getRecordings(meetingId),
          getTranscripts(meetingId),
          getPainPoints(meetingId)
        ])
        
        setMeeting(meetingData)
        setRecordings(recordingsData)
        setTranscripts(transcriptsData)
        setPainPoints(painPointsData)
      } catch (error) {
        console.error("Error loading meeting data:", error)
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load meeting data"
        })
      } finally {
        setLoading(false)
      }
    }
    
    loadMeetingData()
  }, [meetingId, user, toast])

  const handleRecordingUploaded = async (recording: any) => {
    // Replace all recordings with just the new one instead of appending
    setRecordings([recording])
    setShowUploader(false)
    
    // Update meeting with outdated flags immediately
    if (meeting) {
      const hasExistingTranscript = meeting.has_transcript;
      const hasExistingAnalysis = meeting.has_analysis;
      
      setMeeting({ 
        ...meeting, 
        has_recording: true, 
        status: 'completed',
        transcript_outdated: hasExistingTranscript ? true : false,
        analysis_outdated: hasExistingAnalysis ? true : false
      })
    }
    
    toast({
      title: "Recording uploaded",
      description: "Your recording has been uploaded successfully"
    })
  }

  const handleGenerateTranscript = async (recordingId: string) => {
    if (!meeting || !user) return;
    
    // Ensure all IDs are strings
    const recordingIdStr = String(recordingId);
    const meetingIdStr = String(meeting.id);
    const userIdStr = String(user.id);
    
    setIsGeneratingTranscript(true);

    try {
      // First verify the recording exists and get fresh data
      const freshRecording = await getRecording(recordingIdStr);
      if (!freshRecording) {
        setIsGeneratingTranscript(false);
        toast({
          variant: "destructive",
          title: "Recording not found",
          description: "The recording information could not be found. Try refreshing the page or uploading again."
        });
        return;
      }
      
      // Call the generateTranscript function with properly formatted IDs
      const transcript = await generateTranscript(recordingIdStr, meetingIdStr, userIdStr);
      
      if (transcript) {
        // Start polling for transcript status updates
        startPollingTranscriptStatus(transcript.id);
        
        // Update UI state
        setShowTranscriptTool(true);
        setSelectedTranscriptId(transcript.id);
        
        toast({
          title: "Transcription started",
          description: "The recording is being transcribed. This may take a few minutes for larger files.",
        });
      }
    } catch (error: any) {
      console.error("Error generating transcript:", error);
      
      // Format detailed error message for display
      let errorMessage = error.message || "An error occurred during transcription";
      
      // Check for specific error types
      if (errorMessage.includes('not found')) {
        toast({
          variant: "destructive",
          title: "Recording not found",
          description: "Please try refreshing the page and trying again."
        });
      }
      else if (errorMessage.includes('OpenAI API')) {
        toast({
          variant: "destructive", 
          title: "OpenAI API Error",
          description: "There was an issue with the OpenAI transcription service. Check your API key in settings."
        });
        
        setShowApiKeyError(true);
      }
      else {
        toast({
          variant: "destructive",
          title: "Transcription error",
          description: errorMessage,
          action: (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleGenerateTranscript(recordingId)}
            >
              Retry
            </Button>
          )
        });
      }
      
      setIsGeneratingTranscript(false);
    }
  };

  const startPollingTranscriptStatus = (transcriptId: string) => {
    // Poll every 5 seconds to check transcription status
    const intervalId = setInterval(async () => {
      try {
        const { data: transcript } = await supabase
          .from('transcripts')
          .select('content')
          .eq('id', transcriptId)
          .single();
        
        if (transcript) {
          // Only consider transcription complete when it doesn't have any of these progress markers
          const inProgressMarkers = [
            "Transcription in progress",
            "Transcribing segment",
            "Processing audio",
            "Converting audio"
          ];
          
          const isStillInProgress = inProgressMarkers.some(marker => 
            transcript.content.includes(marker)
          );
          
          if (!isStillInProgress) {
            clearInterval(intervalId);
            setIsGeneratingTranscript(false);
            
            // Switch to transcript tab after transcription is complete
            setCurrentTab("transcript");
            
            toast({
              title: "Transcription completed",
              description: "The recording has been successfully transcribed."
            });
            
            // Refresh data from the server to get updated meeting status
            const updatedMeeting = await getMeeting(meetingId);
            if (updatedMeeting) {
              setMeeting(updatedMeeting);
            }
            
            // Refresh the transcripts list
            const updatedTranscripts = await getTranscripts(meeting.id);
            setTranscripts(updatedTranscripts);
          } else {
            // Still in progress, ensure the generating flag stays true
            setIsGeneratingTranscript(true);
          }
        }
      } catch (error) {
        console.error("Error checking transcript status:", error);
      }
    }, 5000);
    
    // Store the interval ID for cleanup
    setTranscriptPollingInterval(intervalId);
  };

  // Add this function to poll for analysis status
  const checkAnalysisStatus = async () => {
    if (!meeting) return;
    
    try {
      const { data: updatedMeeting, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meeting.id)
        .single();
        
      if (error) throw error;
      
      if (updatedMeeting) {
        // Update meeting state
        setMeeting(updatedMeeting);
        
        // If analysis is completed, refresh pain points
        if (updatedMeeting.analysis_status === 'completed') {
          const updatedPainPoints = await getPainPoints(meeting.id);
          setPainPoints(updatedPainPoints);
          
          toast({
            title: "Analysis complete",
            description: "Pain points have been extracted from your transcript"
          });
          
          // Stop polling
          return true;
        } 
        // If analysis failed, show error
        else if (updatedMeeting.analysis_status === 'failed') {
          toast({
            variant: "destructive",
            title: "Analysis failed",
            description: updatedMeeting.analysis_error || "An error occurred during analysis"
          });
          
          // Stop polling
          return true;
        }
      }
      
      // Continue polling
      return false;
    } catch (error) {
      console.error("Error checking analysis status:", error);
      // Continue polling even on error
      return false;
    }
  };

  const handleAnalyzeTranscript = async (transcriptId: string) => {
    if (!user || !meeting) return;
    
    setIsAnalyzingTranscript(true);
    
    try {
      // Call the backend API endpoint
      const response = await fetch('/api/analyze-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcriptId,
          meetingId: meeting.id,
          userId: user.id
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze transcript');
      }
      
      // Analysis started successfully
      toast({
        title: "Analysis started",
        description: "Your transcript is being analyzed. This may take a minute."
      });
      
      // Update local state to show analysis is in progress
      setMeeting({
        ...meeting,
        analysis_status: 'in_progress'
      });
      
      // Switch to pain points tab to show status
      setCurrentTab("painpoints");
      
      // Don't reset isAnalyzingTranscript until polling is complete
      // This is to ensure the UI shows that analysis is in progress
      
      // Start polling for completion (every 5 seconds)
      const pollInterval = setInterval(async () => {
        const isComplete = await checkAnalysisStatus();
        if (isComplete) {
          clearInterval(pollInterval);
          setIsAnalyzingTranscript(false);
        }
      }, 5000);
      
      // Clear interval after 10 minutes maximum (safety cleanup)
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsAnalyzingTranscript(false);
      }, 10 * 60 * 1000);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error starting analysis",
        description: error.message || "An error occurred"
      });
      setIsAnalyzingTranscript(false);
    }
  };

  const playRecording = async (recordingId: string) => {
    const recording = recordings.find(r => r.id === recordingId)
    if (!recording) return
    
    try {
      const url = await getRecordingURL(recording.file_path)
      
      if (url) {
        setCurrentAudio(url)
      } else {
        throw new Error("Failed to get recording URL")
      }
    } catch (error) {
      console.error("Error playing recording:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not play recording. Please try again."
      })
    }
  }

  useEffect(() => {
    if (showApiKeyError) {
      const timer = setTimeout(() => {
        toast({
          title: "Go to Settings",
          description: "Add your OpenAI API key in the settings page",
          action: (
            <Button variant="default" size="sm" onClick={() => router.push('/settings')}>
              Settings
            </Button>
          ),
        });
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [showApiKeyError, router, toast]);

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (transcriptPollingInterval) {
        clearInterval(transcriptPollingInterval);
      }
    };
  }, [transcriptPollingInterval]);

  // Add this function near the top of the component
  const getImpactBadgeClass = (impact: string) => {
    if (impact === "High") return "bg-red-50 text-red-700 border-red-200";
    if (impact === "Medium") return "bg-amber-50 text-amber-700 border-amber-200";
    if (impact === "Low") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/meetings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Meeting Not Found</h2>
        </div>
        <p>The meeting you're looking for doesn't exist or you don't have permission to view it.</p>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Scheduled</Badge>
      case "completed":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Completed</Badge>
      case "analyzed":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Analyzed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" asChild>
          <Link href="/meetings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Meeting Details</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">
                  {meeting.contacts?.name} at {meeting.companies?.name}
                </CardTitle>
                <CardDescription>
                  {format(new Date(meeting.date), "PPPP")} at {meeting.time.substring(0, 5)}
                </CardDescription>
              </div>
              <div>{getStatusBadge(meeting.status)}</div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={currentTab} onValueChange={setCurrentTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="painpoints">Pain Points</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="mt-6">
                <div className="space-y-6">
                  {meeting.notes && (
                    <div className="space-y-2">
                      <h3 className="text-lg font-medium">Meeting Notes</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{meeting.notes}</p>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Recordings</h3>
                      <Button size="sm" onClick={() => setShowUploader(true)} disabled={showUploader}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Recording
                      </Button>
                    </div>
                    
                    {showApiKeyError && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>OpenAI API Key Required</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2">
                          <p>To generate transcripts, you need to add your OpenAI API key in settings.</p>
                          <div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => router.push('/settings')}
                            >
                              Go to Settings
                            </Button>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {showUploader && (
                      <RecordingUploader 
                        meetingId={meetingId} 
                        onUploadComplete={handleRecordingUploaded}
                        onCancel={() => setShowUploader(false)}
                      />
                    )}
                    
                    {recordings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recordings available.</p>
                    ) : (
                      <div className="space-y-3">
                        {recordings.map((recording) => (
                          <div key={recording.id} className="flex items-center justify-between p-3 border rounded-md">
                            <div className="flex items-center gap-2">
                              <FileAudio className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{recording.file_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(recording.created_at), "PP")}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => playRecording(recording.id)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              {!meeting.has_transcript && (
                                <Button 
                                  size="sm"
                                  onClick={() => handleGenerateTranscript(recording.id)}
                                  disabled={isGeneratingTranscript}
                                >
                                  {isGeneratingTranscript ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Generating...
                                    </>
                                  ) : (
                                    <>
                                      <FileText className="mr-2 h-4 w-4" />
                                      Generate Transcript
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {currentAudio && (
                          <div className="mt-4">
                            <audio 
                              controls 
                              className="w-full" 
                              src={currentAudio}
                              onEnded={() => setCurrentAudio(null)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="transcript" className="mt-6">
                {transcripts.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-medium">No Transcript Available</h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                      Upload a recording and generate a transcript to see it here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {meeting.transcript_outdated && (
                      <Alert variant="destructive" className="mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Transcript Outdated</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2">
                          <p>This transcript is from a previous recording. Regenerate it for the new recording.</p>
                          <div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => recordings.length > 0 && handleGenerateTranscript(recordings[0].id)}
                              disabled={isGeneratingTranscript || recordings.length === 0}
                            >
                              {isGeneratingTranscript ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Regenerating...
                                </>
                              ) : (
                                <>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Regenerate Transcript
                                </>
                              )}
                            </Button>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Transcript</h3>
                      {!meeting.has_analysis && !meeting.transcript_outdated && (
                        <Button 
                          onClick={() => handleAnalyzeTranscript(transcripts[0].id)}
                          disabled={isAnalyzingTranscript}
                        >
                          {isAnalyzingTranscript ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <BrainCircuit className="mr-2 h-4 w-4" />
                              Analyze Transcript
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="p-4 border rounded-md bg-muted/30 max-h-96 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{transcripts[0].content}</p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="painpoints" className="mt-6">
                {painPoints.length === 0 ? (
                  <div className="text-center py-10">
                    {meeting.analysis_status === 'in_progress' ? (
                      <>
                        <Loader2 className="mx-auto h-12 w-12 animate-spin text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">Analysis in Progress</h3>
                        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                          Your transcript is being analyzed to identify pain points. 
                          This may take a minute. You can leave this page and come back later.
                        </p>
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No Pain Points Identified</h3>
                        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                          Generate a transcript and analyze it to identify pain points.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {meeting.analysis_status === 'in_progress' && (
                      <Alert className="bg-amber-50 border-amber-200">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-700 mr-2" />
                        <AlertTitle className="text-amber-700">Analysis in Progress</AlertTitle>
                        <AlertDescription className="text-amber-700">
                          Your transcript is being reanalyzed. This may take a minute. 
                          The existing pain points will be updated once analysis completes.
                        </AlertDescription>
                      </Alert>
                    )}
                    {meeting.analysis_outdated && (
                      <Alert variant="destructive" className="mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Analysis Outdated</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2">
                          <p>This analysis is from a previous recording. Regenerate the transcript first, then analyze again.</p>
                          <div>
                            {meeting.transcript_outdated ? (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => recordings.length > 0 && handleGenerateTranscript(recordings[0].id)}
                                disabled={isGeneratingTranscript || recordings.length === 0}
                              >
                                {isGeneratingTranscript ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Regenerating Transcript...
                                  </>
                                ) : (
                                  <>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Regenerate Transcript First
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => transcripts.length > 0 && handleAnalyzeTranscript(transcripts[0].id)}
                                disabled={isAnalyzingTranscript || transcripts.length === 0 || isGeneratingTranscript}
                              >
                                {isAnalyzingTranscript ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Reanalyzing...
                                  </>
                                ) : isGeneratingTranscript ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Waiting for Transcript...
                                  </>
                                ) : (
                                  <>
                                    <BrainCircuit className="mr-2 h-4 w-4" />
                                    Reanalyze Transcript
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Identified Pain Points</h3>
                    </div>
                    <div className="grid gap-4">
                      {painPoints.map((painPoint, index) => (
                        <Card key={index}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-center">
                              <CardTitle>{painPoint.title}</CardTitle>
                              <TooltipProvider>
                                <Tooltip delayDuration={100}>
                                  <TooltipTrigger asChild>
                                    <Badge className={getImpactBadgeClass(painPoint.impact)}>
                                      {painPoint.impact}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Impact</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0 space-y-4">
                            <div>
                              <h4 className="text-sm font-medium">Description</h4>
                              <p className="text-sm text-muted-foreground">{painPoint.description}</p>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium">Root Cause</h4>
                              <p className="text-sm text-muted-foreground">{painPoint.root_cause}</p>
                            </div>
                            {painPoint.citations && (
                              <div>
                                <h4 className="text-sm font-medium">Citations</h4>
                                <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded-md border border-gray-100 mt-1 whitespace-pre-wrap">
                                  {painPoint.citations}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium">Name</h3>
                <p className="text-sm">{meeting.contacts?.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Email</h3>
                <p className="text-sm">{meeting.contacts?.email}</p>
              </div>
              {meeting.contacts?.phone && (
                <div>
                  <h3 className="text-sm font-medium">Phone</h3>
                  <p className="text-sm">{meeting.contacts?.phone}</p>
                </div>
              )}
              <div>
                <h3 className="text-sm font-medium">Role</h3>
                <p className="text-sm">{meeting.contacts?.role}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Company</h3>
                <p className="text-sm">{meeting.companies?.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Industry</h3>
                <p className="text-sm">{meeting.companies?.industry}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Meeting Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <h3 className="text-sm font-medium">Recording</h3>
                  <Badge variant={meeting.has_recording ? "default" : "outline"}>
                    {meeting.has_recording ? "Available" : "Not Available"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <h3 className="text-sm font-medium">Transcript</h3>
                  <Badge variant={meeting.has_transcript ? "default" : "outline"}>
                    {meeting.has_transcript ? "Available" : "Not Available"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <h3 className="text-sm font-medium">Pain Point Analysis</h3>
                  <Badge variant={meeting.has_analysis ? "default" : "outline"}>
                    {meeting.has_analysis ? "Completed" : "Not Started"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

