import { describe, it, expect } from 'vitest'
import { deriveInitials, formatMMDDYY, formatFieldList, buildFieldBasedReason, buildAutoComments, mergeAutoComments, refreshAutoComments } from '../AutoComment'
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
  options: {
    matchedSameFields?: string[]
    differentUniqueFields?: string[]
    dispositionOverride?: DuplicateGroup['dispositionOverride']
  } = {}
): DuplicateGroup {
  return {
    id,
    status,
    records: [],
    matchedSameFields: options.matchedSameFields ?? [],
    differentUniqueFields: options.differentUniqueFields ?? [],
    differentOptionalFields: [],
    ignoredFields: [],
    sameFieldValues: {},
    uniqueDifferences: [],
    optionalDifferences: [],
    dispositionOverride: options.dispositionOverride ?? null,
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

describe('formatFieldList', () => {
  it('returns an empty string for no fields', () => {
    expect(formatFieldList([])).toBe('')
  })

  it('returns the field name as-is for a single field', () => {
    expect(formatFieldList(['Invoice Number'])).toBe('Invoice Number')
  })

  it('joins two fields with "and", no comma', () => {
    expect(formatFieldList(['Invoice Number', 'Client Code'])).toBe('Invoice Number and Client Code')
  })

  it('joins three or more fields Oxford-comma style', () => {
    expect(formatFieldList(['Invoice Number', 'Client Code', 'Carrier Code'])).toBe('Invoice Number, Client Code, and Carrier Code')
    expect(formatFieldList(['A', 'B', 'C', 'D'])).toBe('A, B, C, and D')
  })
})

describe('buildFieldBasedReason', () => {
  it('reports only a Same clause when no UNIQUE field differs', () => {
    const group = groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number', 'Client Code'] })
    expect(buildFieldBasedReason(group)).toBe('Same Invoice Number and Client Code.')
  })

  it('appends a Differ clause, pluralized, when more than one UNIQUE field differs', () => {
    const group = groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', {
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: ['Carrier Code', 'Invoice Amount'],
    })
    expect(buildFieldBasedReason(group)).toBe('Same Invoice Number; Carrier Code and Invoice Amount differ.')
  })

  it('uses singular "differs" for exactly one differing field', () => {
    const group = groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', {
      matchedSameFields: ['Invoice Number'],
      differentUniqueFields: ['Invoice Amount'],
    })
    expect(buildFieldBasedReason(group)).toBe('Same Invoice Number; Invoice Amount differs.')
  })

  it('returns null when there are no matched SAME fields to report at all', () => {
    const group = groupFrom('DUP-1', 'DUPLICATE', {})
    expect(buildFieldBasedReason(group)).toBeNull()
  })
})

