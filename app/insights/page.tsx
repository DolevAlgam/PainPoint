"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Treemap
} from "recharts"
import { getAllPainPoints, getLastClusterAnalysisTime } from "@/lib/services/pain-points"
import { getCompanies } from "@/lib/services/companies"
import { useAuth } from "@/lib/auth-context"
import { Loader2, Search, Download, ArrowRight, ChevronDown, ChevronUp, X, RefreshCw, AlertTriangle, Calendar, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format, formatDistanceToNow } from "date-fns"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { exportInsightsToExcel } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"

export default function InsightsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [allPainPoints, setAllPainPoints] = useState<any[]>([])
  const [commonPainPoints, setCommonPainPoints] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [filters, setFilters] = useState({
    industry: "all_industries",
    company: "all_companies",
    searchQuery: ""
  })
  const [filteredClusters, setFilteredClusters] = useState<any[]>([])
  const [selectedCluster, setSelectedCluster] = useState<any>(null)
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [lastAnalysisTime, setLastAnalysisTime] = useState<string | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [apiKeyMissing, setApiKeyMissing] = useState(false)
  const [clustersFetched, setClustersFetched] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#8DD1E1', '#82ca9d', '#ffc658', '#8884d8', '#83a6ed']
  
  useEffect(() => {
    async function loadData() {
      if (user) {
        console.log("🔍 Insights: Starting to load data")
        setLoading(true)
        setApiKeyMissing(false)
        try {
          console.log("🔍 Insights: Fetching pain points and companies")
          const [painPointsData, companiesData, lastAnalysisTimeData] = await Promise.all([
            getAllPainPoints(),
            getCompanies(),
            getLastClusterAnalysisTime()
          ])
          
          console.log(`🔍 Insights: Received ${painPointsData.length} pain points and ${companiesData.length} companies`)
          setAllPainPoints(painPointsData)
          setCompanies(companiesData)
          
          // Check if there's an in-progress analysis from localStorage
          const analysisInProgress = localStorage.getItem('pain_points_analysis_in_progress') === 'true'
          
          if (analysisInProgress) {
            console.log("🔍 Insights: Analysis in progress detected from previous session")
            setAnalysisRunning(true)
            setAnalysisStatus('in_progress')
            startPollingForResults()
            
            // If we also have last analysis data, load it as a fallback while waiting
            if (lastAnalysisTimeData) {
              setLastAnalysisTime(lastAnalysisTimeData)
              // Load cached results but show "in progress" status
              const { data: clusters } = await supabase
                .from('pain_point_clusters')
                .select('*')
                .order('count', { ascending: false })
                
              if (clusters && clusters.length > 0) {
                // Parse the examples JSON back to objects
                const parsedClusters = clusters.map(cluster => ({
                  ...cluster,
                  examples: cluster.examples ? JSON.parse(cluster.examples) : []
                }))
                
                setCommonPainPoints(parsedClusters)
                setFilteredClusters(parsedClusters)
                setClustersFetched(true)
              }
            }
          } 
          // If no analysis in progress but we have a last analysis timestamp, load clusters 
          else if (lastAnalysisTimeData) {
            console.log("🔍 Insights: Last analysis time found, loading clusters automatically")
            setLastAnalysisTime(lastAnalysisTimeData)
            // Load the clusters without forcing a refresh
            await loadCommonPainPoints(false)
          } else {
            console.log("🔍 Insights: No last analysis time found, skipping automatic cluster loading")
          }
          
        } catch (error) {
          console.error("❌ Error loading insights data:", error)
          // Check if the error is related to missing API key
          if (error instanceof Error && error.message.includes('OpenAI API key not found')) {
            setApiKeyMissing(true)
          }
        } finally {
          console.log("🔍 Insights: Finished loading data")
          setLoading(false)
        }
      }
    }
    
    loadData()
  }, [user])
  
  // Function to load common pain points with AI
  async function loadCommonPainPoints(forceRefresh = false) {
    console.log(`🔍 Insights: loadCommonPainPoints called with forceRefresh=${forceRefresh}`)
    
    setAnalysisRunning(true)
    setApiKeyMissing(false)
    setAnalysisStatus('starting')
    
    try {
      // First check for cached results if not forcing refresh
      if (!forceRefresh) {
        const response = await fetch('/api/analyze-common-pain-points', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user?.id,
            forceRefresh: false
          })
        })
        
        const result = await response.json()
        
        if (!response.ok) {
          if (response.status === 400 && result.error?.includes('OpenAI API key')) {
            setApiKeyMissing(true)
          }
          throw new Error(result.error || 'Failed to get pain point clusters')
        }
        
        // If we got cached results with no need to refresh, use them
        if (result.clusters?.length > 0 && !result.needsRefresh) {
          console.log(`🔍 Insights: Received cached clusters: ${result.clusters.length}`)
          setCommonPainPoints(result.clusters)
          setFilteredClusters(result.clusters)
          setLastAnalysisTime(result.lastUpdated)
          setNeedsRefresh(result.needsRefresh)
          setClustersFetched(true)
          setAnalysisRunning(false)
          return
        }
        
        // If we have cached results but need refresh and forceRefresh is false,
        // still display the cached results but indicate refresh is needed
        if (result.clusters?.length > 0 && result.needsRefresh && !forceRefresh) {
          console.log(`🔍 Insights: Using stale cached clusters: ${result.clusters.length}`)
          setCommonPainPoints(result.clusters)
          setFilteredClusters(result.clusters)
          setLastAnalysisTime(result.lastUpdated)
          setNeedsRefresh(true)
          setClustersFetched(true)
          setAnalysisRunning(false)
          return
        }
      }
      
      // Call the API to start the analysis
      const response = await fetch('/api/analyze-common-pain-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          forceRefresh: true
        })
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        if (response.status === 400 && result.error?.includes('OpenAI API key')) {
          setApiKeyMissing(true)
        }
        throw new Error(result.error || 'Failed to start pain point analysis')
      }
      
      // Analysis started successfully
      toast({
        title: "Analysis started",
        description: "Come back in a minute to see the results. You can leave this page in the meantime."
      })
      
      // Store analysis in progress status in localStorage so it persists across page loads
      localStorage.setItem('pain_points_analysis_in_progress', 'true')
      
      // Start polling for results
      setAnalysisStatus('in_progress')
      startPollingForResults()
      
    } catch (error) {
      console.error("❌ Error analyzing common pain points:", error)
      if (error instanceof Error && error.message.includes('OpenAI API key not found')) {
        setApiKeyMissing(true)
      }
      setAnalysisStatus('failed')
      setAnalysisRunning(false)
      
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "An error occurred"
      })
    }
  }
  
  // Function to poll for analysis results
  const startPollingForResults = () => {
    // Clear any existing polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }
    
    // Poll every 5 seconds
    const intervalId = setInterval(async () => {
      try {
        // Check for cached results - fixed count query
        const { data: clusters } = await supabase
          .from('pain_point_clusters')
          .select('id')
        
        // If we have results, get them
        if (clusters && clusters.length > 0) {
          // Get the last analysis time to check if it's recent
          const { data: meta } = await supabase
            .from('meta_data')
            .select('value')
            .eq('key', 'last_pain_point_analysis')
            .maybeSingle()
          
          if (meta && meta.value) {
            const lastAnalysisTime = new Date(meta.value)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
            
            // If analysis was done in the last 5 minutes, consider it complete
            if (lastAnalysisTime > fiveMinutesAgo) {
              // Get the actual clusters
              const { data: fullClusters } = await supabase
                .from('pain_point_clusters')
                .select('*')
                .order('count', { ascending: false })
              
              if (fullClusters && fullClusters.length > 0) {
                // Parse the examples JSON back to objects
                const parsedClusters = fullClusters.map(cluster => ({
                  ...cluster,
                  examples: cluster.examples ? JSON.parse(cluster.examples) : []
                }))
                
                setCommonPainPoints(parsedClusters)
                setFilteredClusters(parsedClusters)
                setLastAnalysisTime(meta.value)
                setNeedsRefresh(false)
                setClustersFetched(true)
                setAnalysisStatus('completed')
                
                // Clear the interval
                clearInterval(intervalId)
                setPollingInterval(null)
                setAnalysisRunning(false)
                
                // Remove the localStorage flag
                localStorage.removeItem('pain_points_analysis_in_progress')
                
                // Add a toast notification to inform the user
                toast({
                  title: "Analysis complete",
                  description: "Pain points have been clustered and are ready to view"
                })
              }
            }
          }
        }
      } catch (error) {
        console.error('Error polling for analysis results:', error)
      }
    }, 5000)
    
    // Store the interval ID for cleanup
    setPollingInterval(intervalId)
    
    // Safety cleanup after 10 minutes
    setTimeout(() => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
        setPollingInterval(null)
        setAnalysisRunning(false)
        setAnalysisStatus('timeout')
        
        // Remove the localStorage flag
        localStorage.removeItem('pain_points_analysis_in_progress')
        
        // Add these lines for timeout handling
        toast({
          variant: "destructive",
          title: "Analysis timed out",
          description: "The analysis is taking longer than expected. Please try again."
        })
      }
    }, 10 * 60 * 1000)
  }

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])
  
  useEffect(() => {
    // Apply filters to pain point clusters
    if (commonPainPoints.length === 0) return
    
    let filtered = [...commonPainPoints]
    
    if (filters.industry && filters.industry !== 'all_industries') {
      filtered = filtered.filter(cluster => 
        cluster.industries.some((industry: string) => 
          industry.toLowerCase() === filters.industry.toLowerCase()
        )
      )
    }
    
    if (filters.company && filters.company !== 'all_companies') {
      filtered = filtered.filter(cluster => 
        cluster.companies.some((company: string) => {
          // Find the company object to get the name
          const companyObj = companies.find(c => c.id === filters.company)
          return companyObj ? company === companyObj.name : false
        })
      )
    }
    
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(cluster => 
        cluster.cluster_name.toLowerCase().includes(query) || 
        cluster.description.toLowerCase().includes(query) ||
        cluster.examples?.some((example: any) => 
          example.title?.toLowerCase().includes(query) || 
          example.description?.toLowerCase().includes(query) ||
          example.root_cause?.toLowerCase().includes(query)
        )
      )
    }
    
    setFilteredClusters(filtered)
    
    // Reset selected cluster if it's no longer in filtered results
    if (selectedCluster && !filtered.find(c => c.cluster_name === selectedCluster.cluster_name)) {
      setSelectedCluster(null)
    }
  }, [filters, commonPainPoints, companies])

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }))
  }
  
  // Format a date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    try {
      const date = new Date(dateString)
      return format(date, 'MMM d, yyyy h:mm a')
    } catch (e) {
      return 'Invalid date'
    }
  }
  
  // Get relative time (e.g. "2 days ago")
  const getRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never'
    try {
      const date = new Date(dateString)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch (e) {
      return 'Unknown'
    }
  }
  
  // Prepare data for impact distribution chart
  const prepareImpactData = (cluster: any) => {
    if (!cluster || !cluster.impact_summary) return []
    
    return Object.entries(cluster.impact_summary)
      .filter(([name, value]) => name !== 'Unknown' && (value as number) > 0)
      .map(([name, value]) => ({ name, value }))
  }
  
  // Prepare data for the treemap visualization
  const prepareTreemapData = () => {
    return filteredClusters.map(cluster => ({
      name: cluster.cluster_name,
      size: cluster.count,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    }))
  }
  
  // Get unique industries from all companies
  const getUniqueIndustries = () => {
    const uniqueIndustries = new Set<string>()
    companies.forEach(company => {
      if (company.industry) {
        uniqueIndustries.add(company.industry)
      }
    })
    return Array.from(uniqueIndustries)
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pain Points Insights</h2>
          {lastAnalysisTime && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center">
              <Calendar className="h-3 w-3 mr-1" />
              Last analyzed: {getRelativeTime(lastAnalysisTime)} ({formatDate(lastAnalysisTime)})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            variant={needsRefresh ? "default" : "outline"} 
            onClick={() => loadCommonPainPoints(true)}
            disabled={analysisRunning}
          >
            {analysisRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {analysisStatus === 'starting' ? 'Starting Analysis...' : 'Analysis In Progress...'}
              </>
            ) : needsRefresh ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Update Analysis
              </>
            ) : clustersFetched ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run AI Analysis Again
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Run AI Analysis
              </>
            )}
          </Button>
          <Button 
            variant="outline"
            onClick={() => exportInsightsToExcel(filteredClusters)}
            disabled={filteredClusters.length === 0 || analysisRunning}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Insights
          </Button>
        </div>
      </div>

      {needsRefresh && !analysisRunning && (
        <Alert className="bg-amber-50 text-amber-800 border-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analysis needs updating</AlertTitle>
          <AlertDescription>
            New pain points have been added since the last analysis. 
            Click "Update Analysis" to include them in your insights.
          </AlertDescription>
        </Alert>
      )}

      {apiKeyMissing && (
        <Alert className="bg-red-50 text-red-800 border-red-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>OpenAI API Key Required</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              To use AI-powered clustering features, you need to add your OpenAI API key in settings.
              Without an API key, we can't analyze and group your pain points.
            </p>
            <div>
              <Button asChild variant="outline" className="mt-2 border-red-300 hover:bg-red-100">
                <a href="/settings">Go to Settings</a>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Common Pain Points Analysis</CardTitle>
            <CardDescription>
              AI-powered analysis of common pain points across all customer meetings
            </CardDescription>
            <div className="flex flex-wrap gap-2 mt-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search pain points..."
                  className="pl-8"
                  value={filters.searchQuery}
                  onChange={(e) => handleFilterChange("searchQuery", e.target.value)}
                />
                {filters.searchQuery && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-0 top-0 h-9 w-9 rounded-l-none p-0"
                    onClick={() => handleFilterChange("searchQuery", "")}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Clear</span>
                  </Button>
                )}
              </div>
              <div className="flex-1 min-w-[200px]">
                <Select
                  value={filters.industry}
                  onValueChange={(value) => handleFilterChange("industry", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_industries">All Industries</SelectItem>
                    {getUniqueIndustries().map((industry) => (
                      <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Select
                  value={filters.company}
                  onValueChange={(value) => handleFilterChange("company", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_companies">All Companies</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {analysisRunning ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-center text-muted-foreground">
                  {analysisStatus === 'starting' && 'Starting pain point analysis...'}
                  {analysisStatus === 'in_progress' && 'Analyzing all pain points to identify common themes...'}
                  {(!analysisStatus || analysisStatus === '') && 'Analyzing pain points...'}
                </p>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  This may take a minute as we're using advanced AI to cluster similar issues.
                  You can leave this page and come back later.
                </p>
              </div>
            ) : apiKeyMissing ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertTriangle className="h-8 w-8 text-red-500 mb-4" />
                <p className="text-center font-medium">
                  OpenAI API Key is required for pain point clustering
                </p>
                <p className="text-center text-sm text-muted-foreground mt-2 max-w-md">
                  Please add your OpenAI API key in the settings to enable AI-powered analysis of your pain points
                </p>
                <Button asChild variant="default" className="mt-4">
                  <a href="/settings">Add API Key in Settings</a>
                </Button>
              </div>
            ) : commonPainPoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="mb-6 text-gray-400">
                  <Sparkles className="h-16 w-16 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-center">AI-Powered Pain Point Analysis</h3>
                </div>
                <p className="text-center text-muted-foreground max-w-md">
                  Discover patterns across all your customer pain points using AI clustering
                </p>
                <p className="text-center text-sm text-muted-foreground mt-2 max-w-md mb-6">
                  Our AI will analyze all your pain points to identify common themes, impact levels, and patterns across different companies and industries.
                </p>
                <Button 
                  onClick={() => loadCommonPainPoints(true)}
                  disabled={analysisRunning}
                  size="lg"
                  className="gap-2"
                >
                  {analysisRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Start AI Analysis
                    </>
                  )}
                </Button>
              </div>
            ) : filteredClusters.length === 0 ? (
              <div className="text-center py-10">
                <p>No pain point clusters match your filters. Try adjusting your criteria.</p>
              </div>
            ) : (
              <Tabs defaultValue="list">
                <TabsList className="mb-4">
                  <TabsTrigger value="list">List View</TabsTrigger>
                  <TabsTrigger value="detail">Detail View</TabsTrigger>
                  <TabsTrigger value="visual">Visual View</TabsTrigger>
                </TabsList>
                
                <TabsContent value="list" className="space-y-4">
                  {filteredClusters.map((cluster, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        "border rounded-md p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                        selectedCluster?.cluster_name === cluster.cluster_name && "border-primary bg-muted/50"
                      )}
                      onClick={() => setSelectedCluster(cluster)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-2">
                          <div>
                            <h3 className="font-medium">{cluster.cluster_name}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{cluster.description}</p>
                          </div>
                        </div>
                        <Badge className="whitespace-nowrap">
                          {cluster.count} instances
                        </Badge>
                      </div>
                      
                      <div className="mt-3 flex flex-wrap gap-1">
                        {cluster.industries.slice(0, 3).map((industry: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {industry}
                          </Badge>
                        ))}
                        {cluster.industries.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{cluster.industries.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </TabsContent>
                
                <TabsContent value="detail">
                  <Accordion 
                    type="multiple" 
                    defaultValue={filteredClusters.map(cluster => cluster.cluster_name)}
                    className="space-y-4"
                  >
                    {filteredClusters.map((cluster, index) => (
                      <AccordionItem 
                        key={index} 
                        value={cluster.cluster_name} 
                        className="border rounded-md px-4"
                      >
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex justify-between items-center w-full pr-4">
                            <div className="text-left">
                              <h3 className="font-medium">{cluster.cluster_name}</h3>
                              <p className="text-sm text-muted-foreground">{cluster.description}</p>
                            </div>
                            <Badge className="ml-2 whitespace-nowrap">
                              {cluster.count} instances
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <div className="text-sm space-y-2">
                                <div>
                                  <span className="font-medium">Impact:</span>{' '}
                                  <span>
                                    {cluster.impact_summary?.High ? `${cluster.impact_summary.High} High, ` : ''}
                                    {cluster.impact_summary?.Medium ? `${cluster.impact_summary.Medium} Medium, ` : ''}
                                    {cluster.impact_summary?.Low ? `${cluster.impact_summary.Low} Low` : ''}
                                    {!cluster.impact_summary?.High && !cluster.impact_summary?.Medium && !cluster.impact_summary?.Low && 'Not specified'}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-medium">Industries:</span>{' '}
                                  <span className="text-muted-foreground">
                                    {cluster.industries.join(', ')}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-medium">Companies:</span>{' '}
                                  <span className="text-muted-foreground">
                                    {cluster.companies.join(', ')}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="mt-4">
                                <h4 className="text-sm font-medium mb-2">Impact Distribution</h4>
                                <div className="h-[150px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={prepareImpactData(cluster)}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={60}
                                        fill="#8884d8"
                                        dataKey="value"
                                      >
                                        {prepareImpactData(cluster).map((entry, index) => (
                                          <Cell 
                                            key={`cell-${index}`} 
                                            fill={
                                              entry.name === 'High' ? '#ef4444' : 
                                              entry.name === 'Medium' ? '#f97316' : 
                                              '#3b82f6'
                                            } 
                                          />
                                        ))}
                                      </Pie>
                                      <Tooltip />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="text-sm font-medium mb-2">All Pain Points</h4>
                              <ScrollArea className="h-[400px] rounded-md border p-2">
                                <div className="space-y-3 pr-3">
                                  {cluster.examples?.map((example: any, i: number) => (
                                    <div key={i} className="bg-muted/50 rounded-md p-3">
                                      <div className="flex justify-between">
                                        <p className="font-medium text-sm">{example.title}</p>
                                        {example.impact && example.impact !== 'Not explicitly mentioned' && (
                                          <Badge className={
                                            example.impact === "High" 
                                              ? "bg-red-50 text-red-700 border-red-200" 
                                              : example.impact === "Medium"
                                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                                : "bg-blue-50 text-blue-700 border-blue-200"
                                          }>
                                            {example.impact} Impact
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{example.description}</p>
                                      {example.root_cause && example.root_cause !== 'Not explicitly mentioned' && (
                                        <p className="text-xs mt-2">
                                          <span className="font-medium">Root Cause:</span> {example.root_cause}
                                        </p>
                                      )}
                                      {example.meetings && (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          From meeting with {example.meetings.contacts?.name} at {example.meetings.companies?.name}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>
                
                <TabsContent value="visual" className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-4">Pain Point Clusters by Size</h3>
                    <div className="h-[400px] border rounded-md p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                          data={prepareTreemapData()}
                          dataKey="size"
                          aspectRatio={4/3}
                          stroke="#fff"
                          fill="#8884d8"
                          onClick={(data) => {
                            const cluster = filteredClusters.find(c => c.cluster_name === data.name)
                            if (cluster) {
                              setSelectedCluster(cluster)
                            }
                          }}
                        >
                          {prepareTreemapData().map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color} 
                              cursor="pointer"
                            />
                          ))}
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-background border rounded-md shadow-md p-3">
                                    <p className="font-medium">{payload[0].payload.name}</p>
                                    <p className="text-sm">{payload[0].value} mentions</p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                        </Treemap>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Click on any box to see details for that pain point cluster
                    </p>
                  </div>
                  
                  {selectedCluster && (
                    <div className="border rounded-md p-4">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-medium">{selectedCluster.cluster_name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{selectedCluster.description}</p>
                        </div>
                        <Badge className="ml-2">
                          {selectedCluster.count} instances
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Impact Distribution</h4>
                          <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={prepareImpactData(selectedCluster)}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  dataKey="value"
                                >
                                  {prepareImpactData(selectedCluster).map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={
                                        entry.name === 'High' ? '#ef4444' : 
                                        entry.name === 'Medium' ? '#f97316' : 
                                        '#3b82f6'
                                      } 
                                    />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium mb-2">Industries Affected</h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedCluster.industries.map((industry: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {industry}
                              </Badge>
                            ))}
                          </div>
                          
                          <h4 className="text-sm font-medium mt-4 mb-2">Companies Mentioning This</h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedCluster.companies.map((company: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {company}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <h4 className="text-sm font-medium mb-2">Example Pain Points</h4>
                        <div className="space-y-2">
                          {selectedCluster.examples && selectedCluster.examples.map((example: any, i: number) => (
                            <div key={i} className="bg-muted/50 rounded-md p-3">
                              <p className="font-medium text-sm">{example.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">{example.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

