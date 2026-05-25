import * as XLSX from 'xlsx'

export function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = 'נתונים') {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Set column widths
  const cols = Object.keys(data[0] ?? {}).map(() => ({ wch: 20 }))
  ws['!cols'] = cols

  XLSX.writeFile(wb, `${filename}.xlsx`)
}
