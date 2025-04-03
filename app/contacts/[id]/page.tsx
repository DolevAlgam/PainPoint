import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar, Mail, Phone, Building, User, Briefcase } from "lucide-react"
import Link from "next/link"
import { ContactMeetings } from "@/components/contact-meetings"
import { ContactNotes } from "@/components/contact-notes"

export default function ContactDetailPage({
  params,
}: {
  params: { id: string }
}) {
  // This would be fetched from your API in a real application
  const contact = {
    id: params.id,
    name: "John Smith",
    role: "CTO",
    company: "Acme Inc.",
    industry: "Software",
    email: "john.smith@acme.com",
    phone: "+1 (555) 123-4567",
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
          <Button variant="outline" asChild>
            <Link href={`/contacts/${contact.id}/edit`}>Edit Contact</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>
              Details about {contact.name} from {contact.company}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Role:</span>
                <span className="text-sm">{contact.role}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Company:</span>
                <span className="text-sm">{contact.company}</span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Industry:</span>
                <span className="text-sm">{contact.industry}</span>
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
                  {contact.phone}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2">
          <Tabs defaultValue="meetings">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="meetings">Meetings</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            <TabsContent value="meetings">
              <ContactMeetings contactId={contact.id} />
            </TabsContent>
            <TabsContent value="notes">
              <ContactNotes contactId={contact.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

