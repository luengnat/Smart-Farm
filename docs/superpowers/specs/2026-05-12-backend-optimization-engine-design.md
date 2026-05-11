# Backend Optimization Engine — Design Spec

**Date:** 2026-05-12
**Status:** Approved
**Scope:** Full operations engine — optimization, replanning, nursery scheduling, demand forecasting, cost modeling

## 1. Overview

Replace the client-side `planGenerator.ts` with a real server-side optimization service. The engine uses Google OR-Tools CP-SAT solver to produce provably optimal crop plans that maximize revenue under real-world constraints (grid capacity, nursery trays, crop cycles, spatial adjacency, minimum commitments).

**Stack:** Python 3.12, FastAPI, OR-Tools CP-SAT, PostgreSQL, Redis + RQ
**Deployment:** Single-server Docker Compose (nginx, FastAPI, RQ worker, Redis, PostgreSQL)
**Frontend impact:** Minimal — same React components, swap `planGenerator.ts` calls for API fetches

## 2. Architecture

```
Frontend (React SPA)
    │ HTTP/JSON
    ▼
FastAPI Application
    ├── API Layer (endpoints, validation, serialization)
    ├── Solver Service (OR-Tools CP-SAT engine)
    ├── Forecast Service (demand forecasting)
    ├── Cost Service (labor, nutrients, energy, seeds)
    └── Domain Models (SQLAlchemy ORM + Pydantic schemas)
        │
        ▼
    PostgreSQL (farm state, plans, actions, disruptions)
```

**Background processing:** Solver runs go through RQ (Redis Queue). Plan generation takes 1-5 seconds for typical farm sizes — the frontend polls for completion rather than blocking.

## 3. Project Structure

```
growplan-api/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── models/           # SQLAlchemy ORM
│   │   ├── farm.py
│   │   ├── crop.py
│   │   ├── plan.py
│   │   └── nursery.py
│   ├── schemas/          # Pydantic request/response
│   ├── api/
│   │   ├── plans.py
│   │   ├── farms.py
│   │   ├── nursery.py
│   │   └── schedules.py
│   ├── services/
│   │   ├── solver.py     # OR-Tools CP-SAT engine
│   │   ├── replanner.py  # Disruption handling + warm-start
│   │   ├── nursery.py    # Nursery scheduling
│   │   ├── forecast.py   # Demand forecasting
│   │   └── cost.py       # Cost modeling
│   └── workers/
│       └── solver_worker.py
├── alembic/              # DB migrations
├── tests/
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

## 4. Optimization Engine (CP-SAT Solver)

### Decision Variables

```python
x[crop_id, grid_index, week] ∈ {0, 1}   # crop occupying grid this week
n[crop_id, week] ∈ Z≥0                  # trays seeded this week
h[crop_id, grid_index, week] ∈ {0, 1}   # harvesting this grid this week
```

### Constraints

**Grid exclusivity** — at most one crop per grid per week:
```
sum(x[crop, grid, week] for crop in crops) <= 1  for all grid, week
```

**Crop cycle continuity** — crop stays on grid for full `weeksOnPanel`:
```
x[crop, grid, week] => x[crop, grid, week+1..week+cycle-1]
```

**Nursery lead time** — can't transplant before seedlings are ready:
```
transplant_week >= seed_week + nurseryLeadWeeks
```

**Nursery tray capacity** — cumulative resource constraint:
```
sum(n[crop, week] for active batches) <= totalTrays  for all week
```

**Minimum commitments** — guaranteed kg/week per crop:
```
sum(harvest_kg[crop, grid, week]) >= minKgPerWeek[crop]  for committed crops
```

**Spatial constraints** (CP-SAT handles natively):
- Edge preference: penalize interior placement for edge-preferring crops
- Neighbor bonus: reward same-crop adjacency
- Isolation: dead/diseased grids excluded from allocation

### Objective Function

```python
maximize sum(revenue_per_grid_week[crop] * x[crop, grid, week])

# Soft penalties (weighted):
- nursery_overflow_penalty * overflow
- commitment_shortfall_penalty * shortfall
- spatial_suboptimal_penalty * bad_placement_score
```

### Warm-Start Replanning

When a disruption occurs:
1. Current plan provides warm-start hints (fixed variables for past weeks)
2. Disruption constraints mark dead grids as unavailable
3. Modified objective minimizes deviation from original plan + maximizes recovery revenue

Replanning is an incremental adjustment, not a full re-solve.

### Solver Flow

```
POST /plans/generate
  → Validate inputs (Pydantic)
  → Build CP-SAT model (variables + constraints + objective)
  → Solve (CP-SAT, 10s default timeout)
  → Post-process: nursery batches, rotation schedule, revenue analysis
  → Persist plan to DB
  → Return plan ID + results
