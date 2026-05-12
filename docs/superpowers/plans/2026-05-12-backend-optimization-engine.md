# Backend Optimization Engine — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python FastAPI backend with OR-Tools CP-SAT solver that replaces the client-side plan generator with a production-grade optimization engine.

**Architecture:** Layered FastAPI app — API endpoints delegate to service layer, solver runs async via RQ, PostgreSQL for persistence, Redis for task queue. Single-server Docker Compose deployment.

**Tech Stack:** Python 3.12, FastAPI, OR-Tools CP-SAT, SQLAlchemy 2.0, Alembic, PostgreSQL, Redis, RQ, Pydantic v2, pytest + httpx

**Spec:** `docs/superpowers/specs/2026-05-12-backend-optimization-engine-design.md`

**API naming convention:** camelCase in JSON responses to match the existing frontend TypeScript types. All Pydantic schemas use `alias` from snake_case Python fields to camelCase JSON keys. Example: `sustainable_kg_per_week` in Python → `sustainableKgPerWeek` in JSON. Set `model_config = ConfigDict(populate_by_name=True, from_attributes=True)` on all schemas.

**Auth:** Phase 1 uses static API key via `X-API-Key` header (see Task 4). Middleware rejects unauthenticated requests with 401.

**Offline fallback:** The frontend keeps `planGenerator.ts` as fallback when backend is unreachable. The API client (Task 14) tries the backend first, catches network errors, and falls back to client-side generation with a visual indicator.

**PK decision:** The spec defines UUIDs for plans and composite PKs for grid cells, but this implementation uses integer autoincrement PKs for all tables. Rationale: single-server prototype doesn't need UUID distribution benefits, integer PKs simplify testing and foreign keys, and the API exposes integer IDs. If the system later needs distributed IDs, migrating to UUIDs is a separate task.

---

## File Structure

```
growplan-api/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app factory, CORS, routers
│   ├── config.py                  # Settings from env vars
│   ├── database.py                # SQLAlchemy engine, session, base
│   ├── models/                    # SQLAlchemy ORM
│   │   ├── __init__.py
│   │   ├── farm.py
│   │   ├── crop.py
│   │   ├── plan.py                # Plan, GridCell, Allocation, Rotation
│   │   ├── nursery.py             # NurseryBatch
│   │   ├── disruption.py
│   │   └── action.py
│   ├── schemas/                   # Pydantic request/response
│   │   ├── __init__.py
│   │   ├── farm.py
│   │   ├── crop.py
│   │   ├── plan.py                # Generate, PlanResponse, Status
│   │   ├── nursery.py
│   │   ├── disruption.py
│   │   ├── action.py
│   │   └── cost.py
│   ├── api/                       # Route handlers
│   │   ├── __init__.py
│   │   ├── farms.py
│   │   ├── crops.py
│   │   └── plans.py               # All plan endpoints (generate, status, CRUD, disrupt, replan)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── solver.py              # CP-SAT model building + solving
│   │   ├── postprocess.py         # Extract allocations, nursery, revenue from solver result
│   │   ├── replanner.py           # Warm-start replanning
│   │   ├── actions.py             # Generate action queue from plan
│   │   ├── nursery.py             # Nursery batch/occupancy calculations
│   │   ├── cost.py                # Labor, nutrients, energy, seed costs
│   │   └── forecast.py            # Demand forecasting
│   └── workers/
│       ├── __init__.py
│       └── solver_worker.py       # RQ job handler
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 001_initial_schema.py
├── seeds/
│   └── crops.py                   # Crop library seed data
├── tests/
│   ├── conftest.py                # Fixtures: test DB, test client
│   ├── test_models.py
│   ├── test_solver.py
│   ├── test_postprocess.py
│   ├── test_nursery.py
│   ├── test_actions.py
│   ├── test_cost.py
│   ├── test_forecast.py
│   ├── test_api_farms.py
│   ├── test_api_plans.py
│   └── test_api_crops.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── alembic.ini
```

---

## Chunk 1: Project Scaffold + Data Models + Migrations

### Task 1: Initialize project structure

**Files:**
- Create: `growplan-api/requirements.txt`
- Create: `growplan-api/app/__init__.py`
- Create: `growplan-api/app/config.py`
- Create: `growplan-api/app/database.py`
- Create: `growplan-api/app/main.py`
- Create: `growplan-api/tests/conftest.py`

- [ ] **Step 1: Create growplan-api directory and requirements.txt**

```txt
fastapi>=0.110
uvicorn[standard]>=0.30
sqlalchemy>=2.0
alembic>=1.13
psycopg2-binary>=2.9
pydantic>=2.0
pydantic-settings>=2.0
ortools>=9.10
redis>=5.0
rq>=1.16
numpy>=1.26
httpx>=0.27
pytest>=8.0
pytest-asyncio>=0.23
```

- [ ] **Step 2: Create app/config.py**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://growplan:growplan@localhost:5432/growplan"
    redis_url: str = "redis://localhost:6379/0"
    solver_timeout_seconds: int = 10
    solver_max_timeout_seconds: int = 30
    solver_queue_depth: int = 5
    api_key: str = "dev-key-change-in-production"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_prefix = "GP_"

settings = Settings()
```

- [ ] **Step 3: Create app/database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Create app/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(title="GrowPlan API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

- [ ] **Step 5: Create tests/conftest.py**

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///./test.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client():
    return TestClient(app, headers={"X-API-Key": "dev-key-change-in-production"})

@pytest.fixture
def db_session():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 6: Install dependencies and verify**

Run: `cd growplan-api && pip install -r requirements.txt`
Run: `python -c "from app.main import app; print(app.title)"`
Expected: `GrowPlan API`

- [ ] **Step 7: Commit**

```bash
git add growplan-api/
git commit -m "feat(api): initialize project scaffold with FastAPI, config, and test setup"
```

---

### Task 2: SQLAlchemy models

**Files:**
- Create: `growplan-api/app/models/__init__.py`
- Create: `growplan-api/app/models/farm.py`
- Create: `growplan-api/app/models/crop.py`
- Create: `growplan-api/app/models/plan.py`
- Create: `growplan-api/app/models/nursery.py`
- Create: `growplan-api/app/models/disruption.py`
- Create: `growplan-api/app/models/action.py`
- Create: `growplan-api/tests/test_models.py`

- [ ] **Step 1: Write test for model creation**

```python
# tests/test_models.py
import pytest
from sqlalchemy import select
from app.models.farm import Farm
from app.models.crop import Crop
from app.models.plan import Plan, GridCell, Allocation, Rotation
from app.models.nursery import NurseryBatch
from app.models.disruption import Disruption
from app.models.action import Action

def test_create_farm(db_session):
    farm = Farm(name="Test Farm", location="Bangkok", rows=4, columns=12,
                growing_system="hydroponic", nursery_tray_count=30,
                nursery_tray_cells=200, nursery_buffer_pct=10)
    db_session.add(farm)
    db_session.commit()
    assert farm.id is not None
    assert farm.rows * farm.columns == 48

