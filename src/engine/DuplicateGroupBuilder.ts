import type { CellValue, ColumnMappingEntry, NormalizedValue, RuleSet } from '@/types'
import { evaluateSameFields } from './SameEvaluator'
import { buildColumnIndexByField } from './ColumnMapper'
import { normalizeValue, isBlank } from './DataNormalizer'
import { groupRowsWithChaining } from './ChainedFieldResolver'
import { COMPOSITE_KEY_SEPARATOR } from './constants'

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
 * The field name this app's source systems use for a record's duplicate-
 * family root reference. When a rule's SAME fields include this field,
 * grouping additionally resolves chained references through it (see
 * ChainedFieldResolver) rather than requiring an exact value match. A rule
 * that does not use this field name is completely unaffected - grouping
 * falls back to plain exact-match on every SAME field, unchanged.
 */
const CHAIN_FIELD = 'Root Id'

function encode(value: NormalizedValue): string {
  return `${value.valueType}:${value.normalized}`
}

/**
 * Groups rows by a composite key built from their normalized SAME-field
 * values, using a single `Map` pass over the dataset - O(n) in the number
 * of rows, never O(n^2). Rows missing a required SAME field are routed to
 * `validationErrorRows` instead of joining a group with a partial key.
 *
 * When the rule set's SAME fields include "Root Id" (see CHAIN_FIELD), rows
 * that already agree on every OTHER SAME field may ALSO join the same group
 * when their Root Id values form a chain through a UNIQUE field instead of
 * matching exactly - e.g. record C's Root Id equals record B's Invoice Id,
 * and record B's Root Id equals record A's Invoice Id, so A/B/C are one
 * family even though C's Root Id never literally equals A's. See
 * ChainedFieldResolver for why this can never merge genuinely unrelated
 * records.
 */
export function buildDuplicateGroups(
  headers: string[],
  rows: CellValue[][],
  ruleSet: RuleSet,
  mapping: ColumnMappingEntry[]
): GroupingResult {
  const columnIndexByField = buildColumnIndexByField(headers, mapping)
  const sameFields = ruleSet.same
  const chainFieldIndex = sameFields.indexOf(CHAIN_FIELD)

  const getCellValue = (rowIndex: number, field: string): CellValue => {
    const colIdx = columnIndexByField.get(field)
    if (colIdx === undefined) return null
    const value = rows[rowIndex][colIdx]
    return value === undefined ? null : value
  }

  const validationErrorRows: ValidationErrorRow[] = []

  if (chainFieldIndex === -1) {
    // No chain field in this rule - the original single-pass exact-match behavior, unchanged.
    const groupMap = new Map<string, number[]>()
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const evaluation = evaluateSameFields(sameFields, (field) => getCellValue(rowIndex, field))
      if (evaluation.compositeKey === null) {
        validationErrorRows.push({ rowIndex, blankFields: evaluation.blankFields })
        continue
      }
      const bucket = groupMap.get(evaluation.compositeKey)
      if (bucket) bucket.push(rowIndex)
      else groupMap.set(evaluation.compositeKey, [rowIndex])
    }
    const groups: RawGroup[] = [...groupMap.entries()].map(([compositeKey, rowIndices]) => ({ compositeKey, rowIndices }))
    return { groups, validationErrorRows }
  }

  // Chain-aware path. One pass computes, per clean row: its rest-key (every
  // SAME field except Root Id, type-prefixed and joined exactly like a
  // normal composite key) and its own Root Id value - reusing the per-field
  // NormalizedValue[] that evaluateSameFields already computed rather than
  // re-normalizing the same cells again.
  const restKeyByRow = new Map<number, string>()
  const chainValueByRow = new Map<number, string>()
  const cleanRowIndices: number[] = []

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const evaluation = evaluateSameFields(sameFields, (field) => getCellValue(rowIndex, field))
    if (evaluation.compositeKey === null) {
      validationErrorRows.push({ rowIndex, blankFields: evaluation.blankFields })
      continue
    }
    const restKey = evaluation.values
      .filter((_, i) => i !== chainFieldIndex)
      .map(encode)
      .join(COMPOSITE_KEY_SEPARATOR)
    restKeyByRow.set(rowIndex, restKey)
    chainValueByRow.set(rowIndex, encode(evaluation.values[chainFieldIndex]))
    cleanRowIndices.push(rowIndex)
  }

  const identityValuesByRow = new Map<number, string[]>()
  const identityValuesOf = (rowIndex: number): string[] => {
    const cached = identityValuesByRow.get(rowIndex)
    if (cached) return cached
    const values: string[] = []
    for (const field of ruleSet.unique) {
      const value = normalizeValue(getCellValue(rowIndex, field))
      if (!isBlank(value)) values.push(encode(value))
    }
    identityValuesByRow.set(rowIndex, values)
    return values
  }

  const groupedRowIndices = groupRowsWithChaining(
    cleanRowIndices,
    (rowIndex) => restKeyByRow.get(rowIndex)!,
    (rowIndex) => chainValueByRow.get(rowIndex)!,
    identityValuesOf
  )

  const groups: RawGroup[] = groupedRowIndices.map((rowIndices, i) => ({
    compositeKey: `${restKeyByRow.get(rowIndices[0])}${COMPOSITE_KEY_SEPARATOR}chain-group:${i}`,
    rowIndices,
  }))

  return { groups, validationErrorRows }
}
