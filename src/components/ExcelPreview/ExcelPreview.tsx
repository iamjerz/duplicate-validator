import { useValidationSession } from '@/context/ValidationSessionContext'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber } from '@/utils/formatters'
import { sourceFileForRow } from '@/types'

const PREVIEW_ROW_COUNT = 10

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

/**
 * Shows only the first 10 records, per the "don't load the entire dataset
 * into the UI table" requirement. The full dataset stays in memory for the
 * engine to process, but is never rendered as a giant unvirtualized table
 * here - the results screen's DuplicateTable is the one place large row
 * counts get rendered, and it is virtualized.
 */
export function ExcelPreview() {
  const { excelDataset } = useValidationSession()

  if (!excelDataset) return null

  const previewRows = excelDataset.rows.slice(0, PREVIEW_ROW_COUNT)
  const showSourceFile = excelDataset.sourceFiles.length > 1

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Showing {formatNumber(previewRows.length)} of {formatNumber(excelDataset.totalRecords)} records
      </p>
      <div className="max-h-80 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {showSourceFile && <TableHead>Source File</TableHead>}
              {excelDataset.headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((row, rowIdx) => (
              // Keyed by position, not excelRowNumber: once rows come from more
              // than one combined file, two different files can each have their
              // own "row 2", so only the row's index within this preview slice
              // is guaranteed unique here.
              <TableRow key={rowIdx}>
                {showSourceFile && (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {sourceFileForRow(excelDataset, rowIdx)?.fileName ?? ''}
                  </TableCell>
                )}
                {row.map((cell, colIdx) => (
                  <TableCell key={colIdx} className="whitespace-nowrap">
                    {formatCell(cell)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
