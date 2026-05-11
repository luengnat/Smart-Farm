# Backend Optimization Engine — Design Spec

**Date:** 2026-05-12
**Status:** Approved
**Scope:** Full operations engine — optimization, replanning, nursery scheduling, demand forecasting, cost modeling

## 1. Overview

Replace the client-side `planGenerator.ts` with a real server-side optimization service. The engine uses Google OR-Tools CP-SAT solver to produce provably optimal crop plans that maximize revenue under real-world constraints (grid capacity, nursery trays, crop cycles, spatial adjacency, minimum commitments).

**Stack:** Python 3.12, FastAPI, OR-Tools CP-SAT, PostgreSQL, Redis + RQ
**Deployment:** Single-server Docker Compose (nginx, FastAPI, RQ worker, Redis, PostgreSQL)
**Frontend impact:** Moderate — same React component structure, but `planGenerator.ts` replaced by API fetch layer with polling, error states, and offline fallback

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

**Maximize-revenue mode** (default):
```python
maximize sum(revenue_per_grid_week[crop] * x[crop, grid, week])

# Soft penalties (weighted):
- nursery_overflow_penalty * overflow         # weight: 50
- commitment_shortfall_penalty * shortfall     # weight: 100
- spatial_suboptimal_penalty * bad_placement   # weight: 10
```

**Minimize-stockout mode:**
```python
# Primary: minimize weeks where harvest < demand
minimize sum(stockout_penalty[crop, week] * max(0, demand[crop, week] - harvest[crop, week]))

# Secondary: still maximize revenue (lower weight)
maximize sum(revenue_per_grid_week[crop] * x[crop, grid, week]) * 0.3

# Soft penalties same as above
```

Stockout mode penalizes any week where harvest falls below expected demand, weighted by crop priority. Revenue is still optimized but at reduced weight.

### Warm-Start Replanning

When a disruption occurs:
1. Past weeks are **fixed** (immutable history). Only current week onward is re-optimized.
2. Dead/diseased grids marked as permanently unavailable for remaining horizon.
3. Solver receives the original plan as solution hints for fast convergence.
4. Objective: maximize recovery revenue + minimize deviation from original allocations.

This means future weeks can be fully reorganized to recover from the disruption, while past weeks remain locked.

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

**Solver result states:**
- `OPTIMAL` — proven optimal solution found. Status: `completed`.
- `FEASIBLE` — good solution found within timeout but not proven optimal. Status: `completed` (with `solver_log.optimality_gap`).
- `INFEASIBLE` — constraints are contradictory (e.g., commitments exceed farm capacity). Status: `failed`. Response includes which constraints conflict and suggested relaxations (reduce commitments or add grids).
- `NO_SOLUTION_FOUND` — timeout reached with no feasible solution. Status: `failed`. Increase timeout or reduce problem size.

## 5. API Design

### Endpoints

