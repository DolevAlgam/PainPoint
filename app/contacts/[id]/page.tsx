"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Mail, Phone, Building, User, Briefcase } from "lucide-react"
import Link from "next/link"
import { ContactMeetings } from "@/components/contact-meetings"
import { getContact, type Contact } from "@/lib/services/contacts"
import { Skeleton } from "@/components/ui/skeleton"
import { useParams } from "next/navigation"

// Extending Contact type to include companies data that's joined in the API
interface ContactWithCompany extends Contact {
  companies?: {
    id: string;
    name: string;
    industry: string;
  };
}

export default function ContactDetailPage() {
  const params = useParams()
  const contactId = params.id as string
  
  const [contact, setContact] = useState<ContactWithCompany | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchContact = async () => {
      try {
        const data = await getContact(contactId)
        setContact(data as ContactWithCompany)
      } catch (error) {
        console.error("Error loading contact:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchContact()
  }, [contactId])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-44" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="md:col-span-2">
            <Skeleton className="h-[400px] w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="py-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Contact Not Found</h2>
        <p className="text-muted-foreground mb-4">The contact you're looking for doesn't exist or has been removed.</p>
        <Button asChild>
          <Link href="/contacts">Go Back to Contacts</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{contact.name}</h2>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/meetings/new?contactId=${contact.id}`}>
              <Calendar className="mr-2 h-4 w-4" />
              Schedule Meeting
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>
              Details about {contact.name} from {contact.companies?.name || 'Unknown Company'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Role:</span>
                <span className="text-sm">{contact.role || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Company:</span>
                <span className="text-sm">{contact.companies?.name || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Industry:</span>
                <span className="text-sm">{contact.companies?.industry || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Email:</span>
                <a href={`mailto:${contact.email}`} className="text-sm text-primary hover:underline">
                  {contact.email}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Phone:</span>
                <a href={`tel:${contact.phone}`} className="text-sm text-primary hover:underline">
                  {contact.phone || 'Not available'}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2">
          <ContactMeetings contactId={contact.id} />
        </div>
      </div>
    </div>
  )
}

