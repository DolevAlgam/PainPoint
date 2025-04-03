"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, FileText } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export function ContactMeetings({ contactId }: { contactId: string }) {
  // This would be fetched from your API in a real application
  const meetings = [
    {
      id: "1",
      date: "2025-03-30T10:00:00",
      status: "Completed",
      hasTranscript: true,
      summary: "Discussed integration challenges and potential solutions.",
    },
    {
      id: "2",
      date: "2025-03-15T14:30:00",
      status: "Completed",
      hasTranscript: true,
      summary: "Initial discovery call about pain points in current workflow.",
    },
    {
      id: "3",
      date: "2025-04-10T11:00:00",
      status: "Planned",
      hasTranscript: false,
      summary: "Follow-up on proposed solutions.",
    },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Meeting History</CardTitle>
          <CardDescription>Past and upcoming meetings with this contact</CardDescription>
        </div>
        <Button asChild size="sm">
          <Link href={`/meetings/new?contactId=${contactId}`}>
            <Calendar className="mr-2 h-4 w-4" />
            Schedule Meeting
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {meetings.map((meeting) => {
            const meetingDate = new Date(meeting.date)
            return (
              <Link key={meeting.id} href={`/meetings/${meeting.id}`} className="block">
                <div className="flex items-start space-x-3 rounded-md border p-3 transition-colors hover:bg-muted">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    {meeting.hasTranscript ? (
                      <FileText className="h-5 w-5 text-primary" />
                    ) : (
                      <Calendar className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium leading-none">{meetingDate.toLocaleDateString()}</p>
                      <Badge variant={meeting.status === "Completed" ? "default" : "secondary"}>{meeting.status}</Badge>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {meetingDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <p className="text-sm text-muted-foreground">{meeting.summary}</p>
                  </div>
                </div>
              </Link>
            )
          })}
          {meetings.length === 0 && (
            <p className="text-sm text-muted-foreground">No meetings scheduled with this contact yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

