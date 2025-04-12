"use client"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { UserNav } from "@/components/user-nav"
import { useState } from "react"

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")

  const getPageTitle = () => {
    if (pathname === "/") return "Dashboard"
    if (pathname.startsWith("/contacts")) return "Contacts"
    if (pathname.startsWith("/meetings")) return "Meetings"
    if (pathname.startsWith("/insights")) return "Insights"
    if (pathname.startsWith("/settings")) return "Settings"
    return "PainPoint"
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
        </div>
        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search..." 
              className="w-64 pl-8" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
          <UserNav />
        </div>
      </div>
    </header>
  )
}

