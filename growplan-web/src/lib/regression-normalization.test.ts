import { describe, it, expect } from 'vitest'
import {
  assertHasAllFields,
  assertSameShape,
  createMockAllocation,
  REQUIRED_ALLOCATION_FIELDS,
} from './test-helpers'

// ─── Pure-function extractions from fetchPlan (growplan-web/src/lib/api.ts) ───
// These re-implement the normalization logic so we can test it without network calls.
// When the real code changes, these must be updated to match.

type RawAllocation = Record<string, unknown>

function normalizeAllocations(raw: RawAllocation[]) {
  return raw.map((a) => ({
    cropId: (a.cropId ?? a.crop_id ?? '') as string,
    gridsAllocated: (a.gridsAllocated ?? a.grids_allocated ?? 0) as number,
    reservePercent: (a.reservePercent ?? a.reserve_percent ?? 0) as number,
    sustainableKgPerWeek: (a.sustainableKgPerWeek ?? a.sustainable_kg_per_week ?? 0) as number,
    revenuePerWeek: (a.revenuePerWeek ?? a.revenue_per_week ?? 0) as number,
  }))
}

function computeTotalRevenue(
  revenue: unknown,
  data: Record<string, unknown>,
  allocations: ReturnType<typeof normalizeAllocations>,
): number {
  const allocationRevenue = allocations.reduce((sum, a) => sum + a.revenuePerWeek, 0)
  if (typeof revenue === 'number') return revenue
  const r = revenue as Record<string, unknown> | null
  return (r?.totalPerWeek ?? r?.total_per_week ?? r?.totalRevenuePerWeek ?? r?.total_revenue_per_week ?? data.totalRevenue ?? data.total_revenue ?? (allocationRevenue || 0)) as number
}

function computeStockoutRisk(
  utilizationPercent: number,
  dataStockoutRisk?: string,
): 'Low' | 'Medium' | 'High' {
  const computed = (utilizationPercent > 90 ? 'High' : utilizationPercent > 70 ? 'Medium' : 'Low') as const
  return (dataStockoutRisk ?? computed) as 'Low' | 'Medium' | 'High'
}

function computeNurseryCapacity(
  options: { nurseryCapacity?: number } | undefined,
  data: Record<string, unknown>,
): number {
  return options?.nurseryCapacity
    ?? (data.nurseryTrayCount ?? data.nursery_tray_count ?? 1) as number * (data.nurseryTrayCells ?? data.nursery_tray_cells ?? 200) as number
}

function computeUtilization(totalAllocated: number, totalGrids: number): number {
  return totalGrids > 0 ? Math.round((totalAllocated / totalGrids) * 100) : 0
}

// ─── BUG-R96: reservePercent dropped during normalization ───
// Commit 38e5427: fetchPlan only kept cropId and gridsAllocated,
// causing cropSummaries to always show 0% reserve.

describe('BUG-R96: reservePercent preserved in allocation normalization', () => {
  it('camelCase reservePercent is preserved', () => {
    const raw = [{ cropId: 'lettuce', gridsAllocated: 24, reservePercent: 15 }]
    const result = normalizeAllocations(raw)
    expect(result[0].reservePercent).toBe(15)
  })

  it('snake_case reserve_percent is preserved', () => {
    const raw = [{ crop_id: 'lettuce', grids_allocated: 24, reserve_percent: 20 }]
    const result = normalizeAllocations(raw)
    expect(result[0].reservePercent).toBe(20)
  })

  it('defaults to 0 when absent', () => {
    const raw = [{ cropId: 'lettuce', gridsAllocated: 24 }]
    const result = normalizeAllocations(raw)
    expect(result[0].reservePercent).toBe(0)
  })

  it('normalized allocation has all required fields', () => {
    const raw = [{ cropId: 'lettuce', gridsAllocated: 24, reservePercent: 10, sustainableKgPerWeek: 28.8, revenuePerWeek: 115.2 }]
    const result = normalizeAllocations(raw)
    assertHasAllFields(result[0], REQUIRED_ALLOCATION_FIELDS, 'allocation')
  })
})

// ─── BUG-R97: sustainableKgPerWeek dropped during normalization ───
// Commit c112f4a: Backend AllocationResponse includes sustainable_kg_per_week
// and revenue_per_week but frontend dropped them.

