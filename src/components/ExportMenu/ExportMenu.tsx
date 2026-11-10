import { useState } from 'react'
import { Download, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  buildExportWorkbook,
  exportFileBaseName,
  downloadWorkbookAsXlsx,
  findAddActionColumn,
  findAddCommentsColumn,
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

/**
 * Exports the Complete Validation Report only - every original record,
 * unfiltered, under the file's own original sheet name (see
 * buildExportWorkbook's 'complete' kind). This used to be a dropdown
 * offering several filtered subsets alongside this one (a combined True/
 * Potential Duplicate option, Unique Records - and, before that, separate
 * Duplicate/Potential Duplicate options); narrowed down to just this single,
 * always-available report, so one click is all that's needed - no menu to
 * open first. The narrower 'flagged'/'unique'/'duplicates'/
 * 'potential-duplicates' export kinds still exist in buildExportWorkbook and
 * remain fully tested - only this menu stopped surfacing them, the same way
 * it had already stopped surfacing 'duplicates'/'potential-duplicates'
 * before this change.
 *
 * All export generation happens with SheetJS in the browser - nothing
 * leaves the machine.
 */
export function ExportMenu({ dataset, result, dispositions, comments }: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false)
  // Only worth flagging once something has actually been recorded - with
  // nothing set yet, there's nothing that would be lost by exporting.
  const missingAddActionColumn = dispositions.size > 0 && !findAddActionColumn(dataset.headers)
  const missingAddCommentsColumn = comments.size > 0 && !findAddCommentsColumn(dataset.headers)

  const handleExport = () => {
    setIsExporting(true)
    try {
      const workbook = buildExportWorkbook(dataset, result, 'complete', dispositions, comments)
      downloadWorkbookAsXlsx(workbook, exportFileBaseName(dataset))
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
      <Button variant="default" className="gap-1.5" disabled={isExporting} onClick={handleExport}>
        <Download className="h-4 w-4" />
        Export Complete Validation Report
      </Button>
    </div>
  )
}
