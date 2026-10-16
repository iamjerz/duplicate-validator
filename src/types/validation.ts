import type { CellValue } from './excel'
import type { MappingConfidence } from './mapping'
import type { RuleSet, RuleValue } from './rules'

export type DuplicateStatus = 'DUPLICATE' | 'POTENTIAL_DUPLICATE' | 'UNIQUE' | 'VALIDATION_ERROR'

export type BlankKind = 'null' | 'empty' | 'whitespace' | 'placeholder' | 'value'

export interface NormalizedValue {
  raw: CellValue
  /** Human-readable rendering of the raw value, used in tables and exports. */
  display: string
  /** The value used for equality comparisons. */
  normalized: string | number | null
  kind: BlankKind
  valueType: 'string' | 'number' | 'date' | 'boolean' | 'unknown'
  /** True when the raw value looked date/number-like but couldn't be parsed cleanly. */
  unparseable?: boolean
}

/** A pointer back to one row of the dataset the main thread already holds. */
export interface RecordRef {
  /** Index into the dataset's `rows` array. */
  rowIndex: number
  /** 1-based row number as it would appear in Excel. */
  excelRowNumber: number
}

export interface FieldDifferenceEntry {
  record: RecordRef
  value: NormalizedValue
}

export interface FieldDifference {
  field: string
  values: FieldDifferenceEntry[]
}

export interface ExplanationLine {
  tone: 'positive' | 'warning' | 'negative' | 'neutral'
  text: string
}

export interface Explanation {
  lines: ExplanationLine[]
  classification: DuplicateStatus
  summary: string
}

export interface DuplicateGroup {
  id: string // "DUP-000001"
  status: Exclude<DuplicateStatus, 'VALIDATION_ERROR'>
  records: RecordRef[]
  matchedSameFields: string[]
  differentUniqueFields: string[]
  differentOptionalFields: string[]
  ignoredFields: string[]
  /** One representative normalized value per SAME field (they match by definition). */
  sameFieldValues: Record<string, NormalizedValue>
  uniqueDifferences: FieldDifference[]
  optionalDifferences: FieldDifference[]
  explanation: Explanation
  /**
   * Set when DispositionOverride.ts finds this group isn't really a
   * duplicate despite matching the rule's SAME fields (e.g. a coincidental
   * Invoice Number collision with a different Carrier/Account). Null for
   * every group where the rule's own disposition stands as-is - which is
   * most of them. See AutoDisposition.ts/AutoComment.ts, which use this in
   * place of the rule's normal auto-disposition/comment when present.
   */
  dispositionOverride: DispositionOverrideOutcome | null
}

export interface DispositionOverrideOutcome {
  disposition: 'Continue Processing'
  reason: string
}

export interface ValidationErrorEntry {
  record: RecordRef
  field: string
  reason: string
}

export interface KPISummary {
  totalRecords: number
  duplicateRecords: number
  potentialDuplicateRecords: number
  uniqueRecords: number
  validationErrorRecords: number
  duplicateGroups: number
  potentialDuplicateGroups: number
  duplicateRate: number // percentage, 0-100
}

export interface RuleEvaluationEntry {
  field: string
  rule: RuleValue
  mappedColumn: string | null
  mappingConfidence: MappingConfidence
}

export interface ValidationResult {
  groups: DuplicateGroup[]
  validationErrors: ValidationErrorEntry[]
  kpis: KPISummary
  ruleEvaluation: RuleEvaluationEntry[]
  generatedAt: string
  /** Wall-clock milliseconds the engine took, for display/diagnostics only. */
  durationMs: number
}

/**
 * The outcome of running duplicate detection for one uploaded rule
 * definition. When multiple rules are loaded at once, the app produces one
 * of these per rule and never merges their groups together.
 */
export interface RuleValidationOutcome {
  ruleDefinitionId: string
  result: ValidationResult
  /**
   * The RuleSet actually used to produce `result` - any field the rule
   * declared SAME/UNIQUE/OPTIONAL but that had no mapped Excel column was
   * excluded (moved to N/A) for this run. Anything displaying this specific
   * result (Group Details, Record Comparison) should use this rather than
   * the rule definition's own original ruleSet, so the display never claims
   * a field was compared when it was actually excluded.
   *
   */
  effectiveRuleSet: RuleSet
}
