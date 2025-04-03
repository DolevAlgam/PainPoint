"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { getAuthErrorMessage } from "@/lib/auth-error-handler"
import { AuthError } from "@/components/ui/auth-error"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const { signUp } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Reset any previous error
    setErrorMessage("")
    
    if (!email || !password || !confirmPassword) {
      setErrorMessage("Please fill in all fields")
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setErrorMessage("Password should be at least 6 characters long")
      return
    }

    setIsLoading(true)

    try {
      const { error, user } = await signUp(email, password)
      
      if (error) {
        console.error("Signup error details:", error);
        throw error;
      }
      
      toast({
        title: "Success",
        description: user ? "Registration successful. Please log in." : "Check your email for the confirmation link."
      })
      
      // If using passwordless signup, we'll go to a confirmation page
      // Otherwise, we can redirect to login
      router.push("/login")
    } catch (error: any) {
      console.error("Error during signup:", error);
      
      // Check for specific database error messages
      if (error.status === 500 || 
          (error.message && (
            error.message.includes("database") || 
            error.message.includes("Database") || 
            error.message.includes("constraint")
          ))) {
        setErrorMessage("Database error saving new user. Please try again or contact support.");
      } else {
        setErrorMessage(getAuthErrorMessage(error));
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen justify-center items-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Enter your information to create an account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && <AuthError message={errorMessage} title="Registration Error" />}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
            <div className="text-center text-sm mt-2">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-500 hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
} 