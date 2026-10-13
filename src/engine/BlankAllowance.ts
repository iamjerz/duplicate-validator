import type { CellValue, ColumnMappingEntry, ColumnMappingResult, ExcelDataset, RuleDefinition, RuleSet, SavedRule } from '@/types'
import { normalizeValue, isBlank } from './DataNormalizer'
import { deriveRunnableRuleSet, buildColumnIndexByField } from './ColumnMapper'
import { hasRunnableRuleSet } from './RuleValidator'
import { findSavedRuleForDefinition } from './RuleSerialization'

/**
 * True when at least one row is blank in `field`'s mapped column. A field
 * with no mapped column at all is never "blank" by this definition - it has
 * nothing to compare at all, which deriveRunnableRuleSet already handles
 * separately by dropping it to N/A.
 */
export function fieldHasBlankValue(field: string, headers: string[], rows: CellValue[][], mapping: ColumnMappingEntry[]): boolean {
  const columnIndexByField = buildColumnIndexByField(headers, mapping)
  const colIdx = columnIndexByField.get(field)
  if (colIdx === undefined) return false
  return rows.some((row) => isBlank(normalizeValue(row[colIdx] ?? null)))
}

/**
 * Every currently-mapped SAME field that has at least one blank value in
 * this file - the set a field's "Allow blank" checkbox starts pre-checked
 * for when the user hasn't explicitly decided one way or the other yet (see
 * resolveAllowBlankFields). Only looks at `ruleSet.same` - UNIQUE/OPTIONAL
 * fields already tolerate blanks on their own and have nothing to detect
 * here.
 */
export function detectBlankSameFields(ruleSet: RuleSet, headers: string[], rows: CellValue[][], mapping: ColumnMappingEntry[]): Set<string> {
  const detected = new Set<string>()
  for (const field of ruleSet.same) {
    if (fieldHasBlankValue(field, headers, rows, mapping)) detected.add(field)
  }
  return detected
}

/**
 * Resolves, for each SAME field, whether blanks should be tolerated for this
 * run. An explicit override (the user's own checkbox choice, remembered on
 * the saved rule - see useSavedRules.setBlankOverride) always wins, whether
 * it's turning allowance on OR off. A field with no override yet defaults to
 * "allow" exactly when this file currently has a blank in it
 * (detectBlankSameFields) - a pre-checked suggestion the user is always free
 * to override, per field, before running; it is never silently decided for
 * good.
 */
export function resolveAllowBlankFields(
  sameFields: string[],
  blankOverrides: Record<string, boolean> | undefined,
  autoDetected: Set<string>
): string[] {
  return sameFields.filter((field) => {
    const override = blankOverrides?.[field]
    return override !== undefined ? override : autoDetected.has(field)
  })
}

/**
 * Promotes each named field from SAME to UNIQUE: it stops being required to
 * group at all (a blank no longer excludes the record as a Validation
 * Error), but is still fully compared whenever it does have a value - a
 * genuine mismatch (including one record having a value while another is
 * blank) still downgrades an otherwise-confirmed DUPLICATE to
 * POTENTIAL_DUPLICATE rather than being silently ignored (see
 * evaluateUniqueField). A name not actually present in ruleSet.same is
 * ignored rather than erroring, since callers may pass a stale remembered
 * override for a field the rule no longer declares. Returns the same
 * reference when there is nothing to promote, matching deriveRunnableRuleSet's
 * own convention.
 */
export function applyAllowBlankFields(ruleSet: RuleSet, allowBlankFields: string[]): RuleSet {
  const toPromote = allowBlankFields.filter((f) => ruleSet.same.includes(f))
  if (toPromote.length === 0) return ruleSet

  const promoted = new Set(toPromote)
  const same = ruleSet.same.filter((f) => !promoted.has(f))
  const unique = [...ruleSet.unique, ...toPromote]
  const fields = ruleSet.fields.map((f) => (promoted.has(f.field) ? { field: f.field, rule: 'UNIQUE' as const } : f))
  const byField = new Map(ruleSet.byField)
  for (const field of toPromote) byField.set(field, 'UNIQUE')

  return { fields, byField, same, unique, optional: ruleSet.optional, ignored: ruleSet.ignored }
}

/**
 * The single, fully-effective ruleset for actually running duplicate
 * detection (or checking readiness) for one rule definition: first drop any
 * field with no mapped column at all (deriveRunnableRuleSet), then promote
 * whichever SAME fields should tolerate blanks for this run (see
 * resolveAllowBlankFields) from SAME to UNIQUE. Every place that needs to
 * know what will ACTUALLY be compared - Start Validation's readiness check,
 * the Column Mapping panel's warning banner, and the validation run itself -
 * goes through this one function so they can never silently disagree with
 * each other about what "ready"/"effective" means (two independently-evolving
 * copies of this logic is exactly what caused the stale-readiness bugs this
 * app already fixed once - see RuleInterpretationGuide/MissingColumnsWarning
 * history).
 */
export function deriveEffectiveRuleSet(
  ruleSet: RuleSet,
  mapping: ColumnMappingResult,
  headers: string[],
  rows: CellValue[][],
  blankOverrides: Record<string, boolean> | undefined
): RuleSet {
  const mapped = deriveRunnableRuleSet(ruleSet, mapping)
  const autoDetected = detectBlankSameFields(mapped, headers, rows, mapping.entries)
  const allowBlankFields = resolveAllowBlankFields(mapped.same, blankOverrides, autoDetected)
  return applyAllowBlankFields(mapped, allowBlankFields)
}

/** Whether one rule definition can actually run, under its own fully-effective ruleset (mapping + blank-allowance both applied). */
export function isRuleDefinitionRunnable(
  ruleSet: RuleSet,
  mapping: ColumnMappingResult,
  headers: string[],
  rows: CellValue[][],
  blankOverrides: Record<string, boolean> | undefined
): boolean {
  return hasRunnableRuleSet(deriveEffectiveRuleSet(ruleSet, mapping, headers, rows, blankOverrides))
}

/**
 * The single "is this rule ready to run" check - shared by the Start
 * Validation button and every other place in the UI that needs to say the
 * same thing (the readiness checklist, the missing-columns warning), so they
 * can never drift out of sync with each other the way a duplicated inline
 * check would. Each definition's blank-allowance overrides are looked up
 * from its matching saved-rules library entry (every active rule has one -
 * see ValidationSessionContext), the same way remembered column mappings
 * already are.
 */
export function allRuleDefinitionsRunnable(
  ruleDefinitions: RuleDefinition[],
  mapping: ColumnMappingResult | null,
  excelDataset: ExcelDataset | null,
  savedRules: SavedRule[]
): boolean {
  if (ruleDefinitions.length === 0 || mapping === null) return false
  const headers = excelDataset?.headers ?? []
  const rows = excelDataset?.rows ?? []
  return ruleDefinitions.every((def) => {
    const blankOverrides = findSavedRuleForDefinition(def, savedRules)?.blankOverrides
    return isRuleDefinitionRunnable(def.ruleSet, mapping, headers, rows, blankOverrides)
  })
}
