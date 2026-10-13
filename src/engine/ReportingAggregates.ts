import type { Disposition, SessionHistoryEntry } from '@/types'

/** Every entry sharing a runId came from the same validation run (one entry per rule). An entry with no runId at all (saved before this field existed) is treated as its own single-entry run, keyed by its own id - so older history still counts toward run-level totals rather than crashing or needing a migration. */
function runKeyFor(entry: SessionHistoryEntry): string {
  return entry.runId ?? entry.id
}

/**
 * One entry per distinct run, in the order each run first appears. History
 * is stored newest-first, so this is also newest-first. Use this whenever a
 * stat is a property of the RUN rather than of one rule's pass over it (the
 * clearest example: `kpis.totalRecords` is identical across every rule in a
 * multi-rule run, since they all scored the same uploaded file - summing it
 * per entry instead of per run would multiply a run's own record count by
 * however many rules it had).
 */
export function oneEntryPerRun(entries: SessionHistoryEntry[]): SessionHistoryEntry[] {
  const seen = new Set<string>()
  const result: SessionHistoryEntry[] = []
  for (const entry of entries) {
    const key = runKeyFor(entry)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }
  return result
}

/** How many distinct validation runs this history covers (a multi-rule run still counts once, not once per rule). */
export function totalRuns(entries: SessionHistoryEntry[]): number {
  return oneEntryPerRun(entries).length
}

/** Total records validated across every distinct run (never summed per rule-entry - see oneEntryPerRun). */
export function totalRecordsProcessed(entries: SessionHistoryEntry[]): number {
  return oneEntryPerRun(entries).reduce((sum, entry) => sum + entry.kpis.totalRecords, 0)
}

/**
 * The "automation rate": what share of records, pooled across every
 * rule-pass ever run, the engine classified Unique with nothing to flag at
 * all. Deliberately NOT deduplicated by run - each rule's own pass over a
 * shared file is its own independent measurement of how much that rule
 * resolved on its own, and a run with three rules genuinely produced three
 * such measurements. Returns null with no qualifying data, rather than a
 * misleading 0%.
 */
export function pooledAutomationRate(entries: SessionHistoryEntry[]): number | null {
  const totalRecords = entries.reduce((sum, e) => sum + e.kpis.totalRecords, 0)
  if (totalRecords === 0) return null
  const uniqueRecords = entries.reduce((sum, e) => sum + e.kpis.uniqueRecords, 0)
  return (uniqueRecords / totalRecords) * 100
}

export interface RatePoint {
  id: string
  ranAt: string
  /** The rule's own Analysis text when known, else the file name - whichever this rule-pass is best identified by. */
  label: string
  rate: number
}

/** One point per rule-pass with at least one record, oldest first (history itself is stored newest-first), for an automation-rate trend chart. */
export function automationRateTrend(entries: SessionHistoryEntry[]): RatePoint[] {
  return entries
    .filter((e) => e.kpis.totalRecords > 0)
    .slice()
    .reverse()
    .map((e) => ({
      id: e.id,
      ranAt: e.ranAt,
      label: e.analysis ?? e.fileName,
      rate: (e.kpis.uniqueRecords / e.kpis.totalRecords) * 100,
    }))
}

type EntryWithReviewActivity = SessionHistoryEntry & { reviewActivity: NonNullable<SessionHistoryEntry['reviewActivity']> }

/** Entries with review activity recorded AND at least one flagged group - everything else (nothing was ever flagged, or this entry predates the feature) is excluded rather than counted as 0% reviewed. */
function withReviewActivity(entries: SessionHistoryEntry[]): EntryWithReviewActivity[] {
  return entries.filter((e): e is EntryWithReviewActivity => Boolean(e.reviewActivity) && e.reviewActivity!.totalFlaggedGroups > 0)
}

/** The "review completion rate": of every group ever flagged (pooled across qualifying rule-passes), what share has a reviewer actually recorded a Disposition and/or Comment for. Returns null when there's no qualifying data yet. */
export function pooledReviewCompletionRate(entries: SessionHistoryEntry[]): number | null {
  const qualifying = withReviewActivity(entries)
  if (qualifying.length === 0) return null
  const totalFlagged = qualifying.reduce((sum, e) => sum + e.reviewActivity.totalFlaggedGroups, 0)
  if (totalFlagged === 0) return null
  const reviewed = qualifying.reduce((sum, e) => sum + e.reviewActivity.reviewedGroups, 0)
  return (reviewed / totalFlagged) * 100
}

/** One point per qualifying rule-pass, oldest first, for a review-completion trend chart. */
export function reviewCompletionTrend(entries: SessionHistoryEntry[]): RatePoint[] {
  return withReviewActivity(entries)
    .slice()
    .reverse()
    .map((e) => ({
      id: e.id,
      ranAt: e.ranAt,
      label: e.analysis ?? e.fileName,
      rate: (e.reviewActivity.reviewedGroups / e.reviewActivity.totalFlaggedGroups) * 100,
    }))
}

/** Pooled Disposition-type counts across every entry with review activity recorded. */
export function dispositionTotals(entries: SessionHistoryEntry[]): Partial<Record<Disposition, number>> {
  const totals: Partial<Record<Disposition, number>> = {}
  for (const entry of withReviewActivity(entries)) {
    for (const [disposition, count] of Object.entries(entry.reviewActivity.dispositionCounts) as [Disposition, number][]) {
      totals[disposition] = (totals[disposition] ?? 0) + count
    }
  }
  return totals
}

export interface RuleBreakdownRow {
  label: string
  runs: number
  avgDuplicateRate: number
}

/**
 * Breaks history down by rule (grouped by its Analysis text when known,
 * else its file name) - how many times each rule has been run and its
 * average duplicate rate across those runs, sorted by most-run first. Every
 * entry counts here, not deduplicated by run, since this is specifically a
 * per-rule view rather than a per-dataset one.
 */
export function ruleBreakdown(entries: SessionHistoryEntry[]): RuleBreakdownRow[] {
  const byLabel = new Map<string, SessionHistoryEntry[]>()
  for (const entry of entries) {
    const label = entry.analysis ?? entry.fileName
    const list = byLabel.get(label)
    if (list) {
      list.push(entry)
    } else {
      byLabel.set(label, [entry])
    }
  }

  return [...byLabel.entries()]
    .map(([label, list]) => ({
      label,
      runs: list.length,
      avgDuplicateRate: list.reduce((sum, e) => sum + e.kpis.duplicateRate, 0) / list.length,
    }))
    .sort((a, b) => b.runs - a.runs)
}
