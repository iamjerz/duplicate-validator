import * as XLSX from 'xlsx'
import { sourceFileForRow, type CellValue, type Disposition, type DuplicateGroup, type DuplicateStatus, type ExcelDataset, type ValidationResult } from '@/types'
import { findColumnByName } from '@/utils/fieldMatching'
import { normalizeValue, isBlank } from '@/engine'

const SOURCE_FILE_COLUMN = 'Source File'

const AUDIT_ID_FIELD = 'Audit ID'
const AUDIT_STATUS_FIELD = 'Audit Exception Status'
const REQUIRED_STATUS = 'open'

export type ExportKind = 'duplicates' | 'potential-duplicates' | 'unique' | 'complete'

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
 * Rebuilds one record's row exactly as it appeared in the source file - the
 * same columns, in the same order, with the same values (a Date cell stays
 * a real Date rather than being reformatted to text - see sheetFromRows'
 * cellDates option). A Disposition is layered on afterward, in place, by the
 * caller (recordsForStatus/allRecordsRows). The only column ever added here
 * is a trailing Source File column, and only when this export spans more
 * than one combined uploaded file (sourceFileColumn is null otherwise - see
 * resolveSourceFileColumn).
 */
function recordRow(dataset: ExcelDataset, rowIndex: number, sourceFileColumn: string | null): ExportRow {
  const row: ExportRow = {}
  dataset.headers.forEach((header, i) => {
    row[header] = dataset.rows[rowIndex][i]
  })
  if (sourceFileColumn) {
    row[sourceFileColumn] = sourceFileForRow(dataset, rowIndex)?.fileName ?? ''
  }
  return row
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
        row[addActionColumn] = disposition
      }
      if (comment && addCommentsColumn && eligible) {
        row[addCommentsColumn] = comment
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
      row[addActionColumn] = disposition
    }
    const comment = commentByRowIndex.get(rowIndex)
    if (comment && addCommentsColumn && eligible) {
      row[addCommentsColumn] = comment
    }
    out.push(row)
  }
  return out
}

function sheetFromRows(rows: ExportRow[]) {
  // cellDates keeps a JS Date value as a real Excel date cell instead of
  // silently downgrading it to a plain serial number or reformatted text -
  // part of keeping the export's format matching the source file's own.
  return XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ ' ': 'No records in this category.' } as ExportRow], {
    cellDates: true,
  })
}

function appendSheet(wb: XLSX.WorkBook, rows: ExportRow[], name: string) {
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), name)
}

/**
 * Builds the appropriate SheetJS workbook in memory for one export option.
 * Every option is a single sheet that mirrors the source Excel file's own
 * columns exactly - nothing added, nothing renamed, no extra sheets - except
 * that a recorded Disposition/Comment (session-only, groupId -> value - see
 * ValidationSessionContext) is written into the file's own "Add Action" /
 * "Add Comments" columns where they exist (see findAddActionColumn,
 * findAddCommentsColumn):
 *  - 'duplicates' / 'potential-duplicates' / 'unique': just that status's
 *    records, under a descriptive tab name.
 *  - 'complete': every original record, unfiltered and in the file's own
 *    order, under the file's own original sheet name - this is the whole
 *    file back, not a multi-tab analysis report (see allRecordsRows).
 */
export function buildExportWorkbook(
  dataset: ExcelDataset,
  result: ValidationResult,
  kind: ExportKind,
  dispositions: Map<string, Disposition> = new Map(),
  comments: Map<string, string> = new Map()
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
