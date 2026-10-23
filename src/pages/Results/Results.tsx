import { useEffect, useMemo, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ValidationSummary } from '@/components/ValidationSummary'
import { DuplicateTable } from '@/components/DuplicateTable'
import { RuleVerdictTabs } from '@/components/DuplicateDetails'
import { ValidationErrorsList } from '@/components/ValidationErrorsList'
import { ExportMenu } from '@/components/ExportMenu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { useSessionHistory } from '@/hooks'
import { computeReviewActivity, resolveDuplicateTypeLabel } from '@/engine'
import type { Disposition, DuplicateGroup, RuleDefinition, RuleSet } from '@/types'

const EMPTY_DISPOSITIONS: Map<string, Disposition> = new Map()
const EMPTY_COMMENTS: Map<string, string> = new Map()

interface SelectedGroup {
  group: DuplicateGroup
  ruleDefinition: RuleDefinition
}

export function Results() {
  const {
    validationResults,
    ruleDefinitions,
    excelDataset,
    dispositions,
    setDisposition,
    comments,
    setComment,
    historyEntryIdByRule,
  } = useValidationSession()
  const { updateReviewActivity } = useSessionHistory()
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null)

  // Keeps each rule's History entry's reviewActivity live-updated as the
  // reviewer sets Dispositions/Comments here - never a one-time snapshot, so
  // the Reporting page's review-completion figure is never stale while a run
  // is still being worked through. A no-op for any rule whose History entry
  // was never registered (shouldn't happen for a normal run - see
  // NewValidation.tsx) or has since aged out of the capped history list.
  useEffect(() => {
    for (const outcome of validationResults) {
      const historyEntryId = historyEntryIdByRule.get(outcome.ruleDefinitionId)
      if (!historyEntryId) continue
      const activity = computeReviewActivity(
        outcome.result.groups,
        dispositions.get(outcome.ruleDefinitionId) ?? EMPTY_DISPOSITIONS,
        comments.get(outcome.ruleDefinitionId) ?? EMPTY_COMMENTS
      )
      updateReviewActivity(historyEntryId, activity)
    }
  }, [validationResults, dispositions, comments, historyEntryIdByRule, updateReviewActivity])

  // rowIndex -> the (2+ record) group that row belongs to, per rule. Lets the
  // Group Details modal answer "are these same records also grouped under
  // this OTHER rule?" with a lookup instead of recomputing anything - every
  // rule already ran its own full, correct pass over the whole dataset.
  const groupIndexByRule = useMemo(() => {
    const outer = new Map<string, Map<number, DuplicateGroup>>()
    for (const outcome of validationResults) {
      const inner = new Map<number, DuplicateGroup>()
      for (const g of outcome.result.groups) {
        if (g.records.length < 2) continue
        for (const record of g.records) inner.set(record.rowIndex, g)
      }
      outer.set(outcome.ruleDefinitionId, inner)
    }
    return outer
  }, [validationResults])

  // The RuleSet actually used to produce each rule's results - a field the
  // rule declared but that had no mapped column was excluded from that run,
  // and a SAME field flagged "Allow blank" was promoted to UNIQUE for it
  // (see deriveEffectiveRuleSet), so the Group Details modal must
  // color/judge fields using this, not the rule definition's own original
  // ruleSet.
  const effectiveRuleSetByRule = useMemo(() => {
    const map = new Map<string, RuleSet>()
    for (const outcome of validationResults) map.set(outcome.ruleDefinitionId, outcome.effectiveRuleSet)
    return map
  }, [validationResults])

  if (validationResults.length === 0 || !excelDataset) {
    return <Navigate to="/new" replace />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Validation Results</h1>
          <p className="text-sm text-muted-foreground">{excelDataset.fileName}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/new">New Validation</Link>
        </Button>
      </div>

      <Tabs defaultValue={validationResults[0].ruleDefinitionId}>
        {validationResults.length > 1 && (
          <TabsList>
            {validationResults.map((outcome) => {
              const def = ruleDefinitions.find((d) => d.id === outcome.ruleDefinitionId)
              return (
                <TabsTrigger key={outcome.ruleDefinitionId} value={outcome.ruleDefinitionId}>
                  {def?.metadata?.analysis ?? def?.fileName ?? 'Rule'}
                </TabsTrigger>
              )
            })}
          </TabsList>
        )}

        {validationResults.map((outcome) => {
          const def = ruleDefinitions.find((d) => d.id === outcome.ruleDefinitionId)
          if (!def) return null
          const isSelectedInThisTab = selectedGroup?.ruleDefinition.id === def.id

          return (
            <TabsContent key={outcome.ruleDefinitionId} value={outcome.ruleDefinitionId} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {def.metadata?.analysis && <p className="text-sm font-medium">{def.metadata.analysis}</p>}
                  <p className="text-xs text-muted-foreground">{def.fileName}</p>
                </div>
                <ExportMenu
                  dataset={excelDataset}
                  result={outcome.result}
                  dispositions={dispositions.get(def.id) ?? EMPTY_DISPOSITIONS}
                  comments={comments.get(def.id) ?? EMPTY_COMMENTS}
                />
              </div>

              <ValidationSummary kpis={outcome.result.kpis} />

              <Tabs defaultValue="groups">
                <TabsList>
                  <TabsTrigger value="groups">Duplicate Groups</TabsTrigger>
                  <TabsTrigger value="errors">Validation Errors ({outcome.result.validationErrors.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="groups">
                  <DuplicateTable
                    groups={outcome.result.groups}
                    onSelectGroup={(group) => setSelectedGroup({ group, ruleDefinition: def })}
                    selectedGroupId={isSelectedInThisTab ? selectedGroup?.group.id : undefined}
                    ruleTypeLabel={resolveDuplicateTypeLabel(def.metadata?.analysis, def.fileName)}
                  />
                </TabsContent>
                <TabsContent value="errors">
                  <ValidationErrorsList errors={outcome.result.validationErrors} />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )
        })}
      </Tabs>

      <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-y-auto">
          {selectedGroup && (
            <>
              <DialogHeader>
                <DialogTitle>Group Details</DialogTitle>
              </DialogHeader>
              <RuleVerdictTabs
                ruleDefinitions={ruleDefinitions}
                originalGroup={selectedGroup.group}
                originalRuleDefinitionId={selectedGroup.ruleDefinition.id}
                groupIndexByRule={groupIndexByRule}
                effectiveRuleSetByRule={effectiveRuleSetByRule}
                dispositions={dispositions}
                onSetDisposition={setDisposition}
                comments={comments}
                onSetComment={setComment}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
