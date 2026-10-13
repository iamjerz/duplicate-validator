import type { CellValue, ExcelDataset, SheetData, SourceFileSummary, WorkbookMeta } from '@/types'

export interface ExcelFileForCombining {
  meta: WorkbookMeta
  data: SheetData
}

/**
 * True when two header lists are identical, in the same order. Multiple
 * uploaded Excel files are only combined when every file's headers pass this
 * check against the others - see buildCombinedDataset and
 * ValidationSessionContext's anchorHeaders. An exact match (rather than a
 * fuzzy "looks close enough") is deliberate: silently combining files whose
 * columns don't actually line up would misattribute values to the wrong
 * field for every row of whichever file didn't match.
 */
export function headersMatch(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((header, i) => header === b[i])
}

/**
 * Concatenates one or more already-read Excel files into a single dataset,
 * in the order given, tagging every row with which file it came from
 * (sourceFiles / rowSourceFileIndex - see ExcelDataset). Callers are
 * expected to have already confirmed every file's headers match via
 * headersMatch before getting here, but it's re-checked here too so a
 * combined dataset can never silently misalign columns from different
 * files. For the common single-file case this just wraps that one file's
 * rows with a one-entry sourceFiles list.
 *
 * Returns null for an empty file list (nothing to combine) or if the
 * defensive header check fails.
 */
export function buildCombinedDataset(files: ExcelFileForCombining[]): ExcelDataset | null {
  if (files.length === 0) return null

  const headers = files[0].data.headers
  for (const file of files) {
    if (!headersMatch(file.data.headers, headers)) return null
  }

  const rows: CellValue[][] = []
  const excelRowNumbers: number[] = []
  const rowSourceFileIndex: number[] = []
  const sourceFiles: SourceFileSummary[] = []

  files.forEach((file, fileIndex) => {
    sourceFiles.push({
      fileName: file.meta.fileName,
      fileSizeBytes: file.meta.fileSizeBytes,
      sheetName: file.data.sheetName,
      recordCount: file.data.rows.length,
    })
    for (let i = 0; i < file.data.rows.length; i++) {
      rows.push(file.data.rows[i])
      excelRowNumbers.push(file.data.excelRowNumbers[i])
      rowSourceFileIndex.push(fileIndex)
    }
  })

  const isSingleFile = files.length === 1
  const fileSizeBytes = files.reduce((sum, file) => sum + file.meta.fileSizeBytes, 0)

  return {
    fileName: isSingleFile ? files[0].meta.fileName : `Combined (${files.length} files)`,
    fileSizeBytes,
    sheetName: isSingleFile ? files[0].data.sheetName : 'Combined',
    availableSheets: isSingleFile ? files[0].meta.sheetNames : [],
    sheetSummaries: isSingleFile ? Object.values(files[0].meta.sheets) : [],
    headers,
    rows,
    excelRowNumbers,
    totalRecords: rows.length,
    totalColumns: headers.length,
    sourceFiles,
    rowSourceFileIndex,
  }
}
