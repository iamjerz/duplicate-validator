import type { ParsedRuleField, RuleFileMetadata } from './rules'

/**
 * The minimal, JSON-serializable shape of one rule file - everything needed
 * to rebuild a full RuleSet via `buildRuleSet`, and nothing that can't
 * survive a round trip through `JSON.stringify`/`localStorage` (unlike
 * RuleSet itself, which carries a `byField` Map). Shared by the saved-rules
 * library and the last-active-rules session snapshot - see
 * src/engine/RuleSerialization.ts for the conversions to/from a real
 * RuleDefinition.
 */
export interface SerializedRuleFile {
  fileName: string
  fields: ParsedRuleField[]
  metadata?: RuleFileMetadata
}

/**
 * One rule file saved to the user's library (localStorage, this browser
 * only). Created automatically the first time a rule file is successfully
 * uploaded, and editable afterward from the Rules page - editing a saved
 * rule never changes any RuleDefinition already active in the current
 * session, only what gets loaded the next time this entry is used.
 */
export interface SavedRule extends SerializedRuleFile {
  /** Stable id for this library entry - stays the same across edits. */
  id: string
  /** User-facing display name, editable independently of fileName. */
  name: string
  savedAt: string
  /**
   * Remembered Excel-column choices for fields that don't auto-match by
   * name (jsonField -> Excel column name), so a manual fix in the Column
   * Mapping step doesn't need to be redone next time this rule is used -
   * whether against the same Excel file again or a new one with the same
   * odd column name. Only ever set for fields the user actually resolved
   * manually; never overrides a field that auto-matches on its own, and a
   * remembered column that no longer exists in a given Excel file is simply
   * ignored (see applyRememberedColumnMappings).
   */
  columnMapping?: Record<string, string>
  /**
   * Per-field overrides of whether a blank value should be tolerated for a
   * SAME field (field name -> true/false), set by the "Allow blank"
   * checkbox in the Column Mapping step (see ColumnMappingPanel /
   * useSavedRules.setBlankOverride). `true` means a blank in this field
   * never blocks grouping - the field is treated as UNIQUE for the run
   * instead (see BlankAllowance.ts); `false` means keep it strict even if
   * this file happens to have a blank in it. A field with no entry here
   * defaults to whatever the current file's own data suggests (see
   * detectBlankSameFields) rather than a fixed value - that's what makes it
   * a "suggestion, always overridable" rather than a silent, permanent
   * guess.
   */
  blankOverrides?: Record<string, boolean>
}
