import type { ColumnMappingEntry, ColumnMappingResult, RuleDefinition, RuleSet, SavedRule } from '@/types'
import { findBestColumnMatch, normalizeHeaderKey } from '@/utils/fieldMatching'
import { findSavedRuleForDefinition } from './RuleSerialization'

/**
 * Compares the JSON rule field names against the Excel header row and
 * produces a mapping suggestion for each field:
 *  - "exact": the field name matches a column exactly (or matches once case,
 *    spacing and punctuation are ignored) - auto-confirmed as "Found".
 *  - "suggested": a close-but-not-exact match exists. The user must click
 *    "Use Suggested Match" before it takes effect - columns are never
 *    silently mapped.
 *  - "none": no reasonable match was found. The user must pick a column
 *    manually, or leave it unmapped if the field isn't required.
 */
/**
 * Every function below accepts either a single RuleSet (the original,
 * one-rule-file shape) or an array of them (when multiple rule files are
 * loaded at once, all at the same "level"). Passing an array unions the
 * field lists across every rule set - a field only needs to be mapped once
 * even if it appears in several rules - and a field counts as "required"
 * (SAME/UNIQUE) if ANY of the rule sets requires it, since every rule still
 * runs its own, separate duplicate-detection pass against the same mapping.
 */
function toRuleSetArray(ruleSets: RuleSet | RuleSet[]): RuleSet[] {
  return Array.isArray(ruleSets) ? ruleSets : [ruleSets]
}

/**
 * Builds a normalized-header -> original-header lookup (first occurrence
 * wins for a given normalized key) - shared by buildColumnMapping's own
 * auto-matching and applyRememberedColumnMappings' remembered-column lookup,
 * so both treat "the same column" the same case/spacing/punctuation
 * -insensitive way rather than silently disagreeing with each other.
 */
function buildHeaderByNormalized(excelHeaders: string[]): Map<string, string> {
  const headerByNormalized = new Map<string, string>()
  for (const header of excelHeaders) {
    const key = normalizeHeaderKey(header)
    if (!headerByNormalized.has(key)) headerByNormalized.set(key, header)
  }
  return headerByNormalized
}

export function buildColumnMapping(ruleSets: RuleSet | RuleSet[], excelHeaders: string[]): ColumnMappingResult {
  const list = toRuleSetArray(ruleSets)

  const headerByNormalized = buildHeaderByNormalized(excelHeaders)

  const fieldOrder: string[] = []
  const seenFields = new Set<string>()
  for (const ruleSet of list) {
    for (const { field } of ruleSet.fields) {
      if (seenFields.has(field)) continue
      seenFields.add(field)
      fieldOrder.push(field)
    }
  }

  const entries: ColumnMappingEntry[] = fieldOrder.map((field) => {
    if (excelHeaders.includes(field)) {
      return { jsonField: field, excelColumn: field, confidence: 'exact' }
    }

    const normalizedMatch = headerByNormalized.get(normalizeHeaderKey(field))
    if (normalizedMatch) {
      return { jsonField: field, excelColumn: normalizedMatch, confidence: 'exact' }
    }

    const suggestion = findBestColumnMatch(field, excelHeaders)
    if (suggestion) {
      return { jsonField: field, excelColumn: null, confidence: 'suggested', suggestion: suggestion.column }
    }

    return { jsonField: field, excelColumn: null, confidence: 'none' }
  })

  return finalizeMapping(entries, list)
}

/**
 * Fills in any field a fresh buildColumnMapping left unmapped
 * (`excelColumn: null` - i.e. "none" or an unconfirmed "suggested") using a
 * column the user previously chose for it manually, remembered on the
 * matching saved-rules library entry (see rememberColumnMapping in
 * useSavedRules.ts). This is purely additive: it never overrides a field
 * that already resolved on its own (an "exact" match keeps whatever it
 * matched, even if a different remembered column exists). A remembered
 * column is matched against `excelHeaders` the same case/spacing/punctuation
 * -insensitive way a fresh "exact" match would be (see
 * buildHeaderByNormalized), and resolves to the CURRENT file's own header
 * text rather than whatever casing/spacing was remembered; a remembered
 * column with no match at all in `excelHeaders` is ignored rather than
 * applied - so a stale memory from a differently-shaped Excel file can never
 * silently point at a column that doesn't exist here.
 *
 * Returns the original `mapping` unchanged (same reference) if nothing was
 * filled in, so callers can cheaply tell whether anything changed.
 */
