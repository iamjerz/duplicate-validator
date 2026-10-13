import type { Disposition, DuplicateGroup, ReviewActivity } from '@/types'

/**
 * Summarizes how much reviewer attention one rule's flagged groups have
 * received so far, from the live dispositions/comments maps for that one
 * rule. "Flagged" means DUPLICATE or POTENTIAL_DUPLICATE - a UNIQUE "group"
 * (always a single, unflagged record) was never something to review in the
 * first place, so it's excluded from the denominator entirely rather than
 * counted as untouched.
 *
 * A group counts as reviewed the moment it has a Disposition and/or a
 * non-blank Comment recorded - either action is a real human decision, not
 * just the tool's own classification. Only Disposition VALUES are counted
 * (dispositionCounts); comment text itself is never included here, by
 * design - see SessionHistoryEntry/ReviewActivity.
 */
export function computeReviewActivity(
  groups: DuplicateGroup[],
  dispositions: Map<string, Disposition>,
  comments: Map<string, string>
): ReviewActivity {
  const flagged = groups.filter((g) => g.status === 'DUPLICATE' || g.status === 'POTENTIAL_DUPLICATE')

  let reviewedGroups = 0
  const dispositionCounts: Partial<Record<Disposition, number>> = {}

  for (const group of flagged) {
    const disposition = dispositions.get(group.id)
    const comment = comments.get(group.id)
    const hasComment = Boolean(comment && comment.trim().length > 0)
    if (disposition || hasComment) reviewedGroups += 1
    if (disposition) dispositionCounts[disposition] = (dispositionCounts[disposition] ?? 0) + 1
  }

  return { totalFlaggedGroups: flagged.length, reviewedGroups, dispositionCounts }
}
