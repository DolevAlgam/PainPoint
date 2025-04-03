"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Upload } from "lucide-react"
import Link from "next/link"

export function MeetingTranscript({
  meetingId,
  hasTranscript = false,
}: {
  meetingId: string
  hasTranscript?: boolean
}) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [transcript, setTranscript] = useState(
    hasTranscript
      ? `John: Thanks for taking the time to chat today. I wanted to learn more about the challenges you're facing with your current workflow.

You: Of course, happy to share. Our biggest pain point right now is the integration process with our customers. It's taking us about 2 weeks to get a new customer fully onboarded.

John: That's quite a long time. What's causing the delay?

You: There are several manual steps involved. Our team has to manually configure each integration, and there's a lot of back-and-forth with the customer to get all the settings right. We also have to do a lot of testing to make sure everything works correctly.

You: I see. So it sounds like the manual configuration is a big bottleneck.

John: Exactly. And it's not just the time it takes, but also the resources. We have to dedicate a team member to each new integration, which means they can't work on other projects.

You: That makes sense. Are there any other challenges you're facing?

John: Well, once customers are onboarded, we still have issues with data synchronization. Sometimes the data doesn't flow correctly between systems, and we have to troubleshoot. It's frustrating for our customers and for us.

You: How often do these synchronization issues occur?

John: I'd say about 30% of our integrations have some kind of issue in the first month. After that, it's more stable, but those first few weeks can be rough.

You: That's definitely a pain point worth addressing. Is there anything else you've tried to solve these problems?

John: We've looked at some off-the-shelf solutions, but none of them quite fit our specific needs. We need something more customizable that can handle our unique workflows.`
      : "",
  )

  const generateTranscript = () => {
    setIsGenerating(true)
    // In a real app, you would call your API to generate the transcript
    setTimeout(() => {
      setTranscript(
        `John: Thanks for taking the time to chat today. I wanted to learn more about the challenges you're facing with your current workflow.

You: Of course, happy to share. Our biggest pain point right now is the integration process with our customers. It's taking us about 2 weeks to get a new customer fully onboarded.

John: That's quite a long time. What's causing the delay?

You: There are several manual steps involved. Our team has to manually configure each integration, and there's a lot of back-and-forth with the customer to get all the settings right. We also have to do a lot of testing to make sure everything works correctly.

You: I see. So it sounds like the manual configuration is a big bottleneck.

John: Exactly. And it's not just the time it takes, but also the resources. We have to dedicate a team member to each new integration, which means they can't work on other projects.

You: That makes sense. Are there any other challenges you're facing?

John: Well, once customers are onboarded, we still have issues with data synchronization. Sometimes the data doesn't flow correctly between systems, and we have to troubleshoot. It's frustrating for our customers and for us.

You: How often do these synchronization issues occur?

John: I'd say about 30% of our integrations have some kind of issue in the first month. After that, it's more stable, but those first few weeks can be rough.

You: That's definitely a pain point worth addressing. Is there anything else you've tried to solve these problems?

John: We've looked at some off-the-shelf solutions, but none of them quite fit our specific needs. We need something more customizable that can handle our unique workflows.`,
      )
      setIsGenerating(false)
    }, 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting Transcript</CardTitle>
        <CardDescription>
          {hasTranscript
            ? "Automatically generated transcript of the conversation"
            : "Upload a recording to generate a transcript"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasTranscript ? (
          <div className="max-h-[500px] overflow-y-auto rounded-md border p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm">{transcript}</pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 rounded-md border p-8">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-medium">No Transcript Available</h3>
              <p className="text-sm text-muted-foreground">
                Upload a recording to generate a transcript of your meeting.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/meetings/${meetingId}/upload`}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Recording
                </Link>
              </Button>
              <Button variant="outline" onClick={generateTranscript} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate Demo Transcript"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      {hasTranscript && (
        <CardFooter className="flex justify-between">
          <Button variant="outline">Download Transcript</Button>
          <Button onClick={generateTranscript} disabled={isGenerating}>
            {isGenerating ? "Regenerating..." : "Regenerate Transcript"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

