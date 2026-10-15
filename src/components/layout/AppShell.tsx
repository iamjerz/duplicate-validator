import { useId, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { FileSearch, Trash2, User } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useValidationSession } from '@/context/ValidationSessionContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const { hasAnyData, reviewerName, setReviewerName } = useValidationSession()
  const [clearOpen, setClearOpen] = useState(false)
  const reviewerNameId = useId()

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={reviewerNameId} className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Reviewer
              </Label>
              <Input
                id={reviewerNameId}
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Your full name"
                title="Your full name, used to initial auto-filled comments (e.g. Juan Dela Cruz -> JDC)"
                className="h-8 w-40 text-sm"
              />
            </div>
            {hasAnyData && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setClearOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Clear Session
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
      <ClearSessionDialog open={clearOpen} onOpenChange={setClearOpen} />
    </div>
  )
}
