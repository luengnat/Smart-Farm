import type { ReactNode } from 'react'
import { LayoutGrid, BarChart3, Sprout, Clock, Settings } from 'lucide-react'

type ShellPage = 'dashboard' | 'analytics' | 'crop-comparison' | 'plan-history' | 'settings'

interface NavItem {
  id: ShellPage
  icon: ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: <LayoutGrid size={20} />, label: 'Dashboard' },
  { id: 'analytics', icon: <BarChart3 size={20} />, label: 'Analytics' },
  { id: 'crop-comparison', icon: <Sprout size={20} />, label: 'Crops' },
  { id: 'plan-history', icon: <Clock size={20} />, label: 'History' },
  { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
]

interface AppShellProps {
  currentPage: string
  onNavigate: (page: ShellPage) => void
  farmName?: string
  children: ReactNode
}

const shellStyles = {
  container: { display: 'flex', height: '100vh', overflow: 'hidden' },
  main: { display: 'flex', flexDirection: 'column' as const, flex: 1, overflow: 'hidden' },
  topbar: {
    height: 48,
    background: 'var(--color-bg-surface)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 var(--space-4)',
    flexShrink: 0,
  },
  topbarTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  sidebar: {
    width: 60,
    background: 'var(--color-bg-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: 'var(--space-4)',
    gap: 'var(--space-1)',
    flexShrink: 0,
  },
  navItem: (active: boolean) => ({
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
    background: active ? 'var(--color-accent-bg)' : 'transparent',
    border: 'none',
    transition: 'all var(--duration-fast) var(--ease-out)',
  }),
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-6)',
  },
}

export function AppShell({ currentPage, onNavigate, farmName, children }: AppShellProps) {
  return (
    <div style={shellStyles.container}>
      <div style={shellStyles.sidebar}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            style={shellStyles.navItem(currentPage === item.id)}
            onClick={() => onNavigate(item.id)}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <div style={shellStyles.main}>
        <div style={shellStyles.topbar}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            GrowPlan
          </span>
          <span style={shellStyles.topbarTitle}>{farmName || 'My Farm'}</span>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
        </div>
        <div style={shellStyles.content}>
          {children}
        </div>
      </div>
    </div>
  )
}
