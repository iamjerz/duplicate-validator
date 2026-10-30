export type RuleLevel = 'invoice' | 'shipment' | 'charge' | null

/**
 * Classifies a rule's own "level" metadata string (e.g. "Invoice_level",
 * "Shipment_level", "Charge_level", or a custom label like "Invoice_level
 * (Profile 6)") into which of the three levels it runs at. Matching is
 * case/punctuation-insensitive substring matching - lowercase, strip every
 * non-letter character, then check for "invoice"/"shipment"/"charge"
 * anywhere in what's left - the same normalization style
 * DispositionOverride.ts and AutoDisposition.ts already use for this exact
 * field, so a label like "Shipment_level", "SHIPMENT-LEVEL", or
 * "Invoice_level (Profile 6)" all resolve the same way regardless of exact
 * punctuation or casing.
 *
 * "invoice" is checked first, matching this project's established
 * precedent (DispositionOverride's normalizeLevelKey) for the
 * (hypothetical) case where a label somehow contains more than one
 * keyword. Returns null for a missing or unrecognized level - this
 * function never guesses a default the way a couple of older, narrower
 * level-handling functions elsewhere in this codebase do for their own
 * specific historical reasons (see AutoDisposition.ts's rejectLevelKey,
 * which defaults an unrecognized level to 'shipment' to preserve its own
 * behavior from before level-awareness existed - that default is NOT a
 * general "shipment is the safe fallback" principle, so it is not repeated
 * here).
 */
export function classifyRuleLevel(level: string | undefined): RuleLevel {
  const normalized = level?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
  if (!normalized) return null
  if (normalized.includes('invoice')) return 'invoice'
  if (normalized.includes('shipment')) return 'shipment'
  if (normalized.includes('charge')) return 'charge'
  return null
}
