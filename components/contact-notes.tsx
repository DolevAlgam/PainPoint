"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Save, Edit, Plus } from "lucide-react"

export function ContactNotes({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState([
    {
      id: "1",
      date: "2025-03-30",
      content:
        "John mentioned they're struggling with their current integration process. It takes them about 2 weeks to onboard new customers.",
      isEditing: false,
    },
    {
      id: "2",
      date: "2025-03-15",
      content:
        "Initial call went well. They're looking for a solution that can streamline their workflow and reduce manual steps.",
      isEditing: false,
    },
  ])

  const [newNote, setNewNote] = useState("")
  const [isAddingNote, setIsAddingNote] = useState(false)

  const toggleEdit = (id: string) => {
    setNotes(notes.map((note) => (note.id === id ? { ...note, isEditing: !note.isEditing } : note)))
  }

  const updateNote = (id: string, content: string) => {
    setNotes(notes.map((note) => (note.id === id ? { ...note, content, isEditing: false } : note)))
  }

  const addNote = () => {
    if (newNote.trim()) {
      const today = new Date().toISOString().split("T")[0]
      setNotes([
        {
          id: Date.now().toString(),
          date: today,
          content: newNote,
          isEditing: false,
        },
        ...notes,
      ])
      setNewNote("")
      setIsAddingNote(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Keep track of important information about this contact</CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsAddingNote(!isAddingNote)} variant={isAddingNote ? "outline" : "default"}>
          {isAddingNote ? "Cancel" : <Plus className="mr-2 h-4 w-4" />}
          {isAddingNote ? "" : "Add Note"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isAddingNote && (
            <div className="rounded-md border p-3">
              <Textarea
                placeholder="Write your note here..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="mb-2 min-h-[100px]"
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsAddingNote(false)
                    setNewNote("")
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={addNote}>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>
          )}

          {notes.map((note) => (
            <div key={note.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{note.date}</span>
                <Button size="sm" variant="ghost" onClick={() => toggleEdit(note.id)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
              {note.isEditing ? (
                <>
                  <Textarea
                    value={note.content}
                    onChange={(e) =>
                      setNotes(notes.map((n) => (n.id === note.id ? { ...n, content: e.target.value } : n)))
                    }
                    className="mb-2 min-h-[100px]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggleEdit(note.id)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => updateNote(note.id, note.content)}>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              )}
            </div>
          ))}
          {notes.length === 0 && !isAddingNote && (
            <p className="text-sm text-muted-foreground">No notes for this contact yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

