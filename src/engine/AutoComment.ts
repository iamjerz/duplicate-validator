import type { RuleDefinition, RuleValidationOutcome } from '@/types'
import { classifyDuplicateType } from './DuplicateTypeClassification'

const TYPE_LABELS = {
  'true-duplicate': 'True Duplicate',
  'potential-duplicate': 'Potential Duplicate',
} as const

/**
 * Turns a reviewer's full name into initials for the auto-filled comment
 * prefix - e.g. "Juan Dela Cruz" -> "JDC". Splits on whitespace only (a
 * hyphenated or apostrophed name segment like "Mary-Jane" or "O'Brien"
 * contributes a single initial), takes the first character of each
 * non-empty segment, and uppercases it. A blank or whitespace-only name
 * returns an empty string - the signal buildAutoComments uses to skip
 * auto-filling entirely until a reviewer name is set.
 */
export function deriveInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}

/** Formats a date as MMDDYY with no separators - e.g. October 16, 2026 -> "101626". Uses local date components, matching "today" from the reviewer's own browser. */
export function formatMMDDYY(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  return `${mm}${dd}${yy}`
}

/**
 * Builds the comments Map a fresh validation run should start from - one
 * auto-filled comment per flagged group, keyed the same way
 * ValidationSessionContext's `comments` state already is:
 * Map<ruleDefinitionId, Map<groupId, string>>.
 *
 * Each comment follows the client's own established format (seen throughout
 * their real audit history): `${initials}: ${MMDDYY} : ${Type} : ${reason}`
 * - e.g. "JDC: 101626 : True Duplicate : Same Invoice No., Client Code,
 * Carrier Code, and Invoice Amount." Note the asymmetric spacing: no space
 * before the first colon (initials), a space-colon-space between every
 * other segment.
 *
 * A group only gets an entry when ALL of these hold:
 *  - a non-blank reviewer name is set (deriveInitials(reviewerName) is
 *    non-empty) - with no name, there are no initials to put in the comment,
 *    so nothing is auto-filled at all, for any rule;
 *  - the rule's own Analysis resolves to a known type via
 *    classifyDuplicateType (a rule with no recognized Analysis contributes
 *    no entries, same as if this function were never called for it);
 *  - the rule's metadata carries a non-blank commentReason (see
 *    RuleFileMetadata) - a rule with fields but no configured reason text
 *    also contributes no entries;
 *  - the group's status is not 'UNIQUE' - matching buildAutoDispositions'
 *    own "flagged groups only" rule, a UNIQUE "group" is a single, unflagged
 *    record with nothing to comment on.
 *
 * This is a *default* only: it runs once, when results are first set, and
 * every value it writes can still be freely overwritten afterward through
 * the normal setComment path - nothing here distinguishes an auto-filled
 * comment from a manually-typed one once it's in the map.
 */
export function buildAutoComments(
  results: RuleValidationOutcome[],
  ruleDefinitions: RuleDefinition[],
  reviewerName: string,
  now: Date
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()

  const initials = deriveInitials(reviewerName)
  if (!initials) return out

  const datePart = formatMMDDYY(now)

  for (const outcome of results) {
    const definition = ruleDefinitions.find((d) => d.id === outcome.ruleDefinitionId)
    const reason = definition?.metadata?.commentReason?.trim()
    if (!reason) continue

    const classification = classifyDuplicateType(definition?.metadata?.analysis)
    if (classification === null) continue
    const typeLabel = TYPE_LABELS[classification]

    const comment = `${initials}: ${datePart} : ${typeLabel} : ${reason}`

    const forRule = new Map<string, string>()
    for (const group of outcome.result.groups) {
      if (group.status === 'UNIQUE') continue
      forRule.set(group.id, comment)
    }
    if (forRule.size > 0) out.set(outcome.ruleDefinitionId, forRule)
  }

  return out
}
