import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { sourceFileForRow, type DuplicateGroup, type RecordRef } from '@/types'
import { formatNumber } from '@/utils/formatters'
import { statusBadgeVariant } from '@/components/DuplicateTable/columns'
import { useValidationSession } from '@/context/ValidationSessionContext'

export interface DuplicateDetailsProps {
  group: DuplicateGroup
}

const TONE_ICON = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  negative: XCircle,
  neutral: Info,
} as const

const TONE_CLASS = {
  positive: 'text-success',
  warning: 'text-warning',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const

/** "Row 42" for a single uploaded file, or "Row 42 (orders-march.xlsx)" once more than one file is combined into the dataset. */
function RowLabel({ record }: { record: RecordRef }) {
  const { excelDataset } = useValidationSession()
  const sourceFile = excelDataset && excelDataset.sourceFiles.length > 1 ? sourceFileForRow(excelDataset, record.rowIndex) : null
  return (
    <>
      Row {record.excelRowNumber}
      {sourceFile && ` (${sourceFile.fileName})`}
    </>
  )
}

export function DuplicateDetails({ group }: DuplicateDetailsProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-sm text-muted-foreground">{group.id}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant={statusBadgeVariant(group.status)}>{group.status.replace('_', ' ')}</Badge>
          <span className="text-sm text-muted-foreground">{formatNumber(group.records.length)} records</span>
        </div>
        <p className="mt-2 text-sm font-medium">{group.explanation.summary}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Why were these records matched?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5">
            {group.explanation.lines.map((line, i) => {
              const Icon = TONE_ICON[line.tone]
              return (
                <li key={i} className={`flex items-start gap-2 text-sm ${TONE_CLASS[line.tone]}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{line.text}</span>
                </li>
              )
            })}
          </ul>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">SAME Fields</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {group.matchedSameFields.map((field) => (
                <li key={field} className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {field}
                </li>
              ))}
            </ul>
          </div>

          {group.differentUniqueFields.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unique Differences
              </p>
              <ul className="space-y-2">
                {group.uniqueDifferences.map((diff) => (
                  <li key={diff.field} className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {diff.field}
                    </span>
                    <ul className="mt-1 space-y-0.5 pl-5 text-muted-foreground">
                      {diff.values.map((v) => (
                        <li key={v.record.rowIndex}>
                          <RowLabel record={v.record} />: {v.value.display || '(blank)'}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {group.differentOptionalFields.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Optional Differences
              </p>
              <ul className="space-y-2">
                {group.optionalDifferences.map((diff) => (
                  <li key={diff.field} className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {diff.field}
                    </span>
                    <ul className="mt-1 space-y-0.5 pl-5 text-muted-foreground">
                      {diff.values.map((v) => (
                        <li key={v.record.rowIndex}>
                          <RowLabel record={v.record} />: {v.value.display || '(blank)'}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {group.ignoredFields.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">N/A Fields:</span> {group.ignoredFields.length} field
              {group.ignoredFields.length === 1 ? '' : 's'} ignored.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
