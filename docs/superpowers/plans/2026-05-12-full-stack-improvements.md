# Full-Stack Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the React frontend to the FastAPI backend, add analytics and history tracking, polish the UX, and deploy via Docker Compose.

**Architecture:** Backend-first approach — new SQLAlchemy model (PlanSnapshot), 6 new API endpoints, analytics service. Frontend adds React Query for server state, 3 new pages (Analytics, Crop Comparison, Plan History), and UX improvements. Docker Compose adds a frontend container with nginx proxy.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic V2, OR-Tools CP-SAT (backend) / React 19, TypeScript, TanStack React Query, Recharts, react-hot-toast (frontend) / Docker Compose, nginx (deployment)

---

## File Structure

### Backend — New Files
- `app/models/snapshot.py` — PlanSnapshot SQLAlchemy model
- `app/services/analytics.py` — Analytics computation service
- `app/schemas/analytics.py` — Pydantic response models for analytics/timeline/history/compare
- `alembic/versions/002_plan_snapshots.py` — Migration for plan_snapshots table
- `tests/test_analytics.py` — Tests for analytics service
- `tests/test_snapshots.py` — Tests for snapshot creation and new endpoints

### Backend — Modified Files
- `app/api/plans.py` — Add 5 new endpoints (analytics, timeline, history, compare, export), snapshot triggers on confirm/replan/advance-week
- `app/api/farms.py` — Add `GET /farms/{id}/plans` endpoint
- `app/models/__init__.py` — Add PlanSnapshot import

### Frontend — New Files
- `src/pages/AnalyticsPage.tsx` — Tabbed analytics view (revenue/cost, timeline, profitability)
- `src/pages/CropComparisonPage.tsx` — Side-by-side crop comparison with radar chart
- `src/pages/PlanHistoryPage.tsx` — Vertical timeline of plan snapshots

### Frontend — Modified Files
- `src/lib/api.ts` — Add fetchFarm, saveFarm, updateFarm, fetchAnalytics, fetchTimeline, fetchHistory, fetchCropComparison, exportPlan, fetchFarmPlans
- `src/App.tsx` — Add React Query provider, new page routes, localStorage persistence
- `src/types/planning.ts` — Add AnalyticsData, TimelineData, HistoryData, CropComparisonData types
- `package.json` — Add @tanstack/react-query, recharts, react-hot-toast

### Deployment — Modified Files
- `docker-compose.yml` — Add frontend service
- `growplan-web/nginx.conf` — New nginx config for production build
- `growplan-web/vite.config.ts` — Add dev proxy to backend

---

## Chunk 1: Backend Data Layer — PlanSnapshot Model & Migration

### Task 1: Create PlanSnapshot Model

**Files:**
- Create: `growplan-api/app/models/snapshot.py`
- Test: `growplan-api/tests/test_snapshots.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_snapshots.py
"""Tests for PlanSnapshot model and creation logic."""

import pytest
from app.models.snapshot import PlanSnapshot


def test_snapshot_model_fields():
    """PlanSnapshot should have all required fields."""
    s = PlanSnapshot(
        plan_id=1,
        snapshot_type="confirmed",
        grid_data=[{"cell_index": 0, "crop_id": "lettuce"}],
        allocations=[{"crop_id": "lettuce", "grids_allocated": 2}],
        revenue={"total_per_week": 4.0},
    )
    assert s.plan_id == 1
    assert s.snapshot_type == "confirmed"
    assert s.grid_data[0]["crop_id"] == "lettuce"


def test_create_snapshot_on_confirm(client, db_session):
    """Confirming a plan should create a snapshot with type='confirmed'."""
    from app.models.farm import Farm
    from app.models.plan import Plan, GridCell, Allocation

    farm = Farm(
        name="S", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="completed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    db_session.add(GridCell(
        plan_id=plan.id, cell_index=0, crop_id="lettuce",
        status="planned", week_started=1, week_harvest_expected=6,
    ))
    db_session.add(Allocation(
        plan_id=plan.id, crop_id="lettuce", grids_allocated=1,
        sustainable_kg_per_week=0.24, revenue_per_week=0.96,
    ))
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/confirm")
    assert resp.status_code == 200

    snapshots = db_session.query(PlanSnapshot).filter(
        PlanSnapshot.plan_id == plan.id
    ).all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_type == "confirmed"
    assert len(snapshots[0].grid_data) == 1
    assert snapshots[0].grid_data[0]["crop_id"] == "lettuce"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd growplan-api && python -m pytest tests/test_snapshots.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.snapshot'`

- [ ] **Step 3: Write minimal implementation**

```python
# app/models/snapshot.py
"""PlanSnapshot model for plan history tracking."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func

from app.database import Base


class PlanSnapshot(Base):
    __tablename__ = "plan_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(
        Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_type = Column(String(20), nullable=False)
    grid_data = Column(JSON, nullable=False)
    allocations = Column(JSON, nullable=False)
    revenue = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_snapshots_plan_id", "plan_id"),)
```

- [ ] **Step 4: Create the migration**

```python
# alembic/versions/002_plan_snapshots.py
"""Add plan_snapshots table.

Revision ID: 002
Revises: 001
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plan_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_type", sa.String(length=20), nullable=False),
        sa.Column("grid_data", sa.JSON(), nullable=False),
        sa.Column("allocations", sa.JSON(), nullable=False),
        sa.Column("revenue", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_snapshots_plan_id", "plan_snapshots", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_snapshots_plan_id", table_name="plan_snapshots")
    op.drop_table("plan_snapshots")
```

- [ ] **Step 5: Add snapshot creation helper in plans.py**

Add this import at top of `app/api/plans.py`:
```python
from app.models.snapshot import PlanSnapshot
```

Add this helper function after the `_is_test_mode` function:
```python
def _create_snapshot(plan: Plan, snapshot_type: str, db: Session) -> None:
    """Serialize current plan state into a PlanSnapshot."""
    cells = db.query(GridCell).filter(GridCell.plan_id == plan.id).all()
    allocations = (
        db.query(Allocation).filter(Allocation.plan_id == plan.id).all()
    )
    snapshot = PlanSnapshot(
        plan_id=plan.id,
        snapshot_type=snapshot_type,
        grid_data=[
            {
                "cell_index": c.cell_index,
                "crop_id": c.crop_id,
                "status": c.status,
                "week_started": c.week_started,
                "week_harvest_expected": c.week_harvest_expected,
            }
            for c in cells
        ],
        allocations=[
            {
                "crop_id": a.crop_id,
                "grids_allocated": a.grids_allocated,
                "sustainable_kg_per_week": a.sustainable_kg_per_week,
                "revenue_per_week": a.revenue_per_week,
            }
            for a in allocations
        ],
        revenue={
            "total_per_week": plan.revenue_total or 0,
            "revenue_gap": plan.revenue_gap or 0,
        },
    )
    db.add(snapshot)
```

Then insert snapshot calls in the three existing endpoints. The `_create_snapshot` helper calls `db.add()` — the snapshot is committed in the same transaction as the existing `db.commit()` in each endpoint:

**In `confirm_plan`** — insert before `plan.status = "confirmed"`:
```python
    _create_snapshot(plan, "confirmed", db)
    plan.status = "confirmed"
    db.commit()
```

**In `advance_week`** — insert before `plan.current_week += 1`:
```python
    _create_snapshot(plan, "week-advanced", db)
    plan.current_week += 1
    db.commit()
```

**In `replan_endpoint`** — insert before the `do_replan` call:
```python
    _create_snapshot(plan, "replanned", db)
    from app.services.replanner import replan as do_replan
    result = do_replan(plan_id, disruption, db)
```

- [ ] **Step 5b: Add PlanSnapshot import to models/__init__.py**

