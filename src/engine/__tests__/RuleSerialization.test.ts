import { describe, it, expect } from 'vitest'
import {
  toSerializedRuleFile,
  fromSerializedRuleFile,
  ruleFieldsEqual,
  findSavedRuleForDefinition,
  ruleFileToRawJson,
} from '../RuleSerialization'
import { parseRuleFile } from '../RuleParser'
import { buildRuleSet } from '../RuleValidator'
import type { ParsedRuleField, RuleDefinition, SavedRule, SerializedRuleFile } from '@/types'

function ruleDefinitionFrom(fields: Record<string, string>, overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  const entries = Object.entries(fields).map(([field, value]) => ({ field, value }))
  const result = buildRuleSet(entries)
  if (!result.success || !result.ruleSet) throw new Error('invalid rule set fixture')
  return {
    id: 'rule-fixture-1',
    fileName: 'fixture.json',
    ruleSet: result.ruleSet,
    totalFields: result.ruleSet.fields.length,
    ...overrides,
  }
}

function savedRuleFrom(fileName: string, fields: ParsedRuleField[], overrides: Partial<SavedRule> = {}): SavedRule {
  return { id: 'saved-fixture-1', name: fileName, fileName, fields, savedAt: '2026-01-01T00:00:00.000Z', ...overrides }
}

describe('toSerializedRuleFile', () => {
  it('keeps fileName, fields, and metadata, dropping the Map-based byField index', () => {
    const def = ruleDefinitionFrom(
      { 'Invoice Number': 'SAME', 'Audit ID': 'UNIQUE' },
      { fileName: 'my-rules.json', metadata: { level: 'Invoice_level', analysis: 'True Duplicate' } }
    )
    const serialized = toSerializedRuleFile(def)
    expect(serialized).toEqual({
      fileName: 'my-rules.json',
      fields: [
        { field: 'Invoice Number', rule: 'SAME' },
        { field: 'Audit ID', rule: 'UNIQUE' },
      ],
      metadata: { level: 'Invoice_level', analysis: 'True Duplicate' },
    })
    // Confirm this really is JSON-safe (no Map survives a stringify/parse round trip as itself).
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized)
  })

  it('omits metadata entirely when the rule definition has none', () => {
    const def = ruleDefinitionFrom({ 'Root Id': 'SAME' })
    expect(toSerializedRuleFile(def).metadata).toBeUndefined()
  })
})

describe('fromSerializedRuleFile', () => {
  it('rebuilds an equivalent, fully-indexed RuleSet from a serialized shape', () => {
    const serialized: SerializedRuleFile = {
      fileName: 'my-rules.json',
      fields: [
        { field: 'Invoice Number', rule: 'SAME' },
        { field: 'Audit ID', rule: 'UNIQUE' },
        { field: 'Due Date', rule: 'OPTIONAL' },
        { field: 'Notes', rule: 'N/A' },
      ],
      metadata: { level: 'Invoice_level' },
    }
    const def = fromSerializedRuleFile(serialized)
    expect(def).not.toBeNull()
    expect(def!.fileName).toBe('my-rules.json')
    expect(def!.metadata).toEqual({ level: 'Invoice_level' })
    expect(def!.ruleSet.same).toEqual(['Invoice Number'])
    expect(def!.ruleSet.unique).toEqual(['Audit ID'])
    expect(def!.ruleSet.optional).toEqual(['Due Date'])
    expect(def!.ruleSet.ignored).toEqual(['Notes'])
    expect(def!.ruleSet.byField.get('Invoice Number')).toBe('SAME')
    expect(def!.totalFields).toBe(4)
  })

  it('assigns a fresh id every call, never reusing one across restores', () => {
    const serialized: SerializedRuleFile = { fileName: 'a.json', fields: [{ field: 'Root Id', rule: 'SAME' }] }
    const first = fromSerializedRuleFile(serialized)
    const second = fromSerializedRuleFile(serialized)
    expect(first!.id).not.toBe(second!.id)
  })

  it('round-trips through toSerializedRuleFile without changing the effective rule set', () => {
    const original = ruleDefinitionFrom(
      { 'Root Id': 'SAME', 'Audit ID': 'UNIQUE', 'Due Date': 'OPTIONAL' },
      { metadata: { analysis: 'Potential Duplicate' } }
    )
    const restored = fromSerializedRuleFile(toSerializedRuleFile(original))
    expect(restored!.ruleSet.same).toEqual(original.ruleSet.same)
    expect(restored!.ruleSet.unique).toEqual(original.ruleSet.unique)
    expect(restored!.ruleSet.optional).toEqual(original.ruleSet.optional)
    expect(restored!.ruleSet.ignored).toEqual(original.ruleSet.ignored)
    expect(restored!.metadata).toEqual(original.metadata)
  })

  it('returns null for an empty fields array', () => {
    expect(fromSerializedRuleFile({ fileName: 'empty.json', fields: [] })).toBeNull()
  })

  it('returns null when fields is missing or malformed (defensive against hand-edited localStorage)', () => {
    expect(fromSerializedRuleFile({ fileName: 'bad.json' } as unknown as SerializedRuleFile)).toBeNull()
    expect(
      fromSerializedRuleFile({ fileName: 'bad.json', fields: 'not-an-array' } as unknown as SerializedRuleFile)
    ).toBeNull()
  })
})

