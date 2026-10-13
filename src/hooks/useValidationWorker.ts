import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CellValue,
  ColumnMappingEntry,
  ProgressStepId,
  RuleSet,
  ValidationResult,
  ValidationWorkerResponse,
} from '@/types'
import { PROGRESS_STEPS } from '@/types'
import { nextRequestId } from '@/utils/id'

export interface ValidationProgressState {
  stepId: ProgressStepId | null
  percent: number
}

export interface RunValidationInput {
  headers: string[]
  rows: CellValue[][]
  excelRowNumbers: number[]
  ruleSet: RuleSet
  mapping: ColumnMappingEntry[]
  /** The uploaded rule's own description of what a match means (e.g. "True Duplicate for denial"). */
  analysis?: string
}

export interface UseValidationWorkerResult {
  runValidation: (input: RunValidationInput) => void
  progress: ValidationProgressState
  result: ValidationResult | null
  error: string | null
  isRunning: boolean
  reset: () => void
}

/**
 * Owns a single, long-lived validation Web Worker for the lifetime of the
 * component that calls this hook. Keeping one worker instance (rather than
 * spawning a new one per run) avoids repeated worker start-up cost if the
 * user runs several validations in a session.
 */
export function useValidationWorker(): UseValidationWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef<string | null>(null)

  const [progress, setProgress] = useState<ValidationProgressState>({ stepId: null, percent: 0 })
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/validation.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<ValidationWorkerResponse>) => {
      const message = event.data
      if (!message || message.requestId !== requestIdRef.current) return // stale response, ignore

      if (message.type === 'progress') {
        setProgress({ stepId: message.step, percent: message.percent })
      } else if (message.type === 'result') {
        setResult(message.result)
        setIsRunning(false)
        setProgress({ stepId: null, percent: 100 })
      } else if (message.type === 'error') {
        setError(message.message)
        setIsRunning(false)
      }
    }

    worker.onerror = () => {
      setError('The validation worker crashed unexpectedly. Please try again.')
      setIsRunning(false)
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const runValidation = useCallback((input: RunValidationInput) => {
    const worker = workerRef.current
    if (!worker) return
    const requestId = nextRequestId()
    requestIdRef.current = requestId
    setResult(null)
    setError(null)
    setIsRunning(true)
    setProgress({ stepId: PROGRESS_STEPS[0].id, percent: 0 })
    worker.postMessage({ type: 'validate', requestId, ...input })
  }, [])

  const reset = useCallback(() => {
    requestIdRef.current = null
    setResult(null)
    setError(null)
    setIsRunning(false)
    setProgress({ stepId: null, percent: 0 })
  }, [])

  return { runValidation, progress, result, error, isRunning, reset }
}
