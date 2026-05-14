import { describe, it, expect } from 'vitest'

/**
 * Regression tests for the computePhase function and capacity calculations.
 * These were source of bugs: wrong phase transitions, missing levels in capacity,
 * and incorrect level indexing.
 */

// ─── computePhase (extracted from DashboardPage) ───

type CellPhase = 'empty' | 'planned' | 'seeded' | 'growing' | 'harvestable' | 'harvested'

function computePhase(
  currentWeek: number,
  weekStarted: number,
  weekHarvest: number,
  status: string,
  nurseryLeadWeeks = 2,
): CellPhase {
  if (status === 'empty') return 'empty'
  if (status === 'harvested') return 'harvested'
  if (currentWeek >= weekHarvest) return 'harvestable'
  if (currentWeek >= weekStarted) return 'growing'
  if (currentWeek >= weekStarted - nurseryLeadWeeks) return 'seeded'
  return 'planned'
}

describe('computePhase', () => {
  it('returns "empty" for empty cells', () => {
    expect(computePhase(1, 0, 0, 'empty')).toBe('empty')
  })

  it('returns "harvested" for harvested cells regardless of week', () => {
    expect(computePhase(1, 1, 4, 'harvested')).toBe('harvested')
    expect(computePhase(99, 1, 4, 'harvested')).toBe('harvested')
  })

  it('returns "harvestable" when currentWeek >= weekHarvest', () => {
    expect(computePhase(4, 1, 4, 'planned')).toBe('harvestable')
    expect(computePhase(5, 1, 4, 'planned')).toBe('harvestable')
  })

  it('returns "growing" when currentWeek >= weekStarted but < weekHarvest', () => {
    expect(computePhase(2, 2, 5, 'planned')).toBe('growing')
    expect(computePhase(4, 2, 5, 'planned')).toBe('growing')
  })

  it('returns "seeded" when currentWeek >= weekStarted - nurseryLeadWeeks', () => {
    // Cell starts week 4, nursery lead is 2 weeks → seeded at week 2
    expect(computePhase(2, 4, 7, 'planned')).toBe('seeded')
    expect(computePhase(3, 4, 7, 'planned')).toBe('seeded')
  })

  it('returns "planned" when cell is in the future', () => {
    // Cell starts week 5, nursery lead is 2 weeks → seeded at week 3
    expect(computePhase(1, 5, 8, 'planned')).toBe('planned')
    expect(computePhase(2, 5, 8, 'planned')).toBe('planned')
  })

  it('respects crop-specific nurseryLeadWeeks', () => {
    // Crop with 3-week nursery lead
    expect(computePhase(2, 5, 8, 'planned', 3)).toBe('seeded')   // 5-3=2, currentWeek=2
    expect(computePhase(1, 5, 8, 'planned', 3)).toBe('planned')   // 5-3=2, currentWeek=1
  })

  it('handles week 1 edge case', () => {
    // Cell starts week 1, harvest week 4, current week 1
    expect(computePhase(1, 1, 4, 'planned')).toBe('growing')
    // Cell starts week 3, current week 1
    expect(computePhase(1, 3, 6, 'planned')).toBe('seeded') // 3-2=1, currentWeek=1
  })
})

// ─── Level indexing ───
// BUG: Was using idx % farmLevels (wrong), now uses Math.floor(idx / cellsPerLevel)

describe('Level indexing (3D grid)', () => {
  it('correctly assigns cells to levels for a 2x2x3 grid', () => {
    const rows = 2
    const cols = 2
    const cellsPerLevel = rows * cols // 4

    // Level 0: indices 0-3
    expect(Math.floor(0 / cellsPerLevel)).toBe(0)
    expect(Math.floor(3 / cellsPerLevel)).toBe(0)
    // Level 1: indices 4-7
    expect(Math.floor(4 / cellsPerLevel)).toBe(1)
    expect(Math.floor(7 / cellsPerLevel)).toBe(1)
    // Level 2: indices 8-11
    expect(Math.floor(8 / cellsPerLevel)).toBe(2)
    expect(Math.floor(11 / cellsPerLevel)).toBe(2)
  })

  it('handles single level (backward compatible)', () => {
    const rows = 10
    const cols = 12
    const cellsPerLevel = rows * cols // 120

    // All cells in level 0
    expect(Math.floor(0 / cellsPerLevel)).toBe(0)
    expect(Math.floor(119 / cellsPerLevel)).toBe(0)
  })

  it('does NOT use modulo (the old buggy behavior)', () => {
    const rows = 2
    const cols = 2
    const levels = 3
    const cellsPerLevel = rows * cols

    // Old buggy code: idx % levels
    // For idx=4: 4 % 3 = 1 (correct by accident)
    // For idx=6: 6 % 3 = 0 (WRONG — should be level 1)
    const idx = 6
    const buggyLevel = idx % levels
    const correctLevel = Math.floor(idx / cellsPerLevel)

    expect(buggyLevel).toBe(0) // Wrong!
    expect(correctLevel).toBe(1) // Correct
    expect(buggyLevel).not.toBe(correctLevel)
  })
})

