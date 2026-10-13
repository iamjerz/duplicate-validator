import { useState } from 'react'
import { ChevronDown, Download, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildExportWorkbook,
  exportFileBaseName,
  downloadWorkbookAsXlsx,
  downloadWorkbookAsCsv,
  findAddActionColumn,
  findAddCommentsColumn,
  type ExportKind,
} from '@/services/export'
import type { Disposition, ExcelDataset, ValidationResult } from '@/types'

export interface ExportMenuProps {
  dataset: ExcelDataset
  result: ValidationResult
  /** This rule's reviewer dispositions (groupId -> Disposition) - written into the file's own "Add Action" column on export, see buildExportWorkbook. */
  dispositions: Map<string, Disposition>
  /** This rule's reviewer comments (groupId -> comment text) - written into the file's own "Add Comments" column on export, see buildExportWorkbook. */
  comments: Map<string, string>
}

const OPTIONS: { kind: ExportKind; label: string; allowCsv: boolean }[] = [
  { kind: 'duplicates', label: 'Duplicate Records', allowCsv: true },
  { kind: 'potential-duplicates', label: 'Potential Duplicates', allowCsv: true },
  { kind: 'unique', label: 'Unique Records', allowCsv: true },
  { kind: 'complete', label: 'Complete Validation Report', allowCsv: false },
]

/** All export generation happens with SheetJS in the browser - nothing leaves the machine. */
export function ExportMenu({ dataset, result, dispositions, comments }: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false)
  // Only worth flagging once something has actually been recorded - with
  // nothing set yet, there's nothing that would be lost by exporting.
  const missingAddActionColumn = dispositions.size > 0 && !findAddActionColumn(dataset.headers)
  const missingAddCommentsColumn = comments.size > 0 && !findAddCommentsColumn(dataset.headers)

  const handleExport = (kind: ExportKind, format: 'xlsx' | 'csv') => {
    setIsExporting(true)
    try {
      const workbook = buildExportWorkbook(dataset, result, kind, dispositions, comments)
      const fileName = exportFileBaseName(dataset)
      if (format === 'xlsx') downloadWorkbookAsXlsx(workbook, fileName)
      else downloadWorkbookAsCsv(workbook, fileName)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {missingAddActionColumn && (
        <span
          className="flex items-center gap-1.5 text-sm text-warning"
          title='This file has no "Add Action" column, so recorded Dispositions have nowhere to go and will not appear in the export.'
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No &quot;Add Action&quot; column - Dispositions won&apos;t export
        </span>
      )}
      {missingAddCommentsColumn && (
        <span
          className="flex items-center gap-1.5 text-sm text-warning"
          title='This file has no "Add Comments" column, so recorded Comments have nowhere to go and will not appear in the export.'
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No &quot;Add Comments&quot; column - Comments won&apos;t export
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" className="gap-1.5" disabled={isExporting}>
            <Download className="h-4 w-4" />
            Export Results
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {OPTIONS.map((option, index) => (
            <div key={option.kind}>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{option.label}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => handleExport(option.kind, 'xlsx')}>
                Download as Excel (.xlsx)
              </DropdownMenuItem>
              {option.allowCsv && (
                <DropdownMenuItem onSelect={() => handleExport(option.kind, 'csv')}>
                  Download as CSV (.csv)
                </DropdownMenuItem>
              )}
              {index < OPTIONS.length - 1 && <DropdownMenuSeparator />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
