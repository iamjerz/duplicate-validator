import { describe, it, expect } from 'vitest'
import { deriveAutoDisposition, buildAutoDispositions } from '../AutoDisposition'
import type { DuplicateGroup, KPISummary, RuleDefinition, RuleSet, RuleValidationOutcome } from '@/types'

function emptyRuleSet(): RuleSet {
  return { fields: [], byField: new Map(), same: [], unique: [], optional: [], ignored: [] }
}

function zeroKpis(): KPISummary {
  return {
    totalRecords: 0,
    duplicateRecords: 0,
    potentialDuplicateRecords: 0,
    uniqueRecords: 0,
    validationErrorRecords: 0,
    duplicateGroups: 0,
    potentialDuplicateGroups: 0,
    duplicateRate: 0,
  }
}

function ruleDef(id: string, analysis: string | undefined): RuleDefinition {
  return {
    id,
    fileName: `${id}.json`,
    ruleSet: emptyRuleSet(),
    metadata: analysis === undefined ? undefined : { analysis },
    totalFields: 0,
  }
}

function groupFrom(id: string, status: DuplicateGroup['status']): DuplicateGroup {
  return {
    id,
    status,
    records: [],
    matchedSameFields: [],
    differentUniqueFields: [],
    differentOptionalFields: [],
    ignoredFields: [],
    sameFieldValues: {},
    uniqueDifferences: [],
    optionalDifferences: [],
    explanation: { lines: [], classification: status, summary: '' },
  }
}

function outcomeFrom(ruleDefinitionId: string, groups: DuplicateGroup[]): RuleValidationOutcome {
  return {
    ruleDefinitionId,
    result: {
      groups,
      validationErrors: [],
      kpis: zeroKpis(),
      ruleEvaluation: [],
      generatedAt: new Date(0).toISOString(),
      durationMs: 0,
    },
    effectiveRuleSet: emptyRuleSet(),
  }
}

describe('deriveAutoDisposition', () => {
  it('maps a "Potential Duplicate" Analysis to the Carrier Review disposition', () => {
    expect(deriveAutoDisposition('Potential Duplicate')).toBe('Carrier Review')
  })

  it('maps a "True Duplicate" Analysis (with trailing words) to Reject Shipment', () => {
    expect(deriveAutoDisposition('True Duplicate for denial')).toBe('Reject Shipment')
  })

  it('matches case-insensitively', () => {
    expect(deriveAutoDisposition('POTENTIAL DUPLICATE')).toBe('Carrier Review')
    expect(deriveAutoDisposition('true duplicate')).toBe('Reject Shipment')
  })

  it('is insensitive to surrounding whitespace', () => {
    expect(deriveAutoDisposition('  Potential Duplicate  ')).toBe('Carrier Review')
  })

  it('returns null for undefined, blank, or unrelated Analysis text', () => {
    expect(deriveAutoDisposition(undefined)).toBeNull()
    expect(deriveAutoDisposition('')).toBeNull()
    expect(deriveAutoDisposition('   ')).toBeNull()
    expect(deriveAutoDisposition('Some other rule')).toBeNull()
  })

  it('prefers "True Duplicate" when a string somehow contains both phrases', () => {
    expect(deriveAutoDisposition('True Duplicate and also Potential Duplicate')).toBe('Reject Shipment')
  })
})

describe('buildAutoDispositions', () => {
  it('seeds Carrier Review for every flagged group under a Potential-Duplicate rule', () => {
    const def = ruleDef('rule-1', 'Potential Duplicate')
    const groups = [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE'), groupFrom('DUP-2', 'POTENTIAL_DUPLICATE')]
    const result = buildAutoDispositions([outcomeFrom('rule-1', groups)], [def])
    expect(result.get('rule-1')?.get('DUP-1')).toBe('Carrier Review')
    expect(result.get('rule-1')?.get('DUP-2')).toBe('Carrier Review')
  })

  it('seeds Reject Shipment for every flagged group under a True-Duplicate rule', () => {
    const def = ruleDef('rule-1', 'True Duplicate for denial')
    const groups = [groupFrom('DUP-1', 'DUPLICATE'), groupFrom('DUP-2', 'POTENTIAL_DUPLICATE')]
    const result = buildAutoDispositions([outcomeFrom('rule-1', groups)], [def])
    expect(result.get('rule-1')?.get('DUP-1')).toBe('Reject Shipment')
    expect(result.get('rule-1')?.get('DUP-2')).toBe('Reject Shipment')
  })

  it('skips UNIQUE groups entirely, even under a recognized rule', () => {
    const def = ruleDef('rule-1', 'Potential Duplicate')
    const groups = [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE'), groupFrom('DUP-2', 'UNIQUE')]
    const result = buildAutoDispositions([outcomeFrom('rule-1', groups)], [def])
    const forRule = result.get('rule-1')
    expect(forRule?.has('DUP-1')).toBe(true)
    expect(forRule?.has('DUP-2')).toBe(false)
    expect(forRule?.size).toBe(1)
  })

  it('contributes no entry at all for a rule whose Analysis matches neither phrase', () => {
    const def = ruleDef('rule-1', 'Some custom rule')
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoDispositions([outcomeFrom('rule-1', groups)], [def])
    expect(result.has('rule-1')).toBe(false)
  })

  it('contributes no entry for a rule with no metadata/Analysis at all', () => {
    const def = ruleDef('rule-1', undefined)
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoDispositions([outcomeFrom('rule-1', groups)], [def])
    expect(result.has('rule-1')).toBe(false)
  })

  it('keeps every rule in a multi-rule run independent', () => {
    const potentialDef = ruleDef('rule-potential', 'Potential Duplicate')
    const trueDef = ruleDef('rule-true', 'True Duplicate for denial')
    const customDef = ruleDef('rule-custom', 'Something else')
    const outcomes = [
      outcomeFrom('rule-potential', [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE')]),
      outcomeFrom('rule-true', [groupFrom('DUP-2', 'DUPLICATE')]),
      outcomeFrom('rule-custom', [groupFrom('DUP-3', 'DUPLICATE')]),
    ]
    const result = buildAutoDispositions(outcomes, [potentialDef, trueDef, customDef])
    expect(result.get('rule-potential')?.get('DUP-1')).toBe('Carrier Review')
    expect(result.get('rule-true')?.get('DUP-2')).toBe('Reject Shipment')
    expect(result.has('rule-custom')).toBe(false)
    expect(result.size).toBe(2)
  })

  it('returns an empty map when given no results (e.g. results cleared/invalidated)', () => {
    const def = ruleDef('rule-1', 'Potential Duplicate')
    const result = buildAutoDispositions([], [def])
    expect(result.size).toBe(0)
  })

  it('contributes no entry when the outcome references a rule definition that no longer exists', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoDispositions([outcomeFrom('missing-rule', groups)], [])
    expect(result.has('missing-rule')).toBe(false)
  })
})
