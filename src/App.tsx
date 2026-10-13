import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ValidationSessionProvider } from '@/context/ValidationSessionContext'
import { Dashboard } from '@/pages/Dashboard/Dashboard'
import { NewValidation } from '@/pages/NewValidation/NewValidation'
import { Results } from '@/pages/Results/Results'
import { Rules } from '@/pages/Rules/Rules'
import { RuleImport } from '@/pages/RuleImport/RuleImport'
import { History } from '@/pages/History/History'
import { Reporting } from '@/pages/Reporting/Reporting'
import { About } from '@/pages/About/About'

/**
 * HashRouter (not BrowserRouter) is used deliberately: this app has no
 * backend, so it must work when served from a plain static file host (or
 * even a `file://` preview) with no server-side rewrite rules for
 * client-side routes.
 */
export default function App() {
  return (
    <ValidationSessionProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="new" element={<NewValidation />} />
            <Route path="results" element={<Results />} />
            <Route path="rules" element={<Rules />} />
            <Route path="rules/import" element={<RuleImport />} />
            <Route path="history" element={<History />} />
            <Route path="reporting" element={<Reporting />} />
            <Route path="about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ValidationSessionProvider>
  )
}
