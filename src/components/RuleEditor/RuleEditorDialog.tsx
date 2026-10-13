import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RULE_VALUES } from '@/types'
import type { RuleValue, SavedRule } from '@/types'
import { nextSavedRuleId } from '@/utils/id'

export interface RuleEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The saved rule being edited, or null when creating a brand-new one from scratch. */
  initial: SavedRule | null
  onSave: (rule: SavedRule) => void
}

interface EditorRow {
  key: string
  field: string
  rule: RuleValue
}

function rowsFromSaved(saved: SavedRule | null): EditorRow[] {
  if (!saved) return []
  return saved.fields.map((f, i) => ({ key: `initial-${i}`, field: f.field, rule: f.rule }))
}

/**
 * Full create/edit UI for one saved rule: its display name, optional
 * level/Analysis text, and its field-by-field SAME/UNIQUE/OPTIONAL/N-A
 * table - including adding brand-new fields or removing/renaming existing
 * ones. Saving here only ever writes back to the library (via onSave,
 * usually saveRuleToLibrary) - it never touches a RuleDefinition already
 * active in an in-progress validation session.
 */
export function RuleEditorDialog({ open, onOpenChange, initial, onSave }: RuleEditorDialogProps) {
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [rows, setRows] = useState<EditorRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const rowKeyCounter = useRef(0)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setLevel(initial?.metadata?.level ?? '')
    setAnalysis(initial?.metadata?.analysis ?? '')
    setRows(rowsFromSaved(initial))
    setError(null)
  }, [open, initial])

  const updateRow = (key: string, patch: Partial<Pick<EditorRow, 'field' | 'rule'>>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  const addRow = () => {
    rowKeyCounter.current += 1
    setRows((prev) => [...prev, { key: `new-${rowKeyCounter.current}`, field: '', rule: 'SAME' }])
  }

  const handleSave = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Give this rule set a name.')
      return
    }
    if (rows.length === 0) {
      setError('Add at least one field.')
      return
    }
    const trimmedFields = rows.map((r) => ({ field: r.field.trim(), rule: r.rule }))
    if (trimmedFields.some((f) => f.field === '')) {
      setError('Every field needs a name.')
      return
    }
    const seen = new Set<string>()
    const duplicate = trimmedFields.find((f) => {
      if (seen.has(f.field)) return true
      seen.add(f.field)
      return false
    })
    if (duplicate) {
      setError(`"${duplicate.field}" is used more than once - field names must be unique.`)
      return
    }

    const trimmedLevel = level.trim()
    const trimmedAnalysis = analysis.trim()
    const metadata =
      trimmedLevel || trimmedAnalysis
        ? { ...(trimmedLevel ? { level: trimmedLevel } : {}), ...(trimmedAnalysis ? { analysis: trimmedAnalysis } : {}) }
        : undefined

    // Carry over remembered column-mapping choices for fields that survived
    // this edit (by name) unchanged, so editing a rule's fields doesn't
    // silently wipe column choices already remembered for its other fields.
    // A removed or renamed field simply drops out here - a renamed field is
    // a different field going forward, with nothing remembered for it yet.
    const fieldNames = new Set(trimmedFields.map((f) => f.field))
    const prunedColumnMapping = initial?.columnMapping
      ? Object.fromEntries(Object.entries(initial.columnMapping).filter(([field]) => fieldNames.has(field)))
      : undefined
    const columnMapping = prunedColumnMapping && Object.keys(prunedColumnMapping).length > 0 ? prunedColumnMapping : undefined

    const saved: SavedRule = {
      id: initial?.id ?? nextSavedRuleId(),
      name: trimmedName,
      fileName: initial?.fileName ?? `${trimmedName}.json`,
      fields: trimmedFields,
      metadata,
      savedAt: new Date().toISOString(),
      columnMapping,
    }
    onSave(saved)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Rule Set' : 'Create Rule Set'}</DialogTitle>
          <DialogDescription>
            Changes here only affect this saved rule - any validation already in progress keeps using what it
            started with.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Invoice True Duplicate" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-level">Level (optional)</Label>
              <Input id="rule-level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. Invoice_level" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-analysis">Analysis (optional)</Label>
              <Input
                id="rule-analysis"
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                placeholder="e.g. True Duplicate for denial"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fields</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                Add Field
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead className="w-36">Rule</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                        No fields yet - click "Add Field" to start.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <Input
                            value={row.field}
                            onChange={(e) => updateRow(row.key, { field: e.target.value })}
                            placeholder="Excel column / JSON field name"
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={row.rule} onValueChange={(v) => updateRow(row.key, { rule: v as RuleValue })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RULE_VALUES.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(row.key)}
                            aria-label={`Remove ${row.field || 'field'}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
