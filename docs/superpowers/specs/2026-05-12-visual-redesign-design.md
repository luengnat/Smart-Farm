# Visual Redesign: Industrial Precision

**Goal:** Redesign the GrowPlan app with an industrial precision visual direction — dark surfaces, monospace data, dense information layout, zero decoration. Every pixel earns its place.

**Architecture:** Build a CSS custom properties design system first, then redesign each page surface. Pages continue using the existing data flow (client-side generator) for now. Phase 2 (separate spec) adds real auth + backend data on top of the new design.

**Tech Stack:** React 19, TypeScript, CSS custom properties (no Tailwind), Recharts (themed), Lucide icons

---

## 1. Design System Foundation

### Color Tokens

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
}
```

### Typography

```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;

  --text-xs: 0.6875rem;    /* 11px */
  --text-sm: 0.8125rem;    /* 13px */
  --text-base: 0.875rem;   /* 14px */
  --text-lg: 1rem;         /* 16px */
  --text-xl: 1.5rem;       /* 24px */
  --text-2xl: 2rem;        /* 32px */
  --text-display: 3rem;    /* 48px */

  --leading-tight: 1.2;
  --leading-normal: 1.5;
}
```

### Spacing

8px grid system:
```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
}
```

### Component Tokens

```css
:root {
  --radius-sm: 2px;
  --radius-md: 4px;

  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Base Components

Reusable components built on the token system:

- **Surface** — div with `--color-bg-surface` bg, `--color-border` 1px border, `--radius-md`
- **Panel** — Surface with header slot and padding
- **Button** — Primary (accent bg, dark text), Secondary (border only, text), Ghost (text only)
- **Input** — Dark bg surface, border, monospace for numbers
- **Badge** — Small label with colored dot indicator
- **Metric** — Large monospace number + small label above
- **TabBar** — Horizontal tab strip with underline indicator

---

## 2. App Shell + Navigation

### Layout Structure

```
┌──────────────────────────────────────────┐
│ Top bar: logo + farm name + user menu    │
├────────┬─────────────────────────────────┤
│        │                                 │
│ Side   │  Content area                   │
│ nav    │  (page content)                 │
│        │                                 │
│ 60px   │                                 │
│ icons  │                                 │
│ only   │                                 │
│        │                                 │
└────────┴─────────────────────────────────┘
```

- **Top bar**: 48px height. Logo left, farm name center, user avatar right. `--color-bg-surface` bg, bottom border.
- **Side nav**: 60px width, icon-only with tooltips. Routes: Dashboard, Analytics, Crops, History, Settings. `--color-bg-surface` bg, right border. Active item: accent left border + accent icon color.
- **Content area**: `--color-bg-base` bg. Scrollable. Padding `--space-6`.

### Navigation Items

| Icon | Route | Label |
|------|-------|-------|
| Grid3x3 | Dashboard | Dashboard |
| BarChart3 | Analytics | Analytics |
| Sprout | Crops | Crop Comparison |
| Clock | History | Plan History |
| Settings | Settings | Settings |

---

## 3. Auth + Onboarding Pages

### Login Page

- Full-page dark surface (`--color-bg-base`)
- Centered card, max-width 360px
- Logo at top
- Email input + password input (styled with design system)
- "Sign in" button (primary, full-width)
- "Create account" link below
- No decoration, no illustrations, no background patterns

### Register Page

- Same layout as login
- Display name + email + password + confirm password
- "Create account" button
- "Already have an account? Sign in" link

### Setup Farm Page

- Progress indicator at top: Step 1/3, 2/3, 3/3
- Compact form in a centered panel (max-width 600px)
- Fields: Farm name, location, rows x columns grid selector, growing system dropdown, nursery tray count
- Two-column layout where appropriate (rows + columns side by side)
- All fields empty by default (no demo data)
- "Continue" button bottom-right

### Select Crops Page

- Grid of crop cards (3-4 columns)
- Each card: crop icon + name, click to toggle selection
- Selected state: accent border, accent checkmark
- Empty state: "Select the crops you want to grow"
- Bottom bar: selected count + "Continue" button

### Define Goal Page

- Planning horizon slider (weeks)
- Priority radio: Maximize Space / Maximize Revenue / Balanced
- Commitment toggles per selected crop (min kg/week)
- Compact layout, no wasted space
- "Generate Plan" button (primary)

---

## 4. Dashboard Page

### Layout

Dense grid with data panels:

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Total       │ Revenue     │ Grid        │ Plan        │
│ Revenue     │ /week       │ Utilization │ Status      │
│ $X,XXX      │ $XXX        │ XX%         │ Active      │
└─────────────┴─────────────┴─────────────┴─────────────┘
┌──────────────────────────────┬──────────────────────────┐
│                              │                          │
│ Farm Grid Visualization      │ Crop Allocation          │
│ (main visual)                │ (stacked bars)           │
│                              │                          │
└──────────────────────────────┴──────────────────────────┘
┌──────────────────────────────┬──────────────────────────┐
│ Revenue Trend (sparkline)    │ Weekly Actions            │
│                              │ (compact list)            │
└──────────────────────────────┴──────────────────────────┘
```

- **Metric cards**: Large monospace number, small label above, subtle accent color for positive values
- **Farm grid**: Color-coded cells by crop, compact, hover shows crop name
- **Crop allocation**: Stacked horizontal bars per crop
- **Revenue sparkline**: Minimal line chart, accent color
- **Weekly actions**: Compact list with action type + count

---

## 5. Analytics Pages

### Analytics Overview

Three-tab layout (Revenue & Cost / Timeline / Profitability):

- **Tab bar**: Horizontal, underline style, no background
- **Charts**: Dark-themed Recharts with custom colors from chart palette
- Grid lines: `--color-border` color, subtle
- Tooltips: Dark surface, monospace numbers
- Axis labels: `--color-text-secondary`

### Crop Comparison

Side-by-side crop cards with radar chart:

- Crop cards in a grid (2-3 columns)
- Each card: crop name, key metrics (revenue/grid/week, cycle time, margin)
- Radar chart centered above cards
- Metrics in monospace, labels in sans

### Plan History

Vertical timeline:

- Left-aligned timeline with dots and connecting lines
- Each entry: snapshot type badge, date, key metrics
- Compact, scannable
- Accent color for the latest snapshot

---

## 6. File Structure

### New Files
- `src/styles/tokens.css` — CSS custom properties (colors, typography, spacing, components)
- `src/styles/base.css` — Reset + global styles (body bg, font, scrollbars)
- `src/styles/components.css` — Surface, Panel, Button, Input, Badge, Metric, TabBar styles
- `src/components/Surface.tsx` — Surface wrapper component
- `src/components/Metric.tsx` — Metric display (number + label)
- `src/components/TabBar.tsx` — Tab bar component
- `src/components/AppShell.tsx` — Top bar + side nav + content area layout
- `src/pages/LoginPage.tsx` — Redesigned login
- `src/pages/RegisterPage.tsx` — Redesigned register

### Modified Files
- `src/main.tsx` — Import tokens.css + base.css
- `src/App.tsx` — Wrap authenticated pages in AppShell
- `src/pages/DashboardPage.tsx` — Full redesign with dense grid layout
- `src/pages/SetupFarmPage.tsx` — Redesigned with empty defaults, progress indicator
- `src/pages/SelectCropsPage.tsx` — Redesigned crop card grid
- `src/pages/DefineGoalPage.tsx` — Compact redesign
- `src/pages/GeneratePlanPage.tsx` — Loading state redesign
- `src/pages/ConfirmPlanPage.tsx` — Dark theme confirm view
- `src/pages/AnalyticsPage.tsx` — Dark-themed charts
- `src/pages/CropComparisonPage.tsx` — Dark-themed radar + cards
- `src/pages/PlanHistoryPage.tsx` — Dark-themed timeline

### Deleted Files
- `src/App.css` — Replaced by design system CSS

---

## 7. Phasing

**Phase 1A (this spec):** Design system + visual redesign of all pages. Uses existing data flow.

**Phase 1B (next spec):** Auth + real data flow. Replaces client-side generator, adds login/register, wires everything to backend API.
