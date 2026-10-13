import { CheckCircle2 } from 'lucide-react'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { allRuleDefinitionsRunnable } from '@/engine'
import { cn } from '@/utils/cn'

const EXPLANATIONS = [
  { label: 'SAME', description: 'These fields must match.' },
  { label: 'UNIQUE', description: 'These fields help distinguish separate records.' },
  { label: 'OPTIONAL', description: 'Differences will not automatically prevent a duplicate match.' },
  { label: 'N/A', description: 'These fields will be ignored.' },
]

export function RuleInterpretationGuide() {
  const { excelDataset, ruleDefinitions, mapping, savedRules } = useValidationSession()

  const excelReady = Boolean(excelDataset)
  const rulesReady = ruleDefinitions.length > 0
  // Same check the Start Validation button itself uses - a field with no
  // mapped column, or a SAME field flagged "Allow blank", is excluded from
  // the run rather than blocking it, so this is only false when a rule
  // would be left with zero mapped, still-required SAME fields.
  const mappingReady = allRuleDefinitionsRunnable(ruleDefinitions, mapping, excelDataset, savedRules)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">How your data will be checked</p>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {EXPLANATIONS.map((item) => (
            <div key={item.label} className="rounded-lg border bg-card p-3">
              <dt className="text-sm font-semibold">{item.label}</dt>
              <dd className="text-sm text-muted-foreground">{item.description}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ul className="space-y-1.5 text-sm">
        <ReadinessItem ready={excelReady} label="Excel is ready" />
        <ReadinessItem ready={rulesReady} label="Validation rules are valid" />
        <ReadinessItem ready={mappingReady} label="Enough columns are mapped to run" />
      </ul>
    </div>
  )
}

function ReadinessItem({ ready, label }: { ready: boolean; label: string }) {
  return (
    <li className={cn('flex items-center gap-2', ready ? 'text-success' : 'text-muted-foreground')}>
      <CheckCircle2 className={cn('h-4 w-4 shrink-0', ready ? 'opacity-100' : 'opacity-30')} />
      {label}
    </li>
  )
}
