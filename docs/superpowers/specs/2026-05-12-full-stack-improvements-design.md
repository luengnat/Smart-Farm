# Full-Stack Improvements Design Spec

> **Status:** Approved for implementation
> **Date:** 2026-05-12
> **Scope:** Backend extensions, frontend-backend wiring, analytics dashboard, UX polish, deployment

## Goal

Transform the Smart Farm GrowPlan from a client-side demo into a production-ready tool for real farm operators. Wire the React frontend to the FastAPI backend, add analytics and history tracking, polish the UX, and deploy the full stack via Docker Compose.

## Architecture

### State management shift

The frontend transitions from "all state in React `useState`" to "server state in React Query, UI state in components, form drafts in `localStorage`."

| State type | Where it lives | Example |
|------------|---------------|---------|
| Server state | React Query cache | `farm`, `plan`, `allocations`, `batches` |
| URL/form state | `localStorage` + page state | `page` (current route), wizard form drafts |
| UI state | Component-local | Modal open/closed, selected tab, hover state |

### Naming convention

Backend uses `snake_case` Python fields with Pydantic `Field(alias="camelCase")` for JSON responses. The API client maps camelCase JSON to the frontend's existing TypeScript types. Key mappings:

| Backend column | JSON alias | Frontend type field |
|----------------|------------|-------------------|
| `cell_index` | `cellIndex` | `index` |
| `revenue_total` | `revenueTotal` | `totalRevenuePerWeek` |
| `crop_id` | `cropId` | `cropId` |
| `week_started` | `weekStarted` | `weekStarted` |

The API client (`api.ts`) handles this mapping in its response transformers.

### App flow (updated)

```
Welcome → Setup → Select Crops → Define Goal → Generate Plan → Confirm Plan
                                                                             ↓
                                                       Dashboard ←──────────┘
                                                         ├→ Analytics (NEW)
                                                         ├→ Crop Comparison (NEW)
                                                         ├→ Plan History (NEW)
                                                         ├→ Replan
                                                         └→ Work Schedule
```

### Key libraries

- `@tanstack/react-query` — data fetching, caching, loading/error states
- `recharts` — charts for analytics pages
- `react-hot-toast` — non-blocking success/error notifications

### React Query cache strategy

| Query key | Stale time | Refetch on | Invalidation trigger |
|-----------|-----------|------------|---------------------|
| `['farm', id]` | 5 min | window focus | farm update mutation |
| `['plan', id]` | 30 sec | window focus | confirm, replan, advance-week |
| `['analytics', id]` | 60 sec | never | plan mutation |
| `['timeline', id]` | 60 sec | never | plan mutation |
| `['history', id]` | 5 min | never | confirm, replan, advance-week |
| `['plans', farmId]` | 5 min | window focus | new plan generated |

---

## Backend Extensions

### New model: PlanSnapshot

SQLAlchemy model in `app/models/snapshot.py`:

```python
class PlanSnapshot(Base):
    __tablename__ = "plan_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    snapshot_type = Column(String(20), nullable=False)  # "confirmed", "replanned", "week-advanced"
    grid_data = Column(JSON, nullable=False)            # list of cell dicts
    allocations = Column(JSON, nullable=False)          # list of allocation dicts
    revenue = Column(JSON, nullable=False)              # revenue breakdown dict
    created_at = Column(DateTime, server_default=func.now())

    # Index for querying history
    __table_args__ = (Index("ix_snapshots_plan_id", "plan_id"),)
```

Migration: `alembic/versions/002_plan_snapshots.py`

**Snapshot creation triggers:**
- `POST /plans/{id}/confirm` — creates snapshot with `type="confirmed"`
- `POST /plans/{id}/replan` — creates snapshot with `type="replanned"`
- `POST /plans/{id}/advance-week` — creates snapshot with `type="week-advanced"`

Each trigger serializes the plan's current cells, allocations, and revenue into JSON before modifying the plan.

### New API endpoints

All endpoints protected by existing API key middleware. Error responses use the existing `ErrorDetail` schema:

```json
{"error": {"code": "NOT_FOUND", "message": "Plan 999 not found"}}
```

| Method | Endpoint | Success | Errors |
|--------|----------|---------|--------|
| GET | `/plans/{id}/analytics` | 200 + AnalyticsResponse | 404 plan not found |
| GET | `/plans/{id}/timeline` | 200 + TimelineResponse | 404 plan not found |
| GET | `/plans/{id}/history?page=1&limit=50` | 200 + HistoryResponse | 404 plan not found |
| GET | `/plans/{id}/compare` | 200 + CompareResponse | 404 plan not found |
| GET | `/farms/{id}/plans` | 200 + list of plan summaries | 404 farm not found |
| GET | `/plans/{id}/export` | 200 + CSV file (text/csv) | 404 plan not found |

### Analytics service (`app/services/analytics.py`)