describe('BUG-R97: sustainableKgPerWeek preserved in allocation normalization', () => {
  it('camelCase sustainableKgPerWeek is preserved', () => {
    const raw = [{ cropId: 'lettuce', gridsAllocated: 24, sustainableKgPerWeek: 28.8, revenuePerWeek: 115.2 }]
    const result = normalizeAllocations(raw)
    expect(result[0].sustainableKgPerWeek).toBe(28.8)
  })

  it('snake_case sustainable_kg_per_week is preserved', () => {
    const raw = [{ crop_id: 'lettuce', grids_allocated: 24, sustainable_kg_per_week: 14.4, revenue_per_week: 57.6 }]
    const result = normalizeAllocations(raw)
    expect(result[0].sustainableKgPerWeek).toBe(14.4)
  })

  it('defaults to 0 when absent', () => {
    const raw = [{ cropId: 'lettuce', gridsAllocated: 24 }]
    const result = normalizeAllocations(raw)
    expect(result[0].sustainableKgPerWeek).toBe(0)
  })

  it('revenuePerWeek is also preserved (same fix)', () => {
    const raw = [{ cropId: 'lettuce', gridsAllocated: 24, revenuePerWeek: 115.2 }]
    const result = normalizeAllocations(raw)
    expect(result[0].revenuePerWeek).toBe(115.2)
  })

  it('targetPerWeek prefers sustainableKgPerWeek over static estimate', () => {
    const alloc = { cropId: 'lettuce', gridsAllocated: 24, sustainableKgPerWeek: 28.8, revenuePerWeek: 115.2 }
    // Simulates the cropSummary computation:
    // targetPerWeek: a.sustainableKgPerWeek || (crop ? a.gridsAllocated * (crop.yieldPerGrid ?? 0) : 0)
    const backendValue = alloc.sustainableKgPerWeek
    const staticEstimate = 24 * 1.2 // gridsAllocated * yieldPerGrid
    const targetPerWeek = backendValue || staticEstimate
    expect(targetPerWeek).toBe(28.8) // prefers backend, not static
  })

  it('targetPerWeek falls back to static estimate when backend is 0', () => {
    const alloc = { cropId: 'lettuce', gridsAllocated: 24, sustainableKgPerWeek: 0, revenuePerWeek: 0 }
    const backendValue = alloc.sustainableKgPerWeek
    const staticEstimate = 24 * 1.2
    const targetPerWeek = backendValue || staticEstimate
    expect(targetPerWeek).toBeCloseTo(28.8) // falls back to static
  })
})

// ─── BUG-R98: stockoutRisk hardcoded to 'Low' ───
// Commit c9189a7: Was always 'Low' because PlanResponse doesn't include it.
// Now computed from utilizationPercent.

describe('BUG-R98: stockoutRisk computed from utilization', () => {
  it('returns High when utilization > 90%', () => {
    expect(computeStockoutRisk(95)).toBe('High')
    expect(computeStockoutRisk(91)).toBe('High')
  })

  it('returns Medium when utilization > 70%', () => {
    expect(computeStockoutRisk(85)).toBe('Medium')
    expect(computeStockoutRisk(71)).toBe('Medium')
  })

  it('returns Low when utilization <= 70%', () => {
    expect(computeStockoutRisk(70)).toBe('Low')
    expect(computeStockoutRisk(50)).toBe('Low')
    expect(computeStockoutRisk(0)).toBe('Low')
  })

  it('prefers backend stockoutRisk when provided', () => {
    expect(computeStockoutRisk(50, 'High')).toBe('High')
    expect(computeStockoutRisk(95, 'Low')).toBe('Low')
  })

  it('falls back to computed when backend omits it', () => {
    expect(computeStockoutRisk(85, undefined)).toBe('Medium')
    expect(computeStockoutRisk(95, undefined)).toBe('High')
  })

  it('utilizationPercent calculation is correct', () => {
    expect(computeUtilization(38, 48)).toBe(79) // 38/48 * 100 = 79.17 → 79
    expect(computeUtilization(48, 48)).toBe(100)
    expect(computeUtilization(0, 48)).toBe(0)
    expect(computeUtilization(10, 0)).toBe(0) // division by zero guard
  })
})

// ─── BUG-R99: revenue defaults to 0 instead of summing allocations ───
// Commit 590b7c1: When plan-level revenue absent, sums per-allocation
// revenuePerWeek as fallback instead of defaulting to 0.

