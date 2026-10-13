import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { ReviewActivity, SessionHistoryEntry } from '@/types'

export type { SessionHistoryEntry, ReviewActivity }

const STORAGE_KEY = 'duplicate-validator:history'
// Entries are tiny (a handful of numbers and two short strings each), so a
// generous cap costs little storage while covering months of regular use -
// raised from an earlier cap of 20, which was too thin for the Reporting
// page's trend charts to show anything meaningful.
const MAX_ENTRIES = 1000

/**
 * Current-session-only history, stored as lightweight metadata (file name,
 * timestamp, KPI counts, and - once reviewed - counts of reviewer activity)
 * in localStorage - never the original Excel data, full validation results,
 * or reviewer Comment text. There is no database and no server involved.
 */
export function useSessionHistory() {
  const [history, setHistory] = useLocalStorage<SessionHistoryEntry[]>(STORAGE_KEY, [])

  const addEntry = useCallback(
    (entry: SessionHistoryEntry) => {
      setHistory((prev) => [entry, ...prev].slice(0, MAX_ENTRIES))
    },
    [setHistory]
  )

  /**
   * Merges reviewActivity into the matching entry by id - a silent no-op if
   * that entry has since aged out of the capped list. Called live, every
   * time dispositions/comments change for whichever run's results are
   * currently on screen (see Results.tsx), so the recorded figure is never
   * a one-time snapshot and never goes stale while you're still reviewing.
   */
  const updateReviewActivity = useCallback(
    (id: string, activity: ReviewActivity) => {
      setHistory((prev) => prev.map((entry) => (entry.id === id ? { ...entry, reviewActivity: activity } : entry)))
    },
    [setHistory]
  )

  const clearHistory = useCallback(() => setHistory([]), [setHistory])

  return { history, addEntry, updateReviewActivity, clearHistory }
}
