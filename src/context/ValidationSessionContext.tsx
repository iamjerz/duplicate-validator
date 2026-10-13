import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { WorkBook } from 'xlsx'
import type {
  ColumnMappingResult,
  Disposition,
  ExcelDataset,
  ExcelFileIssue,
  RuleDefinition,
  RuleFileIssue,
  RuleFileMetadata,
  RuleSet,
  RuleValidationOutcome,
  SavedRule,
  SerializedRuleFile,
  SheetData,
  WorkbookMeta,
} from '@/types'
import {
  readWorkbookFile,
  readSheet,
  validateExcelFile,
  buildCombinedDataset,
  headersMatch,
  type SheetValidationIssue,
} from '@/services/excel'
import { readRulesFile } from '@/services/rules'
import { buildColumnMapping, applyRememberedColumnMappings, updateMappingEntry, acceptSuggestion, buildRuleSet, toSerializedRuleFile, fromSerializedRuleFile } from '@/engine'
import { nextRuleDefinitionId, nextExcelFileId } from '@/utils/id'
import { useSavedRules } from '@/hooks/useSavedRules'

/**
 * One uploaded Excel file's own raw state: its File/WorkBook/meta (read
 * once) plus whichever sheet is currently selected for it and that sheet's
 * parsed data. Kept here rather than in `@/types` because `@/types` never
 * otherwise imports from the `xlsx` package - this type exists purely to
 * drive the context's own bookkeeping, not to be threaded through the
 * engine or UI (those only ever see the combined `ExcelDataset`).
 *
 * `data` is null when the currently selected sheet couldn't be read (e.g.
 * it's empty or has no header row) - the file still appears in the upload
 * list with its own sheet picker so the user can pick a different sheet,
 * it just contributes nothing to the combined dataset until then.
 */
export interface ExcelFileEntry {
  id: string
  file: File
  workbook: WorkBook
  meta: WorkbookMeta
  sheetName: string
  data: SheetData | null
  issues: SheetValidationIssue[]
}

export interface ValidationSessionValue {
  // Excel - one or more uploaded files, combined into a single dataset.
  // Every file must share the exact same headers (see headersMatch); a file
  // that doesn't match is rejected outright, reported via excelFileIssues,
  // the same way an incompatible rule file is rejected (see
  // acceptRuleCandidates / ruleFileIssues below).
  excelFiles: ExcelFileEntry[]
  excelDataset: ExcelDataset | null
  /** Sheet-parsing issues (e.g. "no headers", packed-JSON columns exploded) for every currently-selected sheet across all files - prefixed with the file name once more than one file is loaded. */
  excelIssues: SheetValidationIssue[]
  /** File-level problems: couldn't be read, no worksheets, or didn't match the other files' headers. */
  excelFileIssues: ExcelFileIssue[]
  isReadingExcel: boolean
  loadExcelFiles: (files: File[]) => Promise<void>
  removeExcelFile: (id: string) => void
  selectSheetForFile: (id: string, sheetName: string) => void

  // Rules - one or more rule files, all required to share the same "level"
  ruleDefinitions: RuleDefinition[]
  ruleFileIssues: RuleFileIssue[]
  isReadingRules: boolean
  addRulesFiles: (files: File[]) => Promise<void>
  removeRuleDefinition: (id: string) => void
  /** How many rules ruleDefinitions started out with because of a restore from the last session (0 if none) - a fixed number captured at mount, not a live count, so a "Restored N rules" notice never drifts as the user adds/removes rules afterward. */
  restoredRuleCount: number

  // The user's persistent rule library (localStorage, independent of the
  // current session and of Clear Session - see useSavedRules).
  savedRules: SavedRule[]
  /** Explicit create/update from the Rules page editor - upserts by id. */
  saveRuleToLibrary: (rule: SavedRule) => void
  /** Saves an already-parsed rule (e.g. from a fresh upload) to the library, deduplicating by fileName + fields content rather than always inserting - use this instead of saveRuleToLibrary for anything that isn't the editor's own explicit Save. */
  saveRuleFromDefinition: (def: RuleDefinition) => void
  deleteSavedRule: (id: string) => void
  /** Loads one or more saved rules into the CURRENT session, additively and subject to the same "same level" check as uploading a file - returns any rejections (including a rule that failed to load at all; a rule that's already active is silently skipped, not reported as an error). */
  loadSavedRules: (rules: SavedRule[]) => RuleFileIssue[]
  /** Explicitly allows/disallows blanks on one SAME field for a rule definition (true/false), or forgets the override (undefined) to go back to this file's own auto-detected suggestion - see useSavedRules.setBlankOverride / BlankAllowance.ts. */
  setBlankOverride: (def: RuleDefinition, field: string, allow: boolean | undefined) => void

