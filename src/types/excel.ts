export type CellValue = string | number | boolean | Date | null

export interface SheetPreview {
  name: string
  rowCount: number
  columnCount: number
}

export interface WorkbookMeta {
  fileName: string
  fileSizeBytes: number
  sheetNames: string[]
  sheets: Record<string, SheetPreview>
}

/**
 * A parsed worksheet, stored as a header row plus rows-of-arrays rather than
 * an array of row objects. This avoids repeating column names on every row
 * and keeps memory proportional to cells, not cells * key-strings, which
 * matters once files reach hundreds of thousands of rows.
 */
export interface SheetData {
  sheetName: string
  headers: string[]
  /** Each row is an array aligned positionally with `headers`. */
  rows: CellValue[][]
  /** Excel row number (1-based, matching what a user sees in Excel) for each entry in `rows`. */
  excelRowNumbers: number[]
}

/** One uploaded file's own identity, folded into a combined multi-file ExcelDataset. */
export interface SourceFileSummary {
  fileName: string
  fileSizeBytes: number
  sheetName: string
  recordCount: number
}

/** A problem with one uploaded file (e.g. its headers didn't match the others) - reported per file, not thrown, so the other files can still load. */
export interface ExcelFileIssue {
  fileName: string
  message: string
}

/**
 * The full in-memory dataset the app is currently working with. When more
 * than one Excel file is uploaded, their rows are concatenated here (every
 * file must share the exact same headers, in the same order - see
 * combineExcelFiles.ts) and `sourceFiles`/`rowSourceFileIndex` record which
 * original file each row came from. For the common single-file case
 * `sourceFiles` still has exactly one entry, so callers that only care about
 * "do I need to show a source file column" can simply check
 * `sourceFiles.length > 1`.
 */
export interface ExcelDataset {
  fileName: string
  fileSizeBytes: number
  sheetName: string
  availableSheets: string[]
  sheetSummaries: SheetPreview[]
  headers: string[]
  rows: CellValue[][]
  excelRowNumbers: number[]
  totalRecords: number
  totalColumns: number
  /** Every source file folded into this dataset, in upload order. */
  sourceFiles: SourceFileSummary[]
  /** Parallel to `rows`: for each row, the index into `sourceFiles` it came from. */
  rowSourceFileIndex: number[]
}

/** Looks up which uploaded file a given row came from - null only if the index is out of range. */
export function sourceFileForRow(
  dataset: Pick<ExcelDataset, 'sourceFiles' | 'rowSourceFileIndex'>,
  rowIndex: number
): SourceFileSummary | null {
  const fileIndex = dataset.rowSourceFileIndex[rowIndex]
  if (fileIndex === undefined) return null
  return dataset.sourceFiles[fileIndex] ?? null
}

export interface FileValidationIssue {
  code: string
  message: string
}

export interface FileValidationResult {
  valid: boolean
  issues: FileValidationIssue[]
}