```python
def compute_analytics(
    cells: list[dict],        # GridCell dicts from plan
    allocations: list[dict],  # Allocation dicts from plan
    crops: list[dict],        # Crop parameter dicts
    horizon_weeks: int,
    current_week: int,
) -> dict:
    """Compute weekly revenue, cost, and profit arrays.

    Returns revenueByWeek, costByWeek, profitByWeek arrays,
    one entry per week from 1..horizon_weeks.
    Weeks with no activity have zero values.
    Uses existing calculate_weekly_costs() from cost.py
    for cost computation.
    """
```

The analytics service calls `calculate_weekly_costs()` from `cost.py` for consistency — no duplicated cost logic. Revenue is computed from allocation `sustainable_kg_per_week * price_per_kg` per crop.

### Analytics response shape

All arrays contain exactly `horizon_weeks` entries (one per week). Weeks with no activity have zero values.

```json
{
  "revenueByWeek": [
    {"week": 1, "lettuce": 0, "basil": 0, "total": 0},
    {"week": 5, "lettuce": 12.0, "basil": 8.4, "total": 20.4}
  ],
  "costByWeek": [
    {"week": 1, "labor": 0, "nutrients": 3.2, "energy": 5.0, "seeds": 1.8, "total": 10.0},
    {"week": 5, "labor": 4.5, "nutrients": 3.2, "energy": 5.0, "seeds": 1.8, "total": 14.5}
  ],
  "profitByWeek": [
    {"week": 1, "revenue": 0, "cost": 10.0, "profit": -10.0, "margin": 0},
    {"week": 5, "revenue": 20.4, "cost": 14.5, "profit": 5.9, "margin": 28.9}
  ],
  "cumulativeRevenue": 1240.0,
  "cumulativeCost": 870.0,
  "cumulativeProfit": 370.0
}
```

### Timeline response shape

```json
{
  "crops": [
    {
      "cropId": "lettuce",
      "cropName": "Lettuce",
      "color": "#9edb66",
      "intervals": [
        {"cellIndex": 0, "startWeek": 1, "endWeek": 5, "phase": "growing"},
        {"cellIndex": 0, "startWeek": 5, "endWeek": 6, "phase": "harvest"}
      ]
    }
  ],
  "currentWeek": 4,
  "horizonWeeks": 12
}
```

Note: `cellIndex` matches the backend `cell_index` / JSON `cellIndex` field. The frontend API client maps this to the TypeScript `GridCell.index` field.

### Crop comparison response shape

```json
{
  "crops": [
    {
      "cropId": "lettuce",
      "cropName": "Lettuce",
      "color": "#9edb66",
      "metrics": {
        "revenuePerGridWeek": 0.96,
        "costPerGridWeek": 0.35,
        "netMarginPerGridWeek": 0.61,
        "marginPct": 63.5,
        "cycleWeeks": 5,
        "nurseryTraysPerCycle": 1,
        "seedCostPerCycle": 1.52
      },
      "radarScores": {
        "revenue": 48,
        "speed": 71,
        "yield": 60,
        "price": 27,
        "ease": 95
      }
    }
  ],
  "recommended": "lettuce"
}
```

**Radar chart dimension formulas** (all normalized 0-100):

| Dimension | Formula |
|-----------|---------|
| revenue | `(revenue_per_grid_week / max_revenue_across_crops) * 100` |
| speed | `((max_cycle_weeks - crop_cycle_weeks) / (max_cycle_weeks - min_cycle_weeks)) * 100` |
| yield | `(yield_per_grid / max_yield_across_crops) * 100` |
| price | `(price_per_kg / max_price_across_crops) * 100` |
| ease | `(germination_rate) * 100` |

**Recommended badge**: highest `revenuePerGridWeek` among allocated crops.

### History response shape

```json
{
  "snapshots": [
    {
      "id": 1,
      "snapshotType": "confirmed",
      "totalGrids": 48,
      "cropCount": 3,
      "revenuePerWeek": 124.5,
      "createdAt": "2026-05-12T10:30:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 50
}
```

### Export response

`GET /plans/{id}/export` returns `text/csv` with headers:

```
Grid Index, Crop, Status, Week Started, Week Harvest Expected
0, lettuce, planned, 1, 6
1, lettuce, planned, 1, 6
2, basil, planned, 2, 8
```

Filename: `plan-{id}-week-{currentWeek}.csv`. Generated on-demand, not stored.

---

## Frontend Changes

### New dependencies

- `@tanstack/react-query` — data fetching
- `recharts` — charting
- `react-hot-toast` — toast notifications

### App.tsx refactor

Current `App.tsx` holds ~12 `useState` hooks. Refactored shape:

```tsx
const [page, setPage] = useState('welcome')
const [farmId, setFarmId] = useState<number | null>(null)    // persisted to localStorage key "gp_farmId"
const [planId, setPlanId] = useState<number | null>(null)    // persisted to localStorage key "gp_planId"

const { data: farm } = useQuery(['farm', farmId], () => fetchFarm(farmId!))
const { data: plan } = useQuery(['plan', planId], () => fetchPlan(planId!))
```