def test_create_crop(db_session):
    crop = Crop(id="lettuce", name="Lettuce", category="Leafy Green",
                icon="🥬", accent="#48bb78", weeks_on_panel=6,
                nursery_lead_weeks=2, yield_per_grid=2.0, price_per_kg=3.0,
                seedlings_per_grid=20, tray_cell_count=200,
                germination_rate=0.95, prefers_edge=False,
                edge_weight=0.5, neighbor_bonus=1.0)
    db_session.add(crop)
    db_session.commit()
    assert crop.id == "lettuce"

def test_create_plan_with_cells(db_session):
    farm = Farm(name="Test", rows=2, columns=2, nursery_tray_count=10,
                nursery_tray_cells=100, nursery_buffer_pct=10)
    db_session.add(farm)
    db_session.flush()
    plan = Plan(farm_id=farm.id, horizon_weeks=8, status="completed",
                goal_priority="maximize-revenue", selected_crops=["lettuce"])
    db_session.add(plan)
    db_session.flush()
    cell = GridCell(plan_id=plan.id, cell_index=0, crop_id="lettuce",
                    status="planned", week_started=0, week_harvest_expected=6)
    db_session.add(cell)
    db_session.commit()
    assert plan.id is not None
    assert cell.crop_id == "lettuce"

def test_create_nursery_batch(db_session):
    farm = Farm(name="T", rows=2, columns=2, nursery_tray_count=10,
                nursery_tray_cells=100, nursery_buffer_pct=10)
    db_session.add(farm)
    db_session.flush()
    plan = Plan(farm_id=farm.id, horizon_weeks=8, status="solving",
                goal_priority="maximize-revenue", selected_crops=["basil"])
    db_session.add(plan)
    db_session.flush()
    batch = NurseryBatch(id="basil-w1", plan_id=plan.id, crop_id="basil",
                         seed_week=1, transplant_week=3, seedling_count=100,
                         tray_count=1, status="planned")
    db_session.add(batch)
    db_session.commit()
    assert batch.tray_count == 1

def test_create_disruption_and_action(db_session):
    farm = Farm(name="T", rows=2, columns=2, nursery_tray_count=10,
                nursery_tray_cells=100, nursery_buffer_pct=10)
    db_session.add(farm)
    db_session.flush()
    plan = Plan(farm_id=farm.id, horizon_weeks=8, status="confirmed",
                goal_priority="maximize-revenue", selected_crops=["lettuce"])
    db_session.add(plan)
    db_session.flush()
    disruption = Disruption(plan_id=plan.id, type="crop-death",
                            grid_indexes=[0, 1], crop_id="lettuce",
                            week=3, description="Root rot")
    action = Action(plan_id=plan.id, type="transplant", priority="this-week",
                    week=3, crop_id="lettuce", grid_indexes=[0, 1],
                    description="Transplant lettuce", revenue_impact=10.0,
                    batch_id="lettuce-w3")
    db_session.add_all([disruption, action])
    db_session.commit()
    assert disruption.id is not None
    assert action.batch_id == "lettuce-w3"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd growplan-api && python -m pytest tests/test_models.py -v`
Expected: FAIL — models not defined yet

- [ ] **Step 3: Create all model files**

```python
# app/models/farm.py
from sqlalchemy import Column, Integer, String, Float
from app.database import Base


class Farm(Base):
    __tablename__ = "farms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    location = Column(String(100), nullable=True)
    rows = Column(Integer, nullable=False)
    columns = Column(Integer, nullable=False)
    growing_system = Column(String(50), nullable=False, default="hydroponic")
    nursery_tray_count = Column(Integer, nullable=False)
    nursery_tray_cells = Column(Integer, nullable=False, default=200)
    nursery_buffer_pct = Column(Float, nullable=False, default=10.0)
```

```python
# app/models/crop.py
from sqlalchemy import Column, Integer, String, Float, Boolean
from app.database import Base


class Crop(Base):
    __tablename__ = "crops"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    icon = Column(String(10), nullable=False)
    accent = Column(String(7), nullable=False)
    weeks_on_panel = Column(Integer, nullable=False)
    nursery_lead_weeks = Column(Integer, nullable=False)
    yield_per_grid = Column(Float, nullable=False)
    price_per_kg = Column(Float, nullable=False)
    seedlings_per_grid = Column(Integer, nullable=False)
    tray_cell_count = Column(Integer, nullable=False, default=200)
    germination_rate = Column(Float, nullable=False, default=0.95)
    prefers_edge = Column(Boolean, nullable=False, default=False)
    edge_weight = Column(Float, nullable=False, default=0.5)
    neighbor_bonus = Column(Float, nullable=False, default=1.0)
    nutrient_cost_per_grid_week = Column(Float, nullable=False, default=0.10)
    cost_per_seedling = Column(Float, nullable=False, default=0.02)
```

```python
# app/models/plan.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    horizon_weeks = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="solving")
    goal_priority = Column(String(30), nullable=False, default="maximize-revenue")
    selected_crops = Column(JSON, nullable=False, default=list)
    goal_commitments = Column(JSON, nullable=True)
    current_week = Column(Integer, nullable=False, default=1)
    total_grids = Column(Integer, nullable=True)
    revenue_total = Column(Float, nullable=True)
    revenue_max = Column(Float, nullable=True)
    revenue_efficiency = Column(Float, nullable=True)
    revenue_opportunity_cost = Column(Float, nullable=True)
    revenue_gap = Column(Float, nullable=True)
    solver_status = Column(String(30), nullable=True)
    solver_time_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    cells = relationship("GridCell", back_populates="plan", cascade="all, delete-orphan")
    allocations = relationship("Allocation", back_populates="plan", cascade="all, delete-orphan")
    nursery_batches = relationship("NurseryBatch", back_populates="plan", cascade="all, delete-orphan")
    disruptions = relationship("Disruption", back_populates="plan", cascade="all, delete-orphan")
    actions = relationship("Action", back_populates="plan", cascade="all, delete-orphan")


class GridCell(Base):
    __tablename__ = "grid_cells"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    cell_index = Column(Integer, nullable=False)
    crop_id = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="planned")
    week_started = Column(Integer, nullable=True)
    week_harvest_expected = Column(Integer, nullable=True)

    plan = relationship("Plan", back_populates="cells")


class Allocation(Base):
    __tablename__ = "allocations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    crop_id = Column(String(50), nullable=False)
    grids_allocated = Column(Integer, nullable=False, default=0)
    sustainable_kg_per_week = Column(Float, nullable=False, default=0.0)
    revenue_per_week = Column(Float, nullable=False, default=0.0)

    plan = relationship("Plan", back_populates="allocations")
```

```python
# app/models/nursery.py
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class NurseryBatch(Base):
    __tablename__ = "nursery_batches"

    id = Column(String(50), primary_key=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), primary_key=True)
    crop_id = Column(String(50), nullable=False)
    seed_week = Column(Integer, nullable=False)
    transplant_week = Column(Integer, nullable=False)
    seedling_count = Column(Integer, nullable=False)
    tray_count = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="planned")

    plan = relationship("Plan", back_populates="nursery_batches")
```

```python
# app/models/disruption.py
from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class Disruption(Base):
    __tablename__ = "disruptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    type = Column(String(30), nullable=False)
    grid_indexes = Column(JSON, nullable=False, default=list)
    crop_id = Column(String(50), nullable=False)
    week = Column(Integer, nullable=False)
    description = Column(String(500), nullable=True)

    plan = relationship("Plan", back_populates="disruptions")
