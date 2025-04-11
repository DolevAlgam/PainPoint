import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Exports pain point insights to an Excel file with multiple sheets
 * @param clusters - The pain point clusters data
 * @param filteredOnly - Whether to export only filtered clusters or all clusters
 */
export function exportInsightsToExcel(clusters: any[], filteredOnly = true) {
  if (!clusters || clusters.length === 0) {
    console.error('No clusters data available to export')
    return
  }

  // Create a new workbook
  const workbook = XLSX.utils.book_new()
  
  // Create summary sheet with overview of all clusters
  const summaryData = clusters.map((cluster, index) => {
    return {
      'ID': index + 1,
      'Cluster Name': cluster.cluster_name,
      'Description': cluster.description,
      'Count': cluster.count,
      'Industries': cluster.industries?.join(', ') || 'N/A',
      'Companies': cluster.companies?.join(', ') || 'N/A',
      'High Impact': cluster.impact_summary?.High || 0,
      'Medium Impact': cluster.impact_summary?.Medium || 0,
      'Low Impact': cluster.impact_summary?.Low || 0
    }
  })
  
  // Add summary sheet to workbook
  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  
  // Set column widths for better readability
  const summaryColWidths = [
    { wch: 5 }, // ID
    { wch: 30 }, // Cluster Name
    { wch: 50 }, // Description
    { wch: 8 }, // Count
    { wch: 35 }, // Industries
    { wch: 35 }, // Companies
    { wch: 12 }, // High Impact
    { wch: 13 }, // Medium Impact
    { wch: 10 }, // Low Impact
  ]
  summarySheet['!cols'] = summaryColWidths
  
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Clusters Summary')
  
  // Create a sheet for each cluster with all its pain points
  clusters.forEach((cluster, clusterIndex) => {
    if (cluster.examples && cluster.examples.length > 0) {
      const painPointsData = cluster.examples.map((pp: any, ppIndex: number) => {
        return {
          'ID': ppIndex + 1,
          'Title': pp.title || 'N/A',
          'Description': pp.description || 'N/A',
          'Impact': pp.impact || 'Not specified',
          'Root Cause': pp.root_cause || 'Not specified',
          'Company': pp.meetings?.companies?.name || 'N/A',
          'Industry': pp.meetings?.companies?.industry || 'N/A',
          'Contact': pp.meetings?.contacts?.name || 'N/A'
        }
      })
      
      // Create a sheet for this cluster
      // Limit sheet name to 31 chars (Excel limitation)
      const sheetName = `${clusterIndex + 1}. ${cluster.cluster_name}`.substring(0, 31)
      const clusterSheet = XLSX.utils.json_to_sheet(painPointsData)
      
      // Set column widths for the cluster sheets
      const clusterColWidths = [
        { wch: 5 }, // ID
        { wch: 35 }, // Title
        { wch: 60 }, // Description
        { wch: 15 }, // Impact
        { wch: 40 }, // Root Cause
        { wch: 25 }, // Company
        { wch: 20 }, // Industry
        { wch: 20 }, // Contact
      ]
      clusterSheet['!cols'] = clusterColWidths
      
      XLSX.utils.book_append_sheet(workbook, clusterSheet, sheetName)
    }
  })
  
  // Create a "blob" for saving
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const fileName = `PainPoint_Insights_${timestamp}.xlsx`
  
  // Convert workbook to binary string
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' })
  
  // Convert binary string to ArrayBuffer
  const buf = new ArrayBuffer(wbout.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < wbout.length; i++) {
    view[i] = wbout.charCodeAt(i) & 0xFF
  }
  
  // Create Blob and save file
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, fileName)
}

/**
 * Exports pain points for a specific meeting to Excel
 * @param painPoints - Array of pain points to export
 * @param meetingTitle - Title of the meeting for the filename
 */