describe('BUG-R99: revenue fallback sums allocation revenues', () => {
  it('uses plan-level number revenue directly', () => {
    const result = computeTotalRevenue(500, {}, [])
    expect(result).toBe(500)
  })

  it('extracts revenue.totalPerWeek from object', () => {
    const revenue = { totalPerWeek: 230.4 }
    const result = computeTotalRevenue(revenue, {}, [])
    expect(result).toBe(230.4)
  })

  it('extracts revenue.total_per_week (snake_case)', () => {
    const revenue = { total_per_week: 180.0 }
    const result = computeTotalRevenue(revenue, {}, [])
    expect(result).toBe(180.0)
  })

  it('falls back to data.totalRevenue', () => {
    const result = computeTotalRevenue(null, { totalRevenue: 150 }, [])
    expect(result).toBe(150)
  })

  it('sums allocation revenues when no plan-level revenue exists', () => {
    const allocations = normalizeAllocations([
      { cropId: 'lettuce', gridsAllocated: 24, revenuePerWeek: 115.2 },
      { cropId: 'basil', gridsAllocated: 12, revenuePerWeek: 86.4 },
    ])
    const result = computeTotalRevenue(null, {}, allocations)
    expect(result).toBeCloseTo(201.6) // 115.2 + 86.4
  })

  it('returns 0 only when everything is absent AND no allocation revenue', () => {
    const allocations = normalizeAllocations([
      { cropId: 'lettuce', gridsAllocated: 24 }, // no revenuePerWeek
    ])
    const result = computeTotalRevenue(null, {}, allocations)
    expect(result).toBe(0)
  })

  it('allocation revenue beats 0 from plan-level fields', () => {
    const allocations = normalizeAllocations([
      { cropId: 'lettuce', gridsAllocated: 24, revenuePerWeek: 100 },
    ])
    // revenue is null, data has no totalRevenue → should get allocationRevenue (100), not 0
    const result = computeTotalRevenue(null, {}, allocations)
    expect(result).toBe(100)
  })
})

// ─── BUG-R100: nursery capacity always falls back to 200 ───
// Commit d15d1e6: fetchPlan now accepts nurseryCapacity option to use
// farm's actual capacity instead of hardcoded 200.

describe('BUG-R100: nurseryCapacity uses farm value', () => {
  it('prefers options.nurseryCapacity when provided', () => {
    const cap = computeNurseryCapacity({ nurseryCapacity: 6000 }, { nurseryTrayCount: 30, nurseryTrayCells: 200 })
    expect(cap).toBe(6000)
  })

  it('falls back to data.nurseryTrayCount * nurseryTrayCells', () => {
    const cap = computeNurseryCapacity(undefined, { nurseryTrayCount: 30, nurseryTrayCells: 200 })
    expect(cap).toBe(6000) // 30 * 200
  })

  it('falls back to snake_case tray fields', () => {
    const cap = computeNurseryCapacity(undefined, { nursery_tray_count: 20, nursery_tray_cells: 150 })
    expect(cap).toBe(3000) // 20 * 150
  })

  it('uses defaults when no tray info (1 * 200 = 200)', () => {
    const cap = computeNurseryCapacity(undefined, {})
    expect(cap).toBe(200)
  })

  it('nurseryLoad uses correct capacity for utilization', () => {
    // Simulate nursery load calculation with custom capacity
    const capacity = 6000
    const activeSeedlings = 4200
    const pct = capacity > 0 ? Math.round((activeSeedlings / capacity) * 100) : 0
    expect(pct).toBe(70) // 4200/6000 = 70%

    // Same seedlings with wrong capacity (200) would be wildly off
    const wrongPct = Math.round((activeSeedlings / 200) * 100)
    expect(wrongPct).toBe(2100) // obviously wrong
  })
})

// ─── Shape consistency: all allocations have identical fields ───
// This catches the root pattern behind R96, R97: fields added to one
// code path but not another.

describe('Allocation shape consistency', () => {
  it('all normalizations produce identical field sets', () => {
    const cases = [
      { cropId: 'lettuce', gridsAllocated: 24, reservePercent: 10, sustainableKgPerWeek: 28.8, revenuePerWeek: 115.2 },
      { crop_id: 'basil', grids_allocated: 12, reserve_percent: 15, sustainable_kg_per_week: 7.2, revenue_per_week: 86.4 },
      { cropId: 'kale', gridsAllocated: 6 }, // minimal
    ]
    const results = normalizeAllocations(cases)
    for (let i = 1; i < results.length; i++) {
      assertSameShape(results[0], results[i], `case 0`, `case ${i}`)
    }
  })

  it('mock factory produces same shape as real normalization', () => {
    const mock = createMockAllocation()
    const normalized = normalizeAllocations([{
      cropId: 'lettuce',
      gridsAllocated: 24,
      reservePercent: 10,
      sustainableKgPerWeek: 28.8,
      revenuePerWeek: 115.2,
    }])[0]
    assertSameShape(mock, normalized, 'factory', 'normalized')
  })
})
