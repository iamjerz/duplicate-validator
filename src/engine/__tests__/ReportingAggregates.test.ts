import { describe, it, expect } from 'vitest'
import {
  oneEntryPerRun,
  totalRuns,
  totalRecordsProcessed,
  pooledAutomationRate,
  automationRateTrend,
  pooledReviewCompletionRate,
  reviewCompletionTrend,
  dispositionTotals,
  ruleBreakdown,
} from '../ReportingAggregates'
import type { Disposition, KPISummary, ReviewActivity, SessionHistoryEntry } from '@/types'

function kpis(overrides: Partial<KPISummary> = {}): KPISummary {
  return {
    totalRecords: 100,
    duplicateRecords: 10,
    potentialDuplicateRecords: 5,
    uniqueRecords: 85,
    validationErrorRecords: 0,
    duplicateGroups: 5,
    potentialDuplicateGroups: 2,
    duplicateRate: 15,
    ...overrides,
  }
}

function entry(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    id: 'id-1',
    fileName: 'invoices.xlsx',
    ranAt: '2026-01-01T00:00:00.000Z',
    kpis: kpis(),
    ...overrides,
  }
}

function reviewActivity(overrides: Partial<ReviewActivity> = {}): ReviewActivity {
  return { totalFlaggedGroups: 7, reviewedGroups: 7, dispositionCounts: {}, ...overrides }
}

