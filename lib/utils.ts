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
