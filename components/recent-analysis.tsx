import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText } from "lucide-react"
import Link from "next/link"

interface Analysis {
  id: string;
  date: string;
  contactName: string;
  company: string;
  painPoints: number;
}

interface RecentAnalysisProps {
  analysis: Analysis[];
}

export function RecentAnalysis({ analysis }: RecentAnalysisProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Recently Analyzed Conversations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {analysis.map((item) => (
            <Link key={item.id} href={`/meetings/${item.id}`} className="block">
              <div className="flex items-start space-x-3 rounded-md border p-3 transition-colors hover:bg-muted">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium leading-none">{item.contactName}</p>
                  <p className="text-sm text-muted-foreground">{item.company}</p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <span className="mr-2">{item.date}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {item.painPoints} pain points
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {analysis.length === 0 && <p className="text-sm text-muted-foreground">No analyzed conversations yet.</p>}
        </div>
      </CardContent>
    </Card>
  )
}

