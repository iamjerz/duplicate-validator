import * as XLSX from 'xlsx'
import { sourceFileForRow, type CellValue, type Disposition, type DuplicateGroup, type DuplicateStatus, type ExcelDataset, type ValidationResult } from '@/types'
import { findColumnByName } from '@/utils/fieldMatching'
import { normalizeValue, isBlank } from '@/engine'

const SOURCE_FILE_COLUMN = 'Source File'

const AUDIT_ID_FIELD = 'Audit ID'
const AUDIT_STATUS_FIELD = 'Audit Exception Status'
const REQUIRED_STATUS = 'open'

export type ExportKind = 'duplicates' | 'potential-duplicates' | 'flagged' | 'unique' | 'complete'

type ExportRow = Record<string, CellValue | string | number>

/**
 * Finds the source file's own "Add Action" column - freight-audit exports
 * typically already reserve a column by this name for a reviewer's note,
 * and that's where a recorded Disposition is written on export (see
 * recordsForStatus/allRecordsRows) rather than as a new column. Returns
 * null if this particular file has no such column, in which case a
 * Disposition simply has nowhere to go - see ExportMenu, which warns the
 * user about this rather than letting it fail silently.
 */
export function findAddActionColumn(headers: string[]): string | null {
  return findColumnByName(headers, 'Add Action')
}

/**
 * Finds the source file's own "Add Comments" column - the same idea as
 * findAddActionColumn, but for the reviewer's free-text Comments field
 * (see CommentsField) rather than the Disposition dropdown.
 */
export function findAddCommentsColumn(headers: string[]): string | null {
  return findColumnByName(headers, 'Add Comments')
}

/**
 * The column name to add for "which uploaded file did this row come from" -
 * null when the dataset came from a single file (the common case), in which
 * case no such column is added at all. Falls back to a disambiguated name
 * if the source data already has a real column literally named "Source
 * File" (matched the same case/spacing-insensitive way as
 * findAddActionColumn), so a genuine data column already in the file is
 * never silently overwritten by this one. Resolved once per export (not per
 * row) and threaded into recordRow by the caller.
 */
export function resolveSourceFileColumn(dataset: ExcelDataset): string | null {
  if (dataset.sourceFiles.length <= 1) return null
  if (!findColumnByName(dataset.headers, SOURCE_FILE_COLUMN)) return SOURCE_FILE_COLUMN
  return `${SOURCE_FILE_COLUMN} (Validator)`
}

function cellAt(dataset: ExcelDataset, rowIndex: number, columnHeader: string): CellValue {
  const colIdx = dataset.headers.indexOf(columnHeader)
  if (colIdx === -1) return null
  const value = dataset.rows[rowIndex]?.[colIdx]
  return value === undefined ? null : value
}

/**
 * Whether ONE record qualifies to have a recorded Disposition/Comment
 * actually written into its Add Action/Add Comments cell on export: a
 * non-blank "Audit ID" and an "Audit Exception Status" of "Open" - matched
 * to the file's own columns the same case/spacing/punctuation-insensitive
 * way "Add Action" is (see findColumnByName), independent of whatever rule
 * is currently loaded.
 *
 * This is checked per RECORD, not per group - a reviewer can always set a
 * Disposition/Comment for a whole group in the UI regardless of this check
 * (see DispositionSelect/CommentsField), but on export it's applied only to
 * the records within that group that individually qualify. A record that
 * doesn't (a blank Audit ID, a non-Open status, or the columns not existing
 * in this file at all - fails closed rather than guessing) simply keeps
 * whatever was already in its Add Action/Add Comments cell, exactly as if
 * nothing had been recorded for it.
 */
export function isRecordExportEligible(dataset: ExcelDataset, rowIndex: number): boolean {
  const auditIdColumn = findColumnByName(dataset.headers, AUDIT_ID_FIELD)
  const auditStatusColumn = findColumnByName(dataset.headers, AUDIT_STATUS_FIELD)
  if (!auditIdColumn || !auditStatusColumn) return false

  const auditId = normalizeValue(cellAt(dataset, rowIndex, auditIdColumn))
  if (isBlank(auditId)) return false

  const status = normalizeValue(cellAt(dataset, rowIndex, auditStatusColumn))
  if (isBlank(status) || status.normalized !== REQUIRED_STATUS) return false

  return true
}