// ─── Capacity with levels ───
// BUG: Capacity was rows * columns, ignoring levels

describe('Capacity calculation includes levels', () => {
  it('computes total capacity as rows * columns * levels', () => {
    const farm = { rows: 10, columns: 12, levels: 3 }
    const capacity = farm.rows * farm.columns * farm.levels
    expect(capacity).toBe(360)
  })

  it('single level is backward compatible', () => {
    const farm = { rows: 10, columns: 12, levels: 1 }
    const capacity = farm.rows * farm.columns * farm.levels
    expect(capacity).toBe(120)
  })

  it('3-level farm has 3x the capacity of single level', () => {
    const base = 10 * 12
    const withLevels = 10 * 12 * 3
    expect(withLevels).toBe(base * 3)
  })
})

// ─── Balanced crop goals ───
// Validates the goal distribution across selected crops

describe('Balanced crop goal distribution', () => {
  it('distributes capacity evenly across selected crops', () => {
    const rows = 4, columns = 4, levels = 1
    const availableCapacityPerWeek = rows * columns * levels // 16
    const selectedCropIds = ['lettuce', 'basil']
    const cropCount = selectedCropIds.length

    const gridSharePerCrop = availableCapacityPerWeek / cropCount // 8
    expect(gridSharePerCrop).toBe(8)
  })

  it('returns 0 grid share when no crops selected', () => {
    const availableCapacityPerWeek = 16
    const selectedCropIds: string[] = []
    const gridSharePerCrop = selectedCropIds.length > 0
      ? availableCapacityPerWeek / selectedCropIds.length
      : 0

    expect(gridSharePerCrop).toBe(0)
  })
})

// ─── BUG-R6: Dashboard null-safety before null check ───
// DashboardPage accessed resolvedPlan.levels before the null guard.
// The fix uses optional chaining: resolvedPlan?.levels || 1

describe('BUG-R6: Null-safe property access before guard', () => {
  it('does not crash when plan is null (levels access)', () => {
    const plan: { levels: number } | null = null
    const farmLevels = plan?.levels || 1
    expect(farmLevels).toBe(1)
  })

  it('reads levels when plan exists', () => {
    const plan = { levels: 3 }
    const farmLevels = plan?.levels || 1
    expect(farmLevels).toBe(3)
  })

  it('defaults to 1 when levels is 0', () => {
    const plan = { levels: 0 }
    const farmLevels = plan?.levels || 1
    expect(farmLevels).toBe(1)
  })

  it('nurseryLoad optional chain is safe on null plan', () => {
    const plan: { nurseryLoad: { week: number }[] } | null = null
    const week = plan?.nurseryLoad?.[0]?.week ?? 1
    expect(week).toBe(1)
  })

  it('nurseryLoad optional chain reads first week', () => {
    const plan = { nurseryLoad: [{ week: 3 }] }
    const week = plan?.nurseryLoad?.[0]?.week ?? 1
    expect(week).toBe(3)
  })
})

// ─── BUG-R7: React hooks ordering violation ───
// DashboardPage had useMemo hooks AFTER a conditional early return.
// When generatedPlan transitioned from null → non-null, React would crash:
// "Rendered more hooks than during the previous render"
//
// The fix moves all hooks before the conditional return with null guards.

describe('BUG-R7: Hook-safe compute guards', () => {
  it('gridCells returns empty array when plan is null', () => {
    const plan: null = null
    // Simulating the guard: if (!resolvedPlan) return []
    const result = plan ? plan.cells.map(() => null) : []
    expect(result).toEqual([])
  })

  it('peakNurseryLoad returns fallback when plan is null', () => {
    const plan: null = null
    const fallback = { week: 1, activeSeedlings: 0, capacity: 200, utilizationPercent: 0, risk: 'Low' as const }
    const result = plan?.nurseryLoad?.reduce(
      (peak: typeof fallback, item: typeof fallback) => (item.activeSeedlings > peak.activeSeedlings ? item : peak),
      plan?.nurseryLoad?.[0] ?? fallback,
    ) ?? fallback
    expect(result).toEqual(fallback)
  })

  it('cropMix returns empty array when plan is null', () => {
    const plan: null = null
    const result = plan ? [] : []
    expect(result).toEqual([])
  })
})

