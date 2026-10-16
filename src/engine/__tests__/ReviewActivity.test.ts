import { describe, it, expect } from 'vitest'
import { computeReviewActivity } from '../ReviewActivity'
import type { Disposition, DuplicateGroup } from '@/types'

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
    dispositionOverride: null,
    explanation: { lines: [], classification: status, summary: '' },
  }
}

describe('computeReviewActivity', () => {
  it('counts only DUPLICATE/POTENTIAL_DUPLICATE groups as flagged - UNIQUE is excluded entirely', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE'), groupFrom('DUP-2', 'POTENTIAL_DUPLICATE'), groupFrom('DUP-3', 'UNIQUE')]
    const result = computeReviewActivity(groups, new Map(), new Map())
    expect(result.totalFlaggedGroups).toBe(2)
    expect(result.reviewedGroups).toBe(0)
  })

  it('counts a group with a recorded Disposition as reviewed', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE'), groupFrom('DUP-2', 'DUPLICATE')]
    const dispositions = new Map<string, Disposition>([['DUP-1', 'Reject Invoice']])
    const result = computeReviewActivity(groups, dispositions, new Map())
    expect(result.reviewedGroups).toBe(1)
    expect(result.totalFlaggedGroups).toBe(2)
  })

  it('counts a group with only a non-blank Comment (no Disposition) as reviewed too', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const comments = new Map([['DUP-1', 'Confirmed with carrier.']])
    const result = computeReviewActivity(groups, new Map(), comments)
    expect(result.reviewedGroups).toBe(1)
    expect(result.dispositionCounts).toEqual({})
  })

  it('does not count a whitespace-only comment as reviewed', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const comments = new Map([['DUP-1', '   ']])
    const result = computeReviewActivity(groups, new Map(), comments)
    expect(result.reviewedGroups).toBe(0)
  })

  it('does not double-count a group with both a Disposition and a Comment', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const dispositions = new Map<string, Disposition>([['DUP-1', 'Carrier Review']])
    const comments = new Map([['DUP-1', 'See attached.']])
    const result = computeReviewActivity(groups, dispositions, comments)
    expect(result.reviewedGroups).toBe(1)
  })

  it('tallies dispositionCounts by value across multiple groups', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE'), groupFrom('DUP-2', 'DUPLICATE'), groupFrom('DUP-3', 'POTENTIAL_DUPLICATE')]
    const dispositions = new Map<string, Disposition>([
      ['DUP-1', 'Reject Invoice'],
      ['DUP-2', 'Reject Invoice'],
      ['DUP-3', 'Carrier Review'],
    ])
    const result = computeReviewActivity(groups, dispositions, new Map())
    expect(result.dispositionCounts).toEqual({ 'Reject Invoice': 2, 'Carrier Review': 1 })
  })

  it('a comment-only group is reviewed but contributes nothing to dispositionCounts', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const comments = new Map([['DUP-1', 'Looked into it.']])
    const result = computeReviewActivity(groups, new Map(), comments)
    expect(result.reviewedGroups).toBe(1)
    expect(Object.keys(result.dispositionCounts)).toHaveLength(0)
  })

  it('returns all zeros / empty for no groups at all', () => {
    const result = computeReviewActivity([], new Map(), new Map())
    expect(result).toEqual({ totalFlaggedGroups: 0, reviewedGroups: 0, dispositionCounts: {} })
  })

  it('a dispositions/comments map keyed by an unrelated group id has no effect', () => {
    const groups = [groupFrom('DUP-1', 'DUPLICATE')]
    const dispositions = new Map<string, Disposition>([['DUP-OTHER', 'Reject Invoice']])
    const result = computeReviewActivity(groups, dispositions, new Map())
    expect(result.reviewedGroups).toBe(0)
  })
})
