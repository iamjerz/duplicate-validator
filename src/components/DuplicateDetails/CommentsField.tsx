import { useId } from 'react'
import { MessageSquare } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface CommentsFieldProps {
  value: string
  onChange: (comment: string) => void
}

/**
 * A reviewer's free-text note for one duplicate group, under one rule -
 * rendered directly below DispositionSelect and sharing its lifecycle
 * exactly: session-only, never changes the group's computed Explanation or
 * classification, and re-seeded alongside a fresh validation run (see
 * ValidationSessionContext's `comments`/`setComment` and
 * buildAutoComments/AutoComment.ts) rather than left blank. Written into the
 * exported file's own "Add Comments" column where one exists - see
 * findAddCommentsColumn in buildExportWorkbook.
 */
export function CommentsField({ value, onChange }: CommentsFieldProps) {
  const fieldId = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} className="flex items-center gap-1.5 text-sm font-medium">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        Comments
      </Label>
      <Textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add a note for this group..."
        className="max-w-xs"
        rows={3}
      />
      <p className="text-xs text-muted-foreground">
        Pre-filled as &quot;Initials: Date : Type : Reason&quot; once a Reviewer name is set in the header, for any
        rule recognized as True Duplicate or Potential Duplicate - edit it freely. It&apos;s kept only for this
        session, and is included as a column in exports for any record with an Audit ID and an Audit Exception
        Status of Open.
      </p>
    </div>
  )
}