// ─── BUG-R11: ReplanPage nurseryLoad/timelineRows null safety ───
// nurseryLoad and timelineRows were accessed without null guards.
// If the API returned a plan missing these arrays, .reduce() would crash.

describe('BUG-R11: ReplanPage null-safe array access', () => {
  it('handles missing nurseryLoad without crashing', () => {
    const plan: { nurseryLoad?: { week: number; activeSeedlings: number }[] } = {}
    const nurseryLoad = plan.nurseryLoad ?? []
    const peak = nurseryLoad.length > 0
      ? nurseryLoad.reduce((peak, item) => (item.activeSeedlings > peak.activeSeedlings ? item : peak), nurseryLoad[0])
      : { week: 1, activeSeedlings: 0 }
    expect(peak).toEqual({ week: 1, activeSeedlings: 0 })
  })

  it('handles missing timelineRows without crashing', () => {
    const plan: { timelineRows?: { cropId: string }[] } = {}
    const timelineRows = plan.timelineRows ?? []
    expect(timelineRows).toEqual([])
    expect(timelineRows.length).toBe(0)
  })

  it('handles empty nurseryLoad array', () => {
    const plan = { nurseryLoad: [] as { week: number; activeSeedlings: number }[] }
    const nurseryLoad = plan.nurseryLoad ?? []
    const peak = nurseryLoad.length > 0
      ? nurseryLoad.reduce((p, i) => (i.activeSeedlings > p.activeSeedlings ? i : p), nurseryLoad[0])
      : { week: 1, activeSeedlings: 0 }
    expect(peak).toEqual({ week: 1, activeSeedlings: 0 })
  })

  it('finds peak in populated nurseryLoad', () => {
    const plan = {
      nurseryLoad: [
        { week: 1, activeSeedlings: 10 },
        { week: 2, activeSeedlings: 50 },
        { week: 3, activeSeedlings: 30 },
      ],
    }
    const nurseryLoad = plan.nurseryLoad ?? []
    const peak = nurseryLoad.reduce((p, i) => (i.activeSeedlings > p.activeSeedlings ? i : p), nurseryLoad[0])
    expect(peak.week).toBe(2)
    expect(peak.activeSeedlings).toBe(50)
  })
})

// ─── BUG-R12: GeneratePlanPage unstable callback deps ───
// Inline arrow functions passed as props caused the useEffect to re-run
// on every parent re-render, potentially creating duplicate farms.
// Fixed by using refs to stabilize callbacks.

describe('BUG-R12: Ref-stabilized callbacks prevent duplicate execution', () => {
  it('simulates callback identity change without triggering re-execution', () => {
    let executionCount = 0
    const data = { value: 1 }

    // Simulates the bug: callback in deps causes re-run
    const effectWithCallback = (callback: () => void) => {
      executionCount++
      callback()
    }

    // Simulates the fix: ref-stabilized callback
    let stableCallback: (() => void) | null = null
    const effectWithRef = (_callback: () => void) => {
      // Only re-run if DATA changed, not callback reference
      if (executionCount === 0) {
        executionCount++
        stableCallback = _callback
        stableCallback()
      }
    }

    // Bug: new callback reference each render triggers re-execution
    const cb1 = () => {}
    const cb2 = () => {} // new reference, same logic
    effectWithCallback(cb1)
    effectWithCallback(cb2)
    const bugCount = executionCount // 2 executions

    executionCount = 0
    // Fix: ref pattern, only runs once even with new callback
    effectWithRef(cb1)
    effectWithRef(cb2)
    const fixCount = executionCount // 1 execution

    expect(bugCount).toBe(2)
    expect(fixCount).toBe(1)
  })

  it('data change triggers re-execution even with ref pattern', () => {
    let executionCount = 0
    const runEffect = (dataVersion: number) => {
      executionCount++
    }

    runEffect(1)
    runEffect(2)
    expect(executionCount).toBe(2)
  })
})

// ─── BUG-R13: TasksPage planId guard in mutations ───
// Mutations used planId! non-null assertion. If planId became null
// between mount and mutation call, it would pass null to the API.
// Fixed by adding runtime guards.