export function exportMeetingPainPoints(painPoints: any[], meetingTitle?: string) {
  if (!painPoints || painPoints.length === 0) {
    console.error('No pain points available to export')
    return
  }

  // Create a new workbook
  const workbook = XLSX.utils.book_new()
  
  // Create pain points data
  const painPointsData = painPoints.map((pp, index) => {
    return {
      'ID': index + 1,
      'Description': pp.description || 'N/A',
      'Root Cause': pp.root_cause || 'Not specified',
      'Impact': pp.impact || 'Not specified',
      'Created At': pp.created_at ? new Date(pp.created_at).toLocaleDateString() : 'N/A'
    }
  })
  
  // Add pain points sheet
  const ppSheet = XLSX.utils.json_to_sheet(painPointsData)
  
  // Set column widths for better readability
  const colWidths = [
    { wch: 5 },  // ID
    { wch: 60 }, // Description
    { wch: 40 }, // Root Cause
    { wch: 15 }, // Impact
    { wch: 15 }  // Created At
  ]
  ppSheet['!cols'] = colWidths
  
  XLSX.utils.book_append_sheet(workbook, ppSheet, 'Pain Points')
  
  // Generate file name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const sanitizedTitle = meetingTitle ? 
    meetingTitle.replace(/[^\w\s-]/g, '').substring(0, 30) : 
    'Meeting'
  const fileName = `PainPoints_${sanitizedTitle}_${timestamp}.xlsx`
  
  // Convert workbook to binary string
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' })
  
  // Convert binary string to ArrayBuffer
  const buf = new ArrayBuffer(wbout.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < wbout.length; i++) {
    view[i] = wbout.charCodeAt(i) & 0xFF
  }
  
  // Create Blob and save file
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, fileName)
}

/**
 * Exports contacts to Excel file
 * @param contacts - Array of contacts to export
 */
export function exportContacts(contacts: any[]) {
  if (!contacts || contacts.length === 0) {
    console.error('No contacts available to export')
    return
  }

  // Create a new workbook
  const workbook = XLSX.utils.book_new()
  
  // Create contacts data
  const contactsData = contacts.map((contact, index) => {
    return {
      'ID': contact.id || index + 1,
      'Name': contact.name || 'N/A',
      'Email': contact.email || 'N/A',
      'Role': contact.role || 'N/A',
      'Company': contact.companies?.name || 'N/A',
      'Industry': contact.companies?.industry || 'N/A',
      'Notes': contact.notes || '',
      'Created At': contact.created_at ? new Date(contact.created_at).toLocaleDateString() : 'N/A'
    }
  })
  
  // Add contacts sheet
  const contactsSheet = XLSX.utils.json_to_sheet(contactsData)
  
  // Set column widths for better readability
  const colWidths = [
    { wch: 10 }, // ID
    { wch: 25 }, // Name
    { wch: 30 }, // Email
    { wch: 20 }, // Role
    { wch: 25 }, // Company
    { wch: 20 }, // Industry
    { wch: 40 }, // Notes
    { wch: 15 }  // Created At
  ]
  contactsSheet['!cols'] = colWidths
  
  XLSX.utils.book_append_sheet(workbook, contactsSheet, 'Contacts')
  
  // Generate file name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const fileName = `Contacts_${timestamp}.xlsx`
  
  // Convert and save
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' })
  const buf = new ArrayBuffer(wbout.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < wbout.length; i++) {
    view[i] = wbout.charCodeAt(i) & 0xFF
  }
  
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, fileName)
}

/**
 * Exports meetings to Excel file
 * @param meetings - Array of meetings to export
 */
