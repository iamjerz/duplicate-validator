import * as XLSX from 'xlsx'
import { fieldsToRuleWorkbookRows } from '@/engine/RuleXlsxParser'
import { ruleFileToRawJson } from '@/engine/RuleSerialization'
import { downloadWorkbookAsXlsx, downloadJsonFile } from '@/services/export'
import type { ParsedRuleField, RuleFileMetadata, SavedRule } from '@/types'

/**
 * Base file name (no extension) to save an exported rule under - the saved
 * rule's own display name, since that's what the user actually recognizes it
 * by in the Rules Library (its original fileName may be a generic upload
 * name, or - for a rule created from scratch - just "<name>.json"). Strips
 * characters that are illegal in a file name on Windows/macOS so the
 * download can never silently fail because of the rule's own title.
 */
export function ruleExportFileBaseName(rule: SavedRule): string {
  const base = rule.name.trim() || rule.fileName.replace(/\.[^.]+$/, '')
  const safe = base.replace(/[\\/:*?"<>|]/g, '-').trim()
  return safe || 'rule'
}

/**
 * Builds the workbook for "Export as Excel": a first sheet named "Rules"
 * with the Field Name / Rule table this app's own Excel import reads back
 * (see parseRuleWorkbookRows) - guaranteed re-importable - plus, only when
 * the rule carries level/Analysis/other descriptive text, a second "Info"
 * sheet with that text for human reference. The Info sheet is purely
 * descriptive: re-importing this file only ever looks at the first sheet
 * (readRulesXlsx), so nothing there can be misread as a field row.
 */
export function buildRuleWorkbook(fields: ParsedRuleField[], metadata?: RuleFileMetadata): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const { headers, rows } = fieldsToRuleWorkbookRows(fields)
  const rulesSheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  XLSX.utils.book_append_sheet(wb, rulesSheet, 'Rules')

  const infoRows: [string, string][] = []
  if (metadata?.level) infoRows.push(['Level', metadata.level])
  if (metadata?.analysis) infoRows.push(['Analysis', metadata.analysis])
  if (metadata?.extra) {
    for (const [key, value] of Object.entries(metadata.extra)) infoRows.push([key, value])
  }
  if (infoRows.length > 0) {
    const infoSheet = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...infoRows])
    XLSX.utils.book_append_sheet(wb, infoSheet, 'Info')
  }

  return wb
}

/** Downloads a saved rule as a .json file that can be re-uploaded through "Upload Rule File" with no loss (see ruleFileToRawJson). */
export function downloadRuleAsJson(rule: SavedRule): void {
  const json = ruleFileToRawJson(rule.fields, rule.metadata)
  downloadJsonFile(json, ruleExportFileBaseName(rule))
}

/** Downloads a saved rule as a .xlsx file that can be re-uploaded through "Import from Excel" with no loss (see buildRuleWorkbook). */
export function downloadRuleAsXlsx(rule: SavedRule): void {
  const workbook = buildRuleWorkbook(rule.fields, rule.metadata)
  downloadWorkbookAsXlsx(workbook, ruleExportFileBaseName(rule))
}
