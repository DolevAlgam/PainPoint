"use client"

import { useState } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, Plus, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

interface Contact {
  id: string
  name: string
  company: string
}

export function ContactSelector({
  selectedContactId,
  onSelectContact,
}: {
  selectedContactId: string
  onSelectContact: (id: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([
    { id: "1", name: "John Smith", company: "Acme Inc." },
    { id: "2", name: "Sarah Johnson", company: "Tech Solutions" },
    { id: "3", name: "Michael Brown", company: "Innovate LLC" },
    { id: "4", name: "Emily Davis", company: "Growth Ventures" },
    { id: "5", name: "Robert Wilson", company: "Digital First" },
  ])

  const selectedContact = contacts.find((contact) => contact.id === selectedContactId)

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
            {selectedContact ? (
              <div className="flex items-center">
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>
                  {selectedContact.name} ({selectedContact.company})
                </span>
              </div>
            ) : (
              "Select contact"
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search contacts..." />
            <CommandList>
              <CommandEmpty>
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <p className="mb-2">No contact found.</p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpen(false)
                      router.push("/contacts/new")
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Contact
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={contact.id}
                    onSelect={() => {
                      onSelectContact(contact.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", selectedContactId === contact.id ? "opacity-100" : "opacity-0")}
                    />
                    <div className="flex flex-col">
                      <span>{contact.name}</span>
                      <span className="text-xs text-muted-foreground">{contact.company}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon" onClick={() => router.push("/contacts/new")}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

