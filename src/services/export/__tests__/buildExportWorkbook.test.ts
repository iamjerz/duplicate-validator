import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  findAddActionColumn,
  findAddCommentsColumn,
  isRecordExportEligible,
  recordsForStatus,
  allRecordsRows,
  buildExportWorkbook,
  exportFileBaseName,
  resolveSourceFileColumn,
} from '../buildExportWorkbook'
import { runDuplicateValidation, buildRuleSet, buildColumnMapping } from '@/engine'
import type { CellValue, Disposition, ExcelDataset, RuleSet, SourceFileSummary, ValidationResult } from '@/types'

const RULES = {
  'Root Id': 'SAME',
  'Invoice Number': 'SAME',
  'Client Code': 'SAME',
}

function runValidation(headers: string[], rows: CellValue[][]): { result: ValidationResult } {
  const built = buildRuleSet(Object.entries(RULES).map(([field, value]) => ({ field, value })))
  const ruleSet = built.ruleSet as RuleSet
  const mapping = buildColumnMapping(ruleSet, headers).entries
  const excelRowNumbers = rows.map((_, i) => i + 2)
  const result = runDuplicateValidation({ headers, rows, excelRowNumbers, ruleSet, mapping })
  return { result }
}

function datasetFrom(headers: string[], rows: CellValue[][], fileName = 'invoices.xlsx'): ExcelDataset {
  return {
    fileName,
    fileSizeBytes: 1000,
    sheetName: 'Sheet1',
    availableSheets: ['Sheet1'],
    sheetSummaries: [],
    headers,
    rows,
    excelRowNumbers: rows.map((_, i) => i + 2),
    totalRecords: rows.length,
    totalColumns: headers.length,
    sourceFiles: [{ fileName, fileSizeBytes: 1000, sheetName: 'Sheet1', recordCount: rows.length }],
    rowSourceFileIndex: rows.map(() => 0),
  }
}

/** A dataset combined from more than one source file - rowSourceFileIndex assigns each row to a file in `fileNames`, round-robin, purely for exercising the Source File export column. */
function multiFileDatasetFrom(headers: string[], rows: CellValue[][], fileNames: string[]): ExcelDataset {
  const sourceFiles: SourceFileSummary[] = fileNames.map((fileName) => ({
    fileName,
    fileSizeBytes: 1000,
    sheetName: 'Sheet1',
    recordCount: 0,
  }))
  const rowSourceFileIndex = rows.map((_, i) => i % fileNames.length)
  for (const fileIndex of rowSourceFileIndex) sourceFiles[fileIndex].recordCount += 1

  return {
    fileName: `Combined (${fileNames.length} files)`,
    fileSizeBytes: 1000 * fileNames.length,
    sheetName: 'Combined',
    availableSheets: [],
    sheetSummaries: [],
    headers,
    rows,
    excelRowNumbers: rows.map((_, i) => i + 2),
    totalRecords: rows.length,
    totalColumns: headers.length,
    sourceFiles,
    rowSourceFileIndex,
  }
}

describe('findAddActionColumn', () => {
  it('finds an exact match', () => {
    expect(findAddActionColumn(['Root Id', 'Add Action'])).toBe('Add Action')
  })

  it('matches case/spacing/punctuation-insensitively, same as the Column Mapping step', () => {
    expect(findAddActionColumn(['Root Id', 'add_action'])).toBe('add_action')
    expect(findAddActionColumn(['ADD-ACTION'])).toBe('ADD-ACTION')
  })

  it('returns null when the file has no such column', () => {
    expect(findAddActionColumn(['Root Id', 'Invoice Number'])).toBeNull()
  })
})

describe('findAddCommentsColumn', () => {
  it('finds an exact match', () => {
    expect(findAddCommentsColumn(['Root Id', 'Add Comments'])).toBe('Add Comments')
  })

  it('matches case/spacing/punctuation-insensitively, same as the Column Mapping step', () => {
    expect(findAddCommentsColumn(['Root Id', 'add_comments'])).toBe('add_comments')
    expect(findAddCommentsColumn(['ADD-COMMENTS'])).toBe('ADD-COMMENTS')
  })

  it('returns null when the file has no such column', () => {
    expect(findAddCommentsColumn(['Root Id', 'Invoice Number'])).toBeNull()
  })
})

