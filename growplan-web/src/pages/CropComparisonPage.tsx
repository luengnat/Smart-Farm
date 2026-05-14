// src/pages/CropComparisonPage.tsx
import { useQuery } from '@tanstack/react-query'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'
import { fetchCropComparison } from '../lib/api'
import type { ComparisonCrop } from '../types/planning'

type Props = {
  planId: number | null
  onBack: () => void
}

const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-primary)',
}

const DARK_LEGEND_STYLE = { color: 'var(--color-text-secondary)' }

export function CropComparisonPage({ planId, onBack }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['comparison', planId],
    queryFn: () => fetchCropComparison(planId!),
    enabled: !!planId,
  })

  if (isError) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <p style={{ marginBottom: 'var(--space-4)' }}>Failed to load data.</p>
        <button className="btn btn-primary" onClick={() => refetch()}>Retry</button>
      </div>
    )
  }

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Crop Comparison</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          Generate a plan to compare crops
        </p>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <h2 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Crop Comparison</h2>
      </div>

      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '2rem' }}>
          Loading comparison...
        </p>
      )}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {(data.crops ?? []).map(crop => (
              <CropCard key={crop.cropId} crop={crop} isRecommended={crop.cropId === data.recommended} />
            ))}
          </div>

          {(data.crops ?? []).length >= 2 && (
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ color: 'var(--color-text-primary)', marginBottom: '1rem' }}>Radar Comparison</h3>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={buildRadarData(data.crops ?? [])}>
                  <PolarGrid stroke="var(--color-border)" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }} />
                  {(data.crops ?? []).map(crop => (
                    <Radar
                      key={crop.cropId}
                      name={crop.cropName}
                      dataKey={crop.cropId}
                      stroke={crop.color}
                      fill={crop.color}
                      fillOpacity={0.2}
                    />
                  ))}
                  <Legend wrapperStyle={DARK_LEGEND_STYLE} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CropCard({ crop, isRecommended }: { crop: ComparisonCrop; isRecommended: boolean }) {
  const m = crop.metrics ?? { revenuePerGridWeek: 0, costPerGridWeek: 0, netMarginPerGridWeek: 0, cycleWeeks: 0, marginPct: 0, seedCostPerCycle: 0 }
  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '1.25rem',
      position: 'relative',
    }}>
      {isRecommended && (
        <span style={{
          position: 'absolute',
          top: '-8px',
          right: '12px',
          background: 'var(--color-accent)',
          color: 'var(--color-bg-base)',
          padding: '2px 10px',
          borderRadius: '10px',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          Recommended
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: crop.color }} />
        <h4 style={{ margin: 0, color: 'var(--color-text-primary)' }}>{crop.cropName}</h4>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.5rem',
        fontSize: '0.85rem',
      }}>
        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '0.05em' }}>
          Revenue/grid-week
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          ${(m.revenuePerGridWeek ?? 0).toFixed(2)}
        </div>

        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '0.05em' }}>
          Cost/grid-week
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          ${(m.costPerGridWeek ?? 0).toFixed(2)}
        </div>

        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '0.05em' }}>
          Net margin
        </div>
        <div style={{
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          color: (m.netMarginPerGridWeek ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)',
        }}>
          ${(m.netMarginPerGridWeek ?? 0).toFixed(2)}
        </div>

        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '0.05em' }}>
          Cycle time
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          {m.cycleWeeks}w
        </div>

        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '0.05em' }}>
          Margin %
        </div>
        <div style={{
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          color: (m.marginPct ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)',
        }}>
          {(m.marginPct ?? 0).toFixed(1)}%
        </div>

        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '0.05em' }}>
          Seed cost/cycle
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          ${(m.seedCostPerCycle ?? 0).toFixed(2)}
        </div>
      </div>
    </div>
  )
}

function buildRadarData(crops: ComparisonCrop[]) {
  const dims = ['revenue', 'speed', 'yield', 'price', 'ease'] as const
  return dims.map(dim => {
    const entry: Record<string, string | number> = {
      dimension: dim.charAt(0).toUpperCase() + dim.slice(1),
    }
    for (const c of crops) {
      entry[c.cropId] = c.radarScores?.[dim] ?? 0
    }
    return entry
  })
}
