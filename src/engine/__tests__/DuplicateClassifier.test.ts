import { describe, it, expect } from 'vitest'
import { classifyGroup } from '../DuplicateClassifier'
import { buildRuleSet } from '../RuleValidator'
import { buildColumnMapping, buildColumnIndexByField } from '../ColumnMapper'
import type { CellValue, RuleSet } from '@/types'

function setup(rules: Record<string, string>, headers: string[]) {
  const ruleSetResult = buildRuleSet(Object.entries(rules).map(([field, value]) => ({ field, value })))
  const ruleSet = ruleSetResult.ruleSet as RuleSet
  const mapping = buildColumnMapping(ruleSet, headers).entries
  const columnIndexByField = buildColumnIndexByField(headers, mapping)
  return { ruleSet, columnIndexByField }
}

describe('classifyGroup', () => {
  const headers = ['Invoice Number', 'Client Code', 'Audit ID', 'Invoice Due Date']
  const rules = {
    'Invoice Number': 'SAME',
    'Client Code': 'SAME',
    'Audit ID': 'UNIQUE',
    'Invoice Due Date': 'OPTIONAL',
  }

  it('classifies a lone row as UNIQUE', () => {
    const { ruleSet, columnIndexByField } = setup(rules, headers)
    const rows: CellValue[][] = [['INV-001', 'ABC', 'A-1', '09/15/2026']]
    const result = classifyGroup([0], rows, [101], ruleSet, columnIndexByField)
    expect(result.status).toBe('UNIQUE')
  })

  it('classifies matching UNIQUE fields as DUPLICATE', () => {
    const { ruleSet, columnIndexByField } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['INV-001', 'ABC', 'A-1', '09/15/2026'],
      ['INV-001', 'ABC', 'A-1', '09/15/2026'],
    ]
    const result = classifyGroup([0, 1], rows, [101, 202], ruleSet, columnIndexByField)
    expect(result.status).toBe('DUPLICATE')
    expect(result.differentUniqueFields).toEqual([])
  })

  it('classifies differing UNIQUE fields as POTENTIAL_DUPLICATE and names the field', () => {
    const { ruleSet, columnIndexByField } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['INV-001', 'ABC', 'A-1', '09/15/2026'],
      ['INV-001', 'ABC', 'A-2', '09/15/2026'],
    ]
    const result = classifyGroup([0, 1], rows, [101, 202], ruleSet, columnIndexByField)
    expect(result.status).toBe('POTENTIAL_DUPLICATE')
    expect(result.differentUniqueFields).toEqual(['Audit ID'])
  })

  it('records an OPTIONAL difference without changing a DUPLICATE classification', () => {
    const { ruleSet, columnIndexByField } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['INV-001', 'ABC', 'A-1', '09/15/2026'],
      ['INV-001', 'ABC', 'A-1', '09/20/2026'],
    ]
    const result = classifyGroup([0, 1], rows, [101, 202], ruleSet, columnIndexByField)
    expect(result.status).toBe('DUPLICATE')
    expect(result.differentOptionalFields).toEqual(['Invoice Due Date'])
    expect(result.optionalDifferences[0].values.map((v) => v.record.excelRowNumber)).toEqual([101, 202])
  })
})
