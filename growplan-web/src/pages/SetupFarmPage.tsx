import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import {
  Droplet,
  Grid3X3,
  Lightbulb,
  RotateCcw,
  Settings2,
  Waves,
} from 'lucide-react'
import type { SetupFarmData } from '../types/planning'

type SetupFarmPageProps = {
  initialData: SetupFarmData
  onBackToWelcome: () => void
  onContinue: (data: SetupFarmData) => void
}

type ZoneTool = 'lighting' | 'irrigation'

const createDefaultLightingAssignments = (rows: number, columns: number, lightingZones: number) => {
  const totalGrids = rows * columns
  return Array.from({ length: totalGrids }, (_, idx) => {
    const rowIndex = Math.floor(idx / columns)
    return Math.min(lightingZones, Math.floor((rowIndex * lightingZones) / rows) + 1)
  })
}

const createDefaultIrrigationAssignments = (
  rows: number,
  columns: number,
  irrigationZones: number,
) => {
  const totalGrids = rows * columns
  return Array.from({ length: totalGrids }, (_, idx) => {
    const colIndex = idx % columns
    return Math.min(irrigationZones, Math.floor((colIndex * irrigationZones) / columns) + 1)
  })
}

const ZONE_COLORS = [
  'rgba(0, 230, 118, 0.25)',
  'rgba(64, 196, 255, 0.25)',
  'rgba(255, 179, 0, 0.25)',
  'rgba(255, 82, 82, 0.25)',
  'rgba(179, 136, 255, 0.25)',
]

const ZONE_BORDERS = [
  'rgba(0, 230, 118, 0.5)',
  'rgba(64, 196, 255, 0.5)',
  'rgba(255, 179, 0, 0.5)',
  'rgba(255, 82, 82, 0.5)',
  'rgba(179, 136, 255, 0.5)',
]

const IZ_COLORS = [
  'rgba(64, 196, 255, 0.6)',
  'rgba(255, 179, 0, 0.6)',
  'rgba(179, 136, 255, 0.6)',
]

/* ── inline style helpers ── */

const sectionHeading: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  marginBottom: 'var(--space-4)',
  paddingBottom: 'var(--space-3)',
  borderBottom: '1px solid var(--color-border)',
}

const twoColGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--space-4)',
}

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono)',
}

