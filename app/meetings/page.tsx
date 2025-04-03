"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CalendarPlus, Search, Upload } from "lucide-react"
import { format } from "date-fns"
import { getMeetings } from "@/lib/services/meetings"
import { useAuth } from "@/lib/auth-context"
import { Skeleton } from "@/components/ui/skeleton"

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [filteredMeetings, setFilteredMeetings] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    async function loadMeetings() {
      if (user) {
        setIsLoading(true)
        const meetingsData = await getMeetings()
        setMeetings(meetingsData)
        setFilteredMeetings(meetingsData)
        setIsLoading(false)
      }
    }

    loadMeetings()
  }, [user])

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredMeetings(meetings)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = meetings.filter((meeting) => {
        const contactName = meeting.contacts?.name?.toLowerCase() || ""
        const companyName = meeting.companies?.name?.toLowerCase() || ""
        const dateStr = format(new Date(meeting.date), "PP")
        
        return (
          contactName.includes(query) ||
          companyName.includes(query) ||
          dateStr.includes(query) ||
          meeting.status.toLowerCase().includes(query)
        )
      })
      setFilteredMeetings(filtered)
    }
  }, [searchQuery, meetings])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Scheduled</Badge>
      case "completed":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Completed</Badge>
      case "analyzed":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Analyzed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Meetings</h2>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/meetings/new">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Schedule Meeting
            </Link>
          </Button>
          <Button asChild>
            <Link href="/meetings/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload Recording
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search meetings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transcript</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                </TableRow>
              ))
            ) : filteredMeetings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No meetings found. Create your first meeting.
                </TableCell>
              </TableRow>
            ) : (
              filteredMeetings.map((meeting) => (
                <TableRow key={meeting.id}>
                  <TableCell>
                    {format(new Date(meeting.date), "PP")} at {meeting.time.substring(0, 5)}
                  </TableCell>
                  <TableCell>{meeting.contacts?.name || "Unknown"}</TableCell>
                  <TableCell>{meeting.companies?.name || "Unknown"}</TableCell>
                  <TableCell>{getStatusBadge(meeting.status)}</TableCell>
                  <TableCell>
                    {meeting.has_transcript ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/meetings/${meeting.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