  // Column mapping - unified across every accepted rule definition
  mapping: ColumnMappingResult | null
  setMappingColumn: (jsonField: string, excelColumn: string | null) => void
  acceptMappingSuggestion: (jsonField: string) => void

  // Validation results - one outcome per rule definition, always kept separate
  validationResults: RuleValidationOutcome[]
  setValidationResults: (results: RuleValidationOutcome[]) => void

  // Reviewer dispositions - session-only, per (rule definition, group). Keyed
  // by ruleDefinitionId then groupId. Always cleared whenever validationResults
  // changes (a fresh run, a cleared session, etc.) since a stale disposition
  // could otherwise silently point at a group that no longer exists.
  dispositions: Map<string, Map<string, Disposition>>
  setDisposition: (ruleDefinitionId: string, groupId: string, disposition: Disposition | null) => void

  // Reviewer comments - session-only free text, same (rule definition, group)
  // keying and same lifecycle as dispositions (see above): always cleared
  // whenever validationResults changes. Setting a blank/whitespace-only
  // comment clears the entry, mirroring setDisposition(..., null).
  comments: Map<string, Map<string, string>>
  setComment: (ruleDefinitionId: string, groupId: string, comment: string) => void

  // Maps a loaded rule definition to the History entry its current result
  // was recorded as (see NewValidation.tsx, which creates the entry and
  // registers it here right after a run completes). Same lifecycle as
  // dispositions/comments - cleared whenever validationResults changes.
  // Results.tsx uses this to know which History entry to keep in sync as
  // dispositions/comments for the ON-SCREEN run change (see
  // computeReviewActivity / useSessionHistory.updateReviewActivity).
  historyEntryIdByRule: Map<string, string>
  registerHistoryEntryId: (ruleDefinitionId: string, historyEntryId: string) => void

  // Lifecycle
  clearSession: () => void
  hasAnyData: boolean
}

const ValidationSessionContext = createContext<ValidationSessionValue | null>(null)

/** A rule definition's declared "level", normalized for comparison (trimmed, lowercased) - or null if it doesn't declare one. */
function normalizedLevel(metadata: RuleDefinition['metadata']): string | null {
  const level = metadata?.level?.trim()
  return level ? level.toLowerCase() : null
}

type LevelLock =
  | { kind: 'none' } // no rule loaded yet - the next accepted file establishes the lock (or leaves it undetermined)
  | { kind: 'undetermined' } // a rule with no declared level is already loaded; nothing else can be confirmed compatible with it
  | { kind: 'set'; level: string; displayLevel: string } // every additional file must declare this same level

function levelLockFrom(defs: RuleDefinition[]): LevelLock {
  if (defs.length === 0) return { kind: 'none' }
  const raw = defs[0].metadata?.level?.trim()
  if (!raw) return { kind: 'undetermined' }
  return { kind: 'set', level: raw.toLowerCase(), displayLevel: raw }
}

/** A rule file that's already been parsed into a RuleSet, awaiting the "same level" check - the common shape shared by a fresh upload and a rule loaded from the saved-rules library. */
interface RuleFileCandidate {
  fileName: string
  ruleSet: RuleSet
  metadata?: RuleFileMetadata
}

/**
 * Applies the "every loaded rule must share the same level" check to a
 * batch of already-parsed candidates and returns what was accepted vs.
 * rejected. Pulled out as a standalone function (rather than inlined in
 * processRuleFilesBatch) so a fresh file upload and a rule loaded from the
 * library enforce identically - two separate copies of this logic would
 * risk drifting apart the way the readiness checks once did.
 */
