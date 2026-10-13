import { describe, it, expect } from 'vitest'
import {
  fieldHasBlankValue,
  detectBlankSameFields,
  resolveAllowBlankFields,
  applyAllowBlankFields,
  deriveEffectiveRuleSet,
  isRuleDefinitionRunnable,
  allRuleDefinitionsRunnable,
} from '../BlankAllowance'
import { buildColumnMapping } from '../ColumnMapper'
import { buildRuleSet } from '../RuleValidator'
import type { CellValue, ExcelDataset, RuleDefinition, RuleSet, SavedRule } from '@/types'

function ruleSetFrom(fields: Record<string, string>): RuleSet {
  const entries = Object.entries(fields).map(([field, value]) => ({ field, value }))
  const result = buildRuleSet(entries)
  if (!result.success || !result.ruleSet) throw new Error('invalid rule set fixture')
  return result.ruleSet
}

function ruleDefinitionFrom(fileName: string, fields: Record<string, string>, id = 'session-id'): RuleDefinition {
  const ruleSet = ruleSetFrom(fields)
  return { id, fileName, ruleSet, totalFields: ruleSet.fields.length }
}

function savedRuleFrom(fileName: string, fields: Record<string, string>, blankOverrides?: Record<string, boolean>): SavedRule {
  const ruleSet = ruleSetFrom(fields)
  return { id: 'saved-id', name: fileName, fileName, fields: ruleSet.fields, savedAt: '2026-01-01T00:00:00.000Z', blankOverrides }
}

/** Minimal ExcelDataset fixture - only headers/rows matter to the functions under test here. */
function datasetFrom(headers: string[], rows: CellValue[][]): ExcelDataset {
  return {
    fileName: 'fixture.xlsx',
    fileSizeBytes: 0,
    sheetName: 'Sheet1',
    availableSheets: ['Sheet1'],
    sheetSummaries: [],
    headers,
    rows,
    excelRowNumbers: rows.map((_, i) => i + 2),
    totalRecords: rows.length,
    totalColumns: headers.length,
    sourceFiles: [{ fileName: 'fixture.xlsx', fileSizeBytes: 0, sheetName: 'Sheet1', recordCount: rows.length }],
    rowSourceFileIndex: rows.map(() => 0),
  }
}

const HEADERS = ['Root Id', 'Invoice Number', 'Bill Of Lading']

describe('fieldHasBlankValue', () => {
  const mapping = buildColumnMapping(ruleSetFrom({ 'Bill Of Lading': 'SAME' }), HEADERS).entries

  it('is true when at least one row is blank (null) in the mapped column', () => {
    const rows: CellValue[][] = [
      ['1', 'INV-1', 'BOL-1'],
      ['2', 'INV-2', null],
    ]
    expect(fieldHasBlankValue('Bill Of Lading', HEADERS, rows, mapping)).toBe(true)
  })

  it('is true for a whitespace-only value, same blank definition as everywhere else', () => {
    const rows: CellValue[][] = [['1', 'INV-1', '   ']]
    expect(fieldHasBlankValue('Bill Of Lading', HEADERS, rows, mapping)).toBe(true)
  })

  it('is false when every row has a real value', () => {
    const rows: CellValue[][] = [
      ['1', 'INV-1', 'BOL-1'],
      ['2', 'INV-2', 'BOL-2'],
    ]
    expect(fieldHasBlankValue('Bill Of Lading', HEADERS, rows, mapping)).toBe(false)
  })

  it('is false for a field with no mapped column at all - nothing to detect blanks in', () => {
    const rows: CellValue[][] = [['1', 'INV-1', 'BOL-1']]
    expect(fieldHasBlankValue('Nonexistent Field', HEADERS, rows, mapping)).toBe(false)
  })

  it('is false for an empty dataset', () => {
    expect(fieldHasBlankValue('Bill Of Lading', HEADERS, [], mapping)).toBe(false)
  })
})

describe('detectBlankSameFields', () => {
  it('only reports SAME fields, ignoring UNIQUE/OPTIONAL fields that happen to be blank', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Invoice Number': 'SAME', 'Bill Of Lading': 'UNIQUE' })
    const mapping = buildColumnMapping(ruleSet, HEADERS).entries
    const rows: CellValue[][] = [['1', null, null]]
    expect(detectBlankSameFields(ruleSet, HEADERS, rows, mapping)).toEqual(new Set(['Invoice Number']))
  })

  it('returns an empty set when no SAME field is ever blank', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, HEADERS).entries
    const rows: CellValue[][] = [['1', 'INV-1', 'BOL-1']]
    expect(detectBlankSameFields(ruleSet, HEADERS, rows, mapping)).toEqual(new Set())
  })

  it('detects more than one blank SAME field independently', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Invoice Number': 'SAME', 'Bill Of Lading': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, HEADERS).entries
    const rows: CellValue[][] = [
      ['1', 'INV-1', null],
      ['2', null, 'BOL-2'],
    ]
    expect(detectBlankSameFields(ruleSet, HEADERS, rows, mapping)).toEqual(new Set(['Invoice Number', 'Bill Of Lading']))
  })
})

