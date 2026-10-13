import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RuleEditorDialog } from '@/components/RuleEditor'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { readRulesXlsx } from '@/services/rules'
import { cn } from '@/utils/cn'
import { nextSavedRuleId } from '@/utils/id'
import type { SavedRule } from '@/types'

function ruleNameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

/**
 * A dedicated page for converting a rules SPREADSHEET into a saved rule -
 * separate from the Rules Library's own JSON upload and manual "Create New",
 * since authoring a rule in Excel is a distinct workflow from either of
 * those. Uploading and converting never saves anything by itself: a
 * successful conversion opens the same RuleEditorDialog used everywhere else
 * in the app, pre-filled with the parsed fields, so the user names the rule
 * and can add an optional Level/Analysis (neither of which is read from the
 * spreadsheet itself - see readRulesXlsx) before anything is actually saved
 * to the library.
 */
export function RuleImport() {
  const navigate = useNavigate()
  const { saveRuleToLibrary } = useValidationSession()
  const [isReading, setIsReading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState<SavedRule | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setErrors([])
    setIsReading(true)
    try {
      const result = await readRulesXlsx(file)
      if (!result.success || !result.ruleSet) {
        const messages = result.errors.map((e) => e.message).filter(Boolean)
        setErrors(messages.length > 0 ? messages : ['This file could not be validated.'])
        return
      }
      setPending({
        id: nextSavedRuleId(),
        name: ruleNameFromFileName(file.name),
        fileName: file.name,
        fields: result.ruleSet.fields,
        metadata: result.metadata,
        savedAt: new Date().toISOString(),
      })
      setEditorOpen(true)
    } finally {
      setIsReading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void handleFile(file)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (isReading) return
    handleFiles(event.dataTransfer.files)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isReading) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      inputRef.current?.click()
    }
  }

  const handleSave = (rule: SavedRule) => {
    saveRuleToLibrary(rule)
    setEditorOpen(false)
    setPending(null)
    navigate('/rules')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" asChild>
          <Link to="/rules">
            <ArrowLeft className="h-4 w-4" />
            Back to Rules Library
          </Link>
        </Button>
        <h1 className="mt-2 text-xl font-semibold">Import Rule from Excel</h1>
        <p className="text-sm text-muted-foreground">
          Upload a spreadsheet with a header row and two columns - a field name (e.g. &quot;Field Name&quot;) and a
          rule value (e.g. &quot;Rule&quot;) of SAME, UNIQUE, OPTIONAL, or N/A for each field. Column headers are
          matched flexibly. You&apos;ll get to name the rule and add an optional Level/Analysis before anything is
          saved.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!isReading) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!isReading) inputRef.current?.click()
        }}
        role="button"
        tabIndex={isReading ? -1 : 0}
        aria-disabled={isReading}
        onKeyDown={onKeyDown}
        aria-label="Upload a rules spreadsheet"
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isReading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          disabled={isReading}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {isReading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">Upload a Rules Spreadsheet</p>
          <p className="text-sm text-muted-foreground">Drag and drop, or click to browse.</p>
        </div>
        <p className="text-xs text-muted-foreground">.xlsx supported</p>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>This spreadsheet could not be converted</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {errors.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <RuleEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setPending(null)
        }}
        initial={pending}
        onSave={handleSave}
      />
    </div>
  )
}