/**
 * A real freight-audit export can repeat a column header verbatim - every
 * sample/production file this app has ever been run against has "Root Id"
 * TWICE (once early, holding the record's real identifier used for
 * duplicate matching, and again much later as a mostly-blank column that
 * happens to share the exact same header text). dataset.headers/dataset.rows
 * are positional arrays and carry both columns just fine, but ExportRow
 * (below) is an object keyed BY that header text - doing `row[header] =
 * value` for every column in order, as recordRow used to, let the LATER
 * same-named column's value silently overwrite the EARLIER one's in the
 * resulting object, so only one of the two original columns survived into
 * the export at all, under whichever value happened to come last (in the
 * real files, that's the mostly-blank second "Root Id" - so the exported
 * file showed "-" where the original had the real identifier). That is a
 * real, confirmed data-loss bug, not a hypothetical one.
 *
 * ExportRow keeps its convenient by-name object shape for everything that
 * isn't repeated (every other column, in every real file). To still get a
 * repeated column's distinct original value for EACH occurrence into the
 * actual written sheet, recordRow additionally stashes the row's raw,
 * positional cell values under this module-private Symbol key - invisible
 * to Object.keys/JSON/the spread operator, so it changes nothing about
 * ExportRow's visible shape or any existing by-name access - and
 * sheetFromRows reads it back to build the sheet positionally (via
 * aoa_to_sheet), which is the only representation that can losslessly
 * reproduce two columns sharing one header text, exactly as the source file
 * had them.
 */
const EXPORT_ROW_CELLS = Symbol('exportRowCells')

interface ExportRowCells {
  headers: string[]
  cells: (CellValue | string | number)[]
}

function getExportRowCells(row: ExportRow): ExportRowCells | undefined {
  return (row as unknown as Record<symbol, ExportRowCells | undefined>)[EXPORT_ROW_CELLS]
}

/**
 * Rebuilds one record's row exactly as it appeared in the source file - the
 * same columns, in the same order, with the same values (a Date cell stays
 * a real Date rather than being reformatted to text - see sheetFromRows'
 * cellDates option) - INCLUDING a column whose header text is repeated
 * elsewhere in the same file (see the EXPORT_ROW_CELLS comment above: both
 * occurrences keep their own distinct original value). A Disposition is
 * layered on afterward, in place, by the caller (recordsForStatus/
 * allRecordsRows) via setExportCell, which keeps both representations in
 * sync. The only column ever added here is a trailing Source File column,
 * and only when this export spans more than one combined uploaded file
 * (sourceFileColumn is null otherwise - see resolveSourceFileColumn).
 */
function recordRow(dataset: ExcelDataset, rowIndex: number, sourceFileColumn: string | null): ExportRow {
  const row: ExportRow = {}
  const rawValues = dataset.rows[rowIndex]
  const cellHeaders = dataset.headers.slice()
  const cells: (CellValue | string | number)[] = rawValues.slice()
  dataset.headers.forEach((header, i) => {
    row[header] = rawValues[i]
  })
  if (sourceFileColumn) {
    const sourceFileName = sourceFileForRow(dataset, rowIndex)?.fileName ?? ''
    row[sourceFileColumn] = sourceFileName
    cellHeaders.push(sourceFileColumn)
    cells.push(sourceFileName)
  }
  Object.defineProperty(row, EXPORT_ROW_CELLS, {
    value: { headers: cellHeaders, cells },
    enumerable: false,
  })
  return row
}

