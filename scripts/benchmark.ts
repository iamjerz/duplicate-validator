/**
 * Standalone performance benchmark for the duplicate-detection engine.
 *
 * Run with:  npm run benchmark
 *
 * This generates synthetic datasets at increasing scale (10,000 / 100,000 /
 * 500,000 records) and runs them through the exact same engine the app
 * uses, end to end (indexing -> grouping -> classifying -> explaining). It
 * exists to demonstrate, with real numbers on your machine, that the
 * Map-based design scales close to linearly with row count rather than
 * quadratically (no row-by-row O(n^2) comparisons anywhere in the engine).
 *
 * This script intentionally uses relative imports (not the "@/" alias) so
 * it can run standalone under `tsx` without depending on Vite's resolver.
 */
import { runDuplicateValidation } from '../src/engine/DuplicateValidationEngine'
import { buildRuleSet } from '../src/engine/RuleValidator'
import { buildColumnMapping } from '../src/engine/ColumnMapper'
import type { CellValue } from '../src/types'

const HEADERS = [
  'Root Id',
  'Invoice Number',
  'Client Code',
  'Carrier Code',
  'Invoice Date',
  'Currency',
  'Invoice Amount',
  'Invoice Approved Amount',
  'Invoice Account Number',
  'Audit ID',
  'Invoice Id',
  'Invoice Due Date',
]

const RULES: Record<string, string> = {
  'Root Id': 'SAME',
  'Invoice Number': 'SAME',
  'Client Code': 'SAME',
  'Carrier Code': 'SAME',
  'Invoice Date': 'SAME',
  Currency: 'SAME',
  'Invoice Amount': 'SAME',
  'Invoice Approved Amount': 'SAME',
  'Invoice Account Number': 'SAME',
  'Audit ID': 'UNIQUE',
  'Invoice Id': 'UNIQUE',
  'Invoice Due Date': 'OPTIONAL',
}

/**
 * Generates `count` rows in repeating blocks of 10:
 *  - positions 0-5: six distinct, unrelated "unique" records
 *  - position 7: a fresh "unique" record
 *  - position 8: an EXACT clone of position 7 (including Audit ID) -> the
 *    pair (7, 8) shares identical SAME and UNIQUE fields -> DUPLICATE
 *  - position 9: shares position 6's SAME fields but gets its own Audit ID
 *    -> the pair (6, 9) shares SAME fields but differs on a UNIQUE field ->
 *    POTENTIAL_DUPLICATE
 * Positions 6, 7, 8 and 9 are kept independent of each other on purpose
 * (each duplicate/potential pair points at its own untouched base row) so
 * the two kinds of matches never accidentally merge into one group.
 */
function generateRows(count: number): CellValue[][] {
  const rows: CellValue[][] = []
  for (let i = 0; i < count; i++) {
    const posInBlock = i % 10

    if (posInBlock === 8) {
      rows.push([...rows[i - 1]]) // exact clone of position 7 -> DUPLICATE
      continue
    }

    if (posInBlock === 9) {
      const base = rows[i - 3] // position 6, untouched by the position-8 clone -> POTENTIAL_DUPLICATE
      rows.push([...base.slice(0, 9), `A-${i}`, ...base.slice(10)])
      continue
    }

    rows.push([
      `ROOT-${i}`,
      `INV-${i}`,
      'ABC',
      'FX',
      '09/15/2026',
      'USD',
      100 + (i % 500),
      100 + (i % 500),
      'ACCT-1',
      `A-${i}`,
      `IID-${i}`,
      '09/20/2026',
    ])
  }
  return rows
}

function runScale(count: number) {
  const ruleSetResult = buildRuleSet(Object.entries(RULES).map(([field, value]) => ({ field, value })))
  if (!ruleSetResult.success || !ruleSetResult.ruleSet) throw new Error('Invalid benchmark rule set')
  const ruleSet = ruleSetResult.ruleSet
  const mapping = buildColumnMapping(ruleSet, HEADERS).entries

  const rows = generateRows(count)
  const excelRowNumbers = rows.map((_, i) => i + 2)

  const memBefore = process.memoryUsage().heapUsed
  const start = performance.now()
  const result = runDuplicateValidation({ headers: HEADERS, rows, excelRowNumbers, ruleSet, mapping })
  const elapsedMs = performance.now() - start
  const memAfterMb = (process.memoryUsage().heapUsed - memBefore) / (1024 * 1024)

  console.log(`\n${count.toLocaleString()} records`)
  console.log(`  time:               ${elapsedMs.toFixed(0)} ms  (${(elapsedMs / count).toFixed(4)} ms/record)`)
  console.log(`  heap delta:         ${memAfterMb.toFixed(1)} MB`)
  console.log(`  duplicate groups:   ${result.kpis.duplicateGroups.toLocaleString()}`)
  console.log(`  potential groups:   ${result.kpis.potentialDuplicateGroups.toLocaleString()}`)
  console.log(`  unique records:     ${result.kpis.uniqueRecords.toLocaleString()}`)
  console.log(`  duplicate rate:     ${result.kpis.duplicateRate.toFixed(2)}%`)
}

console.log('Duplicate Validator - engine performance benchmark')
console.log('Verifies near-linear scaling: no row-by-row O(n^2) comparisons anywhere in the pipeline.')

for (const scale of [10_000, 100_000, 500_000]) {
  runScale(scale)
}

console.log('\nDone. Time per record should stay roughly flat as record count grows by 10x/50x above.')
