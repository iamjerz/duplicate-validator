export type DuplicateTypeClassification = 'true-duplicate' | 'potential-duplicate' | null

/**
 * Classifies a rule's own "Analysis" label (free text from its rule file,
 * e.g. "Potential Duplicate" or "True Duplicate for denial") as a
 * True-Duplicate rule, a Potential-Duplicate rule, or neither. Shared by
 * AutoDisposition and AutoComment so both features agree on exactly which
 * rules count as which type - a change here affects both consistently
 * instead of each maintaining its own copy of this matching logic.
 *
 * Matching is case-insensitive substring matching, not exact-equality,
 * because real rule files append extra words to the base phrase (this
 * project's own "True Duplicate for denial" rules are the reason why) - so
 * the comparison keys on whether the phrase "potential duplicate" or "true
 * duplicate" appears anywhere in the Analysis text, not the text as a whole.
 * "true duplicate" is checked first so a (hypothetical) Analysis string that
 * somehow contained both phrases would resolve to the stronger finding.
 *
 * A rule with no Analysis at all, or an Analysis that matches neither
 * phrase, returns null.
 */
export function classifyDuplicateType(analysis: string | undefined): DuplicateTypeClassification {
  const normalized = analysis?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('true duplicate')) return 'true-duplicate'
  if (normalized.includes('potential duplicate')) return 'potential-duplicate'
  return null
}

/** The short, human-facing label for each resolved classification - shared by AutoComment and the Results table's Status column so neither can drift out of sync with the other's wording. */
export const DUPLICATE_TYPE_LABELS: Record<'true-duplicate' | 'potential-duplicate', string> = {
  'true-duplicate': 'True Duplicate',
  'potential-duplicate': 'Potential Duplicate',
}

/**
 * The label to show for a rule's duplicate type in places like the Results
 * table's Status column: "True Duplicate" or "Potential Duplicate" when the
 * rule's own Analysis text resolves via classifyDuplicateType, or
 * `fallbackName` (typically the rule's own uploaded file name) when it
 * doesn't - a rule with an unrecognized or missing Analysis still gets a
 * real, readable label instead of nothing. This mirrors how AutoComment's
 * Type segment and the Results page's tab title already fall back when
 * Analysis doesn't name a recognized type.
 */
export function resolveDuplicateTypeLabel(analysis: string | undefined, fallbackName: string): string {
  const classification = classifyDuplicateType(analysis)
  return classification ? DUPLICATE_TYPE_LABELS[classification] : fallbackName
}
