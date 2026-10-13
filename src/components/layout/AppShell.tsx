import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { FileSearch, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { Button } from '@/components/ui/button'
import { ClearSessionDialog } from './ClearSessionDialog'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/new', label: 'New Validation', end: false },
  { to: '/rules', label: 'Rules', end: false },
  { to: '/history', label: 'History', end: false },
  { to: '/reporting', label: 'Reporting', end: false },
  { to: '/about', label: 'About', end: false },
]

export function AppShell() {
  const { hasAnyData } = useValidationSession()
  const [clearOpen, setClearOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 font-semibold">
              <FileSearch className="h-5 w-5 text-primary" />
              Duplicate Validator
            </div>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {hasAnyData && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setClearOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Clear Session
            </Button>
          )}
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
      <ClearSessionDialog open={clearOpen} onOpenChange={setClearOpen} />
    </div>
  )
}