describe('isRecordExportEligible', () => {
  const headers = ['Root Id', 'Audit ID', 'Audit Exception Status']

  it('is eligible when the record has an Audit ID and an Open status', () => {
    const dataset = datasetFrom(headers, [['1', 'A-1', 'Open']])
    expect(isRecordExportEligible(dataset, 0)).toBe(true)
  })

  it('matches the Audit ID / Audit Exception Status columns case/spacing/punctuation-insensitively', () => {
    const looseHeaders = ['Root Id', 'audit_id', 'AUDIT-EXCEPTION-STATUS']
    const dataset = datasetFrom(looseHeaders, [['1', 'A-1', 'Open']])
    expect(isRecordExportEligible(dataset, 0)).toBe(true)
  })

  it('treats "Open" case/whitespace-insensitively as eligible', () => {
    const dataset = datasetFrom(headers, [['1', 'A-1', '  OPEN  ']])
    expect(isRecordExportEligible(dataset, 0)).toBe(true)
  })

  it('is ineligible when the file has no Audit ID column', () => {
    const dataset = datasetFrom(['Root Id', 'Audit Exception Status'], [['1', 'Open']])
    expect(isRecordExportEligible(dataset, 0)).toBe(false)
  })

  it('is ineligible when the file has no Audit Exception Status column', () => {
    const dataset = datasetFrom(['Root Id', 'Audit ID'], [['1', 'A-1']])
    expect(isRecordExportEligible(dataset, 0)).toBe(false)
  })

  it('is ineligible when the file has neither column', () => {
    const dataset = datasetFrom(['Root Id'], [['1']])
    expect(isRecordExportEligible(dataset, 0)).toBe(false)
  })

  it('is ineligible when the record has a blank Audit ID', () => {
    const dataset = datasetFrom(headers, [['1', '', 'Open']])
    expect(isRecordExportEligible(dataset, 0)).toBe(false)
  })

  it('is ineligible when the record\'s Audit Exception Status is not Open', () => {
    const dataset = datasetFrom(headers, [['1', 'A-1', 'Closed']])
    expect(isRecordExportEligible(dataset, 0)).toBe(false)
  })

  it('is ineligible when the record\'s Audit Exception Status is blank', () => {
    const dataset = datasetFrom(headers, [['1', 'A-1', '']])
    expect(isRecordExportEligible(dataset, 0)).toBe(false)
  })

  it('is decided independently per row, so one row can be eligible while another in the same file is not', () => {
    const dataset = datasetFrom(headers, [
      ['1', 'A-1', 'Open'],
      ['2', '', 'Open'],
    ])
    expect(isRecordExportEligible(dataset, 0)).toBe(true)
    expect(isRecordExportEligible(dataset, 1)).toBe(false)
  })
})