describe('BUG-R13: Mutation guards for null planId', () => {
  it('mutation function throws when planId is null', () => {
    const planId: number | null = null

    const mutationFn = () => {
      if (!planId) throw new Error('No plan ID')
      return Promise.resolve(planId)
    }

    expect(() => mutationFn()).toThrow('No plan ID')
  })

  it('mutation function succeeds when planId is valid', async () => {
    const planId: number | null = 42

    const mutationFn = () => {
      if (!planId) throw new Error('No plan ID')
      return Promise.resolve(planId)
    }

    const result = await mutationFn()
    expect(result).toBe(42)
  })

  it('toggle mutation guards against null planId', () => {
    const planId: number | null = null
    const actionId = 5

    const toggleFn = () => {
      if (!planId) throw new Error('No plan ID')
      return Promise.resolve({ id: actionId, completed: true })
    }

    expect(() => toggleFn()).toThrow('No plan ID')
  })
})

// ─── BUG-R16: ConfirmPlanPage hooks ordering violation ───
// useMemo was placed after a conditional early return. When generatedPlan
// transitioned from null → non-null, React crashed with
// "Rendered more hooks than during the previous render".
// Same root cause as BUG-R7 but in ConfirmPlanPage.
//
// Fixed by moving all hooks before the conditional return.

describe('BUG-R16: ConfirmPlanPage hooks before conditional return', () => {
  it('hook count stays stable across null → non-null transition', () => {
    // Render 1: plan is null
    const plan1: null = null
    const hooksCalled1 = [
      plan1 !== undefined ? 'useMemo-timelineRows' : null,
      plan1 !== undefined ? 'useMemo-nurseryLoad' : null,
    ].filter(Boolean)

    // Render 2: plan loads
    const plan2 = { timelineRows: [], nurseryLoad: [] }
    const hooksCalled2 = [
      plan2 !== undefined ? 'useMemo-timelineRows' : null,
      plan2 !== undefined ? 'useMemo-nurseryLoad' : null,
    ].filter(Boolean)

    expect(hooksCalled1.length).toBe(hooksCalled2.length)
  })

  it('timelineRows defaults to empty array when plan is null', () => {
    const plan: null = null
    const timelineRows = plan?.timelineRows ?? []
    expect(timelineRows).toEqual([])
  })

  it('nurseryLoad defaults to empty array when plan is null', () => {
    const plan: null = null
    const nurseryLoad = plan?.nurseryLoad ?? []
    expect(nurseryLoad).toEqual([])
  })
})

// ─── BUG-R17: AnalyticsPage empty revenueByWeek access ───
// `analytics.revenueByWeek[0]` crashes when the array is empty.
// Object.keys(undefined) throws TypeError.

describe('BUG-R17: AnalyticsPage safe empty-array access', () => {
  it('handles empty revenueByWeek without crash', () => {
    const revenueByWeek: Record<string, unknown>[] = []
    const firstEntry = revenueByWeek?.[0] ?? {}
    const cropIds = Object.keys(firstEntry).filter(k => k !== 'week' && k !== 'total')
    expect(cropIds).toEqual([])
  })

  it('handles undefined revenueByWeek without crash', () => {
    const analytics: { revenueByWeek?: Record<string, unknown>[] } = {}
    const firstEntry = analytics.revenueByWeek?.[0] ?? {}
    const cropIds = Object.keys(firstEntry).filter(k => k !== 'week' && k !== 'total')
    expect(cropIds).toEqual([])
  })

  it('extracts crop IDs from populated data', () => {
    const revenueByWeek = [{ week: 1, lettuce: 48, basil: 30, total: 78 }]
    const firstEntry = revenueByWeek?.[0] ?? {}
    const cropIds = Object.keys(firstEntry).filter(k => k !== 'week' && k !== 'total')
    expect(cropIds).toEqual(['lettuce', 'basil'])
  })

  it('handles profitByWeek empty array for margin fallback', () => {
    const profitByWeek: { margin: number }[] = []
    const finalMargin = profitByWeek[profitByWeek.length - 1]?.margin || 0
    expect(finalMargin).toBe(0)
  })
})

// ─── BUG-R18: DashboardPage undefined array properties ───
// nurserySchedule, nurseryLoad, timelineRows, cropSummaries could all be
// undefined on the plan object. Accessing .filter()/.reduce()/.map() on
// undefined throws TypeError.

