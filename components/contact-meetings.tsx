"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, FileText } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { getMeetingsByContactId, type Meeting } from "@/lib/services/meetings"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"

export function ContactMeetings({ contactId }: { contactId: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMeetings = async () => {
      setLoading(true)
      try {
        const data = await getMeetingsByContactId(contactId)
        setMeetings(data)
      } catch (error) {
        console.error("Error loading meetings:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [contactId])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meeting History</CardTitle>
          <CardDescription>Past and upcoming meetings with this contact</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start space-x-3 rounded-md border p-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-2 w-full">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting History</CardTitle>
        <CardDescription>Past and upcoming meetings with this contact</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {meetings.map((meeting) => {
            const meetingDate = new Date(meeting.date)
            return (
              <Link key={meeting.id} href={`/meetings/${meeting.id}`} className="block">
                <div className="flex items-start space-x-3 rounded-md border p-3 transition-colors hover:bg-muted">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    {meeting.has_transcript ? (
                      <FileText className="h-5 w-5 text-primary" />
                    ) : (
                      <Calendar className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium leading-none">{format(meetingDate, "PP")}</p>
                      <Badge variant={meeting.status === "completed" || meeting.status === "analyzed" ? "default" : "secondary"}>
                        {meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {meeting.time}
                    </div>
                    <p className="text-sm text-muted-foreground">{meeting.notes || "No meeting notes available"}</p>
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

