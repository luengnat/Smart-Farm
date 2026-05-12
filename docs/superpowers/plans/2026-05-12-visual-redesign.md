# Visual Redesign: Industrial Precision Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the GrowPlan app with an industrial precision visual direction — dark surfaces, monospace data, dense information layout, zero decoration.

**Architecture:** Build CSS custom properties design system first, then create base components, then redesign each page. All pages continue using existing data flow (client-side generator) until Phase 1B adds real auth + backend data.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Google Fonts (Inter + JetBrains Mono), Recharts (dark-themed), Lucide icons

---

## File Structure

### New Files
- `growplan-web/src/styles/tokens.css` — Color, typography, spacing, component tokens
- `growplan-web/src/styles/base.css` — Reset, body styles, scrollbar styling, font imports
- `growplan-web/src/styles/components.css` — Surface, Panel, Button, Input, Badge, Metric, TabBar
- `growplan-web/src/components/Surface.tsx` — Surface wrapper (border, bg, radius)
- `growplan-web/src/components/Metric.tsx` — Large number + small label display
- `growplan-web/src/components/TabBar.tsx` — Horizontal tab strip with underline
- `growplan-web/src/components/AppShell.tsx` — Top bar + sidebar + content layout
- `growplan-web/src/pages/LoginPage.tsx` — Dark login form
- `growplan-web/src/pages/RegisterPage.tsx` — Dark register form

### Modified Files
- `growplan-web/index.html` — Add Google Fonts link
- `growplan-web/src/main.tsx` — Import tokens.css, base.css, components.css
- `growplan-web/src/App.tsx` — Wrap authenticated pages in AppShell, add Login/Register routes
- `growplan-web/src/pages/DashboardPage.tsx` — Full redesign with dense metric grid
- `growplan-web/src/pages/SetupFarmPage.tsx` — Empty defaults, progress indicator, dark theme
- `growplan-web/src/pages/SelectCropsPage.tsx` — Dark crop card grid, empty initial selection
- `growplan-web/src/pages/DefineGoalPage.tsx` — Compact dark form
- `growplan-web/src/pages/GeneratePlanPage.tsx` — Dark loading state
- `growplan-web/src/pages/ConfirmPlanPage.tsx` — Dark confirm view
- `growplan-web/src/pages/AnalyticsPage.tsx` — Dark-themed Recharts
- `growplan-web/src/pages/CropComparisonPage.tsx` — Dark-themed radar + metric cards
- `growplan-web/src/pages/PlanHistoryPage.tsx` — Dark-themed timeline

### Deleted Files
- `growplan-web/src/App.css` — Replaced by design system CSS files
- `growplan-web/src/pages/WelcomePage.tsx` — Replaced by LoginPage
- `growplan-web/src/pages/WorkSchedulePage.tsx` — Demo-only, removed

---

## Chunk 1: Design System Foundation

### Task 1: Create CSS Token System + Base Styles

**Files:**
- Create: `growplan-web/src/styles/tokens.css`
- Create: `growplan-web/src/styles/base.css`
- Modify: `growplan-web/index.html`
- Modify: `growplan-web/src/main.tsx`

- [ ] **Step 1: Add Google Fonts to index.html**

Add before the closing `</head>` tag in `growplan-web/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Create tokens.css**

Create `growplan-web/src/styles/tokens.css` with all design tokens from the spec:
```css
:root {
  /* Surfaces */
  --color-bg-base: #0A0A0B;
  --color-bg-surface: #141416;
  --color-bg-elevated: #1C1C1F;
  --color-bg-hover: #242428;

  /* Borders */
  --color-border: #2A2A2E;
  --color-border-focus: #3A3A3F;

  /* Text */
  --color-text-primary: #E8E8EA;
  --color-text-secondary: #8B8B8E;
  --color-text-muted: #555558;

  /* Accent */
  --color-accent: #00E676;
  --color-accent-dim: #00C864;
  --color-accent-bg: rgba(0, 230, 118, 0.08);

  /* Status */
  --color-success: #00E676;
  --color-warning: #FFB300;
  --color-error: #FF5252;
  --color-info: #40C4FF;

  /* Chart palette */
  --color-chart-1: #00E676;
  --color-chart-2: #40C4FF;
  --color-chart-3: #FFB300;
  --color-chart-4: #FF5252;
  --color-chart-5: #B388FF;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --text-xs: 0.6875rem;
  --text-sm: 0.8125rem;
  --text-base: 0.875rem;
  --text-lg: 1rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;
  --text-display: 3rem;
  --leading-tight: 1.2;
  --leading-normal: 1.5;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Components */
  --radius-sm: 2px;
  --radius-md: 4px;
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] **Step 3: Create base.css**

