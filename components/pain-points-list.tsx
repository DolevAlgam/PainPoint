import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { BarChart2 } from "lucide-react"

export function PainPointsList({
  searchTerm,
  industry,
  role,
}: {
  searchTerm: string
  industry: string
  role: string
}) {
  const painPoints = [
    {
      id: "1",
      name: "Integration Complexity",
      count: 8,
      companies: ["Acme Inc.", "Tech Solutions", "Digital First"],
      rootCause: "Manual configuration process",
      impact: "High",
      industries: ["Software", "Technology"],
      roles: ["CTO", "CIO"],
    },
    {
      id: "2",
      name: "Onboarding Time",
      count: 6,
      companies: ["Growth Ventures", "Innovate LLC"],
      rootCause: "Lack of automation in the integration process",
      impact: "High",
      industries: ["SaaS", "Technology"],
      roles: ["COO", "Product Manager"],
    },
    {
      id: "3",
      name: "Resource Allocation",
      count: 5,
      companies: ["Acme Inc.", "Digital First"],
      rootCause: "Manual configuration requires dedicated staff",
      impact: "Medium",
      industries: ["Software", "Media"],
      roles: ["CTO", "COO"],
    },
    {
      id: "4",
      name: "Data Synchronization",
      count: 5,
      companies: ["Tech Solutions", "Startup Hub"],
      rootCause: "Inconsistent data mapping between systems",
      impact: "High",
      industries: ["Technology", "Finance"],
      roles: ["CTO", "CIO"],
    },
    {
      id: "5",
      name: "Error Handling",
      count: 4,
      companies: ["Innovate LLC", "Growth Ventures"],
      rootCause: "Lack of robust error recovery mechanisms",
      impact: "Medium",
      industries: ["SaaS", "Finance"],
      roles: ["CTO", "Product Manager"],
    },
    {
      id: "6",
      name: "Customization Limits",
      count: 3,
      companies: ["Digital First", "Startup Hub"],
      rootCause: "Rigid system architecture",
      impact: "Low",
      industries: ["Media", "Technology"],
      roles: ["Product Manager", "CEO"],
    },
  ]

  // Filter pain points based on search term and filters
  const filteredPainPoints = painPoints.filter((painPoint) => {
    const matchesSearch =
      searchTerm === "" ||
      painPoint.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      painPoint.rootCause.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesIndustry =
      industry === "all" || painPoint.industries.some((ind) => ind.toLowerCase() === industry.toLowerCase())

    const matchesRole = role === "all" || painPoint.roles.some((r) => r.toLowerCase() === role.toLowerCase())

    return matchesSearch && matchesIndustry && matchesRole
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pain Points Insights</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pain Point</TableHead>
                <TableHead>Mentions</TableHead>
                <TableHead>Root Cause</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Companies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPainPoints.map((painPoint) => (
                <TableRow key={painPoint.id}>
                  <TableCell className="font-medium">{painPoint.name}</TableCell>
                  <TableCell>{painPoint.count}</TableCell>
                  <TableCell>{painPoint.rootCause}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        painPoint.impact === "High"
                          ? "destructive"
                          : painPoint.impact === "Medium"
                            ? "default"
                            : "outline"
                      }
                    >
                      {painPoint.impact}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {painPoint.companies.map((company, index) => (
                        <Badge key={index} variant="outline">
                          {company}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredPainPoints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <BarChart2 className="h-12 w-12 mb-2" />
                      <p>No pain points match your filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