### localStorage schema

```json
{
  "gp_farmId": 1,
  "gp_planId": 5,
  "gp_wizard_draft": {
    "page": "define-goal",
    "setupFarmData": { "rows": 4, "columns": 12, ... },
    "selectedCropIds": ["lettuce", "basil"]
  }
}
```

### API client TypeScript signatures

```typescript
// growplan-web/src/lib/api.ts

export async function fetchFarm(id: number): Promise<SetupFarmData>
export async function saveFarm(data: SetupFarmData): Promise<{ id: number }>
export async function updateFarm(id: number, data: Partial<SetupFarmData>): Promise<SetupFarmData>

export async function fetchAnalytics(planId: number): Promise<{
  revenueByWeek: Array<Record<string, number>>
  costByWeek: Array<Record<string, number>>
  profitByWeek: Array<{ week: number; revenue: number; cost: number; profit: number; margin: number }>
  cumulativeRevenue: number
  cumulativeCost: number
  cumulativeProfit: number
}>

export async function fetchTimeline(planId: number): Promise<{
  crops: Array<{
    cropId: string; cropName: string; color: string
    intervals: Array<{ cellIndex: number; startWeek: number; endWeek: number; phase: string }>
  }>
  currentWeek: number
  horizonWeeks: number
}>

export async function fetchHistory(planId: number, page?: number): Promise<{
  snapshots: Array<{
    id: number; snapshotType: string; totalGrids: number
    cropCount: number; revenuePerWeek: number; createdAt: string
  }>
  total: number; page: number; limit: number
}>

export async function fetchCropComparison(planId: number): Promise<{
  crops: Array<{
    cropId: string; cropName: string; color: string
    metrics: Record<string, number>
    radarScores: { revenue: number; speed: number; yield: number; price: number; ease: number }
  }>
  recommended: string
}>

export async function exportPlan(planId: number): Promise<Blob>
```

### New pages (3)

**AnalyticsPage** — Tabbed view:
- Revenue & Cost tab: `recharts` LineChart for revenue vs cost over time; stacked AreaChart for revenue by crop; custom ProgressBar for profit margin (recharts has no gauge, use a styled bar)
- Crop Timeline tab: custom SVG Gantt chart (recharts doesn't natively support Gantt). One row per grid, colored bars for growing/harvest phases, vertical line for current week
- Profitability tab: `recharts` BarChart comparing crops by revenue-per-grid-week, cost-per-grid-week, and net margin

**CropComparisonPage** — Side-by-side cards:
- Revenue per grid-week, cycle time, nursery trays needed, seed cost per cycle
- `recharts` RadarChart comparing crops across 5 dimensions
- "Recommended" badge on crop with highest `revenuePerGridWeek`

**PlanHistoryPage** — Timeline of snapshots:
- Vertical timeline showing confirmed, replanned, and week-advanced events
- Each entry shows key metrics (total grids, revenue, crop count)
- Click to expand and view snapshot's grid layout and allocations

### UX improvements

- **Loading states**: Skeleton/placeholder on every page that fetches data (React Query `isLoading` state)
- **Error handling**: React error boundary wrapping the app; API errors show `react-hot-toast` notifications
- **Form persistence**: Setup wizard progress saved to `localStorage` under key `gp_wizard_draft` so refresh doesn't lose work. Cleared after plan generation.
- **Confirmation dialogs**: Destructive actions (replan, reset) get confirmation modal
- **Back navigation**: Every page after Dashboard has clear way back

---

## Deployment & Integration

### Docker Compose additions

Add frontend container to existing `docker-compose.yml`:

```yaml
frontend:
  build: ./growplan-web
  ports:
    - "5173:80"       # Production: served via nginx on port 80 inside container
  depends_on:
    - fastapi
```

Frontend nginx config (`growplan-web/nginx.conf`) proxies `/api/*` to the FastAPI service — same-origin calls in production, no CORS needed. Development mode uses Vite dev server on port 5173 with proxy to `localhost:8000`.

### Offline behavior

If backend health check fails:
- Setup wizard uses `localStorage` for form data
- Plan generation falls back to existing client-side `planGenerator.ts`
- Analytics pages show "Backend required — start the API server to see analytics" message
- Matches current graceful degradation pattern

### Testing

- **Backend**: extend pytest suite with tests for 4 new endpoints, analytics service edge cases (empty plan, single crop, zero revenue weeks), snapshot creation on confirm/replan/advance
- **Frontend**: add Vitest for API client response mapping functions and analytics data transformers

---

## Out of scope

- User authentication/multi-tenant (existing API key auth is sufficient)
- IoT sensor integration
- External data sources (weather, market prices)
- Mobile native app
- Real-time WebSocket updates
- Snapshot retention/cleanup (no cleanup needed for MVP)
