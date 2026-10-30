import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import type { CellValue, DuplicateGroup, DuplicateStatus } from '@/types'
import { classifyDuplicateType, classifyRuleLevel, DUPLICATE_TYPE_LABELS, normalizeValue, type DuplicateTypeClassification } from '@/engine'

/** Used by DuplicateDetails.tsx's Group Details modal, which still shows the raw engine status rather than the rule-driven label/color below. */
export function statusBadgeVariant(status: DuplicateStatus): 'destructive' | 'warning' | 'success' | 'secondary' {
  if (status === 'DUPLICATE') return 'destructive'
  if (status === 'POTENTIAL_DUPLICATE') return 'warning'
  if (status === 'UNIQUE') return 'success'
  return 'secondary'
}

/** The Status badge color for a flagged (non-UNIQUE) group, driven by the rule's own duplicate-type classification rather than that group's individual DUPLICATE/POTENTIAL_DUPLICATE status - red for a True-Duplicate rule, amber for a Potential-Duplicate rule (unchanged from before), gray for a rule whose Analysis doesn't resolve to either. */
function ruleTypeBadgeVariant(classification: DuplicateTypeClassification): 'destructive' | 'warning' | 'secondary' {
  if (classification === 'true-duplicate') return 'destructive'
  if (classification === 'potential-duplicate') return 'warning'
  return 'secondary'
}

/**
 * The group's own first record's display value for an arbitrary field,
 * looked up directly from the raw dataset rather than from the group's own
 * precomputed matchedSameFields/sameFieldValues. Unlike sameFieldValues
 * (only ever populated for fields the active rule marks SAME, since that's
 * the only case every member is guaranteed to share one value), this works
 * for a field regardless of how - or whether - the rule classifies it: a
 * field like "Bill Of Lading" is typically UNIQUE (or not compared at all)
 * rather than SAME in this app's real Shipment/Charge rules, so it would
 * never show anything via sameFieldValues even though it's still useful,
 * identifying, mostly-one-value-per-shipment information to show a reviewer.
 * This deliberately only reads the FIRST member's value - for a true SAME
 * field the two approaches agree exactly (every member shares one value by
 * definition), but for a UNIQUE field that genuinely differs across the
 * group this is a representative preview, not a claim that every member
 * matches. Returns '' (rendered as a dash by the cell) when the field isn't
 * mapped to any column, or the group has no records.
 */
function firstRecordFieldValue(
  group: DuplicateGroup,
  field: string,
  rows: CellValue[][],
  columnIndexByField: Map<string, number>
): string {
  const colIndex = columnIndexByField.get(field)
  const firstRecord = group.records[0]
  if (colIndex === undefined || !firstRecord) return ''
  return normalizeValue(rows[firstRecord.rowIndex]?.[colIndex] ?? null).display
}

export interface BuildDuplicateGroupColumnsOptions {
  /** This rule's own Analysis text, used (with ruleFallbackName) to resolve the Status label/color - see buildDuplicateGroupColumns. */
  ruleAnalysis: string | undefined
  /** Shown as the Status label instead when ruleAnalysis doesn't resolve to a known duplicate type - typically the rule's own uploaded file name. */
  ruleFallbackName: string
  /** This rule's own "level" metadata text (e.g. "Shipment_level") - resolved via classifyRuleLevel to decide the identifier column(s) below. */
  ruleLevel: string | undefined
  /** The full dataset's rows, for firstRecordFieldValue lookups (Tracking Number / Bill Of Lading aren't necessarily SAME fields, so they can't come from sameFieldValues). */
  rows: CellValue[][]
  /** Field name -> column index, from buildColumnIndexByField(excelDataset.headers, mapping.entries) - the same mapping regardless of which rule's tab this is, computed once by the caller. */
  columnIndexByField: Map<string, number>
}

