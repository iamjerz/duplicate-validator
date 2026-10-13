import * as XLSX from 'xlsx'
import type { CellValue, SheetData, SheetPreview, WorkbookMeta } from '@/types'

export interface ParsedWorkbook {
  workbook: XLSX.WorkBook
  meta: WorkbookMeta
}

/**
 * Reads an uploaded Excel file into memory. `cellDates: true` is important:
 * it makes SheetJS convert genuinely date-formatted cells into JS `Date`
 * objects up front, so the normalizer never has to guess whether a bare
 * number is a date serial or a plain amount.
 */
export async function readWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheets: Record<string, SheetPreview> = {}
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const ref = sheet['!ref']
    if (!ref) {
      sheets[name] = { name, rowCount: 0, columnCount: 0 }
      continue
    }
    const range = XLSX.utils.decode_range(ref)
    sheets[name] = {
      name,
      rowCount: Math.max(range.e.r - range.s.r, 0), // approximate: total rows minus the header row
      columnCount: range.e.c - range.s.c + 1,
    }
  }

  const meta: WorkbookMeta = {
    fileName: file.name,
    fileSizeBytes: file.size,
    sheetNames: workbook.SheetNames,
    sheets,
  }

  return { workbook, meta }
}

export interface SheetValidationIssue {
  code: string
  message: string
}

export interface ReadSheetResult {
  data: SheetData | null
  issues: SheetValidationIssue[]
}