Add to `growplan-api/app/models/__init__.py`:
```python
from app.models.snapshot import PlanSnapshot
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd growplan-api && python -m pytest tests/test_snapshots.py tests/test_api_errors.py tests/test_api_plans.py -v`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add growplan-api/app/models/snapshot.py \
        growplan-api/alembic/versions/002_plan_snapshots.py \
        growplan-api/app/api/plans.py \
        growplan-api/tests/test_snapshots.py
git commit -m "feat: add PlanSnapshot model, migration, and snapshot triggers"
```

---

### Task 2: Add Snapshot Tests for Replan and Advance-Week

**Files:**
- Modify: `growplan-api/tests/test_snapshots.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_snapshots.py`:

```python
def test_create_snapshot_on_advance_week(client, db_session):
    """Advancing a week should create a snapshot with type='week-advanced'."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="AW", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="confirmed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/advance-week")
    assert resp.status_code == 200

    snapshots = db_session.query(PlanSnapshot).filter(
        PlanSnapshot.plan_id == plan.id
    ).all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_type == "week-advanced"
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd growplan-api && python -m pytest tests/test_snapshots.py -v`
Expected: ALL PASS (snapshot helper already added in Task 1)

- [ ] **Step 3: Commit**

```bash
git add growplan-api/tests/test_snapshots.py
git commit -m "test: add snapshot tests for advance-week trigger"
```

---

## Chunk 2: Backend Analytics Service

### Task 3: Create Analytics Service with Tests

**Files:**
- Create: `growplan-api/app/services/analytics.py`
- Create: `growplan-api/tests/test_analytics.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_analytics.py
"""Tests for analytics computation service."""

import pytest
from app.services.analytics import compute_analytics, compute_crop_comparison


def _cells(*crop_ids):
    """Build a flat cell list for testing."""
    result = []
    for i, cid in enumerate(crop_ids):
        result.append({
            "cell_index": i,
            "crop_id": cid,
            "status": "planned",
            "week_started": 1,
            "week_harvest_expected": 6,
        })
    return result


def _allocations(crops_info):
    """Build allocation list. crops_info: [(crop_id, grids, sustainable_kg, rev_per_week)]"""
    return [
        {
            "crop_id": cid,
            "grids_allocated": grids,
            "sustainable_kg_per_week": skg,
            "revenue_per_week": rev,
        }
        for cid, grids, skg, rev in crops_info
    ]


def _crops(*defs):
    """Build crop param list. defs: (crop_id, weeks, yield, price, seedlings, germ_rate)"""
    return [
        {
            "id": cid,
            "weeks_on_panel": w,
            "yield_per_grid": y,
            "price_per_kg": p,
            "seedlings_per_grid": sg,
            "germination_rate": gr,
            "cost_per_seedling": 0.02,
            "nutrient_cost_per_grid_week": 0.10,
        }
        for cid, w, y, p, sg, gr in defs
    ]


def test_analytics_empty_plan():
    """Empty plan should return zeroed arrays."""
    result = compute_analytics(
        cells=[], allocations=[], crops=[], horizon_weeks=8, current_week=1,
    )
    assert len(result["revenueByWeek"]) == 8
    assert len(result["costByWeek"]) == 8
    assert len(result["profitByWeek"]) == 8
    assert result["cumulativeRevenue"] == 0


def test_analytics_single_crop():
    """Single crop should have correct weekly revenue."""
    crops = _crops(("lettuce", 5, 1.2, 4.0, 80, 0.95))
    allocs = _allocations([("lettuce", 2, 0.48, 1.92)])
    result = compute_analytics(
        cells=_cells("lettuce", "lettuce"),
        allocations=allocs,
        crops=crops,
        horizon_weeks=10,
        current_week=1,
    )
    assert result["cumulativeRevenue"] > 0
    # Revenue should appear in weeks where crop is actively producing
    active_weeks = [w for w in result["revenueByWeek"] if w["total"] > 0]
    assert len(active_weeks) > 0


def test_analytics_horizon_length():
    """Output arrays should have exactly horizon_weeks entries."""
    result = compute_analytics(
        cells=[], allocations=[], crops=[], horizon_weeks=12, current_week=1,
    )
    assert len(result["revenueByWeek"]) == 12
    assert len(result["costByWeek"]) == 12
    assert len(result["profitByWeek"]) == 12


def test_crop_comparison_basic():
    """Crop comparison should compute per-crop metrics and radar scores."""
    crops = _crops(
        ("lettuce", 5, 1.2, 4.0, 80, 0.95),
        ("basil", 4, 0.5, 8.0, 60, 0.90),
    )
    allocs = _allocations([
        ("lettuce", 2, 0.48, 1.92),
        ("basil", 1, 0.125, 1.0),
    ])
    result = compute_crop_comparison(allocations=allocs, crops=crops)
    assert len(result["crops"]) == 2
    for c in result["crops"]:
        assert "metrics" in c
        assert "radarScores" in c
        assert set(c["radarScores"].keys()) == {
            "revenue", "speed", "yield", "price", "ease",
        }
    # Recommended = highest revenuePerGridWeek
    assert result["recommended"] in ("lettuce", "basil")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd growplan-api && python -m pytest tests/test_analytics.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.analytics'`

- [ ] **Step 3: Write the implementation**

```python
# app/services/analytics.py
"""Analytics computation service.

