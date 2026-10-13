import type { CellValue, NormalizedValue } from '@/types'
import { normalizeValue, isBlank } from './DataNormalizer'
import { COMPOSITE_KEY_SEPARATOR } from './constants'

export interface SameFieldEvaluation {
  /** Normalized value per SAME field, in the same order as the input field list. */
  values: NormalizedValue[]
  /** The composite grouping key, or null when any SAME field is blank/unusable. */
  compositeKey: string | null
  /** SAME fields that were blank/unusable for this row - a validation issue, not a grouping signal. */
  blankFields: string[]
}

/**
 * Evaluates every SAME field for one record and produces the composite key
 * used to bucket records together. A record whose SAME fields are all
 * populated gets a stable key; a record missing a required SAME field is
 * reported separately as `blankFields` so it can be routed to the
 * "Validation Error" bucket instead of silently joining (or skewing) a
 * duplicate group.
 */
export function evaluateSameFields(
  sameFields: string[],
  getCellValue: (field: string) => CellValue
): SameFieldEvaluation {
  const values: NormalizedValue[] = []
  const blankFields: string[] = []

  for (const field of sameFields) {
    const normalized = normalizeValue(getCellValue(field))
    values.push(normalized)
    if (isBlank(normalized)) blankFields.push(field)
  }

  if (blankFields.length > 0) {
    return { values, compositeKey: null, blankFields }
  }

  // Prefix each segment with its detected value type so that, e.g., the
  // number 500 and the text "500" in two different columns can never
  // collide into the same composite key.
  const compositeKey = values.map((v) => `${v.valueType}:${v.normalized}`).join(COMPOSITE_KEY_SEPARATOR)

  return { values, compositeKey, blankFields: [] }
}