describe('resolveAllowBlankFields', () => {
  const sameFields = ['Root Id', 'Invoice Number', 'Bill Of Lading']

  it('defaults to the auto-detected set when there are no overrides at all', () => {
    const autoDetected = new Set(['Bill Of Lading'])
    expect(resolveAllowBlankFields(sameFields, undefined, autoDetected)).toEqual(['Bill Of Lading'])
  })

  it('an explicit true override allows a field even if it was not auto-detected', () => {
    const autoDetected = new Set<string>()
    expect(resolveAllowBlankFields(sameFields, { 'Root Id': true }, autoDetected)).toEqual(['Root Id'])
  })

  it('an explicit false override disallows a field even if it WAS auto-detected', () => {
    const autoDetected = new Set(['Bill Of Lading'])
    expect(resolveAllowBlankFields(sameFields, { 'Bill Of Lading': false }, autoDetected)).toEqual([])
  })

  it('a field with no override falls back to auto-detection independently of other fields overrides', () => {
    const autoDetected = new Set(['Invoice Number'])
    const result = resolveAllowBlankFields(sameFields, { 'Root Id': true }, autoDetected)
    expect(result.sort()).toEqual(['Invoice Number', 'Root Id'])
  })
})

describe('applyAllowBlankFields', () => {
  it('promotes the named fields from SAME to UNIQUE', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Bill Of Lading': 'SAME', 'Audit ID': 'UNIQUE' })
    const result = applyAllowBlankFields(ruleSet, ['Bill Of Lading'])

    expect(result.same).toEqual(['Root Id'])
    expect(result.unique.sort()).toEqual(['Audit ID', 'Bill Of Lading'])
    expect(result.byField.get('Bill Of Lading')).toBe('UNIQUE')
    expect(result.fields.find((f) => f.field === 'Bill Of Lading')?.rule).toBe('UNIQUE')
  })

  it('leaves optional and ignored fields untouched', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Bill Of Lading': 'SAME', 'Notes': 'OPTIONAL', 'Created By': 'N/A' })
    const result = applyAllowBlankFields(ruleSet, ['Bill Of Lading'])
    expect(result.optional).toEqual(['Notes'])
    expect(result.ignored).toEqual(['Created By'])
  })

  it('ignores a name that is not actually in ruleSet.same (e.g. a stale remembered override)', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME' })
    const result = applyAllowBlankFields(ruleSet, ['Some Field That No Longer Exists'])
    expect(result).toBe(ruleSet)
  })

  it('returns the same reference when given an empty list', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME' })
    expect(applyAllowBlankFields(ruleSet, [])).toBe(ruleSet)
  })

  it('never mutates the original rule set', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Bill Of Lading': 'SAME' })
    applyAllowBlankFields(ruleSet, ['Bill Of Lading'])
    expect(ruleSet.same).toEqual(['Root Id', 'Bill Of Lading'])
    expect(ruleSet.byField.get('Bill Of Lading')).toBe('SAME')
  })

  it('can promote every SAME field, leaving none behind (hasRunnableRuleSet is then false - see isRuleDefinitionRunnable tests)', () => {
    const ruleSet = ruleSetFrom({ 'Bill Of Lading': 'SAME' })
    const result = applyAllowBlankFields(ruleSet, ['Bill Of Lading'])
    expect(result.same).toEqual([])
    expect(result.unique).toEqual(['Bill Of Lading'])
  })
})

