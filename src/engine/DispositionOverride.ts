import type { CellValue, ColumnMappingEntry, DispositionOverrideOutcome, RecordRef } from '@/types'
import { buildColumnIndexByField } from './ColumnMapper'
import { isBlank, normalizeValue, parseNumberLike } from './DataNormalizer'
import { evaluateUniqueField } from './UniqueEvaluator'

type OverrideLevelKey = 'invoice-or-shipment' | 'charge'

function normalizeLevelKey(level: string | undefined): OverrideLevelKey | null {
  const normalized = level?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
  if (!normalized) return null
  if (normalized.includes('invoice') || normalized.includes('shipment')) return 'invoice-or-shipment'
  if (normalized.includes('charge')) return 'charge'
  return null
}

function isShipmentLevel(level: string | undefined): boolean {
  const normalized = level?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
  return normalized.includes('shipment')
}

function valuesFor(
  field: string,
  records: RecordRef[],
  rows: CellValue[][],
  columnIndexByField: Map<string, number>
) {
  const colIdx = columnIndexByField.get(field)
  if (colIdx === undefined) return []
  return records.map((r) => normalizeValue(rows[r.rowIndex]?.[colIdx] ?? null))
}

function fieldGenuinelyDiffers(
  field: string,
  records: RecordRef[],
  rows: CellValue[][],
  columnIndexByField: Map<string, number>
): boolean {
  const values = valuesFor(field, records, rows, columnIndexByField)
  if (values.length === 0) return false
  return evaluateUniqueField(field, values).isDifferent
}

function numericValue(raw: CellValue): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') return parseNumberLike(raw)
  return null
}

interface OffsetEntry {
  rowIndex: number
  amount: number
}

/**
 * Keyed by the exact `rows` array reference, so the (Tracking Number, Charge
 * Code) -> [{rowIndex, amount}] index below is built once per validation run
 * (an O(rows) pass) rather than once per group - a group-by-group rescan of
 * every row would turn a single rule run into O(groups x rows) work on large
 * files. A fresh `rows` array (a new upload, or a different dataset) simply
 * misses the cache and rebuilds.
 */
const offsetIndexCache = new WeakMap<CellValue[][], Map<string, OffsetEntry[]> | null>()

function getOffsetIndex(rows: CellValue[][], columnIndexByField: Map<string, number>): Map<string, OffsetEntry[]> | null {
  const cached = offsetIndexCache.get(rows)
  if (cached !== undefined) return cached

  const trackingIdx = columnIndexByField.get('Tracking Number')
  const chargeCodeIdx = columnIndexByField.get('Charge Code')
  const amountIdx = columnIndexByField.get('Charge Amount')
  if (trackingIdx === undefined || chargeCodeIdx === undefined || amountIdx === undefined) {
    offsetIndexCache.set(rows, null)
    return null
  }

  const index = new Map<string, OffsetEntry[]>()
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const tracking = normalizeValue(rows[rowIndex]?.[trackingIdx] ?? null)
    const chargeCode = normalizeValue(rows[rowIndex]?.[chargeCodeIdx] ?? null)
    if (isBlank(tracking) || isBlank(chargeCode)) continue
    const amount = numericValue(rows[rowIndex]?.[amountIdx] ?? null)
    if (amount === null) continue

    const key = `${tracking.normalized}::${chargeCode.normalized}`
    const bucket = index.get(key)
    if (bucket) bucket.push({ rowIndex, amount })
    else index.set(key, [{ rowIndex, amount }])
  }
  offsetIndexCache.set(rows, index)
  return index
}

/**
 * True when some OTHER row in the file (same Tracking Number and Charge
 * Code, but not a member of this group) carries the exact negation of one of
 * this group's own Charge Amounts - a reversing/credit entry, the mechanical
 * fingerprint of a void-and-rebill. See computeDispositionOverride's doc
 * comment for the ground-truth pattern this was reverse-engineered from.
 */
