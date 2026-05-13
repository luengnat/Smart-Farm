import { cropLibrary, type CropId } from '../constants/crops'
import type {
  AnalyticsData,
  CropComparisonData,
  GeneratedPlanData,
  GoalData,
  HistoryData,
  PlanSummary,
  SetupFarmData,
  TimelineData,
} from '../types/planning'

const API_BASE = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

function getToken(): string | null {
  return sessionStorage.getItem('gp_token')
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    const message = body.error?.message ?? body.detail ?? `API error ${resp.status}`
    if (resp.status === 401) {
      sessionStorage.removeItem('gp_token')
      window.location.reload()
    }
    throw new Error(message)
  }
  return resp.json()
}

export { apiFetch }

export async function generatePlan(
  params: { farm: SetupFarmData; selectedCropIds: CropId[]; goalData: GoalData },
  farmId?: number,
): Promise<{ planId: number | null; plan: GeneratedPlanData }> {
  if (!farmId) {
    throw new Error('Farm ID required to generate plan')
  }

  const commitments: Record<string, { enabled: boolean; minKgPerWeek: number; reservePercent: number }> = {}
  for (const [id, goal] of Object.entries(params.goalData.cropGoals)) {
    commitments[id] = { enabled: goal.targetPerWeek > 0, minKgPerWeek: goal.targetPerWeek, reservePercent: goal.reservePercent }
  }

  const horizonWeeks = parseInt(params.goalData.planningHorizon, 10) || 8

  const resp = await apiFetch<{ planId: number; status: string; pollUrl: string }>('/plans/generate', {
    method: 'POST',
    body: JSON.stringify({
      farmId,
      selectedCropIds: params.selectedCropIds,
      goal: {
        planningHorizonWeeks: horizonWeeks,
        priority: params.goalData.priority,
        commitments,
      },
    }),
  })

  const plan = await pollForPlan(resp.planId)
  return { planId: resp.planId, plan }
}

