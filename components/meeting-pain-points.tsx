"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { BarChart2, Plus, Save, Trash2, Download } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { exportMeetingPainPoints } from "@/lib/utils"

export function MeetingPainPoints({ meetingId }: { meetingId: string }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [painPoints, setPainPoints] = useState([
    {
      id: "1",
      title: "Long Integration Time",
      description: "It takes approximately 2 weeks to onboard a new customer due to manual configuration steps.",
      rootCause: "Manual configuration process",
      impact: "High",
    },
    {
      id: "2",
      title: "Resource Allocation",
      description:
        "Dedicated team members are required for each integration, preventing them from working on other projects.",
      rootCause: "Lack of automation in the integration process",
      impact: "Medium",
    },
    {
      id: "3",
      title: "Data Synchronization Issues",
      description: "About 30% of integrations experience data flow problems in the first month after onboarding.",
      rootCause: "Inconsistent data mapping between systems",
      impact: "High",
    },
  ])

  const [isAddingPainPoint, setIsAddingPainPoint] = useState(false)
  const [newPainPoint, setNewPainPoint] = useState({
    title: "",
    description: "",
    rootCause: "",
    impact: "Medium",
  })

  const analyzePainPoints = () => {
    setIsAnalyzing(true)
    // In a real app, you would call your API to analyze the transcript
    setTimeout(() => {
      setPainPoints([
        {
          id: "1",
          title: "Long Integration Time",
          description: "It takes approximately 2 weeks to onboard a new customer due to manual configuration steps.",
          rootCause: "Manual configuration process",
          impact: "High",
        },
        {
          id: "2",
          title: "Resource Allocation",
          description:
            "Dedicated team members are required for each integration, preventing them from working on other projects.",
          rootCause: "Lack of automation in the integration process",
          impact: "Medium",
        },
        {
          id: "3",
          title: "Data Synchronization Issues",
          description: "About 30% of integrations experience data flow problems in the first month after onboarding.",
          rootCause: "Inconsistent data mapping between systems",
          impact: "High",
        },
      ])
      setIsAnalyzing(false)
    }, 2000)
  }

  const addPainPoint = () => {
    if (newPainPoint.title && newPainPoint.description) {
      setPainPoints([
        ...painPoints,
        {
          id: Date.now().toString(),
          ...newPainPoint,
        },
      ])
      setNewPainPoint({
        title: "",
        description: "",
        rootCause: "",
        impact: "Medium",
      })
      setIsAddingPainPoint(false)
    }
  }

  const removePainPoint = (id: string) => {
    setPainPoints(painPoints.filter((pp) => pp.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pain Points Analysis</CardTitle>
            <CardDescription>Identified pain points from the conversation</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isAddingPainPoint ? "outline" : "default"}
              onClick={() => setIsAddingPainPoint(!isAddingPainPoint)}
            >
              {isAddingPainPoint ? "Cancel" : <Plus className="mr-2 h-4 w-4" />}
              {isAddingPainPoint ? "" : "Add Pain Point"}
            </Button>
            <Button size="sm" variant="outline" onClick={analyzePainPoints} disabled={isAnalyzing}>
              <BarChart2 className="mr-2 h-4 w-4" />
              {isAnalyzing ? "Analyzing..." : "Analyze Transcript"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isAddingPainPoint && (
          <div className="mb-4 rounded-md border p-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="mb-2 block text-sm font-medium">
                  Title
                </label>
                <Input
                  id="title"
                  value={newPainPoint.title}
                  onChange={(e) => setNewPainPoint({ ...newPainPoint, title: e.target.value })}
                  placeholder="Enter pain point title"
                />
              </div>
              <div>
                <label htmlFor="description" className="mb-2 block text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="description"
                  value={newPainPoint.description}
                  onChange={(e) =>
                    setNewPainPoint({
                      ...newPainPoint,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the pain point"
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="rootCause" className="mb-2 block text-sm font-medium">
                  Root Cause
                </label>
                <Input
                  id="rootCause"
                  value={newPainPoint.rootCause}
                  onChange={(e) =>
                    setNewPainPoint({
                      ...newPainPoint,
                      rootCause: e.target.value,
                    })
                  }
                  placeholder="Enter root cause"
                />
              </div>
              <div>
                <label htmlFor="impact" className="mb-2 block text-sm font-medium">
                  Impact
                </label>
                <select
                  id="impact"
                  value={newPainPoint.impact}
                  onChange={(e) =>
                    setNewPainPoint({
                      ...newPainPoint,
                      impact: e.target.value,
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddingPainPoint(false)}>
                  Cancel
                </Button>
                <Button onClick={addPainPoint}>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {painPoints.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {painPoints.map((painPoint) => (
              <AccordionItem key={painPoint.id} value={painPoint.id}>
                <AccordionTrigger className="group">
                  <div className="flex items-center gap-2">
                    <span>{painPoint.title}</span>
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mr-4 hidden group-hover:flex"
                    onClick={(e) => {
                      e.stopPropagation()
                      removePainPoint(painPoint.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 px-4 py-2">
                    <div>
                      <h4 className="text-sm font-medium">Description</h4>
                      <p className="text-sm text-muted-foreground">{painPoint.description}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">Root Cause</h4>
                      <p className="text-sm text-muted-foreground">{painPoint.rootCause}</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 rounded-md border p-8">
            <BarChart2 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-medium">No Pain Points Identified</h3>
              <p className="text-sm text-muted-foreground">
                Analyze the transcript to identify pain points or add them manually.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={analyzePainPoints} disabled={isAnalyzing}>
                <BarChart2 className="mr-2 h-4 w-4" />
                {isAnalyzing ? "Analyzing..." : "Analyze Transcript"}
              </Button>
              <Button variant="outline" onClick={() => setIsAddingPainPoint(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Manually
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      {painPoints.length > 0 && (
        <CardFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => exportMeetingPainPoints(painPoints, `Meeting-${meetingId}`)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Pain Points
          </Button>
          <Button onClick={analyzePainPoints} disabled={isAnalyzing}>
            <BarChart2 className="mr-2 h-4 w-4" />
            {isAnalyzing ? "Reanalyzing..." : "Reanalyze Transcript"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

