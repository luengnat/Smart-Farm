import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Sprout,
  Scissors,
  FlaskConical,
  ChevronRight,
  FastForward,
} from 'lucide-react'
import { fetchActions, completeAction, advanceWeek, type ActionItem } from '../lib/api'
import { cropLibrary } from '../constants/crops'

type Props = {
  planId: number | null
  onBack: () => void
}

const SURFACE: React.CSSProperties = {
  background: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
}

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  transplant: { icon: <Sprout size={16} />, label: 'Transplant', color: '#22c55e' },
  harvest: { icon: <Scissors size={16} />, label: 'Harvest', color: '#f59e0b' },
  'seed-nursery': { icon: <FlaskConical size={16} />, label: 'Seed Nursery', color: '#3b82f6' },
}

function ActionCard({
  action,
  onToggle,
}: {
  action: ActionItem
  onToggle: () => void
}) {
  const config = TYPE_CONFIG[action.type] ?? {
    icon: <Circle size={16} />,
    label: action.type,
    color: '#6b7280',
  }
  const crop = cropLibrary.find((c) => c.id === action.cropId)

  return (
    <div
      style={{
        ...SURFACE,
        padding: '0.875rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        opacity: action.completed ? 0.55 : 1,
        transition: 'opacity 150ms',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: action.completed ? 'var(--color-status-success)' : 'var(--color-text-muted)',
          padding: 0,
          display: 'flex',
          flexShrink: 0,
        }}
        aria-label={action.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {action.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>

      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          backgroundColor: `${config.color}18`,
          color: config.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {config.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              textDecoration: action.completed ? 'line-through' : 'none',
            }}
          >
            {config.label}
          </span>
          {crop && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: crop.accent,
                fontWeight: 600,
              }}
            >
              {crop.name}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {action.description}
        </span>
      </div>

      {action.revenueImpact > 0 && (
        <span
          style={{
            ...MONO,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}
        >
          ${action.revenueImpact.toFixed(2)}
        </span>
      )}
    </div>
  )
}

export function TasksPage({ planId, onBack }: Props) {
  const queryClient = useQueryClient()
  const [advancing, setAdvancing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['actions', planId],
    queryFn: () => fetchActions(planId!),
    enabled: !!planId,
    refetchInterval: 30000,
  })

  const toggleMutation = useMutation({
    mutationFn: (actionId: number) => completeAction(planId!, actionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actions', planId] }),
  })

  const advanceMutation = useMutation({
    mutationFn: () => advanceWeek(planId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions', planId] })
      setAdvancing(false)
    },
    onError: () => setAdvancing(false),
  })

  const actions = data?.actions ?? []
  const currentWeek = data?.currentWeek ?? 1

  const urgent = actions.filter((a) => a.priority === 'urgent')
  const thisWeek = actions.filter((a) => a.priority === 'this-week')
  const upcoming = actions.filter((a) => a.priority === 'upcoming')

  const completedCount = actions.filter((a) => a.completed).length
  const totalCount = actions.length

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
          Weekly Tasks
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          Confirm a plan to see weekly tasks
        </p>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Weekly Tasks</h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', ...MONO }}>
              Week {currentWeek}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {totalCount > 0 && (
            <span
              style={{
                ...MONO,
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {completedCount}/{totalCount}
            </span>
          )}
          <button
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            disabled={advancing}
            onClick={() => {
              setAdvancing(true)
              advanceMutation.mutate()
            }}
          >
            <FastForward size={14} />
            {advancing ? 'Advancing...' : 'Advance Week'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div
          style={{
            ...SURFACE,
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
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
                width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                height: '100%',
                borderRadius: 3,
                background: 'var(--color-status-success)',
                transition: 'width 300ms',
              }}
            />
          </div>
          <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {Math.round(totalCount > 0 ? (completedCount / totalCount) * 100 : 0)}%
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
          Loading tasks...
        </div>
      )}

      {/* Action groups */}
      {!isLoading && actions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
          No tasks for this week. All clear!
        </div>
      )}

      {!isLoading && urgent.length > 0 && (
        <ActionGroup
          title="Urgent"
          actions={urgent}
          accent="#ef4444"
          onToggle={(id) => toggleMutation.mutate(id)}
        />
      )}

      {!isLoading && thisWeek.length > 0 && (
        <ActionGroup
          title="This Week"
          actions={thisWeek}
          accent="#3b82f6"
          onToggle={(id) => toggleMutation.mutate(id)}
        />
      )}

      {!isLoading && upcoming.length > 0 && (
        <ActionGroup
          title="Upcoming"
          actions={upcoming}
          accent="#6b7280"
          onToggle={(id) => toggleMutation.mutate(id)}
        />
      )}
    </div>
  )
}

function ActionGroup({
  title,
  actions,
  accent,
  onToggle,
}: {
  title: string
  actions: ActionItem[]
  accent: string
  onToggle: (actionId: number) => void
}) {
  const completed = actions.filter((a) => a.completed).length

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.5rem',
          padding: '0 0.125rem',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            backgroundColor: accent,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          {title}
        </span>
        <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />
        <span
          style={{
            ...MONO,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            marginLeft: 'auto',
          }}
        >
          {completed}/{actions.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {actions.map((action) => (
          <ActionCard key={action.id} action={action} onToggle={() => onToggle(action.id)} />
        ))}
      </div>
    </div>
  )
}
