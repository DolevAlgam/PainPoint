"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { getAllPainPoints, getMostCommonPainPoints } from "@/lib/services/pain-points"
import { getCompanies } from "@/lib/services/companies"
import { useAuth } from "@/lib/auth-context"
import { Loader2, Search, Download } from "lucide-react"

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
  const [filteredPainPoints, setFilteredPainPoints] = useState<any[]>([])

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#8DD1E1']
  
  useEffect(() => {
    async function loadData() {
      if (user) {
        setLoading(true)
        try {
          const [painPointsData, commonPainPointsData, companiesData] = await Promise.all([
            getAllPainPoints(),
            getMostCommonPainPoints(10),
            getCompanies()
          ])
          
          setAllPainPoints(painPointsData)
          setFilteredPainPoints(painPointsData)
          setCommonPainPoints(commonPainPointsData)
          setCompanies(companiesData)
        } catch (error) {
          console.error("Error loading insights data:", error)
        } finally {
          setLoading(false)
        }
      }
    }
    
    loadData()
  }, [user])
  
  useEffect(() => {
    // Apply filters to pain points
    let filtered = [...allPainPoints]
    
    if (filters.industry && filters.industry !== 'all_industries') {
      filtered = filtered.filter(pp => 
        pp.meetings?.companies?.industry?.toLowerCase() === filters.industry.toLowerCase()
      )
    }
    
    if (filters.company && filters.company !== 'all_companies') {
      filtered = filtered.filter(pp => 
        pp.meetings?.companies?.id === filters.company
      )
    }
    
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(pp => 
        pp.title.toLowerCase().includes(query) || 
        pp.description.toLowerCase().includes(query) ||
        pp.root_cause.toLowerCase().includes(query)
      )
    }
    
    setFilteredPainPoints(filtered)
  }, [filters, allPainPoints])

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }))
  }
  
  // Prepare data for impact distribution chart
  const prepareImpactData = () => {
    const impactCount = { High: 0, Medium: 0, Low: 0 }
    
    filteredPainPoints.forEach(pp => {
      impactCount[pp.impact as keyof typeof impactCount] += 1
    })
    
    return Object.entries(impactCount).map(([name, value]) => ({ name, value }))
  }
  
  // Prepare data for top pain points chart
  const prepareTopPainPointsData = () => {
    const painPointCounts: Record<string, number> = {}
    
    filteredPainPoints.forEach(pp => {
      const title = pp.title.toLowerCase()
      painPointCounts[title] = (painPointCounts[title] || 0) + 1
    })
    
    return Object.entries(painPointCounts)
      .map(([name, value]) => ({ name, count: value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
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
        <h2 className="text-3xl font-bold tracking-tight">Insights</h2>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Insights
        </Button>
      </div>

      <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
        <Card className="w-full md:w-2/3">
          <CardHeader>
            <CardTitle>Pain Point Analysis</CardTitle>
            <CardDescription>Analyze common pain points across your discovery calls</CardDescription>
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="list">
              <TabsList className="mb-4">
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="charts">Charts</TabsTrigger>
              </TabsList>
              
              <TabsContent value="list" className="space-y-4">
                {filteredPainPoints.length === 0 ? (
                  <div className="text-center py-10">
                    <p>No pain points match your filters. Try adjusting your criteria.</p>
                  </div>
                ) : (
                  filteredPainPoints.map((painPoint, index) => (
                    <div key={index} className="border rounded-md p-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-medium">{painPoint.title}</h3>
                        <Badge className={
                          painPoint.impact === "High" 
                            ? "bg-red-50 text-red-700 border-red-200" 
                            : painPoint.impact === "Medium"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                        }>
                          {painPoint.impact} Impact
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{painPoint.description}</p>
                      <div className="mt-3 text-sm">
                        <span className="font-medium">Root Cause:</span> {painPoint.root_cause}
                      </div>
                      {painPoint.meetings && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          From meeting with {painPoint.meetings.contacts?.name} at {painPoint.meetings.companies?.name}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>
              
              <TabsContent value="charts">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Impact Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={prepareImpactData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {prepareImpactData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Top Pain Points</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={prepareTopPainPointsData()}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="w-full md:w-1/3">
          <CardHeader>
            <CardTitle>Most Common Pain Points</CardTitle>
            <CardDescription>
              Frequently mentioned issues across all meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {commonPainPoints.length === 0 ? (
                <div className="text-center py-10">
                  <p>No common pain points found yet.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Continue conducting and analyzing discovery calls to build insights.
                  </p>
                </div>
              ) : (
                commonPainPoints.map((painPoint, index) => (
                  <div key={index} className="border rounded-md p-3">
                    <div className="flex justify-between">
                      <h3 className="font-medium text-sm">{painPoint.title}</h3>
                      <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5">
                        {painPoint.count} mentions
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {painPoint.industries.map((industry: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

