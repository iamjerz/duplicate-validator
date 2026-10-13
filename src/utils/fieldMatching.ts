/**
 * Utilities for suggesting Excel column matches for JSON rule field names.
 * Used only to *suggest* mappings - the app never silently maps a column,
 * per the column mapping requirement that every suggestion be user-confirmed.
 */

export function normalizeHeaderKey(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Finds a column in `headers` matching `targetName` case/spacing/punctuation
 * -insensitively - the same rule buildColumnMapping uses to decide an
 * "exact" field match. Used anywhere the app needs to find one of the
 * source file's own columns by a fixed, known name (e.g. "Add Action",
 * "Add Comments", "Audit ID") rather than by user-driven rule mapping.
 * Returns the header's own real text (so callers write back using the
 * file's actual casing/spacing), or null if this file has no such column.
 */
export function findColumnByName(headers: string[], targetName: string): string | null {
  const target = normalizeHeaderKey(targetName)
  return headers.find((h) => normalizeHeaderKey(h) === target) ?? null
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = temp
    }
  }
  return dp[n]
}

/** 1 = identical (after normalization), 0 = nothing in common. */
export function similarityScore(a: string, b: string): number {
  const normA = normalizeHeaderKey(a)
  const normB = normalizeHeaderKey(b)
  if (normA === normB) return 1
  if (!normA.length || !normB.length) return 0
  const distance = levenshteinDistance(normA, normB)
  const maxLen = Math.max(normA.length, normB.length)
  return 1 - distance / maxLen
}

export interface ColumnMatch {
  column: string
  score: number
}

export function findBestColumnMatch(
  jsonField: string,
  excelHeaders: string[],
  threshold = 0.6
): ColumnMatch | null {
  let best: ColumnMatch | null = null
  for (const header of excelHeaders) {
    const score = similarityScore(jsonField, header)
    if (!best || score > best.score) {
      best = { column: header, score }
    }
  }
  if (best && best.score >= threshold) return best
  return null
}
