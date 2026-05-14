import { useMemo, useState } from 'react'
import { cropLibrary, type CropId } from '../constants/crops'
import type { CellPhase, GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'
import { Metric } from '../components/Metric'

function computePhase(currentWeek: number, weekStarted: number, weekHarvest: number, status: string, nurseryLeadWeeks = 2): CellPhase {
  if (status === 'empty') return 'empty'
  if (status === 'harvested') return 'harvested'
  if (weekHarvest > 0 && currentWeek >= weekHarvest) return 'harvestable'
  if (weekStarted > 0 && currentWeek >= weekStarted) return 'growing'
  if (weekStarted > 0 && currentWeek >= weekStarted - nurseryLeadWeeks) return 'seeded'
  return 'planned'
}

const PHASE_STYLE: Record<CellPhase, React.CSSProperties> = {
  empty: { opacity: 0.08, border: '1px solid rgba(255,255,255,0.04)' },
  planned: { opacity: 0.4, border: '1px dashed rgba(255,255,255,0.15)' },
  seeded: { opacity: 0.6, border: '1px solid rgba(255,255,255,0.2)', background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.06) 3px, rgba(255,255,255,0.06) 6px)' },
  growing: { opacity: 1, border: '1px solid rgba(255,255,255,0.06)' },
  harvestable: { opacity: 1, border: '2px solid rgba(34, 197, 94, 0.7)', boxShadow: '0 0 4px rgba(34, 197, 94, 0.3)' },
  harvested: { opacity: 0.3, border: '1px solid rgba(255,255,255,0.06)', filter: 'grayscale(0.6)' },
}

type DashboardPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  onBackToConfirm: () => void
  onOpenReplan: () => void
  onSetupFarm: () => void
}

const SURFACE: React.CSSProperties = {
  background: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
}

const LABEL: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-muted)',
}

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
}

