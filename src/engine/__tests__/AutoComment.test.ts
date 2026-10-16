import { describe, it, expect } from 'vitest'
import { deriveInitials, formatMMDDYY, buildAutoComments } from '../AutoComment'
import type { DuplicateGroup, KPISummary, RuleDefinition, RuleFileMetadata, RuleSet, RuleValidationOutcome } from '@/types'

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

function ruleDef(id: string, metadata: RuleFileMetadata | undefined): RuleDefinition {
  return {
    id,
    fileName: `${id}.json`,
    ruleSet: emptyRuleSet(),
    metadata,
    totalFields: 0,
  }
}

function groupFrom(
  id: string,
  status: DuplicateGroup['status'],
  dispositionOverride: DuplicateGroup['dispositionOverride'] = null
): DuplicateGroup {
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
    dispositionOverride,
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

const OCT_16_2026 = new Date(2026, 9, 16) // JS months are 0-indexed - October

describe('deriveInitials', () => {
  it('takes the first letter of each word, uppercased', () => {
    expect(deriveInitials('Juan Dela Cruz')).toBe('JDC')
  })

  it('handles a two-word name', () => {
    expect(deriveInitials('Jerramy Calites')).toBe('JC')
  })

  it('handles a single-word name', () => {
    expect(deriveInitials('Jerramy')).toBe('J')
  })

  it('collapses multiple/leading/trailing spaces', () => {
    expect(deriveInitials('  Juan   Dela  Cruz  ')).toBe('JDC')
  })

  it('is already uppercase-safe for lowercase input', () => {
    expect(deriveInitials('juan dela cruz')).toBe('JDC')
  })

  it('returns an empty string for blank or whitespace-only input', () => {
    expect(deriveInitials('')).toBe('')
    expect(deriveInitials('   ')).toBe('')
  })

  it('treats a hyphenated or apostrophed segment as one word', () => {
    expect(deriveInitials("Mary-Jane O'Brien")).toBe('MO')
  })
})

describe('formatMMDDYY', () => {
  it('formats a date as zero-padded MMDDYY with no separators', () => {
    expect(formatMMDDYY(OCT_16_2026)).toBe('101626')
  })

  it('zero-pads single-digit months and days', () => {
    expect(formatMMDDYY(new Date(2026, 0, 5))).toBe('010526')
  })

  it('uses the last two digits of the year', () => {
    expect(formatMMDDYY(new Date(2031, 11, 25))).toBe('122531')
  })
})

describe('buildAutoComments', () => {
  it('assembles the exact "Initials: MMDDYY : Type : Reason" format for a True-Duplicate rule', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice No. and Invoice Amount.' })
    const groups = [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JDC: 101626 : True Duplicate : Same Invoice No. and Invoice Amount.')
  })

  it('assembles the format for a Potential-Duplicate rule', () => {
    const def = ruleDef('rule-1', {
      analysis: 'Potential Duplicate',
      commentReason: 'Same Tracking No., Service, and Charge; Different Invoice No., Lane, Ship Date, and Invoice Amount.',
    })
    const groups = [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Maria Dela Alba', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe(
      'MDA: 101626 : Potential Duplicate : Same Tracking No., Service, and Charge; Different Invoice No., Lane, Ship Date, and Invoice Amount.'
    )
  })

  it('produces an empty map entirely when the reviewer name is blank', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice No.' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], '', OCT_16_2026)
    expect(result.size).toBe(0)
  })

  it('produces an empty map when the reviewer name is whitespace-only', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice No.' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], '   ', OCT_16_2026)
    expect(result.size).toBe(0)
  })

  it('contributes no entry for a rule with no commentReason configured', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('rule-1')).toBe(false)
  })

  it('contributes no entry for a rule whose Analysis matches neither type', () => {
    const def = ruleDef('rule-1', { analysis: 'Some custom rule', commentReason: 'Same Invoice No.' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('rule-1')).toBe(false)
  })

  it('contributes no entry for a rule with no metadata at all', () => {
    const def = ruleDef('rule-1', undefined)
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('rule-1')).toBe(false)
  })

  it('skips UNIQUE groups entirely, even under a fully configured rule', () => {
    const def = ruleDef('rule-1', { analysis: 'Potential Duplicate', commentReason: 'Same Invoice No.' })
    const groups = [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE'), groupFrom('DUP-2', 'UNIQUE')]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    const forRule = result.get('rule-1')
    expect(forRule?.has('DUP-1')).toBe(true)
    expect(forRule?.has('DUP-2')).toBe(false)
    expect(forRule?.size).toBe(1)
  })

  it('keeps every rule in a multi-rule run independent, each with its own reason text', () => {
    const trueDef = ruleDef('rule-true', { analysis: 'True Duplicate for denial', commentReason: 'True reason.' })
    const potentialDef = ruleDef('rule-potential', { analysis: 'Potential Duplicate', commentReason: 'Potential reason.' })
    const unconfiguredDef = ruleDef('rule-plain', { analysis: 'True Duplicate for denial' })
    const outcomes = [
      outcomeFrom('rule-true', [groupFrom('DUP-1', 'DUPLICATE')]),
      outcomeFrom('rule-potential', [groupFrom('DUP-2', 'POTENTIAL_DUPLICATE')]),
      outcomeFrom('rule-plain', [groupFrom('DUP-3', 'DUPLICATE')]),
    ]
    const result = buildAutoComments(outcomes, [trueDef, potentialDef, unconfiguredDef], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-true')?.get('DUP-1')).toBe('JDC: 101626 : True Duplicate : True reason.')
    expect(result.get('rule-potential')?.get('DUP-2')).toBe('JDC: 101626 : Potential Duplicate : Potential reason.')
    expect(result.has('rule-plain')).toBe(false)
    expect(result.size).toBe(2)
  })

  it('returns an empty map for no results at all', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice No.' })
    const result = buildAutoComments([], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.size).toBe(0)
  })

  it("uses the group's own dispositionOverride reason, under the fixed \"Not Duplicate\" type label, instead of the rule's configured reason", () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice No. and Invoice Amount.' })
    const groups = [
      groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', {
        disposition: 'Continue Processing',
        reason: 'Different Account No., Carrier, and/or Invoice Amount.',
      }),
    ]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe(
      'JDC: 101626 : Not Duplicate : Different Account No., Carrier, and/or Invoice Amount.'
    )
  })

  it('still produces an override comment even for a rule with no commentReason/Analysis configured at all', () => {
    const def = ruleDef('rule-1', undefined)
    const groups = [groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', { disposition: 'Continue Processing', reason: 'x' })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JDC: 101626 : Not Duplicate : x')
  })

  it('contributes no entry when the outcome references a rule definition that no longer exists', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const result = buildAutoComments([outcomeFrom('missing-rule', groups)], [], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('missing-rule')).toBe(false)
  })
})
