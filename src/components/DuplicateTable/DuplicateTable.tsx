import { useMemo, useState, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import type { DuplicateGroup, DuplicateStatus } from '@/types'
import { useDebouncedValue } from '@/hooks'
import { formatNumber } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import { buildDuplicateGroupColumns } from './columns'

type FilterableStatus = Exclude<DuplicateStatus, 'VALIDATION_ERROR'>

const STATUS_OPTIONS: { value: FilterableStatus; label: string }[] = [
  { value: 'DUPLICATE', label: 'Duplicate' },
  { value: 'POTENTIAL_DUPLICATE', label: 'Potential Duplicate' },
  { value: 'UNIQUE', label: 'Unique' },
]

export interface DuplicateTableProps {
  groups: DuplicateGroup[]
  onSelectGroup: (group: DuplicateGroup) => void
  selectedGroupId?: string | null
  /** This rule's own Analysis text, used (with ruleFallbackName) to resolve every flagged row's Status label and badge color - see buildDuplicateGroupColumns. */
  ruleAnalysis: string | undefined
  /** Shown as the Status label instead when ruleAnalysis doesn't resolve to a known duplicate type - typically the rule's own uploaded file name. */
  ruleFallbackName: string
}

/** A lowercased, searchable blob of the group's identifying values, built once per group. */
function buildHaystack(group: DuplicateGroup): string {
  const parts = [group.id, ...Object.values(group.sameFieldValues).map((v) => v.display)]
  for (const diff of group.uniqueDifferences) {
    for (const entry of diff.values) parts.push(entry.value.display)
  }
  return parts.join(' ').toLowerCase()
}

/**
 * The main results table. Large files can produce a "group" per unique
 * record too, so this can hold hundreds of thousands of rows - it is
 * virtualized (only the visible slice is ever mounted) rather than paginated,
 * which keeps scrolling smooth without chunking the data into pages.
 */
export function DuplicateTable({ groups, onSelectGroup, selectedGroupId, ruleAnalysis, ruleFallbackName }: DuplicateTableProps) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [statusFilter, setStatusFilter] = useState<Set<FilterableStatus>>(
    () => new Set(['DUPLICATE', 'POTENTIAL_DUPLICATE', 'UNIQUE'])
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const haystacks = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) map.set(g.id, buildHaystack(g))
    return map
  }, [groups])

  const filteredGroups = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase()
    return groups.filter((g) => {
      if (!statusFilter.has(g.status)) return false
      if (!term) return true
      return haystacks.get(g.id)?.includes(term) ?? false
    })
  }, [groups, statusFilter, debouncedSearch, haystacks])

  const columns = useMemo(() => buildDuplicateGroupColumns(ruleAnalysis, ruleFallbackName), [ruleAnalysis, ruleFallbackName])

  const table = useReactTable({
    data: filteredGroups,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const visibleColumnCount = table.getVisibleLeafColumns().length

  const scrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 12,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search group ID, invoice number, ID..."
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {STATUS_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <Checkbox
                checked={statusFilter.has(option.value)}
                onCheckedChange={(checked) => {
                  setStatusFilter((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(option.value)
                    else next.delete(option.value)
                    return next
                  })
                }}
              />
              {option.label}
            </label>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllLeafColumns().map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                onSelect={(e) => e.preventDefault()}
              >
                {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-sm text-muted-foreground">
          {formatNumber(filteredGroups.length)} of {formatNumber(groups.length)} groups
        </span>
      </div>

      <div ref={scrollRef} className="max-h-[32rem] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted()
                  const indicator = sortDir === 'asc' ? ' ^' : sortDir === 'desc' ? ' v' : ''
                  return (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {indicator}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {paddingTop > 0 && (
              <tr aria-hidden="true">
                <td style={{ height: paddingTop }} colSpan={visibleColumnCount} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index]
              const group = row.original
              return (
                <TableRow
                  key={row.id}
                  onClick={() => onSelectGroup(group)}
                  className={cn('cursor-pointer', selectedGroupId === group.id && 'bg-accent')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              )
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden="true">
                <td style={{ height: paddingBottom }} colSpan={visibleColumnCount} />
              </tr>
            )}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="p-6 text-center text-sm text-muted-foreground">
                  No groups match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