Pure functions — no DB access. Computes weekly revenue, cost, profit
arrays and crop comparison metrics from plan data.
"""

from __future__ import annotations

from typing import Any


def compute_analytics(
    cells: list[dict],
    allocations: list[dict],
    crops: list[dict],
    horizon_weeks: int,
    current_week: int,
) -> dict[str, Any]:
    """Compute weekly revenue, cost, and profit arrays.

    Returns revenueByWeek, costByWeek, profitByWeek arrays
    with exactly horizon_weeks entries each.
    """
    crops_by_id: dict[str, dict] = {c["id"]: c for c in crops}
    active_crop_ids = {a["crop_id"] for a in allocations if a["grids_allocated"] > 0}

    # Build crop color lookup from cells
    crop_colors: dict[str, str] = {}
    for c in cells:
        if c.get("crop_id") and c["crop_id"] not in crop_colors:
            crop_colors[c["crop_id"]] = ""

    # Revenue by week: crops produce from week_started+weeks_on_panel onward
    revenue_by_week: list[dict[str, float]] = []
    for w in range(1, horizon_weeks + 1):
        entry: dict[str, float] = {"week": w}
        total = 0.0
        for alloc in allocations:
            cid = alloc["crop_id"]
            if alloc["grids_allocated"] == 0:
                continue
            # Sustainable weekly revenue applies every week after first harvest
            crop = crops_by_id.get(cid)
            if crop and w >= (crop.get("nursery_lead_weeks", 2) + crop.get("weeks_on_panel", 5)):
                entry[cid] = round(alloc["revenue_per_week"], 2)
                total += alloc["revenue_per_week"]
            else:
                entry[cid] = 0.0
        entry["total"] = round(total, 2)
        revenue_by_week.append(entry)

    # Cost by week: use sustainable weekly cost model
    cost_by_week: list[dict[str, float]] = []
    for w in range(1, horizon_weeks + 1):
        labor = 0.0
        nutrients = 0.0
        energy = 0.0
        seeds = 0.0
        for alloc in allocations:
            cid = alloc["crop_id"]
            crop = crops_by_id.get(cid)
            if not crop or alloc["grids_allocated"] == 0:
                continue
            grids = alloc["grids_allocated"]
            nutrients += grids * crop.get("nutrient_cost_per_grid_week", 0.10)
            seeds += (
                grids * crop.get("seedlings_per_grid", 20)
                * crop.get("cost_per_seedling", 0.02)
                / crop.get("weeks_on_panel", 6)
            )
        total_grids = sum(a["grids_allocated"] for a in allocations)
        energy = 20.0 + total_grids * 0.50 + 30 * 0.10
        labor = total_grids * 0.20  # Simplified: ~1.2 min/grid * $15/hr
        total = labor + nutrients + energy + seeds
        cost_by_week.append({
            "week": w,
            "labor": round(labor, 2),
            "nutrients": round(nutrients, 2),
            "energy": round(energy, 2),
            "seeds": round(seeds, 2),
            "total": round(total, 2),
        })

    # Profit by week
    cum_rev = 0.0
    cum_cost = 0.0
    profit_by_week: list[dict[str, float]] = []
    for i in range(horizon_weeks):
        rev = revenue_by_week[i]["total"]
        cost = cost_by_week[i]["total"]
        profit = rev - cost
        margin = round((profit / rev * 100), 1) if rev > 0 else 0
        cum_rev += rev
        cum_cost += cost
        profit_by_week.append({
            "week": i + 1,
            "revenue": round(rev, 2),
            "cost": round(cost, 2),
            "profit": round(profit, 2),
            "margin": margin,
        })

    return {
        "revenueByWeek": revenue_by_week,
        "costByWeek": cost_by_week,
        "profitByWeek": profit_by_week,
        "cumulativeRevenue": round(cum_rev, 2),
        "cumulativeCost": round(cum_cost, 2),
        "cumulativeProfit": round(cum_rev - cum_cost, 2),
    }


def compute_crop_comparison(
    allocations: list[dict],
    crops: list[dict],
) -> dict[str, Any]:
    """Compute per-crop metrics and radar chart scores.

    Returns crops list with metrics and radarScores, plus recommended crop.
    """
    crops_by_id: dict[str, dict] = {c["id"]: c for c in crops}
    alloc_by_id: dict[str, dict] = {a["crop_id"]: a for a in allocations}

    crop_results: list[dict[str, Any]] = []
    rev_per_gw: dict[str, float] = {}

    for crop in crops:
        cid = crop["id"]
        alloc = alloc_by_id.get(cid, {"grids_allocated": 0, "sustainable_kg_per_week": 0, "revenue_per_week": 0})
        grids = alloc["grids_allocated"]
        wop = crop["weeks_on_panel"]
        ypg = crop["yield_per_grid"]
        ppk = crop["price_per_kg"]

        revenue_per_gw = (ypg * ppk / wop) if wop > 0 else 0
        rev_per_gw[cid] = revenue_per_gw

        seed_cost = grids * crop.get("seedlings_per_grid", 20) * crop.get("cost_per_seedling", 0.02) if grids > 0 else 0
        cost_per_gw = (
            crop.get("nutrient_cost_per_grid_week", 0.10)
            + seed_cost / max(wop, 1)
        )

        crop_results.append({
            "cropId": cid,
            "cropName": crop.get("name", cid),
            "color": crop.get("accent", "#666"),
            "metrics": {
                "revenuePerGridWeek": round(revenue_per_gw, 2),
                "costPerGridWeek": round(cost_per_gw, 2),
                "netMarginPerGridWeek": round(revenue_per_gw - cost_per_gw, 2),
                "marginPct": round(((revenue_per_gw - cost_per_gw) / revenue_per_gw * 100) if revenue_per_gw > 0 else 0, 1),
                "cycleWeeks": wop,
                "nurseryTraysPerCycle": 1,
                "seedCostPerCycle": round(seed_cost, 2),
            },
            "radarScores": {"revenue": 0, "speed": 0, "yield": 0, "price": 0, "ease": 0},
        })

    # Normalize radar scores 0-100
    if crop_results:
        max_rev = max(rev_per_gw.values()) or 1
        max_yield = max(c["yield_per_grid"] for c in crops) or 1
        max_price = max(c["price_per_kg"] for c in crops) or 1
        weeks = [c["weeks_on_panel"] for c in crops]
        min_w, max_w = min(weeks), max(weeks)
        w_range = (max_w - min_w) or 1

        for i, crop in enumerate(crops):
            cid = crop["id"]
            crop_results[i]["radarScores"] = {
                "revenue": round(rev_per_gw[cid] / max_rev * 100),
                "speed": round((max_w - crop["weeks_on_panel"]) / w_range * 100),
                "yield": round(crop["yield_per_grid"] / max_yield * 100),
                "price": round(crop["price_per_kg"] / max_price * 100),
                "ease": round(crop["germination_rate"] * 100),
            }

    recommended = max(rev_per_gw, key=rev_per_gw.get) if rev_per_gw else ""
    return {"crops": crop_results, "recommended": recommended}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd growplan-api && python -m pytest tests/test_analytics.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add growplan-api/app/services/analytics.py \
        growplan-api/tests/test_analytics.py
git commit -m "feat: add analytics service with revenue/cost/profit and crop comparison"
```

---

## Chunk 3: Backend New API Endpoints

### Task 4: Add Analytics Schemas

**Files:**
- Create: `growplan-api/app/schemas/analytics.py`

- [ ] **Step 1: Write the Pydantic schemas**

```python
# app/schemas/analytics.py
"""Pydantic schemas for analytics, timeline, history, and comparison endpoints."""

from pydantic import BaseModel, ConfigDict, Field


# --- Analytics ---

class WeeklyCostEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    week: int
    labor: float = 0
    nutrients: float = 0
    energy: float = 0
    seeds: float = 0
    total: float = 0


class WeeklyProfitEntry(BaseModel):
    week: int
    revenue: float = 0
    cost: float = 0
    profit: float = 0
    margin: float = 0


class AnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    revenue_by_week: list[dict] = Field(alias="revenueByWeek")
    cost_by_week: list[dict] = Field(alias="costByWeek")
    profit_by_week: list[dict] = Field(alias="profitByWeek")
    cumulative_revenue: float = Field(alias="cumulativeRevenue")
    cumulative_cost: float = Field(alias="cumulativeCost")
    cumulative_profit: float = Field(alias="cumulativeProfit")


# --- Timeline ---

class TimelineInterval(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    cell_index: int = Field(alias="cellIndex")
    start_week: int = Field(alias="startWeek")
    end_week: int = Field(alias="endWeek")
    phase: str


class TimelineCrop(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crop_id: str = Field(alias="cropId")
    crop_name: str = Field(alias="cropName")
    color: str
    intervals: list[TimelineInterval]


class TimelineResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crops: list[TimelineCrop]
    current_week: int = Field(alias="currentWeek")
    horizon_weeks: int = Field(alias="horizonWeeks")


# --- History ---

class SnapshotSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: int
    snapshot_type: str = Field(alias="snapshotType")
    total_grids: int = Field(alias="totalGrids")
    crop_count: int = Field(alias="cropCount")
    revenue_per_week: float = Field(alias="revenuePerWeek")
    created_at: str = Field(alias="createdAt")


class HistoryResponse(BaseModel):
    snapshots: list[SnapshotSummary]
    total: int
    page: int
    limit: int


# --- Crop Comparison ---

class CropMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    revenue_per_grid_week: float = Field(alias="revenuePerGridWeek")
    cost_per_grid_week: float = Field(alias="costPerGridWeek")
    net_margin_per_grid_week: float = Field(alias="netMarginPerGridWeek")
    margin_pct: float = Field(alias="marginPct")
    cycle_weeks: int = Field(alias="cycleWeeks")
    nursery_trays_per_cycle: int = Field(alias="nurseryTraysPerCycle")
    seed_cost_per_cycle: float = Field(alias="seedCostPerCycle")


class RadarScores(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    revenue: int
    speed: int
    yield_: int = Field(alias="yield")
    price: int
    ease: int


class ComparisonCrop(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crop_id: str = Field(alias="cropId")
    crop_name: str = Field(alias="cropName")
    color: str
    metrics: CropMetrics
    radar_scores: RadarScores = Field(alias="radarScores")


class CompareResponse(BaseModel):
    crops: list[ComparisonCrop]
    recommended: str


# --- Farm Plans ---

class PlanSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: int
    status: str
    horizon_weeks: int = Field(alias="horizonWeeks")
    current_week: int = Field(1, alias="currentWeek")
    goal_priority: str = Field(alias="goalPriority")
    selected_crops: list[str] = Field(alias="selectedCrops")
    revenue_total: float | None = Field(None, alias="revenueTotal")
    created_at: str = Field(alias="createdAt")
```

- [ ] **Step 2: Commit**

```bash
git add growplan-api/app/schemas/analytics.py
git commit -m "feat: add Pydantic schemas for analytics, timeline, history, comparison endpoints"
```

---

### Task 5: Add 6 New API Endpoints

**Files:**
- Modify: `growplan-api/app/api/plans.py` (5 endpoints: analytics, timeline, history, compare, export)
- Modify: `growplan-api/app/api/farms.py` (1 endpoint: farm plans)

- [ ] **Step 1: Add the new endpoints**

Add these imports to `app/api/plans.py`:
```python
from app.models.snapshot import PlanSnapshot
from app.schemas.analytics import (
    AnalyticsResponse,
    CompareResponse,
    HistoryResponse,
    PlanSummary,
    SnapshotSummary,
    TimelineResponse,
)
from app.services.analytics import compute_analytics, compute_crop_comparison
```

Add these endpoints after the existing `get_nursery` endpoint:

```python
@router.get("/{plan_id}/analytics", response_model=AnalyticsResponse)
def get_analytics(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
    cells = db.query(GridCell).filter(GridCell.plan_id == plan_id).all()
    allocations = db.query(Allocation).filter(Allocation.plan_id == plan_id).all()
    from app.models.crop import Crop as CropModel
    crops = db.query(CropModel).filter(CropModel.id.in_(plan.selected_crops)).all()

    cell_dicts = [
        {"cell_index": c.cell_index, "crop_id": c.crop_id, "status": c.status,
         "week_started": c.week_started, "week_harvest_expected": c.week_harvest_expected}
        for c in cells
    ]
    alloc_dicts = [
        {"crop_id": a.crop_id, "grids_allocated": a.grids_allocated,
         "sustainable_kg_per_week": a.sustainable_kg_per_week, "revenue_per_week": a.revenue_per_week}
        for a in allocations
    ]
    crop_dicts = [
        {"id": c.id, "name": c.name, "accent": c.accent, "weeks_on_panel": c.weeks_on_panel,
         "nursery_lead_weeks": c.nursery_lead_weeks, "yield_per_grid": c.yield_per_grid,
         "price_per_kg": c.price_per_kg, "seedlings_per_grid": c.seedlings_per_grid,
         "germination_rate": c.germination_rate, "cost_per_seedling": c.cost_per_seedling,
         "nutrient_cost_per_grid_week": c.nutrient_cost_per_grid_week}
        for c in crops
    ]

    return compute_analytics(
        cells=cell_dicts, allocations=alloc_dicts, crops=crop_dicts,
        horizon_weeks=plan.horizon_weeks, current_week=plan.current_week,
    )


@router.get("/{plan_id}/timeline", response_model=TimelineResponse)
def get_timeline(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    cells = db.query(GridCell).filter(GridCell.plan_id == plan_id).all()
    from app.models.crop import Crop as CropModel
    crops = db.query(CropModel).filter(CropModel.id.in_(plan.selected_crops)).all()
    crop_map = {c.id: c for c in crops}

    from collections import defaultdict
    crop_intervals: dict[str, list] = defaultdict(list)
    for c in cells:
        if c.crop_id and c.week_started is not None and c.week_harvest_expected is not None:
            wop = c.week_harvest_expected - c.week_started
            crop_intervals[c.crop_id].append({
                "cellIndex": c.cell_index,
                "startWeek": c.week_started,
                "endWeek": c.week_harvest_expected - 1,
                "phase": "growing",
            })
            crop_intervals[c.crop_id].append({
                "cellIndex": c.cell_index,
                "startWeek": c.week_harvest_expected - 1,
                "endWeek": c.week_harvest_expected,
                "phase": "harvest",
            })

    timeline_crops = []
    for cid in plan.selected_crops:
        crop_obj = crop_map.get(cid)
        if crop_obj:
            timeline_crops.append({
                "cropId": cid,
                "cropName": crop_obj.name,
                "color": crop_obj.accent,
                "intervals": crop_intervals.get(cid, []),
            })

    return TimelineResponse(
        crops=timeline_crops,
        current_week=plan.current_week,
        horizon_weeks=plan.horizon_weeks,
    )


@router.get("/{plan_id}/history", response_model=HistoryResponse)
def get_history(
    plan_id: int,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    query = db.query(PlanSnapshot).filter(PlanSnapshot.plan_id == plan_id)
    total = query.count()
    snapshots = (
        query.order_by(PlanSnapshot.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return HistoryResponse(
        snapshots=[
            SnapshotSummary(
                id=s.id,
                snapshot_type=s.snapshot_type,
                total_grids=len(s.grid_data),
                crop_count=len(set(
                    c["crop_id"] for c in s.grid_data if c.get("crop_id")
                )),
                revenue_per_week=s.revenue.get("total_per_week", 0),
                created_at=s.created_at.isoformat() if s.created_at else "",
            )
            for s in snapshots
        ],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{plan_id}/compare", response_model=CompareResponse)
def get_crop_comparison(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    allocations = db.query(Allocation).filter(Allocation.plan_id == plan_id).all()
    from app.models.crop import Crop as CropModel
    crops = db.query(CropModel).filter(CropModel.id.in_(plan.selected_crops)).all()

    alloc_dicts = [
        {"crop_id": a.crop_id, "grids_allocated": a.grids_allocated,
         "sustainable_kg_per_week": a.sustainable_kg_per_week, "revenue_per_week": a.revenue_per_week}
        for a in allocations
    ]
    crop_dicts = [
        {"id": c.id, "name": c.name, "accent": c.accent, "weeks_on_panel": c.weeks_on_panel,
         "yield_per_grid": c.yield_per_grid, "price_per_kg": c.price_per_kg,
         "seedlings_per_grid": c.seedlings_per_grid, "germination_rate": c.germination_rate,
         "cost_per_seedling": c.cost_per_seedling, "nutrient_cost_per_grid_week": c.nutrient_cost_per_grid_week}
        for c in crops
    ]
    return compute_crop_comparison(allocations=alloc_dicts, crops=crop_dicts)


**Note:** The `GET /farms/{farm_id}/plans` endpoint belongs on the farms router, not the plans router, to avoid route conflicts with `/{plan_id}` patterns.

Add to `growplan-api/app/api/farms.py`:

```python
@router.get("/{farm_id}/plans")
def get_farm_plans(farm_id: int, db: Session = Depends(get_db)):
    farm = db.query(Farm).filter(Farm.id == farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    plans = db.query(Plan).filter(Plan.farm_id == farm_id).order_by(Plan.created_at.desc()).all()
    return {
        "plans": [
            {
                "id": p.id,
                "status": p.status,
                "horizonWeeks": p.horizon_weeks,
                "currentWeek": p.current_week,
                "goalPriority": p.goal_priority,
                "selectedCrops": p.selected_crops or [],
                "revenueTotal": p.revenue_total,
                "createdAt": p.created_at.isoformat() if p.created_at else "",
            }
            for p in plans
        ]
    }
```

Add required imports to `farms.py` (if not already present):
```python
from app.models.plan import Plan
```


@router.get("/{plan_id}/export")
def export_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    cells = db.query(GridCell).filter(GridCell.plan_id == plan_id).all()
    from fastapi.responses import Response
    lines = ["Grid Index,Crop,Status,Week Started,Week Harvest Expected"]
    for c in sorted(cells, key=lambda x: x.cell_index):
        lines.append(
            f"{c.cell_index},{c.crop_id or ''},{c.status},"
            f"{c.week_started or ''},{c.week_harvest_expected or ''}"
        )
    csv_content = "\n".join(lines)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f"attachment; filename=plan-{plan_id}-week-{plan.current_week}.csv"
            )
        },
    )
```

**Important:** Move the `/farms/{farm_id}/plans` route to `app/api/farms.py` instead to avoid route conflicts with `/{plan_id}` patterns. Add it there after the existing farm routes.

- [ ] **Step 2: Write endpoint tests**

Append to `tests/test_snapshots.py`:

```python
def test_get_analytics_not_found(client):
    resp = client.get("/plans/99999/analytics")
    assert resp.status_code == 404


def test_get_timeline_not_found(client):
    resp = client.get("/plans/99999/timeline")
    assert resp.status_code == 404


def test_get_history_not_found(client):
    resp = client.get("/plans/99999/history")
    assert resp.status_code == 404


def test_get_compare_not_found(client):
    resp = client.get("/plans/99999/compare")
    assert resp.status_code == 404


def test_export_not_found(client):
    resp = client.get("/plans/99999/export")
    assert resp.status_code == 404


def test_get_history_empty(client, db_session):
    """History for a plan with no snapshots returns empty list."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="H", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()
    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="completed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.get(f"/plans/{plan.id}/history")
    assert resp.status_code == 200
    data = resp.json()
    assert data["snapshots"] == []
    assert data["total"] == 0


