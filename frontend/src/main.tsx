import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAuth } from './auth'
import { Login } from './Login'
import { InvoicesPage } from './InvoicesPage'
import { ReceivablesPage } from './ReceivablesPage'
import { PaymentsPage } from './PaymentsPage'
import { RemindersPage } from './RemindersPage'
import { AdjustmentsPage } from './AdjustmentsPage'
import { ReportsPage } from './ReportsPage'
import { UsersPage } from './UsersPage'
import { OverviewPage } from './OverviewPage'

const root = createRoot(document.getElementById('root')!)
const pageElement = window.location.pathname === '/overview' ? <OverviewPage /> : window.location.pathname === '/users' ? <UsersPage /> : window.location.pathname === '/reports' ? <ReportsPage /> : window.location.pathname === '/adjustments' ? <AdjustmentsPage /> : window.location.pathname === '/reminders' ? <RemindersPage /> : window.location.pathname === '/payments' ? <PaymentsPage /> : window.location.pathname === '/invoices' ? <InvoicesPage /> : window.location.pathname === '/receivables' ? <ReceivablesPage /> : <App />
initializeAuth().then(authenticated => {
  root.render(<StrictMode>{authenticated ? pageElement : <Login />}</StrictMode>)
}).catch(() => root.render(<Login error />))
