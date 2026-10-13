import { RULE_VALUES, type RuleValue, type RuleSet, type RuleFieldError, type RuleParseResult } from '@/types'
import type { RuleFieldInput, RuleParseStructuralResult } from './RuleParser'

const VALID_VALUES = new Set<string>(RULE_VALUES)

export function isRuleValue(value: string): value is RuleValue {
  return VALID_VALUES.has(value)
}

/**
 * Validates each field's rule value and, if everything is valid, builds the
 * indexed RuleSet the rest of the engine relies on. If ANY field has an
 * unsupported value, no RuleSet is built - the caller should surface every
 * offending field to the user in one pass rather than one-at-a-time.
 */
export function buildRuleSet(fields: RuleFieldInput[]): RuleParseResult {
  const errors: RuleFieldError[] = []
  const parsedFields: { field: string; rule: RuleValue }[] = []

  for (const { field, value } of fields) {
    const candidate = value.trim()
    if (!isRuleValue(candidate)) {
      errors.push({
        field,
        value,
        message: `"${field}" has an unsupported value: "${value}". Allowed values are SAME, UNIQUE, OPTIONAL, N/A.`,
      })
      continue
    }
    parsedFields.push({ field, rule: candidate })
  }

  if (errors.length > 0) {
    return { success: false, errors, totalFields: fields.length }
  }

  const byField = new Map<string, RuleValue>()
  const same: string[] = []
  const unique: string[] = []
  const optional: string[] = []
  const ignored: string[] = []

  for (const { field, rule } of parsedFields) {
    byField.set(field, rule)
    if (rule === 'SAME') same.push(field)
    else if (rule === 'UNIQUE') unique.push(field)
    else if (rule === 'OPTIONAL') optional.push(field)
    else ignored.push(field)
  }

  const ruleSet: RuleSet = { fields: parsedFields, byField, same, unique, optional, ignored }

  return { success: true, ruleSet, errors: [], totalFields: fields.length }
}

export function validateRuleFile(structural: RuleParseStructuralResult): RuleParseResult {
  if (!structural.success) {
    return {
      success: false,
      errors: [{ field: '', value: '', message: structural.error ?? 'Invalid validation rules file.' }],
      totalFields: 0,
    }
  }
  const result = buildRuleSet(structural.fields)
  return structural.metadata ? { ...result, metadata: structural.metadata } : result
}

/** True when the rule set has enough structure to actually run duplicate detection. */
export function hasRunnableRuleSet(ruleSet: RuleSet): boolean {
  return ruleSet.same.length > 0
}
