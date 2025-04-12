"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { searchAll, SearchResult } from "@/lib/services/search"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export default function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchResults = async () => {
      if (!query) return
      
      setLoading(true)
      setError(null)
      try {
        const searchResults = await searchAll(query)
        setResults(searchResults)
      } catch (error) {
        console.error("Search failed:", error)
        setError("Failed to perform search. Please try again.")
      } finally {
        setLoading(false)
      }
    }
    
    fetchResults()
  }, [query])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'contact':
        return 'bg-blue-100 text-blue-800'
      case 'company':
        return 'bg-green-100 text-green-800'
      case 'meeting':
        return 'bg-purple-100 text-purple-800'
      case 'pain-point':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'contact':
        return '👤'
      case 'company':
        return '🏢'
      case 'meeting':
        return '📅'
      case 'pain-point':
        return '❗'
      default:
        return '📄'
    }
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Search Results for "{query}"</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="p-4">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-4">
          {results.map((result) => (
            <Link href={result.link} key={`${result.type}-${result.id}`}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{result.title}</CardTitle>
                    <Badge variant="outline" className={getTypeColor(result.type)}>
                      {getTypeIcon(result.type)} {result.type.replace('-', ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    {result.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No results found for "{query}"</p>
          <p className="text-sm mt-2">
            Try using different keywords or check your spelling.
          </p>
        </div>
      )}
    </div>
  )
} 