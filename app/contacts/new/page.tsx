"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { getCompanies, createCompany, getIndustries, createIndustry } from "@/lib/services/companies"
import { createContact, getRoles, createRole } from "@/lib/services/contacts"

export default function NewContactPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const [companies, setCompanies] = useState<any[]>([])
  const [industries, setIndustries] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)
  const [isCreatingCompany, setIsCreatingCompany] = useState(false)
  const [isSubmittingCompany, setIsSubmittingCompany] = useState(false)
  
  const [newCompany, setNewCompany] = useState("")
  const [selectedIndustry, setSelectedIndustry] = useState("")
  const [customIndustry, setCustomIndustry] = useState("")
  
  const [formData, setFormData] = useState({
    name: "",
    company_id: "",
    email: "",
    phone: "",
  })
  const [selectedRole, setSelectedRole] = useState("")
  const [customRole, setCustomRole] = useState("")

  useEffect(() => {
    async function loadInitialData() {
      if (user) {
        setIsLoading(true)
        try {
          const [companiesData, industriesData, rolesData] = await Promise.all([
            getCompanies(),
            getIndustries(),
            getRoles()
          ])
          setCompanies(companiesData || [])
          setIndustries(industriesData || [])
          setRoles(rolesData || [])
        } catch (error: any) {
           toast({ variant: "destructive", title: "Error loading data", description: error.message })
        } finally {
           setIsLoading(false)
        }
      }
    }
    
    loadInitialData()
  }, [user, toast])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleCreateCompany = async () => {
    let industryToSave = selectedIndustry;

    if (selectedIndustry === 'other') {
       if (!customIndustry.trim()) {
         toast({ variant: "destructive", title: "Error", description: "Please enter the custom industry name." });
         return;
       }
       industryToSave = customIndustry.trim();
    }

    if (!newCompany || !industryToSave) {
      toast({ variant: "destructive", title: "Error", description: "Company name and industry are required" });
      return;
    }

    setIsSubmittingCompany(true);
    
    try {
      if (!user) throw new Error("User not authenticated")
      
      let finalIndustryName = industryToSave;

      if (selectedIndustry === 'other') {
         const newIndustry = await createIndustry({ name: industryToSave, user_id: user.id });
         if (newIndustry) {
            finalIndustryName = newIndustry.name;
            const updatedIndustries = await getIndustries(); 
            setIndustries(updatedIndustries || []);
            setSelectedIndustry(finalIndustryName);
         } else {
            throw new Error("Failed to create custom industry. It might already exist.");
         }
      }
      
      const company = await createCompany({
        name: newCompany,
        industry: finalIndustryName, 
        user_id: user.id
      })
      
      if (company) {
        const updatedCompanies = [...companies, company];
        setCompanies(updatedCompanies);
        setFormData(prev => ({ ...prev, company_id: company.id }));
        setNewCompany("");
        setCustomIndustry("");
        setIsCreatingCompany(false);
        
        toast({ title: "Company created", description: `Created company ${company.name}` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating company", description: error.message || "An error occurred" });
    } finally {
      setIsSubmittingCompany(false); 
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let roleToSave = selectedRole;
    if (selectedRole === 'other') {
       if (!customRole.trim()) {
          toast({ variant: "destructive", title: "Error", description: "Please enter the custom role name." });
          return;
       }
       roleToSave = customRole.trim();
    }
    
    if (!formData.name || !formData.email || !formData.company_id || !roleToSave) {
      toast({ variant: "destructive", title: "Error", description: "Name, email, company and role are required" });
      return;
    }
    
    setIsSubmittingContact(true);
    
    try {
      if (!user) throw new Error("User not authenticated")

      let finalRoleName = roleToSave;

      if (selectedRole === 'other') {
         const newRole = await createRole({ name: roleToSave, user_id: user.id });
         if (newRole) {
           finalRoleName = newRole.name;
           const updatedRoles = await getRoles();
           setRoles(updatedRoles || []);
           setSelectedRole(finalRoleName);
         } else {
           throw new Error("Failed to create custom role. It might already exist.");
         }
      }
      
      const contactData = {
        ...formData,
        role: finalRoleName,
        user_id: user.id
      };

      const contact = await createContact(contactData);
      
      if (contact) {
        toast({ title: "Contact created", description: `Created contact ${contact.name}` });
        router.push("/contacts");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating contact", description: error.message || "An error occurred" });
    } finally {
      setIsSubmittingContact(false);
    }
  }

  if (isLoading) {
     return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Add New Contact</h2>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Add a new contact to your CRM system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="John Smith"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  disabled={isSubmittingContact}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <div className="flex gap-2">
                  <Select 
                    value={formData.company_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, company_id: value }))} 
                    required
                    disabled={isSubmittingContact || isCreatingCompany}
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
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsCreatingCompany(!isCreatingCompany)}
                    disabled={isSubmittingContact}
                  >
                    {isCreatingCompany ? "Cancel" : "New"}
                  </Button>
                </div>
              </div>
            </div>
              
            {isCreatingCompany && (
              <div className="space-y-4 md:col-span-2 border rounded-md p-4 mt-4">
                <h3 className="text-lg font-medium mb-2">Create New Company</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-company">Company Name</Label>
                    <Input
                      id="new-company"
                      value={newCompany}
                      onChange={(e) => setNewCompany(e.target.value)}
                      placeholder="Acme Inc."
                      required={isCreatingCompany}
                      disabled={isSubmittingCompany}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-company-industry">Industry</Label>
                    <Select 
                      value={selectedIndustry} 
                      onValueChange={setSelectedIndustry}
                      required={isCreatingCompany}
                      disabled={isSubmittingCompany}
                      >
                      <SelectTrigger id="new-company-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {industries.map((industry) => (
                          <SelectItem key={industry.id || industry.name} value={industry.name}>{industry.name}</SelectItem>
                        ))}
                        <SelectItem value="other">Other (Specify)</SelectItem> 
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedIndustry === 'other' && (
                    <div className="space-y-2 md:col-span-2">
                       <Label htmlFor="custom-industry">New Industry Name</Label>
                       <Input
                         id="custom-industry"
                         value={customIndustry}
                         onChange={(e) => setCustomIndustry(e.target.value)}
                         placeholder="e.g., Biotechnology"
                         required={selectedIndustry === 'other'}
                         disabled={isSubmittingCompany}
                       />
                    </div>
                  )}
                  <div className="md:col-span-2 flex justify-end">
                    <Button 
                      type="button" 
                      onClick={handleCreateCompany}
                      disabled={isSubmittingCompany || (!newCompany || !selectedIndustry || (selectedIndustry === 'other' && !customIndustry.trim()))}
                    >
                      {isSubmittingCompany ? "Creating..." : "Create Company"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select 
                  value={selectedRole} 
                  onValueChange={setSelectedRole}
                  required
                  disabled={isSubmittingContact}
                  >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                     {roles.map((role) => (
                       <SelectItem key={role.id || role.name} value={role.name}>{role.name}</SelectItem>
                     ))}
                     <SelectItem value="other">Other (Specify)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedRole === 'other' && (
                 <div className="space-y-2 md:col-start-1">
                    <Label htmlFor="custom-role">New Role Name</Label>
                    <Input
                      id="custom-role"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      placeholder="e.g., Marketing Lead"
                      required={selectedRole === 'other'}
                      disabled={isSubmittingContact}
                    />
                 </div>
              )}
              <div className={`space-y-2 ${selectedRole === 'other' ? 'md:col-start-2' : 'md:col-start-2'}`}>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john.smith@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isSubmittingContact}
                />
              </div>
              <div className={`space-y-2 ${selectedRole === 'other' ? 'md:col-start-1' : 'md:col-start-1'}`}>
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="(123) 456-7890"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmittingContact || isSubmittingCompany || isCreatingCompany}>
              {isSubmittingContact ? "Saving..." : "Save Contact"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

