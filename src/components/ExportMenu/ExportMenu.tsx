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
import { resolveDuplicateTypeLabel } from '@/engine'
import type { Disposition, ExcelDataset, ValidationResult } from '@/types'

export interface ExportMenuProps {
  dataset: ExcelDataset
  result: ValidationResult
  /** This rule's reviewer dispositions (groupId -> Disposition) - written into the file's own "Add Action" column on export, see buildExportWorkbook. */
  dispositions: Map<string, Disposition>
  /** This rule's reviewer comments (groupId -> comment text) - written into the file's own "Add Comments" column on export, see buildExportWorkbook. */
  comments: Map<string, string>
  /** This rule's own Analysis text, used (with ruleFallbackName) to label the combined flagged-records export option - see resolveDuplicateTypeLabel, the same resolution the Results table's Status column, filter checkboxes, and KPI cards/chart already use for this rule. */
  ruleAnalysis: string | undefined
  /** Shown in that label instead when ruleAnalysis doesn't resolve to a known duplicate type - typically the rule's own uploaded file name. */
  ruleFallbackName: string
}

/** All export generation happens with SheetJS in the browser - nothing leaves the machine. */
export function ExportMenu({ dataset, result, dispositions, comments, ruleAnalysis, ruleFallbackName }: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false)
  // Only worth flagging once something has actually been recorded - with
  // nothing set yet, there's nothing that would be lost by exporting.
  const missingAddActionColumn = dispositions.size > 0 && !findAddActionColumn(dataset.headers)
  const missingAddCommentsColumn = comments.size > 0 && !findAddCommentsColumn(dataset.headers)

  // "Duplicate Records" and "Potential Duplicates" used to be two separate,
  // always-present options, split on the engine's raw DUPLICATE/
  // POTENTIAL_DUPLICATE statuses. Collapsed into this one combined option
  // instead, labeled with this rule's own type, for the same reason the
  // Status column/filter checkboxes/KPI cards already collapsed it: every
  // flagged row in this rule's tab already shows one single label on
  // screen, so offering two separate downloads no longer corresponds to
  // anything a reviewer can tell apart in the table.
  const flaggedLabel = resolveDuplicateTypeLabel(ruleAnalysis, ruleFallbackName)
  const options: { kind: ExportKind; label: string; allowCsv: boolean }[] = [
    { kind: 'flagged', label: `${flaggedLabel} Records`, allowCsv: true },
    { kind: 'unique', label: 'Unique Records', allowCsv: true },
    { kind: 'complete', label: 'Complete Validation Report', allowCsv: false },
  ]

  const handleExport = (kind: ExportKind, format: 'xlsx' | 'csv') => {
    setIsExporting(true)
    try {
      const workbook = buildExportWorkbook(dataset, result, kind, dispositions, comments, `${flaggedLabel} Records`)
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
          {options.map((option, index) => (
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
              {index < options.length - 1 && <DropdownMenuSeparator />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
