import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { KPISummary } from '@/types'
import { formatNumber, formatPercent } from '@/utils/formatters'
import { cn } from '@/utils/cn'

export interface ValidationSummaryProps {
  kpis: KPISummary
}

const COLORS = {
  duplicate: '#dc2626',
  potential: '#d97706',
  unique: '#15803d',
  error: '#6b7280',
}

export function ValidationSummary({ kpis }: ValidationSummaryProps) {
  const chartData = [
    { name: 'Duplicates', value: kpis.duplicateRecords, color: COLORS.duplicate },
    { name: 'Potential Duplicates', value: kpis.potentialDuplicateRecords, color: COLORS.potential },
    { name: 'Unique', value: kpis.uniqueRecords, color: COLORS.unique },
    { name: 'Validation Errors', value: kpis.validationErrorRecords, color: COLORS.error },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Validation Complete</p>
        <p className="text-sm text-muted-foreground">{formatNumber(kpis.totalRecords)} Records Analyzed</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Total Records" value={formatNumber(kpis.totalRecords)} />
        <KpiCard label="Duplicates" value={formatNumber(kpis.duplicateRecords)} tone="destructive" />
        <KpiCard label="Potential Duplicates" value={formatNumber(kpis.potentialDuplicateRecords)} tone="warning" />
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
