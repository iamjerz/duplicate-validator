import { describe, it, expect } from 'vitest'
import { generateExplanation } from '../ExplanationGenerator'

describe('generateExplanation', () => {
  it('explains a DUPLICATE classification positively', () => {
    const explanation = generateExplanation({
      status: 'DUPLICATE',
      matchedSameFields: ['Invoice Number', 'Client Code'],
      differentUniqueFields: [],
      differentOptionalFields: [],
      ignoredFieldsCount: 3,
      recordCount: 2,
    })
    expect(explanation.classification).toBe('DUPLICATE')
    expect(explanation.summary).toContain('DUPLICATE')
    expect(explanation.lines.some((l) => l.tone === 'negative')).toBe(false)
  })

  it('explains a POTENTIAL_DUPLICATE classification and names the differing UNIQUE field', () => {
    const explanation = generateExplanation({
      status: 'POTENTIAL_DUPLICATE',
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: ['Audit ID'],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 2,
    })
    expect(explanation.classification).toBe('POTENTIAL_DUPLICATE')
    expect(explanation.lines.some((l) => l.text.includes('Audit ID'))).toBe(true)
  })

  it('foregrounds the rule Analysis text in a DUPLICATE summary when provided', () => {
    const explanation = generateExplanation({
      status: 'DUPLICATE',
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: [],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 2,
      analysis: 'True Duplicate for denial',
    })
    expect(explanation.summary).toBe('DUPLICATE - True Duplicate for denial')
  })

  it('foregrounds the rule Analysis text in a POTENTIAL_DUPLICATE summary when provided', () => {
    const explanation = generateExplanation({
      status: 'POTENTIAL_DUPLICATE',
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: ['Audit ID'],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 2,
      analysis: 'Potential Duplicate for review',
    })
    expect(explanation.summary).toBe('POTENTIAL DUPLICATE - Potential Duplicate for review (needs review)')
  })

  it('falls back to the generic summary when no Analysis text is provided', () => {
    const duplicate = generateExplanation({
      status: 'DUPLICATE',
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: [],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 2,
    })
    expect(duplicate.summary).toBe('DUPLICATE - high confidence.')

    const potential = generateExplanation({
      status: 'POTENTIAL_DUPLICATE',
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: ['Audit ID'],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 2,
    })
    expect(potential.summary).toBe('POTENTIAL DUPLICATE - needs review.')
  })

  it('explains a UNIQUE classification', () => {
    const explanation = generateExplanation({
      status: 'UNIQUE',
      matchedSameFields: [],
      differentUniqueFields: [],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 1,
    })
    expect(explanation.classification).toBe('UNIQUE')
  })

  it('explains a VALIDATION_ERROR classification and names the missing field', () => {
    const explanation = generateExplanation({
      status: 'VALIDATION_ERROR',
      matchedSameFields: [],
      differentUniqueFields: [],
      differentOptionalFields: [],
      ignoredFieldsCount: 0,
      recordCount: 1,
      blankFields: ['Root Id'],
    })
    expect(explanation.classification).toBe('VALIDATION_ERROR')
    expect(explanation.lines[0].text).toContain('Root Id')
  })
})
