import { parseRuleFileFromText } from '@/engine/RuleParser'
import { validateRuleFile } from '@/engine/RuleValidator'
import type { RuleParseResult } from '@/types'

/** Reads and fully validates a user-uploaded validation-rules JSON file. */
export async function readRulesFile(file: File): Promise<RuleParseResult> {
  const text = await file.text()
  const structural = parseRuleFileFromText(text)
  return validateRuleFile(structural)
}
