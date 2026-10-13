import { describe, it, expect } from 'vitest'
import { normalizeValue, normalizedValuesEqual, isBlank, parseDateLike, parseNumberLike } from '../DataNormalizer'

describe('normalizeValue - blanks', () => {
  it('distinguishes null, empty string, whitespace, and a real value', () => {
    expect(normalizeValue(null).kind).toBe('null')
    expect(normalizeValue('').kind).toBe('empty')
    expect(normalizeValue('   ').kind).toBe('whitespace')
    expect(normalizeValue('ABC').kind).toBe('value')
  })

  it('treats every blank kind as blank via isBlank()', () => {
    expect(isBlank(normalizeValue(null))).toBe(true)
    expect(isBlank(normalizeValue(''))).toBe(true)
    expect(isBlank(normalizeValue('   '))).toBe(true)
    expect(isBlank(normalizeValue('x'))).toBe(false)
  })
})

describe('normalizeValue - strings', () => {
  it('trims and case-normalizes for comparison while preserving original casing for display', () => {
    const a = normalizeValue('INV-001')
    const b = normalizeValue(' inv-001 ')
    expect(a.normalized).toBe(b.normalized)
    expect(a.display).toBe('INV-001')
    expect(b.display).toBe('inv-001')
  })

  it('collapses internal whitespace runs', () => {
    const value = normalizeValue('  Trax   Technologies  ')
    expect(value.display).toBe('Trax Technologies')
  })
})

describe('normalizeValue - numbers', () => {
  it('treats 500, "500.00" and "$500.00" as the same normalized number', () => {
    expect(normalizeValue(500).normalized).toBe(500)
    expect(normalizeValue('500.00').normalized).toBe(500)
    expect(normalizeValue('$500.00').normalized).toBe(500)
  })

  it('handles thousands separators and accounting-style negatives', () => {
    expect(normalizeValue('1,234.56').normalized).toBe(1234.56)
    expect(normalizeValue('(500.00)').normalized).toBe(-500)
  })
})

describe('normalizeValue - dates', () => {
  it('recognizes the same calendar date across common formats', () => {
    expect(normalizeValue('09/14/2026').normalized).toBe('2026-09-14')
    expect(normalizeValue('2026-09-14').normalized).toBe('2026-09-14')
    expect(normalizeValue('September 14, 2026').normalized).toBe('2026-09-14')
  })

  it('normalizes a real Date instance (as produced by the Excel reader) to ISO', () => {
    const date = new Date(Date.UTC(2026, 8, 14))
    expect(normalizeValue(date).normalized).toBe('2026-09-14')
  })
})

describe('normalizedValuesEqual', () => {
  it('never treats two blanks as a meaningful match', () => {
    expect(normalizedValuesEqual(normalizeValue(null), normalizeValue(''))).toBe(false)
    expect(normalizedValuesEqual(normalizeValue(''), normalizeValue(''))).toBe(false)
  })

  it('treats equivalent normalized values as equal', () => {
    expect(normalizedValuesEqual(normalizeValue('ABC'), normalizeValue(' abc '))).toBe(true)
    expect(normalizedValuesEqual(normalizeValue(500), normalizeValue('$500.00'))).toBe(true)
  })
})

describe('normalizeValue - charges-style "CODE : amount" arrays', () => {
  it('sums a single entry and keeps the original code/amount text as display', () => {
    const value = normalizeValue('["VCK : 1129.44000"]')
    expect(value.normalized).toBe(1129.44)
    expect(value.display).toBe('VCK: 1129.44000')
    expect(value.valueType).toBe('number')
  })

  it('sums multiple entries into one comparable number', () => {
    const value = normalizeValue('["VCK : 1129.44", "FSC : 45.00"]')
    expect(value.normalized).toBe(1174.44)
    expect(value.display).toBe('VCK: 1129.44; FSC: 45.00')
  })

  it('handles a negative (adjustment) entry', () => {
    expect(normalizeValue('["ADJ : -50.00"]').normalized).toBe(-50)
  })

  it('two rows with the same codes/amounts in different order still compare equal', () => {
    const a = normalizeValue('["VCK : 1129.44", "FSC : 45.00"]')
    const b = normalizeValue('["FSC : 45.00", "VCK : 1129.44"]')
    expect(normalizedValuesEqual(a, b)).toBe(true)
  })

  it('falls through to plain string handling for anything that is not this exact shape', () => {
    // Bracketed but not "code : amount" strings - never crashes, never mis-sums.
    expect(normalizeValue('[1,2,3]').valueType).toBe('string')
    expect(normalizeValue('[]').valueType).toBe('string')
    expect(normalizeValue('["VCK 1129.44"]').valueType).toBe('string')
    expect(normalizeValue('[not valid json').valueType).toBe('string')
  })
})

describe('parseDateLike / parseNumberLike', () => {
  it('returns null for input that is not a date or number', () => {
    expect(parseDateLike('not a date')).toBeNull()
    expect(parseNumberLike('not a number')).toBeNull()
  })
})
