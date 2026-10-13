export type MappingConfidence = 'exact' | 'suggested' | 'none' | 'manual'

export interface ColumnMappingEntry {
  jsonField: string
  excelColumn: string | null
  confidence: MappingConfidence
  /** Present when confidence === 'suggested': the column we think matches. */
  suggestion?: string
}

export interface ColumnMappingResult {
  entries: ColumnMappingEntry[]
  entryByField: Map<string, ColumnMappingEntry>
  /** SAME/UNIQUE fields (required for duplicate detection) with no mapped column. */
  missingRequired: string[]
  allRequiredMapped: boolean
}
