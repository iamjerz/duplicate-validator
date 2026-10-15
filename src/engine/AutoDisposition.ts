import type { Disposition, RuleDefinition, RuleValidationOutcome } from '@/types'
import { classifyDuplicateType } from './DuplicateTypeClassification'

/**
 * Maps a rule's own "Analysis" label (the free-text string from its rule
 * file, e.g. "Potential Duplicate" or "True Duplicate for denial") to the
 * Disposition that should be pre-filled for every group that rule flags.
 * See classifyDuplicateType (DuplicateTypeClassification.ts) for exactly how
 * the Analysis text is matched.
 *
 * A rule with no Analysis at all, or an Analysis that matches neither
 * phrase, returns null - its groups get no automatic Disposition, exactly
 * as if auto-disposition didn't exist for that rule.
 */
export function deriveAutoDisposition(analysis: string | undefined): Disposition | null {
  const classification = classifyDuplicateType(analysis)
  if (classification === 'true-duplicate') return 'Reject Shipment'
  if (classification === 'potential-duplicate') return 'Carrier Review'
  return null
}

/**
 * Builds the dispositions Map a fresh validation run should start from -
 * one auto-filled Disposition per flagged group, keyed the same way
 * ValidationSessionContext's `dispositions` state already is:
 * Map<ruleDefinitionId, Map<groupId, Disposition>>.
 *
 * A group only gets an entry when BOTH of these hold:
 *  - its own rule's Analysis resolves to a Disposition via
 *    deriveAutoDisposition (a rule with no recognized Analysis contributes
 *    no entries at all, same as if this function were never called for it);
 *  - the group's status is not 'UNIQUE' - a UNIQUE "group" is always a
 *    single, unflagged record with nothing to action, so (matching
 *    ReviewActivity's own "flagged" definition) it's left out entirely
 *    rather than seeded with a Disposition that doesn't apply to it.
 *
 * This is a *default* only: it runs once, when results are first set, and
 * every value it writes can still be freely overwritten afterward through
 * the normal setDisposition path - nothing here distinguishes an
 * auto-filled value from a manually-picked one once it's in the map.
 */
export function buildAutoDispositions(
  results: RuleValidationOutcome[],
  ruleDefinitions: RuleDefinition[]
): Map<string, Map<string, Disposition>> {
  const out = new Map<string, Map<string, Disposition>>()

  for (const outcome of results) {
    const definition = ruleDefinitions.find((d) => d.id === outcome.ruleDefinitionId)
    const autoDisposition = deriveAutoDisposition(definition?.metadata?.analysis)
    if (!autoDisposition) continue

    const forRule = new Map<string, Disposition>()
    for (const group of outcome.result.groups) {
      if (group.status === 'UNIQUE') continue
      forRule.set(group.id, autoDisposition)
    }
    if (forRule.size > 0) out.set(outcome.ruleDefinitionId, forRule)
  }

  return out
}
