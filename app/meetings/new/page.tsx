"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon, Clock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { getContacts } from "@/lib/services/contacts"
import { getCompanies } from "@/lib/services/companies"
import { createMeeting, type NewMeeting } from "@/lib/services/meetings"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type MeetingStatus = "scheduled" | "completed" | "analyzed";

export default function NewMeetingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedContact, setSelectedContact] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    contact_id: "",
    company_id: "",
    date: new Date(),
    time: "10:00",
    notes: "",
    status: "scheduled" as MeetingStatus,
  })

  useEffect(() => {
    // Load contacts and companies when the component mounts
    async function loadData() {
      if (user) {
        const [contactsData, companiesData] = await Promise.all([
          getContacts(),
          getCompanies()
        ])
        setContacts(contactsData)
        setCompanies(companiesData)
      }
    }
    
    loadData()
  }, [user])

  useEffect(() => {
    // When a contact is selected, automatically set their company if available
    if (formData.contact_id) {
      const selectedContact = contacts.find(c => c.id === formData.contact_id)
      if (selectedContact && selectedContact.company_id) {
        setFormData(prev => ({ ...prev, company_id: selectedContact.company_id }))
        setSelectedContact(selectedContact)
      }
    }
  }, [formData.contact_id, contacts])

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData((prev) => ({ ...prev, date }))
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.contact_id || !formData.company_id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select both a contact and a company"
      })
      return
    }
    
    setIsLoading(true)
    
    try {
      if (!user) throw new Error("User not authenticated")
      
      // Format date for the database
      const dateStr = format(formData.date, "yyyy-MM-dd")
      
      const newMeeting: NewMeeting = {
        contact_id: formData.contact_id,
        company_id: formData.company_id,
        date: dateStr,
        time: formData.time,
        notes: formData.notes,
        status: formData.status,
        has_recording: false,
        has_transcript: false,
        has_analysis: false,
        user_id: user.id
      }
      
      const meeting = await createMeeting(newMeeting)
      
      if (meeting) {
        toast({
          title: "Meeting scheduled",
          description: `Meeting with ${selectedContact?.name} has been scheduled`
        })
        
        router.push("/meetings")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error scheduling meeting",
        description: error.message || "An error occurred"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Schedule New Meeting</h2>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Meeting Details</CardTitle>
            <CardDescription>Schedule a new discovery call meeting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact">Contact</Label>
              <Select value={formData.contact_id} onValueChange={(value) => handleSelectChange("contact_id", value)}>
                <SelectTrigger id="contact">
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} ({contact.companies?.name || "No company"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Select 
                value={formData.company_id} 
                onValueChange={(value) => handleSelectChange("company_id", value)}
                disabled={selectedContact && selectedContact.company_id ? true : false}
              >
                <SelectTrigger id="company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContact && selectedContact.company_id && (
                <p className="text-xs text-muted-foreground">
                  Company is auto-selected from contact's company
                </p>
              )}
            </div>
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={formData.date} onSelect={handleDateChange} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <div className="flex items-center">
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="time" 
                    name="time" 
                    type="time" 
                    value={formData.time} 
                    onChange={handleChange} 
                    required 
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Meeting Notes (Optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Add any notes about the meeting"
                value={formData.notes}
                onChange={handleChange}
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Scheduling..." : "Schedule Meeting"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

