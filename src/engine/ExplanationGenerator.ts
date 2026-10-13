import type { DuplicateStatus, Explanation, ExplanationLine } from '@/types'

export interface ExplanationInput {
  status: DuplicateStatus
  matchedSameFields: string[]
  differentUniqueFields: string[]
  differentOptionalFields: string[]
  ignoredFieldsCount: number
  recordCount: number
  /** Only populated for VALIDATION_ERROR explanations. */
  blankFields?: string[]
  /** The uploaded rule's own description of what a match means (e.g. "True Duplicate for denial"). Foregrounded in the DUPLICATE/POTENTIAL_DUPLICATE summary when present. */
  analysis?: string
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}

/**
 * Produces a human-readable, structured explanation for one group's
 * classification. The UI renders `lines` as a checklist (checkmark /
 * warning / cross icon per `tone`) and `summary` as the headline verdict.
 */
export function generateExplanation(input: ExplanationInput): Explanation {
  const lines: ExplanationLine[] = []

  if (input.status === 'VALIDATION_ERROR') {
    const fields = (input.blankFields ?? []).join(', ')
    lines.push({
      tone: 'negative',
      text: `Required SAME field${pluralize((input.blankFields ?? []).length, '')} missing or unusable: ${fields}.`,
    })
    return {
      lines,
      classification: 'VALIDATION_ERROR',
      summary: 'VALIDATION ERROR - a required SAME field is missing, so this record could not be compared.',
    }
  }

  if (input.status === 'UNIQUE') {
    lines.push({ tone: 'positive', text: 'No other record shares matching values for all SAME fields.' })
    return { lines, classification: 'UNIQUE', summary: 'UNIQUE - no duplicates found.' }
  }

  const sameCount = input.matchedSameFields.length
  lines.push({
    tone: 'positive',
    text: `${sameCount} SAME ${pluralize(sameCount, 'field')} matched across ${input.recordCount} records.`,
  })

  if (input.status === 'DUPLICATE') {
    lines.push({ tone: 'positive', text: 'No UNIQUE field established a distinct record.' })
  } else {
    const uniqueCount = input.differentUniqueFields.length
    lines.push({
      tone: 'warning',
      text: `${uniqueCount} UNIQUE ${pluralize(uniqueCount, 'field')} ${pluralize(uniqueCount, 'differs', 'differ')}: ${input.differentUniqueFields.join(', ')}.`,
    })
    lines.push({
      tone: 'neutral',
      text: 'The UNIQUE fields differ, so these records cannot be confidently classified as an exact duplicate.',
    })
  }

  if (input.differentOptionalFields.length > 0) {
    const optionalCount = input.differentOptionalFields.length
    lines.push({
      tone: 'warning',
      text: `${optionalCount} OPTIONAL ${pluralize(optionalCount, 'field')} ${pluralize(optionalCount, 'differs', 'differ')}: ${input.differentOptionalFields.join(', ')}.`,
    })
  } else {
    lines.push({ tone: 'neutral', text: 'No OPTIONAL field differences.' })
  }

  if (input.ignoredFieldsCount > 0) {
    lines.push({
      tone: 'neutral',
      text: `${input.ignoredFieldsCount} N/A ${pluralize(input.ignoredFieldsCount, 'field')} ignored.`,
    })
  }

  const summary =
    input.status === 'DUPLICATE'
      ? input.analysis
        ? `DUPLICATE - ${input.analysis}`
        : 'DUPLICATE - high confidence.'
      : input.analysis
        ? `POTENTIAL DUPLICATE - ${input.analysis} (needs review)`
        : 'POTENTIAL DUPLICATE - needs review.'

  return { lines, classification: input.status, summary }
}
