import type { DuplicateGroup, RuleDefinition, RuleValidationOutcome } from '@/types'
import { classifyDuplicateType, DUPLICATE_TYPE_LABELS } from './DuplicateTypeClassification'

const OVERRIDE_TYPE_LABEL = 'Not Duplicate'

/**
 * Formats a list of field names into one English clause, Oxford-comma style
 * - "A" / "A and B" / "A, B, and C" - matching how this app's other
 * human-readable field lists already read (see ExplanationGenerator). Empty
 * input returns an empty string.
 */
export function formatFieldList(fields: string[]): string {
  if (fields.length === 0) return ''
  if (fields.length === 1) return fields[0]
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`
  return `${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]}`
}

/**
 * Builds the Reason clause for one specific group from its own already-
 * evaluated fields - group.matchedSameFields and group.differentUniqueFields,
 * the exact same per-pair evidence DuplicateClassifier/ExplanationGenerator
 * already compute (not re-derived here). Two groups flagged by the very same
 * rule can read differently, because the sentence describes what actually
 * matched/differed for THAT pair rather than a canned, rule-wide line:
 *  - every compared field agrees: "Same A, B, and C."
 *  - some UNIQUE field(s) genuinely disagree: "Same A and B; C and D differ."
 *    (singular "differs" for exactly one field)
 * Returns null only when a group has no matched SAME field to report at all
 * - practically unreachable, since forming a group at all requires agreeing
 * on at least one SAME field, but guarded rather than emitting a malformed
 * "Same ." sentence.
 */
export function buildFieldBasedReason(group: DuplicateGroup): string | null {
  const sameList = formatFieldList(group.matchedSameFields)
  const diffList = formatFieldList(group.differentUniqueFields)
  if (!sameList && !diffList) return null
  const differVerb = group.differentUniqueFields.length === 1 ? 'differs' : 'differ'
  if (!diffList) return `Same ${sameList}.`
  if (!sameList) return `${diffList} ${differVerb}.`
  return `Same ${sameList}; ${diffList} ${differVerb}.`
}

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
 * - e.g. "JDC: 101626 : True Duplicate : Same Invoice No., Client Code, and
 * Carrier Code." Note the asymmetric spacing: no space before the first
 * colon (initials), a space-colon-space between every other segment.
 *
 * A group only gets an entry when a non-blank reviewer name is set
 * (deriveInitials(reviewerName) is non-empty - with no name, there are no
 * initials to put in the comment, so nothing is auto-filled at all, for any
 * rule) and its status is not 'UNIQUE' (matching buildAutoDispositions' own
 * "flagged groups only" rule - a UNIQUE "group" is a single, unflagged
 * record with nothing to comment on), AND one of these resolves a type/reason
 * pair for it:
 *  - the group's own `dispositionOverride` (see DispositionOverride.ts) -
 *    takes priority when present, using the fixed type label "Not
 *    Duplicate" and the override's own reason text instead of anything
 *    configured on the rule or computed below;
 *  - otherwise, the rule's Analysis resolves to a known type via
 *    classifyDuplicateType AND the rule's metadata carries a non-blank
 *    commentReason (see RuleFileMetadata) - a rule missing either one
 *    contributes no entry for a group with no override. commentReason itself
 *    is only a per-rule on/off switch here, not the text that gets used (see
 *    below) - a rule author sets any non-blank reason to opt that rule into
 *    auto-commenting at all.
 *
 * The Reason text itself is NOT the rule's static configured commentReason -
 * it's built fresh per group by buildFieldBasedReason, from that specific
 * group's own matched/differing fields. Two groups flagged by the same rule
 * can therefore read differently (e.g. one says "Same Invoice No. and
 * Client Code." because every compared field happened to agree, while
 * another under the identical rule says "Same Invoice No. and Client Code;
 * Invoice Amount differs." because it didn't) - this is deliberately more
 * specific than a single canned sentence per rule, since it's grounded in
 * this exact pair's evaluated values rather than a general description of
 * what the rule looks for.
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
    const hasReasonConfigured = !!definition?.metadata?.commentReason?.trim()
    const classification = classifyDuplicateType(definition?.metadata?.analysis)
    const ruleTypeLabel = classification ? DUPLICATE_TYPE_LABELS[classification] : null
    const ruleEnabled = ruleTypeLabel !== null && hasReasonConfigured

    const forRule = new Map<string, string>()
    for (const group of outcome.result.groups) {
      if (group.status === 'UNIQUE') continue

      let comment: string | null = null
      if (group.dispositionOverride) {
        comment = `${initials}: ${datePart} : ${OVERRIDE_TYPE_LABEL} : ${group.dispositionOverride.reason}`
      } else if (ruleEnabled) {
        const reason = buildFieldBasedReason(group)
        comment = reason ? `${initials}: ${datePart} : ${ruleTypeLabel} : ${reason}` : null
      }

      if (!comment) continue
      forRule.set(group.id, comment)
    }
    if (forRule.size > 0) out.set(outcome.ruleDefinitionId, forRule)
  }

  return out
}
