/**
 * The four rule values the application understands. This list is the single
 * source of truth: the JSON rules file uploaded by the user must use exactly
 * one of these strings for every field.
 */
export const RULE_VALUES = ['SAME', 'UNIQUE', 'OPTIONAL', 'N/A'] as const

export type RuleValue = (typeof RULE_VALUES)[number]

/** The raw shape of an uploaded rules JSON file: field name -> rule value text. */
export type RawRuleFile = Record<string, string>

export interface RuleFieldError {
  field: string
  value: string
  message: string
}

export interface ParsedRuleField {
  field: string
  rule: RuleValue
}

/**
 * The fully parsed, validated set of rules, indexed a few different ways so
 * the rest of the app never has to re-derive these groupings.
 */
export interface RuleSet {
  /** Original field order as it appeared in the JSON file. */
  fields: ParsedRuleField[]
  /** Quick lookup by field name -> rule value. */
  byField: Map<string, RuleValue>
  same: string[]
  unique: string[]
  optional: string[]
  /** Fields marked N/A - ignored entirely by duplicate detection. */
  ignored: string[]
}

/**
 * Descriptive, non-rule information that may accompany a rules JSON file
 * under the nested format (see RuleParser for the exact shape). This is
 * shown to the user for context only - it never affects duplicate
 * detection, which is driven entirely by the SAME/UNIQUE/OPTIONAL/N/A
 * values inside the "Validation" section.
 */
export interface RuleFileMetadata {
  level?: string
  analysis?: string
  /** Any other descriptive top-level text fields the file included. */
  extra?: Record<string, string>
}

export interface RuleParseResult {
  success: boolean
  ruleSet?: RuleSet
  /** Fields whose value was not one of SAME / UNIQUE / OPTIONAL / N/A. */
  errors: RuleFieldError[]
  /** Total number of fields found in the JSON file. */
  totalFields: number
  /** Present when the rules file used the nested format and included level/Analysis text. */
  metadata?: RuleFileMetadata
}

/**
 * One successfully-accepted rules file. The app can hold several of these at
 * once (see RuleFileIssue / the "same level" rule below) - each is run
 * through duplicate detection independently and never merged with another.
 */
export interface RuleDefinition {
  /** Stable id for this session - used to correlate a ValidationResult, an export, or a UI selection back to this rule. */
  id: string
  fileName: string
  ruleSet: RuleSet
  metadata?: RuleFileMetadata
  totalFields: number
}

/** A rules file that was rejected (bad JSON/shape/values, or a "level" that doesn't match the other loaded rules). */
export interface RuleFileIssue {
  fileName: string
  message: string
}

export interface RuleCounts {
  same: number
  unique: number
  optional: number
  ignored: number
  total: number
}

/**
 * Counts fields by rule value directly, without needing a fully-indexed
 * RuleSet - used for rule sets that only exist as a plain field list so far
 * (e.g. a SavedRule from the library, before it's been rebuilt into a real
 * RuleSet via buildRuleSet).
 */
export function countRuleFields(fields: ParsedRuleField[]): RuleCounts {
  const counts: RuleCounts = { same: 0, unique: 0, optional: 0, ignored: 0, total: fields.length }
  for (const { rule } of fields) {
    if (rule === 'SAME') counts.same += 1
    else if (rule === 'UNIQUE') counts.unique += 1
    else if (rule === 'OPTIONAL') counts.optional += 1
    else counts.ignored += 1
  }
  return counts
}

export function countRules(ruleSet: RuleSet): RuleCounts {
  return countRuleFields(ruleSet.fields)
}
