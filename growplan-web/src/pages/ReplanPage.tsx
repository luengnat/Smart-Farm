import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { StepActions } from '../components/StepActions'
import { cropLibrary, type CropId } from '../constants/crops'
import { generatePlan } from '../lib/api'
import type { GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'

type ReplanPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  farmId: number | null
  onBackToDashboard: () => void
  onApplyPlan: (plan: GeneratedPlanData, planId: number | null) => void
}

export function ReplanPage({
  farm,
  selectedCropIds,
  goalData,
  generatedPlan,
  farmId,
  onBackToDashboard,
  onApplyPlan,
}: ReplanPageProps) {
  const selectedCrops = useMemo(
    () => cropLibrary.filter((crop) => selectedCropIds.includes(crop.id)),
    [selectedCropIds],
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newPlan, setNewPlan] = useState<GeneratedPlanData | null>(null)
  const [newPlanId, setNewPlanId] = useState<number | null>(null)

  const resolvedPlan = newPlan ?? generatedPlan

  const planWeeks = resolvedPlan
    ? (resolvedPlan.nurseryLoad?.length || Math.max(...(resolvedPlan.timelineRows ?? []).map((r) => r.harvestWeek), 8))
    : 8

  const accountInitials =
    farm.farmName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'GF'

  const handleRegenerate = async () => {
    if (!farmId) {
      setError('No farm ID found. Please set up your farm first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await generatePlan({ farm, selectedCropIds, goalData }, farmId)
      setNewPlan(result.plan)
      if (result.planId) setNewPlanId(result.planId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Plan generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!generatedPlan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-16)', color: 'var(--color-text-secondary)' }}>
        <p>No plan data available for replanning.</p>
        <button className="btn btn-primary" onClick={onBackToDashboard}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  const timelineRows = resolvedPlan.timelineRows ?? []
  const nurseryLoad = resolvedPlan.nurseryLoad ?? []
  const peakNursery = nurseryLoad.length > 0
    ? nurseryLoad.reduce(
        (peak, item) => (item.activeSeedlings > peak.activeSeedlings ? item : peak),
        nurseryLoad[0],
      )
    : { week: 1, activeSeedlings: 0, capacity: farm.nurseryCapacity, utilizationPercent: 0, risk: 'Low' as const }

  return (
    <main className="setup-page">
      <AppHeader accountName={farm.farmName} accountInitials={accountInitials} />

      <section className="setup-workspace">
        <section className="setup-main generate-main replan-main">
          <section className="generate-engine-card">
            <h1>Re-plan</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              Regenerate your plan with updated parameters. The AI solver will create a new optimal schedule.
            </p>

            {error && (
              <div style={{ padding: 'var(--space-3)', background: 'var(--color-error-bg, #fef2f2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-error, #ef4444)' }}>
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            <div className="replan-incident-card">
              <span>
                <RefreshCcw size={18} />
              </span>
              <div>
                <p>Current plan</p>
                <strong>{resolvedPlan.utilizationPercent}% utilization, ${((resolvedPlan.expectedRevenue ?? 0) / 1000).toFixed(1)}k/wk revenue</strong>
              </div>
            </div>

            <div className="ai-build-panel">
              <div className="ai-build-badge replan-badge">
                <RefreshCcw size={30} />
              </div>
              <h2>{newPlan ? 'New plan ready' : 'Regenerate plan'}</h2>
              <p>
                {newPlan
                  ? 'Review the new plan below. You can apply it to replace your current plan, or go back to keep the existing one.'
                  : 'Click regenerate to create a new plan. The AI solver will recalculate the optimal crop layout, schedule, and nursery load.'}
              </p>

              {!newPlan && !loading && (
                <button className="btn btn-primary btn-lg" onClick={handleRegenerate}>
                  Regenerate Plan
                </button>
              )}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
                  <LoaderCircle size={20} className="spin" />
                  Solving optimal plan...
                </div>
              )}
            </div>

            {newPlan && (
              <div className="replan-explain-card">
                <h2>Comparison</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                  <div>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>Previous</p>
                    <p style={{ margin: '2px 0' }}>{generatedPlan.utilizationPercent}% utilization</p>
                    <p style={{ margin: 0 }}>${((generatedPlan.expectedRevenue ?? 0) / 1000).toFixed(1)}k/wk</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>New</p>
                    <p style={{ margin: '2px 0' }}>{newPlan.utilizationPercent}% utilization</p>
                    <p style={{ margin: 0 }}>${((newPlan.expectedRevenue ?? 0) / 1000).toFixed(1)}k/wk</p>
                  </div>
                </div>
              </div>
            )}

            <StepActions
              onBack={onBackToDashboard}
              onNext={() => {
                if (newPlan) onApplyPlan(newPlan, newPlanId)
              }}
              backLabel="Back to Dashboard"
              nextLabel={newPlan ? 'Apply New Plan' : 'Regenerate Plan'}
              nextDisabled={!newPlan}
              onNextDisabledAttempt={!newPlan ? handleRegenerate : undefined}
            />
          </section>

          <aside className="generate-preview-card">
            <header>
              <h2>Plan Preview</h2>
              <p>{newPlan ? 'New plan' : 'Current plan'}</p>
            </header>

            <div className="generate-legend">
              {selectedCrops.map((crop) => (
                <span key={crop.id}>
                  <b style={{ backgroundColor: crop.accent }}></b>
                  {crop.name}
                </span>
              ))}
            </div>

            <div
              className="generate-grid replan-grid"
              style={{ gridTemplateColumns: `repeat(${resolvedPlan.columns || 1}, minmax(0, 1fr))` }}
            >
              {resolvedPlan.cells.map((cell, index) => (
                <span
                  key={index}
                  className="generate-grid-cell"
                  style={{ backgroundColor: cell.color }}
                  title={cell.label}
                ></span>
              ))}
            </div>

            {timelineRows.length > 0 && (
              <div className="mini-timeline replan-phase-timeline">
                <h3>Schedule</h3>
                <div className="replan-week-head">
                  {nurseryLoad.slice(0, planWeeks).map((item) => (
                    <span key={item.week}>W{item.week}</span>
                  ))}
                </div>
                <div className="plan-mini-table">
                  {timelineRows.map((row) => (
                    <article key={row.cropId} className="plan-mini-row">
                      <strong>{row.label}</strong>
                      <div className="plan-mini-track">
                        <i style={{ gridColumn: `${row.seedWeek} / span 1`, backgroundColor: '#dce9ff' }}>Seed</i>
                        <i style={{ gridColumn: `${row.transplantWeek} / span ${row.growWeeks}`, backgroundColor: row.color }}>Grow</i>
                        <i style={{ gridColumn: `${row.harvestWeek} / span 1`, backgroundColor: '#c7e7d0' }}>Harvest</i>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {nurseryLoad.length > 0 && (
              <div className="mini-timeline nursery-mini-timeline">
                <h3>Nursery Load</h3>
                <div className="mini-months">
                  {nurseryLoad.slice(0, planWeeks).map((item) => (
                    <span key={item.week}>W{item.week}</span>
                  ))}
                </div>
                <div className="mini-rows nursery-mini-rows">
                  <article className="mini-row nursery-load-row">
                    <small>Active</small>
                    <div className="mini-row-track">
                      {nurseryLoad.slice(0, planWeeks).map((item) => (
                        <span
                          key={item.week}
                          className={`nursery-load-bar risk-${item.risk.toLowerCase()}`}
                          style={{ gridColumn: `${item.week} / span 1` }}
                          title={`${item.activeSeedlings} seedlings in Week ${item.week}`}
                        ></span>
                      ))}
                    </div>
                  </article>
                </div>
              </div>
            )}

            <div className="generate-metrics replan-metrics">
              <article>
                <p>Utilization</p>
                <strong>{resolvedPlan.utilizationPercent}%</strong>
              </article>
              <article>
                <p>Stockout risk</p>
                <strong>{resolvedPlan.stockoutRisk}</strong>
              </article>
              <article>
                <p>Revenue</p>
                <strong>${((resolvedPlan.expectedRevenue ?? 0) / 1000).toFixed(1)}k</strong>
              </article>
              <article>
                <p>Nursery peak</p>
                <strong>{peakNursery.activeSeedlings}</strong>
              </article>
            </div>

            <div className="generate-note">
              <ShieldCheck size={16} />
              Grid allocation stays locked for all confirmed crops.
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
