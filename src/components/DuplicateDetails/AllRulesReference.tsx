import { useValidationSession } from '@/context/ValidationSessionContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RuleValue } from '@/types'
import { cn } from '@/utils/cn'

const RULE_BADGE_CLASS: Record<RuleValue, string> = {
  SAME: 'bg-success/10 text-success',
  UNIQUE: 'bg-destructive/10 text-destructive',
  OPTIONAL: 'bg-warning/10 text-warning',
  'N/A': 'bg-muted text-muted-foreground',
}

export interface AllRulesReferenceProps {
  /** The rule that produced the group currently being viewed, highlighted for context. */
  activeRuleDefinitionId?: string
}

/**
 * Reference listing of every uploaded rule's field -> rule mapping. Shown
 * alongside a group's details so the user can see how every loaded rule
 * defines SAME/UNIQUE/OPTIONAL/N/A - each rule gets its own card and these
 * are never merged into one combined table, since two rules can (and often
 * do) classify the same field differently.
 */
export function AllRulesReference({ activeRuleDefinitionId }: AllRulesReferenceProps) {
  const { ruleDefinitions } = useValidationSession()
  if (ruleDefinitions.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Uploaded Rule Definitions ({ruleDefinitions.length})
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ruleDefinitions.map((def) => (
          <Card key={def.id} className={cn(def.id === activeRuleDefinitionId && 'border-primary')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{def.metadata?.analysis ?? def.fileName}</CardTitle>
              {def.metadata?.analysis && <p className="text-xs text-muted-foreground">{def.fileName}</p>}
            </CardHeader>
            <CardContent className="max-h-64 space-y-1.5 overflow-y-auto">
              {def.ruleSet.fields.map(({ field, rule }) => (
                <div key={field} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" title={field}>
                    {field}
                  </span>
                  <Badge variant="secondary" className={cn('shrink-0 border-transparent font-normal', RULE_BADGE_CLASS[rule])}>
                    {rule}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
