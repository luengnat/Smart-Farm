import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  LayoutGrid,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Sprout,
  Waves,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { SetupProgress } from '../components/SetupProgress'
import { StepActions } from '../components/StepActions'
import { cropLibrary, type CropId } from '../constants/crops'
import type { GeneratedPlanData, GoalData, NurseryBatch, NurseryLoadWeek, SetupFarmData } from '../types/planning'

type ReplanPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  onBackToDashboard: () => void
  onApplyPlan: (plan: GeneratedPlanData) => void
}

const getNurseryRisk = (utilizationPercent: number): NurseryLoadWeek['risk'] => {
  if (utilizationPercent >= 100) return 'High'
  if (utilizationPercent >= 80) return 'Medium'
  return 'Low'
}

const rebuildNurseryLoad = ({
  batches,
  horizonWeeks,
  capacity,
}: {
  batches: NurseryBatch[]
  horizonWeeks: number
  capacity: number
}): NurseryLoadWeek[] => {
  return Array.from({ length: horizonWeeks }, (_, weekIndex) => {
    const week = weekIndex + 1
    const activeSeedlings = batches
      .filter((batch) => batch.seedWeek <= week && batch.transplantWeek > week)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
    const utilizationPercent = capacity > 0 ? Math.round((activeSeedlings / capacity) * 100) : 0

    return {
      week,
      activeSeedlings,
      capacity,
      utilizationPercent,
      risk: getNurseryRisk(utilizationPercent),
    }
  })
}

const createCropDelayReplan = (
  plan: GeneratedPlanData,
  farm: SetupFarmData,
  delayedCropId: CropId,
): GeneratedPlanData => {
  const horizonWeeks = Math.max(8, plan.nurseryLoad.length)
  const seedlingLeadWeeks = Math.max(1, Math.ceil(farm.seedlingLeadDays / 7))

  const timelineRows = plan.timelineRows.map((row) => {
    if (row.cropId !== delayedCropId) return row

    const transplantWeek = Math.min(horizonWeeks, row.transplantWeek + 1)
    const harvestWeek = Math.min(horizonWeeks, row.harvestWeek + 1)

    return {
      ...row,
      transplantWeek,
      harvestWeek,
      growWeeks: Math.max(1, harvestWeek - transplantWeek),
    }
  })

  const shiftedSchedule = plan.nurserySchedule.map((batch) => {
    if (batch.cropId !== delayedCropId) return batch

    const transplantWeek = Math.min(horizonWeeks, batch.transplantWeek + 1)
    const seedWeek = Math.max(1, transplantWeek - seedlingLeadWeeks)

    return {
      ...batch,
      seedWeek,
      transplantWeek,
    }
  })

  const nurseryLoad = rebuildNurseryLoad({
    batches: shiftedSchedule,
    horizonWeeks,
    capacity: farm.nurseryCapacity,
  })

  const peakNurseryWeek = nurseryLoad.reduce(
    (peak: NurseryLoadWeek, week: NurseryLoadWeek) => (week.activeSeedlings > peak.activeSeedlings ? week : peak),
    nurseryLoad[0] ?? {
      week: 1,
      activeSeedlings: 0,
      capacity: farm.nurseryCapacity,
      utilizationPercent: 0,
      risk: 'Low' as const,
    },
  )

  const statusByTransplantWeek = new Map<number, NurseryBatch['status']>()
  nurseryLoad.forEach((week: NurseryLoadWeek) => {
    const status =
      week.risk === 'High' ? 'Over capacity' : week.risk === 'Medium' ? 'At capacity' : 'Scheduled'
    statusByTransplantWeek.set(week.week + 1, status)
  })

  return {
    ...plan,
    timelineRows,
    nurserySchedule: shiftedSchedule.map((batch) => ({
      ...batch,
      status: statusByTransplantWeek.get(batch.transplantWeek) ?? 'Scheduled',
    })),
    nurseryLoad,
    seedlingCapacityRisk: peakNurseryWeek.risk,
    stockoutRisk: plan.stockoutRisk === 'High' ? 'High' : 'Medium',
    expectedRevenue: Math.round(plan.expectedRevenue * 0.96),
  }
}

