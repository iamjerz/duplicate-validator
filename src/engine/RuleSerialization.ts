import { buildRuleSet } from './RuleValidator'
import { nextRuleDefinitionId } from '@/utils/id'
import type { ParsedRuleField, RuleDefinition, RuleFileMetadata, SavedRule, SerializedRuleFile } from '@/types'

/**
 * Strips a RuleDefinition down to the minimal, JSON-serializable shape used
 * by both the saved-rules library and the last-active-rules session
 * snapshot. `ruleSet.byField` (a Map) is deliberately dropped - `fields`
 * alone is enough to rebuild an identical RuleSet via `buildRuleSet`.
 */
export function toSerializedRuleFile(def: RuleDefinition): SerializedRuleFile {
  return {
    fileName: def.fileName,
    fields: def.ruleSet.fields,
    metadata: def.metadata,
  }
}

/**
 * Rebuilds a full RuleDefinition (with a fresh session id) from a
 * serialized shape - used to restore rules from localStorage, whether from
 * the saved-rules library or the last-active-rules snapshot.
 *
 * Returns null only if the stored data can't produce a valid RuleSet at
 * all (e.g. hand-edited or corrupted localStorage) - fields written by this
 * app's own upload/editor flows always round-trip successfully, since they
 * were already validated RuleValue strings before being saved.
 */
export function fromSerializedRuleFile(serialized: SerializedRuleFile): RuleDefinition | null {
  if (!Array.isArray(serialized.fields) || serialized.fields.length === 0) return null

  const result = buildRuleSet(serialized.fields.map((f) => ({ field: f.field, value: f.rule })))
  if (!result.success || !result.ruleSet) return null

  return {
    id: nextRuleDefinitionId(),
    fileName: serialized.fileName,
    ruleSet: result.ruleSet,
    metadata: serialized.metadata,
    totalFields: result.ruleSet.fields.length,
  }
}

/** The plain-object JSON shape produced by ruleFileToRawJson - either a flat field->rule map, or the nested {level, Analysis, ...extra, Validation} shape. Always JSON-serializable. */
export type RawRuleFileExport = Record<string, unknown>

/**
 * Inverse of parseRuleFile (RuleParser.ts): rebuilds the exact uploadable
 * JSON shape for a rule's fields, for the Rules Library's "Export as JSON"
 * action.
 *
 * With no metadata (no level, Analysis, or other descriptive text), this
 * returns the flat shape - { "Field Name": "SAME", ... } - matching the
 * original format byte-for-byte in spirit, since that's all the rule ever
 * was. The moment any metadata is present, it switches to the nested shape -
 * { level, Analysis, ...extra, Validation: { ... } } - so that text isn't
 * silently dropped. Either shape, fed back through parseRuleFile /
 * parseRuleFileFromText, reproduces the same fields and metadata this was
 * built from.
 */
export function ruleFileToRawJson(fields: ParsedRuleField[], metadata?: RuleFileMetadata): RawRuleFileExport {
  const validation: Record<string, string> = {}
  for (const { field, rule } of fields) validation[field] = rule

  const hasMetadata = Boolean(
    metadata && (metadata.level || metadata.analysis || metadata.commentReason || metadata.extra)
  )
  if (!hasMetadata) return validation

  const out: RawRuleFileExport = {}
  if (metadata!.level) out.level = metadata!.level
  if (metadata!.analysis) out.Analysis = metadata!.analysis
  if (metadata!.commentReason) out.CommentReason = metadata!.commentReason
  if (metadata!.extra) Object.assign(out, metadata!.extra)
  out.Validation = validation
  return out
}

/**
 * True when two field lists declare the same fields with the same
 * classifications, in the same order - used to recognize "this is the same
 * rule" across a fresh upload, a library entry, and a live RuleDefinition,
 * since a RuleDefinition's own id is regenerated every time it's loaded and
 * never matches a SavedRule's stable library id.
 */
export function ruleFieldsEqual(a: ParsedRuleField[], b: ParsedRuleField[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Finds the library entry (if any) that represents the same rule file as a
 * live RuleDefinition, matched by fileName + field content rather than any
 * id. Used both to look up a remembered column mapping for the fields this
 * rule declares, and to update that mapping when the user resolves one
 * manually - see applyRememberedColumnMappings (ColumnMapper.ts) and
 * rememberColumnMapping (useSavedRules.ts).
 */
export function findSavedRuleForDefinition(def: RuleDefinition, savedRules: SavedRule[]): SavedRule | undefined {
  return savedRules.find((r) => r.fileName === def.fileName && ruleFieldsEqual(r.fields, def.ruleSet.fields))
}
