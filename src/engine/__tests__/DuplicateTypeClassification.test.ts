import { describe, it, expect } from 'vitest'
import { classifyDuplicateType } from '../DuplicateTypeClassification'

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
