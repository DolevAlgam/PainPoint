import type React from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import Sidebar from "@/components/sidebar"
import Navbar from "@/components/navbar"
import { AuthProvider } from "@/lib/auth-context"
import RouteGuard from "@/components/route-guard"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "PainPoint - Startup Discovery CRM",
  description: "CRM and AI-powered copilot for startup discovery calls",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <RouteGuard>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <div className="flex flex-col flex-1 overflow-hidden md:ml-64">
                  <Navbar />
                  <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
                </div>
              </div>
              <Toaster />
            </ThemeProvider>
          </RouteGuard>
        </AuthProvider>
      </body>
    </html>
  )
}



import './globals.css'