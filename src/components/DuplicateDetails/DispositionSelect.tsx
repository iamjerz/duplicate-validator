import { useId } from 'react'
import { ClipboardList } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DISPOSITION_OPTIONS, type Disposition } from '@/types'

/**
 * Radix's Select reserves the empty string for its own internal "no value"
 * state and throws if an Item uses it - so the clear/"Not set" option uses
 * this sentinel instead, translated back to `null` before it ever reaches
 * the caller.
 */
const NOT_SET_VALUE = '__NOT_SET__'

export interface DispositionSelectProps {
  value: Disposition | null
  onChange: (disposition: Disposition | null) => void
}

/**
 * A reviewer's chosen action for one duplicate group, under one rule. This
 * is a separate, session-only label - it never changes the group's
 * computed Explanation or classification, and is rendered alongside
 * (never inside) DuplicateDetails. See ValidationSessionContext's
 * `dispositions` for how it's stored, and ExportMenu/buildExportWorkbook
 * for how it reaches the exported report.
 */
export function DispositionSelect({ value, onChange }: DispositionSelectProps) {
  const selectId = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={selectId} className="flex items-center gap-1.5 text-sm font-medium">
        <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
        Disposition
      </Label>
      <Select
        value={value ?? NOT_SET_VALUE}
        onValueChange={(next) => onChange(next === NOT_SET_VALUE ? null : (next as Disposition))}
      >
        <SelectTrigger id={selectId} className="max-w-xs">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_SET_VALUE}>Not set</SelectItem>
          {DISPOSITION_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Your own review note for this group. It doesn&apos;t change the explanation above, is kept only for this
        session, and is included as a column in exports for any record with an Audit ID and an Audit Exception
        Status of Open.
      </p>
    </div>
  )
}
