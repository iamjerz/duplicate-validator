import * as XLSX from 'xlsx'

/** Triggers a browser download of a workbook as .xlsx - no server involved. */
export function downloadWorkbookAsXlsx(workbook: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(workbook, `${fileName}.xlsx`, { bookType: 'xlsx' })
}

/** Triggers a browser download of a workbook's first sheet as .csv. */
export function downloadWorkbookAsCsv(workbook: XLSX.WorkBook, fileName: string) {
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Triggers a browser download of any JSON-serializable value as a .json file - no server involved, same pattern as downloadWorkbookAsCsv. */
export function downloadJsonFile(data: unknown, fileName: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
