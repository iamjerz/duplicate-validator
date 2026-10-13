import type { Disposition } from './disposition'
import type { KPISummary } from './validation'

/**
 * How much of one rule's flagged duplicate groups actually got a reviewer's
 * attention, as of the last time it was recomputed (see
 * ValidationSessionContext/Results.tsx, which keep this live while a run's
 * results are still on screen). Only counts are kept here - never the
 * Comment text itself - consistent with how little else this app persists
 * long-term (see useSessionHistory).
 */
export interface ReviewActivity {
  /** duplicateGroups + potentialDuplicateGroups for this run - the universe of groups a reviewer could act on at all (a UNIQUE group was never flagged, so it's not part of this). */
  totalFlaggedGroups: number
  /** Distinct groups with a Disposition and/or a non-blank Comment recorded, out of totalFlaggedGroups. */
  reviewedGroups: number
  /** How many groups received each Disposition value - a comment-only group (no Disposition set) isn't counted in here, only in reviewedGroups. */
  dispositionCounts: Partial<Record<Disposition, number>>
}

/** Current-session-only history, stored as lightweight metadata in localStorage - never the original Excel data or full validation results. See useSessionHistory. */
export interface SessionHistoryEntry {
  id: string
  /**
   * Shared by every rule-outcome entry produced by the same validation run,
   * so run-level stats (total runs, total records processed) can be counted
   * once per run rather than once per rule - summing `kpis.totalRecords`
   * across every entry would multiply a multi-rule run's record count by
   * however many rules it had. Optional only because entries saved before
   * this field existed won't have one (see ReportingAggregates.oneEntryPerRun
   * for how those are still counted safely).
   */
  runId?: string
  fileName: string
  ranAt: string
  kpis: KPISummary
  /** Which uploaded rule produced this entry, when known (its Analysis text, e.g. "True Duplicate for denial"). */
  analysis?: string
  /**
   * Kept in sync live while this run's results are still on screen in
   * Results (see ValidationSessionContext.historyEntryIdByRule /
   * Results.tsx). Undefined for a run with nothing flagged to review, one
   * not yet reviewed, or one saved before this field existed - the
   * Reporting page excludes those from the review-completion metric rather
   * than treating a missing value as 0%.
   */
  reviewActivity?: ReviewActivity
}