export function ReplanPage({
  farm,
  selectedCropIds,
  goalData,
  generatedPlan,
  onBackToDashboard,
  onApplyPlan,
}: ReplanPageProps) {
  const selectedCrops = useMemo(
    () => cropLibrary.filter((crop) => selectedCropIds.includes(crop.id)),
    [selectedCropIds],
  )

  const primaryCrop = selectedCrops[0] || cropLibrary[0]
  const primaryCropName = primaryCrop.name
  const secondaryCrop = selectedCrops[1] || selectedCrops[0] || cropLibrary[0]
  const secondaryCropName = secondaryCrop.name

  const analysisBlueprint = useMemo(
    () => [
      { label: 'Locking confirmed farm grid', icon: LayoutGrid },
      { label: `Reading incident: suspected disease in ${primaryCropName} Zone B`, icon: AlertTriangle },
      { label: `Isolating ${primaryCropName} affected zone and updating task order`, icon: Sprout },
      { label: 'Rebalancing nursery queue', icon: Waves },
      { label: 'Preparing operator-facing explanation', icon: CalendarDays },
    ],
    [primaryCropName],
  )
  const [analysisProgress, setAnalysisProgress] = useState<number[]>(
    Array.from({ length: analysisBlueprint.length }, () => 0),
  )
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  useEffect(() => {
    setAnalysisProgress(Array.from({ length: analysisBlueprint.length }, () => 0))
    setActiveStepIndex(0)
  }, [analysisBlueprint.length, farm, goalData, selectedCropIds, primaryCropName])

  useEffect(() => {
    if (activeStepIndex >= analysisBlueprint.length) return

    const timer = window.setInterval(() => {
      setAnalysisProgress((prev) => {
        const next = [...prev]
        const current = next[activeStepIndex] ?? 0
        const updated = Math.min(100, current + 9)
        next[activeStepIndex] = updated
        if (updated === 100) {
          window.setTimeout(() => {
            setActiveStepIndex((index) => Math.max(index, activeStepIndex + 1))
          }, 180)
        }
        return next
      })
    }, 95)

    return () => window.clearInterval(timer)
  }, [activeStepIndex, analysisBlueprint.length])

  const replanSteps = useMemo(() => [
    { id: 1, title: 'Confirmed Plan', subtitle: 'Use the locked dashboard plan' },
    { id: 2, title: 'Incident', subtitle: `${primaryCropName} disease alert detected` },
    { id: 3, title: 'Re-plan', subtitle: 'Update schedule and nursery load' },
    { id: 4, title: 'Apply', subtitle: 'Send suggestion back to dashboard' },
  ], [primaryCropName])

  const resolvedPlan = generatedPlan

  if (!resolvedPlan) {
    return (
      <div style={{ padding: 'var(--space-8)', color: 'var(--color-text-secondary)' }}>
        No plan data available for replanning.
      </div>
    )
  }

  const replannedPlan = useMemo(
    () => createCropDelayReplan(resolvedPlan, farm, primaryCrop.id),
    [farm, resolvedPlan, primaryCrop.id],
  )

  const peakNurseryLoad = useMemo(() => {
    return replannedPlan.nurseryLoad.reduce(
      (peak, item) => (item.activeSeedlings > peak.activeSeedlings ? item : peak),
      replannedPlan.nurseryLoad[0] ?? {
        week: 1,
        activeSeedlings: 0,
        capacity: farm.nurseryCapacity,
        utilizationPercent: 0,
        risk: 'Low' as const,
      },
    )
  }, [farm.nurseryCapacity, replannedPlan.nurseryLoad])

  const allAnalysisDone = activeStepIndex >= analysisBlueprint.length
  const analysisSteps = analysisBlueprint.map((step, index) => {
    const progress = analysisProgress[index] ?? 0
    const status =
      index < activeStepIndex ? ('done' as const) : index === activeStepIndex ? ('running' as const) : ('pending' as const)
    return {
      ...step,
      progress,
      status: allAnalysisDone ? ('done' as const) : status,
    }
  })

  const accountInitials =
    farm.farmName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'GF'

  return (
    <main className="setup-page">
      <AppHeader accountName={farm.farmName} accountInitials={accountInitials} />

      <section className="setup-workspace">
        <SetupProgress activeStep={3} steps={replanSteps} />

        <section className="setup-main generate-main replan-main">
          <section className="generate-engine-card">
            <h1>Re-plan</h1>

            <div className="replan-incident-card">
              <span>
                <AlertTriangle size={18} />
              </span>
              <div>
                <p>Risk scenario</p>
                <strong>Suspected disease in {primaryCropName} Zone B</strong>
              </div>
            </div>

            <div className="ai-build-panel">
              <div className="ai-build-badge replan-badge">
                <RefreshCcw size={30} />
              </div>
              <h2>Building a safer schedule</h2>
              <p>
                The grid stays locked while AgriMatrix isolates the affected zone, protects adjacent crops,
                and recalculates nursery load.
              </p>

              <div className="analysis-list">
                {analysisSteps.map((step) => {
                  const StepIcon = step.icon
                  return (
                    <article key={step.label} className="analysis-item">
                      <div className={`analysis-icon ${step.status}`}>
                        <StepIcon size={16} />
                      </div>
                      <div className="analysis-body">
                        <div className="analysis-head">
                          <p>{step.label}</p>
                          {step.status === 'done' ? (
                            <CheckCircle2 size={18} />
                          ) : step.status === 'running' ? (
                            <LoaderCircle size={18} className="spin" />
                          ) : (
                            <CircleDashed size={18} />
                          )}
                        </div>
                        <div className="analysis-track">
                          <span style={{ width: `${step.progress}%` }}></span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>

            <div className="replan-explain-card">
              <h2>Suggested trade-off</h2>
              <p>
                The affected {primaryCropName} rows are temporarily isolated, {secondaryCropName} reserve stays
                protected, and transplant tasks are re-sequenced to reduce spread risk.
                Yield may dip slightly, but containment and recovery are faster.
              </p>
            </div>

            <StepActions
              onBack={onBackToDashboard}
              onNext={() => {
                if (!allAnalysisDone) return
                onApplyPlan(replannedPlan)
              }}
              backLabel="Back to Dashboard"
              nextLabel="Apply Re-plan"
              nextDisabled={!allAnalysisDone}
              nextLoading={!allAnalysisDone}
            />
          </section>

          <aside className={`generate-preview-card ${allAnalysisDone ? '' : 'processing'}`}>
            <header>
              <h2>Updated Plan Preview</h2>
              <p>{allAnalysisDone ? `${primaryCropName} disease containment scenario applied` : 'Processing...'}</p>
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
              style={{ gridTemplateColumns: `repeat(${replannedPlan.columns}, minmax(0, 1fr))` }}
            >
              {replannedPlan.cells.map((cell, index) => (
                <span
                  key={index}
                  className={`generate-grid-cell ${cell.cropId === primaryCrop.id ? 'delayed' : ''}`}
                  style={{ backgroundColor: cell.color }}
                  title={cell.label}
                ></span>
              ))}
            </div>

            <div className="mini-timeline replan-phase-timeline">
              <h3>Updated Schedule</h3>
              <div className="replan-week-head">
                {replannedPlan.nurseryLoad.slice(0, 8).map((item) => (
                  <span key={item.week}>W{item.week}</span>
                ))}
              </div>
              <div className="plan-mini-table">
                {replannedPlan.timelineRows.map((row) => (
                  <article key={row.cropId} className="plan-mini-row">
                    <strong>{row.label}</strong>
                    <div className="plan-mini-track">
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
                  </article>
                ))}
              </div>
            </div>

            <div className="mini-timeline nursery-mini-timeline">
              <h3>Recalculated Nursery Load</h3>
              <div className="mini-months">
                {replannedPlan.nurseryLoad.slice(0, 8).map((item) => (
                  <span key={item.week}>W{item.week}</span>
                ))}
              </div>
              <div className="mini-rows nursery-mini-rows">
                <article className="mini-row nursery-load-row">
                  <small>Active</small>
                  <div className="mini-row-track">
                    {replannedPlan.nurseryLoad.slice(0, 8).map((item) => (
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

            <div className="generate-metrics replan-metrics">
              <article>
                <p>Utilization</p>
                <strong>{replannedPlan.utilizationPercent}%</strong>
              </article>
              <article>
                <p>Stockout risk</p>
                <strong>{replannedPlan.stockoutRisk}</strong>
              </article>
              <article>
                <p>Expected revenue</p>
                <strong>${(replannedPlan.expectedRevenue / 1000).toFixed(1)}k</strong>
              </article>
              <article>
                <p>Nursery peak</p>
                <strong>{peakNurseryLoad.activeSeedlings}</strong>
              </article>
            </div>

            <div className="generate-note warn">
              <AlertTriangle size={16} />
              {primaryCropName} Zone B is isolated and task sequencing is adjusted for containment.
            </div>

            <div className="generate-note">
              <ShieldCheck size={16} />
              Original grid allocation stays locked for all crops.
            </div>
            {!allAnalysisDone ? (
              <div className="generate-preview-overlay" aria-live="polite">
                <LoaderCircle size={18} className="spin" />
                Re-plan is processing...
              </div>
            ) : null}
          </aside>
        </section>
      </section>
    </main>
  )
}
