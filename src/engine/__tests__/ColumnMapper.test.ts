import { describe, it, expect } from 'vitest'
import {
  buildColumnMapping,
  updateMappingEntry,
  acceptSuggestion,
  buildColumnIndexByField,
  deriveRunnableRuleSet,
  applyRememberedColumnMappings,
} from '../ColumnMapper'
import { buildRuleSet, hasRunnableRuleSet } from '../RuleValidator'
import type { RuleDefinition, RuleSet, SavedRule } from '@/types'

function ruleSetFrom(fields: Record<string, string>): RuleSet {
  const entries = Object.entries(fields).map(([field, value]) => ({ field, value }))
  const result = buildRuleSet(entries)
  if (!result.success || !result.ruleSet) throw new Error('invalid rule set fixture')
  return result.ruleSet
}

function ruleDefinitionFrom(fileName: string, fields: Record<string, string>): RuleDefinition {
  const ruleSet = ruleSetFrom(fields)
  return { id: 'session-id', fileName, ruleSet, totalFields: ruleSet.fields.length }
}

function savedRuleFrom(fileName: string, fields: Record<string, string>, columnMapping?: Record<string, string>): SavedRule {
  const ruleSet = ruleSetFrom(fields)
  return { id: 'saved-id', name: fileName, fileName, fields: ruleSet.fields, savedAt: '2026-01-01T00:00:00.000Z', columnMapping }
}

describe('buildColumnMapping', () => {
  it('marks an exact header match as exact / "Found"', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Invoice Number', 'Client Code'])
    expect(mapping.entryByField.get('Invoice Number')).toMatchObject({
      excelColumn: 'Invoice Number',
      confidence: 'exact',
    })
    expect(mapping.allRequiredMapped).toBe(true)
  })

  it('matches case/spacing/punctuation-insensitively as exact', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['invoice_number'])
    expect(mapping.entryByField.get('Invoice Number')).toMatchObject({
      excelColumn: 'invoice_number',
      confidence: 'exact',
    })
  })

  it('suggests a close match without auto-confirming it', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Invoice No'])
    const entry = mapping.entryByField.get('Invoice Number')
    expect(entry?.excelColumn).toBeNull()
    expect(entry?.confidence).toBe('suggested')
    expect(entry?.suggestion).toBe('Invoice No')
    expect(mapping.allRequiredMapped).toBe(false)
  })

  it('reports no match when nothing is close enough', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Zzyzx Quantum Flux'])
    expect(mapping.entryByField.get('Invoice Number')?.confidence).toBe('none')
  })

  it('flags missing required (SAME/UNIQUE) fields but not missing OPTIONAL/N/A fields', () => {
    const ruleSet = ruleSetFrom({
      'Invoice Number': 'SAME',
      'Audit ID': 'UNIQUE',
      'Invoice Due Date': 'OPTIONAL',
      'Check Number': 'N/A',
    })
    const mapping = buildColumnMapping(ruleSet, [])
    expect([...mapping.missingRequired].sort()).toEqual(['Audit ID', 'Invoice Number'])
    expect(mapping.allRequiredMapped).toBe(false)
  })
})

describe('updateMappingEntry / acceptSuggestion', () => {
  it('lets the user confirm a fuzzy suggestion', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const initial = buildColumnMapping(ruleSet, ['Invoice No'])
    const confirmed = acceptSuggestion(initial, ruleSet, 'Invoice Number')
    expect(confirmed.entryByField.get('Invoice Number')).toMatchObject({
      excelColumn: 'Invoice No',
      confidence: 'manual',
    })
    expect(confirmed.allRequiredMapped).toBe(true)
  })

  it('lets the user manually pick or clear a column', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const initial = buildColumnMapping(ruleSet, ['Some Other Column'])
    const manual = updateMappingEntry(initial, ruleSet, 'Invoice Number', 'Some Other Column')
    expect(manual.entryByField.get('Invoice Number')?.confidence).toBe('manual')

    const cleared = updateMappingEntry(manual, ruleSet, 'Invoice Number', null)
    expect(cleared.entryByField.get('Invoice Number')?.confidence).toBe('none')
    expect(cleared.allRequiredMapped).toBe(false)
  })
})

