import type { NormalizedValue } from '@/types'

export interface UniqueFieldEvaluation {
  field: string
  /** True when this UNIQUE field genuinely distinguishes records in the group. */
  isDifferent: boolean
  /** Distinct values found across the group (deduped; blanks collapsed by kind). */
  distinctValues: NormalizedValue[]
}

/**
 * A UNIQUE field is only treated as "different" when at least one record has
 * an actual value and that value set has more than one distinct member.
 * Two blanks (e.g. one row with null, another with an empty string) are
 * never, by themselves, treated as a meaningful difference - per the rule
 * that blank values must not drive duplicate classification.
 */
export function evaluateUniqueField(field: string, values: NormalizedValue[]): UniqueFieldEvaluation {
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