describe('recordsForStatus', () => {
  const headers = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status', 'Add Action', 'Add Comments']
  // Both records are export-eligible (an Audit ID, and an Open status).
  const duplicateRows: CellValue[][] = [
    ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'],
    ['12345', 'INV-001', 'ABC', 'A-2', 'Open', 'Pending', 'N/A'],
  ]

  it('mirrors the original file exactly - same columns, same order, no Group ID/Status/row-number columns added', () => {
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map())
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(headers)
    }
  })

  it('writes a recorded disposition into the existing Add Action column for an export-eligible record', () => {
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])

    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions)
    expect(rows.every((r) => r['Add Action'] === 'Reject Invoice')).toBe(true)
    // Every other original column is still exactly what was in the source file.
    expect(rows.every((r) => r['Root Id'] === '12345' && r['Client Code'] === 'ABC')).toBe(true)
  })

  it('leaves an existing Add Action value untouched when no disposition is recorded for that group', () => {
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map())
    expect(rows.every((r) => r['Add Action'] === 'Pending')).toBe(true)
  })

  it('writes a recorded comment into the existing Add Comments column for an export-eligible record', () => {
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const comments = new Map<string, string>([[group!.id, 'Confirmed with carrier.']])

    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map(), comments)
    expect(rows.every((r) => r['Add Comments'] === 'Confirmed with carrier.')).toBe(true)
  })

  it('leaves an existing Add Comments value untouched when no comment is recorded for that group', () => {
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map(), new Map())
    expect(rows.every((r) => r['Add Comments'] === 'N/A')).toBe(true)
  })

  it('writes a disposition and a comment independently, each into its own column, for an export-eligible record', () => {
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])
    const comments = new Map<string, string>([[group!.id, 'Confirmed with carrier.']])

    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions, comments)
    expect(rows.every((r) => r['Add Action'] === 'Reject Invoice')).toBe(true)
    expect(rows.every((r) => r['Add Comments'] === 'Confirmed with carrier.')).toBe(true)
  })

  it('can still record a disposition and comment for an ineligible group in the UI, but does not export them for a record with a blank Audit ID', () => {
    const blankAuditIdRows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', '', 'Open', 'Pending', 'N/A'],
      ['12345', 'INV-001', 'ABC', '', 'Open', 'Pending', 'N/A'],
    ]
    const dataset = datasetFrom(headers, blankAuditIdRows)
    const { result } = runValidation(headers, blankAuditIdRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    // Recording these is always allowed regardless of Audit ID/Status - only export is filtered.
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])
    const comments = new Map<string, string>([[group!.id, 'Confirmed with carrier.']])

    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions, comments)
    expect(rows.every((r) => r['Add Action'] === 'Pending')).toBe(true)
    expect(rows.every((r) => r['Add Comments'] === 'N/A')).toBe(true)
  })

  it('does not export a disposition for a record whose Audit Exception Status is not Open', () => {
    const notOpenRows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Closed', 'Pending', 'N/A'],
      ['12345', 'INV-001', 'ABC', 'A-2', 'Closed', 'Pending', 'N/A'],
    ]
    const dataset = datasetFrom(headers, notOpenRows)
    const { result } = runValidation(headers, notOpenRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])

    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions)
    expect(rows.every((r) => r['Add Action'] === 'Pending')).toBe(true)
  })

  it('applies a group-level disposition only to the records within it that are individually export-eligible', () => {
    const mixedRows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'], // eligible
      ['12345', 'INV-001', 'ABC', '', 'Open', 'Pending', 'N/A'], // blank Audit ID - not eligible
    ]
    const dataset = datasetFrom(headers, mixedRows)
    const { result } = runValidation(headers, mixedRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])

    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions)
    expect(rows[0]['Add Action']).toBe('Reject Invoice') // export-eligible record gets it
    expect(rows[1]['Add Action']).toBe('Pending') // ineligible record keeps its original value
  })

  it('does not fabricate an Add Comments column when the source file has none - the comment has nowhere to go', () => {
    const noAddCommentsHeaders = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status']
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open'],
      ['12345', 'INV-001', 'ABC', 'A-2', 'Open'],
    ]
    const dataset = datasetFrom(noAddCommentsHeaders, rows)
    const { result } = runValidation(noAddCommentsHeaders, rows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const comments = new Map<string, string>([[group!.id, 'Confirmed with carrier.']])

    const exported = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map(), comments)
    for (const row of exported) {
      expect(Object.keys(row)).toEqual(noAddCommentsHeaders)
      expect(row).not.toHaveProperty('Add Comments')
    }
  })

  it('does not fabricate an Add Action column when the source file has none - the disposition has nowhere to go', () => {
    const noAddActionHeaders = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status']
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open'],
      ['12345', 'INV-001', 'ABC', 'A-2', 'Open'],
    ]
    const dataset = datasetFrom(noAddActionHeaders, rows)
    const { result } = runValidation(noAddActionHeaders, rows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])

    const exported = recordsForStatus(dataset, result.groups, 'DUPLICATE', dispositions)
    for (const row of exported) {
      expect(Object.keys(row)).toEqual(noAddActionHeaders)
      expect(row).not.toHaveProperty('Add Action')
    }
  })

  it('keeps a Date value as a real Date instead of flattening it to ISO text', () => {
    const dateHeaders = ['Root Id', 'Invoice Number', 'Client Code', 'Receipt Date']
    const date = new Date(Date.UTC(2026, 8, 15))
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', date],
      ['12345', 'INV-001', 'ABC', date],
    ]
    const dataset = datasetFrom(dateHeaders, rows)
    const { result } = runValidation(dateHeaders, rows)
    const exported = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map())
    expect(exported).toHaveLength(2)
    for (const row of exported) {
      expect(row['Receipt Date']).toBeInstanceOf(Date)
      expect((row['Receipt Date'] as Date).getTime()).toBe(date.getTime())
    }
  })

  it('adds a trailing Source File column, correctly attributed per row, once the dataset combines more than one file', () => {
    const dataset = multiFileDatasetFrom(headers, duplicateRows, ['march.xlsx', 'april.xlsx'])
    const { result } = runValidation(headers, duplicateRows)
    const rows = recordsForStatus(dataset, result.groups, 'DUPLICATE', new Map())
    expect(rows).toHaveLength(2)
    expect(Object.keys(rows[0])).toEqual([...headers, 'Source File'])
    expect(rows[0]['Source File']).toBe('march.xlsx')
    expect(rows[1]['Source File']).toBe('april.xlsx')
  })
})

