import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldCheck, Cpu, Table2 } from 'lucide-react'

export function About() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">About Duplicate Validator</h1>
        <p className="mt-1 text-muted-foreground">
          A focused tool for finding duplicate and potential-duplicate records in an Excel export, using a JSON
          rules file as the single source of truth for how each field should be treated.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <Feature icon={ShieldCheck} title="Runs entirely in your browser">
            Your Excel file and rules file are never uploaded anywhere. There is no login, no database, and no
            backend - everything happens on your machine, for the current browser session only.
          </Feature>
          <Feature icon={Cpu} title="Built for large files">
            Duplicate detection uses a single indexed pass over your data (never a row-by-row comparison), runs in a
            background Web Worker, and renders results in a virtualized table - designed to stay responsive from a
            few hundred rows up to several hundred thousand.
          </Feature>
          <Feature icon={Table2} title="Four simple rules">
            Every field in your rules file is one of SAME, UNIQUE, OPTIONAL, or N/A. SAME fields must match for
            records to be grouped together; UNIQUE fields distinguish an exact duplicate from one that merely looks
            alike; OPTIONAL differences are shown but never block a match; N/A fields are ignored entirely.
          </Feature>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Closing or refreshing the browser clears the current session - nothing is saved beyond lightweight run
        history (file name, timestamp, and counts) kept in your browser's local storage.
      </p>
    </div>
  )
}

function Feature({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}
