/** Format a duplicate group's sequence number as "DUP-000001". */
export function formatGroupId(sequence: number): string {
  return `DUP-${String(sequence).padStart(6, '0')}`
}

let requestCounter = 0

/** A unique-enough id for correlating worker request/response pairs. */
export function nextRequestId(): string {
  requestCounter += 1
  return `req-${Date.now()}-${requestCounter}`
}

let ruleDefinitionCounter = 0

/** A unique-enough id for one accepted rule file within this session. */
export function nextRuleDefinitionId(): string {
  ruleDefinitionCounter += 1
  return `rule-${Date.now()}-${ruleDefinitionCounter}`
}

let savedRuleCounter = 0

/** A unique-enough id for one rule saved to the (persisted) Rules library. */
export function nextSavedRuleId(): string {
  savedRuleCounter += 1
  return `saved-rule-${Date.now()}-${savedRuleCounter}`
}

let excelFileCounter = 0

/** A unique-enough id for one uploaded Excel file within this session. */
export function nextExcelFileId(): string {
  excelFileCounter += 1
  return `excel-${Date.now()}-${excelFileCounter}`
}

let historyRunCounter = 0

/** A unique-enough id shared by every rule-outcome History entry produced by one validation run - see SessionHistoryEntry.runId. */
export function nextHistoryRunId(): string {
  historyRunCounter += 1
  return `run-${Date.now()}-${historyRunCounter}`
}
