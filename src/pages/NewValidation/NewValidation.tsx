import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUploader } from '@/components/FileUploader'
import { ExcelPreview } from '@/components/ExcelPreview'
import { RuleUploader } from '@/components/RuleUploader'
import { RuleSummary, ColumnMappingPanel, RuleInterpretationGuide } from '@/components/RuleSummary'
import { ValidationProgress } from '@/components/ValidationProgress'
import { PrivacyNotice } from '@/components/PrivacyNotice'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { useMultiRuleValidation, useSessionHistory } from '@/hooks'
import { deriveEffectiveRuleSet, allRuleDefinitionsRunnable, findSavedRuleForDefinition } from '@/engine'
import { nextHistoryRunId } from '@/utils/id'

export function NewValidation() {
  const navigate = useNavigate()
  const { excelDataset, ruleDefinitions, mapping, savedRules, setValidationResults, registerHistoryEntryId } =
    useValidationSession()
  const { runAll, outcomes, currentRuleNumber, totalRules, currentRuleDefinition, stepProgress, isRunning, error } =
    useMultiRuleValidation()
  const { addEntry } = useSessionHistory()

  // A field with no mapped column is excluded from the run rather than
  // blocking it, and a SAME field flagged "Allow blank" is excluded from
  // grouping requirements too (see deriveEffectiveRuleSet) - so this is only
  // false when a rule would have zero mapped, still-required SAME fields
  // left, i.e. grouping would be impossible, not merely incomplete. Shared
  // with RuleInterpretationGuide and ColumnMappingPanel so every "is this
  // ready" indicator agrees.
  const allRulesRunnable = allRuleDefinitionsRunnable(ruleDefinitions, mapping, excelDataset, savedRules)

  const readyToValidate = Boolean(excelDataset && excelDataset.totalRecords > 0 && allRulesRunnable)

  useEffect(() => {
    // Only a freshly-completed batch (every queued rule has reported back) should navigate away.
    if (isRunning || outcomes.length === 0 || outcomes.length !== totalRules) return

    setValidationResults(outcomes)
    if (excelDataset) {
      // Computed once for the whole batch, not per rule: every rule-outcome
      // entry from this one run shares both a timestamp and a runId, so
      // Reporting can later tell "one run, three rules" apart from "three
      // separate runs" when counting runs / summing records (see
      // ReportingAggregates.oneEntryPerRun) without relying on timestamps
      // alone, which could otherwise collide or drift within one batch.
      const runId = nextHistoryRunId()
      const ranAt = new Date().toISOString()
      for (const outcome of outcomes) {
        const def = ruleDefinitions.find((d) => d.id === outcome.ruleDefinitionId)
        const historyEntryId = `${Date.now()}-${outcome.ruleDefinitionId}`
        addEntry({
          id: historyEntryId,
          runId,
          fileName: excelDataset.fileName,
          ranAt,
          kpis: outcome.result.kpis,
          analysis: def?.metadata?.analysis,
        })
        // Lets Results.tsx keep this entry's reviewActivity live-updated as
        // Dispositions/Comments are recorded against this rule's groups.
        registerHistoryEntryId(outcome.ruleDefinitionId, historyEntryId)
      }
    }
    navigate('/results')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, outcomes, totalRules])

  const handleStart = () => {
    if (!excelDataset || !mapping || ruleDefinitions.length === 0) return
    // Run with each rule's EFFECTIVE ruleSet (unmapped fields excluded, and
    // any SAME field flagged "Allow blank" promoted to UNIQUE for this run -
    // see deriveEffectiveRuleSet) - never the original - so the engine, the
    // resulting outcome's `effectiveRuleSet`, and everything that later
    // displays this run all agree on what was actually compared.
    const effectiveRuleDefinitions = ruleDefinitions.map((def) => ({
      ...def,
      ruleSet: deriveEffectiveRuleSet(
        def.ruleSet,
        mapping,
        excelDataset.headers,
        excelDataset.rows,
        findSavedRuleForDefinition(def, savedRules)?.blankOverrides
      ),
    }))
    runAll(effectiveRuleDefinitions, {
      headers: excelDataset.headers,
      rows: excelDataset.rows,
      excelRowNumbers: excelDataset.excelRowNumbers,
      mapping: mapping.entries,
    })
  }

  if (isRunning) {
    return (
      <ValidationProgress
        currentStepId={stepProgress.stepId}
        percent={stepProgress.percent}
        totalRecords={excelDataset?.totalRecords ?? 0}
        currentRuleNumber={currentRuleNumber}
        totalRules={totalRules}
        currentRuleLabel={currentRuleDefinition?.metadata?.analysis ?? currentRuleDefinition?.fileName}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Excel Duplicate Validator</h1>
        <p className="mt-1 text-muted-foreground">
          Upload your Excel file and validation rules to identify duplicate records.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StepBadge n={1} />
            Excel File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUploader />
          <PrivacyNotice />
          {excelDataset && <ExcelPreview />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StepBadge n={2} />
            Validation Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RuleUploader />
        </CardContent>
      </Card>

      {ruleDefinitions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rule Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <RuleSummary />
          </CardContent>
        </Card>
      )}

      {ruleDefinitions.length > 0 && excelDataset && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Column Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnMappingPanel />
          </CardContent>
        </Card>
      )}

      {ruleDefinitions.length > 0 && excelDataset && (
        <Card>
          <CardContent className="pt-6">
            <RuleInterpretationGuide />
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">
          {error.fileName ? `${error.fileName}: ` : ''}
          {error.message}
        </p>
      )}

      <div className="flex justify-center pb-8">
        <Button size="lg" className="gap-2" disabled={!readyToValidate} onClick={handleStart}>
          <PlayCircle className="h-5 w-5" />
          Start Validation{ruleDefinitions.length > 1 ? ` (${ruleDefinitions.length} rules)` : ''}
        </Button>
      </div>
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
      {n}
    </span>
  )
}
