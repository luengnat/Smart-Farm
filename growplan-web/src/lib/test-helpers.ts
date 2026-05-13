/**
 * Test helpers for AI regression testing.
 *
 * Mock data factories produce valid shapes matching the backend schemas.
 * Use these to write fast, DB-free regression tests that catch the
 * sandbox/production path mismatches and field omissions that AI reviewers miss.
 */

import type {
  GeneratedPlanCell,
  GeneratedPlanData,
  CropPlanSummary,
  PlanTimelineRow,
  NurseryBatch,
  NurseryLoadWeek,
  WeeklyRevenueEntry,
  WeeklyProfitEntry,
} from '../types/planning'
import type { CropId } from '../constants/crops'

// ─── Response shape validator ───

/**
 * Assert that every key in `requiredFields` exists on `data` and is not undefined.
 * Catches the #1 AI regression: field added to one code path but not another.
 */
export function assertHasAllFields<T extends Record<string, unknown>>(
  data: T,
  requiredFields: readonly string[],
  label = 'response',
): void {
  const missing = requiredFields.filter(
    (key) => !(key in data) || (data as Record<string, unknown>)[key] === undefined,
  )
  if (missing.length > 0) {
    throw new Error(
      `${label} is missing fields: ${missing.join(', ')}. ` +
      `Present keys: [${Object.keys(data).join(', ')}]`,
    )
  }
}

/**
 * Assert two objects have the same set of top-level keys.
 * Use this to verify sandbox and production paths return identical shapes.
 */
export function assertSameShape(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  labelA = 'sandbox',
  labelB = 'production',
): void {
  const keysA = new Set(Object.keys(a))
  const keysB = new Set(Object.keys(b))
  const onlyA = [...keysA].filter((k) => !keysB.has(k))
  const onlyB = [...keysB].filter((k) => !keysA.has(k))
  if (onlyA.length || onlyB.length) {
    const parts: string[] = []
    if (onlyA.length) parts.push(`only in ${labelA}: [${onlyA.join(', ')}]`)
    if (onlyB.length) parts.push(`only in ${labelB}: [${onlyB.join(', ')}]`)
    throw new Error(`Shape mismatch: ${parts.join('; ')}`)
  }
}

// ─── Null-safe utilities ───

/** Safe toFixed that treats null/undefined as 0. */
export function safeToFixed(value: number | null | undefined, digits = 2): string {
  return (value ?? 0).toFixed(digits)
}

// ─── Mock data factories ───

/** All fields the backend PlanResponse schema returns. */
export const REQUIRED_PLAN_FIELDS = [
  'id', 'status', 'rows', 'columns', 'levels', 'totalGrids',
  'cells', 'allocations', 'revenue', 'horizonWeeks', 'currentWeek',
  'goalPriority', 'selectedCrops',
] as const

/** All fields a GeneratedPlanData object must have after frontend transform. */
export const REQUIRED_GENERATED_PLAN_FIELDS = [
  'rows', 'columns', 'levels', 'currentWeek', 'cells',
  'utilizationPercent', 'requiredCapacity', 'availableCapacity',
  'stockoutRisk', 'seedlingCapacityRisk', 'expectedRevenue',
  'cropSummaries', 'timelineRows', 'nurserySchedule', 'nurseryLoad',
] as const

/** All fields each allocation must carry after backend normalization. */
export const REQUIRED_ALLOCATION_FIELDS = [
  'cropId', 'gridsAllocated', 'sustainableKgPerWeek',
  'revenuePerWeek', 'reservePercent',
] as const

export function createMockCell(
  overrides: Partial<GeneratedPlanCell> = {},
): GeneratedPlanCell {
  return {
    cropId: 'lettuce' as CropId,
    color: '#9edb66',
    label: 'Lettuce',
    weekStarted: 1,
    weekHarvestExpected: 4,
    status: 'planned',
    ...overrides,
  }
}

export function createMockCropSummary(
  overrides: Partial<CropPlanSummary> = {},
): CropPlanSummary {
  return {
    cropId: 'lettuce' as CropId,
    label: 'Lettuce',
    color: '#9edb66',
    allocatedCells: 24,
    targetPerWeek: 5.0,
    reservePercent: 10,
    seedlingsPerWeek: 1920,
    ...overrides,
  }
}

export function createMockTimelineRow(
  overrides: Partial<PlanTimelineRow> = {},
): PlanTimelineRow {
  return {
    cropId: 'lettuce' as CropId,
    label: 'Lettuce',
    color: '#9edb66',
    seedWeek: 1,
    transplantWeek: 3,
    growWeeks: 2,
    harvestWeek: 5,
    ...overrides,
  }
}

export function createMockNurseryBatch(
  overrides: Partial<NurseryBatch> = {},
): NurseryBatch {
  return {
    cropId: 'lettuce' as CropId,
    label: 'Lettuce',
    color: '#9edb66',
    seedWeek: 1,
    transplantWeek: 3,
    seedlings: 1920,
    status: 'Scheduled',
    ...overrides,
  }
}

export function createMockNurseryLoadWeek(
  overrides: Partial<NurseryLoadWeek> = {},
): NurseryLoadWeek {
  return {
    week: 1,
    activeSeedlings: 1920,
    capacity: 6000,
    utilizationPercent: 32,
    risk: 'Low',
    ...overrides,
  }
}

export interface MockAllocation {
  cropId: string
  gridsAllocated: number
  sustainableKgPerWeek: number
  revenuePerWeek: number
  reservePercent: number
}

export function createMockAllocation(
  overrides: Partial<MockAllocation> = {},
): MockAllocation {
  return {
    cropId: 'lettuce',
    gridsAllocated: 24,
    sustainableKgPerWeek: 28.8,
    revenuePerWeek: 115.2,
    reservePercent: 10,
    ...overrides,
  }
}

export function createMockRevenueEntry(
  overrides: Partial<WeeklyRevenueEntry> = {},
): WeeklyRevenueEntry {
  return {
    week: 1,
    total: 115.2,
    ...overrides,
  } as WeeklyRevenueEntry
}

export function createMockProfitEntry(
  overrides: Partial<WeeklyProfitEntry> = {},
): WeeklyProfitEntry {
  return {
    week: 1,
    revenue: 115.2,
    cost: 30.0,
    ...overrides,
  } as WeeklyProfitEntry
}

/**
 * Create a full mock GeneratedPlanData.
 * Every field has a sensible default; override anything via `overrides`.
 */
export function createMockPlan(
  overrides: Partial<GeneratedPlanData> = {},
): GeneratedPlanData {
  return {
    rows: 4,
    columns: 12,
    levels: 1,
    currentWeek: 1,
    cells: Array.from({ length: 48 }, () => createMockCell()),
    utilizationPercent: 80,
    requiredCapacity: 38,
    availableCapacity: 48,
    stockoutRisk: 'Low',
    seedlingCapacityRisk: 'Low',
    expectedRevenue: 1152,
    cropSummaries: [createMockCropSummary()],
    timelineRows: [createMockTimelineRow()],
    nurserySchedule: [createMockNurseryBatch()],
    nurseryLoad: [createMockNurseryLoadWeek()],
    ...overrides,
  }
}
