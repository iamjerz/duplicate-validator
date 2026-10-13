import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { UploadCloud, CheckCircle2, AlertCircle, Info, Loader2, FileJson, FolderOpen, X } from 'lucide-react'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { LoadFromLibraryDialog } from './LoadFromLibraryDialog'

export function RuleUploader() {
  const { ruleDefinitions, ruleFileIssues, isReadingRules, addRulesFiles, removeRuleDefinition, restoredRuleCount } =
    useValidationSession()
  const [isDragging, setIsDragging] = useState(false)
  const [restoredNoticeDismissed, setRestoredNoticeDismissed] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Still gated on ruleDefinitions.length > 0 - if the user removed every
  // restored rule before dismissing, there's nothing left to reference.
  const showRestoredNotice = restoredRuleCount > 0 && !restoredNoticeDismissed && ruleDefinitions.length > 0

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) void addRulesFiles(Array.from(files))
    },
    [addRulesFiles]
  )

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (isReadingRules) return
      handleFiles(event.dataTransfer.files)
    },
    [handleFiles, isReadingRules]
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (isReadingRules) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        inputRef.current?.click()
      }
    },
    [isReadingRules]
  )

  return (
    <div className="space-y-3">
      {showRestoredNotice && (
        <Alert className="relative pr-10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Restored {restoredRuleCount === 1 ? 'the rule' : `${restoredRuleCount} rules`} you last used, from your
            saved library.
          </AlertDescription>
          <button
            type="button"
            onClick={() => setRestoredNoticeDismissed(true)}
            aria-label="Dismiss"
            className="absolute right-3 top-3 text-foreground/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLibraryOpen(true)}>
          <FolderOpen className="h-3.5 w-3.5" />
          Load from Library
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!isReadingRules) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!isReadingRules) inputRef.current?.click()
        }}
        role="button"
        tabIndex={isReadingRules ? -1 : 0}
        aria-disabled={isReadingRules}
        onKeyDown={onKeyDown}
        aria-label="Upload validation rules JSON file"
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isReadingRules ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          multiple
          disabled={isReadingRules}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {isReadingRules ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">Upload Validation Rules</p>
          <p className="text-sm text-muted-foreground">
            Upload one or more JSON rule files. Multiple rules are allowed as long as they all use the same
            &quot;level&quot; - each one is checked separately.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">.json supported</p>
      </div>

      {ruleFileIssues.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{ruleFileIssues.length > 1 ? 'Some rule files were not added' : 'Rule file not added'}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {ruleFileIssues.map((issue, i) => (
                <li key={`${issue.fileName}-${i}`}>
                  <span className="font-medium">{issue.fileName}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {ruleDefinitions.length > 0 && (
        <ul className="space-y-2">
          {ruleDefinitions.map((def) => (
            <li key={def.id} className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm">
              <FileJson className="h-4 w-4 shrink-0 text-success" />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <span className="truncate font-medium text-success">{def.fileName}</span>
                <span className="truncate text-muted-foreground">
                  - {def.totalFields} rules{def.metadata?.analysis ? ` - ${def.metadata.analysis}` : ''}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRuleDefinition(def.id)}
                aria-label={`Remove ${def.fileName}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LoadFromLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
    </div>
  )
}
