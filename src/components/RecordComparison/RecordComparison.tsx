import { useMemo } from 'react'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buildColumnIndexByField, normalizeValue, normalizedValuesEqual, evaluateUniqueField, evaluateOptionalField } from '@/engine'
import { sourceFileForRow, type CellValue, type DuplicateGroup, type RuleSet } from '@/types'
import { cn } from '@/utils/cn'

export interface RecordComparisonProps {
  group: DuplicateGroup
  /** Which rule's SAME/UNIQUE/OPTIONAL/N/A definitions should color this comparison. */
  ruleSet: RuleSet
}

type CellKind = 'same' | 'same-mismatch' | 'optional-diff' | 'unique-diff' | 'na' | 'plain'

/**
 * Renders through normalizeValue()'s own `display` rather than stringifying
 * the raw cell directly - this matters for values normalizeValue reshapes
 * for readability (dates to ISO, a `["CODE : amount"]` charges cell to
 * "CODE: amount"), so the table always shows the same human-readable text
 * used everywhere else in the app (e.g. the diff lists in DuplicateDetails),
 * never the raw JSON/serial text underneath.
 */
function formatCell(value: CellValue | undefined): string {
  return normalizeValue(value ?? null).display
}

/**
 * Renders the actual Excel records side by side, one column per record and
 * one row per rule field, color-coded by how that field participated in the
 * match: SAME (matched), SAME mismatch, OPTIONAL difference, UNIQUE
 * difference, or N/A (ignored).
 *
 * Every field's kind is computed here directly from the raw cell values
 * (never trusted from `group`'s own precomputed matchedSameFields /
 * differentUniqueFields / differentOptionalFields). This is deliberate: the
 * Group Details modal can show the SAME `group`'s records next to a
 * DIFFERENT rule's `ruleSet` - one that did not produce this group - to
 * answer "how would this rule see these same records?" A field this other
 * rule marks SAME is not guaranteed to actually match across these specific
 * records, so it must be checked live rather than assumed. For the normal
 * case (ruleSet is the group's own originating rule) this produces exactly
 * the same result as before, since a real group's SAME fields always do
 * match by construction.
 */
export function RecordComparison({ group, ruleSet }: RecordComparisonProps) {
  const { excelDataset, mapping } = useValidationSession()

  const columnIndexByField = useMemo(() => {
    if (!excelDataset || !mapping) return new Map<string, number>()
    return buildColumnIndexByField(excelDataset.headers, mapping.entries)
  }, [excelDataset, mapping])

  const fieldKindByField = useMemo(() => {
    const result = new Map<string, CellKind>()
    if (!excelDataset) return result

    const valuesFor = (field: string) => {
      const colIdx = columnIndexByField.get(field)
      return group.records.map((record) => {
        const raw: CellValue = colIdx !== undefined ? excelDataset.rows[record.rowIndex]?.[colIdx] ?? null : null
        return normalizeValue(raw)
      })
    }

    for (const field of ruleSet.same) {
      const values = valuesFor(field)
      const allMatch = values.every((v, i) => i === 0 || normalizedValuesEqual(values[0], v))
      result.set(field, allMatch ? 'same' : 'same-mismatch')
    }
    for (const field of ruleSet.unique) {
      const { isDifferent } = evaluateUniqueField(field, valuesFor(field))
      result.set(field, isDifferent ? 'unique-diff' : 'plain')
    }
    for (const field of ruleSet.optional) {
      const { isDifferent } = evaluateOptionalField(field, valuesFor(field))
      result.set(field, isDifferent ? 'optional-diff' : 'plain')
    }
    for (const field of ruleSet.ignored) {
      result.set(field, 'na')
    }

    return result
  }, [group, ruleSet, excelDataset, columnIndexByField])

  if (!excelDataset || !mapping) return null

  const kindClass: Record<CellKind, string> = {
    same: 'bg-success/10',
    'same-mismatch': 'bg-destructive/20 font-medium',
    'optional-diff': 'bg-warning/10',
    'unique-diff': 'bg-destructive/10',
    na: 'text-muted-foreground/50',
    plain: '',
  }

  const fields = ruleSet.fields.map((f) => f.field)
  const hasSameMismatch = fields.some((field) => fieldKindByField.get(field) === 'same-mismatch')
  const showSourceFile = excelDataset.sourceFiles.length > 1

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendSwatch className="bg-success/40" label="SAME" />
        {hasSameMismatch && <LegendSwatch className="bg-destructive/60" label="SAME field mismatch (rule not satisfied)" />}
        <LegendSwatch className="bg-warning/40" label="OPTIONAL difference" />
        <LegendSwatch className="bg-destructive/40" label="UNIQUE difference" />
        <LegendSwatch className="bg-muted" label="N/A (ignored)" />
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-card">Field</TableHead>
              {group.records.map((record) => {
                const sourceFile = showSourceFile ? sourceFileForRow(excelDataset, record.rowIndex) : null
                return (
                  <TableHead key={record.rowIndex} className="whitespace-nowrap">
                    Row {record.excelRowNumber}
                    {sourceFile && <span className="font-normal text-muted-foreground"> ({sourceFile.fileName})</span>}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field) => {
              const kind = fieldKindByField.get(field) ?? 'plain'
              const colIndex = columnIndexByField.get(field) ?? -1
              return (
                <TableRow key={field}>
                  <TableCell className="sticky left-0 z-10 bg-card font-medium">{field}</TableCell>
                  {group.records.map((record) => {
                    const value = colIndex >= 0 ? excelDataset.rows[record.rowIndex]?.[colIndex] : null
                    return (
                      <TableCell key={record.rowIndex} className={cn('whitespace-nowrap', kindClass[kind])}>
                        {formatCell(value)}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded-sm', className)} />
      {label}
    </span>
  )
}
