import { describe, it, expect } from 'vitest'
import { evaluateOptionalField } from '../OptionalEvaluator'
import { normalizeValue } from '../DataNormalizer'

describe('evaluateOptionalField', () => {
  it('flags a genuine difference between two populated values', () => {
    const values = [normalizeValue('09/15/2026'), normalizeValue('09/20/2026')]
    expect(evaluateOptionalField('Invoice Due Date', values).isDifferent).toBe(true)
  })

  it('does not flag a difference when values match after normalization', () => {
    const values = [normalizeValue('09/15/2026'), normalizeValue('2026-09-15')]
    expect(evaluateOptionalField('Invoice Due Date', values).isDifferent).toBe(false)
  })

  it('does not treat two blanks as a difference', () => {
    const values = [normalizeValue(''), normalizeValue('   ')]
    expect(evaluateOptionalField('Original Invoice Number', values).isDifferent).toBe(false)
  })
})
