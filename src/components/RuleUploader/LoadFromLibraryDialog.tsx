import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { countRuleFields } from '@/types'
import type { SavedRule } from '@/types'

export interface LoadFromLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Lets the user add a rule from their saved library to the validation
 * currently being set up, without leaving New Validation. Loading is
 * additive (same "same level" check as uploading a file) - repeat the
 * action to combine more than one saved rule.
 */
export function LoadFromLibraryDialog({ open, onOpenChange }: LoadFromLibraryDialogProps) {
  const { savedRules, loadSavedRules } = useValidationSession()
  const [error, setError] = useState<string | null>(null)

  const handleLoad = (rule: SavedRule) => {
    const issues = loadSavedRules([rule])
    if (issues.length > 0) {
      setError(issues.map((i) => i.message).join(' '))
      return
    }
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Load from Library</DialogTitle>
          <DialogDescription>
            Add a saved rule to this validation. You can load more than one, as long as they share the same level.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {savedRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved rules yet. Upload one below, or from the Rules page.
          </p>
        ) : (
          <ul className="space-y-2">
            {savedRules.map((rule) => {
              const counts = countRuleFields(rule.fields)
              return (
                <li key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{rule.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {rule.metadata?.level ?? 'No level'} - {counts.total} fields
                    </p>
                  </div>
                  <Button size="sm" onClick={() => handleLoad(rule)}>
                    Load
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
