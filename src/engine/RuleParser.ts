import type { RuleFileMetadata } from '@/types'

export interface RuleFieldInput {
  field: string
  value: string
}

export interface RuleParseStructuralResult {
  success: boolean
  fields: RuleFieldInput[]
  /** Descriptive level/Analysis text captured from the nested file format, if present. */
  metadata?: RuleFileMetadata
  error?: string
}

const VALIDATION_KEY_PATTERN = /^validation$/i
const LEVEL_KEY_PATTERN = /^level$/i
const ANALYSIS_KEY_PATTERN = /^analysis$/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Structural parsing only: confirms the JSON maps field names to string rule
 * values, preserving the original field order. Does NOT check whether each
 * value is one of SAME / UNIQUE / OPTIONAL / N/A - that is RuleValidator's
 * job. Keeping this step separate means a malformed *shape* (e.g. an array)
 * can be reported distinctly from an unsupported *value* (e.g. "MATCH"
 * instead of "SAME").
 *
 * Two JSON shapes are accepted:
 *  - Flat (original format): { "Field Name": "SAME", ... } - every top-level
 *    key is a field to validate.
 *  - Nested: { "level": "Invoice_level", "Analysis": "True Duplicate for
 *    denial", "Validation": { "Field Name": "SAME", ... } } - the field
 *    rules live inside a "Validation" object (matched case-insensitively);
 *    sibling text fields such as "level" and "Analysis" describe the rule
 *    set for the user but are never treated as fields themselves.
 */
export function parseRuleFile(input: unknown): RuleParseStructuralResult {
  if (!isPlainObject(input)) {
    return {
      success: false,
      fields: [],
      error: 'The validation rules file must contain a single JSON object mapping field names to rule values.',
    }
  }

  const validationKey = Object.keys(input).find((key) => VALIDATION_KEY_PATTERN.test(key))

  let fieldSource: Record<string, unknown> = input
  let metadata: RuleFileMetadata | undefined

  if (validationKey !== undefined) {
    const validationValue = input[validationKey]
    if (!isPlainObject(validationValue)) {
      return {
        success: false,
        fields: [],
        error: `The "${validationKey}" section must be a JSON object mapping field names to rule values (such as "SAME" or "UNIQUE").`,
      }
    }
    fieldSource = validationValue

    const collected: RuleFileMetadata = {}
    for (const [key, value] of Object.entries(input)) {
      if (key === validationKey || typeof value !== 'string') continue
      if (LEVEL_KEY_PATTERN.test(key)) collected.level = value
      else if (ANALYSIS_KEY_PATTERN.test(key)) collected.analysis = value
      else (collected.extra ??= {})[key] = value
    }
    if (Object.keys(collected).length > 0) metadata = collected
  }

  const fields: RuleFieldInput[] = []

  for (const [field, value] of Object.entries(fieldSource)) {
    if (typeof value !== 'string') {
      return {
        success: false,
        fields: [],
        error: `The rule for "${field}" must be a text value such as "SAME" (found ${typeof value}).`,
      }
    }
    fields.push({ field, value })
  }

  if (fields.length === 0) {
    return {
      success: false,
      fields: [],
      error:
        validationKey !== undefined
          ? `The "${validationKey}" section does not contain any fields.`
          : 'The validation rules file does not contain any fields.',
    }
  }

  return { success: true, fields, metadata }
}

/** Convenience wrapper that also handles JSON.parse failures. */
export function parseRuleFileFromText(text: string): RuleParseStructuralResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return {
      success: false,
      fields: [],
      error: 'The validation rules file contains invalid JSON.',
    }
  }
  return parseRuleFile(json)
}
