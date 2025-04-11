"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Save, Key, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { saveOpenAIApiKey, getOpenAIApiKey } from "@/lib/supabase"
import { exportContacts, exportMeetings, exportInsightsToExcel } from "@/lib/utils"
import { getContacts } from "@/lib/services/contacts"
import { getMeetings } from "@/lib/services/meetings"
import { getAllPainPoints, getCommonPainPointsWithAI } from "@/lib/services/pain-points"
import { supabase } from "@/lib/supabase"

export default function SettingsPage() {
  const [isSaving, setIsSaving] = useState(false)
  const [openAIKey, setOpenAIKey] = useState("")
  const [settings, setSettings] = useState({
    autoGenerateTranscripts: true,
    autoAnalyzeConversations: true,
    emailNotifications: true,
    smsNotifications: false,
  })
  const { toast } = useToast()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<any[]>([])
  const [meetings, setMeetings] = useState<any[]>([])
  const [painPoints, setPainPoints] = useState<any[]>([])
  const [loading, setLoading] = useState({
    contacts: false,
    meetings: false,
    insights: false
  })

  useEffect(() => {
    // Load the user's OpenAI API key
    async function loadApiKey() {
      if (user) {
        const apiKey = await getOpenAIApiKey();
        setOpenAIKey(apiKey || "");
      }
    }
    
    loadApiKey();
  }, [user]);

  useEffect(() => {
    async function loadExportData() {
      try {
        // Only load the data when it's needed for export
        if (contacts.length === 0) {
          setLoading(prev => ({ ...prev, contacts: true }))
          const contactsData = await getContacts()
          setContacts(contactsData)
          setLoading(prev => ({ ...prev, contacts: false }))
        }
        
        if (meetings.length === 0) {
          setLoading(prev => ({ ...prev, meetings: true }))
          const meetingsData = await getMeetings()
          setMeetings(meetingsData)
          setLoading(prev => ({ ...prev, meetings: false }))
        }
        
        if (painPoints.length === 0) {
          setLoading(prev => ({ ...prev, insights: true }))
          const painPointsData = await getAllPainPoints()
          setPainPoints(painPointsData)
          setLoading(prev => ({ ...prev, insights: false }))
        }
      } catch (error) {
        console.error("Error loading export data:", error)
        setLoading({ contacts: false, meetings: false, insights: false })
      }
    }
    
    loadExportData()
  }, [])

  const handleSettingChange = (setting: string, value: boolean) => {
    setSettings((prev) => ({ ...prev, [setting]: value }))
  }

  const saveSettings = async () => {
    setIsSaving(true)
    
    try {
      // Save the OpenAI API key
      if (user && openAIKey) {
        await saveOpenAIApiKey(openAIKey);
      }
      
      // In a real app, you would save the other settings as well
      
      toast({
        title: "Settings saved",
        description: "Your settings have been saved successfully"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "There was an error saving your settings"
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="api">API Configuration</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Manage your account details and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" defaultValue={user?.user_metadata?.name || user?.email?.split('@')[0] || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={user?.email || ""} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" defaultValue={user?.user_metadata?.company || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value="••••••••" readOnly />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={saveSettings} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
              <CardDescription>Configure API keys for external services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openai-key">OpenAI API Key</Label>
                <div className="flex">
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-..."
                    value={openAIKey}
                    onChange={(e) => setOpenAIKey(e.target.value)}
                  />
                  <Button variant="outline" className="ml-2" onClick={() => setOpenAIKey("")}>
                    <Key className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your API key is securely stored and used only for your requests.
                </p>
              </div>
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-transcripts">Auto-Generate Transcripts</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically generate transcripts after uploading recordings
                    </p>
                  </div>
                  <Switch
                    id="auto-transcripts"
                    checked={settings.autoGenerateTranscripts}
                    onCheckedChange={(checked) => handleSettingChange("autoGenerateTranscripts", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-analyze">Auto-Analyze Conversations</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically analyze conversations after transcription
                    </p>
                  </div>
                  <Switch
                    id="auto-analyze"
                    checked={settings.autoAnalyzeConversations}
                    onCheckedChange={(checked) => handleSettingChange("autoAnalyzeConversations", checked)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={saveSettings} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-notifications">Email Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive email notifications for meeting reminders</p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => handleSettingChange("emailNotifications", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sms-notifications">SMS Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive SMS notifications for meeting reminders</p>
                </div>
                <Switch
                  id="sms-notifications"
                  checked={settings.smsNotifications}
                  onCheckedChange={(checked) => handleSettingChange("smsNotifications", checked)}
                />
              </div>
              <div className="pt-4 space-y-2">
                <Label htmlFor="phone">Phone Number (for SMS)</Label>
                <Input id="phone" placeholder="+1 (555) 123-4567" />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={saveSettings} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Data Export</CardTitle>
          <CardDescription>Export your data for backup or analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                if (contacts.length === 0) {
                  setLoading(prev => ({ ...prev, contacts: true }))
                  const contactsData = await getContacts()
                  setContacts(contactsData)
                  setLoading(prev => ({ ...prev, contacts: false }))
                }
                exportContacts(contacts)
              }}
              disabled={loading.contacts}
            >
              {loading.contacts ? (
                <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Contacts
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                try {
                  setLoading(prev => ({ ...prev, meetings: true }))
                  
                  // Get meetings with transcripts and pain points included
                  const { data, error } = await supabase
                    .from('meetings')
                    .select(`
                      *,
                      contacts (
                        id,
                        name,
                        email,
                        role
                      ),
                      companies (
                        id,
                        name,
                        industry
                      ),
                      transcripts (id, content),
                      pain_points (id, title, description, root_cause, impact, created_at)
                    `)
                    .order('date', { ascending: false });
                    
                  if (error) throw error;
                  setMeetings(data || []);
                  setLoading(prev => ({ ...prev, meetings: false }))
                  exportMeetings(data || [])
                } catch (error) {
                  console.error("Error exporting meetings:", error)
                  setLoading(prev => ({ ...prev, meetings: false }))
                }
              }}
              disabled={loading.meetings}
            >
              {loading.meetings ? (
                <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Meetings
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                try {
                  setLoading(prev => ({ ...prev, insights: true }))
                  // Get pain point clusters instead of raw pain points
                  const result = await getCommonPainPointsWithAI(false)
                  if (result && result.clusters && result.clusters.length > 0) {
                    exportInsightsToExcel(result.clusters)
                  } else {
                    toast({
                      variant: "destructive",
                      title: "No data available",
                      description: "No pain point clusters are available to export."
                    })
                  }
                  setLoading(prev => ({ ...prev, insights: false }))
                } catch (error) {
                  console.error("Error exporting insights:", error)
                  toast({
                    variant: "destructive",
                    title: "Export failed",
                    description: "There was an error exporting the insights."
                  })
                  setLoading(prev => ({ ...prev, insights: false }))
                }
              }}
              disabled={loading.insights}
            >
              {loading.insights ? (
                <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Insights
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