describe('buildColumnMapping with multiple rule sets', () => {
  it('unions field lists across rule sets without duplicating shared fields', () => {
    const ruleA = ruleSetFrom({ 'Invoice Number': 'SAME', 'Audit ID': 'UNIQUE' })
    const ruleB = ruleSetFrom({ 'Invoice Number': 'SAME', 'Invoice Due Date': 'OPTIONAL' })
    const mapping = buildColumnMapping([ruleA, ruleB], ['Invoice Number', 'Audit ID', 'Invoice Due Date'])

    expect(mapping.entries.map((e) => e.jsonField)).toEqual(['Invoice Number', 'Audit ID', 'Invoice Due Date'])
    expect(mapping.entryByField.get('Invoice Number')).toMatchObject({ confidence: 'exact' })
  })

  it('treats a field as required if any rule set marks it SAME or UNIQUE', () => {
    const ruleA = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const ruleB = ruleSetFrom({ 'Audit ID': 'UNIQUE' })
    const mapping = buildColumnMapping([ruleA, ruleB], [])

    expect([...mapping.missingRequired].sort()).toEqual(['Audit ID', 'Invoice Number'])
    expect(mapping.allRequiredMapped).toBe(false)
  })

  it('updateMappingEntry / acceptSuggestion accept an array of rule sets too', () => {
    const ruleA = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const ruleB = ruleSetFrom({ 'Audit ID': 'UNIQUE' })
    const initial = buildColumnMapping([ruleA, ruleB], ['Some Other Column'])

    const manual = updateMappingEntry(initial, [ruleA, ruleB], 'Invoice Number', 'Some Other Column')
    expect(manual.entryByField.get('Invoice Number')?.confidence).toBe('manual')
    // Audit ID is still unmapped, and is required by ruleB, so the union mapping is still incomplete.
    expect(manual.allRequiredMapped).toBe(false)
  })
})

describe('deriveRunnableRuleSet', () => {
  it('moves an unmapped SAME field to ignored (N/A) for the derived rule set', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME', 'Client Code': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Invoice Number']) // Client Code has no column
    const derived = deriveRunnableRuleSet(ruleSet, mapping)

    expect(derived.same).toEqual(['Invoice Number'])
    expect(derived.ignored).toEqual(['Client Code'])
    expect(derived.byField.get('Client Code')).toBe('N/A')
    expect(derived.fields.find((f) => f.field === 'Client Code')?.rule).toBe('N/A')
  })

  it('still allows the run when at least one SAME field remains mapped', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME', 'Client Code': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Invoice Number'])
    expect(hasRunnableRuleSet(deriveRunnableRuleSet(ruleSet, mapping))).toBe(true)
  })

  it('blocks the run only when EVERY SAME field is unmapped', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, [])
    expect(hasRunnableRuleSet(deriveRunnableRuleSet(ruleSet, mapping))).toBe(false)
  })

  it('also downgrades unmapped UNIQUE/OPTIONAL fields, leaving mapped ones alone', () => {
    const ruleSet = ruleSetFrom({
      'Invoice Number': 'SAME',
      'Audit ID': 'UNIQUE',
      'Invoice Due Date': 'OPTIONAL',
    })
    const mapping = buildColumnMapping(ruleSet, ['Invoice Number', 'Audit ID']) // Invoice Due Date unmapped
    const derived = deriveRunnableRuleSet(ruleSet, mapping)

    expect(derived.unique).toEqual(['Audit ID'])
    expect(derived.optional).toEqual([])
    expect(derived.ignored).toEqual(['Invoice Due Date'])
  })

  it('never mutates the original rule set', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME', 'Client Code': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Invoice Number'])
    deriveRunnableRuleSet(ruleSet, mapping)

    expect(ruleSet.same).toEqual(['Invoice Number', 'Client Code'])
    expect(ruleSet.ignored).toEqual([])
    expect(ruleSet.byField.get('Client Code')).toBe('SAME')
  })

  it('returns the same object when nothing needs to be dropped', () => {
    const ruleSet = ruleSetFrom({ 'Invoice Number': 'SAME' })
    const mapping = buildColumnMapping(ruleSet, ['Invoice Number'])
    expect(deriveRunnableRuleSet(ruleSet, mapping)).toBe(ruleSet)
  })
})

