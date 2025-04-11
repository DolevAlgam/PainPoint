export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          industry: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          industry: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          industry?: string
          created_at?: string
          user_id?: string
        }
      }
      contacts: {
        Row: {
          id: string
          name: string
          email: string
          phone: string
          role: string
          company_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone?: string
          role: string
          company_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string
          role?: string
          company_id?: string
          created_at?: string
          user_id?: string
        }
      }
      meetings: {
        Row: {
          id: string
          contact_id: string
          company_id: string
          date: string
          time: string
          notes: string | null
          status: 'scheduled' | 'completed' | 'analyzed'
          has_recording: boolean
          has_transcript: boolean
          has_analysis: boolean
          transcript_outdated: boolean
          analysis_outdated: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          contact_id: string
          company_id: string
          date: string
          time: string
          notes?: string | null
          status?: 'scheduled' | 'completed' | 'analyzed'
          has_recording?: boolean
          has_transcript?: boolean
          has_analysis?: boolean
          transcript_outdated?: boolean
          analysis_outdated?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          contact_id?: string
          company_id?: string
          date?: string
          time?: string
          notes?: string | null
          status?: 'scheduled' | 'completed' | 'analyzed'
          has_recording?: boolean
          has_transcript?: boolean
          has_analysis?: boolean
          transcript_outdated?: boolean
          analysis_outdated?: boolean
          created_at?: string
          user_id?: string
        }
      }
      recordings: {
        Row: {
          id: string
          meeting_id: string
          file_path: string
          file_name: string
          duration: number | null
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          meeting_id: string
          file_path: string
          file_name: string
          duration?: number | null
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          meeting_id?: string
          file_path?: string
          file_name?: string
          duration?: number | null
          created_at?: string
          user_id?: string
        }
      }
      transcripts: {
        Row: {
          id: string
          meeting_id: string
          recording_id: string | null
          content: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          meeting_id: string
          recording_id?: string | null
          content: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          meeting_id?: string
          recording_id?: string | null
          content?: string
          created_at?: string
          user_id?: string
        }
      }
      pain_points: {
        Row: {
          id: string
          meeting_id: string
          title: string
          description: string
          root_cause: string
          impact: 'High' | 'Medium' | 'Low' | 'Not explicitly mentioned'
          created_at: string
          user_id: string
          citations?: string | null
        }
        Insert: {
          id?: string
          meeting_id: string
          title: string
          description: string
          root_cause: string
          impact: 'High' | 'Medium' | 'Low' | 'Not explicitly mentioned'
          created_at?: string
          user_id: string
          citations?: string | null
        }
        Update: {
          id?: string
          meeting_id?: string
          title?: string
          description?: string
          root_cause?: string
          impact?: 'High' | 'Medium' | 'Low' | 'Not explicitly mentioned'
          created_at?: string
          user_id?: string
          citations?: string | null
        }
      }
      industries: {
        Row: {
          id: string
          name: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          user_id?: string
        }
      }
      roles: {
        Row: {
          id: string
          name: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          user_id?: string
        }
      }
      pain_point_clusters: {
        Row: {
          id: string
          cluster_name: string
          description: string | null
          count: number
          pain_point_ids: string[]
          impact_summary: Json | null
          industries: string[]
          companies: string[]
          examples: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cluster_name: string
          description?: string | null
          count?: number
          pain_point_ids?: string[]
          impact_summary?: Json | null
          industries?: string[]
          companies?: string[]
          examples?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cluster_name?: string
          description?: string | null
          count?: number
          pain_point_ids?: string[]
          impact_summary?: Json | null
          industries?: string[]
          companies?: string[]
          examples?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      meta_data: {
        Row: {
          key: string
          value: string
          created_at: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
} 