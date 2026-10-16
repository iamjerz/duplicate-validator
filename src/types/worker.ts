import type { CellValue } from './excel'
import type { ColumnMappingEntry } from './mapping'
import type { RuleSet } from './rules'
import type { ValidationResult } from './validation'

export type ProgressStepId =
  | 'reading'
  | 'validating-rules'
  | 'mapping-columns'
  | 'normalizing'
  | 'indexing'
  | 'grouping'
  | 'generating'

export const PROGRESS_STEPS: { id: ProgressStepId; label: string }[] = [
  { id: 'reading', label: 'Reading Excel' },
  { id: 'validating-rules', label: 'Validating Rules' },
  { id: 'mapping-columns', label: 'Mapping Columns' },
  { id: 'normalizing', label: 'Normalizing Data' },
  { id: 'indexing', label: 'Building Indexes' },
  { id: 'grouping', label: 'Finding Duplicate Groups' },
  { id: 'generating', label: 'Generating Results' },
]

export interface ValidationWorkerRequest {
  type: 'validate'
  requestId: string
  headers: string[]
  rows: CellValue[][]
  excelRowNumbers: number[]
  ruleSet: RuleSet
  mapping: ColumnMappingEntry[]
  /** The uploaded rule's own description of what a match means (e.g. "True Duplicate for denial"). */
  analysis?: string
  /** The rule's own level text (e.g. "Invoice_level") - drives disposition-override detection. */
  level?: string
}

export type ValidationWorkerInboundMessage = ValidationWorkerRequest

export type ValidationWorkerResponse =
  | { type: 'progress'; requestId: string; step: ProgressStepId; percent: number }
  | { type: 'result'; requestId: string; result: ValidationResult }
  | { type: 'error'; requestId: string; message: string }