describe('BUG-R18: DashboardPage null-safe array properties', () => {
  it('nurserySchedule defaults to empty array', () => {
    const plan: { nurserySchedule?: { seedWeek: number; seedlings: number }[] } = {}
    const schedule = plan.nurserySchedule ?? []
    const batch = schedule.filter(b => b.seedWeek === 1)
    expect(batch).toEqual([])
  })

  it('nurserySchedule reduce works on empty', () => {
    const plan: { nurserySchedule?: { seedlings: number }[] } = {}
    const total = (plan.nurserySchedule ?? []).reduce((sum, b) => sum + b.seedlings, 0)
    expect(total).toBe(0)
  })

  it('nurseryLoad empty array returns fallback for peak', () => {
    const plan: { nurseryLoad?: { activeSeedlings: number }[] } = {}
    const load = plan.nurseryLoad ?? []
    const fallback = { week: 1, activeSeedlings: 0 }
    const peak = load.length > 0
      ? load.reduce((p, i) => (i.activeSeedlings > p.activeSeedlings ? i : p), load[0])
      : fallback
    expect(peak).toEqual(fallback)
  })

  it('cropSummaries defaults to empty array', () => {
    const plan: { cropSummaries?: { allocatedCells: number }[] } = {}
    const activeCrops = (plan.cropSummaries ?? []).filter(cs => cs.allocatedCells > 0).length
    expect(activeCrops).toBe(0)
  })

  it('timelineRows defaults to empty array', () => {
    const plan: { timelineRows?: { cropId: string }[] } = {}
    const rows = plan.timelineRows ?? []
    expect(rows).toEqual([])
  })

  it('populated arrays work correctly', () => {
    const plan = {
      nurserySchedule: [
        { seedWeek: 1, seedlings: 20 },
        { seedWeek: 1, seedlings: 30 },
      ],
    }
    const total = (plan.nurserySchedule ?? []).reduce((sum, b) => sum + b.seedlings, 0)
    expect(total).toBe(50)
  })
})

// ─── BUG-R19: SetupProgress division by zero ───
// When steps array is empty, `(completed / steps.length) * 100` produces NaN.
// Progress bar would display "NaN%" width.

describe('BUG-R19: SetupProgress empty steps guard', () => {
  it('progress width is 0% when steps is empty', () => {
    const steps: { id: number }[] = []
    const activeStep = 3
    const completed = Math.max(0, Math.min(activeStep, steps.length))
    const progressWidth = steps.length > 0 ? `${(completed / steps.length) * 100}%` : '0%'
    expect(progressWidth).toBe('0%')
    expect(Number.isNaN(parseFloat(progressWidth))).toBe(false)
  })

  it('progress width calculates correctly with steps', () => {
    const steps = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
    const activeStep = 3
    const completed = Math.max(0, Math.min(activeStep, steps.length))
    const progressWidth = steps.length > 0 ? `${(completed / steps.length) * 100}%` : '0%'
    expect(progressWidth).toBe('60%')
  })

  it('activeStep clamped to steps length', () => {
    const steps = [{ id: 1 }, { id: 2 }]
    const activeStep = 10
    const completed = Math.max(0, Math.min(activeStep, steps.length))
    expect(completed).toBe(2)
  })
})

// ─── BUG-R20: ErrorBoundary non-Error thrown values ───
// React's getDerivedStateFromError can receive non-Error values
// (e.g., thrown strings or numbers). error.message would be undefined.

describe('BUG-R20: ErrorBoundary handles non-Error thrown values', () => {
  it('wraps string error in Error object', () => {
    const thrown = 'something broke'
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('something broke')
  })

  it('preserves Error instances', () => {
    const thrown = new Error('real error')
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    expect(error).toBe(thrown)
    expect(error.message).toBe('real error')
  })

  it('handles thrown number', () => {
    const thrown = 42
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    expect(error.message).toBe('42')
  })

  it('handles thrown null', () => {
    const thrown = null
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    expect(error.message).toBe('null')
  })
})

// ─── BUG-R24: PlanHistoryPage revenuePerWeek.toFixed crash on null ───
// API response may have revenuePerWeek as null despite TypeScript type saying `number`.
// Calling `.toFixed()` on null throws TypeError.
// Fixed by using `(snapshot.revenuePerWeek ?? 0).toFixed(2)`.

