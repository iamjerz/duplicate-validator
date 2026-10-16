import type { Disposition, RuleDefinition, RuleValidationOutcome } from '@/types'
import { classifyDuplicateType } from './DuplicateTypeClassification'

type RejectLevelKey = 'invoice' | 'shipment' | 'charge'

/**
 * Which level a rule's own "Reject X" disposition should name, matched
 * case/punctuation-insensitively against its metadata.level text (e.g.
 * "Invoice_level", "Shipment_level", "Charge_level") - the same matching
 * style IdentityGrouping/DispositionOverride use elsewhere in this app.
 * Defaults to 'shipment' for a missing/unrecognized level, preserving this
 * function's original behavior from before level-awareness existed.
 */
function rejectLevelKey(level: string | undefined): RejectLevelKey {
  const normalized = level?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
  if (normalized.includes('invoice')) return 'invoice'
  if (normalized.includes('charge')) return 'charge'
  return 'shipment'
}

const REJECT_DISPOSITION: Record<RejectLevelKey, Disposition> = {
  invoice: 'Reject Invoice',
  shipment: 'Reject Shipment',
  charge: 'Reject Charge',
}

/**
 * Maps a rule's own "Analysis" label (the free-text string from its rule
 * file, e.g. "Potential Duplicate" or "True Duplicate for denial") to the
 * Disposition that should be pre-filled for every group that rule flags.
 * See classifyDuplicateType (DuplicateTypeClassification.ts) for exactly how
 * the Analysis text is matched.
 *
 * A True-Duplicate rule's disposition names the level it actually runs at -
 * "Reject Invoice" for an Invoice-level rule, "Reject Shipment" for
 * Shipment-level, "Reject Charge" for Charge-level (falling back to "Reject
 * Shipment" if the level is missing or unrecognized, this function's
 * original fixed behavior) - confirmed against a manually-reviewed ground
 * truth file where Invoice-level True Duplicates were always actioned
 * "Reject Invoice", never "Reject Shipment".
 *
 * A rule with no Analysis at all, or an Analysis that matches neither
 * phrase, returns null - its groups get no automatic Disposition, exactly
 * as if auto-disposition didn't exist for that rule.
 */
export function deriveAutoDisposition(analysis: string | undefined, level?: string): Disposition | null {
  const classification = classifyDuplicateType(analysis)
  if (classification === 'true-duplicate') return REJECT_DISPOSITION[rejectLevelKey(level)]
  if (classification === 'potential-duplicate') return 'Carrier Review'
  return null
}

/**
 * Builds the dispositions Map a fresh validation run should start from -
 * one auto-filled Disposition per flagged group, keyed the same way
 * ValidationSessionContext's `dispositions` state already is:
 * Map<ruleDefinitionId, Map<groupId, Disposition>>.
 *
 * A group only gets an entry when its status is not 'UNIQUE' (a UNIQUE
 * "group" is always a single, unflagged record with nothing to action, so -
 * matching ReviewActivity's own "flagged" definition - it's left out
 * entirely rather than seeded with a Disposition that doesn't apply to it)
 * AND at least one of these resolves to a Disposition:
 *  - the group's own `dispositionOverride` (see DispositionOverride.ts) -
 *    takes priority when present, since it reflects something concretely
 *    wrong with treating this specific group as a real duplicate at all,
 *    regardless of what the rule itself would otherwise seed;
 *  - otherwise, its rule's Analysis via deriveAutoDisposition (a rule with
 *    no recognized Analysis, and no override on this group either,
 *    contributes no entry for it).
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
    const ruleDisposition = deriveAutoDisposition(definition?.metadata?.analysis, definition?.metadata?.level)

    const forRule = new Map<string, Disposition>()
    for (const group of outcome.result.groups) {
      if (group.status === 'UNIQUE') continue
      const disposition = group.dispositionOverride?.disposition ?? ruleDisposition
      if (!disposition) continue
      forRule.set(group.id, disposition)
    }
    if (forRule.size > 0) out.set(outcome.ruleDefinitionId, forRule)
  }

  return out
}
