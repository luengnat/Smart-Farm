import { generatePlanData } from './planGenerator'
import type {
  AnalyticsData,
  CropComparisonData,
  CropId,
  CropCommitment,
  GeneratedPlanData,
  GoalData,
  HistoryData,
  PlanSummary,
  SetupFarmData,
  TimelineData,
} from '../types/planning'

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
  farmId?: number,
): Promise<{ planId: number | null; plan: GeneratedPlanData; usedBackend: boolean }> {
  if (!backendAvailable || !farmId) {
    const plan = generatePlanData({
      farm: params.farm,
      selectedCropIds: params.selectedCropIds,
      goalData: params.goalData,
    })
    return { planId: null, plan, usedBackend: false }
  }

  try {
    const commitments: Record<string, { enabled: boolean; minKgPerWeek: number }> = {}
    for (const [id, c] of Object.entries(params.goalData.commitments)) {
      commitments[id] = { enabled: c.enabled, minKgPerWeek: c.minKgPerWeek }
    }

    const resp = await apiFetch<{ planId: number; status: string; pollUrl: string }>('/plans/generate', {
      method: 'POST',
      body: JSON.stringify({
        farmId,
        selectedCropIds: params.selectedCropIds,
        goal: {
          planningHorizonWeeks: params.goalData.planningHorizonWeeks,
          priority: params.goalData.priority,
          commitments,
        },
      }),
    })

    const plan = await pollForPlan(resp.planId)
    return { planId: resp.planId, plan, usedBackend: true }
  } catch (err) {
    console.warn('Backend unavailable, falling back to client-side generator:', err)
    backendAvailable = false
    const plan = generatePlanData({
      farm: params.farm,
      selectedCropIds: params.selectedCropIds,
      goalData: params.goalData,
    })
    return { planId: null, plan, usedBackend: false }
  }
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
  return {
    rows: data.rows,
    columns: data.columns,
    totalGrids: data.totalGrids,
    cells: (data.cells ?? []).map((c: Record<string, any>) => ({
      index: c.index,
      cropId: c.cropId,
      status: c.status,
      weekStarted: c.weekStarted,
      weekHarvestExpected: c.weekHarvestExpected,
    })),
    allocations: (data.allocations ?? []).map((a: Record<string, any>) => ({
      cropId: a.cropId,
      gridsAllocated: a.gridsAllocated,
      gridsPerSection: 1,
      harvestCycleWeeks: 1,
      sustainableKgPerWeek: a.sustainableKgPerWeek,
      revenuePerWeek: a.revenuePerWeek,
      revenuePerGridWeek: a.revenuePerWeek / Math.max(a.gridsAllocated, 1),
      seedlingsPerCycle: 0,
      traysPerCycle: 0,
    })),
    rotations: [],
    nurseryBatches: [],
    nurseryOccupancy: [],
    revenue: data.revenue
      ? {
          totalRevenuePerWeek: data.revenue.totalRevenuePerWeek,
          maxPossibleRevenuePerWeek: data.revenue.maxPossibleRevenuePerWeek,
          revenueGap: data.revenue.revenueGap,
          revenueByCrop: data.revenue.revenueByCrop,
          opportunityCostOfCommitments: data.revenue.opportunityCostOfCommitments,
        }
      : {
          totalRevenuePerWeek: 0,
          maxPossibleRevenuePerWeek: 0,
          revenueGap: 0,
          revenueByCrop: {},
          opportunityCostOfCommitments: 0,
        },
    horizonWeeks: data.horizonWeeks,
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/health`)
    backendAvailable = true
    return true
  } catch {
    backendAvailable = false
    return false
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
