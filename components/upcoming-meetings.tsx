import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUpcomingMeetings } from "@/lib/services/meetings"
import { useEffect, useState } from "react"
import { Calendar, Clock } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"

export function UpcomingMeetings() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUpcomingMeetings = async () => {
      try {
        const data = await getUpcomingMeetings()
        setMeetings(data.slice(0, 5))
      } catch (error) {
        console.error("Error fetching upcoming meetings:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchUpcomingMeetings()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Meetings</CardTitle>
      </CardHeader>
      <CardContent>
        {meetings.length > 0 ? (
          <div className="space-y-4">
            {meetings.map((meeting) => {
              const meetingDate = new Date(`${meeting.date}T${meeting.time}`);
              return (
                <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
                  <div className="flex items-center space-x-4 rounded-md border p-4 transition-all hover:bg-accent">
                    <div className="flex-shrink-0 rounded-md bg-primary/10 p-1">
                      <Calendar className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="font-medium leading-none">{meeting.contacts?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(meetingDate, "PPP")} at{" "}
                        {format(meetingDate, "h:mm a")}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="flex h-[150px] items-center justify-center text-muted-foreground">
            {loading ? "Loading..." : "No upcoming meetings scheduled."}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

