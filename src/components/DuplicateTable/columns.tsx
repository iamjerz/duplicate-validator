import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import type { DuplicateGroup, DuplicateStatus } from '@/types'

export function statusBadgeVariant(status: DuplicateStatus): 'destructive' | 'warning' | 'success' | 'secondary' {
  if (status === 'DUPLICATE') return 'destructive'
  if (status === 'POTENTIAL_DUPLICATE') return 'warning'
  if (status === 'UNIQUE') return 'success'
  return 'secondary'
}

export const duplicateGroupColumns: ColumnDef<DuplicateGroup>[] = [
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
      return <Badge variant={statusBadgeVariant(status)}>{status.replace('_', ' ')}</Badge>
    },
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
