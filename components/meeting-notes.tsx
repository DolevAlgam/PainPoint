"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Save } from "lucide-react"

export function MeetingNotes({ meetingId }: { meetingId: string }) {
  const [notes, setNotes] = useState(
    "The customer is experiencing significant delays in their integration process. They mentioned it takes about 2 weeks to onboard a new customer, which is causing resource allocation issues. They also have data synchronization problems after onboarding.\n\nKey takeaways:\n- Need to automate the configuration process\n- Improve data mapping between systems\n- Provide better error handling for synchronization issues\n\nFollow-up actions:\n1. Schedule a demo of our automated integration solution\n2. Prepare a proposal addressing their specific pain points\n3. Connect them with a reference customer who had similar challenges",
  )
  const [isSaving, setIsSaving] = useState(false)

  const saveNotes = () => {
    setIsSaving(true)
    // In a real app, you would call your API to save the notes
    setTimeout(() => {
      setIsSaving(false)
    }, 1000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting Notes</CardTitle>
        <CardDescription>Your notes and observations from the meeting</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add your notes here..."
          className="min-h-[300px]"
        />
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={saveNotes} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save Notes"}
        </Button>
      </CardFooter>
    </Card>
  )
}