/**
 * Writes a value into one of a row's columns by name, keeping both of
 * recordRow's representations in sync: the by-name object key (what every
 * existing reader of an ExportRow uses) and the positional cell actually
 * written into the final sheet (see sheetFromRows). Targets the FIRST
 * column matching that name, same as every other fixed-name lookup in this
 * file (cellAt, isRecordExportEligible) - Add Action/Add Comments have never
 * been observed repeated in a real file, but this keeps the behavior
 * well-defined and consistent with the rest of the module if one ever were.
 */
function setExportCell(row: ExportRow, columnName: string, value: string): void {
  row[columnName] = value
  const rawCells = getExportRowCells(row)
  if (!rawCells) return
  const index = rawCells.headers.indexOf(columnName)
  if (index !== -1) rawCells.cells[index] = value
}

/**
 * Builds the per-record rows for one status (Duplicate Records / Potential
 * Duplicates / Unique Records) - a filtered subset of the file, one row per
 * matching record, otherwise mirroring the source exactly (see recordRow).
 * If a record's group has a recorded Disposition/Comment AND this file has
 * its own "Add Action"/"Add Comments" column AND this specific record is
 * export-eligible (see isRecordExportEligible - a non-blank Audit ID and an
 * Open Audit Exception Status), that cell is overwritten with the recorded
 * value. A record with nothing recorded, or that isn't export-eligible,
 * keeps whatever was already in that cell, exactly like every other
 * untouched column. Exported for direct testing (see buildExportWorkbook.test.ts).
 */
export function recordsForStatus(
  dataset: ExcelDataset,
  groups: DuplicateGroup[],
  status: Exclude<DuplicateStatus, 'VALIDATION_ERROR'>,
  dispositions: Map<string, Disposition>,
  comments: Map<string, string> = new Map()
): ExportRow[] {
  const addActionColumn = findAddActionColumn(dataset.headers)
  const addCommentsColumn = findAddCommentsColumn(dataset.headers)
  const sourceFileColumn = resolveSourceFileColumn(dataset)
  const out: ExportRow[] = []
  for (const g of groups) {
    if (g.status !== status) continue
    const disposition = dispositions.get(g.id)
    const comment = comments.get(g.id)
    for (const record of g.records) {
      const row = recordRow(dataset, record.rowIndex, sourceFileColumn)
      const eligible = isRecordExportEligible(dataset, record.rowIndex)
      if (disposition && addActionColumn && eligible) {
        setExportCell(row, addActionColumn, disposition)
      }
      if (comment && addCommentsColumn && eligible) {
        setExportCell(row, addCommentsColumn, comment)
      }
      out.push(row)
    }
  }
  return out
}

/**
 * Builds one row per record in the ORIGINAL file, in the file's own order -
 * unlike recordsForStatus, nothing is filtered out by duplicate status, and
 * a record with a Validation Error (never placed into any group at all) is
 * still included exactly as it was. This is what the "complete" export uses
 * so it really is the whole file back, not an analysis report - see
 * buildExportWorkbook. Same Add Action/Add Comments/export-eligibility rule
 * as recordsForStatus: only a record whose group has a recorded
 * Disposition/Comment AND that is itself export-eligible (see
 * isRecordExportEligible) gets that cell overwritten; everything else -
 * including a record with no group, nothing recorded, or that isn't
 * export-eligible - keeps whatever was already there. Exported for direct
 * testing.
 */
export function allRecordsRows(
  dataset: ExcelDataset,
  groups: DuplicateGroup[],
  dispositions: Map<string, Disposition>,
  comments: Map<string, string> = new Map()
): ExportRow[] {
  const addActionColumn = findAddActionColumn(dataset.headers)
  const addCommentsColumn = findAddCommentsColumn(dataset.headers)
  const sourceFileColumn = resolveSourceFileColumn(dataset)

  const dispositionByRowIndex = new Map<number, Disposition>()
  const commentByRowIndex = new Map<number, string>()
  for (const g of groups) {
    const disposition = dispositions.get(g.id)
    const comment = comments.get(g.id)
    if (!disposition && !comment) continue
    for (const record of g.records) {
      if (disposition) dispositionByRowIndex.set(record.rowIndex, disposition)
      if (comment) commentByRowIndex.set(record.rowIndex, comment)
    }
  }

  const out: ExportRow[] = []
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
    const row = recordRow(dataset, rowIndex, sourceFileColumn)
    const eligible = isRecordExportEligible(dataset, rowIndex)
    const disposition = dispositionByRowIndex.get(rowIndex)
    if (disposition && addActionColumn && eligible) {
      setExportCell(row, addActionColumn, disposition)
    }
    const comment = commentByRowIndex.get(rowIndex)
    if (comment && addCommentsColumn && eligible) {
      setExportCell(row, addCommentsColumn, comment)
    }
    out.push(row)
  }
  return out
}

