import type { CellValue, DuplicateStatus, FieldDifference, NormalizedValue, RuleSet } from '@/types'
import { normalizeValue } from './DataNormalizer'
import { evaluateUniqueField } from './UniqueEvaluator'
import { evaluateOptionalField } from './OptionalEvaluator'

export interface ClassifiedGroup {
  status: Exclude<DuplicateStatus, 'VALIDATION_ERROR'>
  matchedSameFields: string[]
  differentUniqueFields: string[]
  differentOptionalFields: string[]
  uniqueDifferences: FieldDifference[]
  optionalDifferences: FieldDifference[]
  sameFieldValues: Record<string, NormalizedValue>
}

/**
 * Classifies one already-grouped bucket of rows (rows that share identical
 * normalized SAME-field values):
 *  - A single-row bucket is simply UNIQUE.
 *  - A multi-row bucket where every UNIQUE field agrees is a DUPLICATE.
 *  - A multi-row bucket where any UNIQUE field genuinely differs is a
 *    POTENTIAL_DUPLICATE - the records look alike, but a distinguishing
 *    identifier disagrees, so they cannot be called an exact duplicate
 *    automatically.
 * OPTIONAL field differences never affect the status; they are recorded for
 * transparency only. N/A fields are never even read here.
 */
export function classifyGroup(
  rowIndices: number[],
  rows: CellValue[][],
  excelRowNumbers: number[],
  ruleSet: RuleSet,
  columnIndexByField: Map<string, number>
): ClassifiedGroup {
  const getCellValue = (rowIndex: number, field: string): CellValue => {
    const colIdx = columnIndexByField.get(field)
    if (colIdx === undefined) return null
    const value = rows[rowIndex][colIdx]
    return value === undefined ? null : value
  }

  const sameFieldValues: Record<string, NormalizedValue> = {}
  for (const field of ruleSet.same) {
    sameFieldValues[field] = normalizeValue(getCellValue(rowIndices[0], field))
  }

  // Singleton bucket: nothing to compare against, so skip the (relatively)
  // expensive per-field evaluation loops entirely. This matters because the
  // large majority of rows in a typical file are unique.
  if (rowIndices.length <= 1) {
    return {
      status: 'UNIQUE',
      matchedSameFields: ruleSet.same,
      differentUniqueFields: [],
      differentOptionalFields: [],
      uniqueDifferences: [],
      optionalDifferences: [],
      sameFieldValues,
    }
  }

  const differentUniqueFields: string[] = []
  const uniqueDifferences: FieldDifference[] = []
  for (const field of ruleSet.unique) {
    const values = rowIndices.map((ri) => normalizeValue(getCellValue(ri, field)))
    const evaluation = evaluateUniqueField(field, values)
    if (evaluation.isDifferent) {
      differentUniqueFields.push(field)
      uniqueDifferences.push({
        field,
        values: rowIndices.map((ri, i) => ({
          record: { rowIndex: ri, excelRowNumber: excelRowNumbers[ri] },
          value: values[i],
        })),
      })
    }
  }

  const differentOptionalFields: string[] = []
  const optionalDifferences: FieldDifference[] = []
  for (const field of ruleSet.optional) {
    const values = rowIndices.map((ri) => normalizeValue(getCellValue(ri, field)))
    const evaluation = evaluateOptionalField(field, values)
    if (evaluation.isDifferent) {
      differentOptionalFields.push(field)
      optionalDifferences.push({
        field,
        values: rowIndices.map((ri, i) => ({
          record: { rowIndex: ri, excelRowNumber: excelRowNumbers[ri] },
          value: values[i],
        })),
      })
    }
  }

  const status: Exclude<DuplicateStatus, 'VALIDATION_ERROR'> =
    differentUniqueFields.length > 0 ? 'POTENTIAL_DUPLICATE' : 'DUPLICATE'

  return {
    status,
    matchedSameFields: ruleSet.same,
    differentUniqueFields,
    differentOptionalFields,
    uniqueDifferences,
    optionalDifferences,
    sameFieldValues,
  }
}
