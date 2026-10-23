import { describe, it, expect } from 'vitest'
import { classifyDuplicateType, resolveDuplicateTypeLabel } from '../DuplicateTypeClassification'

describe('classifyDuplicateType', () => {
  it('classifies a "Potential Duplicate" Analysis', () => {
    expect(classifyDuplicateType('Potential Duplicate')).toBe('potential-duplicate')
  })

  it('classifies a "True Duplicate" Analysis with trailing words', () => {
    expect(classifyDuplicateType('True Duplicate for denial')).toBe('true-duplicate')
  })

  it('matches case-insensitively', () => {
    expect(classifyDuplicateType('POTENTIAL DUPLICATE')).toBe('potential-duplicate')
    expect(classifyDuplicateType('true duplicate')).toBe('true-duplicate')
  })

  it('is insensitive to surrounding whitespace', () => {
    expect(classifyDuplicateType('  Potential Duplicate  ')).toBe('potential-duplicate')
  })

  it('returns null for undefined, blank, or unrelated Analysis text', () => {
    expect(classifyDuplicateType(undefined)).toBeNull()
    expect(classifyDuplicateType('')).toBeNull()
    expect(classifyDuplicateType('   ')).toBeNull()
    expect(classifyDuplicateType('Some other rule')).toBeNull()
  })

  it('prefers "true duplicate" when a string somehow contains both phrases', () => {
    expect(classifyDuplicateType('True Duplicate and also Potential Duplicate')).toBe('true-duplicate')
  })
})

describe('resolveDuplicateTypeLabel', () => {
  it('resolves a True-Duplicate rule to the short "True Duplicate" label, not the raw Analysis text', () => {
    expect(resolveDuplicateTypeLabel('True Duplicate : Same Invoice No., Shiping Details, and Invoice Amount.', 'fallback.json')).toBe(
      'True Duplicate'
    )
  })

  it('resolves a Potential-Duplicate rule to "Potential Duplicate"', () => {
    expect(resolveDuplicateTypeLabel('Potential Duplicate', 'fallback.json')).toBe('Potential Duplicate')
  })

  it('falls back to the given name when Analysis matches neither type', () => {
    expect(resolveDuplicateTypeLabel('Some custom rule', 'Custom Rule.json')).toBe('Custom Rule.json')
  })

  it('falls back to the given name when Analysis is missing entirely', () => {
    expect(resolveDuplicateTypeLabel(undefined, 'Custom Rule.json')).toBe('Custom Rule.json')
  })
})
