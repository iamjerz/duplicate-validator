import { BarChart3 } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSessionHistory } from '@/hooks'
import {
  totalRuns,
  totalRecordsProcessed,
  pooledAutomationRate,
  automationRateTrend,
  pooledReviewCompletionRate,
  reviewCompletionTrend,
  dispositionTotals,
  ruleBreakdown,
  type RatePoint,
} from '@/engine'
import { formatNumber, formatPercent } from '@/utils/formatters'

/** "—" rather than "0%"/"NaN%" when there's not yet enough data to compute a rate honestly. */
function RateTile({ label, value, tone }: { label: string; value: number | null; tone: 'primary' | 'success' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-2xl font-semibold ${tone === 'success' ? 'text-success' : 'text-primary'}`}>
          {value === null ? '—' : formatPercent(value, 1)}
        </p>
      </CardContent>
    </Card>
  )
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold">{formatNumber(value)}</p>
      </CardContent>
    </Card>
  )
}

function RateTrendChart({ data, color }: { data: RatePoint[]; color: string }) {
  if (data.length === 0) {
    return <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">Not enough data yet.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
        <XAxis
          dataKey="ranAt"
          tickFormatter={(value: string) => new Date(value).toLocaleDateString()}
          tick={{ fontSize: 12 }}
          minTickGap={24}
        />
        <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fontSize: 12 }} width={44} />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Rate']}
          labelFormatter={(value: string) => new Date(value).toLocaleString()}
        />
        <Line type="monotone" dataKey="rate" stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function Reporting() {
  const { history } = useSessionHistory()

  if (history.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No validation runs yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run a validation to start building up Reporting data in this browser.
        </p>
      </div>
    )
  }

  const automationTrend = automationRateTrend(history)
  const reviewTrend = reviewCompletionTrend(history)
  const dispositions = Object.entries(dispositionTotals(history)).sort((a, b) => b[1] - a[1])
  const rules = ruleBreakdown(history)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reporting</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated across every run recorded in this browser's History (up to the last 1,000).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountTile label="Total Runs" value={totalRuns(history)} />
        <CountTile label="Records Processed" value={totalRecordsProcessed(history)} />
        <RateTile label="Automation Rate" value={pooledAutomationRate(history)} tone="primary" />
        <RateTile label="Review Completion" value={pooledReviewCompletionRate(history)} tone="success" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation Rate Over Time</CardTitle>
            <CardDescription>Share of records each rule pass classified Unique, with nothing to flag.</CardDescription>
          </CardHeader>
          <CardContent>
            <RateTrendChart data={automationTrend} color="hsl(var(--primary))" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review Completion Over Time</CardTitle>
            <CardDescription>Share of flagged groups with a recorded Disposition and/or Comment.</CardDescription>
          </CardHeader>
          <CardContent>
            <RateTrendChart data={reviewTrend} color="hsl(var(--success))" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispositions Recorded</CardTitle>
            <CardDescription>Pooled across every run with review activity recorded.</CardDescription>
          </CardHeader>
          <CardContent>
            {dispositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dispositions recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {dispositions.map(([disposition, count]) => (
                  <li key={disposition} className="flex items-center justify-between text-sm">
                    <span>{disposition}</span>
                    <span className="font-medium">{formatNumber(count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Rule</CardTitle>
            <CardDescription>How often each rule has been run, and its average duplicate rate.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Avg. Duplicate Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.label}>
                    <TableCell className="max-w-[12rem] truncate">{rule.label}</TableCell>
                    <TableCell className="text-right">{formatNumber(rule.runs)}</TableCell>
                    <TableCell className="text-right">{formatPercent(rule.avgDuplicateRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
