import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { toSerializedRuleFile, ruleFieldsEqual, findSavedRuleForDefinition } from '@/engine'
import { nextSavedRuleId } from '@/utils/id'
import type { RuleDefinition, SavedRule } from '@/types'

const STORAGE_KEY = 'duplicate-validator:saved-rules'
const MAX_SAVED_RULES = 50

/**
 * The user's persistent library of rule files (localStorage, this browser
 * only) - separate from, and unaffected by, "Clear Session" (same precedent
 * as History's own independent "Clear History" button). Rules here are
 * editable from the Rules page and can be loaded into a new validation run
 * at any time; editing an entry never changes a RuleDefinition already
 * active in the current session, only what a future load produces.
 */
export function useSavedRules() {
  const [savedRules, setSavedRules] = useLocalStorage<SavedRule[]>(STORAGE_KEY, [])

  /**
   * Explicit create/update from the Rules page editor - upserts by id,
   * moving the entry to the front either way. Keeping the array ordered by
   * "most recently touched first" makes the MAX_SAVED_RULES cap below evict
   * genuinely stale entries rather than whichever happened to be inserted
   * least recently.
   */
  const saveRuleToLibrary = useCallback(
    (rule: SavedRule) => {
      setSavedRules((prev) => [rule, ...prev.filter((r) => r.id !== rule.id)].slice(0, MAX_SAVED_RULES))
    },
    [setSavedRules]
  )

  const deleteSavedRule = useCallback((id: string) => setSavedRules((prev) => prev.filter((r) => r.id !== id)), [setSavedRules])

  /**
   * Called automatically for every rule file successfully uploaded anywhere
   * in the app (see ValidationSessionContext.processRuleFilesBatch), so
   * saving to the library never requires a separate step. If an entry with
   * identical content already exists (by fileName + fields), only its saved
   * timestamp is refreshed - re-uploading the same file on a later visit
   * shouldn't clutter the library with duplicates.
   */
  const saveRuleFromDefinition = useCallback(
    (def: RuleDefinition) => {
      const serialized = toSerializedRuleFile(def)
      setSavedRules((prev) => {
        const existing = prev.find((r) => r.fileName === serialized.fileName && ruleFieldsEqual(r.fields, serialized.fields))
        const savedAt = new Date().toISOString()
        const rest = prev.filter((r) => r.id !== existing?.id)
        const touched: SavedRule = existing
          ? { ...existing, savedAt, metadata: serialized.metadata }
          : {
              id: nextSavedRuleId(),
              name: def.metadata?.analysis ?? def.fileName,
              fileName: serialized.fileName,
              fields: serialized.fields,
              metadata: serialized.metadata,
              savedAt,
            }
        // Moved to the front either way (new insert or refreshed timestamp) - see saveRuleToLibrary's comment.
        return [touched, ...rest].slice(0, MAX_SAVED_RULES)
      })
    },
    [setSavedRules]
  )

  /**
   * Records (or forgets) a manual column choice for one field on the library
   * entry that matches this RuleDefinition's content, so the next time this
   * rule is used - against this Excel file again or a new one with the same
   * odd column name - the choice is applied automatically (see
   * applyRememberedColumnMappings in ColumnMapper.ts). Pass a column name to
   * remember a manual pick or an accepted suggestion; pass `null` to forget
   * a previously-remembered choice for this field (the user cleared it back
   * to "Not mapped") - forgetting matters just as much as remembering, since
   * otherwise a later mapping recompute (a new sheet, an added rule, etc.)
   * would silently resurrect the exact column the user just cleared. A no-op
   * if no matching library entry exists, or if there's nothing to change
   * (e.g. clearing a field that had no remembered entry to begin with);
   * otherwise the touched entry is refreshed and moved to the front, same as
   * any other library touch.
   */
  const rememberColumnMapping = useCallback(
    (def: RuleDefinition, jsonField: string, excelColumn: string | null) => {
      setSavedRules((prev) => {
        const existing = findSavedRuleForDefinition(def, prev)
        if (!existing) return prev
        if (excelColumn === null && existing.columnMapping?.[jsonField] === undefined) return prev

        const nextMapping = { ...existing.columnMapping }
        if (excelColumn === null) {
          delete nextMapping[jsonField]
        } else {
          nextMapping[jsonField] = excelColumn
        }

        const touched: SavedRule = {
          ...existing,
          columnMapping: Object.keys(nextMapping).length > 0 ? nextMapping : undefined,
          savedAt: new Date().toISOString(),
        }
        const rest = prev.filter((r) => r.id !== existing.id)
        return [touched, ...rest].slice(0, MAX_SAVED_RULES)
      })
    },
    [setSavedRules]
  )

  /**
   * Records (or forgets) an explicit "allow blank" choice for one SAME field
   * on the library entry that matches this RuleDefinition's content - the
   * same idea, and the same matching, as rememberColumnMapping, just for
   * BlankAllowance.ts's per-field override instead of a column choice. Pass
   * `true`/`false` to explicitly allow/disallow blanks on this field for
   * every future run of this rule; pass `undefined` to forget the override
   * and go back to this file's own auto-detected suggestion (see
   * resolveAllowBlankFields). A no-op if no matching library entry exists,
   * or if there's nothing to change.
   */
  const setBlankOverride = useCallback(
    (def: RuleDefinition, field: string, allow: boolean | undefined) => {
      setSavedRules((prev) => {
        const existing = findSavedRuleForDefinition(def, prev)
        if (!existing) return prev
        if (allow === undefined && existing.blankOverrides?.[field] === undefined) return prev

        const nextOverrides = { ...existing.blankOverrides }
        if (allow === undefined) {
          delete nextOverrides[field]
        } else {
          nextOverrides[field] = allow
        }

        const touched: SavedRule = {
          ...existing,
          blankOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
          savedAt: new Date().toISOString(),
        }
        const rest = prev.filter((r) => r.id !== existing.id)
        return [touched, ...rest].slice(0, MAX_SAVED_RULES)
      })
    },
    [setSavedRules]
  )

  return { savedRules, saveRuleToLibrary, deleteSavedRule, saveRuleFromDefinition, rememberColumnMapping, setBlankOverride }
}
