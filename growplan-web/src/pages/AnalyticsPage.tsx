// src/pages/AnalyticsPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, ResponsiveContainer,
} from 'recharts'
import { fetchAnalytics, fetchTimeline } from '../lib/api'
import { cropLibrary } from '../constants/crops'
import type { AnalyticsData, TimelineData } from '../types/planning'

type Tab = 'revenue-cost' | 'timeline' | 'profitability'

type Props = {
  planId: number | null
  onBack: () => void
}

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
        <h2>Analytics</h2>
        <p style={{ color: '#888' }}>Generate a plan to see analytics</p>
        <button onClick={onBack}>Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 1rem' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Analytics</h2>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['revenue-cost', 'timeline', 'profitability'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1rem',
              background: tab === t ? '#1a1a2e' : '#f0f0f0',
              color: tab === t ? '#fff' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {t === 'revenue-cost' ? 'Revenue & Cost' : t === 'timeline' ? 'Crop Timeline' : 'Profitability'}
          </button>
        ))}
      </div>

      {loading && <p>Loading analytics...</p>}

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
      <h3>Revenue vs Cost</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={analytics.profitByWeek}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="revenue" stroke="#9edb66" strokeWidth={2} />
          <Line type="monotone" dataKey="cost" stroke="#e74c3c" strokeWidth={2} />
          <Line type="monotone" dataKey="profit" stroke="#3498db" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <h3 style={{ marginTop: '2rem' }}>Revenue by Crop</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={analytics.revenueByWeek}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
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

      <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', fontSize: '0.9rem' }}>
        <div>Cumulative Revenue: <strong>${analytics.cumulativeRevenue.toFixed(2)}</strong></div>
        <div>Cumulative Cost: <strong>${analytics.cumulativeCost.toFixed(2)}</strong></div>
        <div>Cumulative Profit: <strong style={{ color: analytics.cumulativeProfit >= 0 ? '#27ae60' : '#e74c3c' }}>
          ${analytics.cumulativeProfit.toFixed(2)}
        </strong></div>
      </div>
    </div>
  )
}

function TimelineTab({ timeline }: { timeline: TimelineData }) {
  return (
    <div>
      <h3>Crop Timeline</h3>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Current week: {timeline.currentWeek} | Horizon: {timeline.horizonWeeks} weeks
      </p>
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg width={timeline.horizonWeeks * 40 + 60} height={timeline.crops.length * 60 + 40}>
          {/* Week headers */}
          {Array.from({ length: timeline.horizonWeeks }, (_, i) => (
            <text key={i} x={i * 40 + 60} y={15} fontSize={10} fill="#999" textAnchor="middle">
              W{i + 1}
            </text>
          ))}
          {/* Current week line */}
          <line
            x1={(timeline.currentWeek - 1) * 40 + 60}
            x2={(timeline.currentWeek - 1) * 40 + 60}
            y1={20}
            y2={timeline.crops.length * 60 + 30}
            stroke="#e74c3c"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          {/* Crop bars */}
          {timeline.crops.map((crop, ci) => (
            <g key={crop.cropId} transform={`translate(0, ${ci * 60 + 30})`}>
              <text x={0} y={15} fontSize={11} fill="#333">{crop.cropName}</text>
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
  return (
    <div>
      <h3>Weekly Profitability</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={analytics.profitByWeek}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="revenue" fill="#9edb66" name="Revenue" />
          <Bar dataKey="cost" fill="#e74c3c" name="Cost" />
          <Bar dataKey="profit" fill="#3498db" name="Profit" />
        </BarChart>
      </ResponsiveContainer>

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 0.5rem' }}>Margin Trend</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '8px',
              borderRadius: '4px',
              background: '#e0e0e0',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.max(0, analytics.profitByWeek[analytics.profitByWeek.length - 1]?.margin || 0)}%`,
                background: '#27ae60',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>
            {(analytics.profitByWeek[analytics.profitByWeek.length - 1]?.margin || 0).toFixed(1)}% final margin
          </span>
        </div>
      </div>
    </div>
  )
}
