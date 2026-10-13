/**
 * Separator used when joining normalized SAME-field values into a single
 * composite index key. Chosen to be a control character that will never
 * appear in real spreadsheet text, so it cannot cause accidental key
 * collisions between fields.
 */
export const COMPOSITE_KEY_SEPARATOR = '␟'
