import { AlertTriangle } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { sourceFileForRow, type ValidationErrorEntry } from '@/types'
import { formatNumber } from '@/utils/formatters'
import { useValidationSession } from '@/context/ValidationSessionContext'

export interface ValidationErrorsListProps {
  errors: ValidationErrorEntry[]
}

export function ValidationErrorsList({ errors }: ValidationErrorsListProps) {
  const { excelDataset } = useValidationSession()
  const showSourceFile = (excelDataset?.sourceFiles.length ?? 0) > 1

  if (errors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No validation errors. Every required SAME field was present for every record.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        {formatNumber(errors.length)} record field{errors.length === 1 ? '' : 's'} could not be compared.
      </p>
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Excel Row</TableHead>
              {showSourceFile && <TableHead>Source File</TableHead>}
              <TableHead>Field</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((error, i) => (
              <TableRow key={`${error.record.rowIndex}-${error.field}-${i}`}>
                <TableCell>{error.record.excelRowNumber}</TableCell>
                {showSourceFile && (
                  <TableCell className="text-muted-foreground">
                    {(excelDataset && sourceFileForRow(excelDataset, error.record.rowIndex)?.fileName) ?? ''}
                  </TableCell>
                )}
                <TableCell>{error.field}</TableCell>
                <TableCell className="text-muted-foreground">{error.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
