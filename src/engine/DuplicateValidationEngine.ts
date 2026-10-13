import type {
  CellValue,
  ColumnMappingEntry,
  DuplicateGroup,
  KPISummary,
  RuleEvaluationEntry,
  RuleSet,
  ValidationErrorEntry,
  ValidationResult,
} from '@/types'
import { buildDuplicateGroups } from './DuplicateGroupBuilder'
import { classifyGroup } from './DuplicateClassifier'
import { generateExplanation } from './ExplanationGenerator'
import { buildColumnIndexByField } from './ColumnMapper'
import { formatGroupId } from '@/utils/id'
import { hasRunnableRuleSet } from './RuleValidator'

export type EngineProgressStep = 'indexing' | 'grouping' | 'generating'
export type EngineProgressCallback = (step: EngineProgressStep, percent: number) => void

export interface RunEngineInput {
  headers: string[]
  rows: CellValue[][]
  excelRowNumbers: number[]
  ruleSet: RuleSet
  mapping: ColumnMappingEntry[]
  /** The uploaded rule's own description of what a match means (e.g. "True Duplicate for denial"). Drives the explanation text. */
  analysis?: string
  onProgress?: EngineProgressCallback
}

/**
 * Runs the full duplicate-detection pipeline over an already-parsed,
 * already-normalized-at-read-time dataset:
 *   index (Map-based grouping) -> classify each group -> explain -> summarize
 *
 * This function has no dependency on the DOM, Web Workers, or React, so it
 * can run inside the validation Web Worker, in a plain Node script for
 * performance testing, or directly in unit tests.
 */
export function runDuplicateValidation(input: RunEngineInput): ValidationResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const { headers, rows, excelRowNumbers, ruleSet, mapping, analysis, onProgress } = input

  if (!hasRunnableRuleSet(ruleSet)) {
    throw new Error('At least one field must be marked SAME before duplicate detection can run.')
  }

  onProgress?.('indexing', 10)
  const { groups: rawGroups, validationErrorRows } = buildDuplicateGroups(headers, rows, ruleSet, mapping)

  onProgress?.('grouping', 40)

  const columnIndexByField = buildColumnIndexByField(headers, mapping)

  const groups: DuplicateGroup[] = []
  let duplicateGroupCount = 0
  let potentialDuplicateGroupCount = 0
  let duplicateRecordCount = 0
  let potentialDuplicateRecordCount = 0
  let uniqueRecordCount = 0

  const total = Math.max(rawGroups.length, 1)
  let processed = 0
  let sequence = 0

  for (const raw of rawGroups) {
    const classified = classifyGroup(raw.rowIndices, rows, excelRowNumbers, ruleSet, columnIndexByField)

    if (classified.status === 'DUPLICATE') {
      duplicateGroupCount += 1
      duplicateRecordCount += raw.rowIndices.length
    } else if (classified.status === 'POTENTIAL_DUPLICATE') {
      potentialDuplicateGroupCount += 1
      potentialDuplicateRecordCount += raw.rowIndices.length
    } else {
      uniqueRecordCount += raw.rowIndices.length
    }

    sequence += 1
    const explanation = generateExplanation({
      status: classified.status,
      matchedSameFields: classified.matchedSameFields,
      differentUniqueFields: classified.differentUniqueFields,
      differentOptionalFields: classified.differentOptionalFields,
      ignoredFieldsCount: ruleSet.ignored.length,
      recordCount: raw.rowIndices.length,
      analysis,
    })

    groups.push({
      id: formatGroupId(sequence),
      status: classified.status,
      records: raw.rowIndices.map((ri) => ({ rowIndex: ri, excelRowNumber: excelRowNumbers[ri] })),
      matchedSameFields: classified.matchedSameFields,
      differentUniqueFields: classified.differentUniqueFields,
      differentOptionalFields: classified.differentOptionalFields,
      ignoredFields: ruleSet.ignored,
      sameFieldValues: classified.sameFieldValues,
      uniqueDifferences: classified.uniqueDifferences,
      optionalDifferences: classified.optionalDifferences,
      explanation,
    })

    processed += 1
    if (onProgress && processed % 5000 === 0) {
      onProgress('generating', 40 + Math.round((processed / total) * 55))
    }
  }

  onProgress?.('generating', 97)

  const validationErrors: ValidationErrorEntry[] = []
  for (const row of validationErrorRows) {
    for (const field of row.blankFields) {
      validationErrors.push({
        record: { rowIndex: row.rowIndex, excelRowNumber: excelRowNumbers[row.rowIndex] },
        field,
        reason: `Required SAME field "${field}" is missing or blank.`,
      })
    }
  }

  const totalRecords = rows.length
  const validationErrorRecords = validationErrorRows.length
  const duplicateRate = totalRecords > 0 ? (duplicateRecordCount / totalRecords) * 100 : 0

  const kpis: KPISummary = {
    totalRecords,
    duplicateRecords: duplicateRecordCount,
    potentialDuplicateRecords: potentialDuplicateRecordCount,
    uniqueRecords: uniqueRecordCount,
    validationErrorRecords,
    duplicateGroups: duplicateGroupCount,
    potentialDuplicateGroups: potentialDuplicateGroupCount,
    duplicateRate,
  }

  const ruleEvaluation: RuleEvaluationEntry[] = ruleSet.fields.map(({ field, rule }) => {
    const mapEntry = mapping.find((m) => m.jsonField === field)
    return {
      field,
      rule,
      mappedColumn: mapEntry?.excelColumn ?? null,
      mappingConfidence: mapEntry?.confidence ?? 'none',
    }
  })

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now()

  return {
    groups,
    validationErrors,
    kpis,
    ruleEvaluation,
    generatedAt: new Date().toISOString(),
    durationMs: end - start,
  }
}
