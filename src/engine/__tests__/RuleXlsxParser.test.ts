import { describe, it, expect } from 'vitest'
import { parseRuleWorkbookRows, fieldsToRuleWorkbookRows } from '../RuleXlsxParser'
import type { CellValue, ParsedRuleField } from '@/types'

describe('parseRuleWorkbookRows', () => {
  it('parses a Field Name / Rule table into ordered field/value pairs', () => {
    const headers = ['Field Name', 'Rule']
    const rows: CellValue[][] = [
      ['Root Id', 'SAME'],
      ['Invoice Number', 'SAME'],
      ['Audit ID', 'UNIQUE'],
      ['Add Comments', 'N/A'],
    ]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([
      { field: 'Root Id', value: 'SAME' },
      { field: 'Invoice Number', value: 'SAME' },
      { field: 'Audit ID', value: 'UNIQUE' },
      { field: 'Add Comments', value: 'N/A' },
    ])
    expect(result.metadata).toBeUndefined()
  })

  it('matches header names case/spacing/punctuation-insensitively', () => {
    const headers = ['field_name', 'RULE-VALUE']
    const rows: CellValue[][] = [['Root Id', 'SAME']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([{ field: 'Root Id', value: 'SAME' }])
  })

  it('accepts alternate recognized header names ("Field" and "Rule")', () => {
    const headers = ['Field', 'Rule']
    const rows: CellValue[][] = [['Root Id', 'SAME']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
  })

  it('ignores extra unrelated columns as long as Field/Rule are recognized', () => {
    const headers = ['Notes', 'Field Name', 'Owner', 'Rule']
    const rows: CellValue[][] = [['whatever', 'Root Id', 'someone', 'SAME']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([{ field: 'Root Id', value: 'SAME' }])
  })

  it('uppercases and trims a casually-typed rule value', () => {
    const headers = ['Field Name', 'Rule']
    const rows: CellValue[][] = [['Root Id', '  same  ']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([{ field: 'Root Id', value: 'SAME' }])
  })

  it('skips a blank row (no field name) rather than reporting it', () => {
    const headers = ['Field Name', 'Rule']
    const rows: CellValue[][] = [
      ['Root Id', 'SAME'],
      ['', ''],
      [null, null],
      ['Invoice Number', 'SAME'],
    ]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([
      { field: 'Root Id', value: 'SAME' },
      { field: 'Invoice Number', value: 'SAME' },
    ])
  })

  it('fails with a clear error, and does not guess positionally, when no recognized header is found', () => {
    const headers = ['Column A', 'Column B']
    const rows: CellValue[][] = [['Root Id', 'SAME']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Field Name')
    expect(result.error).toContain('Rule')
    expect(result.fields).toEqual([])
  })

  it('fails when only the Field column is recognized but no Rule column is found', () => {
    const headers = ['Field Name', 'Notes']
    const rows: CellValue[][] = [['Root Id', 'SAME']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Rule')
  })

  it('fails with a clear error when every row is blank', () => {
    const headers = ['Field Name', 'Rule']
    const rows: CellValue[][] = [
      ['', ''],
      [null, null],
    ]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No fields were found')
  })

  it('does not validate the rule value itself - an unsupported value still comes through, for validateRuleFile to catch', () => {
    const headers = ['Field Name', 'Rule']
    const rows: CellValue[][] = [['Root Id', 'MATCH']]
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual([{ field: 'Root Id', value: 'MATCH' }])
  })
})

describe('fieldsToRuleWorkbookRows', () => {
  const fields: ParsedRuleField[] = [
    { field: 'Root Id', rule: 'SAME' },
    { field: 'Audit ID', rule: 'UNIQUE' },
    { field: 'Due Date', rule: 'OPTIONAL' },
    { field: 'Notes', rule: 'N/A' },
  ]

  it('lays out a "Field Name" / "Rule" header row followed by one row per field, in order', () => {
    const { headers, rows } = fieldsToRuleWorkbookRows(fields)
    expect(headers).toEqual(['Field Name', 'Rule'])
    expect(rows).toEqual([
      ['Root Id', 'SAME'],
      ['Audit ID', 'UNIQUE'],
      ['Due Date', 'OPTIONAL'],
      ['Notes', 'N/A'],
    ])
  })

  it('returns an empty row list for an empty field list (still a valid header-only table)', () => {
    const { headers, rows } = fieldsToRuleWorkbookRows([])
    expect(headers).toEqual(['Field Name', 'Rule'])
    expect(rows).toEqual([])
  })

  it('round-trips through parseRuleWorkbookRows back to the exact same fields', () => {
    const { headers, rows } = fieldsToRuleWorkbookRows(fields)
    const result = parseRuleWorkbookRows(headers, rows)
    expect(result.success).toBe(true)
    expect(result.fields).toEqual(fields.map((f) => ({ field: f.field, value: f.rule })))
  })
})
