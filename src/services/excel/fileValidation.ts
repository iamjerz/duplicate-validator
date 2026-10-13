import type { FileValidationResult } from '@/types'

/** Generous ceiling for a browser-only, in-memory tool. */
export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024

const ALLOWED_EXCEL_EXTENSIONS = ['.xlsx', '.xls']

export function validateExcelFile(file: File): FileValidationResult {
  const issues: FileValidationResult['issues'] = []
  const lowerName = file.name.toLowerCase()
  const hasAllowedExtension = ALLOWED_EXCEL_EXTENSIONS.some((ext) => lowerName.endsWith(ext))

  if (!hasAllowedExtension) {
    issues.push({ code: 'invalid-extension', message: 'Please upload a .xlsx or .xls Excel file.' })
  }
  if (file.size === 0) {
    issues.push({ code: 'empty-file', message: 'This file is empty.' })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    issues.push({
      code: 'file-too-large',
      message: `This file is larger than the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit supported in-browser.`,
    })
  }

  return { valid: issues.length === 0, issues }
}

export function validateRulesFileMeta(file: File): FileValidationResult {
  const issues: FileValidationResult['issues'] = []
  if (!file.name.toLowerCase().endsWith('.json')) {
    issues.push({ code: 'invalid-extension', message: 'Please upload a .json validation rules file.' })
  }
  if (file.size === 0) {
    issues.push({ code: 'empty-file', message: 'This file is empty.' })
  }
  return { valid: issues.length === 0, issues }
}
