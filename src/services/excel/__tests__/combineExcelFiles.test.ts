import { describe, it, expect } from 'vitest'
import { headersMatch, buildCombinedDataset, type ExcelFileForCombining } from '../combineExcelFiles'
import type { SheetData, WorkbookMeta } from '@/types'

function metaFor(fileName: string, fileSizeBytes = 1000): WorkbookMeta {
  return { fileName, fileSizeBytes, sheetNames: ['Sheet1'], sheets: { Sheet1: { name: 'Sheet1', rowCount: 0, columnCount: 0 } } }
}

function dataFor(headers: string[], rows: SheetData['rows'], sheetName = 'Sheet1'): SheetData {
  return { sheetName, headers, rows, excelRowNumbers: rows.map((_, i) => i + 2) }
}

describe('headersMatch', () => {
  it('is true for identical header lists', () => {
    expect(headersMatch(['A', 'B', 'C'], ['A', 'B', 'C'])).toBe(true)
  })

  it('is false for different lengths', () => {
    expect(headersMatch(['A', 'B'], ['A', 'B', 'C'])).toBe(false)
  })

  it('is false when the same headers appear in a different order', () => {
    expect(headersMatch(['A', 'B', 'C'], ['B', 'A', 'C'])).toBe(false)
  })

  it('is false for a case difference - an exact match is required', () => {
    expect(headersMatch(['Root Id'], ['root id'])).toBe(false)
  })

  it('is true for two empty lists', () => {
    expect(headersMatch([], [])).toBe(true)
  })
})

describe('buildCombinedDataset', () => {
  const headers = ['Root Id', 'Invoice Number']

  it('returns null for an empty file list', () => {
    expect(buildCombinedDataset([])).toBeNull()
  })

  it('wraps a single file as a one-entry sourceFiles dataset, unchanged fileName/sheetName', () => {
    const file: ExcelFileForCombining = { meta: metaFor('invoices.xlsx', 500), data: dataFor(headers, [['1', 'INV-1']]) }
    const combined = buildCombinedDataset([file])

    expect(combined).not.toBeNull()
    expect(combined!.fileName).toBe('invoices.xlsx')
    expect(combined!.sheetName).toBe('Sheet1')
    expect(combined!.fileSizeBytes).toBe(500)
    expect(combined!.totalRecords).toBe(1)
    expect(combined!.totalColumns).toBe(2)
    expect(combined!.sourceFiles).toEqual([{ fileName: 'invoices.xlsx', fileSizeBytes: 500, sheetName: 'Sheet1', recordCount: 1 }])
    expect(combined!.rowSourceFileIndex).toEqual([0])
  })

  it('concatenates rows from multiple matching-header files in order, tagging each row with its source file', () => {
    const fileA: ExcelFileForCombining = {
      meta: metaFor('march.xlsx', 1000),
      data: dataFor(headers, [
        ['1', 'INV-1'],
        ['2', 'INV-2'],
      ]),
    }
    const fileB: ExcelFileForCombining = {
      meta: metaFor('april.xlsx', 2000),
      data: dataFor(headers, [['3', 'INV-3']]),
    }

    const combined = buildCombinedDataset([fileA, fileB])

    expect(combined).not.toBeNull()
    expect(combined!.fileName).toBe('Combined (2 files)')
    expect(combined!.sheetName).toBe('Combined')
    expect(combined!.fileSizeBytes).toBe(3000)
    expect(combined!.rows).toEqual([
      ['1', 'INV-1'],
      ['2', 'INV-2'],
      ['3', 'INV-3'],
    ])
    expect(combined!.totalRecords).toBe(3)
    expect(combined!.rowSourceFileIndex).toEqual([0, 0, 1])
    expect(combined!.sourceFiles).toEqual([
      { fileName: 'march.xlsx', fileSizeBytes: 1000, sheetName: 'Sheet1', recordCount: 2 },
      { fileName: 'april.xlsx', fileSizeBytes: 2000, sheetName: 'Sheet1', recordCount: 1 },
    ])
  })

  it('preserves each row\'s own original Excel row number rather than renumbering across files', () => {
    const fileA: ExcelFileForCombining = { meta: metaFor('a.xlsx'), data: dataFor(headers, [['1', 'INV-1']]) } // excelRowNumbers: [2]
    const fileB: ExcelFileForCombining = { meta: metaFor('b.xlsx'), data: dataFor(headers, [['2', 'INV-2']]) } // excelRowNumbers: [2] too - same position in its own file

    const combined = buildCombinedDataset([fileA, fileB])
    expect(combined!.excelRowNumbers).toEqual([2, 2])
  })

  it('returns null when the given files do not all share the exact same headers (defensive re-check)', () => {
    const fileA: ExcelFileForCombining = { meta: metaFor('a.xlsx'), data: dataFor(['Root Id', 'Invoice Number'], [['1', 'INV-1']]) }
    const fileB: ExcelFileForCombining = { meta: metaFor('b.xlsx'), data: dataFor(['Root Id', 'Client Code'], [['2', 'ABC']]) }
    expect(buildCombinedDataset([fileA, fileB])).toBeNull()
  })
})
