import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart2 } from "lucide-react"
import Link from "next/link"

interface PainPoint {
  title: string;
  count: number;
  companies: string[];
}

interface CommonPainPointsProps {
  painPoints: PainPoint[];
}

export function CommonPainPoints({ painPoints }: CommonPainPointsProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Most Common Pain Points</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {painPoints.map((painPoint, index) => (
            <Link key={index} href={`/insights?painPoint=${encodeURIComponent(painPoint.title)}`} className="block">
              <div className="flex items-start space-x-3 rounded-md border p-3 transition-colors hover:bg-muted">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <BarChart2 className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium leading-none">{painPoint.title}</p>
                  <p className="text-sm text-muted-foreground">Mentioned {painPoint.count} times</p>
                  <div className="flex flex-wrap gap-1">
                    {painPoint.companies.slice(0, 2).map((company, index) => (
                      <span key={index} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {company}
                      </span>
                    ))}
                    {painPoint.companies.length > 2 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        +{painPoint.companies.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {painPoints.length === 0 && (
            <p className="text-sm text-muted-foreground">No common pain points identified yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