Create `growplan-web/src/styles/base.css` with global reset and body styles:
```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text-primary);
  background: var(--color-bg-base);
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--color-bg-base);
}

::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-focus);
}

input, select, textarea, button {
  font-family: inherit;
  font-size: inherit;
}

a {
  color: var(--color-accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Create components.css**

Create `growplan-web/src/styles/components.css` with base component styles:
```css
/* Surface */
.surface {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.surface-elevated {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

/* Panel */
.panel {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.panel-header {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-3);
}

/* Button */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  border: 1px solid transparent;
  white-space: nowrap;
}

.btn-primary {
  background: var(--color-accent);
  color: #0A0A0B;
  border-color: var(--color-accent);
}

.btn-primary:hover {
  background: var(--color-accent-dim);
}

.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-focus);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border-color: transparent;
}

.btn-ghost:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-sm {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
}

.btn-lg {
  padding: var(--space-3) var(--space-6);
  font-size: var(--text-base);
}

.btn-full {
  width: 100%;
}

/* Input */
.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.input-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-field {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-primary);
  font-size: var(--text-base);
  transition: border-color var(--duration-fast) var(--ease-out);
  outline: none;
}

.input-field:focus {
  border-color: var(--color-border-focus);
}

.input-field::placeholder {
  color: var(--color-text-muted);
}

.input-field.mono {
  font-family: var(--font-mono);
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 500;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.badge-success { color: var(--color-success); background: rgba(0, 230, 118, 0.1); }
.badge-warning { color: var(--color-warning); background: rgba(255, 179, 0, 0.1); }
.badge-error { color: var(--color-error); background: rgba(255, 82, 82, 0.1); }
.badge-info { color: var(--color-info); background: rgba(64, 196, 255, 0.1); }

/* Metric */
.metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: var(--leading-tight);
}

.metric-label {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-value.positive { color: var(--color-success); }
.metric-value.negative { color: var(--color-error); }

/* TabBar */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
}

