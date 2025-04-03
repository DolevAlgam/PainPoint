import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Calendar, FileText, BarChart2 } from "lucide-react"

interface DashboardMetricsProps {
  metrics: {
    contacts: { total: number; weeklyChange: number };
    meetings: { total: number; weeklyChange: number };
    transcripts: { total: number; weeklyChange: number };
    painPoints: { total: number; weeklyChange: number };
  };
}

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.contacts.total}</div>
          <p className="text-xs text-muted-foreground">+{metrics.contacts.weeklyChange} from last week</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.meetings.total}</div>
          <p className="text-xs text-muted-foreground">+{metrics.meetings.weeklyChange} from last week</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transcripts</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.transcripts.total}</div>
          <p className="text-xs text-muted-foreground">+{metrics.transcripts.weeklyChange} from last week</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pain Points</CardTitle>
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.painPoints.total}</div>
          <p className="text-xs text-muted-foreground">+{metrics.painPoints.weeklyChange} from last week</p>
        </CardContent>
      </Card>
    </div>
  )
}