```
POST   /farms                           # Create farm (from setup wizard)
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

**POST /farms**
```json
{
  "name": "Green Farm",
  "location": "Bangkok",
  "rows": 4,
  "columns": 12,
  "growing_system": "hydroponic",
  "nursery_tray_count": 30,
  "nursery_tray_cells": 200,
  "nursery_buffer_pct": 10
}
```
Response: `{ "id": "uuid", ...farm }`

**GET /plans/{plan_id}** (when completed)
```json
{
  "id": "uuid",
  "status": "completed",
  "rows": 4,
  "columns": 12,
  "total_grids": 48,
  "cells": [
    {
      "index": 0,
      "crop_id": "basil",
      "status": "planned",
      "week_started": 0,
      "week_harvest_expected": 6
    }
  ],
  "allocations": [
    {
      "crop_id": "basil",
      "grids_allocated": 24,
      "grids_per_section": 3,
      "harvest_cycle_weeks": 6,
      "sustainable_kg_per_week": 12.0,
      "revenue_per_week": 28.8,
      "revenue_per_grid_week": 1.2,
      "seedlings_per_cycle": 360,
      "trays_per_cycle": 2
    }
  ],
  "rotations": [
    {
      "crop_id": "basil",
      "sections": 8,
      "grids_per_section": 3,
      "section_start_weeks": [1, 2, 3, 4, 5, 6, 7, 8],
      "harvest_weeks": [6, 7, 8, 9, 10, 11, 12, 13]
    }
  ],
  "nursery_occupancy": [
    {
      "week": 1,
      "trays_in_use": 12,
      "trays_available": 18,
      "total_trays": 30,
      "batches": [
        {
          "batch_id": "basil-w1",
          "crop_id": "basil",
          "tray_count": 2,
          "week_started": 1,
          "week_freed": 3
        }
      ]
    }
  ],
  "nursery_batches": [
    {
      "id": "basil-w1",
      "crop_id": "basil",
      "seed_week": 1,
      "transplant_week": 3,
      "seedling_count": 360,
      "tray_count": 2,
      "status": "planned"
    }
  ],
  "revenue": {
    "total_per_week": 86.4,
    "max_possible": 86.4,
    "revenue_gap": 0,
    "revenue_by_crop": {"basil": 28.8, "lettuce": 57.6},
    "opportunity_cost_of_commitments": 0
  },
  "horizon_weeks": 12
}
```

**POST /plans/{plan_id}/disrupt**
```json
{
  "type": "crop-death",
  "grid_indexes": [5, 6, 7],
  "crop_id": "basil",
  "week": 3,
  "description": "Root rot detected in Zone B"
}
```

**POST /plans/{plan_id}/replan** — Response:
```json
{
  "replanned_plan": { ...full plan shape (same as GET /plans/{plan_id}) },
  "replant_options": [
    {
      "crop_id": "arugula",
      "description": "Fast 4-week cycle, high revenue. Seedlings available in nursery.",
      "revenue_recovered": 18.0,
      "weeks_until_harvest": 4,
      "seedlings_available": true,
      "recommended": true
    }
  ],
  "deviation_from_original": {
    "grids_changed": 3,
    "revenue_delta_per_week": -10.8,
    "nursery_impact": "2 trays freed, 1 new batch needed"
  }
}
```

Response shapes mirror the current `GeneratedPlanData` TypeScript type. All fields used by the frontend are included. Frontend changes: replace `generatePlanData()` calls with `fetch()`, add solver status polling and error state handling. Component structure stays the same.

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
| batch_id | TEXT | nullable, links to nursery batch |
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

## 9. Operational Concerns

### Error Responses

All errors use a consistent envelope:
```json
{
  "error": {
    "code": "SOLVER_INFEASIBLE",
    "message": "Constraints are contradictory: commitments require 60 grids but farm has 48.",
    "details": {"conflicting_constraints": ["lettuce commitment: 50kg/week needs 50 grids", "basil commitment: 20kg/week needs 20 grids"]}
  }
}
```

| HTTP Code | Code | Meaning |
|-----------|------|---------|
| 400 | VALIDATION_ERROR | Invalid request (Pydantic rejection) |
| 404 | NOT_FOUND | Farm, plan, or crop not found |
| 409 | PLAN_LOCKED | Cannot modify a confirmed plan |
| 422 | SOLVER_INFEASIBLE | Constraints contradictory |
| 422 | SOLVER_TIMEOUT | No solution found within timeout |
| 429 | RATE_LIMITED | Too many solver requests |
| 503 | SOLVER_BUSY | Max concurrent solver jobs reached |

### Concurrency Limits

- Single RQ worker process (CPU-bound solver doesn't benefit from parallelism on 2 vCPU)
- Max 1 concurrent solver job. Additional requests queue with a depth limit of 5.
- Solver timeout: 10s default, configurable per request up to 30s.
- If queue is full, return 503 SOLVER_BUSY immediately.

### Authentication

Phase 1: Simple API key header (`X-API-Key`). One key per farm. Sufficient for single-operator deployment.

Phase 2 (future): JWT tokens with farm-scoped claims, user roles (owner, manager, worker).

### CORS

FastAPI configured with CORS middleware allowing the frontend origin. In Docker deployment, both are served from the same domain via nginx (no CORS needed in production). CORS is for local development only.

### Testing Strategy

| Layer | Tool | What to test |
|-------|------|-------------|
| Solver logic | pytest | Constraint satisfaction, optimality for small instances, edge cases (empty farm, single crop, overcommitted) |
| API endpoints | pytest + httpx | Request validation, response shapes, error codes, status transitions |
| Services | pytest | Nursery scheduling, cost calculations, forecast models |
| Integration | pytest | Full flow: create farm → generate plan → confirm → advance week → disrupt → replan |
| Solver performance | manual benchmark | Timing for typical farm sizes (4x12, 6x20, 10x30) with varying crop counts |

### Database Initialization

- Alembic for schema migrations
- Seed script for `crops` table (runs on first deploy, idempotent via `INSERT ... ON CONFLICT DO NOTHING`)
- No manual SQL — everything through Alembic + seed scripts

### Frontend Offline Fallback

The current client-side `planGenerator.ts` remains bundled as a fallback. When the backend is unreachable, the frontend detects the failure and falls back to local plan generation with a visual indicator ("Offline mode — using local optimizer"). This preserves the demo/prototype experience.

## 10. Deployment

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
