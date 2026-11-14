import type { ReactNode } from 'react'
export type IconName = 'overview' | 'customers' | 'invoices' | 'payments' | 'receivables' | 'reminders' | 'adjustments' | 'reports' | 'users' | 'arrow' | 'book'
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="12" /><rect x="3" y="14" width="7" height="7" /><path d="M14 19h7" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></>,
    invoices: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 9h18M7 15h3M15 14h3" /></>,
    receivables: <><path d="M4 20V4h16v16zM4 9h16M10 9v11M13 13h4M13 17h4" /></>,
    reminders: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M9 21h6M12 1v2" /></>,
    adjustments: <><path d="M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4" /></>,
    reports: <><path d="M4 3v18h17M9 17v-5M14 17V7M19 17v-8" /></>,
    users: <><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-5" /></>,
    arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
    book: <><path d="M4 3h15v18H4zM8 3v18M11 8h5M11 12h5" /><path d="M2 7h4M2 12h4M2 17h4" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
