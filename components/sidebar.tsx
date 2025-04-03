"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Home, Users, Calendar, BarChart2, Settings, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useMobile } from "@/hooks/use-mobile"

export default function Sidebar() {
  const pathname = usePathname()
  const isMobile = useMobile()
  const [isOpen, setIsOpen] = useState(!isMobile)

  const toggleSidebar = () => {
    setIsOpen(!isOpen)
  }

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Contacts", href: "/contacts", icon: Users },
    { name: "Meetings", href: "/meetings", icon: Calendar },
    { name: "Insights", href: "/insights", icon: BarChart2 },
    { name: "Settings", href: "/settings", icon: Settings },
  ]

  return (
    <>
      {isMobile && (
        <Button variant="ghost" size="icon" className="fixed left-4 top-4 z-50" onClick={toggleSidebar}>
          {isOpen ? <X /> : <Menu />}
        </Button>
      )}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-all duration-200",
          isOpen ? "block md:hidden" : "hidden",
        )}
        onClick={() => setIsOpen(false)}
      />
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-background transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        style={{ boxShadow: "0 0 10px rgba(0, 0, 0, 0.05)" }}
      >
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">PainPoint</span>
          </Link>
        </div>
        <nav className="space-y-1 px-2 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
                onClick={() => isMobile && setIsOpen(false)}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}

