import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { KPISummary } from '@/types'
import { classifyDuplicateType, resolveDuplicateTypeLabel } from '@/engine'
import { formatNumber, formatPercent } from '@/utils/formatters'
import { cn } from '@/utils/cn'

export interface ValidationSummaryProps {
  kpis: KPISummary
  /** This rule's own Analysis text, used (with ruleFallbackName) to resolve the combined flagged-records card/slice's label and color - see buildDuplicateGroupColumns, which the Results table's Status column and the Duplicate Groups filter checkboxes already resolve the exact same way. */
  ruleAnalysis: string | undefined
  /** Shown as the flagged-records label instead when ruleAnalysis doesn't resolve to a known duplicate type - typically the rule's own uploaded file name. */
  ruleFallbackName: string
}

const COLORS = {
  duplicate: '#dc2626',
  potential: '#d97706',
  unique: '#15803d',
  error: '#6b7280',
  /** A rule whose Analysis doesn't resolve to a known type - same neutral gray as "secondary" Badge variants elsewhere (e.g. columns.tsx's ruleTypeBadgeVariant). */
  unknown: '#6b7280',
}

/**
 * KPIs and the Record Breakdown chart used to split "Duplicates" and
 * "Potential Duplicates" into two separate figures, driven by each group's
 * own raw engine status (DUPLICATE vs POTENTIAL_DUPLICATE). But the Results
 * table's Status column (and its filter checkboxes) collapsed that same
 * split into one rule-driven label a while back - every flagged row under
 * one rule shows that rule's own type (e.g. "True Duplicate"), regardless of
 * which raw engine status produced it - so showing two separate numbers here
 * no longer corresponds to anything a reviewer can actually see distinguished
 * in the table below. This combines them into one figure, labeled and colored
 * the same way: red "True Duplicate" for a True-Duplicate rule, amber
 * "Potential Duplicate" for a Potential-Duplicate rule, or gray
 * `ruleFallbackName` (typically the rule's file name) when Analysis doesn't
 * resolve to either - exactly the same three-way resolution
 * buildDuplicateGroupColumns and the filter checkboxes use, so a reviewer
 * uploading, say, one True-Duplicate rule and one Potential-Duplicate rule
 * sees "True Duplicate" on one rule's tab and "Potential Duplicate" on the
 * other's - never a generic, undifferentiated "Duplicates" on both.
 */
export function ValidationSummary({ kpis, ruleAnalysis, ruleFallbackName }: ValidationSummaryProps) {
  const classification = classifyDuplicateType(ruleAnalysis)
  const flaggedLabel = resolveDuplicateTypeLabel(ruleAnalysis, ruleFallbackName)
  const flaggedRecords = kpis.duplicateRecords + kpis.potentialDuplicateRecords
  const flaggedColor =
    classification === 'true-duplicate' ? COLORS.duplicate : classification === 'potential-duplicate' ? COLORS.potential : COLORS.unknown
  const flaggedTone: 'destructive' | 'warning' | undefined =
    classification === 'true-duplicate' ? 'destructive' : classification === 'potential-duplicate' ? 'warning' : undefined

  const chartData = [
    { name: flaggedLabel, value: flaggedRecords, color: flaggedColor },
    { name: 'Unique', value: kpis.uniqueRecords, color: COLORS.unique },
    { name: 'Validation Errors', value: kpis.validationErrorRecords, color: COLORS.error },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Validation Complete</p>
        <p className="text-sm text-muted-foreground">{formatNumber(kpis.totalRecords)} Records Analyzed</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Records" value={formatNumber(kpis.totalRecords)} />
        <KpiCard label={flaggedLabel} value={formatNumber(flaggedRecords)} tone={flaggedTone} />
        <KpiCard label="Unique" value={formatNumber(kpis.uniqueRecords)} tone="success" />
        <KpiCard label="Duplicate Rate" value={formatPercent(kpis.duplicateRate)} />
      </div>

      {kpis.validationErrorRecords > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatNumber(kpis.validationErrorRecords)} record{kpis.validationErrorRecords === 1 ? '' : 's'} could not be
          compared due to missing required fields (see Validation Errors).
        </p>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatNumber(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'destructive' | 'warning' | 'success' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold',
            tone === 'destructive' && 'text-destructive',
            tone === 'warning' && 'text-warning',
            tone === 'success' && 'text-success'
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
