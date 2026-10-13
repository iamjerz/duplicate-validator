import { describe, it, expect } from 'vitest'
import { runDuplicateValidation } from '../DuplicateValidationEngine'
import { buildRuleSet } from '../RuleValidator'
import { buildColumnMapping } from '../ColumnMapper'
import type { CellValue, RuleSet } from '@/types'

const headers = [
  'Root Id',
  'Invoice Number',
  'Client Code',
  'Carrier Code',
  'Invoice Amount',
  'Audit ID',
  'Invoice Due Date',
]

const rules = {
  'Root Id': 'SAME',
  'Invoice Number': 'SAME',
  'Client Code': 'SAME',
  'Carrier Code': 'SAME',
  'Invoice Amount': 'SAME',
  'Audit ID': 'UNIQUE',
  'Invoice Due Date': 'OPTIONAL',
}

function setup() {
  const ruleSet = buildRuleSet(Object.entries(rules).map(([field, value]) => ({ field, value }))).ruleSet as RuleSet
  const mapping = buildColumnMapping(ruleSet, headers).entries
  return { ruleSet, mapping }
}

describe('runDuplicateValidation', () => {
  it('classifies a small realistic dataset correctly end-to-end', () => {
    const { ruleSet, mapping } = setup()
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'FX', 500, 'A-1', '09/15/2026'],
      ['12345', 'INV-001', 'ABC', 'FX', 500, 'A-1', '09/20/2026'],
      ['12345', 'INV-001', 'ABC', 'FX', 500, 'A-2', '09/15/2026'],
      ['77777', 'INV-999', 'XYZ', 'UPS', 250, 'A-9', '09/01/2026'],
      ['', 'INV-222', 'XYZ', 'UPS', 10, 'A-8', ''],
    ]
    const excelRowNumbers = rows.map((_, i) => i + 2)

    const result = runDuplicateValidation({ headers, rows, excelRowNumbers, ruleSet, mapping })

    expect(result.kpis.totalRecords).toBe(5)
    expect(result.kpis.validationErrorRecords).toBe(1)
    expect(result.kpis.potentialDuplicateRecords).toBe(3)
    expect(result.kpis.duplicateRecords).toBe(0)
    expect(result.kpis.uniqueRecords).toBe(1)

    const total =
      result.kpis.duplicateRecords +
      result.kpis.potentialDuplicateRecords +
      result.kpis.uniqueRecords +
      result.kpis.validationErrorRecords
    expect(total).toBe(result.kpis.totalRecords)

    const group = result.groups.find((g) => g.records.length === 3)
    expect(group?.status).toBe('POTENTIAL_DUPLICATE')
    expect(group?.differentUniqueFields).toEqual(['Audit ID'])
    expect(group?.differentOptionalFields).toEqual(['Invoice Due Date'])

    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0]).toMatchObject({ field: 'Root Id', record: { excelRowNumber: 6 } })
  })

  it('throws a clear, specific error when no field is marked SAME', () => {
    const ruleSet = buildRuleSet([{ field: 'Audit ID', value: 'UNIQUE' }]).ruleSet as RuleSet
    const mapping = buildColumnMapping(ruleSet, ['Audit ID']).entries
    expect(() =>
      runDuplicateValidation({
        headers: ['Audit ID'],
        rows: [['A-1']],
        excelRowNumbers: [2],
        ruleSet,
        mapping,
      })
    ).toThrow(/SAME/)
  })

  it('stays well clear of quadratic behavior on a moderately large synthetic dataset', () => {
    const { ruleSet, mapping } = setup()
    const rowCount = 20000
    const rows: CellValue[][] = []
    for (let i = 0; i < rowCount; i++) {
      if (i % 4 === 3) {
        rows.push([...rows[i - 1]])
      } else {
        rows.push([`ROOT-${i}`, `INV-${i}`, 'ABC', 'FX', 100 + (i % 50), `A-${i}`, '09/15/2026'])
      }
    }
    const excelRowNumbers = rows.map((_, i) => i + 2)

    const start = Date.now()
    const result = runDuplicateValidation({ headers, rows, excelRowNumbers, ruleSet, mapping })
    const elapsed = Date.now() - start

    expect(result.kpis.totalRecords).toBe(rowCount)
    expect(result.kpis.validationErrorRecords).toBe(0)
    // Every 4th row is an exact clone of its predecessor -> rowCount/4 duplicate pairs.
    expect(result.kpis.duplicateGroups).toBe(rowCount / 4)
    expect(result.kpis.duplicateRecords).toBe((rowCount / 4) * 2)
    // Generous bound - this assertion exists to catch accidental O(n^2) regressions,
    // not to be a precise performance benchmark (see scripts/benchmark.mjs for that).
    expect(elapsed).toBeLessThan(5000)
  })
})