describe('deriveEffectiveRuleSet', () => {
  it('drops unmapped fields AND promotes blank-detected SAME fields together', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Invoice Number': 'SAME', 'Bill Of Lading': 'SAME', 'Ghost Field': 'SAME' })
    const headers = ['Root Id', 'Invoice Number', 'Bill Of Lading'] // Ghost Field has no column at all
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [
      ['1', 'INV-1', null],
      ['2', 'INV-2', 'BOL-2'],
    ]

    const effective = deriveEffectiveRuleSet(ruleSet, mapping, headers, rows, undefined)
    expect(effective.same.sort()).toEqual(['Invoice Number', 'Root Id'])
    expect(effective.unique).toEqual(['Bill Of Lading']) // auto-detected blank, promoted
    expect(effective.ignored).toEqual(['Ghost Field']) // unmapped, dropped first
  })

  it('an explicit false override keeps a blank field strict even though the file has blanks in it', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Bill Of Lading': 'SAME' })
    const headers = ['Root Id', 'Bill Of Lading']
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [['1', null]]

    const effective = deriveEffectiveRuleSet(ruleSet, mapping, headers, rows, { 'Bill Of Lading': false })
    expect(effective.same.sort()).toEqual(['Bill Of Lading', 'Root Id'])
  })

  it('an explicit true override promotes a field even when this particular file has no blanks in it', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Bill Of Lading': 'SAME' })
    const headers = ['Root Id', 'Bill Of Lading']
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [['1', 'BOL-1']]

    const effective = deriveEffectiveRuleSet(ruleSet, mapping, headers, rows, { 'Bill Of Lading': true })
    expect(effective.same).toEqual(['Root Id'])
    expect(effective.unique).toEqual(['Bill Of Lading'])
  })

  it('reproduces the real-world scenario: blank-tolerant field still flags a genuine mismatch via UNIQUE semantics', () => {
    // Mirrors the hand-verified sample: two records share Root Id/Invoice
    // Number, both blank on Bill Of Lading but with different Audit ID, and
    // a third record shares Root Id/Invoice Number with a REAL Bill Of
    // Lading and the first record's Audit ID.
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Invoice Number': 'SAME', 'Bill Of Lading': 'SAME', 'Audit ID': 'UNIQUE' })
    const headers = ['Root Id', 'Invoice Number', 'Bill Of Lading', 'Audit ID']
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [
      ['200', 'INV-2', null, 'A2'],
      ['200', 'INV-2', null, 'A3'],
      ['200', 'INV-2', 'BOL-200', 'A2'],
    ]
    const effective = deriveEffectiveRuleSet(ruleSet, mapping, headers, rows, undefined)
    expect(effective.same.sort()).toEqual(['Invoice Number', 'Root Id'])
    expect(effective.unique.sort()).toEqual(['Audit ID', 'Bill Of Lading'])
  })
})

describe('isRuleDefinitionRunnable', () => {
  it('is true when at least one SAME field remains after both derivations', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME', 'Bill Of Lading': 'SAME' })
    const headers = ['Root Id', 'Bill Of Lading']
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [['1', null]]
    expect(isRuleDefinitionRunnable(ruleSet, mapping, headers, rows, undefined)).toBe(true)
  })

  it('is false when the only SAME field gets auto-detected as blank-tolerant and promoted away', () => {
    const ruleSet = ruleSetFrom({ 'Bill Of Lading': 'SAME' })
    const headers = ['Bill Of Lading']
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [[null]]
    expect(isRuleDefinitionRunnable(ruleSet, mapping, headers, rows, undefined)).toBe(false)
  })

  it('an explicit false override can keep a single-SAME-field rule runnable despite blanks in the file', () => {
    const ruleSet = ruleSetFrom({ 'Bill Of Lading': 'SAME' })
    const headers = ['Bill Of Lading']
    const mapping = buildColumnMapping(ruleSet, headers)
    const rows: CellValue[][] = [[null]]
    expect(isRuleDefinitionRunnable(ruleSet, mapping, headers, rows, { 'Bill Of Lading': false })).toBe(true)
  })
})

describe('allRuleDefinitionsRunnable', () => {
  it('is false with no rule definitions or no mapping', () => {
    const ruleSet = ruleSetFrom({ 'Root Id': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Root Id'])
    expect(allRuleDefinitionsRunnable([], mapping, null, [])).toBe(false)
    const def = ruleDefinitionFrom('a.json', { 'Root Id': 'SAME' })
    expect(allRuleDefinitionsRunnable([def], null, null, [])).toBe(false)
  })

  it('looks up each definition\'s own blank overrides from its matching saved rule', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Bill Of Lading': 'SAME' })
    const saved = savedRuleFrom('rules.json', { 'Bill Of Lading': 'SAME' }, { 'Bill Of Lading': false })
    const headers = ['Bill Of Lading']
    const mapping = buildColumnMapping(def.ruleSet, headers)
    const dataset = datasetFrom(headers, [[null]])

    // Without the override, the file's blank would auto-promote the only SAME field away -> not runnable.
    expect(allRuleDefinitionsRunnable([def], mapping, dataset, [])).toBe(false)
    // With the matching saved rule's explicit "false" override, it stays strict SAME and runnable.
    expect(allRuleDefinitionsRunnable([def], mapping, dataset, [saved])).toBe(true)
  })

  it('requires every loaded rule definition to be runnable, not just one', () => {
    const defA = ruleDefinitionFrom('a.json', { 'Root Id': 'SAME' }, 'id-a')
    const defB = ruleDefinitionFrom('b.json', { 'Bill Of Lading': 'SAME' }, 'id-b')
    const headers = ['Root Id', 'Bill Of Lading']
    const mapping = buildColumnMapping([defA.ruleSet, defB.ruleSet], headers)
    const dataset = datasetFrom(headers, [['1', null]])

    // defB's only SAME field auto-promotes away due to the blank -> defB not runnable -> overall false.
    expect(allRuleDefinitionsRunnable([defA, defB], mapping, dataset, [])).toBe(false)
  })
})