function acceptRuleCandidates(
  candidates: RuleFileCandidate[],
  currentDefinitions: RuleDefinition[]
): { accepted: RuleDefinition[]; issues: RuleFileIssue[] } {
  let lock = levelLockFrom(currentDefinitions)
  const accepted: RuleDefinition[] = []
  const issues: RuleFileIssue[] = []

  for (const candidate of candidates) {
    const rawLevel = candidate.metadata?.level?.trim()
    const fileLevel = normalizedLevel(candidate.metadata)

    if (lock.kind === 'undetermined') {
      issues.push({
        fileName: candidate.fileName,
        message:
          'Your currently loaded rule file does not specify a "level", so it cannot be combined with additional rules. Remove it first, or start over with a rule file that includes a level.',
      })
      continue
    }

    if (lock.kind === 'set') {
      if (fileLevel === null) {
        issues.push({
          fileName: candidate.fileName,
          message: `This rule file does not specify a "level", so it cannot be combined with your other uploaded rules (level: "${lock.displayLevel}").`,
        })
        continue
      }
      if (fileLevel !== lock.level) {
        issues.push({
          fileName: candidate.fileName,
          message: `This rule file is for the "${rawLevel}" level, but your other uploaded rules are for the "${lock.displayLevel}" level. Upload rules from the same level, or clear the existing rules first.`,
        })
        continue
      }
    }

    accepted.push({
      id: nextRuleDefinitionId(),
      fileName: candidate.fileName,
      ruleSet: candidate.ruleSet,
      metadata: candidate.metadata,
      totalFields: candidate.ruleSet.fields.length,
    })

    if (lock.kind === 'none') {
      lock = fileLevel === null ? { kind: 'undetermined' } : { kind: 'set', level: fileLevel, displayLevel: rawLevel! }
    }
  }

  return { accepted, issues }
}

/**
 * The single place that computes column mapping for a set of rule
 * definitions - builds the fresh auto-match mapping from the Excel headers,
 * then layers in any remembered manual choices from the rules library (see
 * applyRememberedColumnMappings), so a column fixed by hand once doesn't
 * need to be fixed again the next time this same rule is used. Used at
 * every call site that (re)computes mapping, so the two steps can never
 * drift apart by being applied in one place and forgotten in another.
 */
function computeMapping(defs: RuleDefinition[], headers: string[], savedRules: SavedRule[]): ColumnMappingResult {
  const base = buildColumnMapping(
    defs.map((d) => d.ruleSet),
    headers
  )
  return applyRememberedColumnMappings(base, defs, savedRules, headers)
}

/**
 * The headers every OTHER currently-loaded file must match for a file to be
 * accepted (see headersMatch) - taken from the first file in upload order
 * that currently has readable data, skipping `excludingId` (used when
 * re-checking a file whose own sheet selection is being changed, so it
 * never anchors against its own stale headers). Returns null when there's
 * no such file yet, meaning the next file accepted establishes the anchor
 * instead of being checked against one.
 */
function anchorHeaders(files: ExcelFileEntry[], excludingId?: string): string[] | null {
  for (const entry of files) {
    if (entry.id === excludingId) continue
    if (entry.data) return entry.data.headers
  }
  return null
}

const LAST_ACTIVE_RULES_KEY = 'duplicate-validator:last-active-rules'

/**
 * A silent, invisible mirror of "whatever rule definitions are currently
 * loaded in the session" - NOT the user-managed library (see
 * useSavedRules). Read once, synchronously, when the app starts (so
 * ruleDefinitions' own lazy initializer can restore it before first paint -
 * no flash of an empty state, no effect-ordering race), and rewritten every
 * time ruleDefinitions changes thereafter, including back to empty if the
 * user removes everything. There is no separate "clear" for this - it
 * always reflects the live session, so clearing rules (or Clear Session)
 * already clears next time's restore too.
 */
function readLastActiveRuleFiles(): SerializedRuleFile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_RULES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SerializedRuleFile[]) : []
  } catch {
    return []
  }
}

function writeLastActiveRuleFiles(defs: RuleDefinition[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_ACTIVE_RULES_KEY, JSON.stringify(defs.map(toSerializedRuleFile)))
  } catch {
    // Storage full or unavailable (e.g. private browsing) - fail silently, same as useLocalStorage.
  }
}

function restoreLastActiveRuleDefinitions(): RuleDefinition[] {
  const defs: RuleDefinition[] = []
  for (const serialized of readLastActiveRuleFiles()) {
    const def = fromSerializedRuleFile(serialized)
    if (def) defs.push(def)
  }
  return defs
}