async function pollForPlan(planId: number, maxAttempts = 30, intervalMs = 500): Promise<GeneratedPlanData> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await apiFetch<{ planId: number; status: string }>(`/plans/${planId}/status`)
    if (status.status === 'completed' || status.status === 'confirmed') {
      return fetchPlan(planId)
    }
    if (status.status === 'failed') {
      throw new Error('Plan generation failed')
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error('Plan generation timed out')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPlan(planId: number): Promise<GeneratedPlanData> {
  const data = await apiFetch<Record<string, any>>(`/plans/${planId}`)
  const rows = data.rows ?? 0
  const columns = data.columns ?? 0
  const levels = data.levels ?? 1
  const totalGrids = rows * columns * levels
  const rawCells = data.cells ?? []

  // Build full-sized grid: place assigned cells at their correct index positions,
  // fill unassigned positions with empty placeholders.
  // Track valid cells (within index bounds) for timeline/nursery computations.
  const emptyCell = { cropId: '' as const, color: '#1e2030', label: '', weekStarted: 0, weekHarvestExpected: 0, status: 'empty' }
  const cells: typeof emptyCell[] = Array.from({ length: totalGrids }, () => ({ ...emptyCell }))
  const validRawCells: typeof rawCells = []
  for (const c of rawCells) {
    const idx: number = c.index ?? c.cell_index ?? 0
    if (idx < 0 || idx >= totalGrids) continue
    validRawCells.push(c)
    const crop = cropLibrary.find((cr) => cr.id === (c.cropId ?? c.crop_id))
    cells[idx] = {
      cropId: (c.cropId ?? c.crop_id ?? '') as CropId | '',
      color: crop?.accent ?? '#6b7280',
      label: crop?.name ?? c.cropId ?? c.crop_id ?? '',
      weekStarted: c.weekStarted ?? c.week_started ?? 0,
      weekHarvestExpected: c.weekHarvestExpected ?? c.week_harvest_expected ?? 0,
      status: c.status ?? 'planned',
    }
  }
  const rawAllocations: Record<string, any>[] = data.allocations ?? []
  const allocations = rawAllocations.map((a) => ({
    cropId: (a.cropId ?? a.crop_id ?? '') as string,
    gridsAllocated: (a.gridsAllocated ?? a.grids_allocated ?? 0) as number,
    reservePercent: (a.reservePercent ?? a.reserve_percent ?? 0) as number,
  }))
  const totalAllocated = allocations.reduce((sum, a) => sum + a.gridsAllocated, 0)
  const revenue = data.revenue
  const totalRevenue = typeof revenue === 'number'
    ? revenue
    : (revenue?.totalPerWeek ?? revenue?.total_per_week ?? revenue?.totalRevenuePerWeek ?? revenue?.total_revenue_per_week ?? data.totalRevenue ?? data.total_revenue ?? 0)

  // Compute timeline rows from valid cell data (index-bounds-filtered)
  const cropTimelines = new Map<string, { minWeek: number; maxHarvest: number; count: number }>()
  for (const c of validRawCells) {
    const cid = (c.cropId ?? c.crop_id ?? '') as string
    const ws = (c.weekStarted ?? c.week_started ?? 0) as number
    const wh = (c.weekHarvestExpected ?? c.week_harvest_expected ?? 0) as number
    const existing = cropTimelines.get(cid)
    if (!existing) {
      cropTimelines.set(cid, { minWeek: ws, maxHarvest: wh, count: 1 })
    } else {
      existing.minWeek = Math.min(existing.minWeek, ws)
      existing.maxHarvest = Math.max(existing.maxHarvest, wh)
      existing.count++
    }
  }

  const timelineRows = Array.from(cropTimelines.entries()).map(([cropId, tl]) => {
    const crop = cropLibrary.find((cr) => cr.id === cropId)
    const growWeeks = tl.maxHarvest - tl.minWeek
    const seedWeek = Math.max(1, tl.minWeek - (crop?.nurseryLeadWeeks ?? 2))
    return {
      cropId: cropId as CropId,
      label: crop?.name ?? cropId,
      color: crop?.accent ?? '#6b7280',
      seedWeek,
      transplantWeek: tl.minWeek,
      growWeeks: growWeeks > 0 ? growWeeks : 4,
      harvestWeek: tl.maxHarvest,
    }
  })

  // Compute nursery schedule from timeline
  const nurserySchedule = timelineRows.map((tr) => {
    const crop = cropLibrary.find((cr) => cr.id === tr.cropId)
    const alloc = allocations.find((a) => a.cropId === tr.cropId)
    const seedlings = (alloc?.gridsAllocated ?? 0) * (crop?.seedlingsPerGrid ?? 6)
    return {
      cropId: tr.cropId,
      label: tr.label,
      color: tr.color,
      seedWeek: tr.seedWeek,
      transplantWeek: tr.transplantWeek,
      seedlings,
      status: 'Scheduled' as const,
    }
  })

  const nurseryCapacity = (data.nurseryTrayCount ?? data.nursery_tray_count ?? 1) * (data.nurseryTrayCells ?? data.nursery_tray_cells ?? 200)
  const horizonWeeks = data.horizonWeeks ?? data.horizon_weeks ?? 8
  const nurseryLoad = Array.from({ length: horizonWeeks }, (_, i) => {
    const week = i + 1
    let active = 0
    for (const batch of nurserySchedule) {
      if (week >= batch.seedWeek && week < batch.transplantWeek) {
        active += batch.seedlings
      }
    }
    const pct = nurseryCapacity > 0 ? Math.round((active / nurseryCapacity) * 100) : 0
    return {
      week,
      activeSeedlings: active,
      capacity: nurseryCapacity,
      utilizationPercent: pct,
      risk: (pct > 90 ? 'High' : pct > 70 ? 'Medium' : 'Low') as 'Low' | 'Medium' | 'High',
    }
  })

  return {
    rows,
    columns,
    levels,
    currentWeek: data.currentWeek ?? data.current_week ?? 1,
    cells,
    utilizationPercent: totalGrids > 0 ? Math.round((totalAllocated / totalGrids) * 100) : 0,
    requiredCapacity: totalAllocated,
    availableCapacity: totalGrids,
    stockoutRisk: (data.stockoutRisk ?? data.stockout_risk ?? 'Low') as 'Low' | 'Medium' | 'High',
    seedlingCapacityRisk: (data.seedlingCapacityRisk ?? data.seedling_capacity_risk ?? (nurseryLoad.some(w => w.risk === 'High') ? 'High' : nurseryLoad.some(w => w.risk === 'Medium') ? 'Medium' : 'Low')) as 'Low' | 'Medium' | 'High',
    expectedRevenue: totalRevenue,
    cropSummaries: allocations.map((a) => {
      const crop = cropLibrary.find((cr) => cr.id === a.cropId)
      return {
        cropId: a.cropId,
        label: crop?.name ?? a.cropId,
        color: crop?.accent ?? '#6b7280',
        allocatedCells: a.gridsAllocated,
        targetPerWeek: crop ? a.gridsAllocated * (crop.yieldPerGrid ?? 0) : 0,
        reservePercent: (a.reservePercent ?? a.reserve_percent ?? 0) as number,
        seedlingsPerWeek: crop ? a.gridsAllocated * (crop.seedlingsPerGrid ?? 6) : 0,
      }
    }),
    timelineRows,
    nurserySchedule,
    nurseryLoad,
  }
}

export async function fetchFarm(id: number): Promise<SetupFarmData> {
  const data = await apiFetch<Record<string, unknown>>(`/farms/${id}`)
  const rows = (data.rows as number) || 10
  const columns = (data.columns as number) || 12
  const levels = (data.levels as number) || 1
  const d = data as Record<string, any>
  return {
    farmName: (data.name as string) || '',
    farmLocation: (data.location as string) || '',
    rows,
    columns,
    levels,
    growingSystem: (d.growingSystem ?? d.growing_system as string) || 'Hydroponic NFT',
    nurseryCapacity: ((d.nurseryTrayCount ?? d.nursery_tray_count as number) || 1) * ((d.nurseryTrayCells ?? d.nursery_tray_cells as number) || 200),
    seedlingLeadDays: (d.seedlingLeadDays ?? d.seedling_lead_days as number) || 14,
    lightingZones: (d.lightingZones ?? d.lighting_zones as number) || 3,
    irrigationZones: (d.irrigationZones ?? d.irrigation_zones as number) || 2,
    lightingAssignments: (d.lightingAssignments ?? d.lighting_assignments as unknown[]) ?? [],
    irrigationAssignments: (d.irrigationAssignments ?? d.irrigation_assignments as unknown[]) ?? [],
  }
}

export async function saveFarm(data: SetupFarmData): Promise<{ id: number }> {
  const nurseryTrayCount = Math.ceil(data.nurseryCapacity / 200) || 1
  const nurseryTrayCells = data.nurseryCapacity > 0
    ? Math.ceil(data.nurseryCapacity / nurseryTrayCount)
    : 200
  return apiFetch<{ id: number }>('/farms', {
    method: 'POST',
    body: JSON.stringify({
      name: data.farmName,
      location: data.farmLocation,
      rows: data.rows,
      columns: data.columns,
      levels: data.levels,
      growingSystem: data.growingSystem,
      nurseryTrayCount,
      nurseryTrayCells,
      nurseryBufferPercent: 10,
      seedlingLeadDays: data.seedlingLeadDays,
      lightingZones: data.lightingZones,
      irrigationZones: data.irrigationZones,
      lightingAssignments: data.lightingAssignments,
      irrigationAssignments: data.irrigationAssignments,
    }),
  })
}

export async function updateFarm(id: number, data: Partial<SetupFarmData>): Promise<SetupFarmData> {
  const payload: Record<string, unknown> = {}
  if (data.farmName !== undefined) payload.name = data.farmName
  if (data.farmLocation !== undefined) payload.location = data.farmLocation
  if (data.rows !== undefined) payload.rows = data.rows
  if (data.columns !== undefined) payload.columns = data.columns
  if (data.levels !== undefined) payload.levels = data.levels
  if (data.growingSystem !== undefined) payload.growingSystem = data.growingSystem
  if (data.nurseryCapacity !== undefined) {
    const trayCount = Math.ceil(data.nurseryCapacity / 200) || 1
    payload.nurseryTrayCount = trayCount
    payload.nurseryTrayCells = data.nurseryCapacity > 0
      ? Math.ceil(data.nurseryCapacity / trayCount)
      : 200
  }
  if (data.seedlingLeadDays !== undefined) payload.seedlingLeadDays = data.seedlingLeadDays
  if (data.lightingZones !== undefined) payload.lightingZones = data.lightingZones
  if (data.irrigationZones !== undefined) payload.irrigationZones = data.irrigationZones
  if (data.lightingAssignments !== undefined) payload.lightingAssignments = data.lightingAssignments
  if (data.irrigationAssignments !== undefined) payload.irrigationAssignments = data.irrigationAssignments
  const result = await apiFetch<Record<string, unknown>>(`/farms/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return result as unknown as SetupFarmData
}

export async function fetchAnalytics(planId: number): Promise<AnalyticsData> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/analytics`)
  return {
    revenueByWeek: d.revenueByWeek ?? d.revenue_by_week ?? [],
    costByWeek: d.costByWeek ?? d.cost_by_week ?? [],
    profitByWeek: d.profitByWeek ?? d.profit_by_week ?? [],
    cumulativeRevenue: d.cumulativeRevenue ?? d.cumulative_revenue ?? 0,
    cumulativeCost: d.cumulativeCost ?? d.cumulative_cost ?? 0,
    cumulativeProfit: d.cumulativeProfit ?? d.cumulative_profit ?? 0,
  }
}

export async function fetchTimeline(planId: number): Promise<TimelineData> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/timeline`)
  const rawCrops: Record<string, any>[] = d.crops ?? []
  const crops: TimelineData['crops'] = rawCrops.map((c) => ({
    cropId: c.cropId ?? c.crop_id ?? '',
    cropName: c.cropName ?? c.crop_name ?? '',
    color: c.color ?? '#6b7280',
    intervals: (c.intervals ?? []).map((iv: Record<string, any>) => ({
      cellIndex: iv.cellIndex ?? iv.cell_index ?? 0,
      startWeek: iv.startWeek ?? iv.start_week ?? 1,
      endWeek: iv.endWeek ?? iv.end_week ?? 1,
      phase: iv.phase ?? 'growing',
    })),
  }))
  return {
    crops,
    currentWeek: d.currentWeek ?? d.current_week ?? 1,
    horizonWeeks: d.horizonWeeks ?? d.horizon_weeks ?? 8,
  }
}

export async function fetchHistory(planId: number, page = 1): Promise<HistoryData> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/history?page=${page}`)
  const rawSnaps: Record<string, any>[] = d.snapshots ?? []
  const snapshots = rawSnaps.map((s) => ({
    id: s.id ?? 0,
    snapshotType: (s.snapshotType ?? s.snapshot_type ?? 'confirmed').replace(/_/g, '-'),
    totalGrids: s.totalGrids ?? s.total_grids ?? 0,
    cropCount: s.cropCount ?? s.crop_count ?? 0,
    revenuePerWeek: s.revenuePerWeek ?? s.revenue_per_week ?? 0,
    createdAt: s.createdAt ?? s.created_at ?? '',
  }))
  return {
    snapshots,
    total: d.total ?? 0,
    page: d.page ?? 1,
    limit: d.limit ?? 20,
  }
}