def test_farm_plans_not_found(client):
    """GET /farms/99999/plans returns 404 for nonexistent farm."""
    resp = client.get("/farms/99999/plans")
    assert resp.status_code == 404


def test_analytics_with_data(client, db_session):
    """GET /plans/{id}/analytics returns revenue/cost/profit arrays."""
    from app.models.farm import Farm
    from app.models.plan import Plan, GridCell, Allocation

    farm = Farm(
        name="A", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="confirmed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    db_session.add(GridCell(
        plan_id=plan.id, cell_index=0, crop_id="lettuce",
        status="planned", week_started=1, week_harvest_expected=6,
    ))
    db_session.add(Allocation(
        plan_id=plan.id, crop_id="lettuce", grids_allocated=1,
        sustainable_kg_per_week=0.24, revenue_per_week=0.96,
    ))
    db_session.commit()

    resp = client.get(f"/plans/{plan.id}/analytics")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["revenueByWeek"]) == 10
    assert len(data["costByWeek"]) == 10
    assert len(data["profitByWeek"]) == 10
    assert data["cumulativeRevenue"] >= 0


def test_timeline_with_data(client, db_session):
    """GET /plans/{id}/timeline returns crop intervals."""
    from app.models.farm import Farm
    from app.models.plan import Plan, GridCell

    farm = Farm(
        name="T", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="confirmed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    db_session.add(GridCell(
        plan_id=plan.id, cell_index=0, crop_id="lettuce",
        status="planned", week_started=1, week_harvest_expected=6,
    ))
    db_session.commit()

    resp = client.get(f"/plans/{plan.id}/timeline")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["crops"]) >= 1
    assert data["currentWeek"] == 1
    assert data["horizonWeeks"] == 10
