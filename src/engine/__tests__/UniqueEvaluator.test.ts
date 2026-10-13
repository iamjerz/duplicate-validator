import { describe, it, expect } from 'vitest'
import { evaluateUniqueField } from '../UniqueEvaluator'
import { normalizeValue } from '../DataNormalizer'

describe('evaluateUniqueField', () => {
  it('is not different when every record shares the same value after normalization', () => {
    const values = [normalizeValue('INV-001'), normalizeValue(' inv-001 ')]
    expect(evaluateUniqueField('Invoice Id', values).isDifferent).toBe(false)
  })

  it('is different when values genuinely diverge', () => {
    const values = [normalizeValue('INV-001'), normalizeValue('INV-002')]
    expect(evaluateUniqueField('Invoice Id', values).isDifferent).toBe(true)
  })

  it('does not treat two blanks (even of different kinds) as a difference', () => {
    const values = [normalizeValue(null), normalizeValue(''), normalizeValue('   ')]
    expect(evaluateUniqueField('Invoice Id', values).isDifferent).toBe(false)
  })

  it('treats a real value alongside a blank as a meaningful difference', () => {
    const values = [normalizeValue('INV-001'), normalizeValue(null)]
    expect(evaluateUniqueField('Invoice Id', values).isDifferent).toBe(true)
  })
})