describe('applyRememberedColumnMappings', () => {
  it('fills in a field left unmapped, using the remembered column from the matching saved rule', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Invoice Number': 'SAME', 'Weird Field': 'UNIQUE' })
    const saved = savedRuleFrom('rules.json', { 'Invoice Number': 'SAME', 'Weird Field': 'UNIQUE' }, { 'Weird Field': 'Actual Column' })
    const headers = ['Invoice Number', 'Actual Column']
    const base = buildColumnMapping(def.ruleSet, headers)
    expect(base.entryByField.get('Weird Field')?.excelColumn).toBeNull() // sanity check: unmapped before

    const result = applyRememberedColumnMappings(base, [def], [saved], headers)
    expect(result.entryByField.get('Weird Field')).toMatchObject({ excelColumn: 'Actual Column', confidence: 'manual' })
    expect(result.entryByField.get('Invoice Number')).toMatchObject({ excelColumn: 'Invoice Number', confidence: 'exact' })
    expect(result.allRequiredMapped).toBe(true)
  })

  it('matches a remembered column case/spacing/punctuation-insensitively, same as a fresh exact match would', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Weird Field': 'UNIQUE' })
    // Remembered against a file that had "Actual Column"; the current file spells it differently.
    const saved = savedRuleFrom('rules.json', { 'Weird Field': 'UNIQUE' }, { 'Weird Field': 'Actual Column' })
    const headers = ['actual_column']
    const base = buildColumnMapping(def.ruleSet, headers)

    const result = applyRememberedColumnMappings(base, [def], [saved], headers)
    // Resolves to the CURRENT file's own header text, not the remembered casing.
    expect(result.entryByField.get('Weird Field')).toMatchObject({ excelColumn: 'actual_column', confidence: 'manual' })
  })

  it('never overrides a field that already matched on its own', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Invoice Number': 'SAME' })
    const saved = savedRuleFrom('rules.json', { 'Invoice Number': 'SAME' }, { 'Invoice Number': 'Some Other Column' })
    const headers = ['Invoice Number', 'Some Other Column']
    const base = buildColumnMapping(def.ruleSet, headers)

    const result = applyRememberedColumnMappings(base, [def], [saved], headers)
    expect(result.entryByField.get('Invoice Number')).toMatchObject({ excelColumn: 'Invoice Number', confidence: 'exact' })
  })

  it('ignores a remembered column that does not exist in this Excel file', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Weird Field': 'UNIQUE' })
    const saved = savedRuleFrom('rules.json', { 'Weird Field': 'UNIQUE' }, { 'Weird Field': 'Column That Is Gone' })
    const headers = ['Some Column']
    const base = buildColumnMapping(def.ruleSet, headers)

    const result = applyRememberedColumnMappings(base, [def], [saved], headers)
    expect(result.entryByField.get('Weird Field')?.excelColumn).toBeNull()
    expect(result).toBe(base) // nothing changed - same reference back
  })

  it('does not apply a remembered mapping from an unrelated saved rule (different fields)', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Weird Field': 'UNIQUE' })
    const unrelated = savedRuleFrom('other-rules.json', { 'Different Field': 'SAME' }, { 'Weird Field': 'Some Column' })
    const headers = ['Some Column']
    const base = buildColumnMapping(def.ruleSet, headers)

    const result = applyRememberedColumnMappings(base, [def], [unrelated], headers)
    expect(result).toBe(base)
  })

  it('returns the same reference when there are no saved rules at all', () => {
    const def = ruleDefinitionFrom('rules.json', { 'Invoice Number': 'SAME' })
    const base = buildColumnMapping(def.ruleSet, [])
    expect(applyRememberedColumnMappings(base, [def], [], [])).toBe(base)
  })
})

describe('buildColumnIndexByField', () => {
  it('maps field names to header column indexes, skipping unmapped fields', () => {
    const headers = ['Client Code', 'Invoice Number', 'Invoice Amount']
    const mapping = [
      { jsonField: 'Invoice Number', excelColumn: 'Invoice Number', confidence: 'exact' as const },
      { jsonField: 'Amount', excelColumn: 'Invoice Amount', confidence: 'exact' as const },
      { jsonField: 'Nothing', excelColumn: null, confidence: 'none' as const },
    ]
    const index = buildColumnIndexByField(headers, mapping)
    expect(index.get('Invoice Number')).toBe(1)
    expect(index.get('Amount')).toBe(2)
    expect(index.has('Nothing')).toBe(false)
  })
})
