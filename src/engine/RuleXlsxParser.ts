import type { CellValue, ParsedRuleField } from '@/types'
import { findColumnByName } from '@/utils/fieldMatching'
import type { RuleFieldInput, RuleParseStructuralResult } from './RuleParser'

/**
 * Recognized header names for each column, tried in order. Matched the same
 * case/spacing/punctuation-insensitive way "Add Action" is (see
 * findColumnByName), so "Field Name", "field_name" and "FIELD-NAME" are all
 * the same column.
 */
const FIELD_COLUMN_CANDIDATES = ['Field Name', 'Field', 'Column Name', 'Excel Column', 'Column']
const RULE_COLUMN_CANDIDATES = ['Rule', 'Rule Value', 'Validation', 'Rule Type']

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function findAnyColumn(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const match = findColumnByName(headers, candidate)
    if (match) return match
  }
  return null
}

/**
 * Finds the Field Name / Rule columns among the sheet's own header row.
 * Deliberately does NOT fall back to "the first two columns" when neither is
 * recognized - this app's convention throughout is to surface an unclear
 * file rather than silently guess at it (the same reasoning as a missing
 * "Add Action" column on export), and a wrong positional guess here would
 * silently misfile every row instead of failing loudly.
 */
function locateColumns(headers: string[]): { fieldHeader: string; ruleHeader: string } | null {
  const fieldHeader = findAnyColumn(headers, FIELD_COLUMN_CANDIDATES)
  const ruleHeader = findAnyColumn(headers, RULE_COLUMN_CANDIDATES)
  if (!fieldHeader || !ruleHeader || fieldHeader === ruleHeader) return null
  return { fieldHeader, ruleHeader }
}

/**
 * Interprets the first sheet of an uploaded rules spreadsheet as a Field
 * Name / Rule table - the same two things RuleEditorDialog's own table edits
 * by hand, just authored in Excel instead of typed into the app. The sheet
 * must have a header row (same assumption as the main data-file upload);
 * "level"/"Analysis" metadata is intentionally not read from the sheet at
 * all - those are filled in during the review step after conversion (see
 * RuleImport), which already has a Level/Analysis field, rather than
 * inventing a fragile metadata-block convention for the spreadsheet.
 *
 * A row with a blank field name is skipped rather than reported - most
 * spreadsheets have a trailing blank row or two. A row's rule value is
 * uppercased/trimmed before being carried through (so a casually-typed
 * "same" or "n/a" still matches) but not otherwise checked here - whether
 * it's actually one of SAME/UNIQUE/OPTIONAL/N-A is validateRuleFile's job,
 * identical to a JSON upload, so both formats report an unsupported value
 * the same way.
 */
export function parseRuleWorkbookRows(headers: string[], rows: CellValue[][]): RuleParseStructuralResult {
  const located = locateColumns(headers)
  if (!located) {
    return {
      success: false,
      fields: [],
      error: `Could not find a Field Name column and a Rule column in the header row. Expected a header such as "Field Name" (or "Field") and "Rule" (or "Rule Value"). Found: ${headers.join(', ') || '(no headers)'}.`,
    }
  }

  const fieldIdx = headers.indexOf(located.fieldHeader)
  const ruleIdx = headers.indexOf(located.ruleHeader)

  const fields: RuleFieldInput[] = []
  for (const row of rows) {
    const field = cellText(row[fieldIdx])
    if (!field) continue // blank row - skip rather than report

    const ruleRaw = cellText(row[ruleIdx])
    fields.push({ field, value: ruleRaw.toUpperCase() })
  }

  if (fields.length === 0) {
    return {
      success: false,
      fields: [],
      error: 'No fields were found in this spreadsheet - add at least one row with a field name and a rule value.',
    }
  }

  return { success: true, fields }
}

/**
 * Inverse of parseRuleWorkbookRows: lays a rule's fields out as a header row
 * plus one row per field, for the Rules Library's "Export as Excel" action.
 * Always uses this parser's own first-choice header names
 * (FIELD_COLUMN_CANDIDATES[0] / RULE_COLUMN_CANDIDATES[0]) - "Field Name" and
 * "Rule" - rather than whatever a particular import happened to match, so a
 * workbook built from this is guaranteed to read back through
 * parseRuleWorkbookRows unchanged, regardless of what the original source
 * file (if any) called these columns.
 */
export function fieldsToRuleWorkbookRows(fields: ParsedRuleField[]): { headers: string[]; rows: CellValue[][] } {
  const headers = [FIELD_COLUMN_CANDIDATES[0], RULE_COLUMN_CANDIDATES[0]]
  const rows: CellValue[][] = fields.map(({ field, rule }) => [field, rule])
  return { headers, rows }
}
