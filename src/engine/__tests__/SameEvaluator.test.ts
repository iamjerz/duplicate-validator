import { describe, it, expect } from 'vitest'
import { evaluateSameFields } from '../SameEvaluator'

describe('evaluateSameFields', () => {
  it('builds an identical composite key for values that only differ in formatting', () => {
    const rowA: Record<string, unknown> = { 'Client Code': ' ABC ', 'Invoice Amount': '$500.00' }
    const rowB: Record<string, unknown> = { 'Client Code': 'abc', 'Invoice Amount': 500 }

    const evalA = evaluateSameFields(['Client Code', 'Invoice Amount'], (f) => rowA[f] as never)
    const evalB = evaluateSameFields(['Client Code', 'Invoice Amount'], (f) => rowB[f] as never)

    expect(evalA.compositeKey).not.toBeNull()
    expect(evalA.compositeKey).toBe(evalB.compositeKey)
  })

  it('flags rows with a blank SAME field instead of producing a key', () => {
    const row: Record<string, unknown> = { 'Client Code': '', 'Invoice Amount': 500 }
    const evaluation = evaluateSameFields(['Client Code', 'Invoice Amount'], (f) => row[f] as never)
    expect(evaluation.compositeKey).toBeNull()
    expect(evaluation.blankFields).toEqual(['Client Code'])
  })

  it('produces different keys for genuinely different values', () => {
    const evalA = evaluateSameFields(['Client Code'], () => 'ABC')
    const evalB = evaluateSameFields(['Client Code'], () => 'XYZ')
    expect(evalA.compositeKey).not.toBe(evalB.compositeKey)
  })
})