describe('allRecordsRows', () => {
  const headers = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status', 'Add Action', 'Add Comments']
  // Row 0/1: a duplicate pair, both export-eligible. Row 2: unique on its
  // own, also export-eligible. Row 3: blank Root Id (a SAME field) - a
  // Validation Error, never placed into any group.
  const rows: CellValue[][] = [
    ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'],
    ['12345', 'INV-001', 'ABC', 'A-2', 'Open', 'Pending', 'N/A'],
    ['77777', 'INV-999', 'XYZ', 'A-3', 'Open', 'Pending', 'N/A'],
    ['', 'INV-222', 'XYZ', 'A-4', 'Open', 'Pending', 'N/A'],
  ]

  it('includes every original record, in the original order, even one with a Validation Error that belongs to no group', () => {
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    expect(result.validationErrors.length).toBeGreaterThan(0) // sanity check: row 3 really is a validation error

    const exported = allRecordsRows(dataset, result.groups, new Map())
    expect(exported).toHaveLength(4)
    expect(exported.map((r) => r['Root Id'])).toEqual(['12345', '12345', '77777', ''])
  })

  it('writes a disposition only into the rows of the group it was recorded against - every other row, including the validation-error row, stays untouched', () => {
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    const duplicateGroup = result.groups.find((g) => g.records.length === 2)
    expect(duplicateGroup).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[duplicateGroup!.id, 'Trax Review']])

    const exported = allRecordsRows(dataset, result.groups, dispositions)
    expect(exported[0]['Add Action']).toBe('Trax Review')
    expect(exported[1]['Add Action']).toBe('Trax Review')
    expect(exported[2]['Add Action']).toBe('Pending') // the unique record - no disposition recorded for its group
    expect(exported[3]['Add Action']).toBe('Pending') // the validation-error record - never in any group at all
  })

  it('writes a comment only into the rows of the group it was recorded against - every other row, including the validation-error row, stays untouched', () => {
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    const duplicateGroup = result.groups.find((g) => g.records.length === 2)
    expect(duplicateGroup).toBeTruthy()
    const comments = new Map<string, string>([[duplicateGroup!.id, 'Checked against carrier invoice.']])

    const exported = allRecordsRows(dataset, result.groups, new Map(), comments)
    expect(exported[0]['Add Comments']).toBe('Checked against carrier invoice.')
    expect(exported[1]['Add Comments']).toBe('Checked against carrier invoice.')
    expect(exported[2]['Add Comments']).toBe('N/A') // the unique record - no comment recorded for its group
    expect(exported[3]['Add Comments']).toBe('N/A') // the validation-error record - never in any group at all
  })

  it('writes a disposition and a comment for the same group independently, each into its own column', () => {
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    const duplicateGroup = result.groups.find((g) => g.records.length === 2)
    expect(duplicateGroup).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[duplicateGroup!.id, 'Trax Review']])
    const comments = new Map<string, string>([[duplicateGroup!.id, 'Checked against carrier invoice.']])

    const exported = allRecordsRows(dataset, result.groups, dispositions, comments)
    expect(exported[0]['Add Action']).toBe('Trax Review')
    expect(exported[0]['Add Comments']).toBe('Checked against carrier invoice.')
    expect(exported[1]['Add Action']).toBe('Trax Review')
    expect(exported[1]['Add Comments']).toBe('Checked against carrier invoice.')
  })

  it('does not export a disposition into a record with a blank Audit ID, even though its group has one recorded', () => {
    const mixedRows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'], // eligible
      ['12345', 'INV-001', 'ABC', '', 'Open', 'Pending', 'N/A'], // blank Audit ID
      ['77777', 'INV-999', 'XYZ', 'A-3', 'Open', 'Pending', 'N/A'],
    ]
    const dataset = datasetFrom(headers, mixedRows)
    const { result } = runValidation(headers, mixedRows)
    const duplicateGroup = result.groups.find((g) => g.records.length === 2)
    expect(duplicateGroup).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[duplicateGroup!.id, 'Trax Review']])

    const exported = allRecordsRows(dataset, result.groups, dispositions)
    expect(exported[0]['Add Action']).toBe('Trax Review') // export-eligible
    expect(exported[1]['Add Action']).toBe('Pending') // blank Audit ID - untouched
  })

  it('does not export a disposition into a record whose Audit Exception Status is not Open, even though its group has one recorded', () => {
    const mixedRows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'],
      ['12345', 'INV-001', 'ABC', 'A-2', 'Closed', 'Pending', 'N/A'],
    ]
    const dataset = datasetFrom(headers, mixedRows)
    const { result } = runValidation(headers, mixedRows)
    const duplicateGroup = result.groups.find((g) => g.records.length === 2)
    expect(duplicateGroup).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[duplicateGroup!.id, 'Trax Review']])

    const exported = allRecordsRows(dataset, result.groups, dispositions)
    expect(exported[0]['Add Action']).toBe('Trax Review')
    expect(exported[1]['Add Action']).toBe('Pending')
  })

  it('mirrors the original columns exactly, same as recordsForStatus', () => {
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    const exported = allRecordsRows(dataset, result.groups, new Map())
    for (const row of exported) {
      expect(Object.keys(row)).toEqual(headers)
    }
  })

  it('adds a trailing Source File column, correctly attributed per row, once the dataset combines more than one file', () => {
    const dataset = multiFileDatasetFrom(headers, rows, ['march.xlsx', 'april.xlsx'])
    const { result } = runValidation(headers, rows)
    const exported = allRecordsRows(dataset, result.groups, new Map())
    expect(exported.map((r) => r['Source File'])).toEqual(['march.xlsx', 'april.xlsx', 'march.xlsx', 'april.xlsx'])
  })
})