export async function fetchCropComparison(planId: number): Promise<CropComparisonData> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/compare`)
  const rawCrops: Record<string, any>[] = d.crops ?? []
  const crops: CropComparisonData['crops'] = rawCrops.map((c) => ({
    cropId: c.cropId ?? c.crop_id ?? '',
    cropName: c.cropName ?? c.crop_name ?? '',
    color: c.color ?? '#6b7280',
    metrics: {
      revenuePerGridWeek: c.metrics?.revenuePerGridWeek ?? c.metrics?.revenue_per_grid_week ?? 0,
      costPerGridWeek: c.metrics?.costPerGridWeek ?? c.metrics?.cost_per_grid_week ?? 0,
      netMarginPerGridWeek: c.metrics?.netMarginPerGridWeek ?? c.metrics?.net_margin_per_grid_week ?? 0,
      marginPct: c.metrics?.marginPct ?? c.metrics?.margin_pct ?? 0,
      cycleWeeks: c.metrics?.cycleWeeks ?? c.metrics?.cycle_weeks ?? 0,
      nurseryTraysPerCycle: c.metrics?.nurseryTraysPerCycle ?? c.metrics?.nursery_trays_per_cycle ?? 0,
      seedCostPerCycle: c.metrics?.seedCostPerCycle ?? c.metrics?.seed_cost_per_cycle ?? 0,
    },
    radarScores: {
      revenue: c.radarScores?.revenue ?? c.radar_scores?.revenue ?? 0,
      speed: c.radarScores?.speed ?? c.radar_scores?.speed ?? 0,
      yield: c.radarScores?.yield ?? c.radar_scores?.yield ?? 0,
      price: c.radarScores?.price ?? c.radar_scores?.price ?? 0,
      ease: c.radarScores?.ease ?? c.radar_scores?.ease ?? 0,
    },
  }))
  return {
    crops,
    recommended: d.recommended ?? '',
  }
}

export async function exportPlan(planId: number): Promise<Blob> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(`${API_BASE}/plans/${planId}/export`, { headers })
  if (!resp.ok) {
    if (resp.status === 401) {
      sessionStorage.removeItem('gp_token')
      window.location.reload()
    }
    throw new Error(`Export failed: ${resp.status}`)
  }
  return resp.blob()
}

export async function fetchFarmPlans(farmId: number): Promise<{ plans: PlanSummary[] }> {
  const d = await apiFetch<Record<string, any>>(`/farms/${farmId}/plans`)
  const rawPlans: Record<string, any>[] = d.plans ?? []
  const plans: PlanSummary[] = rawPlans.map((p) => ({
    id: p.id ?? 0,
    status: p.status ?? '',
    horizonWeeks: p.horizonWeeks ?? p.horizon_weeks ?? 8,
    currentWeek: p.currentWeek ?? p.current_week ?? 1,
    goalPriority: p.goalPriority ?? p.goal_priority ?? '',
    selectedCrops: p.selectedCrops ?? p.selected_crops ?? [],
    revenueTotal: p.revenueTotal ?? p.revenue_total ?? null,
    createdAt: p.createdAt ?? p.created_at ?? '',
  }))
  return { plans }
}

export interface ActionItem {
  id: number
  type: string
  priority: string
  week: number
  cropId: string | null
  gridIndexes: number[] | null
  description: string
  revenueImpact: number
  batchId: string | null
  completed: boolean
}

export async function fetchActions(planId: number): Promise<{ actions: ActionItem[]; currentWeek: number }> {
  const data = await apiFetch<Record<string, any>>(`/plans/${planId}/actions`)
  const rawActions: Record<string, any>[] = data.actions ?? []
  const actions: ActionItem[] = rawActions.map((a) => ({
    id: (a.id ?? 0) as number,
    type: (a.type ?? '').replace(/_/g, '-') as string,
    priority: (a.priority ?? '').replace(/_/g, '-') as string,
    week: (a.week ?? 1) as number,
    cropId: (a.cropId ?? a.crop_id ?? null) as string | null,
    gridIndexes: (a.gridIndexes ?? a.grid_indexes ?? null) as number[] | null,
    description: (a.description ?? '') as string,
    revenueImpact: (a.revenueImpact ?? a.revenue_impact ?? 0) as number,
    batchId: (a.batchId ?? a.batch_id ?? null) as string | null,
    completed: (a.completed ?? false) as boolean,
  }))
  return { actions, currentWeek: data.currentWeek ?? data.current_week ?? 1 }
}

export async function completeAction(planId: number, actionId: number): Promise<{ id: number; completed: boolean }> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/actions/${actionId}`, {
    method: 'PATCH',
  })
  return {
    id: d.id ?? 0,
    completed: d.completed ?? false,
  }
}

export async function advanceWeek(planId: number): Promise<{ currentWeek: number }> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/advance-week`, {
    method: 'POST',
  })
  return {
    currentWeek: d.currentWeek ?? d.current_week ?? 1,
  }
}

export async function confirmPlan(planId: number): Promise<{ id: number; status: string }> {
  const d = await apiFetch<Record<string, any>>(`/plans/${planId}/confirm`, {
    method: 'POST',
  })
  return {
    id: d.id ?? 0,
    status: d.status ?? '',
  }
}
