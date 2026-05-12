import toast from 'react-hot-toast'
import type { CropId } from '../constants/crops'
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
    if (resp.status !== 401) {
      toast.error(message)
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

  const commitments: Record<string, { enabled: boolean; minKgPerWeek: number }> = {}
  for (const [id, goal] of Object.entries(params.goalData.cropGoals)) {
    commitments[id] = { enabled: goal.targetPerWeek > 0, minKgPerWeek: goal.targetPerWeek }
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
  const totalGrids = rows * columns
  const cells = (data.cells ?? []).map((c: Record<string, any>) => ({
    cropId: c.cropId ?? '',
    color: '',
    label: c.cropId ?? '',
  }))
  const allocations = data.allocations ?? []
  const totalAllocated = allocations.reduce((sum: number, a: Record<string, any>) => sum + (a.gridsAllocated ?? 0), 0)
  const revenue = data.revenue
  const totalRevenue = revenue?.totalPerWeek ?? revenue?.totalRevenuePerWeek ?? 0

  return {
    rows,
    columns,
    cells,
    utilizationPercent: totalGrids > 0 ? Math.round((totalAllocated / totalGrids) * 100) : 0,
    requiredCapacity: totalAllocated,
    availableCapacity: totalGrids,
    stockoutRisk: 'Low' as const,
    seedlingCapacityRisk: 'Low' as const,
    expectedRevenue: totalRevenue,
    cropSummaries: allocations.map((a: Record<string, any>) => ({
      cropId: a.cropId,
      label: a.cropId,
      color: '',
      allocatedCells: a.gridsAllocated,
      targetPerWeek: 0,
      reservePercent: 0,
      seedlingsPerWeek: 0,
    })),
    timelineRows: [],
    nurserySchedule: [],
    nurseryLoad: [],
  }
}

export async function fetchFarm(id: number): Promise<SetupFarmData> {
  const data = await apiFetch<Record<string, unknown>>(`/farms/${id}`)
  return {
    farmName: data.name as string,
    farmLocation: (data.location as string) || '',
    rows: data.rows as number,
    columns: data.columns as number,
    growingSystem: (data.growingSystem as string) || 'hydroponic',
    nurseryCapacity: (data.nurseryTrayCount as number) * (data.nurseryTrayCells as number) || 200,
    seedlingLeadDays: 14,
    lightingZones: 3,
    irrigationZones: 2,
    lightingAssignments: [],
    irrigationAssignments: [],
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
      nurseryTrayCount: Math.ceil(data.nurseryCapacity / 200) || 1,
      nurseryTrayCells: 200,
      nurseryBufferPercent: 10,
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
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(`${API_BASE}/plans/${planId}/export`, { headers })
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`)
  return resp.blob()
}

export async function fetchFarmPlans(farmId: number): Promise<{ plans: PlanSummary[] }> {
  return apiFetch<{ plans: PlanSummary[] }>(`/farms/${farmId}/plans`)
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
  return apiFetch<{ actions: ActionItem[]; currentWeek: number }>(`/plans/${planId}/actions`)
}

export async function completeAction(planId: number, actionId: number): Promise<{ id: number; completed: boolean }> {
  return apiFetch<{ id: number; completed: boolean }>(`/plans/${planId}/actions/${actionId}`, {
    method: 'PATCH',
  })
}

export async function advanceWeek(planId: number): Promise<{ currentWeek: number }> {
  return apiFetch<{ currentWeek: number }>(`/plans/${planId}/advance-week`, {
    method: 'POST',
  })
}