describe('buildAutoComments', () => {
  it('assembles the exact "Initials: MMDDYY : Type : Reason" format, with Reason built from the group\'s own matched fields', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'enabled' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number', 'Invoice Amount'] })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JDC: 101626 : True Duplicate : Same Invoice Number and Invoice Amount.')
  })

  it('assembles the format for a Potential-Duplicate rule, including the Differ clause', () => {
    const def = ruleDef('rule-1', { analysis: 'Potential Duplicate', commentReason: 'enabled' })
    const groups = [
      groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', {
        matchedSameFields: ['Tracking Number', 'Service', 'Charge'],
        differentUniqueFields: ['Invoice Number', 'Lane', 'Ship Date', 'Invoice Amount'],
      }),
    ]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Maria Dela Alba', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe(
      'MDA: 101626 : Potential Duplicate : Same Tracking Number, Service, and Charge; Invoice Number, Lane, Ship Date, and Invoice Amount differ.'
    )
  })

  it('gives two groups under the SAME rule different Reason text, reflecting each group\'s own fields', () => {
    const def = ruleDef('rule-1', { analysis: 'Potential Duplicate', commentReason: 'enabled' })
    const groups = [
      groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number', 'Client Code'] }),
      groupFrom('DUP-2', 'POTENTIAL_DUPLICATE', {
        matchedSameFields: ['Invoice Number', 'Client Code'],
        differentUniqueFields: ['Invoice Amount'],
      }),
    ]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JDC: 101626 : Potential Duplicate : Same Invoice Number and Client Code.')
    expect(result.get('rule-1')?.get('DUP-2')).toBe(
      'JDC: 101626 : Potential Duplicate : Same Invoice Number and Client Code; Invoice Amount differs.'
    )
  })

  it('produces an empty map entirely when the reviewer name is blank', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice Number' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], '', OCT_16_2026)
    expect(result.size).toBe(0)
  })

  it('produces an empty map when the reviewer name is whitespace-only', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice Number' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], '   ', OCT_16_2026)
    expect(result.size).toBe(0)
  })

  it('contributes no entry for a rule with no commentReason configured', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('rule-1')).toBe(false)
  })

  it('contributes no entry for a rule whose Analysis matches neither type', () => {
    const def = ruleDef('rule-1', { analysis: 'Some custom rule', commentReason: 'Same Invoice Number' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('rule-1')).toBe(false)
  })

  it('contributes no entry for a rule with no metadata at all', () => {
    const def = ruleDef('rule-1', undefined)
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('rule-1')).toBe(false)
  })

  it('skips UNIQUE groups entirely, even under a fully configured rule', () => {
    const def = ruleDef('rule-1', { analysis: 'Potential Duplicate', commentReason: 'enabled' })
    const groups = [
      groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', { matchedSameFields: ['Invoice Number'] }),
      groupFrom('DUP-2', 'UNIQUE', { matchedSameFields: ['Invoice Number'] }),
    ]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    const forRule = result.get('rule-1')
    expect(forRule?.has('DUP-1')).toBe(true)
    expect(forRule?.has('DUP-2')).toBe(false)
    expect(forRule?.size).toBe(1)
  })

  it('keeps every rule in a multi-rule run independent, each with its own reason text', () => {
    const trueDef = ruleDef('rule-true', { analysis: 'True Duplicate for denial', commentReason: 'enabled' })
    const potentialDef = ruleDef('rule-potential', { analysis: 'Potential Duplicate', commentReason: 'enabled' })
    const unconfiguredDef = ruleDef('rule-plain', { analysis: 'True Duplicate for denial' })
    const outcomes = [
      outcomeFrom('rule-true', [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]),
      outcomeFrom('rule-potential', [
        groupFrom('DUP-2', 'POTENTIAL_DUPLICATE', {
          matchedSameFields: ['Tracking Number'],
          differentUniqueFields: ['Invoice Number'],
        }),
      ]),
      outcomeFrom('rule-plain', [groupFrom('DUP-3', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]),
    ]
    const result = buildAutoComments(outcomes, [trueDef, potentialDef, unconfiguredDef], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-true')?.get('DUP-1')).toBe('JDC: 101626 : True Duplicate : Same Invoice Number.')
    expect(result.get('rule-potential')?.get('DUP-2')).toBe('JDC: 101626 : Potential Duplicate : Same Tracking Number; Invoice Number differs.')
    expect(result.has('rule-plain')).toBe(false)
    expect(result.size).toBe(2)
  })

  it('returns an empty map for no results at all', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'Same Invoice Number' })
    const result = buildAutoComments([], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.size).toBe(0)
  })

  it("uses the group's own dispositionOverride reason, under the fixed \"Not Duplicate\" type label, instead of a field-based reason", () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'enabled' })
    const groups = [
      groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', {
        matchedSameFields: ['Invoice Number'],
        dispositionOverride: {
          disposition: 'Continue Processing',
          reason: 'Different Account No., Carrier, and/or Invoice Amount.',
        },
      }),
    ]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe(
      'JDC: 101626 : Not Duplicate : Different Account No., Carrier, and/or Invoice Amount.'
    )
  })

  it('still produces an override comment even for a rule with no commentReason/Analysis configured at all', () => {
    const def = ruleDef('rule-1', undefined)
    const groups = [
      groupFrom('DUP-1', 'POTENTIAL_DUPLICATE', {
        dispositionOverride: { disposition: 'Continue Processing', reason: 'x' },
      }),
    ]
    const result = buildAutoComments([outcomeFrom('rule-1', groups)], [def], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JDC: 101626 : Not Duplicate : x')
  })

  it('contributes no entry when the outcome references a rule definition that no longer exists', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const result = buildAutoComments([outcomeFrom('missing-rule', groups)], [], 'Juan Dela Cruz', OCT_16_2026)
    expect(result.has('missing-rule')).toBe(false)
  })
})

