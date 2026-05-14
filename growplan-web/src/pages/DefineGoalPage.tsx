import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Goal, ShieldCheck, Sparkles } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { SetupProgress } from '../components/SetupProgress'
import { StepActions } from '../components/StepActions'
import { cropLibrary, type CropId } from '../constants/crops'
import { setupSteps } from '../constants/setupSteps'
import type { CropGoalsById, GoalData, GoalPriority, SetupFarmData } from '../types/planning'

type DefineGoalPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  initialGoalData: GoalData
  onBackToSelectCrops: () => void
  onContinue: (goalData: GoalData) => void
}

const planningOptions = ['4 weeks', '8 weeks', '12 weeks', '16 weeks']
const GOAL_DECIMAL_STEP = 0.1

const floorToGoalStep = (value: number) => {
  return Number((Math.floor(value / GOAL_DECIMAL_STEP + 1e-9) * GOAL_DECIMAL_STEP).toFixed(1))
}

const roundToGoalStep = (value: number) => {
  const rounded = Math.round(value / GOAL_DECIMAL_STEP) * GOAL_DECIMAL_STEP
  return Number(rounded.toFixed(1))
}

export function DefineGoalPage({
  farm,
  selectedCropIds,
  initialGoalData,
  onBackToSelectCrops,
  onContinue,
}: DefineGoalPageProps) {
  const [planningHorizon, setPlanningHorizon] = useState(initialGoalData.planningHorizon)
  const [priority, setPriority] = useState<GoalPriority>(initialGoalData.priority)
  const [cropGoals, setCropGoals] = useState<CropGoalsById>(initialGoalData.cropGoals)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const shouldClearSubmitErrorRef = useRef(false)

  const selectedCrops = useMemo(
    () => cropLibrary.filter((crop) => selectedCropIds.includes(crop.id)),
    [selectedCropIds],
  )
  const selectedCropById = useMemo(
    () => new Map(selectedCrops.map((crop) => [crop.id, crop])),
    [selectedCrops],
  )
  const availableCapacityPerWeek = useMemo(() => farm.rows * farm.columns * farm.levels, [farm.columns, farm.rows, farm.levels])

  const optimizationLabel = useMemo(() => {
    return priority === 'maximize-space' ? 'Maximize space utilization' : 'Minimize stockout risk'
  }, [priority])

  const totalTargetPerWeek = useMemo(() => {
    return selectedCrops.reduce((total, crop) => total + (cropGoals[crop.id]?.targetPerWeek ?? 0), 0)
  }, [cropGoals, selectedCrops])

  const averageReserve = useMemo(() => {
    if (selectedCrops.length === 0) return 0
    const totalReserve = selectedCrops.reduce(
      (total, crop) => total + (cropGoals[crop.id]?.reservePercent ?? 0),
      0,
    )
    return Math.round(totalReserve / selectedCrops.length)
  }, [cropGoals, selectedCrops])

  const capacityState = useMemo(() => {
    const requiredGridPerWeek = selectedCrops.reduce((total, crop) => {
      const target = cropGoals[crop.id]?.targetPerWeek ?? 0
      const reserve = cropGoals[crop.id]?.reservePercent ?? 0
      const targetWithReserve = target * (1 + reserve / 100)
      return total + targetWithReserve / (crop.yieldPerGrid || 1)
    }, 0)
    return {
      availableCapacityPerWeek,
      requiredGridPerWeek,
      exceeded: requiredGridPerWeek > availableCapacityPerWeek,
    }
  }, [availableCapacityPerWeek, cropGoals, selectedCrops])
  const capacityUsageRawPercent = useMemo(() => {
    if (capacityState.availableCapacityPerWeek === 0) return 0
    return (capacityState.requiredGridPerWeek / capacityState.availableCapacityPerWeek) * 100
  }, [capacityState.availableCapacityPerWeek, capacityState.requiredGridPerWeek])
  const capacityBarPercent = Math.min(100, capacityUsageRawPercent)
  const capacityGap = Math.max(
    0,
    capacityState.availableCapacityPerWeek - capacityState.requiredGridPerWeek,
  )
  const hasAnyIncreaseCapacityStep = useMemo(() => {
    if (capacityState.exceeded || capacityGap <= 0 || selectedCrops.length === 0) return false
    const epsilon = 1e-6

    return selectedCrops.some((crop) => {
      const target = cropGoals[crop.id]?.targetPerWeek ?? 0
      const reserve = cropGoals[crop.id]?.reservePercent ?? 0
      const targetStepGrid = (GOAL_DECIMAL_STEP * (1 + reserve / 100)) / (crop.yieldPerGrid || 1)
      const reserveStepGrid = target > 0 ? (target * 0.01) / (crop.yieldPerGrid || 1) : Number.POSITIVE_INFINITY

      const canIncreaseTarget = targetStepGrid <= capacityGap + epsilon
      const canIncreaseReserve = reserve < 50 && reserveStepGrid <= capacityGap + epsilon
      return canIncreaseTarget || canIncreaseReserve
    })
  }, [capacityGap, capacityState.exceeded, cropGoals, selectedCrops])
  const isCapacityFull =
    !capacityState.exceeded &&
    capacityState.availableCapacityPerWeek > 0 &&
    (capacityGap <= 0.05 || !hasAnyIncreaseCapacityStep)
  const capacityUsageDisplayPercent = isCapacityFull
    ? 100
    : Math.min(99.9, Math.floor(capacityUsageRawPercent * 10) / 10)
  const capacityUsageDisplayText = capacityUsageDisplayPercent.toFixed(1).replace(/\.0$/, '')

  useEffect(() => {
    if (isCapacityFull && submitError) {
      setSubmitError(null)
    }
  }, [isCapacityFull, submitError])

  useEffect(() => {
    if (!submitError || !shouldClearSubmitErrorRef.current) return
    shouldClearSubmitErrorRef.current = false
    setSubmitError(null)
  }, [cropGoals, submitError])

  const getCapacityErrorMessage = () => {
    if (capacityState.exceeded) {
      return 'Please decrease the Goal/week or Reserve to fit available capacity.'
    }
    return 'Please increase the Goal/week or Reserve to reach maximum space utilization.'
  }

  const planPreview = useMemo(
    () => ({
      cropSummaries: selectedCrops.map((crop) => ({
        cropId: crop.id,
        label: crop.name,
        color: crop.accent,
        allocatedCells: 0,
        targetPerWeek: cropGoals[crop.id]?.targetPerWeek ?? 0,
        reservePercent: cropGoals[crop.id]?.reservePercent ?? 0,
        seedlingsPerWeek: 0,
      })),
      nurseryLoad: [] as Array<{ week: number; activeSeedlings: number; capacity: number; utilizationPercent: number; risk: 'Low' | 'Medium' | 'High' }>,
      seedlingCapacityRisk: 'Low' as 'Low' | 'Medium' | 'High',
    }),
    [cropGoals, selectedCrops],
  )

  const totalSeedlingsPerWeek = useMemo(() => {
    return planPreview.cropSummaries.reduce((sum, summary) => sum + summary.seedlingsPerWeek, 0)
  }, [planPreview.cropSummaries])

  const peakNurseryWeek = useMemo(() => {
    return planPreview.nurseryLoad.reduce(
      (peak, week) => (week.activeSeedlings > peak.activeSeedlings ? week : peak),
      planPreview.nurseryLoad[0] ?? {
        week: 1,
        activeSeedlings: 0,
        capacity: farm.nurseryCapacity,
        utilizationPercent: 0,
        risk: 'Low' as const,
      },
    )
  }, [farm.nurseryCapacity, planPreview.nurseryLoad])

  const getMaxTargetForCrop = (cropId: CropId) => {
    const crop = selectedCropById.get(cropId)
    if (!crop) return 0
    return Math.max(0, floorToGoalStep(availableCapacityPerWeek * crop.yieldPerGrid))
  }

  const getRemainingMaxTargetForCrop = (cropId: CropId, goals: CropGoalsById) => {
    const crop = selectedCropById.get(cropId)
    if (!crop) return 0
    const reserve = goals[cropId]?.reservePercent ?? 0
    const multiplier = 1 + reserve / 100

    const requiredWithoutCrop = selectedCrops.reduce((total, selectedCrop) => {
      if (selectedCrop.id === cropId) return total
      const target = goals[selectedCrop.id]?.targetPerWeek ?? 0
      const selectedReserve = goals[selectedCrop.id]?.reservePercent ?? 0
      return total + (target * (1 + selectedReserve / 100)) / (selectedCrop.yieldPerGrid || 1)
    }, 0)

    const remainingCapacity = Math.max(0, availableCapacityPerWeek - requiredWithoutCrop)
    return Math.max(0, floorToGoalStep((remainingCapacity * crop.yieldPerGrid) / multiplier))
  }

  const getMaxReserveForCrop = (cropId: CropId, goals: CropGoalsById) => {
    const crop = selectedCropById.get(cropId)
    if (!crop) return 0

    const target = goals[cropId]?.targetPerWeek ?? 0
    if (target <= 0) return 50

    const requiredWithoutCrop = selectedCrops.reduce((total, selectedCrop) => {
      if (selectedCrop.id === cropId) return total
      const selectedTarget = goals[selectedCrop.id]?.targetPerWeek ?? 0
      const selectedReserve = goals[selectedCrop.id]?.reservePercent ?? 0
      return total + (selectedTarget * (1 + selectedReserve / 100)) / (selectedCrop.yieldPerGrid || 1)
    }, 0)

    const remainingCapacity = Math.max(0, availableCapacityPerWeek - requiredWithoutCrop)
    const maxReserve = ((remainingCapacity * crop.yieldPerGrid) / target - 1) * 100
    return Math.min(50, Math.max(0, Math.floor(maxReserve)))
  }

  const updateTarget = (cropId: CropId, nextValue: number) => {
    const desiredTarget = Math.max(0, roundToGoalStep(nextValue || 0))
    shouldClearSubmitErrorRef.current = true
    setCropGoals((prev) => {
      const maxTarget = getRemainingMaxTargetForCrop(cropId, prev)
      return {
        ...prev,
        [cropId]: {
          ...prev[cropId],
          targetPerWeek: Math.min(desiredTarget, maxTarget),
        },
      }
    })
  }

  const updateReserve = (cropId: CropId, nextValue: number) => {
    const desiredReserve = Math.max(0, nextValue || 0)
    shouldClearSubmitErrorRef.current = true
    setCropGoals((prev) => {
      const maxReserve = getMaxReserveForCrop(cropId, prev)
      const safeReserve = Math.min(desiredReserve, maxReserve)
      return {
        ...prev,
        [cropId]: {
          ...prev[cropId],
          reservePercent: safeReserve,
        },
      }
    })
  }

  const accountInitials =
    farm.farmName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'GF'

  const handleContinue = () => {
    if (!isCapacityFull) {
      setSubmitError(getCapacityErrorMessage())
      return
    }
    setSubmitError(null)
    onContinue({
      planningHorizon,
      priority,
      cropGoals,
    })
  }

  return (
    <main className="setup-page">
      <AppHeader accountName={farm.farmName} accountInitials={accountInitials} />

      <section className="setup-workspace">
        <SetupProgress activeStep={3} steps={setupSteps} />

        <section className="setup-main goal-main">
          <section className="define-goal-card">
            <header className="define-goal-header">
              <h1>Define Goal</h1>
              <p>Set your production targets and business priorities.</p>
            </header>

            <section className="goal-section">
              <div className="crop-goal-list">
                {selectedCrops.map((crop) => {
                  const config = cropGoals[crop.id]
                  const maxTarget = getMaxTargetForCrop(crop.id)
                  const remainingMaxTarget = getRemainingMaxTargetForCrop(crop.id, cropGoals)
                  const maxReserve = getMaxReserveForCrop(crop.id, cropGoals)
                  const safeMaxTarget = Math.max(maxTarget, GOAL_DECIMAL_STEP)
                  const currentTargetPercent = Math.min(
                    100,
                    (Math.max(0, config.targetPerWeek) / safeMaxTarget) * 100,
                  )
                  const remainingTargetPercent = Math.min(
                    100,
                    (Math.max(config.targetPerWeek, remainingMaxTarget) / safeMaxTarget) * 100,
                  )
                  const lightSegmentPercent = Math.max(0, remainingTargetPercent - currentTargetPercent)
                  const minimumVisibleLightPercent = 7.5
                  const remainingTargetVisualPercent =
                    lightSegmentPercent > 0 && lightSegmentPercent < minimumVisibleLightPercent
                      ? Math.min(100, currentTargetPercent + minimumVisibleLightPercent)
                      : remainingTargetPercent
                  const goalTargetRangeStyle = {
                    '--target-fill-current': `${currentTargetPercent}%`,
                    '--target-fill-remaining': `${remainingTargetPercent}%`,
                    '--target-fill-remaining-visual': `${remainingTargetVisualPercent}%`,
                  } as CSSProperties
                  const safeReserveMax = Math.max(config.reservePercent, Math.max(0, maxReserve))
                  const currentReservePercent = Math.min(100, (Math.max(0, config.reservePercent) / 50) * 100)
                  const remainingReservePercent = Math.min(100, (safeReserveMax / 50) * 100)
                  const lightReserveSegmentPercent = Math.max(
                    0,
                    remainingReservePercent - currentReservePercent,
                  )
                  const minimumVisibleReservePercent = 7.5
                  const remainingReserveVisualPercent =
                    lightReserveSegmentPercent > 0 && lightReserveSegmentPercent < minimumVisibleReservePercent
                      ? Math.min(100, currentReservePercent + minimumVisibleReservePercent)
                      : remainingReservePercent
                  const reserveRangeStyle = {
                    '--reserve-fill-current': `${currentReservePercent}%`,
                    '--reserve-fill-remaining': `${remainingReservePercent}%`,
                    '--reserve-fill-remaining-visual': `${remainingReserveVisualPercent}%`,
                  } as CSSProperties

                  return (
                    <article key={crop.id} className="crop-goal-item">
                      <div className="crop-goal-main">
                        <div className="crop-goal-head">
                          <div className="selected-thumb" style={{ backgroundColor: crop.accent }}>
                            {crop.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p>{crop.name}</p>
                            <small>{crop.category}</small>
                          </div>
                        </div>

                        <div className="goal-input-row">
                          <label>
                            <span className="goal-slider-head">
                              Min. production / week
                              <strong>{config.targetPerWeek.toFixed(1)} kg</strong>
                            </span>
                            <input
                              className="goal-range-target"
                              type="range"
                              min={0}
                              max={maxTarget}
                              step={GOAL_DECIMAL_STEP}
                              value={config.targetPerWeek}
                              style={goalTargetRangeStyle}
                              onChange={(event) => updateTarget(crop.id, Number(event.target.value))}
                            />
                            <span className="goal-slider-scale">
                              <small>0 kg</small>
                              <small>Max feasible {remainingMaxTarget.toFixed(1)} kg/week</small>
                            </span>
                          </label>
                          <label>
                            <span className="goal-slider-head">
                              Reserve
                              <strong>{config.reservePercent}%</strong>
                            </span>
                            <input
                              className="goal-range-reserve"
                              type="range"
                              min={0}
                              max={50}
                              step={1}
                              value={config.reservePercent}
                              style={reserveRangeStyle}
                              onChange={(event) => updateReserve(crop.id, Number(event.target.value))}
                            />
                            <span className="goal-slider-scale">
                              <small>0%</small>
                              <small>Available up to {maxReserve}%</small>
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="goal-derived-row">
                        <span>Estimated seedlings / week</span>
                        <strong>
                          {planPreview.cropSummaries.find((summary) => summary.cropId === crop.id)
                            ?.seedlingsPerWeek ?? 0}
                        </strong>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <div className="goal-meta-grid">
              <section className="goal-meta-card">
                <h2>Planning horizon</h2>
                <label className="horizon-field">
                  <CalendarDays size={18} />
                  <select value={planningHorizon} onChange={(event) => setPlanningHorizon(event.target.value)}>
                    {planningOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </label>
                <small>AI will plan production across this time period.</small>
              </section>

              <section className="goal-meta-card">
                <h2>Optimization priority</h2>
                <div className="priority-switch">
                  <button
                    type="button"
                    className={`priority-btn ${priority === 'maximize-space' ? 'active' : ''}`}
                    onClick={() => setPriority('maximize-space')}
                  >
                    <Goal size={16} />
                    Maximize space utilization
                  </button>
                  <button
                    type="button"
                    className={`priority-btn ${priority === 'minimize-stockout' ? 'active' : ''}`}
                    onClick={() => setPriority('minimize-stockout')}
                  >
                    <ShieldCheck size={16} />
                    Minimize stockout risk
                  </button>
                </div>
                <small>Choose the primary objective for plan optimization.</small>
              </section>
            </div>

            <StepActions
              onBack={onBackToSelectCrops}
              onNext={handleContinue}
              onNextDisabledAttempt={() => setSubmitError(getCapacityErrorMessage())}
              nextHint={submitError}
              nextLabel="Generate Plan"
              nextDisabled={!isCapacityFull}
            />
          </section>

          <aside className="goal-summary-card">
            <h2>Goal Summary</h2>

            <div className="goal-summary-list">
              <article>
                <Goal size={22} />
                <div>
                  <p>Total commitment</p>
                  <strong>{totalTargetPerWeek.toFixed(1)} kg / week</strong>
                  <small>Minimum across {selectedCrops.length} crops</small>
                </div>
              </article>
              <article>
                <ShieldCheck size={22} />
                <div>
                  <p>Average reserve</p>
                  <strong>{averageReserve}%</strong>
                  <small>Inventory safety buffer</small>
                </div>
              </article>
              <article>
                <CalendarDays size={22} />
                <div>
                  <p>Planning horizon</p>
                  <strong>{planningHorizon}</strong>
                  <small>Rolling window</small>
                </div>
              </article>
              <article>
                <Goal size={22} />
                <div>
                  <p>Optimization priority</p>
                  <strong>{optimizationLabel}</strong>
                  <small>Primary objective</small>
                </div>
              </article>
              <article>
                <Sparkles size={22} />
                <div>
                  <p>Seedlings / week</p>
                  <strong>{totalSeedlingsPerWeek}</strong>
                  <small>Derived from crop rotation and reserve</small>
                </div>
              </article>
            </div>

            <div className={`goal-alert ${isCapacityFull ? 'ok' : 'warning'}`}>
              <p>
                {capacityState.exceeded
                  ? 'Capacity constraints detected'
                  : isCapacityFull
                    ? 'Capacity is fully utilized'
                    : 'Capacity is not fully utilized'}
              </p>
              <div className="capacity-progress" aria-label="Farm capacity usage">
                <div className="capacity-progress-meta">
                  <strong>{capacityUsageDisplayText}% used</strong>
                  <span>{capacityState.availableCapacityPerWeek} grids/week capacity</span>
                </div>
                <div className="capacity-progress-track">
                  <div
                    className="capacity-progress-fill"
                    style={{ width: `${capacityBarPercent}%` }}
                  />
                </div>
              </div>
              <span>
                Required ~{capacityState.requiredGridPerWeek.toFixed(0)} grids/week vs available{' '}
                {capacityState.availableCapacityPerWeek} grids/week.
              </span>
              {!isCapacityFull && !capacityState.exceeded ? (
                <span>
                  Add ~{capacityGap.toFixed(1)} more grid/week usage to unlock Generate Plan.
                </span>
              ) : null}
            </div>

            <div
              className={`goal-alert ${planPreview.seedlingCapacityRisk === 'High' ? 'warning' : 'ok'}`}
            >
              <p>
                {planPreview.seedlingCapacityRisk === 'High'
                  ? 'Nursery capacity risk detected'
                  : 'Nursery capacity is within range'}
              </p>
              <span>
                Peak nursery load is {peakNurseryWeek.activeSeedlings} seedlings in Week{' '}
                {peakNurseryWeek.week} vs capacity {farm.nurseryCapacity}.
              </span>
            </div>

            <div className="goal-alert info">
              <p>What happens next?</p>
              <span>
                AgriMatrix will analyze your farm, crops, and constraints to generate an efficient
                planting and harvest plan.
              </span>
              <Sparkles size={16} />
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