export function ValidationSessionProvider({ children }: { children: ReactNode }) {
  const [excelFiles, setExcelFiles] = useState<ExcelFileEntry[]>([])
  const [excelDataset, setExcelDataset] = useState<ExcelDataset | null>(null)
  const [excelIssues, setExcelIssues] = useState<SheetValidationIssue[]>([])
  const [excelFileIssues, setExcelFileIssues] = useState<ExcelFileIssue[]>([])
  const [isReadingExcel, setIsReadingExcel] = useState(false)

  // Same race-safety pattern as ruleDefinitionsRef/rulesBusyRef below:
  // loadExcelFiles does real async work (validating + reading + parsing
  // every file) before it can commit, so a second overlapping call - or one
  // queued while the first is still in flight - must build on the latest
  // committed list rather than a stale closure.
  const excelFilesRef = useRef<ExcelFileEntry[]>(excelFiles)
  excelFilesRef.current = excelFiles
  const excelBusyRef = useRef(false)
  const pendingExcelFileBatchesRef = useRef<File[][]>([])

  // Restored synchronously (lazy initializer, not an effect) so the very
  // first render already has last session's rules - no flash of an empty
  // state, and no race with the "persist on change" effect below. This is
  // the invisible last-active-rules snapshot, NOT the user-managed library
  // (savedRules, below) - see restoreLastActiveRuleDefinitions.
  const [ruleDefinitions, setRuleDefinitions] = useState<RuleDefinition[]>(() => restoreLastActiveRuleDefinitions())
  // Captured once, from that same initial value, rather than re-read from
  // ruleDefinitions.length later - so a "Restored N rules" notice reports a
  // fixed number instead of drifting as the user adds or removes rules.
  const [restoredRuleCount] = useState<number>(() => ruleDefinitions.length)
  const [ruleFileIssues, setRuleFileIssues] = useState<RuleFileIssue[]>([])
  const [isReadingRules, setIsReadingRules] = useState(false)

  const { savedRules, saveRuleToLibrary, deleteSavedRule, saveRuleFromDefinition, rememberColumnMapping, setBlankOverride } =
    useSavedRules()

  // `addRulesFiles` does real async work (reading + parsing each file) before it can commit
  // its result, so a second call could otherwise start from a stale `ruleDefinitions`
  // snapshot and silently drop whatever the first call (or an interleaved
  // `removeRuleDefinition`) had just committed. `ruleDefinitionsRef` always holds the latest
  // value (refreshed on every render, below) so an in-flight batch re-reads the true current
  // list instead of the value captured in its own closure at call time; `rulesBusyRef` /
  // `pendingRuleFileBatchesRef` serialize overlapping calls so they never race each other.
  const ruleDefinitionsRef = useRef(ruleDefinitions)
  ruleDefinitionsRef.current = ruleDefinitions
  const rulesBusyRef = useRef(false)
  const pendingRuleFileBatchesRef = useRef<File[][]>([])

  // Keeps the last-active-rules snapshot in sync with the live session,
  // including back to empty if every rule is removed or Clear Session runs -
  // so a later app open only ever restores what was truly left active.
  useEffect(() => {
    writeLastActiveRuleFiles(ruleDefinitions)
  }, [ruleDefinitions])

  const [mapping, setMapping] = useState<ColumnMappingResult | null>(null)
  // Mirrors `mapping` for the same reason ruleDefinitionsRef mirrors
  // ruleDefinitions - lets acceptMappingSuggestion read the just-accepted
  // suggestion synchronously (to remember it) without adding `mapping` to
  // its own dependency array.
  const mappingRef = useRef(mapping)
  mappingRef.current = mapping

  const [validationResults, setValidationResultsState] = useState<RuleValidationOutcome[]>([])
  const [dispositions, setDispositions] = useState<Map<string, Map<string, Disposition>>>(new Map())
  const [comments, setComments] = useState<Map<string, Map<string, string>>>(new Map())
  const [historyEntryIdByRule, setHistoryEntryIdByRule] = useState<Map<string, string>>(new Map())

  // The only way validationResults ever changes, internally or externally
  // (NewValidation.tsx calls this directly after a run completes) - always
  // clears dispositions, comments, and the History-entry-id map alongside it
  // so none of them can survive past the specific set of groups they were
  // recorded against.
  const setValidationResults = useCallback((results: RuleValidationOutcome[]) => {
    setValidationResultsState(results)
    setDispositions(new Map())
    setComments(new Map())
    setHistoryEntryIdByRule(new Map())
  }, [])

  const registerHistoryEntryId = useCallback((ruleDefinitionId: string, historyEntryId: string) => {
    setHistoryEntryIdByRule((prev) => {
      const next = new Map(prev)
      next.set(ruleDefinitionId, historyEntryId)
      return next
    })
  }, [])

  const setDisposition = useCallback(
    (ruleDefinitionId: string, groupId: string, disposition: Disposition | null) => {
      setDispositions((prev) => {
        const next = new Map(prev)
        const forRule = new Map(next.get(ruleDefinitionId) ?? new Map<string, Disposition>())
        if (disposition === null) {
          forRule.delete(groupId)
        } else {
          forRule.set(groupId, disposition)
        }
        if (forRule.size === 0) {
          next.delete(ruleDefinitionId)
        } else {
          next.set(ruleDefinitionId, forRule)
        }
        return next
      })
    },
    []
  )

  const setComment = useCallback(
    (ruleDefinitionId: string, groupId: string, comment: string) => {
      setComments((prev) => {
        const next = new Map(prev)
        const forRule = new Map(next.get(ruleDefinitionId) ?? new Map<string, string>())
        if (comment.trim().length === 0) {
          forRule.delete(groupId)
        } else {
          forRule.set(groupId, comment)
        }
        if (forRule.size === 0) {
          next.delete(ruleDefinitionId)
        } else {
          next.set(ruleDefinitionId, forRule)
        }
        return next
      })
    },
    []
  )

  /**
   * Recombines whatever files are currently loaded into the single
   * ExcelDataset the rest of the app reads, and recomputes mapping against
   * it. The one place that does this, called after every change to
   * `excelFiles` (a batch finishing, a file removed, a sheet switched) so
   * the dataset and mapping can never drift out of sync with the file list.
   * Sheet-parsing issues from every file are surfaced together here too,
   * prefixed with the file name once more than one file is loaded (a single
   * file's own issues need no attribution, there's nothing to tell it apart
   * from).
   */
  const recomputeExcelDataset = useCallback(
    (files: ExcelFileEntry[], currentRuleDefinitions: RuleDefinition[]) => {
      const usable = files.filter((entry): entry is ExcelFileEntry & { data: SheetData } => entry.data !== null)
      const combined = buildCombinedDataset(usable.map((entry) => ({ meta: entry.meta, data: entry.data })))

      setExcelDataset(combined)
      setExcelIssues(
        files.length > 1
          ? files.flatMap((entry) => entry.issues.map((issue) => ({ ...issue, message: `${entry.file.name}: ${issue.message}` })))
          : files.flatMap((entry) => entry.issues)
      )
      setMapping(combined && currentRuleDefinitions.length > 0 ? computeMapping(currentRuleDefinitions, combined.headers, savedRules) : null)
    },
    [savedRules]
  )

  /**
   * Parses and validates one batch of newly-dropped/selected Excel files
   * against whatever is already loaded, then commits the result. Always
   * reads/writes `excelFilesRef.current` (rather than the `excelFiles` state
   * captured in this callback's own closure) for the same reason
   * processRuleFilesBatch does - so an overlapping or queued batch builds on
   * the true latest list. A file is accepted only if it passes the basic
   * file-type/size check, its workbook can be read, it has at least one
   * worksheet, AND (when its first sheet has readable data) that data's
   * headers match every other already-accepted file's headers exactly -
   * anything else is reported as an ExcelFileIssue and otherwise ignored,
   * mirroring how an incompatible rule file is rejected rather than
   * partially loaded (see acceptRuleCandidates). Callers are responsible for
   * serializing calls to this function (see loadExcelFiles).
   */
  const processExcelFilesBatch = useCallback(
    async (files: File[]) => {
      const workingFiles: ExcelFileEntry[] = [...excelFilesRef.current]
      const issues: ExcelFileIssue[] = []

      for (const file of files) {
        const fileCheck = validateExcelFile(file)
        if (!fileCheck.valid) {
          issues.push({ fileName: file.name, message: fileCheck.issues.map((issue) => issue.message).join(' ') })
          continue
        }

        let workbook: WorkBook
        let meta: WorkbookMeta
        try {
          const parsed = await readWorkbookFile(file)
          workbook = parsed.workbook
          meta = parsed.meta
        } catch {
          issues.push({ fileName: file.name, message: 'We could not read this file. Please verify that it is a valid Excel workbook.' })
          continue
        }

        if (meta.sheetNames.length === 0) {
          issues.push({ fileName: file.name, message: 'This workbook does not contain any worksheets.' })
          continue
        }

        const { data, issues: sheetIssues } = readSheet(workbook, meta.sheetNames[0])

        if (data) {
          const anchor = anchorHeaders(workingFiles)
          if (anchor && !headersMatch(data.headers, anchor)) {
            issues.push({
              fileName: file.name,
              message:
                "This file's columns don't match your other uploaded Excel file(s). Upload a file with the exact same columns in the same order, or remove your existing file(s) first.",
            })
            continue
          }
        }

        workingFiles.push({
          id: nextExcelFileId(),
          file,
          workbook,
          meta,
          sheetName: meta.sheetNames[0],
          data,
          issues: sheetIssues,
        })
      }

      excelFilesRef.current = workingFiles
      setExcelFiles(workingFiles)
      setExcelFileIssues(issues)
      recomputeExcelDataset(workingFiles, ruleDefinitionsRef.current)
    },
    [recomputeExcelDataset]
  )

  const loadExcelFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      if (excelBusyRef.current) {
        // A batch is already in flight - queue this one instead of racing it. It will be
        // processed, against the up-to-date file list, right after the current batch commits.
        pendingExcelFileBatchesRef.current.push(files)
        return
      }

      excelBusyRef.current = true
      setIsReadingExcel(true)
      setValidationResults([])

      try {
        await processExcelFilesBatch(files)
        while (pendingExcelFileBatchesRef.current.length > 0) {
          const next = pendingExcelFileBatchesRef.current.shift()!
          await processExcelFilesBatch(next)
        }
      } finally {
        excelBusyRef.current = false
        setIsReadingExcel(false)
      }
    },
    [processExcelFilesBatch]
  )

  const removeExcelFile = useCallback(
    (id: string) => {
      const nextFiles = excelFilesRef.current.filter((entry) => entry.id !== id)
      excelFilesRef.current = nextFiles
      setExcelFiles(nextFiles)
      setExcelFileIssues([])
      setValidationResults([])
      recomputeExcelDataset(nextFiles, ruleDefinitionsRef.current)
    },
    [recomputeExcelDataset]
  )

  const selectSheetForFile = useCallback(
    (id: string, sheetName: string) => {
      const currentFiles = excelFilesRef.current
      const target = currentFiles.find((entry) => entry.id === id)
      if (!target) return

      const { data, issues: sheetIssues } = readSheet(target.workbook, sheetName)

      if (data) {
        const anchor = anchorHeaders(currentFiles, id)
        if (anchor && !headersMatch(data.headers, anchor)) {
          setExcelFileIssues([
            {
              fileName: target.file.name,
              message:
                "This sheet's columns don't match your other uploaded Excel file(s). Choose a different sheet, or remove your other file(s) first.",
            },
          ])
          return
        }
      }

      const nextFiles = currentFiles.map((entry) => (entry.id === id ? { ...entry, sheetName, data, issues: sheetIssues } : entry))
      excelFilesRef.current = nextFiles
      setExcelFiles(nextFiles)
      setExcelFileIssues([])
      setValidationResults([])
      recomputeExcelDataset(nextFiles, ruleDefinitionsRef.current)
    },
    [recomputeExcelDataset]
  )

  /**
   * Parses and validates one batch of rule files against whatever is
   * currently loaded, then commits the result. Always reads/writes
   * `ruleDefinitionsRef.current` (rather than the `ruleDefinitions` state
   * captured in this callback's own closure) so that if another batch - or a
   * `removeRuleDefinition` call - committed while this one was awaiting
   * `readRulesFile`, this batch builds on top of that latest list instead of
   * silently overwriting it. Callers are responsible for serializing calls
   * to this function (see `addRulesFiles`) since it is not itself reentrant.
   */
  const processRuleFilesBatch = useCallback(
    async (files: File[]) => {
      const candidates: RuleFileCandidate[] = []
      const parseIssues: RuleFileIssue[] = []

      for (const file of files) {
        const parseResult = await readRulesFile(file)

        if (!parseResult.success || !parseResult.ruleSet) {
          parseIssues.push({
            fileName: file.name,
            message: parseResult.errors.map((e) => e.message).join(' ') || 'This rule file could not be validated.',
          })
          continue
        }

        candidates.push({ fileName: file.name, ruleSet: parseResult.ruleSet, metadata: parseResult.metadata })
      }

      const { accepted, issues } = acceptRuleCandidates(candidates, ruleDefinitionsRef.current)

      const nextDefinitions = [...ruleDefinitionsRef.current, ...accepted]
      ruleDefinitionsRef.current = nextDefinitions
      setRuleDefinitions(nextDefinitions)
      setRuleFileIssues([...parseIssues, ...issues])
      setMapping(excelDataset && nextDefinitions.length > 0 ? computeMapping(nextDefinitions, excelDataset.headers, savedRules) : null)

      // Every successfully accepted upload is remembered in the Rules
      // library automatically - no separate "save" step for the common case.
      for (const def of accepted) saveRuleFromDefinition(def)
    },
    [excelDataset, savedRules, saveRuleFromDefinition]
  )

  const addRulesFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      if (rulesBusyRef.current) {
        // A batch is already in flight - queue this one instead of racing it. It will be
        // processed, against the up-to-date rule list, right after the current batch commits.
        pendingRuleFileBatchesRef.current.push(files)
        return
      }

      rulesBusyRef.current = true
      setIsReadingRules(true)
      setValidationResults([])

      try {
        await processRuleFilesBatch(files)
        while (pendingRuleFileBatchesRef.current.length > 0) {
          const next = pendingRuleFileBatchesRef.current.shift()!
          await processRuleFilesBatch(next)
        }
      } finally {
        rulesBusyRef.current = false
        setIsReadingRules(false)
      }
    },
    [processRuleFilesBatch]
  )

  const removeRuleDefinition = useCallback(
    (id: string) => {
      const nextDefinitions = ruleDefinitions.filter((d) => d.id !== id)
      ruleDefinitionsRef.current = nextDefinitions
      setRuleDefinitions(nextDefinitions)
      setRuleFileIssues([])
      setValidationResults([])
      setMapping(excelDataset && nextDefinitions.length > 0 ? computeMapping(nextDefinitions, excelDataset.headers, savedRules) : null)
    },
    [ruleDefinitions, excelDataset, savedRules]
  )

  /**
   * Loads one or more rules from the saved library into the current
   * session, additively (on top of whatever's already loaded) and subject
   * to the exact same "same level" check as uploading a file - see
   * acceptRuleCandidates. A rule that's already active (same fileName and
   * fields as one already loaded) is silently skipped rather than added
   * twice - clicking "Use in New Validation" or "Load" a second time is a
   * no-op, not a duplicate. A rule that fails to load at all (corrupted
   * localStorage) is reported as an issue rather than silently ignored, so
   * a caller never mistakes "nothing to do" for "something went wrong".
   */
  const loadSavedRules = useCallback(
    (rules: SavedRule[]): RuleFileIssue[] => {
      const existingDefs = ruleDefinitionsRef.current
      const isAlreadyActive = (candidate: RuleFileCandidate) =>
        existingDefs.some(
          (def) =>
            def.fileName === candidate.fileName &&
            JSON.stringify(def.ruleSet.fields) === JSON.stringify(candidate.ruleSet.fields)
        )

      const candidates: RuleFileCandidate[] = []
      const loadIssues: RuleFileIssue[] = []
      for (const rule of rules) {
        const result = buildRuleSet(rule.fields.map((f) => ({ field: f.field, value: f.rule })))
        if (!result.success || !result.ruleSet) {
          loadIssues.push({
            fileName: rule.fileName,
            message: 'This saved rule could not be loaded - it may be corrupted. Try editing and re-saving it from the Rules page.',
          })
          continue
        }
        const candidate: RuleFileCandidate = { fileName: rule.fileName, ruleSet: result.ruleSet, metadata: rule.metadata }
        if (isAlreadyActive(candidate)) continue
        candidates.push(candidate)
      }

      const { accepted, issues } = acceptRuleCandidates(candidates, existingDefs)
      const allIssues = [...loadIssues, ...issues]
      if (accepted.length === 0) return allIssues

      const nextDefinitions = [...existingDefs, ...accepted]
      ruleDefinitionsRef.current = nextDefinitions
      setRuleDefinitions(nextDefinitions)
      setRuleFileIssues(allIssues)
      // A newly-loaded rule invalidates any results already on screen (also clears dispositions).
      setValidationResults([])
      setMapping(excelDataset && nextDefinitions.length > 0 ? computeMapping(nextDefinitions, excelDataset.headers, savedRules) : null)
      return allIssues
    },
    [excelDataset, savedRules, setValidationResults]
  )

  const setMappingColumn = useCallback(
    (jsonField: string, excelColumn: string | null) => {
      setMapping((prev) => {
        if (!prev || ruleDefinitions.length === 0) return prev
        return updateMappingEntry(
          prev,
          ruleDefinitions.map((d) => d.ruleSet),
          jsonField,
          excelColumn
        )
      })
      // Remember a manual pick - or forget a previously-remembered one if the
      // user cleared this field back to "Not mapped" - against every loaded
      // rule that actually declares this field. Clearing must also forget,
      // not just skip remembering, otherwise a later mapping recompute (a
      // new sheet, an added rule, etc.) would silently reapply the column
      // the user just cleared. Reuses the excelColumn already passed in
      // rather than reading it back out of mapping state.
      for (const def of ruleDefinitions) {
        if (def.ruleSet.byField.has(jsonField)) rememberColumnMapping(def, jsonField, excelColumn)
      }
    },
    [ruleDefinitions, rememberColumnMapping]
  )

  const acceptMappingSuggestion = useCallback(
    (jsonField: string) => {
      // Read via the ref (not the `prev` inside setMapping below) so
      // remembering happens as a plain side effect here, not inside a state
      // updater function, while still seeing the latest suggestion.
      const suggestion = mappingRef.current?.entryByField.get(jsonField)?.suggestion
      setMapping((prev) => {
        if (!prev || ruleDefinitions.length === 0) return prev
        return acceptSuggestion(
          prev,
          ruleDefinitions.map((d) => d.ruleSet),
          jsonField
        )
      })
      if (suggestion) {
        for (const def of ruleDefinitions) {
          if (def.ruleSet.byField.has(jsonField)) rememberColumnMapping(def, jsonField, suggestion)
        }
      }
    },
    [ruleDefinitions, rememberColumnMapping]
  )

  const clearSession = useCallback(() => {
    excelFilesRef.current = []
    setExcelFiles([])
    setExcelDataset(null)
    setExcelIssues([])
    setExcelFileIssues([])
    setRuleDefinitions([])
    setRuleFileIssues([])
    setMapping(null)
    setValidationResults([])
  }, [])

  const hasAnyData = Boolean(excelFiles.length > 0 || ruleDefinitions.length > 0 || validationResults.length > 0)

  const value = useMemo<ValidationSessionValue>(
    () => ({
      excelFiles,
      excelDataset,
      excelIssues,
      excelFileIssues,
      isReadingExcel,
      loadExcelFiles,
      removeExcelFile,
      selectSheetForFile,
      ruleDefinitions,
      ruleFileIssues,
      isReadingRules,
      addRulesFiles,
      removeRuleDefinition,
      restoredRuleCount,
      savedRules,
      saveRuleToLibrary,
      saveRuleFromDefinition,
      deleteSavedRule,
      loadSavedRules,
      setBlankOverride,
      mapping,
      setMappingColumn,
      acceptMappingSuggestion,
      validationResults,
      setValidationResults,
      dispositions,
      setDisposition,
      comments,
      setComment,
      historyEntryIdByRule,
      registerHistoryEntryId,
      clearSession,
      hasAnyData,
    }),
    [
      excelFiles,
      excelDataset,
      excelIssues,
      excelFileIssues,
      isReadingExcel,
      loadExcelFiles,
      removeExcelFile,
      selectSheetForFile,
      ruleDefinitions,
      ruleFileIssues,
      isReadingRules,
      addRulesFiles,
      removeRuleDefinition,
      restoredRuleCount,
      savedRules,
      saveRuleToLibrary,
      saveRuleFromDefinition,
      deleteSavedRule,
      loadSavedRules,
      setBlankOverride,
      mapping,
      setMappingColumn,
      acceptMappingSuggestion,
      validationResults,
      setValidationResults,
      dispositions,
      setDisposition,
      comments,
      setComment,
      historyEntryIdByRule,
      registerHistoryEntryId,
      clearSession,
      hasAnyData,
    ]
  )

  return <ValidationSessionContext.Provider value={value}>{children}</ValidationSessionContext.Provider>
}

export function useValidationSession(): ValidationSessionValue {
  const ctx = useContext(ValidationSessionContext)
  if (!ctx) throw new Error('useValidationSession must be used within a ValidationSessionProvider')
  return ctx
}