describe('ruleFileToRawJson', () => {
  const fields: ParsedRuleField[] = [
    { field: 'Invoice Number', rule: 'SAME' },
    { field: 'Audit ID', rule: 'UNIQUE' },
    { field: 'Due Date', rule: 'OPTIONAL' },
    { field: 'Notes', rule: 'N/A' },
  ]

  it('produces the flat field -> rule shape when there is no metadata', () => {
    expect(ruleFileToRawJson(fields)).toEqual({
      'Invoice Number': 'SAME',
      'Audit ID': 'UNIQUE',
      'Due Date': 'OPTIONAL',
      Notes: 'N/A',
    })
  })

  it('produces the nested {level, Analysis, Validation} shape once any metadata is present', () => {
    const raw = ruleFileToRawJson(fields, { level: 'Invoice_level', analysis: 'True Duplicate for denial' })
    expect(raw).toEqual({
      level: 'Invoice_level',
      Analysis: 'True Duplicate for denial',
      Validation: {
        'Invoice Number': 'SAME',
        'Audit ID': 'UNIQUE',
        'Due Date': 'OPTIONAL',
        Notes: 'N/A',
      },
    })
  })

  it('carries any "extra" descriptive text fields through at the top level', () => {
    const raw = ruleFileToRawJson(fields, { level: 'Invoice_level', extra: { Owner: 'AP Team' } })
    expect(raw).toEqual({
      level: 'Invoice_level',
      Owner: 'AP Team',
      Validation: {
        'Invoice Number': 'SAME',
        'Audit ID': 'UNIQUE',
        'Due Date': 'OPTIONAL',
        Notes: 'N/A',
      },
    })
  })

  it('omits a metadata key entirely when that piece of text is absent, rather than writing an empty string', () => {
    const raw = ruleFileToRawJson(fields, { analysis: 'Potential Duplicate' })
    expect(raw).not.toHaveProperty('level')
    expect((raw as Record<string, unknown>).Analysis).toBe('Potential Duplicate')
  })

  it('round-trips through parseRuleFile back to the same fields and metadata, flat shape', () => {
    const raw = ruleFileToRawJson(fields)
    const parsed = parseRuleFile(raw)
    expect(parsed.success).toBe(true)
    expect(parsed.fields).toEqual(fields.map((f) => ({ field: f.field, value: f.rule })))
    expect(parsed.metadata).toBeUndefined()
  })

  it('round-trips through parseRuleFile back to the same fields and metadata, nested shape', () => {
    const metadata = { level: 'Invoice_level', analysis: 'True Duplicate for denial' }
    const raw = ruleFileToRawJson(fields, metadata)
    const parsed = parseRuleFile(raw)
    expect(parsed.success).toBe(true)
    expect(parsed.fields).toEqual(fields.map((f) => ({ field: f.field, value: f.rule })))
    expect(parsed.metadata).toEqual(metadata)
  })

  it('is JSON-serializable (no Map, no undefined survives a stringify/parse round trip)', () => {
    const raw = ruleFileToRawJson(fields, { level: 'Invoice_level' })
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw)
  })
})

