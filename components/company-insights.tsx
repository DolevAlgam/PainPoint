import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Building } from "lucide-react"

export function CompanyInsights({
  searchTerm,
  industry,
}: {
  searchTerm: string
  industry: string
}) {
  const companies = [
    {
      id: "1",
      name: "Acme Inc.",
      industry: "Software",
      painPoints: [
        {
          name: "Integration Complexity",
          impact: "High",
          description: "It takes approximately 2 weeks to onboard a new customer due to manual configuration steps.",
        },
        {
          name: "Resource Allocation",
          impact: "Medium",
          description:
            "Dedicated team members are required for each integration, preventing them from working on other projects.",
        },
      ],
    },
    {
      id: "2",
      name: "Tech Solutions",
      industry: "Technology",
      painPoints: [
        {
          name: "Integration Complexity",
          impact: "High",
          description: "Complex integration process requiring specialized knowledge.",
        },
        {
          name: "Data Synchronization",
          impact: "High",
          description: "About 30% of integrations experience data flow problems in the first month after onboarding.",
        },
      ],
    },
    {
      id: "3",
      name: "Innovate LLC",
      industry: "SaaS",
      painPoints: [
        {
          name: "Onboarding Time",
          impact: "High",
          description: "Long onboarding process affecting customer satisfaction.",
        },
        {
          name: "Error Handling",
          impact: "Medium",
          description: "Lack of robust error recovery mechanisms causes disruptions.",
        },
      ],
    },
    {
      id: "4",
      name: "Growth Ventures",
      industry: "Finance",
      painPoints: [
        {
          name: "Onboarding Time",
          impact: "High",
          description: "Customer onboarding takes too long, delaying time to value.",
        },
        {
          name: "Error Handling",
          impact: "Medium",
          description: "System errors during integration require manual intervention.",
        },
      ],
    },
    {
      id: "5",
      name: "Digital First",
      industry: "Media",
      painPoints: [
        {
          name: "Integration Complexity",
          impact: "High",
          description: "Integration with existing media systems is overly complex.",
        },
        {
          name: "Resource Allocation",
          impact: "Medium",
          description: "Too many resources dedicated to maintaining integrations.",
        },
        {
          name: "Customization Limits",
          impact: "Low",
          description: "Limited ability to customize the integration for specific needs.",
        },
      ],
    },
    {
      id: "6",
      name: "Startup Hub",
      industry: "Technology",
      painPoints: [
        {
          name: "Data Synchronization",
          impact: "High",
          description: "Data inconsistencies between integrated systems.",
        },
        {
          name: "Customization Limits",
          impact: "Low",
          description: "Cannot customize the solution to fit their unique workflow.",
        },
      ],
    },
  ]

  // Filter companies based on search term and industry
  const filteredCompanies = companies.filter((company) => {
    const matchesSearch =
      searchTerm === "" ||
      company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.painPoints.some((pp) => pp.name.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesIndustry = industry === "all" || company.industry.toLowerCase() === industry.toLowerCase()

    return matchesSearch && matchesIndustry
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Insights</CardTitle>
      </CardHeader>
      <CardContent>
        {filteredCompanies.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {filteredCompanies.map((company) => (
              <AccordionItem key={company.id} value={company.id}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>{company.name}</span>
                    <Badge variant="outline">{company.industry}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 p-2">
                    <h4 className="text-sm font-medium">Pain Points</h4>
                    {company.painPoints.map((painPoint, index) => (
                      <div key={index} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="font-medium">{painPoint.name}</h5>
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
                        </div>
                        <p className="text-sm text-muted-foreground">{painPoint.description}</p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Building className="h-12 w-12 mb-2" />
            <p>No companies match your filters</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