```

- [ ] **Step 3: Run all tests**

Run: `cd growplan-api && python -m pytest tests/ -v --tb=short`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add growplan-api/app/api/plans.py \
        growplan-api/app/api/farms.py \
        growplan-api/tests/test_snapshots.py
git commit -m "feat: add analytics, timeline, history, comparison, export endpoints"
```

---

## Chunk 4: Frontend API Client & React Query Setup

### Task 6: Install Frontend Dependencies

**Files:**
- Modify: `growplan-web/package.json`

- [ ] **Step 1: Install packages**

Run: `cd growplan-web && npm install @tanstack/react-query recharts react-hot-toast`

- [ ] **Step 2: Commit**

```bash
git add growplan-web/package.json growplan-web/package-lock.json
git commit -m "chore: add react-query, recharts, react-hot-toast dependencies"
```

---

### Task 7: Add TypeScript Types for Analytics

**Files:**
- Modify: `growplan-web/src/types/planning.ts`

- [ ] **Step 1: Add new types**

Append to `src/types/planning.ts`:

```typescript
// --- Analytics ---

export type WeeklyRevenueEntry = {
  week: number
  total: number
  [cropId: string]: number
}

export type WeeklyCostEntry = {
  week: number
  labor: number
  nutrients: number
  energy: number
  seeds: number
  total: number
}

export type WeeklyProfitEntry = {
  week: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

export type AnalyticsData = {
  revenueByWeek: WeeklyRevenueEntry[]
  costByWeek: WeeklyCostEntry[]
  profitByWeek: WeeklyProfitEntry[]
  cumulativeRevenue: number
  cumulativeCost: number
  cumulativeProfit: number
}

// --- Timeline ---

export type TimelineInterval = {
  cellIndex: number
  startWeek: number
  endWeek: number
  phase: 'growing' | 'harvest'
}

export type TimelineCrop = {
  cropId: string
  cropName: string
  color: string
  intervals: TimelineInterval[]
}

export type TimelineData = {
  crops: TimelineCrop[]
  currentWeek: number
  horizonWeeks: number
}

// --- History ---

export type SnapshotSummary = {
  id: number
  snapshotType: 'confirmed' | 'replanned' | 'week-advanced'
  totalGrids: number
  cropCount: number
  revenuePerWeek: number
  createdAt: string
}

export type HistoryData = {
  snapshots: SnapshotSummary[]
  total: number
  page: number
  limit: number
}

// --- Crop Comparison ---

export type CropMetrics = {
  revenuePerGridWeek: number
  costPerGridWeek: number
  netMarginPerGridWeek: number
  marginPct: number
  cycleWeeks: number
  nurseryTraysPerCycle: number
  seedCostPerCycle: number
}

export type RadarScores = {
  revenue: number
  speed: number
  yield: number
  price: number
  ease: number
}

export type ComparisonCrop = {
  cropId: string
  cropName: string
  color: string
  metrics: CropMetrics
  radarScores: RadarScores
}

export type CropComparisonData = {
  crops: ComparisonCrop[]
  recommended: string
}

// --- Plan Summary ---

export type PlanSummary = {
  id: number
  status: string
  horizonWeeks: number
  currentWeek: number
  goalPriority: string
  selectedCrops: string[]
  revenueTotal: number | null
  createdAt: string
}
```

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/types/planning.ts
git commit -m "feat: add TypeScript types for analytics, timeline, history, comparison"
```

---

### Task 8: Expand API Client

**Files:**
- Modify: `growplan-web/src/lib/api.ts`

- [ ] **Step 1: Add new fetch functions**

Append to `src/lib/api.ts` (before the final closing or after `checkBackendHealth`):

```typescript
import type {
  AnalyticsData,
  CropComparisonData,
  HistoryData,
  PlanSummary,
  SetupFarmData,
  TimelineData,
} from '../types/planning'

export async function fetchFarm(id: number): Promise<SetupFarmData> {
  const data = await apiFetch<Record<string, unknown>>(`/farms/${id}`)
  return {
    farmName: data.name as string,
    farmLocation: (data.location as string) || '',
    rows: data.rows as number,
    columns: data.columns as number,
    growingSystem: (data.growingSystem as string) || 'hydroponic',
    nurseryTrayCount: data.nurseryTrayCount as number,
    nurseryTrayCells: data.nurseryTrayCells as number,
    nurseryBufferPercent: data.nurseryBufferPercent as number,
  }
}

export async function saveFarm(data: SetupFarmData): Promise<{ id: number }> {
  return apiFetch<{ id: number }>('/farms', {
    method: 'POST',
    body: JSON.stringify({
      name: data.farmName,
      location: data.farmLocation,
      rows: data.rows,
      columns: data.columns,
      growingSystem: data.growingSystem,
      nurseryTrayCount: data.nurseryTrayCount,
      nurseryTrayCells: data.nurseryTrayCells,
      nurseryBufferPercent: data.nurseryBufferPercent,
    }),
  })
}

