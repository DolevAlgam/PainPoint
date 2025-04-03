"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

// Add public routes that don't require authentication
const publicRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"]

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    // Check authentication on route change
    authCheck()
  }, [pathname, user, loading])

  function authCheck() {
    // If still loading auth state, don't do anything yet
    if (loading) return

    // If on a public route, allow access
    if (publicRoutes.includes(pathname)) {
      setAuthorized(true)
      return
    }

    // If user is not logged in and trying to access a protected route
    if (!user) {
      setAuthorized(false)
      router.push("/login")
      return
    }

    // If we got here, the user is logged in and the route is protected
    setAuthorized(true)
  }

  // Show loading indicator while checking auth
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    )
  }

  // On a public route with no user, or on a protected route with a user
  return authorized ? <>{children}</> : null
} 