```

```python
# app/models/action.py
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    type = Column(String(30), nullable=False)
    priority = Column(String(20), nullable=False)
    week = Column(Integer, nullable=False)
    crop_id = Column(String(50), nullable=True)
    grid_indexes = Column(Integer, nullable=True)
    description = Column(String(500), nullable=False)
    revenue_impact = Column(Float, nullable=False, default=0.0)
    batch_id = Column(String(50), nullable=True)
    completed = Column(Boolean, nullable=False, default=False)

    plan = relationship("Plan", back_populates="actions")
```

```python
# app/models/__init__.py
from app.models.farm import Farm
from app.models.crop import Crop
from app.models.plan import Plan, GridCell, Allocation
from app.models.nursery import NurseryBatch
from app.models.disruption import Disruption
from app.models.action import Action

__all__ = [
    "Farm", "Crop", "Plan", "GridCell", "Allocation",
    "NurseryBatch", "Disruption", "Action",
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd growplan-api && python -m pytest tests/test_models.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add growplan-api/app/models/ growplan-api/tests/test_models.py
git commit -m "feat(models): add SQLAlchemy ORM models for all domain entities"
```

---

### Task 3: Alembic migrations + crop seed data

**Files:**
- Create: `growplan-api/alembic.ini`
- Create: `growplan-api/alembic/env.py`
- Create: `growplan-api/alembic/versions/001_initial_schema.py`
- Create: `growplan-api/seeds/crops.py`

- [ ] **Step 1: Start PostgreSQL for migrations**

Run: `docker run -d --name growplan-pg -e POSTGRES_USER=growplan -e POSTGRES_PASSWORD=growplan -e POSTGRES_DB=growplan -p 5432:5432 postgres:16-alpine`
If PostgreSQL is already running locally, skip this step. Tests use SQLite (via conftest.py) and do not need PostgreSQL.

- [ ] **Step 2: Initialize Alembic**

Run: `cd growplan-api && alembic init alembic`
Then configure `alembic/env.py` to import `app.database.Base` and all models.

- [ ] **Step 3: Generate initial migration**

Run: `cd growplan-api && alembic revision --autogenerate -m "initial schema"`
Verify the generated migration includes all 7 tables: farms, crops, plans, grid_cells, allocations, nursery_batches, disruptions, actions.

- [ ] **Step 4: Create seeds/crops.py with the 8-crop library**

Port crop data from `src/constants/crops.ts` — lettuce, basil, kale, mint, cilantro, arugula, spinach, chard. Each crop gets all fields from the Crop model including the new `nutrient_cost_per_grid_week` and `cost_per_seedling` fields. Use sensible defaults: `$0.10/grid-week` for nutrients, `$0.02/seedling` for seeds, adjusted per crop category.

- [ ] **Step 5: Verify migration runs**

Run: `cd growplan-api && alembic upgrade head`
Run: `cd growplan-api && python -m seeds.crops` (seed script with INSERT ON CONFLICT DO NOTHING)
Expected: All 8 crops inserted, tables created.

- [ ] **Step 6: Commit**

```bash
git add growplan-api/alembic/ growplan-api/alembic.ini growplan-api/seeds/
git commit -m "feat(db): add Alembic migrations and crop seed data"
```

---

## Chunk 2: Pydantic Schemas + Farm/Crop API

### Task 4: Pydantic request/response schemas

**Files:**
- Create: `growplan-api/app/schemas/__init__.py`
- Create: `growplan-api/app/schemas/farm.py`
- Create: `growplan-api/app/schemas/crop.py`
- Create: `growplan-api/app/schemas/plan.py`
- Create: `growplan-api/app/schemas/nursery.py`
- Create: `growplan-api/app/schemas/disruption.py`
- Create: `growplan-api/app/schemas/action.py`
- Create: `growplan-api/app/schemas/cost.py`
- Create: `growplan-api/app/schemas/errors.py`

- [ ] **Step 1: Create all schema files matching spec Section 5 response shapes**

Key schemas to define:
- `FarmCreate`, `FarmUpdate`, `FarmResponse` — farm CRUD
- `CropResponse` — crop listing
- `GoalData`, `CropCommitment` — goal input
- `PlanGenerateRequest` — the POST /plans/generate request
- `PlanGenerateResponse` — `{ plan_id, status, poll_url }`
- `PlanStatusResponse` — solver status
- `GridCellResponse`, `AllocationResponse`, `RotationResponse` — plan components
- `NurseryBatchResponse`, `NurseryOccupancyResponse` — nursery data
- `RevenueResponse` — full revenue breakdown
- `PlanResponse` — complete plan with all nested objects
- `DisruptionRequest`, `ReplanResponse`, `ReplantOptionResponse`
- `ActionResponse` — action queue items
- `CostResponse` — cost breakdown
- `ErrorResponse` — error envelope from spec Section 9

- [ ] **Step 2: Add auth middleware and error handlers to main.py**

```python
# Add to app/main.py after CORS middleware
from fastapi import Request
from fastapi.responses import JSONResponse
from app.config import settings

@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    api_key = request.headers.get("X-API-Key")
    if api_key != settings.api_key:
        return JSONResponse(status_code=401, content={
            "error": {"code": "UNAUTHENTICATED", "message": "Invalid or missing API key"}
        })
    return await call_next(request)

@app.exception_handler(ValueError)
async def validation_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={
        "error": {"code": "VALIDATION_ERROR", "message": str(exc)}
    })