export function SetupFarmPage({ initialData, onBackToWelcome, onContinue }: SetupFarmPageProps) {
  const [farmName, setFarmName] = useState(initialData.farmName)
  const [farmLocation, setFarmLocation] = useState(initialData.farmLocation)
  const [rows, setRows] = useState(initialData.rows)
  const [columns, setColumns] = useState(initialData.columns)
  const [lightingZones, setLightingZones] = useState(initialData.lightingZones)
  const [irrigationZones, setIrrigationZones] = useState(initialData.irrigationZones)
  const [nurseryCapacity, setNurseryCapacity] = useState(initialData.nurseryCapacity)
  const [seedlingLeadDays, setSeedlingLeadDays] = useState(initialData.seedlingLeadDays)
  const [growingSystem, setGrowingSystem] = useState(initialData.growingSystem)
  const [activeTool, setActiveTool] = useState<ZoneTool>('lighting')
  const [activeLightingZone, setActiveLightingZone] = useState(1)
  const [activeIrrigationZone, setActiveIrrigationZone] = useState(1)
  const [lightingAssignments, setLightingAssignments] = useState<number[]>(() => {
    const totalGrids = initialData.rows * initialData.columns
    if (initialData.lightingAssignments.length === totalGrids) {
      return initialData.lightingAssignments.map((zone) =>
        Math.min(Math.max(zone, 1), initialData.lightingZones),
      )
    }
    return createDefaultLightingAssignments(initialData.rows, initialData.columns, initialData.lightingZones)
  })
  const [irrigationAssignments, setIrrigationAssignments] = useState<number[]>(() => {
    const totalGrids = initialData.rows * initialData.columns
    if (initialData.irrigationAssignments.length === totalGrids) {
      return initialData.irrigationAssignments.map((zone) =>
        Math.min(Math.max(zone, 1), initialData.irrigationZones),
      )
    }
    return createDefaultIrrigationAssignments(
      initialData.rows,
      initialData.columns,
      initialData.irrigationZones,
    )
  })
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null)
  const [dragCurrentIdx, setDragCurrentIdx] = useState<number | null>(null)

  const totalGrids = useMemo(() => rows * columns, [rows, columns])

  useEffect(() => {
    setLightingAssignments((prev) => {
      if (prev.length !== totalGrids) {
        return createDefaultLightingAssignments(rows, columns, lightingZones)
      }
      return prev.map((zone) => Math.min(Math.max(zone, 1), lightingZones))
    })
  }, [columns, lightingZones, rows, totalGrids])

  useEffect(() => {
    setIrrigationAssignments((prev) => {
      if (prev.length !== totalGrids) {
        return createDefaultIrrigationAssignments(rows, columns, irrigationZones)
      }
      return prev.map((zone) => Math.min(Math.max(zone, 1), irrigationZones))
    })
  }, [columns, irrigationZones, rows, totalGrids])

  useEffect(() => {
    setActiveLightingZone((prev) => Math.min(prev, lightingZones))
  }, [lightingZones])

  useEffect(() => {
    setActiveIrrigationZone((prev) => Math.min(prev, irrigationZones))
  }, [irrigationZones])

  const lightingLegend = Array.from({ length: lightingZones }, (_, idx) => idx + 1)
  const irrigationLegend = Array.from({ length: irrigationZones }, (_, idx) => idx + 1)

  const dragRect = useMemo(() => {
    if (dragStartIdx === null || dragCurrentIdx === null) return null
    const startRow = Math.floor(dragStartIdx / columns)
    const startCol = dragStartIdx % columns
    const endRow = Math.floor(dragCurrentIdx / columns)
    const endCol = dragCurrentIdx % columns
    return {
      minRow: Math.min(startRow, endRow),
      maxRow: Math.max(startRow, endRow),
      minCol: Math.min(startCol, endCol),
      maxCol: Math.max(startCol, endCol),
    }
  }, [columns, dragCurrentIdx, dragStartIdx])

  const updateZoneAssignments = (startIdx: number, endIdx: number) => {
    const startRow = Math.floor(startIdx / columns)
    const startCol = startIdx % columns
    const endRow = Math.floor(endIdx / columns)
    const endCol = endIdx % columns
    const minRow = Math.min(startRow, endRow)
    const maxRow = Math.max(startRow, endRow)
    const minCol = Math.min(startCol, endCol)
    const maxCol = Math.max(startCol, endCol)
    const inSelection = (idx: number) => {
      const row = Math.floor(idx / columns)
      const col = idx % columns
      return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
    }
    if (activeTool === 'lighting') {
      setLightingAssignments((prev) =>
        prev.map((zone, idx) => (inSelection(idx) ? activeLightingZone : zone)),
      )
      return
    }
    setIrrigationAssignments((prev) =>
      prev.map((zone, idx) => (inSelection(idx) ? activeIrrigationZone : zone)),
    )
  }

  const handleCellPointerDown = (idx: number) => {
    setDragStartIdx(idx)
    setDragCurrentIdx(idx)
  }

  const handleCellPointerEnter = (idx: number) => {
    if (dragStartIdx === null) return
    setDragCurrentIdx(idx)
  }

  const finalizeDrag = () => {
    if (dragStartIdx === null || dragCurrentIdx === null) return
    updateZoneAssignments(dragStartIdx, dragCurrentIdx)
    setDragStartIdx(null)
    setDragCurrentIdx(null)
  }

  const resetZones = () => {
    const nextLighting = createDefaultLightingAssignments(rows, columns, lightingZones)
    const nextIrrigation = createDefaultIrrigationAssignments(rows, columns, irrigationZones)
    setLightingAssignments(nextLighting)
    setIrrigationAssignments(nextIrrigation)
    setDragStartIdx(null)
    setDragCurrentIdx(null)
  }

  const isCellInDragRect = (idx: number) => {
    if (!dragRect) return false
    const row = Math.floor(idx / columns)
    const col = idx % columns
    return (
      row >= dragRect.minRow &&
      row <= dragRect.maxRow &&
      col >= dragRect.minCol &&
      col <= dragRect.maxCol
    )
  }

  const handleContinue = () => {
    onContinue({
      farmName: farmName.trim() || 'AgriMatrix Farm',
      farmLocation: farmLocation.trim() || 'Bangkok',
      rows,
      columns,
      lightingZones,
      irrigationZones,
      nurseryCapacity,
      seedlingLeadDays,
      growingSystem,
      lightingAssignments,
      irrigationAssignments,
    })
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg-base)',
        color: 'var(--color-text-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Progress indicator */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-6)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Step 1 of 3 &mdash; Farm Setup
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {totalGrids} grids
        </span>
      </div>

      {/* Two-panel layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left: Form panel */}
        <section
          style={{
            padding: 'var(--space-6)',
            borderRight: '1px solid var(--color-border)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-6)',
          }}
        >
          {/* Header */}
          <div>
            <h1
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                marginBottom: 'var(--space-1)',
                letterSpacing: '-0.01em',
              }}
            >
              Setup Farm
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Configure your controlled-environment farm layout.
            </p>
          </div>

          {/* Identity fields */}
          <div className="input-group">
            <label className="input-label" htmlFor="farm-name">Farm name</label>
            <input
              id="farm-name"
              className="input-field"
              value={farmName}
              placeholder="Enter farm name"
              onChange={(e) => setFarmName(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="farm-location">Farm location</label>
            <input
              id="farm-location"
              className="input-field"
              value={farmLocation}
              placeholder="Enter location"
              onChange={(e) => setFarmLocation(e.target.value)}
            />
          </div>

          {/* Farm Layout */}
          <div style={sectionHeading}>
            <Grid3X3 size={16} style={{ color: 'var(--color-text-muted)' }} />
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Farm Layout</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Define the size and structure of your growing area.
              </div>
            </div>
          </div>

          <div style={twoColGrid}>
            <div className="input-group">
              <label className="input-label" htmlFor="rows">Rows</label>
              <input
                id="rows"
                className="input-field mono"
                type="number"
                min={4}
                max={20}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value) || 4)}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="columns">Columns</label>
              <input
                id="columns"
                className="input-field mono"
                type="number"
                min={4}
                max={20}
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value) || 4)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--color-bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total grids
            </span>
            <span style={{ ...mono, fontSize: 'var(--text-sm)', color: 'var(--color-accent)', fontWeight: 600 }}>
              {totalGrids}
            </span>
          </div>

          {/* Controlled Environment */}
          <div style={sectionHeading}>
            <Settings2 size={16} style={{ color: 'var(--color-text-muted)' }} />
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Controlled Environment</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Configure lighting and irrigation zones.
              </div>
            </div>
          </div>

          <div style={twoColGrid}>
            <div className="input-group">
              <label className="input-label" htmlFor="lighting-zones">Lighting zones</label>
              <select
                id="lighting-zones"
                className="input-field"
                value={lightingZones}
                onChange={(e) => setLightingZones(Number(e.target.value))}
              >
                <option value={2}>2 zones</option>
                <option value={3}>3 zones</option>
                <option value={4}>4 zones</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="irrigation-zones">Irrigation zones</label>
              <select
                id="irrigation-zones"
                className="input-field"
                value={irrigationZones}
                onChange={(e) => setIrrigationZones(Number(e.target.value))}
              >
                <option value={1}>1 zone</option>
                <option value={2}>2 zones</option>
                <option value={3}>3 zones</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="growing-system">Growing system</label>
            <select
              id="growing-system"
              className="input-field"
              value={growingSystem}
              onChange={(e) => setGrowingSystem(e.target.value)}
            >
              <option>Hydroponic NFT</option>
              <option>Hydroponic DWC</option>
              <option>Aeroponic</option>
              <option>Container garden</option>
            </select>
          </div>

          <div style={twoColGrid}>
            <div className="input-group">
              <label className="input-label" htmlFor="nursery-capacity">Nursery capacity (seedlings)</label>
              <input
                id="nursery-capacity"
                className="input-field mono"
                type="number"
                min={20}
                max={2000}
                value={nurseryCapacity}
                onChange={(e) => setNurseryCapacity(Math.max(20, Number(e.target.value) || 20))}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="seedling-lead">Seedling lead time (days)</label>
              <input
                id="seedling-lead"
                className="input-field mono"
                type="number"
                min={7}
                max={35}
                value={seedlingLeadDays}
                onChange={(e) => setSeedlingLeadDays(Math.max(7, Number(e.target.value) || 7))}
              />
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
            <button type="button" className="btn btn-ghost" onClick={onBackToWelcome}>
              Back
            </button>
            <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={handleContinue}>
              Save &amp; Continue
            </button>
          </div>
        </section>

        {/* Right: Preview + zone assignment */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Preview header */}
          <header
            style={{
              padding: 'var(--space-4) var(--space-6)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Farm Layout Preview</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', ...mono }}>
                {rows} x {columns} &middot; {totalGrids} grids
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  ...(activeTool === 'lighting' ? {
                    color: 'var(--color-accent)',
                    background: 'var(--color-accent-bg)',
                  } : {}),
                }}
                onClick={() => setActiveTool('lighting')}
              >
                <Lightbulb size={14} />
                Lighting
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  ...(activeTool === 'irrigation' ? {
                    color: 'var(--color-info)',
                    background: 'rgba(64, 196, 255, 0.08)',
                  } : {}),
                }}
                onClick={() => setActiveTool('irrigation')}
              >
                <Droplet size={14} />
                Irrigation
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetZones}>
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </header>

          {/* Zone selector bar */}
          <div
            style={{
              padding: 'var(--space-2) var(--space-6)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              background: 'var(--color-bg-surface)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {activeTool === 'lighting' ? 'Assign to lighting zone:' : 'Assign to irrigation zone:'}
            </span>
            <select
              className="input-field"
              style={{ width: 'auto', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--text-xs)', ...mono }}
              value={activeTool === 'lighting' ? activeLightingZone : activeIrrigationZone}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (activeTool === 'lighting') setActiveLightingZone(val)
                else setActiveIrrigationZone(val)
              }}
            >
              {(activeTool === 'lighting' ? lightingLegend : irrigationLegend).map((zone) => (
                <option key={zone} value={zone}>
                  {activeTool === 'lighting' ? 'LZ' : 'IZ'} {zone}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              Drag to paint zones
            </span>
          </div>

          {/* Grid canvas */}
          <div
            style={{
              flex: 1,
              padding: 'var(--space-6)',
              overflow: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
            onPointerUp={finalizeDrag}
            onPointerLeave={finalizeDrag}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
                gap: '2px',
                width: '100%',
                maxWidth: `${columns * 52}px`,
                aspectRatio: `${columns} / ${rows}`,
              }}
            >
              {Array.from({ length: totalGrids }, (_, idx) => {
                const lzIdx = (lightingAssignments[idx] ?? 1) - 1
                const izIdx = (irrigationAssignments[idx] ?? 1) - 1
                const isDragPreview = isCellInDragRect(idx)
                const accentColor = activeTool === 'lighting' ? ZONE_COLORS[lzIdx] : IZ_COLORS[izIdx]

                return (
                  <div
                    key={idx}
                    onPointerDown={() => handleCellPointerDown(idx)}
                    onPointerEnter={() => handleCellPointerEnter(idx)}
                    style={{
                      position: 'relative',
                      background: 'var(--color-bg-elevated)',
                      border: `1px solid ${isDragPreview ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'crosshair',
                      overflow: 'hidden',
                      transition: 'border-color var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    {/* Lighting zone overlay */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: ZONE_COLORS[lzIdx],
                        pointerEvents: 'none',
                      }}
                    />
                    {/* Drag preview overlay */}
                    {isDragPreview && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: accentColor,
                          opacity: 0.6,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {/* IZ label */}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 1,
                        right: 2,
                        fontSize: 8,
                        fontFamily: 'var(--font-mono)',
                        color: IZ_COLORS[izIdx],
                        opacity: 0.9,
                        pointerEvents: 'none',
                        lineHeight: 1,
                      }}
                    >
                      IZ{irrigationAssignments[idx] ?? 1}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend + summary footer */}
          <footer
            style={{
              padding: 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              {lightingLegend.map((zone) => (
                <span key={zone} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: ZONE_BORDERS[zone - 1],
                      border: `1px solid ${ZONE_BORDERS[zone - 1]}`,
                    }}
                  />
                  <span style={{ color: 'var(--color-text-secondary)', ...mono }}>LZ {zone}</span>
                </span>
              ))}
              <span style={{ width: 1, height: 14, background: 'var(--color-border)' }} />
              {irrigationLegend.map((zone) => (
                <span key={`iz-${zone}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                  <span
                    style={{
                      padding: '0 4px',
                      borderRadius: 2,
                      background: IZ_COLORS[zone - 1],
                      color: '#0A0A0B',
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      lineHeight: '14px',
                    }}
                  >
                    IZ{zone}
                  </span>
                </span>
              ))}
              <span style={{ width: 1, height: 14, background: 'var(--color-border)' }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                <Lightbulb size={12} /> {lightingZones} lighting
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                <Waves size={12} /> {irrigationZones} irrigation
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 'var(--space-6)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                ...mono,
              }}
            >
              <span>
                Nursery <strong style={{ color: 'var(--color-text-primary)' }}>{nurseryCapacity}</strong> seedlings
              </span>
              <span>
                Lead time <strong style={{ color: 'var(--color-text-primary)' }}>{seedlingLeadDays}</strong> days
              </span>
            </div>
          </footer>
        </section>
      </div>
    </main>
  )
}
