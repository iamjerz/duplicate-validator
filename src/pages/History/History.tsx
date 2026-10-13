import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSessionHistory } from '@/hooks'
import { formatNumber, formatPercent } from '@/utils/formatters'

export function History() {
  const { history, clearHistory } = useSessionHistory()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">History</h1>
          <p className="text-sm text-muted-foreground">
            Current-session run history only, stored as lightweight metadata in your browser.
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearHistory}>
            Clear History
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet in this browser.</p>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{entry.fileName}</p>
                  {entry.analysis && <p className="text-xs text-muted-foreground">{entry.analysis}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(entry.ranAt).toLocaleString()}</p>
                </div>
                <div className="text-right text-sm">
                  <p>{formatNumber(entry.kpis.totalRecords)} records</p>
                  <p className="text-muted-foreground">
                    {formatNumber(entry.kpis.duplicateRecords)} duplicates - {formatPercent(entry.kpis.duplicateRate)}
                  </p>
                  {entry.reviewActivity && entry.reviewActivity.totalFlaggedGroups > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(entry.reviewActivity.reviewedGroups)}/{formatNumber(entry.reviewActivity.totalFlaggedGroups)}{' '}
                      groups reviewed
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
