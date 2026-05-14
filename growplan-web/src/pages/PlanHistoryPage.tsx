// src/pages/PlanHistoryPage.tsx
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { fetchHistory } from '../lib/api'
import type { SnapshotSummary } from '../types/planning'

type Props = {
  planId: number | null
  onBack: () => void
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  confirmed: { label: 'Plan Confirmed', color: 'var(--color-success)', icon: '✓' },
  replanned: { label: 'Replanned', color: 'var(--color-warning)', icon: '↻' },
  'week-advanced': { label: 'Week Advanced', color: 'var(--color-info)', icon: '→' },
}

export function PlanHistoryPage({ planId, onBack }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['history', planId],
    queryFn: () => fetchHistory(planId!),
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
        <h2 style={{ color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Plan History</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          Generate a plan to see history
        </p>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <h2 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Plan History</h2>
        {data && (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            {data.total ?? 0} snapshots
          </span>
        )}
      </div>

      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '2rem' }}>
          Loading history...
        </p>
      )}

      {data && (data.snapshots ?? []).length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
          No snapshots yet. Confirm or advance a plan to create history entries.
        </p>
      )}

      {data && (data.snapshots ?? []).length > 0 && (
        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: '11px',
            top: '8px',
            bottom: '8px',
            width: '2px',
            background: 'var(--color-border)',
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
  const config = TYPE_CONFIG[snapshot.snapshotType] || {
    label: snapshot.snapshotType,
    color: 'var(--color-text-secondary)',
    icon: '?',
  }
  const date = snapshot.createdAt ? new Date(snapshot.createdAt) : null
  const timeStr = date && !isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : 'Pending'

  return (
    <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
      {/* Dot on timeline */}
      <div style={{
        position: 'absolute',
        left: '-2rem',
        top: '4px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: config.color,
        color: 'var(--color-bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.6rem',
        fontWeight: 700,
      }}>
        {config.icon}
      </div>

      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.4rem',
        }}>
          <span style={{ fontWeight: 600, color: config.color }}>{config.label}</span>
          <span style={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
          }}>
            {timeStr}
          </span>
        </div>
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          fontSize: '0.8rem',
          color: 'var(--color-text-secondary)',
        }}>
          <span>{snapshot.totalGrids} grids</span>
          <span>{snapshot.cropCount} crops</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            ${(snapshot.revenuePerWeek ?? 0).toFixed(2)}/wk
          </span>
        </div>
      </div>
    </div>
  )
}
