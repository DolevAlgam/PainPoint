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
import { getAllPainPoints, getCommonPainPointsWithAI, getLastClusterAnalysisTime } from "@/lib/services/pain-points"
import { getCompanies } from "@/lib/services/companies"
import { useAuth } from "@/lib/auth-context"
import { Loader2, Search, Download, ArrowRight, ChevronDown, ChevronUp, X, RefreshCw, AlertTriangle, Calendar, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format, formatDistanceToNow } from "date-fns"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function InsightsPage() {
  const { user } = useAuth()
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
          
          // If we have a last analysis timestamp, clusters exist, so load them
          if (lastAnalysisTimeData) {
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
    
    try {
      console.log("🔍 Insights: Calling getCommonPainPointsWithAI")
      const result = await getCommonPainPointsWithAI(forceRefresh)
      console.log(`🔍 Insights: Received clusters: ${result.clusters.length}`)
      setCommonPainPoints(result.clusters)
      setFilteredClusters(result.clusters)
      setLastAnalysisTime(result.lastUpdated)
      setNeedsRefresh(result.needsRefresh)
      setClustersFetched(true)
      console.log("🔍 Insights: State updated with clusters data")
    } catch (error) {
      console.error("❌ Error analyzing common pain points:", error)
      if (error instanceof Error && error.message.includes('OpenAI API key not found')) {
        setApiKeyMissing(true)
      }
    } finally {
      console.log("🔍 Insights: Analysis process finished")
      setAnalysisRunning(false)
    }
  }
  
  useEffect(() => {
    // Apply filters to pain point clusters
    if (commonPainPoints.length === 0) return;
    
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
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy h:mm a');
    } catch (e) {
      return 'Invalid date';
    }
  }
  
  // Get relative time (e.g. "2 days ago")
  const getRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (e) {
      return 'Unknown';
    }
  }
  
  // Prepare data for impact distribution chart
  const prepareImpactData = (cluster: any) => {
    if (!cluster || !cluster.impact_summary) return [];
    
    return Object.entries(cluster.impact_summary)
      .filter(([name, value]) => name !== 'Unknown' && (value as number) > 0)
      .map(([name, value]) => ({ name, value }));
  }
  
  // Prepare data for the treemap visualization
  const prepareTreemapData = () => {
    return filteredClusters.map(cluster => ({
      name: cluster.cluster_name,
      size: cluster.count,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    }));
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
                Analyzing Pain Points...
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
          <Button variant="outline">
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
            </div>
          </CardHeader>
          <CardContent>
            {analysisRunning ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-center text-muted-foreground">
                  Analyzing all pain points to identify common themes...
                </p>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  This may take a minute as we're using advanced AI to cluster similar issues
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
              <Tabs defaultValue="visual">
                <TabsList className="mb-4">
                  <TabsTrigger value="visual">Visual View</TabsTrigger>
                  <TabsTrigger value="list">List View</TabsTrigger>
                  <TabsTrigger value="detail">Detail View</TabsTrigger>
                </TabsList>
                
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
                            const cluster = filteredClusters.find(c => c.cluster_name === data.name);
                            if (cluster) {
                              setSelectedCluster(cluster);
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
                                );
                              }
                              return null;
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
                          {selectedCluster.examples && selectedCluster.examples.slice(0, 3).map((example: any, i: number) => (
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
                  <Accordion type="single" collapsible className="space-y-4">
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
                              <h4 className="text-sm font-medium mb-2">Example Pain Points</h4>
                              <ScrollArea className="h-[250px] rounded-md border p-2">
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
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