/**
 * Builds the Results table's columns for one rule's tab.
 *
 * Status label/color: `ruleAnalysis` and `ruleFallbackName` together resolve
 * (via classifyDuplicateType) to one label and badge color used for EVERY
 * flagged row in this table, since both describe which rule/kind of match
 * the whole tab represents, not a per-group computation:
 *  - Analysis resolves to "true duplicate" - label "True Duplicate", red badge.
 *  - Analysis resolves to "potential duplicate" - label "Potential Duplicate", amber badge (unchanged from this app's original color).
 *  - Analysis resolves to neither (or is missing) - label falls back to `ruleFallbackName`, gray badge, since we don't know which kind this is.
 * A UNIQUE group is never a "duplicate" of any type, so it always keeps its
 * own plain "Unique" label and green badge regardless of the rule.
 *
 * Identifier column(s): an Invoice-level rule (or one whose level is missing
 * or unrecognized - classifyRuleLevel returns null) keeps the original
 * single "Invoice Number" column, unchanged. A Shipment- or Charge-level
 * rule (classifyRuleLevel(ruleLevel) is 'shipment' or 'charge') replaces it
 * with two columns instead, "Tracking Number" and "Bill Of Lading" - the
 * identifiers that actually distinguish a shipment or charge record, rather
 * than the Invoice Number that happens to be riding along with it (several
 * different invoices can share one shipment/charge, and vice versa).
 */
export function buildDuplicateGroupColumns({
  ruleAnalysis,
  ruleFallbackName,
  ruleLevel,
  rows,
  columnIndexByField,
}: BuildDuplicateGroupColumnsOptions): ColumnDef<DuplicateGroup>[] {
  const classification = classifyDuplicateType(ruleAnalysis)
  const ruleTypeLabel = classification ? DUPLICATE_TYPE_LABELS[classification] : ruleFallbackName
  const ruleVariant = ruleTypeBadgeVariant(classification)

  const level = classifyRuleLevel(ruleLevel)
  const identifierColumns: ColumnDef<DuplicateGroup>[] =
    level === 'shipment' || level === 'charge'
      ? [
          {
            id: 'trackingNumber',
            header: 'Tracking Number',
            accessorFn: (g) => firstRecordFieldValue(g, 'Tracking Number', rows, columnIndexByField),
            cell: (info) => <span className="font-mono text-xs">{info.getValue<string>() || '—'}</span>,
          },
          {
            id: 'billOfLading',
            header: 'Bill Of Lading',
            accessorFn: (g) => firstRecordFieldValue(g, 'Bill Of Lading', rows, columnIndexByField),
            cell: (info) => <span className="font-mono text-xs">{info.getValue<string>() || '—'}</span>,
          },
        ]
      : [
          {
            id: 'invoiceNumber',
            header: 'Invoice Number',
            accessorFn: (g) => g.sameFieldValues['Invoice Number']?.display ?? '',
            cell: (info) => <span className="font-mono text-xs">{info.getValue<string>() || '—'}</span>,
          },
        ]

  return [
    {
      accessorKey: 'id',
      header: 'Group ID',
      cell: (info) => <span className="font-mono text-xs">{info.getValue<string>()}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const status = info.getValue<DuplicateStatus>()
        if (status === 'UNIQUE') return <Badge variant="success">Unique</Badge>
        return <Badge variant={ruleVariant}>{ruleTypeLabel}</Badge>
      },
    },
    {
      id: 'rootId',
      header: 'Root Id',
      // Only ever populated when the active rule marks "Root Id" as a SAME
      // field - that's the only case where every record in the group is
      // guaranteed to share one representative value. Rules that don't use
      // this field (or treat it as UNIQUE/OPTIONAL) show a dash instead.
      accessorFn: (g) => g.sameFieldValues['Root Id']?.display ?? '',
      cell: (info) => <span className="font-mono text-xs">{info.getValue<string>() || '—'}</span>,
    },
    ...identifierColumns,
    {
      id: 'records',
      header: 'Records',
      accessorFn: (g) => g.records.length,
      cell: (info) => `${info.getValue<number>()} record${info.getValue<number>() === 1 ? '' : 's'}`,
    },
    {
      id: 'sameFields',
      header: 'Matched SAME Fields',
      accessorFn: (g) => g.matchedSameFields.length,
      cell: (info) => `${info.getValue<number>()} SAME fields`,
    },
    {
      id: 'uniqueDiffs',
      header: 'Different UNIQUE Fields',
      accessorFn: (g) => g.differentUniqueFields.length,
      cell: (info) => `${info.getValue<number>()} UNIQUE difference${info.getValue<number>() === 1 ? '' : 's'}`,
    },
    {
      id: 'optionalDiffs',
      header: 'Different OPTIONAL Fields',
      accessorFn: (g) => g.differentOptionalFields.length,
      cell: (info) => `${info.getValue<number>()} OPTIONAL difference${info.getValue<number>() === 1 ? '' : 's'}`,
    },
    {
      id: 'explanation',
      header: 'Explanation',
      accessorFn: (g) => g.explanation.summary,
      cell: (info) => <span className="text-muted-foreground">{info.getValue<string>()}</span>,
    },
  ]
}