function hasOffsettingEntryElsewhere(
  records: RecordRef[],
  rows: CellValue[][],
  columnIndexByField: Map<string, number>
): boolean {
  const index = getOffsetIndex(rows, columnIndexByField)
  if (!index) return false

  const trackingIdx = columnIndexByField.get('Tracking Number')
  const chargeCodeIdx = columnIndexByField.get('Charge Code')
  const amountIdx = columnIndexByField.get('Charge Amount')
  if (trackingIdx === undefined || chargeCodeIdx === undefined || amountIdx === undefined) return false

  const groupRowIndices = new Set(records.map((r) => r.rowIndex))

  for (const record of records) {
    const tracking = normalizeValue(rows[record.rowIndex]?.[trackingIdx] ?? null)
    const chargeCode = normalizeValue(rows[record.rowIndex]?.[chargeCodeIdx] ?? null)
    if (isBlank(tracking) || isBlank(chargeCode)) continue
    const amount = numericValue(rows[record.rowIndex]?.[amountIdx] ?? null)
    if (amount === null || amount === 0) continue

    const bucket = index.get(`${tracking.normalized}::${chargeCode.normalized}`)
    if (!bucket) continue
    for (const entry of bucket) {
      if (groupRowIndices.has(entry.rowIndex)) continue
      if (Math.abs(amount + entry.amount) < 0.01) return true
    }
  }
  return false
}

/**
 * Downgrades a group's disposition to "Continue Processing" when the
 * underlying data shows it isn't really the same real-world
 * invoice/shipment/charge, even though the rule's own SAME/UNIQUE fields
 * matched it into a group. Reverse-engineered from a manually-reviewed
 * ground-truth file (Manual Validation.xlsx) covering all three levels -
 * every pattern below was confirmed against real, human-reviewed
 * determinations, not guessed from first principles.
 *
 * Invoice and Shipment share one rule: two records that otherwise look like
 * a match but have a genuinely different Carrier Code are a coincidental
 * Invoice Number/Tracking Number collision, not a real duplicate - confirmed
 * on every "Different Lane" Shipment case and every Carrier-mismatch Invoice
 * case in the ground truth, with zero exceptions. A differing Invoice Account
 * Number counts the same way, but only when Client Code matches across the
 * group - Account Number is frequently just Client Code's own prefix baked
 * into the account string (e.g. "ABVNDSVDEEUR" vs "ABVEDSVDEEUR" for the
 * "ABVN"/"ABVE" client pair), so when Client Code already differs, an Account
 * Number difference adds no independent signal and is ignored - confirmed by
 * a real ground-truth Invoice group (Carrier and Client both "ABV*"-paired,
 * different Client Code, different Account Number as a result) that the
 * reviewer left as Carrier Review, not Continue Processing.
 *
 * Shipment has one more signal of its own: the source system already labels
 * some pairs with an "Audit Condition" of "Duplicate Shipment Different
 * Charges" - a literal field in the data, not inferred - and in the ground
 * truth that exact label is 100% Continue Processing (8 of 8 flagged cases,
 * zero exceptions), even when Carrier and Account both match. Note this is
 * narrower than it sounds in two ways: "Duplicate Shipment Different Lane" is
 * a superficially similar label that is NOT a clean signal on its own (16
 * Carrier Review vs 11 Continue Processing in the same ground truth), so only
 * the exact "Different Charges" text is used; and Audit Condition is only
 * trusted on a record whose own Audit Exception Status is "Open" - the
 * "original" side of a pair can carry its own, unrelated, already-resolved
 * (CLOSED) Audit Condition that has nothing to do with the live case, and a
 * real ground-truth group shaped exactly that way (CLOSED "Different Charges"
 * next to a brand-new OPEN "Similar Charges") confirmed that the stale label
 * must not override the live one.
 *
 * Charge has two rules of its own. First: a member of the group whose
 * Correction Indicator reads "CORRECTION" means the match is a correction
 * resubmission, not a duplicate charge - confirmed on the ground truth's
 * exact-text-match cases. Second: a void-and-rebill leaves a mechanical
 * fingerprint even when Correction Indicator is blank - the original charge
 * gets reversed by a separate, unrelated-looking row elsewhere in the file
 * that shares its Tracking Number and Charge Code but carries the exact
 * negated Charge Amount (e.g. Charge Amount 7206 on one row, -7206 on
 * another with the same Tracking Number/Charge Code but a different Invoice
 * Number), and the rebill that follows reuses the original amount under a
 * third Invoice Number. Confirmed on every ground-truth "offset with
 * <invoice>" comment in the Charge sheet - the reversing row is never a
 * member of the matched group itself (it has its own, unrelated Root
 * Id/Charge Id), so this is checked against the whole file, not just the
 * group's own records; see hasOffsettingEntryElsewhere.
 *
 * Known gap (disclosed, not silently papered over): a handful of "Duplicate
 * Shipment Different Lane" cases are themselves Continue Processing despite
 * matching Carrier/Account and not being "Different Charges" (the reviewer's
 * comment cites a specific line-item charge code, e.g. "Address Correction
 * (AAJ.007)", or an EDI segment code for a return shipment) - and the single
 * "Duplicate Shipment Different Ship Date" case in the ground truth is a 50/50
 * split (1 Continue Processing, 1 Carrier Review) with no sample size to
 * generalize from. Both are flagged in the project README rather than guessed
 * at with a fragile, overfit rule keyed to one or two specific charge codes.
 *
 * Returns null (no override - use the rule's own disposition) for an
 * unrecognized/missing level, a singleton "group", or when none of the
 * above signals fire.
 */