describe('mergeAutoComments', () => {
  it('adds every entry from seeded when prev is empty', () => {
    const prev = new Map()
    const seeded = new Map([['rule-1', new Map([['DUP-1', 'comment A']])]])
    const result = mergeAutoComments(prev, seeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('comment A')
  })

  it('never overwrites an existing entry for a (rule, group) pair that already has one', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'typed by hand']])]])
    const seeded = new Map([['rule-1', new Map([['DUP-1', 'freshly auto-filled']])]])
    const result = mergeAutoComments(prev, seeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('typed by hand')
  })

  it('backfills a new group under a rule that already has other comments, leaving the existing one untouched', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'existing']])]])
    const seeded = new Map([
      ['rule-1', new Map([
        ['DUP-1', 'would-be overwrite'],
        ['DUP-2', 'new backfilled comment'],
      ])],
    ])
    const result = mergeAutoComments(prev, seeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('existing')
    expect(result.get('rule-1')?.get('DUP-2')).toBe('new backfilled comment')
  })

  it('leaves a rule entirely alone when seeded has nothing new for it', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'existing']])]])
    const seeded = new Map([['rule-1', new Map([['DUP-1', 'ignored']])]])
    const result = mergeAutoComments(prev, seeded)
    expect(result.get('rule-1')?.size).toBe(1)
  })

  it('leaves a rule present only in prev (not in seeded at all) completely untouched', () => {
    const prev = new Map([['rule-untouched', new Map([['DUP-9', 'keep me']])]])
    const seeded = new Map([['rule-1', new Map([['DUP-1', 'new']])]])
    const result = mergeAutoComments(prev, seeded)
    expect(result.get('rule-untouched')?.get('DUP-9')).toBe('keep me')
    expect(result.get('rule-1')?.get('DUP-1')).toBe('new')
  })

  it('returns the exact same reference as prev when nothing new was added', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'existing']])]])
    const seeded = new Map([['rule-1', new Map([['DUP-1', 'duplicate of existing']])]])
    const result = mergeAutoComments(prev, seeded)
    expect(result).toBe(prev)
  })

  it('returns prev unchanged when seeded is empty', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'existing']])]])
    const result = mergeAutoComments(prev, new Map())
    expect(result).toBe(prev)
  })
})