.tab-item {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all var(--duration-fast) var(--ease-out);
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.tab-item:hover {
  color: var(--color-text-primary);
}

.tab-item.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
```

- [ ] **Step 5: Wire up CSS imports in main.tsx**

In `growplan-web/src/main.tsx`, add the new CSS imports before the existing imports:
```typescript
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
```

- [ ] **Step 6: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds (new CSS files don't affect existing code yet)

- [ ] **Step 7: Commit**

```bash
git add growplan-web/
git commit -m "feat: add industrial precision design system — tokens, base styles, components"
```

---

### Task 2: Create Base Components (Surface, Metric, TabBar)

**Files:**
- Create: `growplan-web/src/components/Surface.tsx`
- Create: `growplan-web/src/components/Metric.tsx`
- Create: `growplan-web/src/components/TabBar.tsx`

- [ ] **Step 1: Create Surface component**

Create `growplan-web/src/components/Surface.tsx`:
```tsx
import type { ReactNode } from 'react'

interface SurfaceProps {
  children: ReactNode
  elevated?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Surface({ children, elevated, className = '', style }: SurfaceProps) {
  return (
    <div className={`${elevated ? 'surface-elevated' : 'surface'} ${className}`} style={style}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create Metric component**

Create `growplan-web/src/components/Metric.tsx`:
```tsx
interface MetricProps {
  value: string | number
  label: string
  positive?: boolean
  negative?: boolean
  className?: string
}

export function Metric({ value, label, positive, negative, className = '' }: MetricProps) {
  const valueClass = positive ? 'positive' : negative ? 'negative' : ''
  return (
    <div className={`metric ${className}`}>
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${valueClass}`}>{value}</span>
    </div>
  )
}
```

- [ ] **Step 3: Create TabBar component**

Create `growplan-web/src/components/TabBar.tsx`:
```tsx
interface Tab {
  id: string
  label: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add growplan-web/src/components/
git commit -m "feat: add Surface, Metric, TabBar base components"
```

---

### Task 3: Create AppShell (Top Bar + Sidebar + Content)

**Files:**
- Create: `growplan-web/src/components/AppShell.tsx`

- [ ] **Step 1: Create AppShell component**

Create `growplan-web/src/components/AppShell.tsx`:
```tsx
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
```

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/components/AppShell.tsx
git commit -m "feat: add AppShell layout with top bar, sidebar nav, content area"
```

---

## Chunk 2: Auth + Onboarding Pages

### Task 4: Create LoginPage and RegisterPage

**Files:**
- Create: `growplan-web/src/pages/LoginPage.tsx`
- Create: `growplan-web/src/pages/RegisterPage.tsx`

- [ ] **Step 1: Create LoginPage**

Create `growplan-web/src/pages/LoginPage.tsx`:
```tsx
import { useState } from 'react'

interface LoginPageProps {
  onLogin: (email: string, password: string) => void
  onGoToRegister: () => void
}

export function LoginPage({ onLogin, onGoToRegister }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin(email, password)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-base)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        padding: 'var(--space-8)',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          marginBottom: 'var(--space-2)',
        }}>
          GrowPlan
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-8)',
        }}>
          Sign in to your farm
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@farm.com"
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" type="submit">
            Sign in
          </button>
        </form>
        <p style={{
          textAlign: 'center',
          marginTop: 'var(--space-6)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}>
          Don't have an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onGoToRegister() }}>
            Create one
          </a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create RegisterPage**

Create `growplan-web/src/pages/RegisterPage.tsx`:
```tsx
import { useState } from 'react'

interface RegisterPageProps {
  onRegister: (email: string, password: string, displayName: string) => void
  onGoToLogin: () => void
}

export function RegisterPage({ onRegister, onGoToLogin }: RegisterPageProps) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) return
    onRegister(email, password, displayName)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-base)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        padding: 'var(--space-8)',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          marginBottom: 'var(--space-2)',
        }}>
          GrowPlan
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-8)',
        }}>
          Create your account
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Display name</label>
            <input
              className="input-field"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@farm.com"
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Confirm password</label>
            <input
              className="input-field"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          <button
            className="btn btn-primary btn-full btn-lg"
            type="submit"
            disabled={password.length < 8 || password !== confirmPassword}
          >
            Create account
          </button>
        </form>
        <p style={{
          textAlign: 'center',
          marginTop: 'var(--space-6)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}>
          Already have an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onGoToLogin() }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add growplan-web/src/pages/LoginPage.tsx growplan-web/src/pages/RegisterPage.tsx
git commit -m "feat: add dark-themed login and register pages"
```

---

### Task 5: Redesign SetupFarmPage with empty defaults + dark theme

**Files:**
- Modify: `growplan-web/src/pages/SetupFarmPage.tsx`

- [ ] **Step 1: Rewrite SetupFarmPage**

Replace the existing SetupFarmPage with a dark-themed version using the design system. Key changes:
- All form fields use `input-group` + `input-label` + `input-field` classes
- No pre-filled demo data — all fields start empty with placeholders
- Add a progress indicator (Step 1/3) at the top
- Two-column grid for rows + columns
- "Continue" button using `btn btn-primary`
- Background `var(--color-bg-base)`, surfaces use `panel` class

Form fields:
- Farm name (text, placeholder "e.g., Sunrise Greens")
- Location (text, placeholder "e.g., Bangkok, Thailand")
- Rows × Columns (number inputs, side by side, placeholder "10")
- Growing system (select dropdown with options)
- Nursery tray count (number, placeholder "30")

Use the existing `SetupFarmData` type. The `onContinue` callback and `onBackToWelcome` prop stay the same. Remove the existing CSS classes and use inline styles with design tokens.

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/pages/SetupFarmPage.tsx
git commit -m "feat: redesign SetupFarmPage with dark theme, empty defaults, progress indicator"
```

---

### Task 6: Redesign SelectCropsPage with dark theme

**Files:**
- Modify: `growplan-web/src/pages/SelectCropsPage.tsx`

- [ ] **Step 1: Rewrite SelectCropsPage**

Replace with dark-themed version. Key changes:
- Progress indicator: Step 2/3
- Grid of crop cards (3 columns on desktop, 2 on mobile)
- Each card: crop icon, crop name, click to toggle
- Selected state: `border-color: var(--color-accent)`, accent checkmark overlay
- Empty initial selection (no pre-selected crops)
- Bottom bar: selected count badge + "Continue" button
- Cards use `surface` class with hover state
- Background `var(--color-bg-base)`

Use existing `CropId` type and `cropLibrary` constant. Props unchanged.

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/pages/SelectCropsPage.tsx
git commit -m "feat: redesign SelectCropsPage with dark crop card grid, empty selection"
```

---

## Chunk 3: Dashboard + App Integration

### Task 7: Redesign DashboardPage with dense metric grid

**Files:**
- Modify: `growplan-web/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Rewrite DashboardPage**

Replace with dense metric grid layout. Use the ASCII layout from the spec:

Top row: 4 metric cards (Total Revenue, Revenue/week, Grid Utilization, Plan Status)
Middle: Farm grid visualization (left) + Crop allocation bars (right)
Bottom: Revenue sparkline (left) + Weekly actions (right)

Key changes:
- Metric cards use `Metric` component with monospace values
- Farm grid: colored cells by crop, compact
- Revenue values in `var(--font-mono)`
- All surfaces use `surface` class
- Navigation buttons (Analytics, Compare, History) moved to sidebar (AppShell handles this)
- Remove the old navigation button group

Use existing `DashboardPageProps` type. Remove the `onViewAnalytics`/`onViewCropComparison`/`onViewPlanHistory` props since AppShell sidebar handles navigation.

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/pages/DashboardPage.tsx
git commit -m "feat: redesign DashboardPage with dense metric grid, dark surfaces"
```

---

### Task 8: Redesign Analytics Pages (dark-themed charts)

**Files:**
- Modify: `growplan-web/src/pages/AnalyticsPage.tsx`
- Modify: `growplan-web/src/pages/CropComparisonPage.tsx`
- Modify: `growplan-web/src/pages/PlanHistoryPage.tsx`

- [ ] **Step 1: Dark-theme AnalyticsPage**

Update AnalyticsPage to use dark Recharts theme:
- Chart backgrounds: transparent (inherits dark page bg)
- Grid lines: `stroke="var(--color-border)"`
- Axis text: `fill="var(--color-text-secondary)"`
- Tooltips: dark surface background
- Use `TabBar` component for Revenue/Cost | Timeline | Profitability tabs
- Use chart palette colors from tokens (--color-chart-1 through --color-chart-5)
- Back button: `btn btn-ghost` with arrow icon

- [ ] **Step 2: Dark-theme CropComparisonPage**

Update CropComparisonPage:
- Crop cards use `surface` class
- Metrics in `var(--font-mono)`
- Radar chart with dark theme (same approach as analytics charts)
- Back button: `btn btn-ghost`

- [ ] **Step 3: Dark-theme PlanHistoryPage**

Update PlanHistoryPage:
- Timeline with accent dots and `--color-border` connecting lines
- Each entry uses `surface` class
- Date in `var(--font-mono)`, type badges use `badge` classes
- Back button: `btn btn-ghost`

- [ ] **Step 4: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add growplan-web/src/pages/AnalyticsPage.tsx growplan-web/src/pages/CropComparisonPage.tsx growplan-web/src/pages/PlanHistoryPage.tsx
git commit -m "feat: dark-theme analytics, crop comparison, and plan history pages"
```

---

### Task 9: Wire everything together in App.tsx

**Files:**
- Modify: `growplan-web/src/App.tsx`

- [ ] **Step 1: Update App.tsx routing**

Replace the current routing with:
1. `login` page → `LoginPage` (full-page, no shell)
2. `register` page → `RegisterPage` (full-page, no shell)
3. All other pages wrapped in `AppShell` with sidebar navigation
4. Remove `WelcomePage` and `WorkSchedulePage` references
5. Add `AppShell` import and wire `onNavigate` to `setPage`
6. Remove offline banner and backend health check logic
7. Default page: `'login'` (instead of `'welcome'`)

The auth flow for now is visual-only (no real backend auth yet):
- Login `onLogin` → just navigates to dashboard (Phase 1B adds real auth)
- Register `onRegister` → navigates to setup-farm
- Login has a "Skip" option for demo purposes that goes straight to dashboard

Import `AppShell`, `LoginPage`, `RegisterPage`.
Remove imports for `WelcomePage`, `WorkSchedulePage`.

- [ ] **Step 2: Verify build and visual check**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/App.tsx
git commit -m "feat: wire AppShell, login/register into app routing, remove welcome page"
```

---

### Task 10: Delete old CSS and demo pages

**Files:**
- Delete: `growplan-web/src/App.css`
- Delete: `growplan-web/src/pages/WelcomePage.tsx`
- Delete: `growplan-web/src/pages/WorkSchedulePage.tsx`

- [ ] **Step 1: Delete App.css**

Remove `growplan-web/src/App.css` and the `import './App.css'` from App.tsx.

- [ ] **Step 2: Delete WelcomePage.tsx and WorkSchedulePage.tsx**

Remove both files. Verify no remaining imports reference them.

- [ ] **Step 3: Search for broken imports**

Run: `cd growplan-web && grep -r "WelcomePage\|WorkSchedulePage\|App.css\|./App.css" src/`
Expected: No matches

- [ ] **Step 4: Verify build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A growplan-web/src/
git commit -m "chore: remove App.css, WelcomePage, WorkSchedulePage — replaced by design system"
```

---

### Task 11: Final build verification + push

- [ ] **Step 1: Run full build**

Run: `cd growplan-web && npx vite build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Visual verification**

Run: `cd growplan-web && npm run dev`
Open http://localhost:5173 and verify:
- Login page shows dark themed form
- Dashboard shows dense metric grid with dark surfaces
- Sidebar navigation works
- Analytics pages show dark-themed charts
- All pages use the industrial precision visual direction

- [ ] **Step 3: Push and create PR**

```bash
git push origin worktree-full-stack-improvements
```