describe('exportFileBaseName', () => {
  it('returns the original uploaded file name unmodified, with only the extension stripped', () => {
    const dataset = datasetFrom(['Root Id'], [['1']], 'My Invoices Report.xlsx')
    expect(exportFileBaseName(dataset)).toBe('My Invoices Report')
  })
})

describe('resolveSourceFileColumn', () => {
  it('is null for the common single-file dataset - no Source File column is added at all', () => {
    const dataset = datasetFrom(['Root Id'], [['1']])
    expect(resolveSourceFileColumn(dataset)).toBeNull()
  })

  it('is "Source File" once the dataset spans more than one combined file', () => {
    const dataset = multiFileDatasetFrom(['Root Id'], [['1'], ['2']], ['a.xlsx', 'b.xlsx'])
    expect(resolveSourceFileColumn(dataset)).toBe('Source File')
  })

  it('falls back to a disambiguated name when the source data already has a real "Source File" column', () => {
    const dataset = multiFileDatasetFrom(['Root Id', 'Source File'], [['1', 'warehouse-a'], ['2', 'warehouse-b']], ['a.xlsx', 'b.xlsx'])
    expect(resolveSourceFileColumn(dataset)).toBe('Source File (Validator)')
  })
})

describe('buildExportWorkbook', () => {
  it('wires recordsForStatus into the Duplicate Records sheet end to end, including comments', () => {
    const headers = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status', 'Add Action', 'Add Comments']
    const duplicateRows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'],
      ['12345', 'INV-001', 'ABC', 'A-2', 'Open', 'Pending', 'N/A'],
    ]
    const dataset = datasetFrom(headers, duplicateRows)
    const { result } = runValidation(headers, duplicateRows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Trax Review']])
    const comments = new Map<string, string>([[group!.id, 'Verified with shipper.']])

    const wb = buildExportWorkbook(dataset, result, 'duplicates', dispositions, comments)
    expect(wb.SheetNames).toEqual(['Duplicate Records'])
    const sheet = wb.Sheets['Duplicate Records']
    expect(sheet).toBeTruthy()
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!)
    expect(exported).toHaveLength(2)
    expect(exported.every((r) => r['Add Action'] === 'Trax Review')).toBe(true)
    expect(exported.every((r) => r['Add Comments'] === 'Verified with shipper.')).toBe(true)
    expect(exported.every((r) => !('Group ID' in r) && !('Status' in r) && !('Excel Row' in r))).toBe(true)
  })

  it('builds the complete report as a single sheet, under the original sheet name, with every original record and comment', () => {
    const headers = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status', 'Add Action', 'Add Comments']
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', 'A-1', 'Open', 'Pending', 'N/A'],
      ['12345', 'INV-001', 'ABC', 'A-2', 'Open', 'Pending', 'N/A'],
      ['77777', 'INV-999', 'XYZ', 'A-3', 'Open', 'Pending', 'N/A'],
    ]
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    const dispositions = new Map<string, Disposition>([[group!.id, 'Carrier Review']])
    const comments = new Map<string, string>([[group!.id, 'Awaiting carrier response.']])

    const wb = buildExportWorkbook(dataset, result, 'complete', dispositions, comments)
    // Exactly one sheet - no Summary/Duplicate Groups/Rule Evaluation/Validation Errors tabs.
    expect(wb.SheetNames).toEqual([dataset.sheetName])
    const sheet = wb.Sheets[dataset.sheetName]
    expect(sheet).toBeTruthy()
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!)
    expect(exported).toHaveLength(3) // every original row, not just the flagged pair
    expect(exported[0]['Add Action']).toBe('Carrier Review')
    expect(exported[0]['Add Comments']).toBe('Awaiting carrier response.')
    expect(exported[1]['Add Action']).toBe('Carrier Review')
    expect(exported[1]['Add Comments']).toBe('Awaiting carrier response.')
    expect(exported[2]['Add Action']).toBe('Pending')
    expect(exported[2]['Add Comments']).toBe('N/A')
  })

  it('records a disposition end to end, but excludes it from export for a record with a blank Audit ID', () => {
    const headers = ['Root Id', 'Invoice Number', 'Client Code', 'Audit ID', 'Audit Exception Status', 'Add Action']
    const rows: CellValue[][] = [
      ['12345', 'INV-001', 'ABC', '', 'Open', 'Pending'],
      ['12345', 'INV-001', 'ABC', '', 'Open', 'Pending'],
    ]
    const dataset = datasetFrom(headers, rows)
    const { result } = runValidation(headers, rows)
    const group = result.groups.find((g) => g.records.length === 2)
    expect(group).toBeTruthy()
    // The reviewer was able to set this in the UI even though Audit ID is blank -
    // only export filters it out.
    const dispositions = new Map<string, Disposition>([[group!.id, 'Reject Invoice']])

    const wb = buildExportWorkbook(dataset, result, 'duplicates', dispositions)
    const sheet = wb.Sheets['Duplicate Records']
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!)
    expect(exported).toHaveLength(2)
    expect(exported.every((r) => r['Add Action'] === 'Pending')).toBe(true)
  })
})
