import type { BlankKind, CellValue, NormalizedValue } from '@/types'

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function toISODateString(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Attempts to parse a date out of a string using the formats called out by
 * the application's normalization policy: ISO (2026-09-14), US-style
 * slash/dash (09/14/2026), and long month names (September 14, 2026).
 * Falls back to the platform's Date parser for anything else recognizable.
 */
export function parseDateLike(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    if (!Number.isNaN(date.getTime())) return date
  }

  const usMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (usMatch) {
    const [, mm, dd, yy] = usMatch
    let year = Number(yy)
    if (year < 100) year += year < 70 ? 2000 : 1900
    const month = Number(mm)
    const day = Number(dd)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day))
      if (!Number.isNaN(date.getTime())) return date
    }
  }

  const longMatch = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (longMatch) {
    const [, monthName, dd, yy] = longMatch
    const month = MONTH_NAMES[monthName.toLowerCase()]
    if (month !== undefined) {
      const date = new Date(Date.UTC(Number(yy), month, Number(dd)))
      if (!Number.isNaN(date.getTime())) return date
    }
  }

  const fallback = new Date(trimmed)
  if (!Number.isNaN(fallback.getTime())) return fallback

  return null
}

/** Strips currency symbols, thousands separators and accounting-style parens. */
export function parseNumberLike(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const isParenNegative = /^\(.*\)$/.test(trimmed)
  const unwrapped = trimmed.replace(/^\((.*)\)$/, '$1')
  const cleaned = unwrapped.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const num = Number(cleaned)
  if (Number.isNaN(num)) return null
  return isParenNegative ? -Math.abs(num) : num
}

function looksLikeNumber(value: string): boolean {
  return /^[$€£]?\s*\(?-?[\d,]+(\.\d+)?\)?\s*%?$/.test(value)
}

function looksLikeDate(value: string): boolean {
  return (
    /^\d{4}-\d{1,2}-\d{1,2}/.test(value) ||
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value) ||
    /^[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}$/.test(value)
  )
}

/**
 * Many source systems (this app was built against freight-invoice audit
 * exports) use a lone dash as their universal "no value here" token across
 * every column type - string, date, or amount alike - rather than leaving
 * the cell genuinely empty. A cell that is nothing but one or more dashes
 * once trimmed (" -   ", "--") is exactly that convention, not a real
 * value, so it is classified as blank the same as an empty or
 * whitespace-only cell. This matters most for amount-style SAME fields that
 * only carry a real figure while a record is in some active status (e.g.
 * "Invoice Approved Amount" is blank-dashed whenever "Invoice Status" is
 * VOID/CLOSED) - without this, a voided record and its still-open duplicate
 * would be compared as the literal strings "-" vs "578.04" and never match,
 * even though "-" was never meant to be a comparable value at all.
 */
const PLACEHOLDER_BLANK_PATTERN = /^-+$/

function classifyBlank(raw: CellValue): BlankKind | null {
  if (raw === null || raw === undefined) return 'null'
  if (typeof raw === 'string') {
    if (raw.length === 0) return 'empty'
    const trimmed = raw.trim()
    if (trimmed.length === 0) return 'whitespace'
    if (PLACEHOLDER_BLANK_PATTERN.test(trimmed)) return 'placeholder'
  }
  return null
}

function roundForComparison(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

const CODE_AMOUNT_ENTRY_PATTERN = /^(.+?)\s*:\s*(-?[\d,]+(?:\.\d+)?)$/

/**
 * Some source systems export a charges/amount cell as a JSON array of
 * "CODE : amount" strings instead of a plain number, e.g. `["VCK :
 * 1129.44000"]`, or with several charge codes on one row. Every entry is
 * summed into one comparable number; the original code/amount pairs are
 * kept (reformatted, not the raw JSON) as the display text so nothing is
 * hidden from the user. Returns null for anything that isn't exactly this
 * shape, so a plain string or a genuinely malformed array is left untouched
 * by the caller.
 */
function tryParseCodeAmountArray(trimmed: string): { display: string; sum: number } | null {
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null

  const entries: { code: string; amountText: string; amount: number }[] = []
  for (const item of parsed) {
    if (typeof item !== 'string') return null
    const match = item.trim().match(CODE_AMOUNT_ENTRY_PATTERN)
    if (!match) return null
    const amount = parseNumberLike(match[2])
    if (amount === null) return null
    entries.push({ code: match[1].trim(), amountText: match[2], amount })
  }

  return {
    // Original code/amount text verbatim (e.g. "1129.44000", not the rounded
    // 1129.44 used for comparison) - the user asked to keep the original
    // display alongside the summed value used for matching.
    display: entries.map((e) => `${e.code}: ${e.amountText}`).join('; '),
    sum: entries.reduce((total, e) => total + e.amount, 0),
  }
}

/**
 * Normalizes a single raw cell value for comparison.
 *
 * Design note: genuine Excel date cells are read upstream with
 * `cellDates: true`, so they arrive here as real `Date` instances rather
 * than raw serial numbers. That means a bare `number` is never guessed to
 * be a date serial here, which avoids misreading amounts (e.g. an invoice
 * total of 46000) as dates. Text that merely *looks* like a date (typed or
 * pasted as text) is still detected via pattern matching.
 */
export function normalizeValue(raw: CellValue): NormalizedValue {
  const blank = classifyBlank(raw)
  if (blank) {
    return { raw, display: '', normalized: null, kind: blank, valueType: 'unknown' }
  }

  if (raw instanceof Date) {
    const iso = toISODateString(raw)
    return { raw, display: iso, normalized: iso, kind: 'value', valueType: 'date' }
  }

  if (typeof raw === 'boolean') {
    return { raw, display: raw ? 'TRUE' : 'FALSE', normalized: raw ? 1 : 0, kind: 'value', valueType: 'boolean' }
  }

  if (typeof raw === 'number') {
    return { raw, display: String(raw), normalized: roundForComparison(raw), kind: 'value', valueType: 'number' }
  }

  // Unreachable at runtime (classifyBlank already caught null/undefined
  // above) - this only satisfies strict-null-check narrowing so `raw` below
  // is known to be a string without an unsafe cast.
  if (raw === null) {
    return { raw, display: '', normalized: null, kind: 'null', valueType: 'unknown' }
  }

  const trimmed = raw.trim().replace(/\s+/g, ' ')

  const codeAmount = tryParseCodeAmountArray(trimmed)
  if (codeAmount) {
    return { raw, display: codeAmount.display, normalized: roundForComparison(codeAmount.sum), kind: 'value', valueType: 'number' }
  }

  if (looksLikeDate(trimmed)) {
    const date = parseDateLike(trimmed)
    if (date) {
      const iso = toISODateString(date)
      return { raw, display: trimmed, normalized: iso, kind: 'value', valueType: 'date' }
    }
    return { raw, display: trimmed, normalized: trimmed.toLowerCase(), kind: 'value', valueType: 'date', unparseable: true }
  }

  if (looksLikeNumber(trimmed)) {
    const num = parseNumberLike(trimmed)
    if (num !== null) {
      return { raw, display: trimmed, normalized: roundForComparison(num), kind: 'value', valueType: 'number' }
    }
  }

  return { raw, display: trimmed, normalized: trimmed.toLowerCase(), kind: 'value', valueType: 'string' }
}

export function isBlank(value: NormalizedValue): boolean {
  return value.kind !== 'value'
}

/** Two blank values are never considered a meaningful match. */
export function normalizedValuesEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  if (isBlank(a) || isBlank(b)) return false
  return a.normalized === b.normalized
}
