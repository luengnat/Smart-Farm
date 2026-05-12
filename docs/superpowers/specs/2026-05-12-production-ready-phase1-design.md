# Production-Ready Phase 1: Auth + Real Data Flow

**Goal:** Transform the GrowPlan app from a demo prototype into a real product with user authentication, backend-only data flow, and polished UI.

**Architecture:** Add custom JWT auth (bcrypt + python-jose) to FastAPI with User and FarmMember models. Frontend replaces the client-side plan generator with API-only flow. Remove all demo artifacts (hardcoded defaults, offline fallback, employee mode). Phase 1 delivers single-user auth with farm-scoped data; Phase 2 (multi-farm) and Phase 3 (team roles) follow.

**Tech Stack:** FastAPI, SQLAlchemy, bcrypt/passlib, python-jose (backend) / React 19, TanStack React Query, react-hot-toast (frontend)

---

## 1. Backend Auth

### New Models

**User model** (`app/models/user.py`):
- id: int (PK)
- email: str (unique, indexed)
- hashed_password: str
- display_name: str
- created_at: datetime (server default)

**FarmMember model** (`app/models/farm_member.py`):
- id: int (PK)
- user_id: int (FK → users.id, CASCADE)
- farm_id: int (FK → farms.id, CASCADE)
- role: enum (`owner`, `manager`, `viewer`)
- unique constraint on (user_id, farm_id)
- Phase 1 constraint: only `owner` role is created. Backend rejects attempts to create non-owner FarmMember records. Phase 3 enables manager/viewer roles.

### Auth Endpoints

- `POST /auth/register` — body: {email, password, display_name} → returns {user, token}
  - Password validation: min 8 characters, enforced on backend (frontend mirrors rules)
  - Email validation: standard email format
- `POST /auth/login` — body: {email, password} → returns {user, token}
- `GET /auth/me` — Bearer token → returns current user

### Implementation Details

- Password hashing: passlib with bcrypt
- JWT: python-jose with HS256, 24h expiry
- Token payload: {sub: user_id, exp: timestamp}
- JWT secret from environment variable `GP_JWT_SECRET` (required, fail on missing). Generate with `openssl rand -hex 32`.
- Auth header: replaces the current `X-API-Key` demo header entirely. All protected endpoints use `Authorization: Bearer <token>`.
- Auth dependency: `get_current_user` FastAPI dependency that extracts Bearer token from Authorization header, validates JWT, returns User object
- All protected routes use `Depends(get_current_user)`

### Changes to Existing Endpoints

- `POST /farms` — requires auth. Creates farm AND adds user as `owner` in FarmMember
- `GET /farms/{id}` — requires auth. Verifies user has FarmMember record for this farm
- `GET /farms/{farm_id}/plans` — requires auth. Verifies farm access
- All `/plans/*` endpoints — require auth. Verify plan's farm is accessible to user via FarmMember join
- `/health` endpoint remains public (no auth)

### Migration

- `003_users_and_farm_members.py` — creates users and farm_members tables
- Adds user_id FK to farms table (nullable initially, set on new farm creation)
- **Data migration**: App is pre-production (no real user data). Migration creates a default system user (email from `GP_DEFAULT_USER_EMAIL` env var, or `admin@growplan.local`) and assigns all existing farms to that user. This allows existing test data to remain accessible during development.

---

## 2. Real Data Flow

### What Gets Removed

- `planGenerator.ts` — entire file deleted (383 lines)
- `generatePlan()` fallback path in api.ts — simplified to API-only
- `backendAvailable` module-level state and `checkBackendHealth()` / `isBackendAvailable()` — removed
- Offline banner and offline page gating logic from App.tsx — removed
- `generatePlanData` imports throughout the codebase

### Wizard Flow (API-Only)

1. **Setup Farm** — Empty form (no pre-filled demo data). On submit: `POST /farms` with auth token → stores `farmId` in state + localStorage. No client-side state generation.

2. **Select Crops** — Starts with nothing selected. User picks crops they want to grow. No pre-selection. Stores selection for next step.

3. **Define Goal** — Fresh defaults (8 weeks horizon, maximize-space). On submit: `POST /plans/generate` with farmId + selectedCropIds + goal. Shows loading spinner while polling `GET /plans/{id}/status`. Stores `planId` on completion.

4. **Confirm Plan** — Fetches plan from `GET /plans/{id}`. Displays real solver output. Confirm calls `POST /plans/{id}/confirm`.

5. **Dashboard** — Loads farm + plan data from backend using stored farmId/planId via React Query. Real loading states, real error states.

### State Management

- `farmId` and `planId` in localStorage (already exists)
- Remove `generatedPlan` local state — always fetch from API
- React Query `useQuery` for all data loading (already configured with QueryClient)
- Loading spinners on every page that fetches data
- Error states with retry buttons when API calls fail
- No offline mode — if backend is unreachable, show error with retry

---

