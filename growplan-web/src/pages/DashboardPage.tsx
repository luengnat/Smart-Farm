import { useMemo } from 'react'
import { cropLibrary, type CropId } from '../constants/crops'
import type { GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'
import { Metric } from '../components/Metric'

type DashboardPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  onBackToConfirm: () => void
  onOpenReplan: () => void
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
}: DashboardPageProps) {
  const selectedCrops = useMemo(
    () => cropLibrary.filter((crop) => selectedCropIds.includes(crop.id)),
    [selectedCropIds],
  )

  const resolvedPlan = generatedPlan

  if (!resolvedPlan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-16)', color: 'var(--color-text-secondary)' }}>
        <p>No plan data available.</p>
        <button className="btn btn-primary" onClick={onOpenReplan}>
          Generate a plan
        </button>
      </div>
    )
  }

  // --- Revenue computation ---
  const totalRevenue = useMemo(() => {
    if (resolvedPlan.expectedRevenue > 0) return resolvedPlan.expectedRevenue
    return resolvedPlan.cropSummaries.reduce((sum, cs) => {
      const crop = cropLibrary.find((c) => c.id === cs.cropId)
      const price = crop?.pricePerKg ?? 0
      return sum + cs.targetPerWeek * price
    }, 0)
  }, [resolvedPlan.cropSummaries, resolvedPlan.expectedRevenue])

  const revenuePerWeek = totalRevenue
  const activeCrops = resolvedPlan.cropSummaries.filter((cs) => cs.allocatedCells > 0).length

  // --- Grid cells ---
  const gridCells = useMemo(() => {
    return resolvedPlan.cells.map((cell) => {
      const crop = cropLibrary.find((item) => item.id === cell.cropId)
      return {
        cropId: cell.cropId,
        name: cell.label,
        color: cell.color,
        category: crop?.category ?? 'Leafy Green',
      }
    })
  }, [resolvedPlan.cells])

  // --- Crop mix ---
  const cropMix = useMemo(() => {
    const total = gridCells.length
    return selectedCrops.map((crop) => {
      const count = gridCells.filter((cell) => cell.cropId === crop.id).length
      return {
        id: crop.id,
        name: crop.name,
        color: crop.accent,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }
    })
  }, [gridCells, selectedCrops])

  // --- Nursery ---
  const nextSeedWeek = resolvedPlan.nurseryLoad[0]?.week ?? 1
  const nextSeedBatch = useMemo(() => {
    return resolvedPlan.nurserySchedule
      .filter((batch) => batch.seedWeek === nextSeedWeek)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
  }, [nextSeedWeek, resolvedPlan.nurserySchedule])

  const readyToTransplant = useMemo(() => {
    return resolvedPlan.nurserySchedule
      .filter((batch) => batch.transplantWeek === nextSeedWeek)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
  }, [nextSeedWeek, resolvedPlan.nurserySchedule])

  const peakNurseryLoad = useMemo(() => {
    return resolvedPlan.nurseryLoad.reduce(
      (peak, item) => (item.activeSeedlings > peak.activeSeedlings ? item : peak),
      resolvedPlan.nurseryLoad[0] ?? {
        week: 1,
        activeSeedlings: 0,
        capacity: farm.nurseryCapacity,
        utilizationPercent: 0,
        risk: 'Low' as const,
      },
    )
  }, [farm.nurseryCapacity, resolvedPlan.nurseryLoad])

  const nurseryLoadWeeks = useMemo(
    () => resolvedPlan.nurseryLoad.slice(0, 8),
    [resolvedPlan.nurseryLoad],
  )

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
            value="Active"
            label="Plan Status"
            positive
          />
        </div>
      </div>

      {/* ── Middle row: Farm Grid | Crop Mix + Nursery ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Farm Grid */}
        <div style={{ ...SURFACE, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ ...LABEL, margin: 0, color: 'var(--color-text-primary)' }}>Farm Grid</h2>
            <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {resolvedPlan.rows} x {resolvedPlan.columns}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${resolvedPlan.columns}, 26px)`,
              gap: '2px',
              justifyContent: 'center',
            }}
          >
            {gridCells.map((cell, idx) => (
              <span
                key={idx}
                title={cell.name}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 3,
                  backgroundColor: cell.color,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
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
                  W{nextSeedWeek} &middot; {nextSeedBatch} seedlings
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
        <h2 style={{ ...LABEL, margin: '0 0 0.75rem', color: 'var(--color-text-primary)' }}>8-Week Plan</h2>

        {/* Week header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(8, 1fr)`,
            gap: '2px',
            marginBottom: '4px',
          }}
        >
          <span />
          {Array.from({ length: 8 }, (_, i) => (
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
        {resolvedPlan.timelineRows.map((row) => (
          <div
            key={row.cropId}
            style={{
              display: 'grid',
              gridTemplateColumns: `80px repeat(8, 1fr)`,
              gap: '2px',
              marginBottom: '2px',
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
            {Array.from({ length: 8 }, (_, weekIdx) => {
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
            gridTemplateColumns: `80px repeat(8, 1fr)`,
            gap: '2px',
            marginTop: '8px',
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
