"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { CalendarIcon, Clock, Upload } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { getContacts, createContact, getRoles, createRole } from "@/lib/services/contacts"
import { getCompanies, createCompany, getIndustries, createIndustry } from "@/lib/services/companies"
import { createMeeting, type NewMeeting } from "@/lib/services/meetings"
import RecordingUploader from "@/components/recording-uploader"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Step = 1 | 2 | 3;
type MeetingStatus = "scheduled" | "completed" | "analyzed";

export default function UploadRecordingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const [step, setStep] = useState<Step>(1)
  
  // Data lists
  const [contacts, setContacts] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [industries, setIndustries] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  
  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmittingMeeting, setIsSubmittingMeeting] = useState(false);
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [isSubmittingCompany, setIsSubmittingCompany] = useState(false);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  
  // Flags
  const [needsNewContact, setNeedsNewContact] = useState(false);
  const [showNewCompanyFormForContact, setShowNewCompanyFormForContact] = useState(false);
  const [showNewCompanyFormForExisting, setShowNewCompanyFormForExisting] = useState(false);

  // Meeting Data
  const [selectedContact, setSelectedContact] = useState<any>(null)
  const [meeting, setMeeting] = useState<any>(null)
  const [formData, setFormData] = useState({
    contact_id: "",
    company_id: "",
    date: new Date(),
    time: format(new Date(), 'HH:mm'),
    notes: ""
  });

  // New Company State
  const [newCompany, setNewCompany] = useState({ name: "" });
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [customIndustry, setCustomIndustry] = useState("");

  // New Contact State
  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    phone: "",
    company_id: ""
  });
  const [selectedRole, setSelectedRole] = useState("");
  const [customRole, setCustomRole] = useState("");


  useEffect(() => {
    // Load initial data (contacts, companies, industries, roles)
    async function loadData() {
      if (user) {
        setIsLoadingData(true)
        try {
          const [contactsData, companiesData, industriesData, rolesData] = await Promise.all([
            getContacts(),
            getCompanies(),
            getIndustries(),
            getRoles()
          ]);
          setContacts(contactsData || [])
          setCompanies(companiesData || [])
          setIndustries(industriesData || [])
          setRoles(rolesData || [])
        } catch (error: any) {
           toast({ variant: "destructive", title: "Error loading initial data", description: error.message })
        } finally {
          setIsLoadingData(false)
        }
      }
    }
    
    loadData()
  }, [user, toast])

  useEffect(() => {
    // Auto-select company when an existing contact is chosen
    if (formData.contact_id && !needsNewContact && contacts.length > 0) {
      const contact = contacts.find(c => c.id === formData.contact_id)
      if (contact) {
         setSelectedContact(contact);
         if(contact.company_id) {
            setFormData(prev => ({ ...prev, company_id: contact.company_id }))
            setShowNewCompanyFormForExisting(false);
         } else {
            setFormData(prev => ({ ...prev, company_id: "" }));
         }
      } else {
         setSelectedContact(null);
         setFormData(prev => ({ ...prev, company_id: "" }));
      }
    } else {
      setSelectedContact(null);
    }
  }, [formData.contact_id, contacts, needsNewContact])

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData(prev => ({ ...prev, date }))
    }
  }

  // Handlers for main meeting form inputs
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // Handlers for new contact form inputs
  const handleNewContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setNewContact(prev => ({ ...prev, [name]: value }))
  }
  
  // Handlers for new company form inputs
  const handleNewCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setNewCompany(prev => ({ ...prev, [name]: value }))
  }

  // Handler for main form Select changes (Contact, Company)
  const handleSelectChange = (name: string, value: string) => {
    if (name === "contact_id" && value === "new") {
      setNeedsNewContact(true)
      setFormData(prev => ({ ...prev, contact_id: "", company_id: "" }));
      return
    }
    if (name === "contact_id") {
       const contact = contacts.find(c => c.id === value);
       setFormData(prev => ({ ...prev, [name]: value, company_id: contact?.company_id || "" }));
       setShowNewCompanyFormForExisting(false);
    } else {
       setFormData(prev => ({ ...prev, [name]: value }));
    }
  }
  
  // Handler for new contact form's Company Select
  const handleNewContactCompanySelectChange = (value: string) => {
     if (value === 'new') {
        setShowNewCompanyFormForContact(true);
        setNewContact(prev => ({ ...prev, company_id: '' }));
     } else {
        setShowNewCompanyFormForContact(false);
        setNewContact(prev => ({ ...prev, company_id: value }));
     }
  }
  
  // --- Create Company Logic ---
  const handleCreateCompany = async (context: 'newContact' | 'existingContact') => {
    let industryToSave = selectedIndustry;
    if (selectedIndustry === 'other') {
       if (!customIndustry.trim()) {
         toast({ variant: "destructive", title: "Error", description: "Please enter the custom industry name." });
         return;
       }
       industryToSave = customIndustry.trim();
    }

    if (!newCompany.name || !industryToSave) {
      toast({ variant: "destructive", title: "Error", description: "Company name and industry are required" });
      return;
    }

    setIsSubmittingCompany(true);
    
    try {
      if (!user) throw new Error("User not authenticated")
      
      let finalIndustryName = industryToSave;

      // If custom industry, create it first
      if (selectedIndustry === 'other') {
         const createdIndustry = await createIndustry({ name: industryToSave, user_id: user.id });
         if (createdIndustry) {
            finalIndustryName = createdIndustry.name; 
            const updatedIndustries = await getIndustries(); 
            setIndustries(updatedIndustries || []);
            setSelectedIndustry(finalIndustryName);
         } else {
            throw new Error("Failed to create custom industry. It might already exist.");
         }
      }
      
      const createdCompany = await createCompany({
        name: newCompany.name,
        industry: finalIndustryName, 
        user_id: user.id
      })
      
      if (createdCompany) {
        const updatedCompanies = [...companies, createdCompany];
        setCompanies(updatedCompanies);
        
        // Update the correct state based on context
        if (context === 'newContact') {
           setNewContact(prev => ({ ...prev, company_id: createdCompany.id }));
           setShowNewCompanyFormForContact(false);
        } else {
           setFormData(prev => ({ ...prev, company_id: createdCompany.id }));
           setShowNewCompanyFormForExisting(false);
        }
        
        // Reset company form fields
        setNewCompany({ name: "" });
        setCustomIndustry(""); 
        
        toast({ title: "Company created", description: `Created company ${createdCompany.name}` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating company", description: error.message || "An error occurred" });
    } finally {
      setIsSubmittingCompany(false); 
    }
  }
  
  // --- Create Contact Logic ---
  const handleCreateContact = async () => {
     let roleToSave = selectedRole;
     if (selectedRole === 'other') {
        if (!customRole.trim()) {
           toast({ variant: "destructive", title: "Error", description: "Please enter the custom role name." });
           return;
        }
        roleToSave = customRole.trim();
     }

    if (!newContact.name || !newContact.email || !newContact.company_id || !roleToSave) {
      toast({ variant: "destructive", title: "Error", description: "Name, email, company and role are required" });
      return;
    }
    
    setIsSubmittingContact(true);
    
    try {
      if (!user) throw new Error("User not authenticated")

      let finalRoleName = roleToSave;

      // If custom role, create it first
      if (selectedRole === 'other') {
         const createdRole = await createRole({ name: roleToSave, user_id: user.id });
         if (createdRole) {
           finalRoleName = createdRole.name;
           const updatedRoles = await getRoles();
           setRoles(updatedRoles || []);
           setSelectedRole(finalRoleName);
         } else {
           throw new Error("Failed to create custom role. It might already exist.");
         }
      }
      
      const contactData = {
        name: newContact.name,
        email: newContact.email,
        phone: newContact.phone,
        company_id: newContact.company_id,
        role: finalRoleName, 
        user_id: user.id
      };

      const createdContact = await createContact(contactData);
      
      if (createdContact) {
        const updatedContacts = [...contacts, createdContact];
        setContacts(updatedContacts);
        setFormData(prev => ({ ...prev, contact_id: createdContact.id, company_id: createdContact.company_id }));
        setNeedsNewContact(false);
        setNewContact({ name: "", email: "", phone: "", company_id: "" });
        setSelectedRole("");
        setCustomRole("");
        
        toast({ title: "Contact created", description: `Created contact ${createdContact.name}` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating contact", description: error.message || "An error occurred" });
    } finally {
      setIsSubmittingContact(false);
    }
  }

  // --- Submit Meeting Details (Step 1) ---
  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.contact_id || !formData.company_id) {
      toast({ variant: "destructive", title: "Error", description: "Please select both a contact and a company" });
      return;
    }
    
    setIsSubmittingMeeting(true);
    
    try {
      if (!user) throw new Error("User not authenticated")
      
      const dateStr = format(formData.date, "yyyy-MM-dd")
      
      const newMeetingData: NewMeeting = {
        contact_id: formData.contact_id,
        company_id: formData.company_id,
        date: dateStr,
        time: formData.time,
        notes: formData.notes,
        status: "completed" as MeetingStatus,
        has_recording: false,
        has_transcript: false,
        has_analysis: false,
        user_id: user.id
      }
      
      const createdMeeting = await createMeeting(newMeetingData);
      
      if (createdMeeting) {
        setMeeting(createdMeeting);
        toast({ title: "Meeting created", description: "Successfully created meeting record. Proceed to upload." });
        setStep(2);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating meeting", description: error.message || "An error occurred" });
    } finally {
      setIsSubmittingMeeting(false);
    }
  }

  // --- Step 2 Callback ---
  const handleRecordingUploaded = async (recording: any) => {
    setStep(3);
    toast({ title: "Recording uploaded", description: "Your recording has been uploaded successfully" });
  }

  // --- Step 3 Action ---
  const handleFinish = () => {
    router.push(meeting ? `/meetings/${meeting.id}` : "/meetings")
  }
  
  // Render loading state for initial data
  if (isLoadingData) {
     return <div>Loading meeting data...</div>; 
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Upload Recording</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 ? "Meeting Details" : step === 2 ? "Upload Recording" : "Processing Complete"}
          </CardTitle>
          <CardDescription>
            {step === 1
              ? "Provide details about the meeting, creating contacts/companies if needed."
              : step === 2
                ? "Upload your meeting recording for transcription and analysis"
                : "Your recording has been processed successfully"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <form onSubmit={handleMeetingSubmit} className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contact">Contact</Label>
                  {!needsNewContact ? (
                    <div className="flex gap-2">
                      <Select 
                        value={formData.contact_id} 
                        onValueChange={(value) => handleSelectChange("contact_id", value)}
                        disabled={isSubmittingMeeting}
                        >
                        <SelectTrigger id="contact">
                          <SelectValue placeholder="Select existing contact" />
                        </SelectTrigger>
                        <SelectContent>
                          {contacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {contact.name} ({contact.companies?.name || "No company assigned"})
                            </SelectItem>
                          ))}
                          <SelectItem value="new">+ Add New Contact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-4 border rounded-md p-4 bg-muted/40">
                       <h4 className="font-medium mb-2">Create New Contact</h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="newContactName">Name</Label>
                          <Input id="newContactName" name="name" value={newContact.name} onChange={handleNewContactChange} placeholder="John Smith" required disabled={isSubmittingContact}/>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="newContactEmail">Email</Label>
                          <Input id="newContactEmail" name="email" type="email" value={newContact.email} onChange={handleNewContactChange} placeholder="john@example.com" required disabled={isSubmittingContact}/>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                         <div className="space-y-2">
                           <Label htmlFor="newContactRole">Role</Label>
                           <Select value={selectedRole} onValueChange={setSelectedRole} required disabled={isSubmittingContact}>
                             <SelectTrigger id="newContactRole">
                               <SelectValue placeholder="Select role" />
                             </SelectTrigger>
                             <SelectContent>
                                {roles.map((role) => (<SelectItem key={role.id || role.name} value={role.name}>{role.name}</SelectItem>))}
                                <SelectItem value="other">Other (Specify)</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                         {selectedRole === 'other' && (
                            <div className="space-y-2 md:col-span-2">
                               <Label htmlFor="custom-role">New Role Name</Label>
                               <Input id="custom-role" value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="e.g., Marketing Lead" required={selectedRole === 'other'} disabled={isSubmittingContact} />
                            </div>
                         )}
                         <div className={`space-y-2 ${selectedRole === 'other' ? 'md:col-start-1' : ''}`}>
                           <Label htmlFor="newContactPhone">Phone (Optional)</Label>
                           <Input id="newContactPhone" name="phone" value={newContact.phone} onChange={handleNewContactChange} placeholder="+1 (555) 123-4567" disabled={isSubmittingContact}/>
                         </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="newContactCompany">Company</Label>
                        <div className="flex gap-2">
                          <Select 
                            value={newContact.company_id} 
                            onValueChange={handleNewContactCompanySelectChange}
                            required
                            disabled={isSubmittingContact}
                          >
                            <SelectTrigger id="newContactCompany">
                              <SelectValue placeholder="Select or create company" />
                            </SelectTrigger>
                            <SelectContent>
                              {companies.map((company) => (<SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>))}
                              <SelectItem value="new">+ Add New Company</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {showNewCompanyFormForContact && (
                        <div className="space-y-4 border rounded-md p-4 ml-4 bg-background">
                           <h5 className="font-medium mb-2">Create New Company</h5>
                           <div className="space-y-2">
                             <Label htmlFor="nestedNewCompanyName">Company Name</Label>
                             <Input id="nestedNewCompanyName" name="name" value={newCompany.name} onChange={handleNewCompanyChange} placeholder="Acme Inc." required disabled={isSubmittingCompany}/>
                          </div>
                           <div className="space-y-2">
                             <Label htmlFor="nestedNewCompanyIndustry">Industry</Label>
                             <Select value={selectedIndustry} onValueChange={setSelectedIndustry} required disabled={isSubmittingCompany}>
                               <SelectTrigger id="nestedNewCompanyIndustry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                               <SelectContent>
                                  {industries.map((industry) => (<SelectItem key={industry.id || industry.name} value={industry.name}>{industry.name}</SelectItem>))}
                                  <SelectItem value="other">Other (Specify)</SelectItem> 
                               </SelectContent>
                             </Select>
                           </div>
                           <div className="flex justify-end">
                             <Button type="button" onClick={() => handleCreateCompany('newContact')} disabled={isSubmittingCompany || !newCompany.name || !selectedIndustry || (selectedIndustry === 'other' && !customIndustry.trim())}>
                               {isSubmittingCompany ? "Creating..." : "Create Company"}
                             </Button>
                           </div>
                        </div>
                      )}
                      
                      <div className="flex justify-between pt-2">
                        <Button type="button" variant="outline" onClick={() => setNeedsNewContact(false)} disabled={isSubmittingContact}>Cancel</Button>
                        <Button type="button" onClick={handleCreateContact} disabled={isSubmittingContact || isSubmittingCompany || !newContact.name || !newContact.email || !newContact.company_id || !selectedRole || (selectedRole === 'other' && !customRole.trim())}>
                          {isSubmittingContact ? "Creating..." : "Create Contact"}
                        </Button>
                      </div>
                    </div>
                  )} 
                </div> 
                
                {!needsNewContact && (
                  <div className="space-y-2">
                     <Label htmlFor="company">Company</Label>
                      <Select 
                        value={formData.company_id} 
                        onValueChange={(value) => handleSelectChange("company_id", value)}
                        disabled={isSubmittingMeeting || (!!selectedContact && !!selectedContact.company_id)}
                      >
                        <SelectTrigger id="company">
                          <SelectValue placeholder={selectedContact && !selectedContact.company_id ? "Select or create company" : "Select company"} />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedContact && selectedContact.company_id && (<p className="text-xs text-muted-foreground">Company is auto-selected from contact</p>)}
                      
                      {selectedContact && !selectedContact.company_id && !showNewCompanyFormForExisting && (
                        <div className="mt-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCompanyFormForExisting(true)} disabled={isSubmittingMeeting}>
                             + New Company
                          </Button>
                        </div>
                      )}

                      {showNewCompanyFormForExisting && (
                        <div className="mt-2 space-y-4 border rounded-md p-4 bg-muted/40">
                           <h4 className="font-medium mb-2">Create New Company</h4>
                            <div className="space-y-2">
                               <Label htmlFor="existingNewCompanyName">Company Name</Label>
                               <Input id="existingNewCompanyName" name="name" value={newCompany.name} onChange={handleNewCompanyChange} placeholder="Acme Inc." required disabled={isSubmittingCompany}/>
                            </div>
                             <div className="space-y-2">
                               <Label htmlFor="existingNewCompanyIndustry">Industry</Label>
                               <Select value={selectedIndustry} onValueChange={setSelectedIndustry} required disabled={isSubmittingCompany}>
                                 <SelectTrigger id="existingNewCompanyIndustry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                                 <SelectContent>
                                    {industries.map((industry) => (<SelectItem key={industry.id || industry.name} value={industry.name}>{industry.name}</SelectItem>))}
                                    <SelectItem value="other">Other (Specify)</SelectItem> 
                                 </SelectContent>
                               </Select>
                             </div>
                             <div className="flex justify-between pt-2">
                                <Button type="button" variant="outline" onClick={() => setShowNewCompanyFormForExisting(false)} disabled={isSubmittingCompany}>Cancel</Button>
                               <Button type="button" onClick={() => handleCreateCompany('existingContact')} disabled={isSubmittingCompany || !newCompany.name || !selectedIndustry || (selectedIndustry === 'other' && !customIndustry.trim())}>
                                 {isSubmittingCompany ? "Creating..." : "Create Company"}
                               </Button>
                             </div>
                           </div>
                         )}
                   </div>
                 )}

                {!needsNewContact && (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button id="date" variant="outline" className={cn("w-full justify-start text-left font-normal", !formData.date && "text-muted-foreground")} disabled={isSubmittingMeeting}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.date} onSelect={handleDateChange} initialFocus /></PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="time">Time</Label>
                        <div className="flex items-center">
                          <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                          <Input id="time" name="time" type="time" value={formData.time} onChange={handleChange} required disabled={isSubmittingMeeting}/>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Meeting Notes (Optional)</Label>
                      <Textarea id="notes" name="notes" placeholder="Add any notes about the meeting" value={formData.notes} onChange={handleChange} rows={4} disabled={isSubmittingMeeting}/>
                    </div>
                  </>
                 )}
               </div> 

               {!needsNewContact && (
                 <div className="pt-4 flex justify-between">
                   <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmittingMeeting}>Cancel</Button>
                   <Button type="submit" disabled={isLoadingData || isSubmittingMeeting || isSubmittingContact || isSubmittingCompany || !formData.contact_id || !formData.company_id}>
                     {isSubmittingMeeting ? "Creating..." : "Continue to Upload"}
                   </Button>
                 </div>
               )}
             </form>
           )}

          {step === 2 && meeting && (
            <div className="space-y-6">
              <RecordingUploader 
                meetingId={meeting.id}
                onUploadComplete={handleRecordingUploaded}
                onCancel={() => router.push(`/meetings/${meeting.id}`)}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 py-6 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                 <Upload className="h-8 w-8 text-green-600" />
              </div>
              <div>
                 <h3 className="text-lg font-medium">Recording Uploaded Successfully</h3>
                 <p className="text-sm text-muted-foreground mt-1">
                   Your recording has been uploaded and is ready for processing.
                 </p>
              </div>
              <Button onClick={handleFinish}>
                 View Meeting Details
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

