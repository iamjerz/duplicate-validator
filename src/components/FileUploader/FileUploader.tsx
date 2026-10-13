import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { formatFileSize, formatNumber } from '@/utils/formatters'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/utils/cn'
import type { ExcelFileEntry } from '@/context/ValidationSessionContext'

function FileCard({
  entry,
  onRemove,
  onSelectSheet,
}: {
  entry: ExcelFileEntry
  onRemove: (id: string) => void
  onSelectSheet: (id: string, sheetName: string) => void
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{entry.file.name}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(entry.id)}
          aria-label={`Remove ${entry.file.name}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">File size</dt>
          <dd className="font-medium">{formatFileSize(entry.file.size)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sheets</dt>
          <dd className="font-medium">{entry.meta.sheetNames.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Records</dt>
          <dd className="font-medium">{formatNumber(entry.data?.rows.length ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Columns</dt>
          <dd className="font-medium">{formatNumber(entry.data?.headers.length ?? 0)}</dd>
        </div>
      </dl>

      {entry.meta.sheetNames.length > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Worksheet</span>
          <Select value={entry.sheetName} onValueChange={(value) => onSelectSheet(entry.id, value)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entry.meta.sheetNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {entry.issues.length > 0 && (
        <div className="mt-3 space-y-2">
          {entry.issues.map((issue) => (
            <Alert key={issue.code} variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{issue.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileUploader() {
  const { excelFiles, excelDataset, isReadingExcel, excelFileIssues, loadExcelFiles, removeExcelFile, selectSheetForFile } =
    useValidationSession()

  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) void loadExcelFiles(Array.from(files))
    },
    [loadExcelFiles]
  )

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      handleFiles(event.dataTransfer.files)
    },
    [handleFiles]
  )

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      inputRef.current?.click()
    }
  }, [])

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Upload Excel files"
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {isReadingExcel ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">Upload Excel Files</p>
          <p className="text-sm text-muted-foreground">Drag &amp; drop your files here, or click to browse</p>
        </div>
        <p className="text-xs text-muted-foreground">
          .xlsx and .xls supported - upload more than one to combine them (their columns must match exactly)
        </p>
      </div>

      {excelFileIssues.map((issue, index) => (
        <Alert key={`${issue.fileName}-${index}`} variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{issue.fileName}</AlertTitle>
          <AlertDescription>{issue.message}</AlertDescription>
        </Alert>
      ))}

      {excelFiles.map((entry) => (
        <FileCard key={entry.id} entry={entry} onRemove={removeExcelFile} onSelectSheet={selectSheetForFile} />
      ))}

      {excelDataset && excelFiles.length > 1 && !isReadingExcel && (
        <p className="text-sm text-muted-foreground">
          Combined: {formatNumber(excelDataset.totalRecords)} records across {excelFiles.length} files, {formatNumber(excelDataset.totalColumns)}{' '}
          columns.
        </p>
      )}
    </div>
  )
}
