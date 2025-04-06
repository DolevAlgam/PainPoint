"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FileAudio, X, Upload } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { uploadRecordingFile, createRecording } from "@/lib/services/recordings"
import { useAuth } from "@/lib/auth-context"

interface RecordingUploaderProps {
  meetingId: string
  onUploadComplete: (recording: any) => void
  onCancel: () => void
}

export default function RecordingUploader({ meetingId, onUploadComplete, onCancel }: RecordingUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState("")
  const { user } = useAuth()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (100MB limit)
      if (file.size > 100 * 1024 * 1024) {
        setUploadError("File size exceeds 100MB limit")
        return
      }

      // Check file type
      const validTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "audio/flac",
        "audio/m4a",
        "audio/x-m4a",
        "application/octet-stream",
        "video/mp4",
      ]

      if (!validTypes.includes(file.type)) {
        setUploadError(`Invalid file type: ${file.type}. Please upload an audio or video file.`)
        return
      }

      setSelectedFile(file)
      setUploadError("")
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
  }

  const handleUpload = async () => {
    if (!selectedFile || !user) return
    
    setIsUploading(true)
    setUploadProgress(0)
    
    try {
      // Create a unique file path
      const timestamp = new Date().getTime()
      const fileExtension = selectedFile.name.split('.').pop()
      const filePath = `meeting_${meetingId}/${timestamp}.${fileExtension}`
      
      // Start progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval)
            return 95
          }
          return prev + 5
        })
      }, 300)
      
      // Upload the file to storage
      const fileData = await uploadRecordingFile(selectedFile, filePath)
      
      if (fileData) {
        // Create recording record in database
        const recording = await createRecording({
          meeting_id: meetingId,
          file_path: filePath,
          file_name: selectedFile.name,
          user_id: user.id
        })
        
        if (recording) {
          setUploadProgress(100)
          clearInterval(progressInterval)
          
          // Notify parent component
          onUploadComplete(recording)
        }
      }
    } catch (error: any) {
      setUploadError(error.message || "An error occurred during upload")
      setIsUploading(false)
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-lg">Upload Recording</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file">Recording File</Label>
          <div className="flex items-center gap-2">
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg,.flac"
              className="hidden"
              disabled={isUploading}
            />
            <Label
              htmlFor="file"
              className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <Upload className="mr-2 h-4 w-4" />
              {selectedFile ? "Change File" : "Select File"}
            </Label>
          </div>
        </div>

        {uploadError && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        {selectedFile && (
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileAudio className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={removeFile} disabled={isUploading}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {isUploading && (
              <div className="mt-4 space-y-2">
                <Progress value={uploadProgress} />
                <p className="text-xs text-center text-muted-foreground">Uploading... {uploadProgress}%</p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-md border p-3 bg-muted/50">
          <h4 className="text-xs font-medium mb-1">Supported Formats</h4>
          <p className="text-xs text-muted-foreground">MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM, OGG, FLAC</p>
          <p className="text-xs text-muted-foreground mt-1">Maximum size: 100MB</p>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" disabled={isUploading} onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleUpload} 
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? `Uploading ${uploadProgress}%` : "Upload"}
        </Button>
      </CardFooter>
    </Card>
  )
} 