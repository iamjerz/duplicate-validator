import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  detectBlankSameFields,
  resolveAllowBlankFields,
  isRuleDefinitionRunnable,
  findSavedRuleForDefinition,
} from '@/engine'
import type { ColumnMappingEntry, ColumnMappingResult, ExcelDataset, RuleDefinition, SavedRule } from '@/types'

const UNMAPPED_VALUE = '__unmapped__'

/** What to render (if anything) for a SAME field's "Allow blank" checkbox - null for a non-SAME field, which has nothing to show here. */
interface AllowBlankState {
  checked: boolean
  /** True when `checked` comes from this file's own auto-detected blanks rather than an explicit user choice - shown as a small hint so the suggestion is never silent. */
  isAutoSuggested: boolean
  onToggle: (checked: boolean) => void
}

function ColumnSelect({
  entry,
  headers,
  onChange,
}: {
  entry: ColumnMappingEntry
  headers: string[]
  onChange: (field: string, column: string | null) => void
}) {
  return (
    <Select
      value={entry.excelColumn ?? UNMAPPED_VALUE}
      onValueChange={(value) => onChange(entry.jsonField, value === UNMAPPED_VALUE ? null : value)}
    >
      <SelectTrigger className="h-8 w-64 text-sm">
        <SelectValue placeholder="Select column" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNMAPPED_VALUE}>Not mapped</SelectItem>
        {headers.map((header) => (
          <SelectItem key={header} value={header}>
            {header}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AllowBlankToggle({ state }: { state: AllowBlankState }) {
  return (
    <label className="flex flex-wrap items-center gap-1.5 pt-0.5 text-sm">
      <Checkbox checked={state.checked} onCheckedChange={(checked) => state.onToggle(checked === true)} />
      Allow blank
      {state.isAutoSuggested && <span className="text-xs text-muted-foreground">(blank detected in this file - override anytime)</span>}
    </label>
  )
}

function MappingEntryRow({
  entry,
  headers,
  onSetColumn,
  onAcceptSuggestion,
  allowBlank,
}: {
  entry: ColumnMappingEntry
  headers: string[]
  onSetColumn: (field: string, column: string | null) => void
  onAcceptSuggestion: (field: string) => void
  allowBlank: AllowBlankState | null
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr] items-start gap-x-4 gap-y-1 px-3 py-3">
      <div className="pt-1.5 text-sm font-medium">{entry.jsonField}</div>
      <div className="flex flex-col gap-1.5">
        {entry.confidence === 'exact' && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Found - {entry.excelColumn}
          </span>
        )}

        {entry.confidence === 'manual' && (
          <>
            <span className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {entry.excelColumn}
            </span>
            <ColumnSelect entry={entry} headers={headers} onChange={onSetColumn} />
          </>
        )}

        {entry.confidence === 'suggested' && entry.suggestion && (
          <>
            <span className="flex items-center gap-1.5 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Possible match: {entry.suggestion}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onAcceptSuggestion(entry.jsonField)}>
                Use Suggested Match
              </Button>
            </div>
            <ColumnSelect entry={entry} headers={headers} onChange={onSetColumn} />
          </>
        )}

        {entry.confidence === 'none' && (
          <>
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Not found
            </span>
            <ColumnSelect entry={entry} headers={headers} onChange={onSetColumn} />
          </>
        )}

        {allowBlank && <AllowBlankToggle state={allowBlank} />}
      </div>
    </div>
  )
}

function MappingTable({
  entries,
  headers,
  onSetColumn,
  onAcceptSuggestion,
  allowBlankFor,
}: {
  entries: ColumnMappingEntry[]
  headers: string[]
  onSetColumn: (field: string, column: string | null) => void
  onAcceptSuggestion: (field: string) => void
  allowBlankFor: (field: string) => AllowBlankState | null
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr] gap-x-4 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>JSON Field</span>
        <span>Excel Column</span>
      </div>
      <div className="divide-y rounded-lg border">
        {entries.map((entry) => (
          <MappingEntryRow
            key={entry.jsonField}
            entry={entry}
            headers={headers}
            onSetColumn={onSetColumn}
            onAcceptSuggestion={onAcceptSuggestion}
            allowBlank={allowBlankFor(entry.jsonField)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * `blocking` is true only when the missing fields listed would leave the
 * rule with zero mapped SAME fields (grouping would be impossible, so Start
 * Validation stays disabled for it) - anything less than that is fine, the
 * fields just get excluded from this run rather than compared.
 */
function MissingColumnsWarning({ fields, blocking }: { fields: string[]; blocking: boolean }) {
  if (fields.length === 0) return null
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
      <p className="font-medium">Unmapped fields</p>
      <p className="mt-1 text-foreground/80">
        No column was found for these fields.{' '}
        {blocking
          ? "This rule has no SAME field left to group on, so it can't run until at least one is mapped:"
          : "They'll just be excluded from this run (treated as N/A) instead of being compared:"}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/80">
        {fields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    </div>
  )
}

/** This rule's own required (SAME/UNIQUE) fields that still have no mapped Excel column. */
function missingForRule(def: RuleDefinition, mapping: ColumnMappingResult): string[] {
  const required = new Set<string>([...def.ruleSet.same, ...def.ruleSet.unique])
  return def.ruleSet.fields
    .map((f) => f.field)
    .filter((field) => required.has(field) && !mapping.entryByField.get(field)?.excelColumn)
}

/** True when this rule would have zero mapped, still-required SAME fields left - i.e. it truly cannot run, not just partially mapped or blank-tolerant. */
function isBlockedByMissingColumns(
  def: RuleDefinition,
  mapping: ColumnMappingResult,
  excelDataset: ExcelDataset,
  savedRules: SavedRule[]
): boolean {
  const blankOverrides = findSavedRuleForDefinition(def, savedRules)?.blankOverrides
  return !isRuleDefinitionRunnable(def.ruleSet, mapping, excelDataset.headers, excelDataset.rows, blankOverrides)
}

/** This rule's fields, in the order they appeared in its own JSON file, resolved to their (shared) mapping entries. */
function entriesForRule(def: RuleDefinition, mapping: ColumnMappingResult): ColumnMappingEntry[] {
  return def.ruleSet.fields
    .map((f) => mapping.entryByField.get(f.field))
    .filter((entry): entry is ColumnMappingEntry => Boolean(entry))
}

/**
 * Builds the `allowBlankFor` lookup used by one rule's MappingTable: only a
 * SAME field gets a checkbox at all (UNIQUE/OPTIONAL already tolerate blanks
 * on their own, and N/A fields aren't compared). A field's checked state
 * resolves through the exact same function (resolveAllowBlankFields) the
 * actual validation run uses, so the checkbox can never show something
 * different from what Start Validation will actually do with it. A plain
 * function, not a hook - it does no state/effect work of its own, just
 * closes over the data needed to answer "what should this field's checkbox
 * show", so it's safe to call once per rule inside a map() below.
 */
function buildAllowBlankLookup(
  def: RuleDefinition,
  excelDataset: ExcelDataset,
  mapping: ColumnMappingResult,
  savedRules: SavedRule[],
  setBlankOverride: (def: RuleDefinition, field: string, allow: boolean | undefined) => void
): (field: string) => AllowBlankState | null {
  const sameFields = new Set(def.ruleSet.same)
  const blankOverrides = findSavedRuleForDefinition(def, savedRules)?.blankOverrides
  const autoDetected = detectBlankSameFields(def.ruleSet, excelDataset.headers, excelDataset.rows, mapping.entries)
  const resolved = new Set(resolveAllowBlankFields(def.ruleSet.same, blankOverrides, autoDetected))

  return (field: string) => {
    if (!sameFields.has(field)) return null
    return {
      checked: resolved.has(field),
      isAutoSuggested: blankOverrides?.[field] === undefined && autoDetected.has(field),
      onToggle: (checked: boolean) => setBlankOverride(def, field, checked),
    }
  }
}

/**
 * Column mapping is unified under the hood - a JSON field name maps to the
 * same Excel column no matter which rule references it, so confirming or
 * changing a mapping in one rule's section immediately applies everywhere
 * else that field is used too. But when more than one rule is loaded, the
 * DISPLAY is grouped per rule rather than one combined list, so each rule
 * shows only its own fields, its own field order, and its own "missing
 * columns" warning - never mixed together with another rule's fields.
 *
 * Column mapping is never automatic-and-silent: an exact header match is
 * confirmed outright ("Found"), but anything else - a fuzzy suggestion or
 * no match at all - requires the user to explicitly confirm or pick a
 * column before it counts as mapped. A SAME field's "Allow blank" checkbox
 * follows the same philosophy at one remove: a blank detected in the
 * current file starts it pre-checked as a suggestion, but it's always
 * visible and always overridable, never a silent decision (see
 * buildAllowBlankLookup / BlankAllowance.ts).
 */
export function ColumnMappingPanel() {
  const { ruleDefinitions, excelDataset, mapping, savedRules, setMappingColumn, acceptMappingSuggestion, setBlankOverride } =
    useValidationSession()

  if (ruleDefinitions.length === 0 || !excelDataset || !mapping) return null

  if (ruleDefinitions.length === 1) {
    const def = ruleDefinitions[0]
    return (
      <div className="space-y-3">
        <MappingTable
          entries={mapping.entries}
          headers={excelDataset.headers}
          onSetColumn={setMappingColumn}
          onAcceptSuggestion={acceptMappingSuggestion}
          allowBlankFor={buildAllowBlankLookup(def, excelDataset, mapping, savedRules, setBlankOverride)}
        />
        <MissingColumnsWarning
          fields={mapping.missingRequired}
          blocking={isBlockedByMissingColumns(def, mapping, excelDataset, savedRules)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {ruleDefinitions.map((def) => (
        <div key={def.id} className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{def.metadata?.analysis ?? def.fileName}</p>
            {def.metadata?.analysis && <p className="text-xs text-muted-foreground">{def.fileName}</p>}
          </div>
          <MappingTable
            entries={entriesForRule(def, mapping)}
            headers={excelDataset.headers}
            onSetColumn={setMappingColumn}
            onAcceptSuggestion={acceptMappingSuggestion}
            allowBlankFor={buildAllowBlankLookup(def, excelDataset, mapping, savedRules, setBlankOverride)}
          />
          <MissingColumnsWarning
            fields={missingForRule(def, mapping)}
            blocking={isBlockedByMissingColumns(def, mapping, excelDataset, savedRules)}
          />
        </div>
      ))}
    </div>
  )
}
