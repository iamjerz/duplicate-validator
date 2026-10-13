import { describe, it, expect } from 'vitest'
import { buildRuleSet, isRuleValue, hasRunnableRuleSet, validateRuleFile } from '../RuleValidator'
import { parseRuleFile } from '../RuleParser'

describe('isRuleValue', () => {
  it('accepts the four canonical values', () => {
    expect(isRuleValue('SAME')).toBe(true)
    expect(isRuleValue('UNIQUE')).toBe(true)
    expect(isRuleValue('OPTIONAL')).toBe(true)
    expect(isRuleValue('N/A')).toBe(true)
  })

  it('rejects anything else, including near-misses', () => {
    expect(isRuleValue('MATCH')).toBe(false)
    expect(isRuleValue('same')).toBe(false)
    expect(isRuleValue('EQUALS')).toBe(false)
    expect(isRuleValue('')).toBe(false)
  })
})

describe('buildRuleSet', () => {
  it('builds an indexed rule set from valid fields', () => {
    const result = buildRuleSet([
      { field: 'Invoice Number', value: 'SAME' },
      { field: 'Audit ID', value: 'UNIQUE' },
      { field: 'Invoice Due Date', value: 'OPTIONAL' },
      { field: 'Check Number', value: 'N/A' },
    ])

    expect(result.success).toBe(true)
    expect(result.ruleSet?.same).toEqual(['Invoice Number'])
    expect(result.ruleSet?.unique).toEqual(['Audit ID'])
    expect(result.ruleSet?.optional).toEqual(['Invoice Due Date'])
    expect(result.ruleSet?.ignored).toEqual(['Check Number'])
    expect(result.ruleSet?.byField.get('Invoice Number')).toBe('SAME')
    expect(result.ruleSet?.fields).toHaveLength(4)
  })

  it('trims incidental whitespace around rule values', () => {
    const result = buildRuleSet([{ field: 'Invoice Number', value: '  SAME  ' }])
    expect(result.success).toBe(true)
    expect(result.ruleSet?.byField.get('Invoice Number')).toBe('SAME')
  })

  it('collects every invalid field instead of stopping at the first', () => {
    const result = buildRuleSet([
      { field: 'Invoice Number', value: 'MATCH' },
      { field: 'Audit ID', value: 'UNIQUE' },
      { field: 'Root Id', value: 'EQUALS' },
    ])
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors.map((e) => e.field)).toEqual(['Invoice Number', 'Root Id'])
    expect(result.errors[0].message).toContain('SAME, UNIQUE, OPTIONAL, N/A')
  })
})

describe('validateRuleFile', () => {
  it('passes through metadata from the nested Validation format on success', () => {
    const structural = parseRuleFile({
      level: 'Invoice_level',
      Analysis: 'True Duplicate for denial',
      Validation: { 'Root Id': 'SAME', 'Audit ID': 'UNIQUE' },
    })
    const result = validateRuleFile(structural)
    expect(result.success).toBe(true)
    expect(result.metadata).toEqual({ level: 'Invoice_level', analysis: 'True Duplicate for denial' })
    expect(result.ruleSet?.same).toEqual(['Root Id'])
  })

  it('has no metadata for the legacy flat format', () => {
    const structural = parseRuleFile({ 'Root Id': 'SAME' })
    const result = validateRuleFile(structural)
    expect(result.success).toBe(true)
    expect(result.metadata).toBeUndefined()
  })

  it('surfaces the structural error message when parsing failed', () => {
    const structural = parseRuleFile(['not', 'an', 'object'])
    const result = validateRuleFile(structural)
    expect(result.success).toBe(false)
    expect(result.errors[0].message).toBeTruthy()
  })
})

describe('hasRunnableRuleSet', () => {
  it('requires at least one SAME field', () => {
    const withSame = buildRuleSet([{ field: 'Invoice Number', value: 'SAME' }]).ruleSet!
    const withoutSame = buildRuleSet([{ field: 'Audit ID', value: 'UNIQUE' }]).ruleSet!
    expect(hasRunnableRuleSet(withSame)).toBe(true)
    expect(hasRunnableRuleSet(withoutSame)).toBe(false)
  })
})