```

## 5. API Design

### Endpoints

```
GET    /farms/{farm_id}                 # Farm config
PUT    /farms/{farm_id}                 # Update farm
GET    /crops                           # Crop library

POST   /plans/generate                  # Generate plan (async → job_id)
GET    /plans/{plan_id}/status          # Poll solver status
GET    /plans/{plan_id}                 # Full plan results
POST   /plans/{plan_id}/confirm         # Lock as active

POST   /plans/{plan_id}/advance-week    # Advance current week
POST   /plans/{plan_id}/disrupt         # Report disruption
POST   /plans/{plan_id}/replan          # Re-optimize after disruption

GET    /plans/{plan_id}/actions         # Action queue (current week)
GET    /plans/{plan_id}/nursery         # Nursery pipeline
GET    /plans/{plan_id}/schedule        # Work schedule
GET    /plans/{plan_id}/revenue         # Revenue analysis
GET    /plans/{plan_id}/costs           # Cost breakdown
```

### Key Request/Response Shapes

**POST /plans/generate**
```json
{
  "farm_id": "uuid",
  "selected_crop_ids": ["lettuce", "basil", "kale", "mint"],
  "goal": {
    "planning_horizon_weeks": 12,
    "priority": "maximize-revenue",
    "commitments": {
      "lettuce": {"enabled": true, "min_kg_per_week": 5.0},
      "basil": {"enabled": false, "min_kg_per_week": 0}
    }
  }
}
```
Response:
```json
{ "plan_id": "uuid", "status": "solving", "poll_url": "/plans/{plan_id}/status" }
```

**GET /plans/{plan_id}** (when completed)
```json
{
  "id": "uuid",
  "status": "completed",
  "rows": 4,
  "columns": 12,
  "total_grids": 48,
  "cells": [{"index": 0, "crop_id": "basil", "status": "planned"}],
  "allocations": [{"crop_id": "basil", "grids_allocated": 24, "revenue_per_week": 28.8}],
  "nursery_occupancy": [{"week": 1, "trays_in_use": 12, "total_trays": 30}],
  "nursery_batches": [{"id": "basil-w1", "crop_id": "basil", "seed_week": 1}],
  "revenue": {"total_per_week": 86.4, "max_possible": 86.4, "efficiency_pct": 100},
  "horizon_weeks": 12
}
```

**POST /plans/{plan_id}/disrupt**
```json
{
  "type": "crop-death",
  "grid_indexes": [5, 6, 7],
  "crop_id": "basil",
  "description": "Root rot detected in Zone B"
}
```

Response shapes intentionally mirror the current `GeneratedPlanData` TypeScript type. Frontend changes: replace `generatePlanData()` calls with `fetch()`, add solver status polling. Component structure stays the same.

## 6. Data Model (PostgreSQL)

### farms
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | |
| location | TEXT | |
| rows | INT | |
| columns | INT | |
| growing_system | TEXT | default 'hydroponic' |
| nursery_tray_count | INT | |
| nursery_tray_cells | INT | |
| nursery_buffer_pct | REAL | default 10 |
| created_at | TIMESTAMPTZ | |

### crops (seeded reference data)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | 'lettuce', 'basil', etc. |
| name | TEXT | |
| category | TEXT | |
| icon | TEXT | emoji |
| accent | TEXT | hex color |
| weeks_on_panel | INT | |
| nursery_lead_weeks | INT | |
| yield_per_grid | REAL | kg per grid per harvest |
| price_per_kg | REAL | |
| seedlings_per_grid | INT | |
| tray_cell_count | INT | |
| germination_rate | REAL | default 0.95 |
| prefers_edge | BOOLEAN | default false |
| edge_weight | REAL | default 0.5 |
| neighbor_bonus | REAL | default 1.0 |

### plans
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| farm_id | UUID FK → farms | |
| status | TEXT | solving, completed, confirmed, disrupted |
| current_week | INT | default 1 |
| horizon_weeks | INT | |
| goal_priority | TEXT | default 'maximize-revenue' |
| goal_commitments | JSONB | flexible per-crop targets |
| selected_crops | TEXT[] | |
| solver_log | JSONB | runtime, variables, constraints |
| created_at | TIMESTAMPTZ | |

### grid_cells
| Column | Type | Notes |
|--------|------|-------|
| plan_id | UUID FK → plans | PK (composite) |
| cell_index | INT | PK (composite) |
| crop_id | TEXT FK → crops | |
| status | TEXT | planned, growing, ready-to-harvest, harvested, empty, dead |
| week_started | INT | |
| week_harvest_expected | INT | |

### allocations
| Column | Type | Notes |
|--------|------|-------|
| plan_id | UUID FK → plans | PK (composite) |
| crop_id | TEXT FK → crops | PK (composite) |
| grids_allocated | INT | |
| grids_per_section | INT | |
| harvest_cycle_weeks | INT | |
| sustainable_kg_per_week | REAL | |
| revenue_per_week | REAL | |
| revenue_per_grid_week | REAL | |
| seedlings_per_cycle | INT | |
| trays_per_cycle | INT | |

### nursery_batches
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK (composite) |
| plan_id | UUID FK → plans | PK (composite) |
| crop_id | TEXT FK → crops | |
| seed_week | INT | |
| transplant_week | INT | |
| seedling_count | INT | |
| tray_count | INT | |
| status | TEXT | planned, seeding, sprouting, ready, transplanted, failed |

### disruptions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| plan_id | UUID FK → plans | |
| type | TEXT | crop-death, disease, nursery-failure, demand-change |
| grid_indexes | INT[] | |
| crop_id | TEXT FK → crops | |
| week | INT | |
| description | TEXT | |
| created_at | TIMESTAMPTZ | |

### actions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| plan_id | UUID FK → plans | |
| type | TEXT | transplant, harvest, seed-nursery, replant, sanitize, review |
| priority | TEXT | urgent, this-week, upcoming |
| week | INT | |
| crop_id | TEXT FK → crops | |
| grid_indexes | INT[] | |
| description | TEXT | |
| revenue_impact | REAL | |
| completed | BOOLEAN | default false |
| completed_at | TIMESTAMPTZ | |

**Design decisions:**
- JSONB for commitments — flexible, read-heavy, not queried relationally
- Array types for grid_indexes — PostgreSQL native, matches frontend model
- Denormalized allocations — solver output stored as-is
- Disruptions table provides audit trail for replanning engine and analytics

## 7. Cost Modeling

### Components

| Category | Model | Source |
|----------|-------|--------|
| Labor | Task-based: minutes × rate | Action queue × labor rates |
| Nutrients | Per crop per grid-week | Crop recipe nutrient costs |
| Energy | Base weekly + per-grid variable | Farm configuration |
| Seeds | Per seedling | Crop recipe seed costs |

### Output per plan

```
Weekly breakdown:
  Labor:     $X/week
  Nutrients: $Y/week
  Energy:    $Z/week
  Seeds:     $W/week
  ─────────────────
  Total:     $T/week
  Revenue:   $R/week
  Profit:    $P/week
  Margin:    M%
