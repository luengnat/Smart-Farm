// src/pages/CropComparisonPage.tsx
import { useQuery } from '@tanstack/react-query'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip,
} from 'recharts'
import { fetchCropComparison } from '../lib/api'
import type { ComparisonCrop } from '../types/planning'

type Props = {
  planId: number | null
  onBack: () => void
}

export function CropComparisonPage({ planId, onBack }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['comparison', planId],
    queryFn: () => fetchCropComparison(planId!),
    enabled: !!planId,
  })

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Crop Comparison</h2>
        <p style={{ color: '#888' }}>Generate a plan to compare crops</p>
        <button onClick={onBack}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 1rem' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Crop Comparison</h2>
      </div>

      {isLoading && <p>Loading comparison...</p>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {data.crops.map(crop => (
              <CropCard key={crop.cropId} crop={crop} isRecommended={crop.cropId === data.recommended} />
            ))}
          </div>

          {data.crops.length >= 2 && (
            <div style={{ marginTop: '2rem' }}>
              <h3>Radar Comparison</h3>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={buildRadarData(data.crops)}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" />
                  <PolarRadiusAxis domain={[0, 100]} />
                  {data.crops.map(crop => (
                    <Radar
                      key={crop.cropId}
                      name={crop.cropName}
                      dataKey={crop.cropId}
                      stroke={crop.color}
                      fill={crop.color}
                      fillOpacity={0.2}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
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
  const m = crop.metrics
  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '10px',
      padding: '1.25rem',
      position: 'relative',
      background: '#fff',
    }}>
      {isRecommended && (
        <span style={{
          position: 'absolute', top: '-8px', right: '12px',
          background: '#27ae60', color: '#fff',
          padding: '2px 10px', borderRadius: '10px',
          fontSize: '0.75rem', fontWeight: 600,
        }}>
          Recommended
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: crop.color }} />
        <h4 style={{ margin: 0 }}>{crop.cropName}</h4>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>Revenue/grid-week</div><div style={{ textAlign: 'right', fontWeight: 600 }}>${m.revenuePerGridWeek.toFixed(2)}</div>
        <div>Cost/grid-week</div><div style={{ textAlign: 'right' }}>${m.costPerGridWeek.toFixed(2)}</div>
        <div>Net margin</div><div style={{ textAlign: 'right', color: m.netMarginPerGridWeek >= 0 ? '#27ae60' : '#e74c3c' }}>
          ${m.netMarginPerGridWeek.toFixed(2)}
        </div>
        <div>Cycle time</div><div style={{ textAlign: 'right' }}>{m.cycleWeeks} weeks</div>
        <div>Margin %</div><div style={{ textAlign: 'right' }}>{m.marginPct.toFixed(1)}%</div>
        <div>Seed cost/cycle</div><div style={{ textAlign: 'right' }}>${m.seedCostPerCycle.toFixed(2)}</div>
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
      entry[c.cropId] = c.radarScores[dim]
    }
    return entry
  })
}