export function computeDispositionOverride(
  records: RecordRef[],
  headers: string[],
  rows: CellValue[][],
  mapping: ColumnMappingEntry[],
  level: string | undefined
): DispositionOverrideOutcome | null {
  if (records.length < 2) return null
  const key = normalizeLevelKey(level)
  if (!key) return null

  const columnIndexByField = buildColumnIndexByField(headers, mapping)

  if (key === 'invoice-or-shipment') {
    const carrierDiffers = fieldGenuinelyDiffers('Carrier Code', records, rows, columnIndexByField)
    const clientDiffers = fieldGenuinelyDiffers('Client Code', records, rows, columnIndexByField)
    const accountDiffers = !clientDiffers && fieldGenuinelyDiffers('Invoice Account Number', records, rows, columnIndexByField)
    if (carrierDiffers || accountDiffers) {
      return {
        disposition: 'Continue Processing',
        reason: 'Same Invoice No.; Different Account No., Carrier, and/or Invoice Amount.',
      }
    }

    if (isShipmentLevel(level)) {
      const statusIdx = columnIndexByField.get('Audit Exception Status')
      const conditionIdx = columnIndexByField.get('Audit Condition')
      const isDifferentCharges =
        statusIdx !== undefined &&
        conditionIdx !== undefined &&
        records.some((r) => {
          // Only trust Audit Condition on the record that is itself OPEN - the
          // "original" side of a pair can carry its own, unrelated, already-
          // resolved Audit Condition (e.g. CLOSED "Different Charges" sitting
          // next to a brand-new OPEN "Similar Charges" case), and that stale
          // label must not steer today's disposition for the live record.
          const status = normalizeValue(rows[r.rowIndex]?.[statusIdx] ?? null)
          if (status.kind !== 'value' || status.normalized !== 'open') return false
          const condition = normalizeValue(rows[r.rowIndex]?.[conditionIdx] ?? null)
          return condition.kind === 'value' && condition.normalized === 'duplicate shipment different charges'
        })
      if (isDifferentCharges) {
        return { disposition: 'Continue Processing', reason: 'Different Charge.' }
      }
    }

    return null
  }

  // charge
  const correctionValues = valuesFor('Correction Indicator', records, rows, columnIndexByField)
  const hasCorrection = correctionValues.some((v) => v.kind === 'value' && v.normalized === 'correction')
  if (hasCorrection) {
    return {
      disposition: 'Continue Processing',
      reason: 'This is a Correction invoice; reject the first submission.',
    }
  }

  if (hasOffsettingEntryElsewhere(records, rows, columnIndexByField)) {
    return {
      disposition: 'Continue Processing',
      reason: 'This charge was offset by a reversing (credit) entry with the same Tracking No. and Charge Code elsewhere in the file.',
    }
  }

  return null
}
