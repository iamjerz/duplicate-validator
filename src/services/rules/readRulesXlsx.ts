import { readWorkbookFile, readSheet } from '@/services/excel'
import { parseRuleWorkbookRows } from '@/engine/RuleXlsxParser'
import { validateRuleFile } from '@/engine/RuleValidator'
import type { RuleParseResult } from '@/types'

/**
 * Reads a user-uploaded rules SPREADSHEET (.xlsx and similar) and converts
 * it into the same RuleParseResult shape readRulesFile produces from a JSON
 * rules file - see parseRuleWorkbookRows for how the sheet's own Field
 * Name / Rule columns are located, and RuleValidator.validateRuleFile for
 * the shared value-checking/RuleSet-building step both formats go through
 * identically afterward. Only the FIRST worksheet is read; "level"/
 * "Analysis" are never read from the sheet itself - those are collected
 * separately during the review step after conversion (see RuleImport).
 */
export async function readRulesXlsx(file: File): Promise<RuleParseResult> {
  try {
    const { workbook } = await readWorkbookFile(file)

    if (workbook.SheetNames.length === 0) {
      return {
        success: false,
        errors: [{ field: '', value: '', message: 'This workbook does not contain any worksheets.' }],
        totalFields: 0,
      }
    }

    const { data, issues } = readSheet(workbook, workbook.SheetNames[0])
    if (!data) {
      return {
        success: false,
        errors: [
          {
            field: '',
            value: '',
            message: issues.map((i) => i.message).join(' ') || 'This worksheet could not be read.',
          },
        ],
        totalFields: 0,
      }
    }

    const structural = parseRuleWorkbookRows(data.headers, data.rows)
    return validateRuleFile(structural)
  } catch {
    return {
      success: false,
      errors: [
        { field: '', value: '', message: 'This file could not be read. Please verify that it is a valid Excel workbook.' },
      ],
      totalFields: 0,
    }
  }
}