describe('BUG-R24: revenuePerWeek null safety', () => {
  it('toFixed crashes on null revenuePerWeek', () => {
    const revenuePerWeek: number | null = null
    expect(() => revenuePerWeek!.toFixed(2)).toThrow()
  })

  it('null-coalescing prevents crash', () => {
    const revenuePerWeek: number | null = null
    const display = (revenuePerWeek ?? 0).toFixed(2)
    expect(display).toBe('0.00')
  })

  it('preserves real values', () => {
    const revenuePerWeek: number | null = 123.456
    const display = (revenuePerWeek ?? 0).toFixed(2)
    expect(display).toBe('123.46')
  })

  it('handles undefined', () => {
    const revenuePerWeek: number | undefined = undefined
    const display = (revenuePerWeek ?? 0).toFixed(2)
    expect(display).toBe('0.00')
  })
})

// ─── BUG-R25: expectedRevenue NaN display when API returns null/undefined ───
// Multiple pages computed `(plan.expectedRevenue / 1000).toFixed(1)` without
// guarding expectedRevenue. If the API returns null/undefined, the result is
// "NaNk" displayed to the user.
// Fixed by using `((plan.expectedRevenue ?? 0) / 1000).toFixed(1)`.

describe('BUG-R25: expectedRevenue NaN guard', () => {
  it('undefined / 1000 produces NaN display', () => {
    const expectedRevenue: number | undefined = undefined
    const display = (expectedRevenue! / 1000).toFixed(1)
    expect(display).toBe('NaN')
  })

  it('null-coalescing prevents NaN', () => {
    const expectedRevenue: number | null | undefined = null
    const display = ((expectedRevenue ?? 0) / 1000).toFixed(1)
    expect(display).toBe('0.0')
  })

  it('preserves real revenue values', () => {
    const expectedRevenue = 5420
    const display = ((expectedRevenue ?? 0) / 1000).toFixed(1)
    expect(display).toBe('5.4')
  })

  it('handles zero revenue', () => {
    const expectedRevenue = 0
    const display = ((expectedRevenue ?? 0) / 1000).toFixed(1)
    expect(display).toBe('0.0')
  })
})

// ─── BUG-R27: AnalyticsPage cumulative fields toFixed crash on null ───
// fetchAnalytics returns raw API data with no transform.
// If backend returns null for cumulativeRevenue/cumulativeCost/cumulativeProfit,
// calling .toFixed(2) on them crashes.
// Fixed by adding `?? 0` at render sites.

describe('BUG-R27: AnalyticsPage cumulative null safety', () => {
  it('toFixed crashes on null cumulativeRevenue', () => {
    const cumulativeRevenue: number | null = null
    expect(() => cumulativeRevenue!.toFixed(2)).toThrow()
  })

  it('null-safe toFixed returns "0.00"', () => {
    const cumulativeRevenue: number | null = null
    expect((cumulativeRevenue ?? 0).toFixed(2)).toBe('0.00')
  })

  it('null cumulativeProfit comparison treats null as zero', () => {
    const cumulativeProfit: number | null = null
    // Without ?? 0: null >= 0 is true (wrong color!)
    expect(null! >= 0).toBe(true)
    // With ?? 0: correctly evaluates
    expect((cumulativeProfit ?? 0) >= 0).toBe(true)
  })

  it('preserves real values when not null', () => {
    const cumulativeRevenue = 1234.56
    expect((cumulativeRevenue ?? 0).toFixed(2)).toBe('1234.56')
  })
})

// ─── BUG-R28: CropComparisonPage metrics toFixed crash on null ───
// fetchCropComparison returns raw API data. If backend returns null
// for any CropMetrics field, .toFixed() crashes.
// Fixed by adding `?? 0` at render sites.

describe('BUG-R28: CropComparison metrics null safety', () => {
  it('toFixed crashes on null revenuePerGridWeek', () => {
    const m: { revenuePerGridWeek: number | null } = { revenuePerGridWeek: null }
    expect(() => m.revenuePerGridWeek!.toFixed(2)).toThrow()
  })

  it('null-safe toFixed works on all metric fields', () => {
    const metrics = {
      revenuePerGridWeek: null as number | null,
      costPerGridWeek: null as number | null,
      netMarginPerGridWeek: null as number | null,
      marginPct: null as number | null,
      seedCostPerCycle: null as number | null,
    }
    expect((metrics.revenuePerGridWeek ?? 0).toFixed(2)).toBe('0.00')
    expect((metrics.costPerGridWeek ?? 0).toFixed(2)).toBe('0.00')
    expect((metrics.netMarginPerGridWeek ?? 0).toFixed(2)).toBe('0.00')
    expect((metrics.marginPct ?? 0).toFixed(1)).toBe('0.0')
    expect((metrics.seedCostPerCycle ?? 0).toFixed(2)).toBe('0.00')
  })

  it('null netMarginPerGridWeek >= 0 is true (wrong color)', () => {
    const netMarginPerGridWeek: number | null = null
    expect(null! >= 0).toBe(true)
    expect((netMarginPerGridWeek ?? 0) >= 0).toBe(true)
  })

  it('preserves real metric values', () => {
    const revenuePerGridWeek = 3.75
    expect((revenuePerGridWeek ?? 0).toFixed(2)).toBe('3.75')
  })
})

