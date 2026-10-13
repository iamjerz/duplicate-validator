import { ShieldCheck } from 'lucide-react'

export function PrivacyNotice() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      Your files are processed locally in your browser. Files are not uploaded to a server.
    </p>
  )
}
