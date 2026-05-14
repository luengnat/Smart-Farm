import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { cropLibrary, type CropId } from '../constants/crops'
import { generatePlan, saveFarm } from '../lib/api'
import type { GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'

type GeneratePlanPageProps = {
  farm: SetupFarmData
  farmId: number | null
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  onGeneratePlan: (plan: GeneratedPlanData) => void
  onFarmCreated: (farmId: number) => void
  onPlanCreated: (planId: number) => void
  onBackToDefineGoal: () => void
  onContinue: () => void
}

type GenStatus = 'saving-farm' | 'generating' | 'done' | 'error'

export function GeneratePlanPage({
  farm,
  farmId,
  selectedCropIds,
  goalData,
  generatedPlan,
  onGeneratePlan,
  onFarmCreated,
  onPlanCreated,
  onBackToDefineGoal,
  onContinue,
}: GeneratePlanPageProps) {
  const [status, setStatus] = useState<GenStatus>(generatedPlan ? 'done' : 'saving-farm')
  const [errorMessage, setErrorMessage] = useState('')

  // Stabilize callbacks via refs so the effect only re-runs on data changes,
  // not on parent re-renders that create new arrow function references.
  const onFarmCreatedRef = useRef(onFarmCreated)
  const onPlanCreatedRef = useRef(onPlanCreated)
  const onGeneratePlanRef = useRef(onGeneratePlan)
  onFarmCreatedRef.current = onFarmCreated
  onPlanCreatedRef.current = onPlanCreated
  onGeneratePlanRef.current = onGeneratePlan

  useEffect(() => {
    if (generatedPlan) return

    let cancelled = false

    async function run() {
      try {
        let currentFarmId: number | null = farmId ?? null

        if (!currentFarmId) {
          setStatus('saving-farm')
          const result = await saveFarm(farm)
          currentFarmId = result.id
          onFarmCreatedRef.current(result.id)
        }

        if (cancelled) return
        setStatus('generating')

        const { planId, plan } = await generatePlan(
          { farm, selectedCropIds, goalData },
          currentFarmId,
        )
        if (cancelled) return

        if (planId) {
          onPlanCreatedRef.current(planId)
        }
        onGeneratePlanRef.current(plan)
        setStatus('done')
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Plan generation failed')
          setStatus('error')
        }
      }
    }

    run()
    return () => { cancelled = true }
  }, [farm, farmId, selectedCropIds, goalData, generatedPlan])

  const selectedCrops = cropLibrary.filter((crop) => selectedCropIds.includes(crop.id))

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 480, padding: 'var(--space-8)' }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          letterSpacing: '0.05em',
          marginBottom: 'var(--space-2)',
        }}>
          STEP 4 OF 5 — GENERATE PLAN
        </p>
        <h1 style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--space-2)',
        }}>
          Generate Plan
        </h1>

        {status === 'saving-farm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
              <LoaderCircle size={20} className="spin" />
              <span style={{ fontSize: 'var(--text-sm)' }}>Saving farm configuration...</span>
            </div>
          </div>
        )}

        {status === 'generating' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}>
              <Sparkles size={20} style={{ color: 'var(--color-accent)' }} />
              <div>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  AI is building your optimal plan
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  This may take a minute while we analyze your farm...
                </p>
              </div>
              <LoaderCircle size={18} className="spin" style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {['Analyzing farm layout', 'Balancing crop cycles', 'Optimizing grid allocation', 'Scheduling seedling batches'].map((step) => (
                <div key={step} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  padding: 'var(--space-2) 0',
                }}>
                  <LoaderCircle size={14} className="spin" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-status-error)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-status-error)',
            }}>
              <AlertCircle size={20} />
              <div>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Generation failed</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{errorMessage}</p>
              </div>
            </div>
            <button
              className="btn btn-secondary btn-full"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={onBackToDefineGoal}
            >
              Go back and retry
            </button>
          </div>
        )}

        {status === 'done' && generatedPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-status-success)',
              borderRadius: 'var(--radius-md)',
            }}>
              <CheckCircle2 size={20} style={{ color: 'var(--color-status-success)' }} />
              <div>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Plan generated successfully
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {selectedCrops.length} crops across {generatedPlan.rows * generatedPlan.columns * (generatedPlan.levels || 1)} grids
                  {generatedPlan.expectedRevenue > 0 && ` · $${generatedPlan.expectedRevenue.toFixed(0)}/week`}
                </p>
              </div>
            </div>

            {selectedCrops.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}>
                {selectedCrops.map((crop) => (
                  <span key={crop.id} className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: crop.accent, display: 'inline-block' }} />
                    {crop.name}
                  </span>
                ))}
              </div>
            )}

            <button className="btn btn-primary btn-full btn-lg" onClick={onContinue}>
              View Draft Plan
            </button>
            <button className="btn btn-ghost btn-full" onClick={onBackToDefineGoal}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