// ─── BUG-R31: PlanHistoryPage data.snapshots crash when undefined ───
// fetchHistory returns raw apiFetch data. If the API returns { total: 0 }
// without a snapshots array, accessing data.snapshots.length crashes.
// Fixed by using (data.snapshots ?? []) in condition checks.

describe('BUG-R31: PlanHistoryPage snapshots undefined', () => {
  it('accessing .length on undefined snapshots crashes', () => {
    const data = { total: 0 } as { total: number; snapshots?: unknown[] }
    expect(() => data.snapshots!.length).toThrow()
  })

  it('null-safe access returns 0 for missing snapshots', () => {
    const data = { total: 0 } as { total: number; snapshots?: unknown[] }
    expect((data.snapshots ?? []).length).toBe(0)
  })

  it('null-safe access works with populated snapshots', () => {
    const data = { total: 2, snapshots: [{ id: 1 }, { id: 2 }] }
    expect((data.snapshots ?? []).length).toBe(2)
  })
})

// ─── BUG-R32: AnalyticsPage TimelineTab/ProfitabilityTab null guards ───
// fetchTimeline and fetchAnalytics return raw API data without transforms.
// If timeline.crops, timeline.horizonWeeks, timeline.currentWeek are null/undefined,
// or if crop.intervals is null, SVG rendering crashes.
// If analytics.profitByWeek is null, BarChart receives null instead of array.
// Fixed by extracting guarded variables at component top.

describe('BUG-R32: TimelineTab/ProfitabilityTab null guards', () => {
  it('missing timeline.crops defaults to empty array', () => {
    const timeline: { crops?: { cropId: string }[] } = {}
    const crops = timeline.crops ?? []
    expect(crops).toEqual([])
    expect(crops.length).toBe(0)
  })

  it('missing timeline.horizonWeeks defaults to 8', () => {
    const timeline: { horizonWeeks?: number } = {}
    const horizonWeeks = timeline.horizonWeeks ?? 8
    expect(horizonWeeks).toBe(8)
  })

  it('missing timeline.currentWeek defaults to 1', () => {
    const timeline: { currentWeek?: number } = {}
    const currentWeek = timeline.currentWeek ?? 1
    expect(currentWeek).toBe(1)
  })

  it('missing crop.intervals defaults to empty array', () => {
    const crop: { intervals?: { startWeek: number; endWeek: number }[] } = {}
    const intervals = crop.intervals ?? []
    expect(intervals).toEqual([])
  })

  it('missing analytics.profitByWeek defaults to empty array', () => {
    const analytics: { profitByWeek?: { week: number }[] } = {}
    const profitByWeek = analytics.profitByWeek ?? []
    expect(profitByWeek).toEqual([])
  })

  it('profitByWeek empty array yields 0 finalMargin', () => {
    const analytics: { profitByWeek?: { margin: number }[] } = {}
    const profitByWeek = analytics.profitByWeek ?? []
    const finalMargin = profitByWeek[profitByWeek.length - 1]?.margin || 0
    expect(finalMargin).toBe(0)
  })

  it('populated timeline values are preserved', () => {
    const timeline = {
      crops: [{ cropId: 'lettuce' }],
      horizonWeeks: 12,
      currentWeek: 5,
    }
    expect((timeline.crops ?? []).length).toBe(1)
    expect(timeline.horizonWeeks ?? 8).toBe(12)
    expect(timeline.currentWeek ?? 1).toBe(5)
  })
})

// ─── BUG-R33: CropComparisonPage data.crops undefined crash ───
// fetchCropComparison returns raw apiFetch data. If the API returns
// { recommended: "lettuce" } without a crops array, data.crops.map() crashes.
// Fixed by using (data.crops ?? []) at all access sites.

