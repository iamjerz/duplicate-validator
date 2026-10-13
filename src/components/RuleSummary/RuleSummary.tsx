import { useState } from 'react'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { countRules, type RuleDefinition, type RuleSet } from '@/types'
import { humanizeLabel } from '@/utils/formatters'

const SECTIONS: { key: keyof Pick<RuleSet, 'same' | 'unique' | 'optional' | 'ignored'>; label: string }[] = [
  { key: 'same', label: 'SAME Fields' },
  { key: 'unique', label: 'UNIQUE Fields' },
  { key: 'optional', label: 'OPTIONAL Fields' },
  { key: 'ignored', label: 'Ignored (N/A) Fields' },
]

/**
 * One card per uploaded rule definition. When multiple rules are loaded,
 * each keeps its own counts and field breakdown - they are never merged
 * into a single combined summary, since two rules can (and often do)
 * classify the same field differently.
 */
export function RuleSummary() {
  const { ruleDefinitions } = useValidationSession()
  if (ruleDefinitions.length === 0) return null

  return (
    <div className="space-y-6">
      {ruleDefinitions.length > 1 && (
        <p className="text-sm text-muted-foreground">
          {ruleDefinitions.length} rules loaded for the same level. Each will run its own, separate duplicate check.
        </p>
      )}
      {ruleDefinitions.map((def) => (
        <RuleSummaryCard key={def.id} ruleDefinition={def} showFileName={ruleDefinitions.length > 1} />
      ))}
    </div>
  )
}

function RuleSummaryCard({ ruleDefinition, showFileName }: { ruleDefinition: RuleDefinition; showFileName: boolean }) {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const counts = countRules(ruleDefinition.ruleSet)
  const metadata = ruleDefinition.metadata

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        {showFileName && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ruleDefinition.fileName}</p>}
        <p className="text-sm font-medium">Validation Rules</p>
        <p className="text-sm text-muted-foreground">{counts.total} fields</p>
      </div>

      {metadata && (metadata.level || metadata.analysis) && (
        <div className="flex gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <dl className="space-y-1">
            {metadata.level && (
              <div className="flex gap-1.5">
                <dt className="font-medium">Level:</dt>
                <dd className="text-muted-foreground">{humanizeLabel(metadata.level)}</dd>
              </div>
            )}
            {metadata.analysis && (
              <div className="flex gap-1.5">
                <dt className="font-medium">Analysis:</dt>
                <dd className="text-muted-foreground">{metadata.analysis}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RuleCountCard label="SAME" count={counts.same} />
        <RuleCountCard label="UNIQUE" count={counts.unique} />
        <RuleCountCard label="OPTIONAL" count={counts.optional} />
        <RuleCountCard label="N/A" count={counts.ignored} />
      </div>

      <div className="divide-y rounded-lg border">
        {SECTIONS.map((section) => {
          const fields = ruleDefinition.ruleSet[section.key]
          const isOpen = openSection === section.key
          return (
            <div key={section.key}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
                onClick={() => setOpenSection(isOpen ? null : section.key)}
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {section.label}
                </span>
                <span className="text-muted-foreground">{fields.length}</span>
              </button>
              {isOpen && (
                <ul className="space-y-1 px-4 pb-3 pl-10 text-sm text-muted-foreground">
                  {fields.length === 0 && <li className="italic">None</li>}
                  {fields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RuleCountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center">
      <p className="text-lg font-semibold">{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
