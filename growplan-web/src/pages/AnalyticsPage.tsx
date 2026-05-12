// src/pages/AnalyticsPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, ResponsiveContainer,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'
import { fetchAnalytics, fetchTimeline } from '../lib/api'
import { cropLibrary } from '../constants/crops'
import { TabBar } from '../components/TabBar'
import type { AnalyticsData, TimelineData } from '../types/planning'

type Tab = 'revenue-cost' | 'timeline' | 'profitability'

type Props = {
  planId: number | null
  onBack: () => void
}

const TABS = [
  { id: 'revenue-cost', label: 'Revenue & Cost' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'profitability', label: 'Profitability' },
]

const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-primary)',
}

const DARK_AXIS_TICK = { fill: 'var(--color-text-secondary)', fontSize: 11 }
const DARK_AXIS_LINE = { stroke: 'var(--color-border)' }
const DARK_LEGEND_STYLE = { color: 'var(--color-text-secondary)' }

export function AnalyticsPage({ planId, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('revenue-cost')

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', planId],
    queryFn: () => fetchAnalytics(planId!),
    enabled: !!planId,
  })

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['timeline', planId],
    queryFn: () => fetchTimeline(planId!),
    enabled: !!planId,
  })

  const loading = tab === 'timeline' ? timelineLoading : analyticsLoading

  if (!planId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Analytics</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          Generate a plan to see analytics
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
        <h2 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Analytics</h2>
      </div>

      <TabBar tabs={TABS} activeTab={tab} onTabChange={(id) => setTab(id as Tab)} />

      {loading && (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '2rem' }}>
          Loading analytics...
        </p>
      )}

      {!loading && tab === 'revenue-cost' && analytics && (
        <RevenueCostTab analytics={analytics} />
      )}
      {!loading && tab === 'timeline' && timeline && (
        <TimelineTab timeline={timeline} />
      )}
      {!loading && tab === 'profitability' && analytics && (
        <ProfitabilityTab analytics={analytics} />
      )}
    </div>
  )
}

function RevenueCostTab({ analytics }: { analytics: AnalyticsData }) {
  const cropColors = Object.fromEntries(cropLibrary.map(c => [c.id, c.accent]))
  const cropIds = Object.keys(analytics.revenueByWeek[0] || {}).filter(k => k !== 'week' && k !== 'total')

  return (
    <div>
      <h3 style={{ color: 'var(--color-text-primary)', marginBottom: '1rem' }}>Revenue vs Cost</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={analytics.profitByWeek}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="week" tick={DARK_AXIS_TICK} axisLine={DARK_AXIS_LINE} />
          <YAxis tick={DARK_AXIS_TICK} axisLine={DARK_AXIS_LINE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={DARK_LEGEND_STYLE} />
          <Line type="monotone" dataKey="revenue" stroke="var(--color-chart-1)" strokeWidth={2} />
          <Line type="monotone" dataKey="cost" stroke="var(--color-chart-4)" strokeWidth={2} />
          <Line type="monotone" dataKey="profit" stroke="var(--color-chart-2)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <h3 style={{ marginTop: '2rem', color: 'var(--color-text-primary)', marginBottom: '1rem' }}>
        Revenue by Crop
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={analytics.revenueByWeek}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="week" tick={DARK_AXIS_TICK} axisLine={DARK_AXIS_LINE} />
          <YAxis tick={DARK_AXIS_TICK} axisLine={DARK_AXIS_LINE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={DARK_LEGEND_STYLE} />
          {cropIds.map(cid => (
            <Area
              key={cid}
              type="monotone"
              dataKey={cid}
              stackId="1"
              stroke={cropColors[cid] || '#888'}
              fill={cropColors[cid] || '#888'}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <div style={{
        display: 'flex',
        gap: '2rem',
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cumulative Revenue
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: 'var(--color-text-primary)', marginTop: '0.25rem' }}>
            ${analytics.cumulativeRevenue.toFixed(2)}
          </div>
        </div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cumulative Cost
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: 'var(--color-text-primary)', marginTop: '0.25rem' }}>
            ${analytics.cumulativeCost.toFixed(2)}
          </div>
        </div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cumulative Profit
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.1rem',
            marginTop: '0.25rem',
            color: analytics.cumulativeProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)',
          }}>
            ${analytics.cumulativeProfit.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineTab({ timeline }: { timeline: TimelineData }) {
  return (
    <div>
      <h3 style={{ color: 'var(--color-text-primary)', marginBottom: '1rem' }}>Crop Timeline</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Current week: <span style={{ fontFamily: 'var(--font-mono)' }}>{timeline.currentWeek}</span>
        {' | '}Horizon: <span style={{ fontFamily: 'var(--font-mono)' }}>{timeline.horizonWeeks}</span> weeks
      </p>
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg width={timeline.horizonWeeks * 40 + 60} height={timeline.crops.length * 60 + 40}>
          {/* Week headers */}
          {Array.from({ length: timeline.horizonWeeks }, (_, i) => (
            <text
              key={i}
              x={i * 40 + 60}
              y={15}
              fontSize={10}
              fill="var(--color-text-secondary)"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
            >
              W{i + 1}
            </text>
          ))}
          {/* Current week line */}
          <line
            x1={(timeline.currentWeek - 1) * 40 + 60}
            x2={(timeline.currentWeek - 1) * 40 + 60}
            y1={20}
            y2={timeline.crops.length * 60 + 30}
            stroke="var(--color-error)"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          {/* Crop bars */}
          {timeline.crops.map((crop, ci) => (
            <g key={crop.cropId} transform={`translate(0, ${ci * 60 + 30})`}>
              <text x={0} y={15} fontSize={11} fill="var(--color-text-primary)">{crop.cropName}</text>
              {crop.intervals.map((interval, ii) => (
                <rect
                  key={ii}
                  x={(interval.startWeek - 1) * 40 + 60}
                  y={2}
                  width={(interval.endWeek - interval.startWeek + 1) * 40}
                  height={20}
                  fill={crop.color}
                  fillOpacity={interval.phase === 'harvest' ? 1 : 0.5}
                  rx={3}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function ProfitabilityTab({ analytics }: { analytics: AnalyticsData }) {
  const finalMargin = analytics.profitByWeek[analytics.profitByWeek.length - 1]?.margin || 0

  return (
    <div>
      <h3 style={{ color: 'var(--color-text-primary)', marginBottom: '1rem' }}>Weekly Profitability</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={analytics.profitByWeek}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="week" tick={DARK_AXIS_TICK} axisLine={DARK_AXIS_LINE} />
          <YAxis tick={DARK_AXIS_TICK} axisLine={DARK_AXIS_LINE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={DARK_LEGEND_STYLE} />
          <Bar dataKey="revenue" fill="var(--color-chart-1)" name="Revenue" />
          <Bar dataKey="cost" fill="var(--color-chart-4)" name="Cost" />
          <Bar dataKey="profit" fill="var(--color-chart-2)" name="Profit" />
        </BarChart>
      </ResponsiveContainer>

      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        <h4 style={{ margin: '0 0 0.75rem', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Margin Trend
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '8px',
              borderRadius: '4px',
              background: 'var(--color-border)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.max(0, finalMargin)}%`,
                background: 'var(--color-accent)',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            color: 'var(--color-text-secondary)',
          }}>
            {finalMargin.toFixed(1)}% final margin
          </span>
        </div>
      </div>
    </div>
  )
}