export async function updateFarm(id: number, data: Partial<SetupFarmData>): Promise<SetupFarmData> {
  const result = await apiFetch<Record<string, unknown>>(`/farms/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  return result as unknown as SetupFarmData
}

export async function fetchAnalytics(planId: number): Promise<AnalyticsData> {
  return apiFetch<AnalyticsData>(`/plans/${planId}/analytics`)
}

export async function fetchTimeline(planId: number): Promise<TimelineData> {
  return apiFetch<TimelineData>(`/plans/${planId}/timeline`)
}

export async function fetchHistory(planId: number, page = 1): Promise<HistoryData> {
  return apiFetch<HistoryData>(`/plans/${planId}/history?page=${page}`)
}

export async function fetchCropComparison(planId: number): Promise<CropComparisonData> {
  return apiFetch<CropComparisonData>(`/plans/${planId}/compare`)
}

export async function exportPlan(planId: number): Promise<Blob> {
  const resp = await fetch(`${API_BASE}/plans/${planId}/export`, {
    headers: { 'X-API-Key': API_KEY },
  })
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`)
  return resp.blob()
}

export async function fetchFarmPlans(farmId: number): Promise<{ plans: PlanSummary[] }> {
  return apiFetch<{ plans: PlanSummary[] }>(`/farms/${farmId}/plans`)
}
```

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/lib/api.ts
git commit -m "feat: add analytics, timeline, history, comparison, export API functions"
```

---

### Task 9: Add React Query Provider and localStorage Persistence

**Files:**
- Modify: `growplan-web/src/App.tsx`
- Modify: `growplan-web/src/main.tsx`

- [ ] **Step 1: Add QueryClientProvider in main.tsx**

Wrap `<App />` with `QueryClientProvider`:

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Add Toaster and localStorage helpers in App.tsx**

Add imports:
```tsx
import { Toaster } from 'react-hot-toast'
```

Add localStorage helpers before `function App()`:
```tsx
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore quota errors */ }
}
```

Update state initialization to use localStorage for `farmId`/`planId`:
```tsx
const [farmId, setFarmId] = useState<number | null>(loadFromStorage('gp_farmId', null))
const [planId, setPlanId] = useState<number | null>(loadFromStorage('gp_planId', null))
```

Add `<Toaster />` at the bottom of the App component's return, and add new page types for analytics/comparison/history.

- [ ] **Step 3: Verify build**

Run: `cd growplan-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add growplan-web/src/main.tsx growplan-web/src/App.tsx
git commit -m "feat: add React Query provider, localStorage persistence, Toaster"
```

---

## Chunk 5: Frontend Analytics Pages

### Task 10: Create AnalyticsPage

**Files:**
- Create: `growplan-web/src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: Create the analytics page with 3 tabs**

```tsx
// src/pages/AnalyticsPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, ResponsiveContainer,
} from 'recharts'
import { fetchAnalytics, fetchTimeline } from '../lib/api'
import { cropLibrary } from '../constants/crops'
import type { AnalyticsData, TimelineData } from '../types/planning'

type Tab = 'revenue-cost' | 'timeline' | 'profitability'

type Props = {
  planId: number | null
  onBack: () => void
}

export function AnalyticsPage({ planId, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('revenue-cost')

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', planId],
    queryFn: () => fetchAnalytics(planId!),
    enabled: !!planId,
  })

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['timeline', planId],
    queryFn: () => fetchTimeline(planId!),
    enabled: !!planId,
  })

  const loading = tab === 'timeline' ? timelineLoading : analyticsLoading

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Analytics</h2>
        <p style={{ color: '#888' }}>Generate a plan to see analytics</p>
        <button onClick={onBack}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 1rem' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Analytics</h2>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['revenue-cost', 'timeline', 'profitability'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1rem',
              background: tab === t ? '#1a1a2e' : '#f0f0f0',
              color: tab === t ? '#fff' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {t === 'revenue-cost' ? 'Revenue & Cost' : t === 'timeline' ? 'Crop Timeline' : 'Profitability'}
          </button>
        ))}
      </div>

      {loading && <p>Loading analytics...</p>}

      {!loading && tab === 'revenue-cost' && analytics && (
        <RevenueCostTab analytics={analytics} />
      )}
      {!loading && tab === 'timeline' && timeline && (
        <TimelineTab timeline={timeline} />
      )}
      {!loading && tab === 'profitability' && analytics && (
        <ProfitabilityTab analytics={analytics} />
      )}
    </div>
  )
}