function normalizeRawCell(value: unknown): CellValue {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

/**
 * Some source systems pack several related fields into one Excel cell as a
 * JSON object - e.g. a whole "Bill To"/"Source To" address bundled into one
 * cell - instead of giving each sub-field its own column. When a cell's raw
 * text is itself valid JSON and parses to a plain object, its keys get
 * pulled out as their own fields (see readSheet) so they can be matched
 * against rule fields by name, the same as any real column. Returns null
 * for anything that isn't exactly this shape - a plain string, a JSON
 * array, a number, unparseable text, or an object with a nested
 * object/array value - so ordinary cells are never touched and a blob this
 * app doesn't fully understand is left alone rather than partially exploded.
 */
function tryParseJsonObjectCell(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const result: Record<string, string> = {}
  for (const [rawKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    const key = rawKey.trim()
    if (!key || value === null || value === undefined) continue
    if (typeof value === 'object') {
      // A nested object/array means this blob isn't the flat "several
      // sibling fields" shape this app expects. Bail on the WHOLE cell
      // rather than exploding the keys we do understand and silently
      // dropping the rest - a partial, silent explosion would be harder to
      // notice than leaving the cell as plain text.
      return null
    }
    result[key] = String(value)
  }
  return Object.keys(result).length > 0 ? result : null
}

/**
 * Extracts one worksheet as a header row plus rows-of-arrays (rather than an
 * array of row objects), keeping memory proportional to cells rather than
 * cells * repeated-key-strings once a file reaches hundreds of thousands of
 * rows. Excel row numbers are computed from the sheet's own row positions
 * (not just array position) so they stay correct even if blank rows are
 * skipped or the data does not start at row 1.
 */
export function readSheet(workbook: XLSX.WorkBook, sheetName: string): ReadSheetResult {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    return { data: null, issues: [{ code: 'missing-sheet', message: `Worksheet "${sheetName}" was not found.` }] }
  }

  const ref = sheet['!ref']
  if (!ref) {
    return { data: null, issues: [{ code: 'empty-sheet', message: 'This worksheet has no data.' }] }
  }

  const range = XLSX.utils.decode_range(ref)
  const headerExcelRow = range.s.r + 1 // 1-based row number of the header row

  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as unknown[][]

  if (grid.length === 0) {
    return { data: null, issues: [{ code: 'empty-sheet', message: 'This worksheet has no data.' }] }
  }

  const issues: SheetValidationIssue[] = []
  const rawHeaders = grid[0] ?? []

  if (rawHeaders.length === 0) {
    issues.push({ code: 'no-headers', message: 'No column headers were found in the first row.' })
  }

  const headers: string[] = rawHeaders.map((h, i) => {
    if (h === null || h === undefined || String(h).trim() === '') return `Column ${i + 1}`
    return String(h).trim()
  })

  const seen = new Map<string, number>()
  const duplicateHeaders: string[] = []
  for (const header of headers) {
    const count = (seen.get(header) ?? 0) + 1
    seen.set(header, count)
    if (count === 2) duplicateHeaders.push(header)
  }
  if (duplicateHeaders.length > 0) {
    issues.push({
      code: 'duplicate-headers',
      message: `These column headers appear more than once: ${duplicateHeaders.join(', ')}.`,
    })
  }

  // First pass: build each row's plain values, and separately collect any
  // cell whose raw text is itself a JSON object (see tryParseJsonObjectCell).
  // Every discovered key becomes a trailing column shared by the whole
  // sheet - in first-seen order - so every row lines up with the same
  // headers whether or not that particular row had a packed cell.
  const baseHeaderIndex = new Map<string, number>()
  headers.forEach((h, i) => baseHeaderIndex.set(h, i))
  const extraHeaderOrder: string[] = []
  const extraHeaderIndex = new Map<string, number>()

  interface PendingRow {
    excelRowNumber: number
    values: CellValue[]
    /** Keys discovered from packed JSON cells in this row. If the same key appears in more than one cell, the last one processed wins. */
    exploded: Map<string, string>
  }
  const pendingRows: PendingRow[] = []

  for (let i = 1; i < grid.length; i++) {
    const rawRow = grid[i] ?? []
    const isBlank = rawRow.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')
    if (isBlank) continue

    const values: CellValue[] = []
    const exploded = new Map<string, string>()

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const objectFields = tryParseJsonObjectCell(rawRow[colIdx])
      if (!objectFields) {
        values.push(normalizeRawCell(rawRow[colIdx]))
        continue
      }
      values.push(null) // the packed cell's own column carries no direct value once exploded
      for (const [key, value] of Object.entries(objectFields)) {
        exploded.set(key, value)
        if (!baseHeaderIndex.has(key) && !extraHeaderIndex.has(key)) {
          extraHeaderIndex.set(key, extraHeaderOrder.length)
          extraHeaderOrder.push(key)
        }
      }
    }

    pendingRows.push({ excelRowNumber: headerExcelRow + i, values, exploded })
  }

  const finalHeaders = [...headers, ...extraHeaderOrder]
  const extraColumnStart = headers.length

  const rows: CellValue[][] = []
  const excelRowNumbers: number[] = []
  for (const pending of pendingRows) {
    const row: CellValue[] = [...pending.values, ...extraHeaderOrder.map(() => null)]
    for (const [key, value] of pending.exploded) {
      const baseIdx = baseHeaderIndex.get(key)
      if (baseIdx !== undefined) {
        // A real column already has this exact name - prefer its own value
        // and only fill it from the packed cell when the real column is
        // empty (including whitespace-only, consistent with how blanks are
        // treated everywhere else - see DataNormalizer.classifyBlank).
        const existing = row[baseIdx]
        const isExistingBlank =
          existing === null || existing === undefined || (typeof existing === 'string' && existing.trim() === '')
        if (isExistingBlank) {
          row[baseIdx] = value
        }
        continue
      }
      const extraOffset = extraHeaderIndex.get(key)
      if (extraOffset !== undefined) {
        row[extraColumnStart + extraOffset] = value
      }
    }
    rows.push(row)
    excelRowNumbers.push(pending.excelRowNumber)
  }

  if (rows.length === 0) {
    issues.push({ code: 'no-records', message: 'This worksheet has headers but no data rows.' })
  }

  if (extraHeaderOrder.length > 0) {
    issues.push({
      code: 'exploded-json-columns',
      message: `Detected ${extraHeaderOrder.length} field${extraHeaderOrder.length === 1 ? '' : 's'} packed as JSON inside a cell and split ${extraHeaderOrder.length === 1 ? 'it' : 'them'} out automatically: ${extraHeaderOrder.join(', ')}.`,
    })
  }

  return { data: { sheetName, headers: finalHeaders, rows, excelRowNumbers }, issues }
}