describe('oneEntryPerRun', () => {
  it('collapses multiple entries sharing a runId into one', () => {
    const entries = [
      entry({ id: 'a', runId: 'run-1' }),
      entry({ id: 'b', runId: 'run-1' }),
      entry({ id: 'c', runId: 'run-2' }),
    ]
    expect(oneEntryPerRun(entries).map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('treats an entry with no runId as its own single-entry run, keyed by its own id', () => {
    const entries = [entry({ id: 'legacy-1' }), entry({ id: 'legacy-2' })]
    expect(oneEntryPerRun(entries)).toHaveLength(2)
  })
})

describe('totalRuns / totalRecordsProcessed', () => {
  it('counts a 3-rule run as one run, not three, and sums records once per run', () => {
    const entries = [
      entry({ id: 'a', runId: 'run-1', kpis: kpis({ totalRecords: 500 }) }),
      entry({ id: 'b', runId: 'run-1', kpis: kpis({ totalRecords: 500 }) }),
      entry({ id: 'c', runId: 'run-1', kpis: kpis({ totalRecords: 500 }) }),
      entry({ id: 'd', runId: 'run-2', kpis: kpis({ totalRecords: 200 }) }),
    ]
    expect(totalRuns(entries)).toBe(2)
    expect(totalRecordsProcessed(entries)).toBe(700) // 500 once for run-1, not x3, plus 200 for run-2
  })

  it('is 0 for no history', () => {
    expect(totalRuns([])).toBe(0)
    expect(totalRecordsProcessed([])).toBe(0)
  })
})

describe('pooledAutomationRate', () => {
  it('pools unique/total across every entry, NOT deduplicated by run (each rule pass is its own measurement)', () => {
    const entries = [
      entry({ id: 'a', runId: 'run-1', kpis: kpis({ totalRecords: 100, uniqueRecords: 80 }) }),
      entry({ id: 'b', runId: 'run-1', kpis: kpis({ totalRecords: 100, uniqueRecords: 60 }) }),
    ]
    // pooled: (80+60) / (100+100) = 70%
    expect(pooledAutomationRate(entries)).toBe(70)
  })

  it('is null when there is no history at all', () => {
    expect(pooledAutomationRate([])).toBeNull()
  })

  it('is null rather than dividing by zero when every entry has zero records', () => {
    expect(pooledAutomationRate([entry({ kpis: kpis({ totalRecords: 0, uniqueRecords: 0 }) })])).toBeNull()
  })
})

describe('automationRateTrend', () => {
  it('reverses newest-first history into oldest-first trend points, skipping zero-record entries', () => {
    const entries = [
      entry({ id: 'newest', ranAt: '2026-03-01T00:00:00.000Z', kpis: kpis({ totalRecords: 100, uniqueRecords: 90 }) }),
      entry({ id: 'zero-records', ranAt: '2026-02-01T00:00:00.000Z', kpis: kpis({ totalRecords: 0, uniqueRecords: 0 }) }),
      entry({ id: 'oldest', ranAt: '2026-01-01T00:00:00.000Z', kpis: kpis({ totalRecords: 100, uniqueRecords: 50 }) }),
    ]
    const trend = automationRateTrend(entries)
    expect(trend.map((p) => p.id)).toEqual(['oldest', 'newest'])
    expect(trend[0].rate).toBe(50)
    expect(trend[1].rate).toBe(90)
  })

  it('labels a point by Analysis when known, else file name', () => {
    const withAnalysis = entry({ analysis: 'True Duplicate for denial' })
    const withoutAnalysis = entry({ fileName: 'march.xlsx' })
    expect(automationRateTrend([withAnalysis])[0].label).toBe('True Duplicate for denial')
    expect(automationRateTrend([withoutAnalysis])[0].label).toBe('march.xlsx')
  })
})

describe('pooledReviewCompletionRate / reviewCompletionTrend', () => {
  it('pools reviewed/flagged only across entries that have review activity with at least one flagged group', () => {
    const entries = [
      entry({ id: 'a', reviewActivity: reviewActivity({ totalFlaggedGroups: 10, reviewedGroups: 4 }) }),
      entry({ id: 'b', reviewActivity: reviewActivity({ totalFlaggedGroups: 10, reviewedGroups: 10 }) }),
      entry({ id: 'c' }), // no reviewActivity at all - excluded
      entry({ id: 'd', reviewActivity: reviewActivity({ totalFlaggedGroups: 0, reviewedGroups: 0 }) }), // nothing flagged - excluded
    ]
    // pooled: (4+10) / (10+10) = 70%
    expect(pooledReviewCompletionRate(entries)).toBe(70)
    expect(reviewCompletionTrend(entries)).toHaveLength(2)
  })

  it('is null when nothing in history has review activity yet', () => {
    expect(pooledReviewCompletionRate([entry(), entry()])).toBeNull()
    expect(reviewCompletionTrend([entry(), entry()])).toEqual([])
  })
})

describe('dispositionTotals', () => {
  it('sums dispositionCounts across every entry with review activity', () => {
    const entries = [
      entry({ reviewActivity: reviewActivity({ dispositionCounts: { 'Reject Invoice': 2, 'Carrier Review': 1 } }) }),
      entry({ reviewActivity: reviewActivity({ dispositionCounts: { 'Reject Invoice': 3 } }) }),
      entry(), // no review activity - contributes nothing
    ]
    const totals = dispositionTotals(entries) as Record<Disposition, number>
    expect(totals['Reject Invoice']).toBe(5)
    expect(totals['Carrier Review']).toBe(1)
  })

  it('is an empty object for no qualifying history', () => {
    expect(dispositionTotals([])).toEqual({})
  })
})

describe('ruleBreakdown', () => {
  it('groups by Analysis text when known, else file name, counting runs and averaging duplicate rate', () => {
    const entries = [
      entry({ analysis: 'True Duplicate', kpis: kpis({ duplicateRate: 10 }) }),
      entry({ analysis: 'True Duplicate', kpis: kpis({ duplicateRate: 20 }) }),
      entry({ fileName: 'other-rule.json', kpis: kpis({ duplicateRate: 5 }) }),
    ]
    const breakdown = ruleBreakdown(entries)
    const trueDup = breakdown.find((r) => r.label === 'True Duplicate')
    expect(trueDup).toEqual({ label: 'True Duplicate', runs: 2, avgDuplicateRate: 15 })
    expect(breakdown.find((r) => r.label === 'other-rule.json')?.runs).toBe(1)
  })

  it('sorts by most-run first', () => {
    const entries = [
      entry({ analysis: 'Rare Rule' }),
      entry({ analysis: 'Common Rule' }),
      entry({ analysis: 'Common Rule' }),
      entry({ analysis: 'Common Rule' }),
    ]
    expect(ruleBreakdown(entries)[0].label).toBe('Common Rule')
  })

  it('is empty for no history', () => {
    expect(ruleBreakdown([])).toEqual([])
  })
})
