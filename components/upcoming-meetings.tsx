import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock } from "lucide-react"
import Link from "next/link"

interface Meeting {
  id: string;
  date: string;
  time: string;
  contacts: {
    name: string;
  };
  companies: {
    name: string;
  };
}

interface UpcomingMeetingsProps {
  meetings: Meeting[];
}

export function UpcomingMeetings({ meetings }: UpcomingMeetingsProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Upcoming Meetings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {meetings.map((meeting) => {
            const meetingDate = new Date(`${meeting.date}T${meeting.time}`);
            return (
              <Link key={meeting.id} href={`/meetings/${meeting.id}`} className="block">
                <div className="flex items-start space-x-3 rounded-md border p-3 transition-colors hover:bg-muted">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium leading-none">{meeting.contacts?.name}</p>
                    <p className="text-sm text-muted-foreground">{meeting.companies?.name}</p>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {meetingDate.toLocaleDateString()} at{" "}
                      {meetingDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
          {meetings.length === 0 && <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>}
        </div>
      </CardContent>
    </Card>
  )
}

