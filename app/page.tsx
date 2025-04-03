"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Upload } from "lucide-react"
import Link from "next/link"
import { DashboardMetrics } from "@/components/dashboard-metrics"
import { UpcomingMeetings } from "@/components/upcoming-meetings"
import { RecentAnalysis } from "@/components/recent-analysis"
import { CommonPainPoints } from "@/components/common-pain-points"
import { 
  getDashboardMetrics, 
  getUpcomingMeetings, 
  getRecentAnalysis, 
  getCommonPainPoints 
} from "@/lib/services/dashboard"
import { useAuth } from "@/lib/auth-context"

// Define types for dashboard data
interface Metrics {
  contacts: { total: number; weeklyChange: number };
  meetings: { total: number; weeklyChange: number };
  transcripts: { total: number; weeklyChange: number };
  painPoints: { total: number; weeklyChange: number };
}

interface UpcomingMeeting {
  id: string;
  date: string;
  time: string;
  contact_id: string;
  contacts: {
    name: string;
  };
  company_id: string;
  companies: {
    name: string;
  };
}

interface Analysis {
  id: string;
  date: string;
  contactName: string;
  company: string;
  painPoints: number;
}

interface PainPoint {
  title: string;
  count: number;
  companies: string[];
}

export default function Home() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<Metrics>({
    contacts: { total: 0, weeklyChange: 0 },
    meetings: { total: 0, weeklyChange: 0 },
    transcripts: { total: 0, weeklyChange: 0 },
    painPoints: { total: 0, weeklyChange: 0 }
  })
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([])
  const [recentAnalysis, setRecentAnalysis] = useState<Analysis[]>([])
  const [commonPainPoints, setCommonPainPoints] = useState<PainPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch dashboard data when component mounts and user is authenticated
    async function loadData() {
      if (user) {
        try {
          const [metricsData, meetingsData, analysisData, painPointsData] = await Promise.all([
            getDashboardMetrics(),
            getUpcomingMeetings(),
            getRecentAnalysis(),
            getCommonPainPoints()
          ])
          
          setMetrics(metricsData)
          setUpcomingMeetings(meetingsData)
          setRecentAnalysis(analysisData as Analysis[])
          setCommonPainPoints(painPointsData as PainPoint[])
        } catch (error) {
          console.error("Error loading dashboard data:", error)
        } finally {
          setLoading(false)
        }
      }
    }
    
    loadData()
  }, [user])

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/contacts/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Link>
            </Button>
            <Button asChild>
              <Link href="/meetings/upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload Recording
              </Link>
            </Button>
          </div>
        </div>
        <div className="h-[200px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/contacts/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Link>
          </Button>
          <Button asChild>
            <Link href="/meetings/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload Recording
            </Link>
          </Button>
        </div>
      </div>

      <DashboardMetrics metrics={metrics} />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <UpcomingMeetings meetings={upcomingMeetings} />
        <RecentAnalysis analysis={recentAnalysis} />
        <CommonPainPoints painPoints={commonPainPoints} />
      </div>
    </div>
  )
}