export function DashboardPage({
  farm,
  selectedCropIds,
  generatedPlan,
  onBackToConfirm,
  onOpenReplan,
  onSetupFarm,
}: DashboardPageProps) {
  const selectedCrops = useMemo(
    () => cropLibrary.filter((crop) => selectedCropIds.includes(crop.id)),
    [selectedCropIds],
  )

  const resolvedPlan = generatedPlan
  const farmLevels = resolvedPlan?.levels || 1
  const [selectedLevel, setSelectedLevel] = useState(0)

  // All hooks before conditional return (React Rules of Hooks)
  const totalRevenue = useMemo(() => {
    if (!resolvedPlan) return 0
    if (resolvedPlan.expectedRevenue > 0) return resolvedPlan.expectedRevenue
    return resolvedPlan.cropSummaries.reduce((sum, cs) => {
      const crop = cropLibrary.find((c) => c.id === cs.cropId)
      const price = crop?.pricePerKg ?? 0
      return sum + cs.targetPerWeek * price
    }, 0)
  }, [resolvedPlan])

  const gridCells = useMemo(() => {
    if (!resolvedPlan) return []
    const currentWeek = resolvedPlan.currentWeek ?? 1
    const planRows = resolvedPlan.rows || 1
    const planCols = resolvedPlan.columns || 1
    const cellsPerLevel = planRows * planCols
    return resolvedPlan.cells.map((cell, idx) => {
      const crop = cropLibrary.find((item) => item.id === cell.cropId)
      const cellLevel = farmLevels > 1 ? Math.floor(idx / cellsPerLevel) : 0
      const phase = computePhase(currentWeek, cell.weekStarted, cell.weekHarvestExpected, cell.status, crop?.nurseryLeadWeeks)
      return {
        cropId: cell.cropId,
        name: cell.label,
        color: cell.color,
        category: crop?.category ?? 'Leafy Green',
        level: cellLevel,
        phase,
        weekStarted: cell.weekStarted,
        weekHarvestExpected: cell.weekHarvestExpected,
      }
    })
  }, [resolvedPlan, farmLevels])

  const levelCells = useMemo(() => {
    if (!resolvedPlan || farmLevels <= 1) return gridCells
    const cols = resolvedPlan.columns || 1
    const rows = resolvedPlan.rows || 1
    const cellsPerLevel = rows * cols
    return gridCells.filter((_, idx) => {
      const cellLevel = Math.floor(idx / cellsPerLevel)
      return cellLevel === selectedLevel
    })
  }, [gridCells, resolvedPlan, farmLevels, selectedLevel])

  const gridCols = resolvedPlan?.columns || 1

  const cropMix = useMemo(() => {
    if (!resolvedPlan) return []
    const cells = farmLevels > 1 ? levelCells : gridCells
    const assigned = cells.filter((c) => c.phase !== 'empty')
    const total = assigned.length
    return selectedCrops.map((crop) => {
      const count = assigned.filter((cell) => cell.cropId === crop.id).length
      return {
        id: crop.id,
        name: crop.name,
        color: crop.accent,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }
    })
  }, [gridCells, levelCells, farmLevels, selectedCrops, resolvedPlan])

  const currentPlanWeek = resolvedPlan?.currentWeek ?? 1
  const nextSeedBatch = useMemo(() => {
    if (!resolvedPlan) return 0
    return (resolvedPlan.nurserySchedule ?? [])
      .filter((batch) => batch.seedWeek === currentPlanWeek)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
  }, [currentPlanWeek, resolvedPlan])

  const readyToTransplant = useMemo(() => {
    if (!resolvedPlan) return 0
    return (resolvedPlan.nurserySchedule ?? [])
      .filter((batch) => batch.transplantWeek === currentPlanWeek)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
  }, [currentPlanWeek, resolvedPlan])

  const peakNurseryLoad = useMemo(() => {
    const fallback = { week: 1, activeSeedlings: 0, capacity: farm.nurseryCapacity, utilizationPercent: 0, risk: 'Low' as const }
    if (!resolvedPlan) return fallback
    const load = resolvedPlan.nurseryLoad ?? []
    if (load.length === 0) return fallback
    return load.reduce(
      (peak, item) => (item.activeSeedlings > peak.activeSeedlings ? item : peak),
      load[0],
    )
  }, [farm.nurseryCapacity, resolvedPlan])

  const planWeeks = useMemo(() => {
    if (!resolvedPlan) return 8
    const nurseryWeeks = resolvedPlan.nurseryLoad?.length ?? 0
    if (nurseryWeeks > 0) return nurseryWeeks
    const maxHarvest = Math.max(...(resolvedPlan.timelineRows ?? []).map((r) => r.harvestWeek), 8)
    return maxHarvest
  }, [resolvedPlan])

  const nurseryLoadWeeks = useMemo(() => {
    if (!resolvedPlan) return []
    return (resolvedPlan.nurseryLoad ?? []).slice(0, planWeeks)
  }, [resolvedPlan, planWeeks])

  const timelineRows = useMemo(() => {
    if (!resolvedPlan) return []
    return resolvedPlan.timelineRows ?? []
  }, [resolvedPlan])

  if (!resolvedPlan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-16)', color: 'var(--color-text-secondary)' }}>
        <p>No plan data available.</p>
        <button className="btn btn-primary" onClick={onSetupFarm}>
          Generate a plan
        </button>
      </div>
    )
  }

  // Derived values (not hooks — safe after conditional return)
  const revenuePerWeek = totalRevenue
  const activeCrops = (resolvedPlan.cropSummaries ?? []).filter((cs) => cs.allocatedCells > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* ── Top row: 4 metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        <div style={{ ...SURFACE, padding: '1rem 1.25rem' }}>
          <Metric
            value={`$${totalRevenue.toFixed(0)}`}
            label="Total Revenue /wk"
          />
        </div>
        <div style={{ ...SURFACE, padding: '1rem 1.25rem' }}>
          <Metric
            value={`${activeCrops}`}
            label="Active Crops"
          />
        </div>
        <div style={{ ...SURFACE, padding: '1rem 1.25rem' }}>
          <Metric
            value={`${resolvedPlan.utilizationPercent}%`}
            label="Grid Utilization"
          />
        </div>
        <div style={{ ...SURFACE, padding: '1rem 1.25rem' }}>
          <Metric
            value={`Week ${resolvedPlan.currentWeek ?? 1}`}
            label="Plan Status"
            positive
          />
        </div>
      </div>

      {/* ── Today's briefing ── */}
      {(() => {
        const currentWeek = resolvedPlan.currentWeek ?? 1
        const activeCells = gridCells.filter((c) => c.phase !== 'empty')
        const harvestable = activeCells.filter((c) => c.phase === 'harvestable')
        const seeded = activeCells.filter((c) => c.phase === 'seeded')
        const toSeed = activeCells.filter((c) => {
          if (c.phase !== 'seeded') return false
          if (c.weekStarted <= 0) return false
          const crop = cropLibrary.find((cr) => cr.id === c.cropId)
          const leadWeeks = crop?.nurseryLeadWeeks ?? 2
          return c.weekStarted - leadWeeks === currentWeek
        })
        const growing = activeCells.filter((c) => c.phase === 'growing').length

        // Estimate harvest kg by crop
        const harvestKgByCrop = new Map<string, { count: number; kg: number }>()
        for (const cell of harvestable) {
          const crop = cropLibrary.find((cr) => cr.id === cell.cropId)
          const existing = harvestKgByCrop.get(cell.cropId) ?? { count: 0, kg: 0 }
          harvestKgByCrop.set(cell.cropId, {
            count: existing.count + 1,
            kg: existing.kg + (crop?.yieldPerGrid ?? 0),
          })
        }

        const hasTasks = harvestable.length > 0 || seeded.length > 0 || toSeed.length > 0
        if (!hasTasks) return null

        return (
          <div style={{ ...SURFACE, padding: '1rem 1.25rem' }}>
            <h2 style={{ ...LABEL, margin: '0 0 0.75rem', color: 'var(--color-text-primary)' }}>
              Week {currentWeek} Briefing
            </h2>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {harvestable.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'rgba(34, 197, 94, 1)' }}>
                    Harvest {harvestable.length} cells
                  </span>
                  {Array.from(harvestKgByCrop.entries()).map(([cropId, { count, kg }]) => {
                    const crop = cropLibrary.find((cr) => cr.id === cropId)
                    return (
                      <span key={cropId} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', paddingLeft: '0.5rem' }}>
                        {crop?.name ?? cropId}: {count} grids, ~{kg.toFixed(1)} kg
                      </span>
                    )
                  })}
                </div>
              )}
              {seeded.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Transplant {seeded.length} cells
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', paddingLeft: '0.5rem' }}>
                    Seedlings ready from nursery
                  </span>
                </div>
              )}
              {toSeed.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Seed {toSeed.length} cells
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', paddingLeft: '0.5rem' }}>
                    Start in nursery this week
                  </span>
                </div>
              )}
              {growing > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                    {growing} cells growing
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Middle row: Farm Grid | Crop Mix + Nursery ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Farm Grid */}
        <div style={{ ...SURFACE, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ ...LABEL, margin: 0, color: 'var(--color-text-primary)' }}>Farm Grid</h2>
            <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {resolvedPlan.rows} x {resolvedPlan.columns} x {farmLevels}
            </span>
          </div>
          {farmLevels > 1 && (
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
              {Array.from({ length: farmLevels }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedLevel(i)}
                  style={{
                    padding: '0.25rem 0.625rem',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: selectedLevel === i ? 600 : 400,
                    color: selectedLevel === i ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    background: selectedLevel === i ? 'var(--color-bg-elevated)' : 'transparent',
                    border: `1px solid ${selectedLevel === i ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  L{i + 1}
                </button>
              ))}
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 26px)`,
              gap: '2px',
              justifyContent: 'center',
            }}
          >
            {levelCells.map((cell, idx) => (
              <span
                key={idx}
                title={`${cell.name} (${cell.phase}) — W${cell.weekStarted}→W${cell.weekHarvestExpected}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 3,
                  backgroundColor: cell.color,
                  ...PHASE_STYLE[cell.phase],
                }}
              />
            ))}
          </div>
          {/* Phase legend */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'center' }}>
            {([
              ['empty', 'Empty', 'dim'],
              ['planned', 'Planned', 'dashed'],
              ['seeded', 'Seeded', 'striped'],
              ['growing', 'Growing', 'solid'],
              ['harvestable', 'Harvest', 'glow'],
              ['harvested', 'Done', 'faded'],
            ] as const).map(([phase, label, _]) => (
              <span key={phase} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: 'var(--color-text-muted)',
                  ...PHASE_STYLE[phase as CellPhase],
                }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Crop Mix + Nursery Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Crop Mix */}
          <div style={{ ...SURFACE, padding: '1.25rem' }}>
            <h2 style={{ ...LABEL, margin: '0 0 0.75rem', color: 'var(--color-text-primary)' }}>Crop Mix</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {cropMix.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: item.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', width: 64, flexShrink: 0 }}>
                    {item.name}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--color-bg-base)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${item.percent}%`,
                        height: '100%',
                        borderRadius: 3,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', width: 36, textAlign: 'right' }}>
                    {item.percent}%
                  </span>
                  <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', width: 28, textAlign: 'right' }}>
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Nursery Queue */}
          <div style={{ ...SURFACE, padding: '1.25rem' }}>
            <h2 style={{ ...LABEL, margin: '0 0 0.75rem', color: 'var(--color-text-primary)' }}>Nursery Queue</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>Next seeding batch</span>
                <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  W{currentPlanWeek} &middot; {nextSeedBatch} seedlings
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>Ready to transplant</span>
                <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  {readyToTransplant}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>Peak nursery load</span>
                <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  {peakNurseryLoad.activeSeedlings} &middot; W{peakNurseryLoad.week}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: 8-Week Plan Timeline ── */}
      <div style={{ ...SURFACE, padding: '1.25rem' }}>
        <h2 style={{ ...LABEL, margin: '0 0 0.75rem', color: 'var(--color-text-primary)' }}>{planWeeks}-Week Plan</h2>

        {/* Week header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(${planWeeks}, 1fr)`,
            gap: '2px',
            marginBottom: '4px',
          }}
        >
          <span />
          {Array.from({ length: planWeeks }, (_, i) => (
            <span
              key={i}
              style={{
                ...MONO,
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              W{i + 1}
            </span>
          ))}
        </div>

        {/* Timeline rows */}
        {timelineRows.map((row) => (
          <div
            key={row.cropId}
            style={{
              display: 'grid',
              gridTemplateColumns: `80px repeat(${planWeeks}, 1fr)`,
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.label}
            </span>
            {Array.from({ length: planWeeks }, (_, weekIdx) => {
              const week = weekIdx + 1
              let bg = 'transparent'
              let label = ''
              if (week === row.seedWeek) {
                bg = 'rgba(220, 233, 255, 0.2)'
                label = 'S'
              } else if (week >= row.transplantWeek && week < row.transplantWeek + row.growWeeks) {
                bg = row.color
                label = 'G'
              } else if (week === row.harvestWeek) {
                bg = 'rgba(199, 231, 208, 0.25)'
                label = 'H'
              }

              return (
                <span
                  key={week}
                  style={{
                    height: 28,
                    borderRadius: 3,
                    backgroundColor: bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...MONO,
                    fontSize: 'var(--text-xs)',
                    color: label ? 'var(--color-text-primary)' : 'transparent',
                  }}
                >
                  {label}
                </span>
              )
            })}
          </div>
        ))}

        {/* Nursery load row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(${planWeeks}, 1fr)`,
            paddingTop: '8px',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span style={{ ...LABEL, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
            Nursery
          </span>
          {nurseryLoadWeeks.map((item) => {
            const loadColor =
              item.risk === 'High'
                ? 'rgba(239, 68, 68, 0.25)'
                : item.risk === 'Medium'
                  ? 'rgba(234, 179, 8, 0.2)'
                  : 'rgba(34, 197, 94, 0.15)'
            return (
              <span
                key={item.week}
                style={{
                  height: 28,
                  borderRadius: 3,
                  backgroundColor: loadColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...MONO,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {item.activeSeedlings}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Bottom bar: actions ── */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onBackToConfirm}>
          Back to Confirm
        </button>
        <button type="button" className="btn btn-ghost" onClick={onOpenReplan}>
          Replan
        </button>
      </div>
    </div>
  )
}
