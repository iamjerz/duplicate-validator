import type { NormalizedValue } from '@/types'

export interface OptionalFieldEvaluation {
  field: string
  /** True when this OPTIONAL field differs across the group (informational only). */
  isDifferent: boolean
  distinctValues: NormalizedValue[]
}

/**
 * OPTIONAL fields never change a group's DUPLICATE / POTENTIAL_DUPLICATE
 * classification - a difference here is surfaced to the user for
 * transparency ("this differs, but it did not block the match") rather
 * than treated as disqualifying. The difference semantics mirror
 * UniqueEvaluator: two blanks are not considered a difference.
 */
export function evaluateOptionalField(field: string, values: NormalizedValue[]): OptionalFieldEvaluation {
  const seen = new Map<string, NormalizedValue>()
  for (const value of values) {
    const key = value.kind === 'value' ? `v:${value.normalized}` : `b:${value.kind}`
    if (!seen.has(key)) seen.set(key, value)
  }

  const distinctValues = [...seen.values()]
  const hasRealValue = distinctValues.some((v) => v.kind === 'value')
  const isDifferent = distinctValues.length > 1 && hasRealValue

  return { field, isDifferent, distinctValues }
}