describe('refreshAutoComments', () => {
  it('backfills a missing entry exactly like mergeAutoComments, regardless of staleSeeded', () => {
    const prev = new Map()
    const staleSeeded = new Map()
    const freshSeeded = new Map([['rule-1', new Map([['DUP-1', 'comment A']])]])
    const result = refreshAutoComments(prev, staleSeeded, freshSeeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('comment A')
  })

  it('refreshes an entry that still exactly matches what the PREVIOUS name produced (the reviewer mid-typing their name)', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'J: 103026 : True Duplicate : Same Invoice Number.']])]])
    const staleSeeded = new Map([['rule-1', new Map([['DUP-1', 'J: 103026 : True Duplicate : Same Invoice Number.']])]])
    const freshSeeded = new Map([['rule-1', new Map([['DUP-1', 'JC: 103026 : True Duplicate : Same Invoice Number.']])]])
    const result = refreshAutoComments(prev, staleSeeded, freshSeeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JC: 103026 : True Duplicate : Same Invoice Number.')
  })

  it('reproduces the real keystroke-by-keystroke typing sequence ending at the full name\'s correct initials', () => {
    const def = ruleDef('rule-1', { analysis: 'True Duplicate for denial', commentReason: 'enabled' })
    const groups = [groupFrom('DUP-1', 'DUPLICATE', { matchedSameFields: ['Invoice Number'] })]
    const outcome = outcomeFrom('rule-1', groups)

    let comments = new Map<string, Map<string, string>>()
    let previousName = ''
    for (const typed of ['J', 'Je', 'Jer', 'Jerramy', 'Jerramy ', 'Jerramy C', 'Jerramy Calites']) {
      const freshSeeded = buildAutoComments([outcome], [def], typed, OCT_16_2026)
      const staleSeeded = buildAutoComments([outcome], [def], previousName, OCT_16_2026)
      comments = refreshAutoComments(comments, staleSeeded, freshSeeded)
      previousName = typed
    }

    expect(comments.get('rule-1')?.get('DUP-1')).toBe('JC: 101626 : True Duplicate : Same Invoice Number.')
  })

  it('never touches a comment that has been hand-edited since it was last auto-filled, even as the name keeps changing', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'JC: 103026 : True Duplicate : Confirmed with carrier, denying.']])]])
    const staleSeeded = new Map([['rule-1', new Map([['DUP-1', 'JC: 103026 : True Duplicate : Same Invoice Number.']])]])
    const freshSeeded = new Map([['rule-1', new Map([['DUP-1', 'PR: 103026 : True Duplicate : Same Invoice Number.']])]])
    const result = refreshAutoComments(prev, staleSeeded, freshSeeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JC: 103026 : True Duplicate : Confirmed with carrier, denying.')
  })

  it('backfills one group while leaving a sibling hand-edited group under the same rule untouched', () => {
    const prev = new Map([
      ['rule-1', new Map([['DUP-1', 'JC: 103026 : True Duplicate : hand-edited text']])],
    ])
    const staleSeeded = new Map([['rule-1', new Map([['DUP-1', 'J: 103026 : True Duplicate : Same Invoice Number.']])]])
    const freshSeeded = new Map([
      ['rule-1', new Map([
        ['DUP-1', 'JC: 103026 : True Duplicate : Same Invoice Number.'],
        ['DUP-2', 'JC: 103026 : True Duplicate : Same Invoice Number.'],
      ])],
    ])
    const result = refreshAutoComments(prev, staleSeeded, freshSeeded)
    expect(result.get('rule-1')?.get('DUP-1')).toBe('JC: 103026 : True Duplicate : hand-edited text')
    expect(result.get('rule-1')?.get('DUP-2')).toBe('JC: 103026 : True Duplicate : Same Invoice Number.')
  })

  it('returns the exact same reference as prev when every entry already matches freshSeeded', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'JC: 103026 : True Duplicate : Same Invoice Number.']])]])
    const staleSeeded = new Map([['rule-1', new Map([['DUP-1', 'J: 103026 : True Duplicate : Same Invoice Number.']])]])
    const freshSeeded = new Map([['rule-1', new Map([['DUP-1', 'JC: 103026 : True Duplicate : Same Invoice Number.']])]])
    const result = refreshAutoComments(prev, staleSeeded, freshSeeded)
    expect(result).toBe(prev)
  })

  it('returns prev unchanged when freshSeeded is empty', () => {
    const prev = new Map([['rule-1', new Map([['DUP-1', 'existing']])]])
    const result = refreshAutoComments(prev, new Map(), new Map())
    expect(result).toBe(prev)
  })
})
