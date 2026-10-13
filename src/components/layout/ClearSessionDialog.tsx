import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useValidationSession } from '@/context/ValidationSessionContext'

export interface ClearSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClearSessionDialog({ open, onOpenChange }: ClearSessionDialogProps) {
  const { clearSession } = useValidationSession()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear validation data?</DialogTitle>
          <DialogDescription>
            This will remove the uploaded Excel, rules, and validation results from memory. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              clearSession()
              onOpenChange(false)
            }}
          >
            Clear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
