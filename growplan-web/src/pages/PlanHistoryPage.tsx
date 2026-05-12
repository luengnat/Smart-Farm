// src/pages/PlanHistoryPage.tsx
import { useQuery } from '@tanstack/react-query'
import { fetchHistory } from '../lib/api'
import type { SnapshotSummary } from '../types/planning'

type Props = {
  planId: number | null
  onBack: () => void
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  confirmed: { label: 'Plan Confirmed', color: '#27ae60', icon: '✓' },
  replanned: { label: 'Replanned', color: '#f39c12', icon: '↻' },
  'week-advanced': { label: 'Week Advanced', color: '#3498db', icon: '→' },
}

export function PlanHistoryPage({ planId, onBack }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', planId],
    queryFn: () => fetchHistory(planId!),
    enabled: !!planId,
  })

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Plan History</h2>
        <p style={{ color: '#888' }}>Generate a plan to see history</p>
        <button onClick={onBack}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 1rem' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Plan History</h2>
        {data && <span style={{ color: '#888', fontSize: '0.85rem' }}>{data.total} snapshots</span>}
      </div>

      {isLoading && <p>Loading history...</p>}

      {data && data.snapshots.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '2rem' }}>
          No snapshots yet. Confirm or advance a plan to create history entries.
        </p>
      )}

      {data && data.snapshots.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: '11px', top: '8px', bottom: '8px',
            width: '2px', background: '#e0e0e0',
          }} />
          {data.snapshots.map(snap => (
            <SnapshotEntry key={snap.id} snapshot={snap} />
          ))}
        </div>
      )}
    </div>
  )
}

function SnapshotEntry({ snapshot }: { snapshot: SnapshotSummary }) {
  const config = TYPE_CONFIG[snapshot.snapshotType] || { label: snapshot.snapshotType, color: '#888', icon: '?' }
  const date = new Date(snapshot.createdAt)
  const timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
      {/* Dot on timeline */}
      <div style={{
        position: 'absolute', left: '-2rem', top: '4px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: config.color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.65rem', fontWeight: 700,
      }}>
        {config.icon}
      </div>

      <div style={{
        padding: '0.75rem 1rem',
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        background: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <span style={{ fontWeight: 600, color: config.color }}>{config.label}</span>
          <span style={{ fontSize: '0.75rem', color: '#999' }}>{timeStr}</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: '#666' }}>
          <span>{snapshot.totalGrids} grids</span>
          <span>{snapshot.cropCount} crops</span>
          <span>${snapshot.revenuePerWeek.toFixed(2)}/wk</span>
        </div>
      </div>
    </div>
  )
}
