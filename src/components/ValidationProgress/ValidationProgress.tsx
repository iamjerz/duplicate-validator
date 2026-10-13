import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { PROGRESS_STEPS, type ProgressStepId } from '@/types'
import { formatNumber } from '@/utils/formatters'
import { cn } from '@/utils/cn'

export interface ValidationProgressProps {
  currentStepId: ProgressStepId | null
  percent: number
  totalRecords: number
  /** 1-based index of the rule currently running, when more than one rule is queued. */
  currentRuleNumber?: number
  totalRules?: number
  /** The current rule's Analysis text or file name, shown when more than one rule is queued. */
  currentRuleLabel?: string
}

export function ValidationProgress({
  currentStepId,
  percent,
  totalRecords,
  currentRuleNumber,
  totalRules,
  currentRuleLabel,
}: ValidationProgressProps) {
  const currentIndex = currentStepId ? PROGRESS_STEPS.findIndex((s) => s.id === currentStepId) : -1
  const showRuleProgress = Boolean(totalRules && totalRules > 1)

  return (
    <div className="mx-auto max-w-xl space-y-6 py-10 text-center">
      <div>
        <p className="text-lg font-semibold">Validating Data</p>
        <p className="text-sm text-muted-foreground">{formatNumber(totalRecords)} records</p>
        {showRuleProgress && (
          <p className="mt-1 text-sm font-medium text-primary">
            Rule {currentRuleNumber} of {totalRules}
            {currentRuleLabel ? `: ${currentRuleLabel}` : ''}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Progress value={percent} />
        <p className="text-sm text-muted-foreground">{Math.round(percent)}%</p>
      </div>

      <ul className="space-y-2 text-left">
        {PROGRESS_STEPS.map((step, index) => {
          const isDone = currentIndex > index || percent >= 100
          const isActive = index === currentIndex && !isDone
          return (
            <li key={step.id} className="flex items-center gap-2 text-sm">
              {isDone ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn(isDone && 'text-muted-foreground', isActive && 'font-medium')}>{step.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