describe('ruleFieldsEqual', () => {
  it('is true for identical field lists', () => {
    const fields: ParsedRuleField[] = [
      { field: 'Invoice Number', rule: 'SAME' },
      { field: 'Audit ID', rule: 'UNIQUE' },
    ]
    expect(ruleFieldsEqual(fields, [...fields])).toBe(true)
  })

  it('is false when a classification differs', () => {
    const a: ParsedRuleField[] = [{ field: 'Invoice Number', rule: 'SAME' }]
    const b: ParsedRuleField[] = [{ field: 'Invoice Number', rule: 'UNIQUE' }]
    expect(ruleFieldsEqual(a, b)).toBe(false)
  })

  it('is false when a field is added or removed', () => {
    const a: ParsedRuleField[] = [{ field: 'Invoice Number', rule: 'SAME' }]
    const b: ParsedRuleField[] = [
      { field: 'Invoice Number', rule: 'SAME' },
      { field: 'Audit ID', rule: 'UNIQUE' },
    ]
    expect(ruleFieldsEqual(a, b)).toBe(false)
  })

  it('is order-sensitive, since field order is part of what JSON.stringify compares', () => {
    const a: ParsedRuleField[] = [
      { field: 'Invoice Number', rule: 'SAME' },
      { field: 'Audit ID', rule: 'UNIQUE' },
    ]
    const b: ParsedRuleField[] = [
      { field: 'Audit ID', rule: 'UNIQUE' },
      { field: 'Invoice Number', rule: 'SAME' },
    ]
    expect(ruleFieldsEqual(a, b)).toBe(false)
  })
})

describe('findSavedRuleForDefinition', () => {
  it('finds the saved rule with the same fileName and fields, ignoring unrelated entries', () => {
    const def = ruleDefinitionFrom({ 'Invoice Number': 'SAME' }, { fileName: 'rules.json' })
    const match = savedRuleFrom('rules.json', def.ruleSet.fields)
    const unrelated = savedRuleFrom('other.json', def.ruleSet.fields)
    expect(findSavedRuleForDefinition(def, [unrelated, match])).toBe(match)
  })

  it('returns undefined when fileName matches but fields do not (no cross-contamination)', () => {
    const def = ruleDefinitionFrom({ 'Invoice Number': 'SAME' }, { fileName: 'rules.json' })
    const sameNameDifferentFields = savedRuleFrom('rules.json', [{ field: 'Different Field', rule: 'UNIQUE' }])
    expect(findSavedRuleForDefinition(def, [sameNameDifferentFields])).toBeUndefined()
  })

  it('returns undefined when fields match but fileName does not', () => {
    const def = ruleDefinitionFrom({ 'Invoice Number': 'SAME' }, { fileName: 'rules.json' })
    const sameFieldsDifferentName = savedRuleFrom('other.json', def.ruleSet.fields)
    expect(findSavedRuleForDefinition(def, [sameFieldsDifferentName])).toBeUndefined()
  })

  it('returns undefined when the library is empty', () => {
    const def = ruleDefinitionFrom({ 'Invoice Number': 'SAME' })
    expect(findSavedRuleForDefinition(def, [])).toBeUndefined()
  })
})
