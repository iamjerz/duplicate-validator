/**
 * The duplicate-detection worker. Everything expensive (indexing, grouping,
 * classifying, explaining) happens here, off the main thread, so the UI
 * never freezes even on very large files.
 *
 * This file intentionally avoids any WebWorker-only lib types (see
 * tsconfig.json - only "DOM" is included) so it can share a single
 * TypeScript project with the rest of the app without a lib conflict.
 * `self.postMessage` / `self.onmessage` both exist on the "DOM" lib's
 * Window type too, which is enough to type-check here; at runtime this
 * code only ever executes inside a real DedicatedWorkerGlobalScope.
 */
import { runDuplicateValidation } from '@/engine/DuplicateValidationEngine'
import type { ProgressStepId, ValidationWorkerRequest, ValidationWorkerResponse } from '@/types'

function post(message: ValidationWorkerResponse): void {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<ValidationWorkerRequest>) => {
  const request = event.data
  if (!request || request.type !== 'validate') return

  const { requestId, headers, rows, excelRowNumbers, ruleSet, mapping, analysis, level } = request

  try {
    post({ type: 'progress', requestId, step: 'reading', percent: 5 })
    post({ type: 'progress', requestId, step: 'validating-rules', percent: 15 })
    post({ type: 'progress', requestId, step: 'mapping-columns', percent: 25 })
    post({ type: 'progress', requestId, step: 'normalizing', percent: 35 })

    const result = runDuplicateValidation({
      headers,
      rows,
      excelRowNumbers,
      ruleSet,
      mapping,
      analysis,
      level,
      onProgress: (step, percent) => {
        const mapped: ProgressStepId =
          step === 'indexing' ? 'indexing' : step === 'grouping' ? 'grouping' : 'generating'
        post({ type: 'progress', requestId, step: mapped, percent })
      },
    })

    post({ type: 'progress', requestId, step: 'generating', percent: 100 })
    post({ type: 'result', requestId, result })
  } catch (error) {
    post({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : 'An unexpected error occurred during validation.',
    })
  }
}
