import { Link } from 'react-router-dom'
import { FileSearch2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { useSessionHistory } from '@/hooks'
import { formatNumber, formatPercent } from '@/utils/formatters'

export function Dashboard() {
  const { validationResults, ruleDefinitions, excelDataset } = useValidationSession()
  const { history } = useSessionHistory()
  const latest = history[0]

  if (validationResults.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <FileSearch2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No validation yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload an Excel file and validation rules to start checking for duplicates.
        </p>
        <Button asChild className="mt-6">
          <Link to="/new">Start New Validation</Link>
        </Button>

        {latest && (
          <Card className="mt-10 text-left">
            <CardContent className="p-4">
              <p className="text-sm font-medium">
                Last session ({latest.fileName}
                {latest.analysis ? ` - ${latest.analysis}` : ''})
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatNumber(latest.kpis.totalRecords)} records - {formatNumber(latest.kpis.duplicateRecords)}{' '}
                duplicates - {formatPercent(latest.kpis.duplicateRate)} duplicate rate
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // `totalRecords` is identical across every rule's outcome (same dataset, evaluated independently by each
  // rule) so it is only read once here rather than summed - summing it would multiply it by the rule count.
  const totalRecords = validationResults[0].result.kpis.totalRecords

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Latest Validation</p>
        <p className="text-sm text-muted-foreground">
          {excelDataset?.fileName} - {formatNumber(totalRecords)} records
        </p>
      </div>

      <div className="space-y-3">
        {validationResults.map((outcome) => {
          const def = ruleDefinitions.find((d) => d.id === outcome.ruleDefinitionId)
          return (
            <Card key={outcome.ruleDefinitionId}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{def?.metadata?.analysis ?? def?.fileName ?? 'Rule'}</p>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Duplicates</p>
                    <p className="mt-0.5 text-xl font-semibold text-destructive">
                      {formatNumber(outcome.result.kpis.duplicateRecords)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Potential Duplicates</p>
                    <p className="mt-0.5 text-xl font-semibold text-warning">
                      {formatNumber(outcome.result.kpis.potentialDuplicateRecords)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unique</p>
                    <p className="mt-0.5 text-xl font-semibold text-success">
                      {formatNumber(outcome.result.kpis.uniqueRecords)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link to="/results">View Full Results</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/new">Start New Validation</Link>
        </Button>
      </div>
    </div>
  )
}
