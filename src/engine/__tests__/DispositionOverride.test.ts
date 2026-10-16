import { describe, it, expect } from 'vitest'
import { computeDispositionOverride } from '../DispositionOverride'
import { buildRuleSet } from '../RuleValidator'
import { buildColumnMapping } from '../ColumnMapper'
import type { CellValue, RecordRef } from '@/types'

const HEADERS = ['Carrier Code', 'Invoice Account Number', 'Correction Indicator', 'Other Field']

function mappingFor(headers: string[]) {
  const ruleSet = buildRuleSet(headers.map((field) => ({ field, value: 'UNIQUE' }))).ruleSet
  if (!ruleSet) throw new Error('invalid rule set fixture')
  return buildColumnMapping(ruleSet, headers).entries
}

function recordsFor(rows: CellValue[][]): RecordRef[] {
  return rows.map((_, i) => ({ rowIndex: i, excelRowNumber: i + 2 }))
}

describe('computeDispositionOverride - Invoice/Shipment levels', () => {
  const mapping = mappingFor(HEADERS)

  it('overrides to Continue Processing when Carrier Code genuinely differs within the group', () => {
    const rows: CellValue[][] = [
      ['3JOS', 'JCIN3JOS', null, 'x'],
      ['4NET', 'JCIN4NET', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Invoice_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('overrides to Continue Processing when only Invoice Account Number differs (Carrier Code matches)', () => {
    const rows: CellValue[][] = [
      ['UPSN', '3W58Y7', null, 'x'],
      ['UPSN', 'DIFFERENT', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Shipment_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('returns null when Carrier Code and Invoice Account Number both match', () => {
    const rows: CellValue[][] = [
      ['FDE', '624778251', null, 'x'],
      ['FDE', '624778251', null, 'y'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Invoice_level')
    expect(result).toBeNull()
  })

  it('treats a blank Carrier Code against a real value as a genuine difference (consistent with evaluateUniqueField elsewhere)', () => {
    const rows: CellValue[][] = [
      ['', '624778251', null, 'x'],
      ['FDE', '624778251', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Shipment_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('never fires for a Charge-level group, even with differing Carrier Code', () => {
    const rows: CellValue[][] = [
      ['3JOS', 'x', null, 'x'],
      ['4NET', 'x', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })
})

describe('computeDispositionOverride - Invoice/Shipment: Account Number vs Client Code', () => {
  const HEADERS_WITH_CLIENT = ['Carrier Code', 'Invoice Account Number', 'Correction Indicator', 'Client Code']
  const mapping = mappingFor(HEADERS_WITH_CLIENT)

  it('does not override on an Account Number difference when Client Code also differs (Account is just Client Code baked into the string)', () => {
    const rows: CellValue[][] = [
      ['DSVDE', 'ABVNDSVDEEUR', null, 'ABVN'],
      ['DSVDE', 'ABVEDSVDEEUR', null, 'ABVE'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS_WITH_CLIENT, rows, mapping, 'Invoice_level')
    expect(result).toBeNull()
  })

  it('still overrides on an Account Number difference when Client Code matches', () => {
    const rows: CellValue[][] = [
      ['UPSN', '3W58Y7', null, 'INTU'],
      ['UPSN', 'DIFFERENT', null, 'INTU'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS_WITH_CLIENT, rows, mapping, 'Shipment_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('still overrides on a Carrier Code difference even when Client Code also differs', () => {
    const rows: CellValue[][] = [
      ['4NET', 'JCIN4NET', null, 'JCIN'],
      ['3JOS', 'JCIN3JOS', null, 'JCIN2'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS_WITH_CLIENT, rows, mapping, 'Invoice_level')
    expect(result?.disposition).toBe('Continue Processing')
  })
})

describe('computeDispositionOverride - Charge level', () => {
  const mapping = mappingFor(HEADERS)

  it('overrides to Continue Processing when any record has Correction Indicator = CORRECTION', () => {
    const rows: CellValue[][] = [
      ['AVRT', 'x', null, 'x'],
      ['AVRT', 'x', 'CORRECTION', 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Charge_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('matches Correction Indicator case-insensitively and trims whitespace', () => {
    const rows: CellValue[][] = [
      ['AVRT', 'x', '  correction  ', 'x'],
      ['AVRT', 'x', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Charge_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('does not fire for an unrelated Correction Indicator value like "BALANCE DUE BILLING"', () => {
    const rows: CellValue[][] = [
      ['FDE', 'x', 'BALANCE DUE BILLING', 'x'],
      ['FDE', 'x', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })

  it('returns null when no record has Correction Indicator set at all', () => {
    const rows: CellValue[][] = [
      ['FDE', 'x', null, 'x'],
      ['FDE', 'x', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })

  it('never fires for an Invoice/Shipment-level group, even with Correction Indicator = CORRECTION', () => {
    const rows: CellValue[][] = [
      ['FDE', 'x', 'CORRECTION', 'x'],
      ['FDE', 'x', null, 'x'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Invoice_level')
    expect(result).toBeNull()
  })
})

describe('computeDispositionOverride - Shipment: Audit Condition "Different Charges"', () => {
  const SHIP_HEADERS = [
    'Carrier Code',
    'Invoice Account Number',
    'Correction Indicator',
    'Client Code',
    'Audit Condition',
    'Audit Exception Status',
  ]
  const mapping = mappingFor(SHIP_HEADERS)

  it('overrides to Continue Processing when the OPEN member is labeled "Duplicate Shipment Different Charges", even with matching Carrier/Account', () => {
    const rows: CellValue[][] = [
      ['FDE', '199931202', null, 'VERS', '-', 'CLOSED'],
      ['FDE', '199931202', null, 'VERS', 'Duplicate Shipment Different Charges', 'OPEN'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), SHIP_HEADERS, rows, mapping, 'Shipment_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('matches the Audit Condition text case/whitespace-insensitively', () => {
    const rows: CellValue[][] = [
      ['FDE', '199931202', null, 'VERS', '  duplicate   shipment different charges  ', 'OPEN'],
      ['FDE', '199931202', null, 'VERS', '-', 'CLOSED'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), SHIP_HEADERS, rows, mapping, 'Shipment_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('does not fire for the superficially similar "Duplicate Shipment Different Lane" label (not a clean signal on its own)', () => {
    const rows: CellValue[][] = [
      ['UPSN', '3746W2', null, 'INTU', 'Duplicate Shipment Different Lane', 'OPEN'],
      ['UPSN', '3746W2', null, 'INTU', '-', 'CLOSED'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), SHIP_HEADERS, rows, mapping, 'Shipment_level')
    expect(result).toBeNull()
  })

  it('does not apply the Audit Condition signal to an Invoice-level group, even with the same text', () => {
    const rows: CellValue[][] = [
      ['FDE', '199931202', null, 'VERS', 'Duplicate Shipment Different Charges', 'OPEN'],
      ['FDE', '199931202', null, 'VERS', '-', 'CLOSED'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), SHIP_HEADERS, rows, mapping, 'Invoice_level')
    expect(result).toBeNull()
  })

  it('still fires on a genuine Carrier Code difference ahead of the Audit Condition check', () => {
    const rows: CellValue[][] = [
      ['FDE', '199931202', null, 'VERS', '-', 'CLOSED'],
      ['UPSN', '199931202', null, 'VERS', '-', 'OPEN'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), SHIP_HEADERS, rows, mapping, 'Shipment_level')
    expect(result?.reason).toContain('Account No., Carrier')
  })

  it('ignores a CLOSED record\'s stale "Different Charges" label when the OPEN record in the same group has its own, different Audit Condition', () => {
    // Real ground-truth shape: an already-resolved CLOSED "Different Charges" case sitting
    // next to a brand-new OPEN "Similar Charges" case for the same Root Id/Tracking Number -
    // the stale label must not steer today's (still-unresolved) disposition.
    const rows: CellValue[][] = [
      ['FDE', '614791861', null, 'VERS', 'Duplicate Shipment Different Charges', 'CLOSED'],
      ['FDE', '614791861', null, 'VERS', 'Duplicate Shipment Similar Charges', 'OPEN'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), SHIP_HEADERS, rows, mapping, 'Shipment_level')
    expect(result).toBeNull()
  })

  it('does not fire when Audit Exception Status is not mapped at all (fails closed, not guessing)', () => {
    const headersNoStatus = ['Carrier Code', 'Invoice Account Number', 'Correction Indicator', 'Client Code', 'Audit Condition']
    const mappingNoStatus = mappingFor(headersNoStatus)
    const rows: CellValue[][] = [
      ['FDE', '199931202', null, 'VERS', '-'],
      ['FDE', '199931202', null, 'VERS', 'Duplicate Shipment Different Charges'],
    ]
    const result = computeDispositionOverride(recordsFor(rows), headersNoStatus, rows, mappingNoStatus, 'Shipment_level')
    expect(result).toBeNull()
  })
})

describe('computeDispositionOverride - Charge level: offsetting entry elsewhere in the file', () => {
  const CHARGE_HEADERS = ['Carrier Code', 'Invoice Account Number', 'Correction Indicator', 'Tracking Number', 'Charge Code', 'Charge Amount']
  const mapping = mappingFor(CHARGE_HEADERS)

  function rowsFor(entries: Array<[string, string, string, number]>): CellValue[][] {
    // [tracking, chargeCode, otherTag, amount] -> fills Carrier/Account/Correction with placeholders
    return entries.map(([tracking, chargeCode, _tag, amount]) => ['FDE', 'ACCT', null, tracking, chargeCode, amount])
  }

  it('overrides when another row (same Tracking No. + Charge Code, outside the group) carries the exact negated amount', () => {
    // Group = rows 0 and 2 (the "original" and the "rebill"); row 1 is the reversing entry, not in the group.
    const rows = rowsFor([
      ['J451424', '585', 'original', 7206],
      ['J451424', '585', 'reversal', -7206],
      ['J451424', '585', 'rebill', 7206],
    ])
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 2, excelRowNumber: 4 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result?.disposition).toBe('Continue Processing')
  })

  it('does not override when no reversing row exists anywhere', () => {
    const rows = rowsFor([
      ['J787860', '495', 'original', 925],
      ['J787860', '495', 'potential-dup', 925],
    ])
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 1, excelRowNumber: 3 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })

  it('ignores a negated amount under a different Charge Code', () => {
    const rows = rowsFor([
      ['J451424', '585', 'original', 7206],
      ['J451424', 'AIR', 'unrelated-reversal', -7206],
      ['J451424', '585', 'rebill', 7206],
    ])
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 2, excelRowNumber: 4 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })

  it('ignores a negated amount under a different Tracking Number', () => {
    const rows = rowsFor([
      ['J451424', '585', 'original', 7206],
      ['OTHER-TRACKING', '585', 'unrelated-reversal', -7206],
      ['J451424', '585', 'rebill', 7206],
    ])
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 2, excelRowNumber: 4 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })

  it('does not count a reversing row that is itself a member of the group', () => {
    // If the negated amount is INSIDE the group (not "elsewhere"), that is not the void/rebill pattern.
    const rows = rowsFor([
      ['J451424', '585', 'a', 7206],
      ['J451424', '585', 'b', -7206],
    ])
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 1, excelRowNumber: 3 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })

  it('still fires the Correction Indicator check first even when no offsetting row exists', () => {
    const rows: CellValue[][] = [
      ['FDE', 'ACCT', 'CORRECTION', 'TRACK1', '400', 100],
      ['FDE', 'ACCT', null, 'TRACK1', '400', 100],
    ]
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 1, excelRowNumber: 3 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result?.reason).toContain('Correction invoice')
  })

  it('is not affected by a zero Charge Amount matching another zero elsewhere (0 is not its own negation signal)', () => {
    const rows = rowsFor([
      ['J451424', '585', 'a', 0],
      ['J451424', '585', 'b', 0],
      ['J451424', '585', 'c', 0],
    ])
    const records: RecordRef[] = [
      { rowIndex: 0, excelRowNumber: 2 },
      { rowIndex: 1, excelRowNumber: 3 },
    ]
    const result = computeDispositionOverride(records, CHARGE_HEADERS, rows, mapping, 'Charge_level')
    expect(result).toBeNull()
  })
})

describe('computeDispositionOverride - guards', () => {
  const mapping = mappingFor(HEADERS)

  it('returns null for a missing level', () => {
    const rows: CellValue[][] = [
      ['3JOS', 'x', null, 'x'],
      ['4NET', 'x', null, 'x'],
    ]
    expect(computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, undefined)).toBeNull()
  })

  it('returns null for an unrecognized level', () => {
    const rows: CellValue[][] = [
      ['3JOS', 'x', null, 'x'],
      ['4NET', 'x', null, 'x'],
    ]
    expect(computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Something Else')).toBeNull()
  })

  it('returns null for a singleton "group" regardless of level', () => {
    const rows: CellValue[][] = [['3JOS', 'x', 'CORRECTION', 'x']]
    expect(computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Invoice_level')).toBeNull()
    expect(computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'Charge_level')).toBeNull()
  })

  it('matches level case/punctuation-insensitively, same style as the rest of the app', () => {
    const rows: CellValue[][] = [
      ['3JOS', 'x', null, 'x'],
      ['4NET', 'x', null, 'x'],
    ]
    expect(computeDispositionOverride(recordsFor(rows), HEADERS, rows, mapping, 'INVOICE-LEVEL')?.disposition).toBe(
      'Continue Processing'
    )
  })

  it('returns null when Carrier Code/Invoice Account Number have no mapped column at all', () => {
    const headers = ['Other Field']
    const mappingNoCarrier = mappingFor(headers)
    const rows: CellValue[][] = [
      ['x'],
      ['y'],
    ]
    expect(computeDispositionOverride(recordsFor(rows), headers, rows, mappingNoCarrier, 'Invoice_level')).toBeNull()
  })
})