/**
 * Builds the per-record rows for every flagged (non-UNIQUE) group together -
 * DUPLICATE and POTENTIAL_DUPLICATE combined into one list, in that order.
 * Exists for the same reason the Results table's Status column, filter
 * checkboxes, and KPI cards/chart already collapse that same raw
 * distinction into one rule-driven label (see resolveDuplicateTypeLabel in
 * DuplicateTypeClassification.ts): every flagged row under one rule already
 * shows that SAME label there, so an export still split into two separate
 * "Duplicate Records"/"Potential Duplicates" files no longer corresponds to
 * anything a reviewer can tell apart on screen. Reuses recordsForStatus for
 * each raw status and concatenates, so the per-record
 * disposition/comment/eligibility logic can never drift between the two -
 * this is purely a grouping convenience on top of it. Exported for direct
 * testing (see buildExportWorkbook.test.ts).
 */
export function recordsForFlagged(
  dataset: ExcelDataset,
  groups: DuplicateGroup[],
  dispositions: Map<string, Disposition>,
  comments: Map<string, string> = new Map()
): ExportRow[] {
  return [
    ...recordsForStatus(dataset, groups, 'DUPLICATE', dispositions, comments),
    ...recordsForStatus(dataset, groups, 'POTENTIAL_DUPLICATE', dispositions, comments),
  ]
}

const SHEET_NAME_MAX_LENGTH = 31
const INVALID_SHEET_NAME_CHARS = /[:\\/?*[\]]/g

/**
 * Excel sheet (tab) names can't exceed 31 characters and can't contain
 * : \ / ? * [ ] - every sheet name this app has ever used was either a short
 * static string ("Duplicate Records", "Unique Records", ...) or the
 * original uploaded sheet name (already valid, since it came from an Excel
 * file), so this was never a concern before. The 'flagged' export's sheet
 * name is now a rule's own label instead (see buildExportWorkbook), whose
 * fallback is literally the rule's uploaded file name (e.g. "True DUP_SHIP -
 * corrected.json Records") - easily long enough, or containing characters,
 * to violate either rule. Replaces invalid characters with a space and
 * truncates from the end (keeping the more identifying start of the name)
 * rather than letting SheetJS error or silently mangle it.
 */
export function sheetSafeName(name: string): string {
  const cleaned = name.replace(INVALID_SHEET_NAME_CHARS, ' ').trim()
  return cleaned.length > SHEET_NAME_MAX_LENGTH ? cleaned.slice(0, SHEET_NAME_MAX_LENGTH).trim() : cleaned
}

/**
 * Turns the per-record rows into the actual SheetJS sheet. Built positionally
 * (aoa_to_sheet: an explicit header row plus one array per record, cell-for-
 * cell) rather than from the rows' by-name object keys, specifically so a
 * header repeated elsewhere in the source file (see the EXPORT_ROW_CELLS
 * comment above recordRow - a real, observed case, not hypothetical) keeps
 * BOTH occurrences and both of their distinct original values, exactly as
 * the source file had them, instead of one silently overwriting the other.
 * cellDates keeps a JS Date value as a real Excel date cell instead of
 * silently downgrading it to a plain serial number or reformatted text -
 * part of keeping the export's format matching the source file's own.
 */
