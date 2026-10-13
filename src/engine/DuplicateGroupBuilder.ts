import type { CellValue, ColumnMappingEntry, RuleSet } from '@/types'
import { evaluateSameFields } from './SameEvaluator'
import { buildColumnIndexByField } from './ColumnMapper'

export interface RawGroup {
  compositeKey: string
  rowIndices: number[]
}

export interface ValidationErrorRow {
  rowIndex: number
  blankFields: string[]
}

export interface GroupingResult {
  groups: RawGroup[]
  validationErrorRows: ValidationErrorRow[]
}

/**
 * Groups rows by a composite key built from their normalized SAME-field
 * values, using a single `Map` pass over the dataset - O(n) in the number
 * of rows, never O(n^2). Rows missing a required SAME field are routed to
 * `validationErrorRows` instead of joining a group with a partial key.
 */
export function buildDuplicateGroups(
  headers: string[],
  rows: CellValue[][],
  ruleSet: RuleSet,
  mapping: ColumnMappingEntry[]
): GroupingResult {
  const columnIndexByField = buildColumnIndexByField(headers, mapping)
  const sameFields = ruleSet.same

  const groupMap = new Map<string, number[]>()
  const validationErrorRows: ValidationErrorRow[] = []

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const getCellValue = (field: string): CellValue => {
      const colIdx = columnIndexByField.get(field)
      if (colIdx === undefined) return null
      const value = row[colIdx]
      return value === undefined ? null : value
    }

    const evaluation = evaluateSameFields(sameFields, getCellValue)

    if (evaluation.compositeKey === null) {
      validationErrorRows.push({ rowIndex, blankFields: evaluation.blankFields })
      continue
    }

    const bucket = groupMap.get(evaluation.compositeKey)
    if (bucket) {
      bucket.push(rowIndex)
    } else {
      groupMap.set(evaluation.compositeKey, [rowIndex])
    }
  }

  const groups: RawGroup[] = []
  for (const [compositeKey, rowIndices] of groupMap) {
    groups.push({ compositeKey, rowIndices })
  }

  return { groups, validationErrorRows }
}
