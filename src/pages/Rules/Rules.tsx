import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  BookMarked,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RuleEditorDialog } from '@/components/RuleEditor'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { readRulesFile, downloadRuleAsJson, downloadRuleAsXlsx } from '@/services/rules'
import { countRuleFields } from '@/types'
import type { RuleDefinition, RuleFileIssue, SavedRule } from '@/types'

const NO_LEVEL_GROUP = 'No level set'

function groupByLevel(rules: SavedRule[]): [string, SavedRule[]][] {
  const groups = new Map<string, SavedRule[]>()
  for (const rule of rules) {
    const key = rule.metadata?.level?.trim() || NO_LEVEL_GROUP
    const list = groups.get(key) ?? []
    list.push(rule)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === NO_LEVEL_GROUP) return 1
    if (b === NO_LEVEL_GROUP) return -1
    return a.localeCompare(b)
  })
}

export function Rules() {
  const navigate = useNavigate()
  const { savedRules, saveRuleToLibrary, saveRuleFromDefinition, deleteSavedRule, loadSavedRules } = useValidationSession()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SavedRule | null>(null)
  const [uploadIssues, setUploadIssues] = useState<RuleFileIssue[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const grouped = useMemo(() => groupByLevel(savedRules), [savedRules])

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const openEdit = (rule: SavedRule) => {
    setEditing(rule)
    setEditorOpen(true)
  }

  const handleUseInNewValidation = (rule: SavedRule) => {
    setLoadError(null)
    const issues = loadSavedRules([rule])
    if (issues.length > 0) {
      setLoadError(issues.map((i) => i.message).join(' '))
      return
    }
    navigate('/new')
  }

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    const issues: RuleFileIssue[] = []
    for (const file of Array.from(files)) {
      const result = await readRulesFile(file)
      if (!result.success || !result.ruleSet) {
        issues.push({
          fileName: file.name,
          message: result.errors.map((e) => e.message).join(' ') || 'This rule file could not be validated.',
        })
        continue
      }
      // Routed through the same dedup-aware save used by New Validation's
      // uploader (matches by fileName + fields content) rather than
      // saveRuleToLibrary's upsert-by-id, which would insert a fresh
      // duplicate entry every time the same file is uploaded here.
      const fauxDefinition: RuleDefinition = {
        id: 'unused',
        fileName: file.name,
        ruleSet: result.ruleSet,
        metadata: result.metadata,
        totalFields: result.ruleSet.fields.length,
      }
      saveRuleFromDefinition(fauxDefinition)
    }
    setUploadIssues(issues)
    setIsUploading(false)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rules Library</h1>
          <p className="text-sm text-muted-foreground">
            Rule files you've used are saved here automatically. Edit them, or load them straight into a new
            validation - no need to re-upload the same file.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            multiple
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              void handleUploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button variant="outline" className="gap-1.5" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="h-4 w-4" />
            Upload Rule File
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => navigate('/rules/import')}>
            <FileSpreadsheet className="h-4 w-4" />
            Import from Excel
          </Button>
          <Button className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create New
          </Button>
        </div>
      </div>

      {uploadIssues.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {uploadIssues.map((issue, i) => (
                <li key={`${issue.fileName}-${i}`}>
                  <span className="font-medium">{issue.fileName}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {savedRules.length === 0 ? (
        <div className="py-16 text-center">
          <BookMarked className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium">No saved rules yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a rule file above, import one from an Excel spreadsheet, create one from scratch, or upload one
            during New Validation - it'll show up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([level, rules]) => (
            <div key={level} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{level}</p>
              <div className="space-y-2">
                {rules.map((rule) => {
                  const counts = countRuleFields(rule.fields)
                  return (
                    <Card key={rule.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{rule.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {rule.fileName} - saved {new Date(rule.savedAt).toLocaleString()}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge variant="outline">{counts.same} SAME</Badge>
                            <Badge variant="outline">{counts.unique} UNIQUE</Badge>
                            <Badge variant="outline">{counts.optional} OPTIONAL</Badge>
                            <Badge variant="outline">{counts.ignored} N/A</Badge>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleUseInNewValidation(rule)}>
                            <FolderOpen className="h-3.5 w-3.5" />
                            Use in New Validation
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5" aria-label={`Export ${rule.name}`}>
                                <Download className="h-3.5 w-3.5" />
                                Export
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => downloadRuleAsJson(rule)}>
                                Download as JSON (.json)
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => downloadRuleAsXlsx(rule)}>
                                Download as Excel (.xlsx)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)} aria-label={`Edit ${rule.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteSavedRule(rule.id)}
                            aria-label={`Delete ${rule.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <RuleEditorDialog open={editorOpen} onOpenChange={setEditorOpen} initial={editing} onSave={saveRuleToLibrary} />
    </div>
  )
}
