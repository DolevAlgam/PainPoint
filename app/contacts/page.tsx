"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getContacts, type Contact } from "@/lib/services/contacts"
import { useAuth } from "@/lib/auth-context"
import { getRoles, type Role } from "@/lib/services/contacts"
import { getIndustries, type Industry } from "@/lib/services/companies"
import { format } from "date-fns"

// Extending the Contact type to include the joined companies data
interface ContactWithCompany extends Contact {
  companies?: {
    id: string;
    name: string;
    industry: string;
  };
}

export default function ContactsPage() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<ContactWithCompany[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [industries, setIndustries] = useState<Industry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch contacts, roles, and industries when the component mounts and user is authenticated
    async function loadData() {
      if (user) {
        try {
          const [contactsData, rolesData, industriesData] = await Promise.all([
            getContacts(),
            getRoles(),
            getIndustries()
          ])
          setContacts(contactsData as ContactWithCompany[])
          setRoles(rolesData)
          setIndustries(industriesData)
        } catch (error) {
          console.error("Error loading contacts data:", error)
        } finally {
          setLoading(false)
        }
      }
    }
    
    loadData()
  }, [user])

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Contacts</h2>
          <Button asChild>
            <Link href="/contacts/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Link>
          </Button>
        </div>
        <Card className="min-h-[300px] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Contacts</h2>
        <Button asChild>
          <Link href="/contacts/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact List</CardTitle>
          <CardDescription>Manage and view all your contacts in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search contacts..." className="w-full pl-8" />
            </div>
            <div className="flex gap-2">
              <Select>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {industries.map((industry) => (
                    <SelectItem key={industry.id} value={industry.name.toLowerCase()}>
                      {industry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.name.toLowerCase()}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Last Interaction</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      {contact.name}
                    </TableCell>
                    <TableCell>{contact.companies?.name}</TableCell>
                    <TableCell>{contact.role}</TableCell>
                    <TableCell>{contact.companies?.industry}</TableCell>
                    <TableCell>
                      {format(new Date(contact.created_at), "PP")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/contacts/${contact.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No contacts found. Add your first contact to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