export function applyRememberedColumnMappings(
  mapping: ColumnMappingResult,
  ruleDefinitions: RuleDefinition[],
  savedRules: SavedRule[],
  excelHeaders: string[]
): ColumnMappingResult {
  if (savedRules.length === 0) return mapping

  const headerByNormalized = buildHeaderByNormalized(excelHeaders)
  const remembered = new Map<string, string>()
  for (const def of ruleDefinitions) {
    const saved = findSavedRuleForDefinition(def, savedRules)
    if (!saved?.columnMapping) continue
    for (const [field, column] of Object.entries(saved.columnMapping)) {
      // First rule to declare a field wins - matches how buildColumnMapping
      // itself only maps a shared field name once across several rule sets.
      if (remembered.has(field)) continue
      const actualHeader = headerByNormalized.get(normalizeHeaderKey(column))
      if (actualHeader) remembered.set(field, actualHeader)
    }
  }
  if (remembered.size === 0) return mapping

  let changed = false
  const entries = mapping.entries.map((entry) => {
    if (entry.excelColumn !== null) return entry
    const rememberedColumn = remembered.get(entry.jsonField)
    if (!rememberedColumn) return entry
    changed = true
    return { jsonField: entry.jsonField, excelColumn: rememberedColumn, confidence: 'manual' as const }
  })
  if (!changed) return mapping

  return finalizeMapping(entries, ruleDefinitions.map((d) => d.ruleSet))
}

export function finalizeMapping(entries: ColumnMappingEntry[], ruleSets: RuleSet[]): ColumnMappingResult {
  const entryByField = new Map(entries.map((e) => [e.jsonField, e]))
  const requiredFields = new Set<string>()
  for (const ruleSet of ruleSets) {
    for (const field of ruleSet.same) requiredFields.add(field)
    for (const field of ruleSet.unique) requiredFields.add(field)
  }
  const missingRequired = entries
    .filter((e) => requiredFields.has(e.jsonField) && !e.excelColumn)
    .map((e) => e.jsonField)

  return {
    entries,
    entryByField,
    missingRequired,
    allRequiredMapped: missingRequired.length === 0,
  }
}

/** Apply (or clear) a manual mapping choice for one field and recompute readiness. */
export function updateMappingEntry(
  mapping: ColumnMappingResult,
  ruleSets: RuleSet | RuleSet[],
  jsonField: string,
  excelColumn: string | null
): ColumnMappingResult {
  const entries = mapping.entries.map((entry): ColumnMappingEntry => {
    if (entry.jsonField !== jsonField) return entry
    return {
      jsonField: entry.jsonField,
      excelColumn,
      confidence: excelColumn ? 'manual' : 'none',
      suggestion: entry.suggestion,
    }
  })
  return finalizeMapping(entries, toRuleSetArray(ruleSets))
}

/** Accept a previously computed fuzzy suggestion for one field. */
export function acceptSuggestion(
  mapping: ColumnMappingResult,
  ruleSets: RuleSet | RuleSet[],
  jsonField: string
): ColumnMappingResult {
  const entry = mapping.entryByField.get(jsonField)
  if (!entry || !entry.suggestion) return mapping
  return updateMappingEntry(mapping, ruleSets, jsonField, entry.suggestion)
}

/**
 * Derives the RuleSet actually used to run duplicate detection for one rule:
 * any SAME/UNIQUE/OPTIONAL field with no mapped Excel column is moved into
 * `ignored` (N/A) for this run, since there is nothing to compare it
 * against - regardless of what the rule file itself called that field.
 * `fields`/`byField` are updated to match, so anything reading them (the
 * exported "Rule Evaluation" sheet, the Group Details comparison view)
 * honestly reflects what was actually evaluated rather than the rule's
 * original, aspirational classification.
 *
 * The original RuleSet is never mutated - this returns a new one. Callers
 * that need to show the rule as uploaded (Rule Summary, Column Mapping)
 * should keep using the original; only the validation run itself, and
 * anything displaying that run's results, should use the derived one.
 */
export function deriveRunnableRuleSet(ruleSet: RuleSet, mapping: ColumnMappingResult): RuleSet {
  const isMapped = (field: string) => Boolean(mapping.entryByField.get(field)?.excelColumn)

  const same = ruleSet.same.filter(isMapped)
  const unique = ruleSet.unique.filter(isMapped)
  const optional = ruleSet.optional.filter(isMapped)
  const dropped = new Set<string>([
    ...ruleSet.same.filter((f) => !isMapped(f)),
    ...ruleSet.unique.filter((f) => !isMapped(f)),
    ...ruleSet.optional.filter((f) => !isMapped(f)),
  ])

  if (dropped.size === 0) return ruleSet

  const ignored = [...ruleSet.ignored, ...dropped]
  const fields = ruleSet.fields.map((f) => (dropped.has(f.field) ? { field: f.field, rule: 'N/A' as const } : f))
  const byField = new Map(ruleSet.byField)
  for (const field of dropped) byField.set(field, 'N/A')

  return { fields, byField, same, unique, optional, ignored }
}

/** Build a field -> column-index lookup for the mapped, currently-selected columns. */
export function buildColumnIndexByField(headers: string[], mapping: ColumnMappingEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of mapping) {
    if (entry.excelColumn) {
      const idx = headers.indexOf(entry.excelColumn)
      if (idx >= 0) map.set(entry.jsonField, idx)
    }
  }
  return map
}