function sheetFromRows(rows: ExportRow[]) {
  if (rows.length === 0) {
    return XLSX.utils.json_to_sheet([{ ' ': 'No records in this category.' } as ExportRow], { cellDates: true })
  }

  const firstRowCells = getExportRowCells(rows[0])
  if (!firstRowCells) {
    // Defensive fallback only - every ExportRow in this app comes from
    // recordRow, which always stashes this. Keeps this function safe (if
    // less precise about repeated headers) for any row that somehow didn't.
    return XLSX.utils.json_to_sheet(rows, { cellDates: true })
  }

  const aoa: (CellValue | string | number | null)[][] = [firstRowCells.headers]
  for (const row of rows) {
    aoa.push(getExportRowCells(row)?.cells ?? firstRowCells.headers.map((h) => row[h] ?? null))
  }
  return XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
}

function appendSheet(wb: XLSX.WorkBook, rows: ExportRow[], name: string) {
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), name)
}

/**
 * Builds the appropriate SheetJS workbook in memory for one export option.
 * Every option is a single sheet that mirrors the source Excel file's own
 * columns exactly - nothing added, nothing renamed, no extra sheets, and a
 * column whose header text repeats elsewhere in the same file (every real
 * file this app ships with has "Root Id" twice - see the EXPORT_ROW_CELLS
 * comment above recordRow) comes back with both occurrences and both of
 * their own original values intact, not collapsed into one - except that a
 * recorded Disposition/Comment (session-only, groupId -> value - see
 * ValidationSessionContext) is written into the file's own "Add Action" /
 * "Add Comments" columns where they exist (see findAddActionColumn,
 * findAddCommentsColumn):
 *  - 'duplicates' / 'potential-duplicates' / 'unique': just that status's
 *    records, under a descriptive tab name. Kept around (and still fully
 *    functional) for anything that still wants the raw per-status split,
 *    but ExportMenu no longer surfaces 'duplicates'/'potential-duplicates'
 *    as separate choices - see 'flagged' below.
 *  - 'flagged': DUPLICATE and POTENTIAL_DUPLICATE combined (see
 *    recordsForFlagged), under `flaggedSheetName` - the rule-driven label
 *    ExportMenu resolves via resolveDuplicateTypeLabel, the same one the
 *    Results table's Status column/checkboxes/KPI cards already use for
 *    this rule, sanitized for use as an Excel sheet name (see
 *    sheetSafeName). Defaults to 'Duplicate Records' when the caller
 *    doesn't pass one (e.g. a direct/test call).
 *  - 'complete': every original record, unfiltered and in the file's own
 *    order, under the file's own original sheet name - this is the whole
 *    file back, not a multi-tab analysis report (see allRecordsRows).
 */
export function buildExportWorkbook(
  dataset: ExcelDataset,
  result: ValidationResult,
  kind: ExportKind,
  dispositions: Map<string, Disposition> = new Map(),
  comments: Map<string, string> = new Map(),
  flaggedSheetName: string = 'Duplicate Records'
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  if (kind === 'duplicates') {
    appendSheet(wb, recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions, comments), 'Duplicate Records')
    return wb
  }
  if (kind === 'potential-duplicates') {
    appendSheet(
      wb,
      recordsForStatus(dataset, result.groups, 'POTENTIAL_DUPLICATE', dispositions, comments),
      'Potential Duplicates'
    )
    return wb
  }
  if (kind === 'flagged') {
    appendSheet(wb, recordsForFlagged(dataset, result.groups, dispositions, comments), sheetSafeName(flaggedSheetName))
    return wb
  }
  if (kind === 'unique') {
    appendSheet(wb, recordsForStatus(dataset, result.groups, 'UNIQUE', dispositions, comments), 'Unique Records')
    return wb
  }

  // 'complete': the whole file back, as a single sheet, under its own original name.
  appendSheet(wb, allRecordsRows(dataset, result.groups, dispositions, comments), dataset.sheetName)
  return wb
}

/** The exported file's base name - always the original uploaded file's own name, unmodified. */
export function exportFileBaseName(dataset: ExcelDataset): string {
  return dataset.fileName.replace(/\.[^.]+$/, '')
}