```

- [ ] **Step 3: Verify schemas parse correctly**

Run: `cd growplan-api && python -c "from app.schemas.plan import PlanGenerateRequest, PlanResponse; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add growplan-api/app/schemas/
git commit -m "feat(schemas): add Pydantic request/response schemas for all API endpoints"
```

---

### Task 5: Farm and Crop API endpoints

**Files:**
- Create: `growplan-api/app/api/__init__.py`
- Create: `growplan-api/app/api/farms.py`
- Create: `growplan-api/app/api/crops.py`
- Modify: `growplan-api/app/main.py` — register routers
- Create: `growplan-api/tests/test_api_farms.py`
- Create: `growplan-api/tests/test_api_crops.py`

- [ ] **Step 1: Write tests for farm CRUD**

```python
# tests/test_api_farms.py
def test_create_farm(client):
    resp = client.post("/farms", json={
        "name": "Green Farm", "location": "Bangkok", "rows": 4, "columns": 12,
        "growing_system": "hydroponic", "nursery_tray_count": 30,
        "nursery_tray_cells": 200, "nursery_buffer_pct": 10
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Green Farm"
    assert data["id"] is not None

def test_get_farm(client):
    create = client.post("/farms", json={
        "name": "Green Farm", "location": "Bangkok", "rows": 4, "columns": 12,
        "growing_system": "hydroponic", "nursery_tray_count": 30,
        "nursery_tray_cells": 200, "nursery_buffer_pct": 10
    })
    farm_id = create.json()["id"]
    resp = client.get(f"/farms/{farm_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Green Farm"

def test_update_farm(client):
    create = client.post("/farms", json={
        "name": "Green Farm", "location": "Bangkok", "rows": 4, "columns": 12,
        "growing_system": "hydroponic", "nursery_tray_count": 30,
        "nursery_tray_cells": 200, "nursery_buffer_pct": 10
    })
    farm_id = create.json()["id"]
    resp = client.put(f"/farms/{farm_id}", json={"name": "Updated Farm"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Farm"

def test_get_farm_not_found(client):
    resp = client.get("/farms/nonexistent")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd growplan-api && python -m pytest tests/test_api_farms.py -v`
Expected: FAIL — endpoints not defined

- [ ] **Step 3: Implement farm and crop endpoints**

`app/api/farms.py` — POST, GET, PUT with SQLAlchemy session + Pydantic schemas.
`app/api/crops.py` — GET /crops returning all seeded crops.

Register both routers in `app/main.py`.

- [ ] **Step 4: Write and run crop API tests**

```python
# tests/test_api_crops.py
def test_list_crops(client, db_session):
    # Seed test data
    from app.models.crop import Crop
    db_session.add(Crop(id="lettuce", name="Lettuce", ...))
    db_session.commit()

    resp = client.get("/crops")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    assert resp.json()[0]["id"] == "lettuce"
```

- [ ] **Step 5: Run all tests**

Run: `cd growplan-api && python -m pytest tests/test_api_farms.py tests/test_api_crops.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add growplan-api/app/api/ growplan-api/app/main.py growplan-api/tests/test_api_*.py
git commit -m "feat(api): add farm CRUD and crop listing endpoints"
```

---

## Chunk 3: Core CP-SAT Solver

### Task 6: Solver service — model building

**Files:**
- Create: `growplan-api/app/services/__init__.py`
- Create: `growplan-api/app/services/solver.py`
- Create: `growplan-api/tests/test_solver.py`

- [ ] **Step 1: Write solver test — small farm, single crop**

```python
# tests/test_solver.py
from app.services.solver import build_model, solve_plan

def test_solver_single_crop_optimal():
    farm = {"rows": 2, "columns": 2, "nursery_tray_count": 10,
            "nursery_tray_cells": 100, "nursery_buffer_pct": 10}
    crops = [{"id": "basil", "weeks_on_panel": 6, "nursery_lead_weeks": 2,
              "yield_per_grid": 1.5, "price_per_kg": 4.0,
              "seedlings_per_grid": 25, "tray_cell_count": 200,
              "germination_rate": 0.95, "prefers_edge": False,
              "edge_weight": 0.5, "neighbor_bonus": 1.0}]
    goal = {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
            "commitments": {"basil": {"enabled": False, "min_kg_per_week": 0}}}

    result = solve_plan(farm, crops, goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    assert result["total_grids"] == 4
    assert len(result["cells"]) == 4
    assert all(cell["crop_id"] == "basil" for cell in result["cells"])

def test_solver_respects_commitments():
    farm = {"rows": 2, "columns": 4, "nursery_tray_count": 20,
            "nursery_tray_cells": 100, "nursery_buffer_pct": 10}
    crops = [
        {"id": "basil", "weeks_on_panel": 6, "nursery_lead_weeks": 2,
         "yield_per_grid": 1.5, "price_per_kg": 4.0,
         "seedlings_per_grid": 25, "tray_cell_count": 200,
         "germination_rate": 0.95, "prefers_edge": False,
         "edge_weight": 0.5, "neighbor_bonus": 1.0},
        {"id": "lettuce", "weeks_on_panel": 6, "nursery_lead_weeks": 2,
         "yield_per_grid": 2.0, "price_per_kg": 3.0,
         "seedlings_per_grid": 20, "tray_cell_count": 200,
         "germination_rate": 0.95, "prefers_edge": True,
         "edge_weight": 0.7, "neighbor_bonus": 0.8}
    ]
    goal = {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
            "commitments": {
                "lettuce": {"enabled": True, "min_kg_per_week": 2.0},
                "basil": {"enabled": False, "min_kg_per_week": 0}
            }}

    result = solve_plan(farm, crops, goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    lettuce_alloc = next(a for a in result["allocations"] if a["crop_id"] == "lettuce")
    assert lettuce_alloc["sustainable_kg_per_week"] >= 2.0

def test_solver_infeasible_overcommitted():
    farm = {"rows": 1, "columns": 1, "nursery_tray_count": 1,
            "nursery_tray_cells": 50, "nursery_buffer_pct": 10}
    crops = [{"id": "lettuce", "weeks_on_panel": 6, "nursery_lead_weeks": 2,
              "yield_per_grid": 2.0, "price_per_kg": 3.0,
              "seedlings_per_grid": 20, "tray_cell_count": 200,
              "germination_rate": 0.95, "prefers_edge": False,
              "edge_weight": 0.5, "neighbor_bonus": 1.0}]
    goal = {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
            "commitments": {
                "lettuce": {"enabled": True, "min_kg_per_week": 100.0}
            }}

    result = solve_plan(farm, crops, goal)
    assert result["status"] == "INFEASIBLE"
    assert "conflicting_constraints" in result

def test_solver_stockout_mode():
    farm = {"rows": 2, "columns": 4, "nursery_tray_count": 20,
            "nursery_tray_cells": 100, "nursery_buffer_pct": 10}
    crops = [
        {"id": "basil", "weeks_on_panel": 6, "nursery_lead_weeks": 2,
         "yield_per_grid": 1.5, "price_per_kg": 4.0,
         "seedlings_per_grid": 25, "tray_cell_count": 200,
         "germination_rate": 0.95, "prefers_edge": False,
         "edge_weight": 0.5, "neighbor_bonus": 1.0},
        {"id": "lettuce", "weeks_on_panel": 6, "nursery_lead_weeks": 2,
         "yield_per_grid": 2.0, "price_per_kg": 3.0,
         "seedlings_per_grid": 20, "tray_cell_count": 200,
         "germination_rate": 0.95, "prefers_edge": True,
         "edge_weight": 0.7, "neighbor_bonus": 0.8}
    ]
    goal = {"planning_horizon_weeks": 8, "priority": "minimize-stockout",
            "commitments": {"basil": {"enabled": False}, "lettuce": {"enabled": False}}}

    result = solve_plan(farm, crops, goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd growplan-api && python -m pytest tests/test_solver.py -v`
Expected: FAIL

- [ ] **Step 3: Implement solver service**

`app/services/solver.py` — the core:
1. `build_model(farm, crops, goal)` — creates CP-SAT model with:
   - Decision variables: `x[crop, grid, week]`, `n[crop, week]`, `h[crop, grid, week]`
   - Grid exclusivity constraint
   - Crop cycle continuity constraint
   - Nursery lead time constraint
   - Nursery tray capacity constraint
   - Minimum commitment constraint
   - Spatial scoring (edge distance, neighbor bonus)
   - Objective: maximize-revenue or minimize-stockout based on `goal.priority`
2. `solve_plan(farm, crops, goal)` — calls build_model, solves, then inline-extracts the result:
   - Iterates solver variable assignments to produce `cells` list (one per grid)
   - Aggregates per-crop into `allocations` list (grids, kg/week, revenue)
   - Returns structured dict: `{ status, cells, allocations, total_grids, solver_time_ms }`
   - This is the full output — Task 7's `postprocess.py` refactors this into separate functions but does NOT change the output shape.
3. Handles INFEASIBLE and NO_SOLUTION_FOUND states — returns `{ status: "INFEASIBLE", conflicting_constraints: [...] }`

- [ ] **Step 4: Run solver tests**

Run: `cd growplan-api && python -m pytest tests/test_solver.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add growplan-api/app/services/ growplan-api/tests/test_solver.py
git commit -m "feat(solver): implement CP-SAT optimization engine with revenue and stockout objectives"
```

---

### Task 7: Post-processing — extract plan data from solver

**Files:**
- Create: `growplan-api/app/services/postprocess.py`
- Create: `growplan-api/app/services/nursery.py`
- Create: `growplan-api/tests/test_postprocess.py`
- Create: `growplan-api/tests/test_nursery.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_postprocess.py
from app.services.postprocess import extract_allocations, extract_cells, calculate_revenue

def test_extract_cells_assigns_all_grids():
    solver_cells = [
        {"cell_index": 0, "crop_id": "basil", "status": "planned", "week_started": 0, "week_harvest_expected": 6},
        {"cell_index": 1, "crop_id": "basil", "status": "planned", "week_started": 0, "week_harvest_expected": 6},
        {"cell_index": 2, "crop_id": "lettuce", "status": "planned", "week_started": 0, "week_harvest_expected": 6},
        {"cell_index": 3, "crop_id": "lettuce", "status": "planned", "week_started": 0, "week_harvest_expected": 6},
    ]
    cells = extract_cells(solver_cells, rows=2, cols=2)
    assert len(cells) == 4
    assert all(c["crop_id"] is not None for c in cells)

def test_calculate_revenue():
    crops = [
        {"id": "basil", "yield_per_grid": 1.5, "price_per_kg": 4.0, "weeks_on_panel": 6},
        {"id": "lettuce", "yield_per_grid": 2.0, "price_per_kg": 3.0, "weeks_on_panel": 6},
    ]
    allocations = [
        {"crop_id": "basil", "grids_allocated": 2, "sustainable_kg_per_week": 1.0, "revenue_per_week": 4.0},
        {"crop_id": "lettuce", "grids_allocated": 2, "sustainable_kg_per_week": 1.33, "revenue_per_week": 4.0},
    ]
    revenue = calculate_revenue(allocations, total_grids=4, crops=crops, commitments={})
    assert revenue["total_per_week"] == 8.0
    assert revenue["max_possible"] >= 8.0
    assert revenue["efficiency_pct"] <= 100

# tests/test_nursery.py
from app.services.nursery import build_batches, build_occupancy

def test_build_occupancy_respects_tray_limit():
    crops = [{"id": "basil", "seedlings_per_grid": 25, "tray_cell_count": 200,
              "germination_rate": 0.95, "nursery_lead_weeks": 2, "weeks_on_panel": 6}]
    allocations = [{"crop_id": "basil", "grids_allocated": 4}]
    batches = build_batches(allocations=allocations, crops=crops, horizon_weeks=8, buffer_pct=10)
    occupancy = build_occupancy(batches, total_trays=30, horizon_weeks=8)
    assert all(w["trays_in_use"] <= 30 for w in occupancy)
    assert all(w["trays_available"] >= 0 for w in occupancy)
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement postprocess.py and nursery.py**

`postprocess.py` — refactors the inline extraction from `solve_plan()` into reusable functions:
- `extract_cells(solver_cells, rows, cols)` — takes the flat cell list from solver output, validates all grid positions are filled, returns list of `{ cell_index, crop_id, status, week_started, week_harvest_expected }` dicts
- `extract_allocations(cells, crops)` — groups cells by crop_id, computes per-crop: `grids_allocated`, `sustainable_kg_per_week = (grids * yield_per_grid) / weeks_on_panel`, `revenue_per_week = sustainable_kg * price_per_kg`
- `calculate_revenue(allocations, total_grids, crops, commitments)` — sums allocations into `total_per_week`, computes `max_possible` (all grids on highest-revenue crop), `efficiency_pct`, `opportunity_cost_of_commitments` (difference between max and actual)

`nursery.py`:
- `build_batches(allocations, crops, horizon_weeks, buffer_pct)` — for each crop with grids > 0, creates nursery batches: computes seedling_count (grids * seedlings_per_grid / germination_rate), tray_count (seedling_count / tray_cell_count rounded up), seed_week and transplant_week offset by nursery_lead_weeks
- `build_occupancy(batches, total_trays, horizon_weeks)` — for each week 1..horizon_weeks, sums trays for batches where seed_week <= week < transplant_week, returns `{ week, trays_in_use, trays_available, total_trays, batches: [...] }`

- [ ] **Step 4: Run tests**

Run: `cd growplan-api && python -m pytest tests/test_postprocess.py tests/test_nursery.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add growplan-api/app/services/postprocess.py growplan-api/app/services/nursery.py growplan-api/tests/test_postprocess.py growplan-api/tests/test_nursery.py
git commit -m "feat(services): add plan post-processing and nursery scheduling"
```

---

## Chunk 4: Plan API + Solver Worker

### Task 8: Plan generation, status, retrieval, confirmation endpoints

**Files:**
- Create: `growplan-api/app/api/plans.py`
- Create: `growplan-api/app/workers/__init__.py`
- Create: `growplan-api/app/workers/solver_worker.py`
- Modify: `growplan-api/app/main.py` — register plan router
- Create: `growplan-api/tests/test_api_plans.py`

- [ ] **Step 1: Write plan API tests**

```python
# tests/test_api_plans.py
def test_generate_plan_returns_job(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    resp = client.post("/plans/generate", json={
        "farm_id": farm["id"],
        "selected_crop_ids": ["lettuce", "basil"],
        "goal": {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
                 "commitments": {"lettuce": {"enabled": False, "min_kg_per_week": 0},
                                 "basil": {"enabled": False, "min_kg_per_week": 0}}}
    })
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "solving"
    assert "plan_id" in data
    assert "poll_url" in data

def test_get_plan_status(client, db_session):
    farm = create_test_farm(client)
    resp = client.post("/plans/generate", json={
        "farm_id": farm["id"],
        "selected_crop_ids": ["lettuce"],
        "goal": {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
                 "commitments": {"lettuce": {"enabled": False, "min_kg_per_week": 0}}}
    })
    plan_id = resp.json()["plan_id"]
    status_resp = client.get(f"/plans/{plan_id}/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] in ("solving", "completed")

def test_get_completed_plan(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    resp = client.post("/plans/generate", json={
        "farm_id": farm["id"],
        "selected_crop_ids": ["lettuce"],
        "goal": {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
                 "commitments": {"lettuce": {"enabled": False, "min_kg_per_week": 0}}}
    })
    plan_id = resp.json()["plan_id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "completed"
    assert len(plan["cells"]) == 48  # 4x12 farm

def test_confirm_plan(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    gen = client.post("/plans/generate", json={
        "farm_id": farm["id"],
        "selected_crop_ids": ["lettuce"],
        "goal": {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
                 "commitments": {"lettuce": {"enabled": False, "min_kg_per_week": 0}}}
    })
    plan_id = gen.json()["plan_id"]
    resp = client.post(f"/plans/{plan_id}/confirm")
    assert resp.status_code == 200
    assert client.get(f"/plans/{plan_id}").json()["status"] == "confirmed"

def test_confirm_locked_plan_rejected(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    gen = client.post("/plans/generate", json={
        "farm_id": farm["id"],
        "selected_crop_ids": ["lettuce"],
        "goal": {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
                 "commitments": {"lettuce": {"enabled": False, "min_kg_per_week": 0}}}
    })
    plan_id = gen.json()["plan_id"]
    client.post(f"/plans/{plan_id}/confirm")
    resp = client.post(f"/plans/{plan_id}/confirm")
    assert resp.status_code == 409
```

- [ ] **Step 2: Implement synchronous solver for tests**

In tests, the solver runs synchronously inside the API handler instead of through RQ. Add a `GP_TEST_MODE` env var that the `POST /plans/generate` handler checks — when true, it calls `solve_plan()` directly and writes results to DB before returning, so the plan is already `completed` when the 202 response arrives. The conftest.py sets `GP_TEST_MODE=true` via `monkeypatch.setenv("GP_TEST_MODE", "true")` in a fixture.

- [ ] **Step 3: Implement plan API endpoints**

`app/api/plans.py`:
- `POST /plans/generate` — validate, create Plan row (status: solving), enqueue solver job, return 202
- `GET /plans/{plan_id}/status` — return current status
- `GET /plans/{plan_id}` — return full plan (cells, allocations, rotations, nursery, revenue)
- `POST /plans/{plan_id}/confirm` — transition status to confirmed

- [ ] **Step 4: Implement RQ solver worker**

`app/workers/solver_worker.py`:
- Loads plan from DB by ID
- Calls `solve_plan()` + post-processing
- Persists results (cells, allocations, rotations, batches, revenue) to DB
- Updates plan status to `completed` or `failed`

- [ ] **Step 5: Run all tests**

Run: `cd growplan-api && python -m pytest tests/test_api_plans.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add growplan-api/app/api/plans.py growplan-api/app/workers/ growplan-api/app/main.py growplan-api/tests/test_api_plans.py
git commit -m "feat(api): add plan generation, status polling, retrieval, and confirmation endpoints"
```

---

## Chunk 5: Living Plan Operations

### Task 9: Advance week, disruption, replan, actions

**Files:**
- Modify: `growplan-api/app/api/plans.py` — add endpoints
- Create: `growplan-api/app/services/replanner.py`
- Create: `growplan-api/app/services/actions.py`
- Create: `growplan-api/tests/test_replanner.py`
- Create: `growplan-api/tests/test_actions.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_replanner.py
from app.services.replanner import replan
from app.models import Plan, GridCell, Disruption

def test_replan_marks_dead_grids(db_session):
    farm = create_farm(db_session)
    plan = create_completed_plan(db_session, farm.id, ["lettuce", "basil"])
    disruption = Disruption(plan_id=plan.id, type="crop-death",
                            grid_indexes=[0, 1], crop_id="lettuce",
                            week=2, description="Root rot")
    db_session.add(disruption)
    db_session.commit()
    result = replan(plan.id, disruption, db_session)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    dead_cells = [c for c in result["cells"] if c["cell_index"] in [0, 1]]
    assert all(c["status"] == "dead" for c in dead_cells)

def test_replan_preserves_past_weeks(db_session):
    farm = create_farm(db_session)
    plan = create_completed_plan(db_session, farm.id, ["lettuce"])
    plan.current_week = 3
    db_session.commit()
    disruption = Disruption(plan_id=plan.id, type="crop-death",
                            grid_indexes=[0], crop_id="lettuce", week=3)
    db_session.add(disruption)
    db_session.commit()
    result = replan(plan.id, disruption, db_session)
    past_cells = [c for c in result["cells"] if c["week_started"] is not None and c["week_started"] < 3]
    # Past cells keep their original crop assignment
    assert all(c["crop_id"] == "lettuce" for c in past_cells)

def test_replan_returns_replant_options(db_session):
    farm = create_farm(db_session)
    plan = create_completed_plan(db_session, farm.id, ["lettuce", "basil"])
    disruption = Disruption(plan_id=plan.id, type="crop-death",
                            grid_indexes=[0, 1], crop_id="lettuce", week=2)
    db_session.add(disruption)
    db_session.commit()
    result = replan(plan.id, disruption, db_session)
    assert "replant_options" in result
    assert len(result["replant_options"]) >= 1
    assert result["replant_options"][0]["crop_id"] is not None

# tests/test_actions.py
from app.services.actions import generate_action_queue

def test_action_queue_includes_this_week_tasks(db_session):
    farm = create_farm(db_session)
    plan = create_confirmed_plan(db_session, farm.id, ["lettuce"])
    actions = generate_action_queue(plan, current_week=1)
    assert len(actions) > 0
    types = {a["type"] for a in actions}
    assert "transplant" in types or "seed-nursery" in types
```

- [ ] **Step 2: Implement replanner service**

`app/services/replanner.py`:
- `replan(plan_id, disruption)` — builds CP-SAT model with:
  - Past weeks fixed (variables locked to current values)
  - Dead grids excluded (variable = 0 for all crops)
  - Original plan as solution hints
- Returns: new plan + replant options + deviation metrics

- [ ] **Step 3: Implement action queue generator**

`app/services/actions.py`:
- `generate_action_queue(plan, current_week)` — produces ActionItem list:
  - Transplant actions (seedlings ready from nursery)
  - Harvest actions (crops at end of cycle)
  - Seed nursery actions (future transplants need seeding now)
  - Sorted by priority (urgent > this-week > upcoming)

- [ ] **Step 4: Add API endpoints**

- `POST /plans/{plan_id}/advance-week` — increment current_week, update cell statuses
- `POST /plans/{plan_id}/disrupt` — create Disruption record
- `POST /plans/{plan_id}/replan` — call replanner, return new plan + options
- `GET /plans/{plan_id}/actions` — return action queue for current week

- [ ] **Step 5: Run tests**

Run: `cd growplan-api && python -m pytest tests/test_replanner.py tests/test_actions.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add growplan-api/app/services/replanner.py growplan-api/app/services/actions.py growplan-api/app/api/plans.py growplan-api/tests/
git commit -m "feat(living-plan): add advance week, disruption, replan, and action queue"
```

---

### Task 10: Nursery endpoint

**Files:**
- Modify: `growplan-api/app/api/plans.py` — add nursery endpoint

- [ ] **Step 1: Add nursery pipeline endpoint**

`GET /plans/{plan_id}/nursery` — returns nursery_occupancy array (already computed in postprocessing):
```python
@router.get("/{plan_id}/nursery")
def get_nursery(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(404, "Plan not found")
    batches = db.query(NurseryBatch).filter(NurseryBatch.plan_id == plan_id).all()
    occupancy = build_occupancy(batches, plan.farm.nursery_tray_count, plan.horizon_weeks)
    return {"plan_id": plan_id, "occupancy": occupancy, "batches": batches}
```

- [ ] **Step 2: Write and run tests**

```python
def test_nursery_returns_occupancy(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    gen = client.post("/plans/generate", json={...}).json()
    plan_id = gen["plan_id"]
    resp = client.get(f"/plans/{plan_id}/nursery")
    assert resp.status_code == 200
    data = resp.json()
    assert "occupancy" in data
    assert len(data["occupancy"]) > 0
    assert "trays_in_use" in data["occupancy"][0]
    assert "trays_available" in data["occupancy"][0]
```

Note: The work schedule endpoint is deferred to a future phase. The current frontend already handles schedule grouping client-side in `WorkSchedulePage.tsx`. The backend action queue (`GET /plans/{plan_id}/actions`) provides the raw data the frontend needs.

- [ ] **Step 3: Commit**

```bash
git add growplan-api/app/api/plans.py growplan-api/tests/
git commit -m "feat(api): add nursery pipeline endpoint"
```

---

## Chunk 6: Cost Modeling + Demand Forecasting

### Task 11: Cost service

**Files:**
- Create: `growplan-api/app/services/cost.py`
- Create: `growplan-api/tests/test_cost.py`
- Create: `growplan-api/app/schemas/cost.py`

- [ ] **Step 1: Write cost tests**

```python
# tests/test_cost.py
from app.services.cost import calculate_weekly_costs

def test_calculate_labor_cost():
    actions = [{"type": "transplant", "minutes_per_grid": 8, "grids": 3},
               {"type": "harvest", "minutes_per_grid": 10, "grids": 2}]
    result = calculate_weekly_costs(actions=actions, allocations=[...],
                                     farm_config={...}, crops=[...])
    assert result["labor"] > 0
    assert result["total"] > 0
    assert result["margin_pct"] >= 0

def test_cost_with_multiple_crops():
    actions = [
        {"type": "transplant", "minutes_per_grid": 8, "grids": 3},
        {"type": "harvest", "minutes_per_grid": 10, "grids": 2},
        {"type": "seed-nursery", "minutes_per_grid": 5, "grids": 1},
    ]
    allocations = [
        {"crop_id": "lettuce", "grids_allocated": 24},
        {"crop_id": "basil", "grids_allocated": 24},
    ]
    farm_config = {"nursery_tray_count": 30, "hourly_rate": 15.0, "base_energy_weekly": 20.0, "energy_per_grid": 0.50, "energy_per_tray": 0.10}
    crops = [
        {"id": "lettuce", "seedlings_per_grid": 20, "nutrient_cost_per_grid_week": 0.10, "cost_per_seedling": 0.02},
        {"id": "basil", "seedlings_per_grid": 25, "nutrient_cost_per_grid_week": 0.08, "cost_per_seedling": 0.03},
    ]
    result = calculate_weekly_costs(actions=actions, allocations=allocations,
                                     farm_config=farm_config, crops=crops)
    assert result["labor"] > 0
    assert result["nutrients"] > 0
    assert result["energy"] > 0
    assert result["seeds"] > 0
    assert result["total"] == result["labor"] + result["nutrients"] + result["energy"] + result["seeds"]
```

- [ ] **Step 2: Implement cost service**

`app/services/cost.py`:
- `calculate_weekly_costs(actions, allocations, farm_config, crops)` — returns:
  - labor: sum of (task minutes / 60) × hourly rate
  - nutrients: sum of grids × crop.nutrient_cost_per_grid_week
  - energy: base_weekly + (grids × per_grid) + (nursery_trays × per_tray)
  - seeds: sum of seedlings × cost_per_seedling
  - total, profit (= revenue - total), margin_pct

- [ ] **Step 3: Add `GET /plans/{plan_id}/costs` endpoint**

- [ ] **Step 4: Run tests and commit**

```bash
git add growplan-api/app/services/cost.py growplan-api/tests/test_cost.py growplan-api/app/api/plans.py
git commit -m "feat(costs): add weekly cost modeling with labor, nutrients, energy, seeds"
```

---

### Task 12: Forecast service

**Files:**
- Create: `growplan-api/app/services/forecast.py`
- Create: `growplan-api/tests/test_forecast.py`

- [ ] **Step 1: Write forecast tests**

```python
# tests/test_forecast.py
from app.services.forecast import moving_average, exponential_smoothing

def test_moving_average():
    history = [{"week": 1, "crop_id": "lettuce", "kg_sold": 10},
               {"week": 2, "crop_id": "lettuce", "kg_sold": 12},
               {"week": 3, "crop_id": "lettuce", "kg_sold": 11},
               {"week": 4, "crop_id": "lettuce", "kg_sold": 13}]
    result = moving_average(history, crop_id="lettuce", weeks=4)
    assert abs(result - 11.5) < 0.1

def test_exponential_smoothing():
    history = [...8 weeks of data...]
    result = exponential_smoothing(history, crop_id="lettuce", alpha=0.3)
    assert result > 0
    assert isinstance(result, float)
```

- [ ] **Step 2: Implement forecast service**

`app/services/forecast.py`:
- `moving_average(history, crop_id, weeks)` — simple 4-week moving average
- `exponential_smoothing(history, crop_id, alpha)` — weighted recent data
- `forecast_demand(history, crop_id)` — picks model based on data length

Phase 1: moving average only. Exponential smoothing and seasonal come when real data exists.

- [ ] **Step 3: Run tests and commit**

```bash
git add growplan-api/app/services/forecast.py growplan-api/tests/test_forecast.py
git commit -m "feat(forecast): add demand forecasting with moving average"
```

---

## Chunk 7: Deployment + Frontend Integration

### Task 13: Docker deployment

**Files:**
- Create: `growplan-api/Dockerfile`
- Create: `growplan-api/docker-compose.yml`
- Create: `growplan-api/nginx.conf`

- [ ] **Step 1: Create Dockerfile**

Multi-stage: builder installs deps, runtime copies app. Python 3.12-slim base.

- [ ] **Step 2: Create docker-compose.yml**

5 services: nginx, fastapi (gunicorn + uvicorn), rq-worker, redis, postgres.
Volumes for postgres data persistence.

- [ ] **Step 3: Create nginx.conf**

Reverse proxy: `/api/` → fastapi:8000, `/` → static React files.

- [ ] **Step 4: Test Docker build**

Run: `cd growplan-api && docker compose build`
Expected: All services build without errors

- [ ] **Step 5: Commit**

```bash
git add growplan-api/Dockerfile growplan-api/docker-compose.yml growplan-api/nginx.conf
git commit -m "feat(deploy): add Docker Compose configuration with nginx, FastAPI, RQ worker, Redis, PostgreSQL"
```

---

### Task 14: Frontend API client

**Files:**
- Create: `growplan-web/src/lib/api.ts`

- [ ] **Step 1: Create typed API client with offline fallback**

```typescript
// src/lib/api.ts
import { generatePlanData } from './planGenerator'
import type { CropId, GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-key-change-in-production'

let backendAvailable = true

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
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
    throw new Error(body.error?.message ?? `API error ${resp.status}`)
  }
  return resp.json()
}

export function isBackendAvailable(): boolean {
  return backendAvailable
}

export async function generatePlan(
  params: { farm: SetupFarmData; selectedCropIds: CropId[]; goalData: GoalData },
  farmId?: string,
): Promise<{ planId: string | null; plan: GeneratedPlanData; usedBackend: boolean }> {
  if (!backendAvailable || !farmId) {
    const plan = generatePlanData({
      farm: params.farm,
      selectedCropIds: params.selectedCropIds,
      goalData: params.goalData,
    })
    return { planId: null, plan, usedBackend: false }
  }

  try {
    const job = await apiFetch<{ plan_id: string; status: string }>(
      `/plans/generate`,
      { method: 'POST', body: JSON.stringify({ farm_id: farmId, selected_crop_ids: params.selectedCropIds, goal: params.goalData }) },
    )
    // Poll until complete
    let status = job.status
    while (status === 'solving') {
      await new Promise((r) => setTimeout(r, 500))
      const s = await apiFetch<{ status: string }>(`/plans/${job.plan_id}/status`)
      status = s.status
    }
    const plan = await apiFetch<GeneratedPlanData>(`/plans/${job.plan_id}`)
    return { planId: job.plan_id, plan, usedBackend: true }
  } catch {
    backendAvailable = false
    const plan = generatePlanData({
      farm: params.farm,
      selectedCropIds: params.selectedCropIds,
      goalData: params.goalData,
    })
    return { planId: null, plan, usedBackend: false }
  }
}

export async function getPlan(planId: string): Promise<GeneratedPlanData> {
  return apiFetch<GeneratedPlanData>(`/plans/${planId}`)
}

export async function confirmPlan(planId: string): Promise<void> {
  await apiFetch(`/plans/${planId}/confirm`, { method: 'POST' })
}

export async function advanceWeek(planId: string): Promise<GeneratedPlanData> {
  return apiFetch<GeneratedPlanData>(`/plans/${planId}/advance-week`, { method: 'POST' })
}

export async function reportDisruption(
  planId: string, disruption: { type: string; grid_indexes: number[]; crop_id: CropId; week: number; description: string },
): Promise<void> {
  await apiFetch(`/plans/${planId}/disrupt`, { method: 'POST', body: JSON.stringify(disruption) })
}

export async function replan(planId: string): Promise<{ replanned_plan: GeneratedPlanData; replant_options: unknown[] }> {
  return apiFetch(`/plans/${planId}/replan`, { method: 'POST' })
}

export async function getActions(planId: string): Promise<unknown[]> {
  return apiFetch(`/plans/${planId}/actions`)
}

export async function getCosts(planId: string): Promise<unknown> {
  return apiFetch(`/plans/${planId}/costs`)
}

export async function createFarm(data: SetupFarmData): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/farms', {
    method: 'POST',
    body: JSON.stringify({
      name: data.farmName,
      rows: data.rows,
      columns: data.columns,
      growing_system: data.growingSystem,
      nursery_tray_count: data.nurseryTrayCount,
      nursery_tray_cells: data.nurseryTrayCells,
      nursery_buffer_pct: data.nurseryBufferPct ?? 10,
    }),
  })
}
```

Note: The existing `planGenerator.ts` is kept as the offline fallback. The API client wraps it — when the backend is unreachable, it falls back to client-side generation and sets `backendAvailable = false`. The frontend can check `isBackendAvailable()` to show a "Running in offline mode" indicator.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd growplan-web && npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add growplan-web/src/lib/api.ts
git commit -m "feat(frontend): add typed API client for backend optimization engine"
```

---

### Task 15: Integration test — full flow

**Files:**
- Create: `growplan-api/tests/test_integration.py`

- [ ] **Step 1: Write end-to-end integration test**

```python
# tests/test_integration.py
from app.models.crop import Crop

FARM_DATA = {
    "name": "Integration Farm", "location": "Bangkok", "rows": 4, "columns": 12,
    "growing_system": "hydroponic", "nursery_tray_count": 30,
    "nursery_tray_cells": 200, "nursery_buffer_pct": 10
}

def seed_crops(db_session):
    db_session.add(Crop(
        id="lettuce", name="Lettuce", category="Leafy Green", icon="🥬", accent="#48bb78",
        weeks_on_panel=6, nursery_lead_weeks=2, yield_per_grid=2.0, price_per_kg=3.0,
        seedlings_per_grid=20, tray_cell_count=200, germination_rate=0.95,
        prefers_edge=True, edge_weight=0.7, neighbor_bonus=0.8,
        nutrient_cost_per_grid_week=0.10, cost_per_seedling=0.02
    ))
    db_session.add(Crop(
        id="basil", name="Basil", category="Herb", icon="🌿", accent="#38a169",
        weeks_on_panel=5, nursery_lead_weeks=2, yield_per_grid=1.5, price_per_kg=4.0,
        seedlings_per_grid=25, tray_cell_count=200, germination_rate=0.90,
        prefers_edge=False, edge_weight=0.5, neighbor_bonus=1.0,
        nutrient_cost_per_grid_week=0.08, cost_per_seedling=0.03
    ))
    db_session.commit()

def test_full_plan_lifecycle(client, db_session):
    seed_crops(db_session)

    # 1. Create farm
    farm = client.post("/farms", json=FARM_DATA).json()
    assert farm["id"] is not None

    # 2. List crops
    crops = client.get("/crops").json()
    assert len(crops) >= 2

    # 3. Generate plan
    plan_job = client.post("/plans/generate", json={
        "farm_id": farm["id"],
        "selected_crop_ids": [crops[0]["id"], crops[1]["id"]],
        "goal": {"planning_horizon_weeks": 8, "priority": "maximize-revenue",
                 "commitments": {"lettuce": {"enabled": False, "min_kg_per_week": 0},
                                 "basil": {"enabled": False, "min_kg_per_week": 0}}}
    }).json()
    assert plan_job["status"] == "solving"
    plan_id = plan_job["plan_id"]

    # 4. Get full plan (synchronous in test mode)
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "completed"
    assert len(plan["cells"]) == 48  # 4x12 farm
    assert plan["revenue"]["total_per_week"] > 0

    # 5. Confirm plan
    client.post(f"/plans/{plan_id}/confirm")
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "confirmed"

    # 6. Get actions
    actions = client.get(f"/plans/{plan_id}/actions").json()
    assert len(actions) > 0

    # 7. Advance week
    client.post(f"/plans/{plan_id}/advance-week")

    # 8. Report disruption
    client.post(f"/plans/{plan_id}/disrupt", json={
        "type": "crop-death", "grid_indexes": [0, 1],
        "crop_id": crops[0]["id"], "week": 2,
        "description": "Test disruption"
    })

    # 9. Replan
    replan_result = client.post(f"/plans/{plan_id}/replan").json()
    assert "replanned_plan" in replan_result

    # 10. Get costs
    costs = client.get(f"/plans/{plan_id}/costs").json()
    assert costs["total"] > 0
    assert costs["profit"] is not None
```

- [ ] **Step 2: Run integration test**

Run: `cd growplan-api && python -m pytest tests/test_integration.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add growplan-api/tests/test_integration.py
git commit -m "test(integration): add full lifecycle test — create farm through replan"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | Tasks 1-3 | Project scaffold, SQLAlchemy models, Alembic migrations, crop seed data |
| 2 | Tasks 4-5 | Pydantic schemas, Farm CRUD API, Crop listing API |
| 3 | Tasks 6-7 | CP-SAT solver engine, post-processing, nursery scheduling |
| 4 | Task 8 | Plan generation/status/retrieval/confirmation endpoints, RQ worker |
| 5 | Tasks 9-10 | Advance week, disruption, replanning, action queue, nursery endpoint |
| 6 | Tasks 11-12 | Cost modeling service, demand forecasting |
| 7 | Tasks 13-15 | Docker deployment, frontend API client, full integration test |

**Estimated total:** ~15 commits, each producing working, testable software.