## 3. Frontend Auth + UI Flow

### New Pages

- **LoginPage** — email/password form, link to register. Minimal, clean design.
- **RegisterPage** — email/password/display_name form, link to login.

### Auth Context

- `AuthContext` provides: `user`, `token`, `login(email, password)`, `register(email, password, displayName)`, `logout()`
- JWT stored in React state (in-memory only — not localStorage, prevents XSS token theft)
- `useAuth()` hook for consuming components
- On app load: check if user is authenticated by calling `GET /auth/me` with stored token
- If token missing or invalid → redirect to login
- Auth header attached to all API calls via interceptor in apiFetch

### App Flow Changes

- Remove `WelcomePage` as entry point (employer/employee split was demo-only)
- Entry point: `LoginPage` if not authenticated, `DashboardPage` if authenticated
- After login, check if user has farms:
  - No farm → redirect to `SetupFarmPage`
  - Has farm → redirect to `DashboardPage` with most recent farm/plan
- Remove `WorkSchedulePage` (employee mode) — demo-only, re-add in Phase 3

### UI Polish

- Remove all hardcoded defaults from `createInitialSetupFarmData()` — empty fields with placeholders
- Crop selection starts empty (user picks what they grow)
- Real loading spinners on all data-fetching pages
- Error states with retry buttons on API failures
- Toast notifications for success/error (already have react-hot-toast)
- Proper form validation on login/register/setup-farm forms

### What Gets Deleted

- `src/lib/planGenerator.ts` — entire file
- `src/pages/WelcomePage.tsx` — replaced by auth flow
- `src/pages/WorkSchedulePage.tsx` — demo-only, re-add in Phase 3
- `backendAvailable` / `checkBackendHealth` / `isBackendAvailable` from api.ts
- Offline banner logic from App.tsx
- All `generatePlanData` imports
- `createInitialSetupFarmData()` default values (function stays, values become empty/zero)

---

## 4. File Structure

### Backend — New Files
- `app/models/user.py` — User SQLAlchemy model
- `app/models/farm_member.py` — FarmMember SQLAlchemy model
- `app/api/auth.py` — Auth router (register, login, me)
- `app/core/security.py` — JWT creation, password hashing, get_current_user dependency
- `alembic/versions/003_users_and_farm_members.py` — Migration
- `tests/test_auth.py` — Auth endpoint tests

### Backend — Modified Files
- `app/models/__init__.py` — Add User, FarmMember imports
- `app/api/plans.py` — Add auth dependency to all endpoints
- `app/api/farms.py` — Add auth dependency, create FarmMember on farm creation
- `app/main.py` — Include auth router
- `app/config.py` — Add JWT_SECRET setting

### Frontend — New Files
- `src/contexts/AuthContext.tsx` — Auth provider, useAuth hook
- `src/pages/LoginPage.tsx` — Login form
- `src/pages/RegisterPage.tsx` — Register form
- `src/types/auth.ts` — User, LoginRequest, RegisterRequest, AuthResponse types

### Frontend — Deleted Files
- `src/lib/planGenerator.ts`
- `src/pages/WelcomePage.tsx`
- `src/pages/WorkSchedulePage.tsx`

### Frontend — Modified Files
- `src/lib/api.ts` — Remove fallback logic, add auth header interceptor, remove backendAvailable
- `src/App.tsx` — Auth-gated routing, remove offline logic, remove WelcomePage/WorkSchedulePage
- `src/pages/SetupFarmPage.tsx` — Empty defaults, API-only submission
- `src/pages/SelectCropsPage.tsx` — Empty initial selection
- `src/pages/DefineGoalPage.tsx` — API-only plan generation
- `src/pages/GeneratePlanPage.tsx` — Real polling with loading state
- `src/pages/ConfirmPlanPage.tsx` — Load from API
- `src/pages/DashboardPage.tsx` — React Query data loading
- `src/pages/AnalyticsPage.tsx` — Auth-gated
- `src/pages/CropComparisonPage.tsx` — Auth-gated
- `src/pages/PlanHistoryPage.tsx` — Auth-gated

---

## 5. Future Phases (Not In Scope)

**Phase 2 — Multi-Farm:** Users can create/switch between multiple farms. Farm list page. Farm switching in sidebar.

**Phase 3 — Team Collaboration:** Invite team members by email. Role-based permissions (owner can invite, manager can edit plans, viewer is read-only). Re-add WorkSchedulePage as team feature.

---

## 6. Testing Strategy

### Backend Tests
- Register endpoint: success, duplicate email, short password validation, invalid email
- Login endpoint: success, wrong password, non-existent user
- Auth middleware: valid token, expired token, missing token
- Farm access: owner can CRUD, non-member gets 403
- Plan access: scoped to user's farms only

### Frontend Tests
- Login form validation and submission
- Register form validation and submission
- Auth context: login sets user, logout clears user
- Protected routes redirect to login when unauthenticated