function RevenueCostTab({ analytics }: { analytics: AnalyticsData }) {
  const cropColors = Object.fromEntries(cropLibrary.map(c => [c.id, c.accent]))
  const cropIds = Object.keys(analytics.revenueByWeek[0] || {}).filter(k => k !== 'week' && k !== 'total')

  return (
    <div>
      <h3>Revenue vs Cost</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={analytics.profitByWeek}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="revenue" stroke="#9edb66" strokeWidth={2} />
          <Line type="monotone" dataKey="cost" stroke="#e74c3c" strokeWidth={2} />
          <Line type="monotone" dataKey="profit" stroke="#3498db" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <h3 style={{ marginTop: '2rem' }}>Revenue by Crop</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={analytics.revenueByWeek}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          {cropIds.map(cid => (
            <Area
              key={cid}
              type="monotone"
              dataKey={cid}
              stackId="1"
              stroke={cropColors[cid] || '#888'}
              fill={cropColors[cid] || '#888'}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', fontSize: '0.9rem' }}>
        <div>Cumulative Revenue: <strong>${analytics.cumulativeRevenue.toFixed(2)}</strong></div>
        <div>Cumulative Cost: <strong>${analytics.cumulativeCost.toFixed(2)}</strong></div>
        <div>Cumulative Profit: <strong style={{ color: analytics.cumulativeProfit >= 0 ? '#27ae60' : '#e74c3c' }}>
          ${analytics.cumulativeProfit.toFixed(2)}
        </strong></div>
      </div>
    </div>
  )
}

function TimelineTab({ timeline }: { timeline: TimelineData }) {
  return (
    <div>
      <h3>Crop Timeline</h3>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Current week: {timeline.currentWeek} | Horizon: {timeline.horizonWeeks} weeks
      </p>
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg width={timeline.horizonWeeks * 40 + 60} height={timeline.crops.length * 60 + 40}>
          {/* Week headers */}
          {Array.from({ length: timeline.horizonWeeks }, (_, i) => (
            <text key={i} x={i * 40 + 60} y={15} fontSize={10} fill="#999" textAnchor="middle">
              W{i + 1}
            </text>
          ))}
          {/* Current week line */}
          <line
            x1={(timeline.currentWeek - 1) * 40 + 60}
            x2={(timeline.currentWeek - 1) * 40 + 60}
            y1={20}
            y2={timeline.crops.length * 60 + 30}
            stroke="#e74c3c"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          {/* Crop bars */}
          {timeline.crops.map((crop, ci) => (
            <g key={crop.cropId} transform={`translate(0, ${ci * 60 + 30})`}>
              <text x={0} y={15} fontSize={11} fill="#333">{crop.cropName}</text>
              {crop.intervals.map((interval, ii) => (
                <rect
                  key={ii}
                  x={(interval.startWeek - 1) * 40 + 60}
                  y={2}
                  width={(interval.endWeek - interval.startWeek + 1) * 40}
                  height={20}
                  fill={crop.color}
                  fillOpacity={interval.phase === 'harvest' ? 1 : 0.5}
                  rx={3}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function ProfitabilityTab({ analytics }: { analytics: AnalyticsData }) {
  return (
    <div>
      <h3>Weekly Profitability</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={analytics.profitByWeek}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="revenue" fill="#9edb66" name="Revenue" />
          <Bar dataKey="cost" fill="#e74c3c" name="Cost" />
          <Bar dataKey="profit" fill="#3498db" name="Profit" />
        </BarChart>
      </ResponsiveContainer>

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 0.5rem' }}>Margin Trend</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '8px',
              borderRadius: '4px',
              background: '#e0e0e0',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.max(0, analytics.profitByWeek[analytics.profitByWeek.length - 1]?.margin || 0)}%`,
                background: '#27ae60',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>
            {(analytics.profitByWeek[analytics.profitByWeek.length - 1]?.margin || 0).toFixed(1)}% final margin
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd growplan-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/pages/AnalyticsPage.tsx
git commit -m "feat: add AnalyticsPage with revenue/cost, timeline, profitability tabs"
```

---

### Task 11: Create CropComparisonPage

**Files:**
- Create: `growplan-web/src/pages/CropComparisonPage.tsx`

- [ ] **Step 1: Create the crop comparison page**

```tsx
// src/pages/CropComparisonPage.tsx
import { useQuery } from '@tanstack/react-query'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip,
} from 'recharts'
import { fetchCropComparison } from '../lib/api'
import type { ComparisonCrop } from '../types/planning'

type Props = {
  planId: number | null
  onBack: () => void
}

export function CropComparisonPage({ planId, onBack }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['comparison', planId],
    queryFn: () => fetchCropComparison(planId!),
    enabled: !!planId,
  })

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Crop Comparison</h2>
        <p style={{ color: '#888' }}>Generate a plan to compare crops</p>
        <button onClick={onBack}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 1rem' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Crop Comparison</h2>
      </div>

      {isLoading && <p>Loading comparison...</p>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {data.crops.map(crop => (
              <CropCard key={crop.cropId} crop={crop} isRecommended={crop.cropId === data.recommended} />
            ))}
          </div>

          {data.crops.length >= 2 && (
            <div style={{ marginTop: '2rem' }}>
              <h3>Radar Comparison</h3>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={buildRadarData(data.crops)}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" />
                  <PolarRadiusAxis domain={[0, 100]} />
                  {data.crops.map(crop => (
                    <Radar
                      key={crop.cropId}
                      name={crop.cropName}
                      dataKey={crop.cropId}
                      stroke={crop.color}
                      fill={crop.color}
                      fillOpacity={0.2}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CropCard({ crop, isRecommended }: { crop: ComparisonCrop; isRecommended: boolean }) {
  const m = crop.metrics
  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '10px',
      padding: '1.25rem',
      position: 'relative',
      background: '#fff',
    }}>
      {isRecommended && (
        <span style={{
          position: 'absolute', top: '-8px', right: '12px',
          background: '#27ae60', color: '#fff',
          padding: '2px 10px', borderRadius: '10px',
          fontSize: '0.75rem', fontWeight: 600,
        }}>
          Recommended
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: crop.color }} />
        <h4 style={{ margin: 0 }}>{crop.cropName}</h4>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>Revenue/grid-week</div><div style={{ textAlign: 'right', fontWeight: 600 }}>${m.revenuePerGridWeek.toFixed(2)}</div>
        <div>Cost/grid-week</div><div style={{ textAlign: 'right' }}>${m.costPerGridWeek.toFixed(2)}</div>
        <div>Net margin</div><div style={{ textAlign: 'right', color: m.netMarginPerGridWeek >= 0 ? '#27ae60' : '#e74c3c' }}>
          ${m.netMarginPerGridWeek.toFixed(2)}
        </div>
        <div>Cycle time</div><div style={{ textAlign: 'right' }}>{m.cycleWeeks} weeks</div>
        <div>Margin %</div><div style={{ textAlign: 'right' }}>{m.marginPct.toFixed(1)}%</div>
        <div>Seed cost/cycle</div><div style={{ textAlign: 'right' }}>${m.seedCostPerCycle.toFixed(2)}</div>
      </div>
    </div>
  )
}

function buildRadarData(crops: ComparisonCrop[]) {
  const dims = ['revenue', 'speed', 'yield', 'price', 'ease'] as const
  return dims.map(dim => {
    const entry: Record<string, string | number> = {
      dimension: dim.charAt(0).toUpperCase() + dim.slice(1),
    }
    for (const c of crops) {
      entry[c.cropId] = c.radarScores[dim]
    }
    return entry
  })
}
```

- [ ] **Step 2: Verify build and commit**

Run: `cd growplan-web && npx tsc --noEmit`

```bash
git add growplan-web/src/pages/CropComparisonPage.tsx
git commit -m "feat: add CropComparisonPage with radar chart and metric cards"
```

---

### Task 12: Create PlanHistoryPage

**Files:**
- Create: `growplan-web/src/pages/PlanHistoryPage.tsx`

- [ ] **Step 1: Create the history page**

```tsx
// src/pages/PlanHistoryPage.tsx
import { useQuery } from '@tanstack/react-query'
import { fetchHistory } from '../lib/api'
import type { SnapshotSummary } from '../types/planning'

type Props = {
  planId: number | null
  onBack: () => void
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  confirmed: { label: 'Plan Confirmed', color: '#27ae60', icon: '✓' },
  replanned: { label: 'Replanned', color: '#f39c12', icon: '↻' },
  'week-advanced': { label: 'Week Advanced', color: '#3498db', icon: '→' },
}

export function PlanHistoryPage({ planId, onBack }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', planId],
    queryFn: () => fetchHistory(planId!),
    enabled: !!planId,
  })

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Plan History</h2>
        <p style={{ color: '#888' }}>Generate a plan to see history</p>
        <button onClick={onBack}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 1rem' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Plan History</h2>
        {data && <span style={{ color: '#888', fontSize: '0.85rem' }}>{data.total} snapshots</span>}
      </div>

      {isLoading && <p>Loading history...</p>}

      {data && data.snapshots.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '2rem' }}>
          No snapshots yet. Confirm or advance a plan to create history entries.
        </p>
      )}

      {data && data.snapshots.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: '11px', top: '8px', bottom: '8px',
            width: '2px', background: '#e0e0e0',
          }} />
          {data.snapshots.map(snap => (
            <SnapshotEntry key={snap.id} snapshot={snap} />
          ))}
        </div>
      )}
    </div>
  )
}

function SnapshotEntry({ snapshot }: { snapshot: SnapshotSummary }) {
  const config = TYPE_CONFIG[snapshot.snapshotType] || { label: snapshot.snapshotType, color: '#888', icon: '?' }
  const date = new Date(snapshot.createdAt)
  const timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
      {/* Dot on timeline */}
      <div style={{
        position: 'absolute', left: '-2rem', top: '4px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: config.color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.65rem', fontWeight: 700,
      }}>
        {config.icon}
      </div>

      <div style={{
        padding: '0.75rem 1rem',
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        background: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <span style={{ fontWeight: 600, color: config.color }}>{config.label}</span>
          <span style={{ fontSize: '0.75rem', color: '#999' }}>{timeStr}</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: '#666' }}>
          <span>{snapshot.totalGrids} grids</span>
          <span>{snapshot.cropCount} crops</span>
          <span>${snapshot.revenuePerWeek.toFixed(2)}/wk</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build and commit**

Run: `cd growplan-web && npx tsc --noEmit`

```bash
git add growplan-web/src/pages/PlanHistoryPage.tsx
git commit -m "feat: add PlanHistoryPage with vertical timeline of snapshots"
```

---

## Chunk 6: Frontend Integration & UX Polish

### Task 13: Wire New Pages into App.tsx

**Files:**
- Modify: `growplan-web/src/App.tsx`
- Modify: `growplan-web/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add new page imports and routes to App.tsx**

Add imports:
```tsx
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CropComparisonPage } from './pages/CropComparisonPage'
import { PlanHistoryPage } from './pages/PlanHistoryPage'
```

Add to the `Page` type union:
```tsx
type Page =
  | 'welcome'
  | 'setup-farm'
  | 'select-crops'
  | 'define-goal'
  | 'generate-plan'
  | 'confirm-plan'
  | 'dashboard'
  | 'replan'
  | 'work-schedule-employer'
  | 'work-schedule-employee'
  | 'analytics'
  | 'crop-comparison'
  | 'plan-history'
```

Add page rendering blocks before the dashboard block:
```tsx
if (page === 'analytics') {
  return (
    <AnalyticsPage
      planId={planId}
      onBack={() => setPage('dashboard')}
    />
  )
}

if (page === 'crop-comparison') {
  return (
    <CropComparisonPage
      planId={planId}
      onBack={() => setPage('dashboard')}
    />
  )
}

if (page === 'plan-history') {
  return (
    <PlanHistoryPage
      planId={planId}
      onBack={() => setPage('dashboard')}
    />
  )
}
```

- [ ] **Step 2: Add navigation buttons to DashboardPage**

Add navigation callbacks to `DashboardPage` props and buttons for the three new pages. First, read `DashboardPage.tsx` to find the existing props interface. Then add three new callback props and navigation buttons:

```tsx
// Add to DashboardPage props:
onViewAnalytics: () => void
onViewCropComparison: () => void
onViewPlanHistory: () => void
```

Add a "Tools" section to the dashboard with three buttons:
```tsx
<div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
  <button onClick={onViewAnalytics}>Analytics</button>
  <button onClick={onViewCropComparison}>Compare Crops</button>
  <button onClick={onViewPlanHistory}>Plan History</button>
</div>
```

Pass the callbacks from `App.tsx`:
```tsx
<DashboardPage
  // ... existing props
  onViewAnalytics={() => setPage('analytics')}
  onViewCropComparison={() => setPage('crop-comparison')}
  onViewPlanHistory={() => setPage('plan-history')}
/>
```

- [ ] **Step 3: Verify build**

Run: `cd growplan-web && npx tsc --noEmit && npm run build`
Expected: No errors, clean build

- [ ] **Step 4: Commit**

```bash
git add growplan-web/src/App.tsx growplan-web/src/pages/DashboardPage.tsx
git commit -m "feat: wire analytics, comparison, history pages into app navigation"
```

---

### Task 14: Add Loading States, Error Handling, and Offline Fallback

**Files:**
- Modify: `growplan-web/src/App.tsx`
- Modify: `growplan-web/src/main.tsx`
- Modify: `growplan-web/src/lib/api.ts`

- [ ] **Step 1: Add Toaster and toast error wrapper**

In `src/App.tsx`, add import and render `<Toaster>`:
```tsx
import { Toaster } from 'react-hot-toast'
```

Add inside the top-level return, just before the closing element:
```tsx
<Toaster position="top-right" toastOptions={{ duration: 3000 }} />
```

Create a thin error wrapper in `src/lib/api.ts` by wrapping `apiFetch` with toast:
```typescript
import toast from 'react-hot-toast'

// Replace the existing apiFetch error path with:
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options?.headers,
    },
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    const message = body.error?.message ?? `API error ${resp.status}`
    toast.error(message)
    throw new Error(message)
  }
  return resp.json()
}
```

- [ ] **Step 2: Add localStorage form draft persistence**

Add a wizard draft helper to `src/App.tsx`. Save wizard state at each step transition:

```tsx
const WIZARD_KEY = 'gp_wizard_draft'

function saveWizardDraft(data: { page: string; setupFarmData?: SetupFarmData; selectedCropIds?: CropId[] }) {
  saveToStorage(WIZARD_KEY, data)
}

function loadWizardDraft(): { page: string; setupFarmData?: SetupFarmData; selectedCropIds?: CropId[] } | null {
  return loadFromStorage<{ page: string }>(WIZARD_KEY, null as unknown as { page: string })
}

function clearWizardDraft() {
  localStorage.removeItem(WIZARD_KEY)
}
```

Call `saveWizardDraft` when transitioning between wizard steps (setup-farm → select-crops, select-crops → define-goal, etc.). Call `clearWizardDraft()` after plan generation succeeds.

In `App` initialization, check for a draft:
```tsx
const draft = loadWizardDraft()
const [page, setPage] = useState<Page>(draft?.page as Page || 'welcome')
```

- [ ] **Step 3: Add offline health check and graceful degradation**

In `src/App.tsx`, run `checkBackendHealth()` on mount and show a banner when backend is unavailable:

```tsx
import { useEffect, useState } from 'react'
import { checkBackendHealth, isBackendAvailable } from './lib/api'

// Inside App component:
const [backendOnline, setBackendOnline] = useState(true)

useEffect(() => {
  checkBackendHealth().then(setBackendOnline)
}, [])
```

Add an offline banner after the opening return:
```tsx
{!backendOnline && (
  <div style={{
    padding: '0.5rem', background: '#fff3cd', borderBottom: '1px solid #ffc107',
    textAlign: 'center', fontSize: '0.85rem', color: '#856404',
  }}>
    Running in offline mode — analytics and history require the backend
  </div>
)}
```

Analytics pages already show "Generate a plan to see analytics" when `planId` is null. Gate the new analytics/comparison/history pages to show a backend-required message when `!backendOnline`:

```tsx
if (!backendOnline && (page === 'analytics' || page === 'crop-comparison' || page === 'plan-history')) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Backend Required</h2>
      <p style={{ color: '#888' }}>Start the API server to see analytics data</p>
      <button onClick={() => setPage('dashboard')}>Back to Dashboard</button>
    </div>
  )
}
```

- [ ] **Step 4: Verify build and commit**

Run: `cd growplan-web && npm run build`

```bash
git add growplan-web/src/
git commit -m "feat: add loading states, error toasts, form persistence, offline fallback"
```

---

## Chunk 7: Deployment

### Task 15: Add Frontend Docker Container and Nginx Config

**Files:**
- Create: `growplan-web/nginx.conf`
- Create: `growplan-web/Dockerfile`
- Modify: `growplan-web/vite.config.ts`
- Modify: `growplan-api/docker-compose.yml` (replace existing `nginx` service with `frontend`)

**Note on nginx consolidation:** The existing `docker-compose.yml` has a separate `nginx` service that proxies to FastAPI. The new frontend container replaces this — it serves the React build AND proxies `/api/` to FastAPI. This removes the need for a separate nginx service.

- [ ] **Step 1: Create nginx.conf for production**

```nginx
# growplan-web/nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://fastapi:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 256;
}
```

- [ ] **Step 2: Create Dockerfile for frontend**

```dockerfile
# growplan-web/Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Add Vite dev proxy**

```typescript
// growplan-web/vite.config.ts — add server proxy
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 4: Update docker-compose.yml — replace nginx service with frontend**

In `growplan-api/docker-compose.yml`, **remove** the existing `nginx` service and **add** the `frontend` service in its place:

```yaml
  # Replace the existing 'nginx' service with this:
  frontend:
    build: ../growplan-web
    ports:
      - "80:80"
    depends_on:
      - fastapi
```

Also remove the `./nginx.conf` volume mount (the frontend Docker image contains its own nginx.conf).

- [ ] **Step 5: Update API_BASE in api.ts for production**

The frontend `api.ts` should use `/api` prefix in production (same-origin via nginx proxy). Update the API_BASE logic:

```typescript
const API_BASE = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:8000')
```

- [ ] **Step 6: Verify build**

Run: `cd growplan-web && npm run build`

- [ ] **Step 7: Commit**

```bash
git add growplan-web/nginx.conf \
        growplan-web/Dockerfile \
        growplan-web/vite.config.ts \
        growplan-web/src/lib/api.ts \
        growplan-api/docker-compose.yml
git commit -m "feat: replace nginx service with frontend container, add dev proxy config"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Backend tests pass**: `cd growplan-api && python -m pytest tests/ -v`
- [ ] **Frontend builds**: `cd growplan-web && npm run build`
- [ ] **Docker Compose starts**: `cd growplan-api && docker-compose up --build`
- [ ] **End-to-end smoke test**: Create farm → generate plan → confirm → view analytics → export CSV
