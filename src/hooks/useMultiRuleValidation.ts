import { useEffect, useState } from 'react'
import type { CellValue, ColumnMappingEntry, RuleDefinition, RuleValidationOutcome } from '@/types'
import { useValidationWorker, type ValidationProgressState } from './useValidationWorker'

export interface MultiRuleDatasetInput {
  headers: string[]
  rows: CellValue[][]
  excelRowNumbers: number[]
  mapping: ColumnMappingEntry[]
}

export interface MultiRuleValidationError {
  ruleDefinitionId: string
  fileName: string
  message: string
}

export interface UseMultiRuleValidationResult {
  runAll: (ruleDefinitions: RuleDefinition[], dataset: MultiRuleDatasetInput) => void
  /** One entry per rule that has finished so far, in the order each rule completed. Never merged across rules. */
  outcomes: RuleValidationOutcome[]
  /** 1-based "rule N of totalRules" while running. */
  currentRuleNumber: number
  totalRules: number
  currentRuleDefinition: RuleDefinition | null
  /** The underlying worker's step/percent progress for whichever rule is currently running. */
  stepProgress: ValidationProgressState
  isRunning: boolean
  error: MultiRuleValidationError | null
  reset: () => void
}

/**
 * Runs one DuplicateValidationEngine pass per accepted rule definition, one
 * at a time, reusing a single long-lived Web Worker (via useValidationWorker)
 * rather than spawning one worker per rule. Rules run sequentially - not in
 * parallel - because there is normally only a handful of them at the same
 * "level" and reusing one worker avoids repeated start-up cost; each pass is
 * still O(n) in the record count, so this scales the same way a single-rule
 * run does, just N times over.
 *
 * Every rule's ValidationResult is kept in its own `outcomes` entry and is
 * never combined with another rule's groups/KPIs - "kept separate" is the
 * whole point of supporting more than one rule at once.
 */
export function useMultiRuleValidation(): UseMultiRuleValidationResult {
  const worker = useValidationWorker()

  const [queue, setQueue] = useState<RuleDefinition[]>([])
  const [dataset, setDataset] = useState<MultiRuleDatasetInput | null>(null)
  const [outcomes, setOutcomes] = useState<RuleValidationOutcome[]>([])
  const [totalRules, setTotalRules] = useState(0)
  const [currentRuleNumber, setCurrentRuleNumber] = useState(0)
  const [currentRuleDefinition, setCurrentRuleDefinition] = useState<RuleDefinition | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<MultiRuleValidationError | null>(null)

  // Advances the queue whenever the underlying worker delivers a fresh
  // result. `currentRuleDefinition` is read from the closure rather than
  // listed as a dependency deliberately - this must fire only when a new
  // result actually arrives, not on every state change.
  useEffect(() => {
    if (!worker.result) return
    const finishedDef = currentRuleDefinition
    if (!finishedDef || !dataset) return

    setOutcomes((prev) => [
      ...prev,
      { ruleDefinitionId: finishedDef.id, result: worker.result!, effectiveRuleSet: finishedDef.ruleSet },
    ])

    const next = queue[0]
    if (next) {
      setQueue((prev) => prev.slice(1))
      setCurrentRuleNumber((n) => n + 1)
      setCurrentRuleDefinition(next)
      worker.runValidation({
        headers: dataset.headers,
        rows: dataset.rows,
        excelRowNumbers: dataset.excelRowNumbers,
        ruleSet: next.ruleSet,
        mapping: dataset.mapping,
        analysis: next.metadata?.analysis,
        level: next.metadata?.level,
      })
    } else {
      setIsRunning(false)
      setCurrentRuleDefinition(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker.result])

  useEffect(() => {
    if (!worker.error) return
    setQueue([])
    setIsRunning(false)
    setError({
      ruleDefinitionId: currentRuleDefinition?.id ?? '',
      fileName: currentRuleDefinition?.fileName ?? '',
      message: worker.error,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker.error])

  const runAll = (ruleDefinitions: RuleDefinition[], nextDataset: MultiRuleDatasetInput) => {
    if (ruleDefinitions.length === 0) return
    const [first, ...rest] = ruleDefinitions

    setDataset(nextDataset)
    setQueue(rest)
    setOutcomes([])
    setTotalRules(ruleDefinitions.length)
    setCurrentRuleNumber(1)
    setCurrentRuleDefinition(first)
    setError(null)
    setIsRunning(true)

    worker.runValidation({
      headers: nextDataset.headers,
      rows: nextDataset.rows,
      excelRowNumbers: nextDataset.excelRowNumbers,
      ruleSet: first.ruleSet,
      mapping: nextDataset.mapping,
      analysis: first.metadata?.analysis,
      level: first.metadata?.level,
    })
  }

  const reset = () => {
    setQueue([])
    setDataset(null)
    setOutcomes([])
    setTotalRules(0)
    setCurrentRuleNumber(0)
    setCurrentRuleDefinition(null)
    setIsRunning(false)
    setError(null)
    worker.reset()
  }

  return {
    runAll,
    outcomes,
    currentRuleNumber,
    totalRules,
    currentRuleDefinition,
    stepProgress: worker.progress,
    isRunning,
    error,
    reset,
  }
}