export function exportMeetings(meetings: any[]) {
  if (!meetings || meetings.length === 0) {
    console.error('No meetings available to export')
    return
  }

  // Create a new workbook
  const workbook = XLSX.utils.book_new()
  
  // Create meetings data for summary sheet
  const meetingsData = meetings.map((meeting, index) => {
    return {
      'ID': meeting.id || index + 1,
      'Date': meeting.date ? new Date(meeting.date).toLocaleDateString() : 'N/A',
      'Contact': meeting.contacts?.name || 'N/A',
      'Company': meeting.companies?.name || 'N/A',
      'Industry': meeting.companies?.industry || 'N/A',
      'Notes': meeting.notes || '',
      'Pain Points Count': Array.isArray(meeting.pain_points) ? meeting.pain_points.length : 0,
      'Has Transcript': Array.isArray(meeting.transcripts) && meeting.transcripts.length > 0 ? 'Yes' : 'No',
      'Created At': meeting.created_at ? new Date(meeting.created_at).toLocaleDateString() : 'N/A'
    }
  })
  
  // Add meetings summary sheet
  const meetingsSheet = XLSX.utils.json_to_sheet(meetingsData)
  
  // Set column widths for better readability
  const colWidths = [
    { wch: 10 }, // ID
    { wch: 15 }, // Date
    { wch: 25 }, // Contact
    { wch: 25 }, // Company
    { wch: 20 }, // Industry
    { wch: 40 }, // Notes
    { wch: 15 }, // Pain Points Count
    { wch: 15 }, // Has Transcript
    { wch: 15 }  // Created At
  ]
  meetingsSheet['!cols'] = colWidths
  
  XLSX.utils.book_append_sheet(workbook, meetingsSheet, 'Meetings Summary')
  
  // Create individual sheets for each meeting with transcripts and pain points
  meetings.forEach((meeting, index) => {
    // Determine if this meeting has a transcript or pain points to include
    const hasTranscript = Array.isArray(meeting.transcripts) && meeting.transcripts.length > 0
    const hasPainPoints = Array.isArray(meeting.pain_points) && meeting.pain_points.length > 0
    
    if (hasTranscript || hasPainPoints) {
      // Use just the meeting index for the sheet name
      const safeSheetName = `Meeting ${index + 1}`.substring(0, 31)
      
      // Create data arrays for this meeting's detailed sheet
      const detailRows = []
      
      // Add meeting header info - remove title
      detailRows.push(
        { A: "Meeting Details", B: "" },
        { A: "Date:", B: meeting.date ? new Date(meeting.date).toLocaleDateString() : 'N/A' },
        { A: "Contact:", B: meeting.contacts?.name || 'N/A' },
        { A: "Company:", B: meeting.companies?.name || 'N/A' },
        { A: "Notes:", B: meeting.notes || 'N/A' },
        { A: "", B: "" }
      )
      
      // Add transcript if available
      if (hasTranscript) {
        detailRows.push(
          { A: "Transcript", B: "" },
          { A: "", B: "" }
        )
        
        const transcriptContent = meeting.transcripts[0]?.content || ''
        
        // Split transcript into chunks to avoid Excel's 32,767 character limit per cell
        if (transcriptContent) {
          const MAX_CELL_LENGTH = 32000; // Setting a safe limit below Excel's maximum
          
          // First try paragraph splitting
          const paragraphs = transcriptContent.split('\n\n');
          
          // Handle each paragraph, further breaking down if needed
          paragraphs.forEach((paragraph: string) => {
            if (!paragraph.trim()) return;
            
            // If paragraph fits in one cell, add it directly
            if (paragraph.length <= MAX_CELL_LENGTH) {
              detailRows.push({ A: "", B: paragraph.trim() });
            } else {
              // For longer paragraphs, break them into chunks
              let remainingText = paragraph.trim();
              while (remainingText.length > 0) {
                // Find a good breaking point (sentence end or space)
                let chunkSize = Math.min(remainingText.length, MAX_CELL_LENGTH);
                if (chunkSize < remainingText.length) {
                  // Try to break at sentence end
                  const sentenceBreak = remainingText.lastIndexOf('. ', chunkSize);
                  if (sentenceBreak > chunkSize * 0.7) { // Only use if reasonably positioned
                    chunkSize = sentenceBreak + 1; // Include the period
                  } else {
                    // Try to break at space
                    const spaceBreak = remainingText.lastIndexOf(' ', chunkSize);
                    if (spaceBreak > chunkSize * 0.8) { // Only use if reasonably positioned
                      chunkSize = spaceBreak + 1; // Include the space
                    }
                  }
                }
                
                // Add the chunk as a row
                const chunk = remainingText.substring(0, chunkSize);
                detailRows.push({ A: "", B: chunk });
                
                // Remove processed chunk
                remainingText = remainingText.substring(chunkSize);
              }
            }
          });
        } else {
          detailRows.push({ A: "", B: "No transcript content available" });
        }
        
        // Add separator
        detailRows.push({ A: "", B: "" });
      }
      
      // Add pain points if available
      if (hasPainPoints) {
        detailRows.push(
          { A: "Pain Points", B: "" },
          { A: "", B: "" },
          { A: "ID", B: "Description", C: "Root Cause", D: "Impact" }
        )
        
        meeting.pain_points.forEach((pp: any, ppIndex: number) => {
          detailRows.push({
            A: ppIndex + 1,
            B: pp.description || 'N/A',
            C: pp.root_cause || 'N/A',
            D: pp.impact || 'N/A'
          })
        })
      }
      
      // Create a worksheet for this meeting
      const meetingSheet = XLSX.utils.json_to_sheet(detailRows, { skipHeader: true })
      
      // Set custom column widths for the detail sheets
      meetingSheet['!cols'] = [
        { wch: 15 },  // A - Labels or IDs
        { wch: 60 },  // B - Description or Values
        { wch: 40 },  // C - Root Cause
        { wch: 15 }   // D - Impact
      ]
      
      // Add the meeting detail sheet to the workbook
      XLSX.utils.book_append_sheet(workbook, meetingSheet, safeSheetName)
    }
  })
  
  // Generate file name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const fileName = `Meetings_${timestamp}.xlsx`
  
  // Convert and save
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' })
  const buf = new ArrayBuffer(wbout.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < wbout.length; i++) {
    view[i] = wbout.charCodeAt(i) & 0xFF
  }
  
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, fileName)
}
