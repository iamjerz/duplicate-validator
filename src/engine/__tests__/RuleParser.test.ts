import { describe, it, expect } from 'vitest'
import { parseRuleFile, parseRuleFileFromText } from '../RuleParser'

describe('parseRuleFile', () => {
  it('parses a flat object into ordered field/value pairs', () => {
    const result = parseRuleFile({ 'Invoice Number': 'SAME', 'Audit ID': 'UNIQUE' })
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([
      { field: 'Invoice Number', value: 'SAME' },
      { field: 'Audit ID', value: 'UNIQUE' },
    ])
  })

  it('rejects arrays', () => {
    const result = parseRuleFile(['SAME', 'UNIQUE'])
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects null', () => {
    const result = parseRuleFile(null)
    expect(result.success).toBe(false)
  })

  it('rejects non-string rule values', () => {
    const result = parseRuleFile({ 'Invoice Number': 1 })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invoice Number')
  })

  it('rejects an empty object', () => {
    const result = parseRuleFile({})
    expect(result.success).toBe(false)
  })
})

describe('parseRuleFile - nested "Validation" format', () => {
  it('reads fields from a "Validation" object and captures level/Analysis as metadata', () => {
    const result = parseRuleFile({
      level: 'Invoice_level',
      Analysis: 'True Duplicate for denial',
      Validation: { 'Root Id': 'SAME', 'Audit ID': 'UNIQUE' },
    })
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([
      { field: 'Root Id', value: 'SAME' },
      { field: 'Audit ID', value: 'UNIQUE' },
    ])
    expect(result.metadata).toEqual({
      level: 'Invoice_level',
      analysis: 'True Duplicate for denial',
    })
  })

  it('matches the "Validation" key case-insensitively', () => {
    const result = parseRuleFile({ validation: { 'Root Id': 'SAME' } })
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([{ field: 'Root Id', value: 'SAME' }])
    expect(result.metadata).toBeUndefined()
  })

  it('has no metadata when there is no level/Analysis text alongside Validation', () => {
    const result = parseRuleFile({ Validation: { 'Root Id': 'SAME' } })
    expect(result.success).toBe(true)
    expect(result.metadata).toBeUndefined()
  })

  it('captures a "CommentReason" sibling field as metadata.commentReason', () => {
    const result = parseRuleFile({
      level: 'Shipment_level',
      Analysis: 'Potential Duplicate',
      CommentReason: 'Same Tracking No., Service, and Charge; Different Invoice No., Lane, Ship Date, and Invoice Amount.',
      Validation: { 'Root Id': 'SAME' },
    })
    expect(result.success).toBe(true)
    expect(result.metadata).toEqual({
      level: 'Shipment_level',
      analysis: 'Potential Duplicate',
      commentReason: 'Same Tracking No., Service, and Charge; Different Invoice No., Lane, Ship Date, and Invoice Amount.',
    })
  })

  it('matches "CommentReason" case-insensitively', () => {
    const result = parseRuleFile({ commentreason: 'Same Invoice No.', Validation: { 'Root Id': 'SAME' } })
    expect(result.success).toBe(true)
    expect(result.metadata).toEqual({ commentReason: 'Same Invoice No.' })
  })

  it('preserves unrecognized sibling text fields under metadata.extra', () => {
    const result = parseRuleFile({
      Level: 'Invoice_level',
      Notes: 'internal use only',
      Validation: { 'Root Id': 'SAME' },
    })
    expect(result.success).toBe(true)
    expect(result.metadata).toEqual({
      level: 'Invoice_level',
      extra: { Notes: 'internal use only' },
    })
  })

  it('rejects a "Validation" value that is not an object', () => {
    const result = parseRuleFile({ Validation: 'SAME' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation')
  })

  it('rejects an empty "Validation" object', () => {
    const result = parseRuleFile({ level: 'Invoice_level', Validation: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation')
  })

  it('still rejects non-string rule values inside "Validation"', () => {
    const result = parseRuleFile({ Validation: { 'Invoice Number': 1 } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invoice Number')
  })
})

describe('parseRuleFileFromText', () => {
  it('parses valid JSON text', () => {
    const result = parseRuleFileFromText('{"Invoice Number": "SAME"}')
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([{ field: 'Invoice Number', value: 'SAME' }])
  })

  it('reports invalid JSON clearly', () => {
    const result = parseRuleFileFromText('{ this is not valid json')
    expect(result.success).toBe(false)
    expect(result.error).toContain('invalid JSON')
  })
})
