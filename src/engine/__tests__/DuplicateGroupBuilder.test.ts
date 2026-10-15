import { describe, it, expect } from 'vitest'
import { buildDuplicateGroups } from '../DuplicateGroupBuilder'
import { buildRuleSet } from '../RuleValidator'
import { buildColumnMapping } from '../ColumnMapper'
import type { CellValue, RuleSet, ColumnMappingEntry } from '@/types'

function setup(rules: Record<string, string>, headers: string[]): { ruleSet: RuleSet; mapping: ColumnMappingEntry[] } {
  const ruleSet = buildRuleSet(Object.entries(rules).map(([field, value]) => ({ field, value }))).ruleSet
  if (!ruleSet) throw new Error('invalid rule set fixture')
  const mapping = buildColumnMapping(ruleSet, headers).entries
  return { ruleSet, mapping }
}

describe('buildDuplicateGroups', () => {
  const headers = ['Root Id', 'Invoice Number', 'Client Code', 'Invoice Amount', 'Audit ID']
  const rules = {
    'Root Id': 'SAME',
    'Invoice Number': 'SAME',
    'Client Code': 'SAME',
    'Invoice Amount': 'SAME',
    'Audit ID': 'UNIQUE',
  }

  it('groups rows that share identical SAME field values using a single Map pass (no O(n^2) comparisons)', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 500, 'A-1'],
      ['12345', 'INV-001', 'ABC', 500, 'A-2'],
      ['99999', 'INV-777', 'XYZ', 100, 'A-3'],
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.groups).toHaveLength(2)
    expect(result.groups.map((g) => g.rowIndices.length).sort()).toEqual([1, 2])
    expect(result.validationErrorRows).toHaveLength(0)
  })

  it('routes rows with a blank SAME field to validationErrorRows instead of a group', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 500, 'A-1'],
      ['', 'INV-001', 'ABC', 500, 'A-2'],
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.validationErrorRows).toHaveLength(1)
    expect(result.validationErrorRows[0]).toMatchObject({ rowIndex: 1, blankFields: ['Root Id'] })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rowIndices).toEqual([0])
  })

  it('is insensitive to whitespace/case/currency formatting differences in SAME fields', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['12345', 'INV-001', ' ABC ', '$500.00', 'A-1'],
      ['12345', 'inv-001', 'abc', 500, 'A-2'],
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rowIndices).toEqual([0, 1])
  })

  it('scales to a few thousand rows well within a test-friendly time budget', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = []
    for (let i = 0; i < 5000; i++) {
      rows.push([`ROOT-${i % 1000}`, `INV-${i % 1000}`, 'ABC', 100, `A-${i}`])
    }
    const start = Date.now()
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(Date.now() - start).toBeLessThan(2000)
    // 1000 distinct SAME-field combinations, each hit by 5 rows.
    expect(result.groups).toHaveLength(1000)
    expect(result.groups.every((g) => g.rowIndices.length === 5)).toBe(true)
  })
})

describe('buildDuplicateGroups - chained "Root Id" references', () => {
  // "Invoice Id" is UNIQUE here, mirroring the real rule files this app
  // ships with - a record's "Root Id" may equal another record's own
  // "Invoice Id" instead of the family's ultimate shared root.
  const headers = ['Root Id', 'Invoice Number', 'Invoice Id']
  const rules = {
    'Root Id': 'SAME',
    'Invoice Number': 'SAME',
    'Invoice Id': 'UNIQUE',
  }

  it('joins a multi-hop chain into one group even though no two Root Id values are literally equal throughout', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['ROOT-1', 'INV-1', 'ROOT-1'], // the root record - self-referencing
      ['ROOT-1', 'INV-1', 'MID-2'], // points at the root directly
      ['MID-2', 'INV-1', 'LEAF-3'], // points at the previous record, not the root
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.validationErrorRows).toHaveLength(0)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rowIndices.sort()).toEqual([0, 1, 2])
  })

  it('still keeps unrelated invoices with coincidentally overlapping ids apart', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['ROOT-1', 'INV-1', 'ROOT-1'],
      ['ROOT-1', 'INV-1', 'MID-2'],
      // Different Invoice Number entirely - must never merge with the family
      // above even though its Root Id happens to equal MID-2.
      ['MID-2', 'INV-999', 'LEAF-9'],
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.groups.map((g) => g.rowIndices.length).sort()).toEqual([1, 2])
  })

  it('still groups an exact Root Id match with no chaining involved, same as before', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['ROOT-1', 'INV-1', 'A-1'],
      ['ROOT-1', 'INV-1', 'A-2'],
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rowIndices.sort()).toEqual([0, 1])
  })

  it('still routes a blank Root Id to validationErrorRows rather than attempting to chain it', () => {
    const { ruleSet, mapping } = setup(rules, headers)
    const rows: CellValue[][] = [
      ['ROOT-1', 'INV-1', 'A-1'],
      ['', 'INV-1', 'A-2'],
    ]
    const result = buildDuplicateGroups(headers, rows, ruleSet, mapping)
    expect(result.validationErrorRows).toHaveLength(1)
    expect(result.validationErrorRows[0]).toMatchObject({ rowIndex: 1, blankFields: ['Root Id'] })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rowIndices).toEqual([0])
  })
})
