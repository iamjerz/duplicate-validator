import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import type { DuplicateGroup, DuplicateStatus } from '@/types'
import { classifyDuplicateType, DUPLICATE_TYPE_LABELS, type DuplicateTypeClassification } from '@/engine'

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
 * Builds the Results table's columns for one rule's tab. `ruleAnalysis` is
 * that rule's own Analysis text and `ruleFallbackName` its uploaded file
 * name - together they resolve (via classifyDuplicateType) to one label and
 * badge color used for EVERY flagged row in this table, since both describe
 * which rule/kind of match the whole tab represents, not a per-group
 * computation:
 *  - Analysis resolves to "true duplicate" - label "True Duplicate", red badge.
 *  - Analysis resolves to "potential duplicate" - label "Potential Duplicate", amber badge (unchanged from this app's original color).
 *  - Analysis resolves to neither (or is missing) - label falls back to `ruleFallbackName`, gray badge, since we don't know which kind this is.
 * A UNIQUE group is never a "duplicate" of any type, so it always keeps its
 * own plain "Unique" label and green badge regardless of the rule.
 */
export function buildDuplicateGroupColumns(ruleAnalysis: string | undefined, ruleFallbackName: string): ColumnDef<DuplicateGroup>[] {
  const classification = classifyDuplicateType(ruleAnalysis)
  const ruleTypeLabel = classification ? DUPLICATE_TYPE_LABELS[classification] : ruleFallbackName
  const ruleVariant = ruleTypeBadgeVariant(classification)

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
    {
      id: 'invoiceNumber',
      header: 'Invoice Number',
      accessorFn: (g) => g.sameFieldValues['Invoice Number']?.display ?? '',
      cell: (info) => <span className="font-mono text-xs">{info.getValue<string>() || '—'}</span>,
    },
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
