import { type CSSProperties, useMemo, useState } from 'react'
import { Check, Grid3X3, Leaf, Search, Sprout, Timer, X } from 'lucide-react'
import { cropLibrary, type CropCategory, type CropId } from '../constants/crops'

type SelectCropsPageProps = {
  farmName: string
  selectedCropIds: CropId[]
  onBackToSetup: () => void
  onContinue: (selectedCropIds: CropId[]) => void
}

const categoryIconByCrop: Record<CropCategory, typeof Sprout> = {
  'Leafy Green': Leaf,
  Herb: Sprout,
}

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono)',
}

const CATEGORIES: ('All' | CropCategory)[] = ['All', 'Leafy Green', 'Herb']

export function SelectCropsPage({
  farmName,
  selectedCropIds: initialSelectedCropIds,
  onBackToSetup,
  onContinue,
}: SelectCropsPageProps) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'All' | CropCategory>('All')
  const [selectedCropIds, setSelectedCropIds] = useState<CropId[]>(initialSelectedCropIds)

  const visibleCrops = useMemo(() => {
    return cropLibrary.filter((crop) => {
      const matchesCategory = categoryFilter === 'All' || crop.category === categoryFilter
      const matchesQuery = crop.name.toLowerCase().includes(query.trim().toLowerCase())
      return matchesCategory && matchesQuery
    })
  }, [categoryFilter, query])

  const selectedCrops = useMemo(() => {
    return cropLibrary.filter((crop) => selectedCropIds.includes(crop.id))
  }, [selectedCropIds])

  const totalEstimatedYield = useMemo(() => {
    const value = selectedCrops.reduce((acc, crop) => acc + crop.yieldPerGrid, 0)
    return value.toFixed(1)
  }, [selectedCrops])

  const toggleCrop = (cropId: CropId) => {
    setSelectedCropIds((prev) =>
      prev.includes(cropId) ? prev.filter((id) => id !== cropId) : [...prev, cropId],
    )
  }

  const removeCrop = (cropId: CropId) => {
    setSelectedCropIds((prev) => prev.filter((id) => id !== cropId))
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
            ...mono,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Step 2 of 5 &mdash; Select Crops
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            ...mono,
          }}
        >
          {farmName}
        </span>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left: Crop library */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search + filter bar */}
          <div
            style={{
              padding: 'var(--space-4) var(--space-6)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              background: 'var(--color-bg-surface)',
            }}
          >
            <h1
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                marginRight: 'var(--space-4)',
              }}
            >
              Crop Library
            </h1>
            <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                className="input-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search crops..."
                aria-label="Search crops"
                style={{ paddingLeft: 'var(--space-8)', width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {CATEGORIES.map((cat) => {
                const isActive = categoryFilter === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: 'var(--space-1) var(--space-3)',
                      ...(isActive
                        ? {
                            color: 'var(--color-accent)',
                            background: 'var(--color-accent-bg)',
                          }
                        : {}),
                    }}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat === 'All' ? 'All' : cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Crop card grid */}
          <div
            style={{
              flex: 1,
              padding: 'var(--space-6)',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--space-3)',
              }}
            >
              {visibleCrops.map((crop) => {
                const isSelected = selectedCropIds.includes(crop.id)
                const CategoryIcon = categoryIconByCrop[crop.category]

                return (
                  <article
                    key={crop.id}
                    onClick={() => toggleCrop(crop.id)}
                    style={{
                      position: 'relative',
                      background: 'var(--color-bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-4)',
                      cursor: 'pointer',
                      transition: 'border-color var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    {/* Selected checkmark */}
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: 'var(--color-accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={12} style={{ color: '#0A0A0B' }} />
                      </div>
                    )}

                    {/* Crop icon circle */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: crop.accent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 'var(--space-3)',
                        opacity: isSelected ? 1 : 0.7,
                      }}
                    >
                      <CategoryIcon size={20} style={{ color: '#0A0A0B' }} />
                    </div>

                    {/* Name */}
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      {crop.name}
                    </div>

                    {/* Category badge */}
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        padding: '1px var(--space-2)',
                        background: 'var(--color-bg-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: 'var(--space-3)',
                        ...mono,
                      }}
                    >
                      {crop.category}
                    </span>

                    {/* Stats */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-3)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        <Timer size={12} />
                        {crop.growthDays}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        <Grid3X3 size={12} />
                        {crop.yieldPerGrid.toFixed(1)} kg
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* Right: Selected crops sidebar */}
        <aside
          style={{
            borderLeft: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--color-bg-surface)',
          }}
        >
          {/* Sidebar header */}
          <header
            style={{
              padding: 'var(--space-4) var(--space-4) var(--space-3)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-1)',
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                }}
              >
                Selected Crops
              </h2>
              <span
                style={{
                  ...mono,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-bg)',
                  padding: '1px var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                }}
              >
                {selectedCrops.length}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Click cards to add or remove.
            </p>
          </header>

          {/* Selected list */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {selectedCrops.length === 0 && (
              <div
                style={{
                  padding: 'var(--space-6) var(--space-2)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                No crops selected yet.
              </div>
            )}
            {selectedCrops.map((crop) => {
              const CategoryIcon = categoryIconByCrop[crop.category]
              return (
                <div
                  key={crop.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: crop.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <CategoryIcon size={14} style={{ color: '#0A0A0B' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      {crop.name}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        ...mono,
                      }}
                    >
                      {crop.yieldPerGrid.toFixed(1)} kg/grid
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCrop(crop.id)}
                    aria-label={`Remove ${crop.name}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'color var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Summary + actions */}
          <footer
            style={{
              padding: 'var(--space-4)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                ...mono,
              }}
            >
              <span>Total crops</span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {selectedCrops.length}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                ...mono,
              }}
            >
              <span>Est. yield</span>
              <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                {totalEstimatedYield} kg/grid
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={selectedCrops.length === 0}
              onClick={() => onContinue(selectedCropIds)}
            >
              Continue
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              onClick={onBackToSetup}
            >
              Back
            </button>
          </footer>
        </aside>
      </div>
    </main>
  )
}