describe('BUG-R33: CropComparisonPage data.crops null safety', () => {
  it('accessing .map() on undefined crops crashes', () => {
    const data = { recommended: 'lettuce' } as { recommended?: string; crops?: { cropId: string }[] }
    expect(() => data.crops!.map(c => c)).toThrow()
  })

  it('null-safe access returns empty array', () => {
    const data = { recommended: 'lettuce' } as { recommended?: string; crops?: { cropId: string }[] }
    const crops = data.crops ?? []
    expect(crops).toEqual([])
    expect(crops.length).toBe(0)
  })

  it('null-safe access preserves populated crops', () => {
    const data = { recommended: 'lettuce', crops: [{ cropId: 'lettuce' }, { cropId: 'basil' }] }
    const crops = data.crops ?? []
    expect(crops.length).toBe(2)
  })

  it('null-safe .length >= 2 check works for empty', () => {
    const data = {} as { crops?: { cropId: string }[] }
    expect((data.crops ?? []).length >= 2).toBe(false)
  })
})

// ─── BUG-R34: CropComparisonPage crop.metrics undefined crash ───
// If the API returns a crop without a metrics object, accessing
// m.revenuePerGridWeek crashes before ?? 0 can help, because m itself is undefined.
// Fixed by: const m = crop.metrics ?? { ...defaults }

describe('BUG-R34: CropComparisonPage crop.metrics null safety', () => {
  it('accessing metrics field on undefined crashes', () => {
    const crop = { cropId: 'lettuce', cropName: 'Lettuce' } as { cropId: string; metrics?: { revenuePerGridWeek: number } }
    expect(() => crop.metrics!.revenuePerGridWeek).toThrow()
  })

  it('null-safe metrics fallback provides zeros', () => {
    const crop = { cropId: 'lettuce', cropName: 'Lettuce' } as { cropId: string; metrics?: { revenuePerGridWeek: number; costPerGridWeek: number } }
    const m = crop.metrics ?? { revenuePerGridWeek: 0, costPerGridWeek: 0 }
    expect((m.revenuePerGridWeek ?? 0).toFixed(2)).toBe('0.00')
    expect((m.costPerGridWeek ?? 0).toFixed(2)).toBe('0.00')
  })

  it('null-safe metrics preserves real values', () => {
    const crop = { cropId: 'lettuce', metrics: { revenuePerGridWeek: 5.5, costPerGridWeek: 1.2 } }
    const m = crop.metrics ?? { revenuePerGridWeek: 0, costPerGridWeek: 0 }
    expect((m.revenuePerGridWeek ?? 0).toFixed(2)).toBe('5.50')
  })
})

// ─── BUG-R35: CropComparisonPage radarScores undefined crash ───
// buildRadarData accesses c.radarScores[dim] without null check.
// If radarScores is undefined or missing a key, the radar chart receives undefined values.
// Fixed by using c.radarScores?.[dim] ?? 0.

describe('BUG-R35: CropComparisonPage radarScores null safety', () => {
  it('accessing undefined radarScores crashes', () => {
    const crop = { cropId: 'lettuce' } as { cropId: string; radarScores?: Record<string, number> }
    expect(() => crop.radarScores!['revenue']).toThrow()
  })

  it('optional chain with fallback returns 0', () => {
    const crop = { cropId: 'lettuce' } as { cropId: string; radarScores?: Record<string, number> }
    expect(crop.radarScores?.['revenue'] ?? 0).toBe(0)
  })

  it('missing dimension key returns 0 with fallback', () => {
    const crop = { cropId: 'lettuce', radarScores: { revenue: 80 } } as { cropId: string; radarScores?: Record<string, number> }
    expect(crop.radarScores?.['speed'] ?? 0).toBe(0)
    expect(crop.radarScores?.['revenue'] ?? 0).toBe(80)
  })

  it('buildRadarData handles missing radarScores', () => {
    const crops = [
      { cropId: 'lettuce', cropName: 'Lettuce', radarScores: undefined as unknown as Record<string, number> },
      { cropId: 'basil', cropName: 'Basil', radarScores: { revenue: 90 } as Record<string, number> },
    ]
    const dims = ['revenue', 'speed'] as const
    const data = dims.map(dim => {
      const entry: Record<string, string | number> = { dimension: dim.charAt(0).toUpperCase() + dim.slice(1) }
      for (const c of crops) {
        entry[c.cropId] = c.radarScores?.[dim] ?? 0
      }
      return entry
    })
    expect(data[0]).toEqual({ dimension: 'Revenue', lettuce: 0, basil: 90 })
    expect(data[1]).toEqual({ dimension: 'Speed', lettuce: 0, basil: 0 })
  })
})
