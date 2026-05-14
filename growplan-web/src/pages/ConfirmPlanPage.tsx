import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleCheckBig,
  Info,
  Leaf,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { SetupProgress } from '../components/SetupProgress'
import { StepActions } from '../components/StepActions'
import type { CropId } from '../constants/crops'
import { setupSteps } from '../constants/setupSteps'
import type { GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'

type ConfirmPlanPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  onBackToGenerate: () => void
  onConfirm: () => void | Promise<void>
}

export function ConfirmPlanPage({
  farm,
  generatedPlan,
  onBackToGenerate,
  onConfirm,
}: ConfirmPlanPageProps) {
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // All hooks before conditional returns (React Rules of Hooks)
  const resolvedPlan = generatedPlan

  const handleConfirm = async () => {
    setConfirming(true)
    setConfirmError(null)
    try {
      await onConfirm()
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Confirmation failed')
      setConfirming(false)
    }
  }

  const planWeeks = resolvedPlan
    ? (resolvedPlan.nurseryLoad?.length || Math.max(...(resolvedPlan.timelineRows ?? []).map((r) => r.harvestWeek), 8))
    : 8

  const timelineRows = useMemo(() => {
    return resolvedPlan?.timelineRows ?? []
  }, [resolvedPlan?.timelineRows])

  const nurseryLoad = useMemo(() => {
    return resolvedPlan?.nurseryLoad ?? []
  }, [resolvedPlan?.nurseryLoad])

  const accountInitials =
    farm.farmName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'GF'

  if (!resolvedPlan) {
    return (
      <div style={{ padding: 'var(--space-8)', color: 'var(--color-text-secondary)' }}>
        No plan data available. Go back to generate a plan first.
      </div>
    )
  }

  return (
    <main className="setup-page">
      <AppHeader accountName={farm.farmName} accountInitials={accountInitials} />

      <section className="setup-workspace">
        <SetupProgress activeStep={5} steps={setupSteps} />

        <section className="setup-main confirm-main">
          <section className="confirm-plan-card">
            <header className="confirm-heading">
              <h1>Confirm Plan</h1>
              <p>Review your AI-generated plan and confirm to get started.</p>
            </header>

            {confirmError && (
              <div style={{ padding: 'var(--space-3)', background: 'var(--color-error-bg, #fef2f2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-error, #ef4444)' }}>
                <AlertTriangle size={16} />
                {confirmError}
              </div>
            )}

            <div className="confirm-kpis">
              <article>
                <span className="kpi-icon ok">
                  <CircleCheckBig size={18} />
                </span>
                <p>Utilization</p>
                <strong>{resolvedPlan.utilizationPercent}%</strong>
              </article>
              <article>
                <span className="kpi-icon good">
                  <Leaf size={18} />
                </span>
                <p>Expected revenue</p>
                <strong>${((resolvedPlan.expectedRevenue ?? 0) / 1000).toFixed(1)}k</strong>
              </article>
              <article>
                <span className="kpi-icon safe">
                  <ShieldCheck size={18} />
                </span>
                <p>Stockout risk</p>
                <strong>{resolvedPlan.stockoutRisk}</strong>
              </article>
              <article>
                <span className="kpi-icon warn">
                  <RefreshCcw size={18} />
                </span>
                <p>Nursery risk</p>
                <strong>{resolvedPlan.seedlingCapacityRisk}</strong>
              </article>
            </div>

            <div className="confirm-content">
              <section className="confirm-grid-card">
                <header>
                  <h2>Farm Grid</h2>
                  <span>{resolvedPlan.rows || 0} x {resolvedPlan.columns || 0}</span>
                </header>
                <div
                  className="confirm-grid"
                  style={{ gridTemplateColumns: `repeat(${resolvedPlan.columns || 1}, minmax(0, 1fr))` }}
                >
                  {resolvedPlan.cells.map((cell, index) => (
                    <span key={index} style={{ backgroundColor: cell.color }} title={cell.label}>
                      {index + 1}
                    </span>
                  ))}
                </div>
              </section>

              <section className="confirm-timeline-card">
                <header>
                  <h2>{planWeeks}-Week Plan</h2>
                  <CalendarDays size={16} />
                </header>
                <div className="confirm-timeline-table">
                  <div className="timeline-head">
                    <span>Crop</span>
                    {Array.from({ length: planWeeks }, (_, i) => (
                      <b key={i}>W{i + 1}</b>
                    ))}
                  </div>
                  {timelineRows.map((row) => (
                    <div key={row.cropId} className="timeline-row-confirm">
                      <span>{row.label}</span>
                      <div className="timeline-track-confirm">
                        <i
                          style={{
                            gridColumn: `${row.seedWeek} / span 1`,
                            backgroundColor: '#dce9ff',
                          }}
                        >
                          Seed
                        </i>
                        <i
                          style={{
                            gridColumn: `${row.transplantWeek} / span ${row.growWeeks}`,
                            backgroundColor: row.color,
                          }}
                        >
                          Grow
                        </i>
                        <i
                          style={{
                            gridColumn: `${row.harvestWeek} / span 1`,
                            backgroundColor: '#c7e7d0',
                          }}
                        >
                          Harvest
                        </i>
                      </div>
                    </div>
                  ))}
                </div>
                <p>
                  <Info size={14} />
                  Plan accounts for crop rotation, resource availability, and market demand.
                </p>

                <div className="confirm-nursery-queue">
                  <header>
                    <h2>Nursery Queue</h2>
                    <CalendarDays size={16} />
                  </header>
                  <div className="confirm-timeline-table nursery-load-table">
                    <div className="timeline-head nursery-load-head">
                      <span>Week</span>
                      {nurseryLoad.slice(0, planWeeks).map((item) => (
                        <b key={item.week}>W{item.week}</b>
                      ))}
                    </div>
                    <div className="timeline-row-confirm nursery-load-row-confirm">
                      <span>Load</span>
                      <div className="timeline-track-confirm nursery-track-confirm">
                        {nurseryLoad.slice(0, planWeeks).map((item) => (
                          <i
                            key={item.week}
                            className={`risk-${item.risk.toLowerCase()}`}
                            style={{ gridColumn: `${item.week} / span 1` }}
                          >
                            {item.activeSeedlings}
                          </i>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p>
                    <Info size={14} />
                    Nursery capacity is {farm.nurseryCapacity} seedlings with a lead time of{' '}
                    {farm.seedlingLeadDays} days.
                  </p>
                </div>
              </section>
            </div>
          </section>

          <aside className="confirm-side-card">
            <h2>
              <Sparkles size={18} />
              AI Copilot
            </h2>

            <section className="copilot-note">
              <h3>Why this plan?</h3>
              <p>
                This plan balances utilization, reserve buffers, and crop cycles with your current
                farm constraints.
              </p>
              <ul>
                <li>
                  <CheckCircle2 size={14} />
                  Reserve settings reduce short-term stockout risk.
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  Crop mix aligns to weekly target and spacing profile.
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  Harvest windows are staggered for smoother operations.
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  Nursery batches are scheduled {Math.ceil(farm.seedlingLeadDays / 7)} weeks ahead of transplant.
                </li>
              </ul>
            </section>

            <section className="replan-note">
              <h3>
                <AlertTriangle size={16} />
                Re-plan suggested
              </h3>
              <p>Market demand may shift during Week 6-8. Keep this plan flexible for updates.</p>
            </section>

            <StepActions
              onBack={onBackToGenerate}
              onNext={handleConfirm}
              backLabel="Back"
              nextLabel={confirming ? 'Confirming...' : 'Confirm & Start'}
              nextDisabled={confirming}
              nextLoading={confirming}
            />
          </aside>
        </section>
      </section>
    </main>
  )
}
