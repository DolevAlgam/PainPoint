"use client"

import { useState, useEffect } from "react"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/lib/auth-context"

export function FeedbackButton() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [feedback, setFeedback] = useState({
    improvements: "",
    positives: "",
    features: "",
    anonymous: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Close dialog and reset form when user logs out
  useEffect(() => {
    if (!user && isOpen) {
      setIsOpen(false);
      setFeedback({
        improvements: "",
        positives: "",
        features: "",
        anonymous: false
      });
    }
  }, [user, isOpen]);

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to submit feedback.",
        variant: "destructive",
      })
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Check if at least one field has content
      if (!feedback.improvements && !feedback.positives && !feedback.features) {
        throw new Error("Please fill out at least one feedback field");
      }
      
      // Submit feedback via the API endpoint
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          improvements: feedback.improvements,
          positives: feedback.positives,
          features: feedback.features,
          userId: user.id,
          anonymous: feedback.anonymous // Pass the anonymous flag
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error submitting feedback");
      }
      
      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback!",
      })
      
      // Reset the form
      setFeedback({
        improvements: "",
        positives: "",
        features: "",
        anonymous: false
      })
      setIsOpen(false)
    } catch (error) {
      console.error("Error submitting feedback:", error);
      
      let errorMessage = "Your feedback couldn't be submitted. Please try again.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Something went wrong",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 rounded-full shadow-md hover:shadow-lg transition-all z-50 px-4 bg-primary text-white"
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare className="h-5 w-5 mr-2" />
        <span>Feedback</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">We Value Your Feedback</DialogTitle>
            <DialogDescription>
              Help us improve our product by sharing your thoughts.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="improvements" className="text-sm font-medium">
                What can we do better?
              </label>
              <Textarea
                id="improvements"
                value={feedback.improvements}
                onChange={(e) => setFeedback({...feedback, improvements: e.target.value})}
                placeholder="Tell us what we can improve..."
                className="resize-none min-h-[80px]"
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="positives" className="text-sm font-medium">
                What do you love about us?
              </label>
              <Textarea
                id="positives"
                value={feedback.positives}
                onChange={(e) => setFeedback({...feedback, positives: e.target.value})}
                placeholder="Share what you enjoy about our product..."
                className="resize-none min-h-[80px]"
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="features" className="text-sm font-medium">
                Any feature requests or bugs to fix?
              </label>
              <Textarea
                id="features"
                value={feedback.features}
                onChange={(e) => setFeedback({...feedback, features: e.target.value})}
                placeholder="What would you like to see added or fixed?"
                className="resize-none min-h-[80px]"
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col items-stretch sm:items-end gap-2">
            <div className="flex items-center space-x-2 self-start mb-2">
              <Checkbox 
                id="anonymous" 
                className="h-3 w-3"
                checked={feedback.anonymous}
                onCheckedChange={(checked) => 
                  setFeedback({...feedback, anonymous: checked === true})
                }
              />
              <label
                htmlFor="anonymous"
                className="text-xs text-muted-foreground"
              >
                Submit anonymously
              </label>
            </div>
            
            <div className="flex justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
} 