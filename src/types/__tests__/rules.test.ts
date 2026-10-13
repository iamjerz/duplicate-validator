import { describe, it, expect } from 'vitest'
import { countRuleFields, countRules } from '../rules'
import { buildRuleSet } from '@/engine/RuleValidator'
import type { ParsedRuleField } from '../rules'

const FIELDS: ParsedRuleField[] = [
  { field: 'Root Id', rule: 'SAME' },
  { field: 'Invoice Number', rule: 'SAME' },
  { field: 'Audit ID', rule: 'UNIQUE' },
  { field: 'Due Date', rule: 'OPTIONAL' },
  { field: 'Notes', rule: 'N/A' },
  { field: 'Comments', rule: 'N/A' },
]

describe('countRuleFields', () => {
  it('tallies each rule value independently of any indexed RuleSet', () => {
    expect(countRuleFields(FIELDS)).toEqual({ same: 2, unique: 1, optional: 1, ignored: 2, total: 6 })
  })

  it('returns all zeros for an empty field list', () => {
    expect(countRuleFields([])).toEqual({ same: 0, unique: 0, optional: 0, ignored: 0, total: 0 })
  })
})

describe('countRules', () => {
  it('matches countRuleFields for the same fields, via a fully-built RuleSet', () => {
    const result = buildRuleSet(FIELDS.map((f) => ({ field: f.field, value: f.rule })))
    if (!result.success || !result.ruleSet) throw new Error('invalid rule set fixture')
    expect(countRules(result.ruleSet)).toEqual(countRuleFields(FIELDS))
  })
})