```

Feeds back into solver as alternative objective: `maximize(profit)` vs `maximize(revenue)`.

## 8. Demand Forecasting

### Progressive model maturity

1. **Moving average** (first 4-8 weeks): `avg(kg_sold_last_4_weeks)`
2. **Exponential smoothing** (after 8 weeks): weight recent weeks more heavily
3. **Seasonal adjustment** (after 12+ weeks): detect weekly demand patterns

### Output

```python
demand_forecast[crop_id, week] = {
    "expected_kg": 12.5,
    "confidence": 0.7,
    "trend": "increasing" | "stable" | "decreasing"
}
```

Feeds the solver as soft constraints — bonus for matching forecast demand without sacrificing confirmed commitments.

## 9. Deployment

### Docker Compose

```yaml
services:
  nginx:        # Reverse proxy + static files
  fastapi:      # gunicorn + uvicorn (2-4 workers)
  rq-worker:    # Dedicated OR-Tools solver process
  redis:        # Task queue
  postgres:     # Farm state + plans
```

Minimum: 2 vCPU, 4GB RAM.

### Frontend Integration Phases

**Phase 1 — API client layer:**
- `src/lib/api.ts` — typed fetch wrapper
- Replace `generatePlanData()` with `POST /plans/generate` + polling
- Swap `useMemo` computations for API reads

**Phase 2 — Real-time updates:**
- SSE/WebSocket for solver progress
- Push notifications for disruption alerts
- Live nursery status

**Phase 3 — Persistence & analytics:**
- Farm setup saved to DB
- Multi-plan comparison
- Historical analytics (revenue, cost trends)

### Dependencies

```txt
fastapi>=0.110
uvicorn[standard]>=0.30
sqlalchemy>=2.0
alembic>=1.13
psycopg2-binary>=2.9
pydantic>=2.0
ortools>=9.10
redis>=5.0
rq>=1.16
numpy>=1.26
httpx>=0.27
pytest>=8.0
```
