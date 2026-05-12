import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import './App.css'
import { cropLibrary, type CropId } from './constants/crops'
import { generatePlanData } from './lib/planGenerator'
import { DefineGoalPage } from './pages/DefineGoalPage'
import { ConfirmPlanPage } from './pages/ConfirmPlanPage'
import { DashboardPage } from './pages/DashboardPage'
import { GeneratePlanPage } from './pages/GeneratePlanPage'
import { ReplanPage } from './pages/ReplanPage'
import { SelectCropsPage } from './pages/SelectCropsPage'
import { SetupFarmPage } from './pages/SetupFarmPage'
import { WelcomePage } from './pages/WelcomePage'
import { WorkSchedulePage } from './pages/WorkSchedulePage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CropComparisonPage } from './pages/CropComparisonPage'
import { PlanHistoryPage } from './pages/PlanHistoryPage'
import type { CropGoalsById, GeneratedPlanData, GoalData, SetupFarmData } from './types/planning'

type Page =
  | 'welcome'
  | 'setup-farm'
  | 'select-crops'
  | 'define-goal'
  | 'generate-plan'
  | 'confirm-plan'
  | 'dashboard'
  | 'replan'
  | 'work-schedule-employer'
  | 'work-schedule-employee'
  | 'analytics'
  | 'crop-comparison'
  | 'plan-history'

const BALANCED_RESERVE_PERCENT = 10

const createInitialSetupFarmData = (): SetupFarmData => ({
  farmName: 'GreenRise Farm',
  farmLocation: 'Bangkok',
  rows: 10,
  columns: 12,
  lightingZones: 3,
  irrigationZones: 2,
  nurseryCapacity: 240,
  seedlingLeadDays: 14,
  growingSystem: 'Hydroponic NFT',
  lightingAssignments: [],
  irrigationAssignments: [],
})

const createBalancedCropGoals = (
  farm: SetupFarmData,
  selectedCropIds: CropId[],
): CropGoalsById => {
  const selectedCropSet = new Set(selectedCropIds)
  const selectedCrops = cropLibrary.filter((crop) => selectedCropSet.has(crop.id))
  const availableCapacityPerWeek = farm.rows * farm.columns
  const gridSharePerCrop =
    selectedCrops.length > 0 ? availableCapacityPerWeek / selectedCrops.length : 0
  const balancedReservePercent = selectedCrops.length > 0 ? BALANCED_RESERVE_PERCENT : 0
  const reserveFactor = 1 + balancedReservePercent / 100

  return cropLibrary.reduce(
    (acc, crop) => ({
      ...acc,
      [crop.id]: {
        reservePercent: selectedCropSet.has(crop.id) ? balancedReservePercent : 0,
        targetPerWeek: selectedCropSet.has(crop.id)
          ? Math.max(0, Math.floor(((gridSharePerCrop * crop.yieldPerGrid) / reserveFactor) * 10) / 10)
          : 0,
      },
    }),
    {} as CropGoalsById,
  )
}

const createInitialGoalData = (
  farm: SetupFarmData,
  selectedCropIds: CropId[],
): GoalData => ({
  planningHorizon: '8 weeks',
  priority: 'maximize-space',
  cropGoals: createBalancedCropGoals(farm, selectedCropIds),
})

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore quota errors */ }
}

function App() {
  const initialSetupFarmData = createInitialSetupFarmData()
  const initialSelectedCropIds = cropLibrary.map((crop) => crop.id)

  const [page, setPage] = useState<Page>('welcome')
  const [setupFarmData, setSetupFarmData] = useState<SetupFarmData>(initialSetupFarmData)
  const [selectedCropIds, setSelectedCropIds] = useState<CropId[]>(initialSelectedCropIds)
  const [goalData, setGoalData] = useState<GoalData>(
    createInitialGoalData(initialSetupFarmData, initialSelectedCropIds),
  )
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlanData | null>(null)
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([])
  const [farmId, setFarmId] = useState<number | null>(loadFromStorage('gp_farmId', null))
  const [planId, setPlanId] = useState<number | null>(loadFromStorage('gp_planId', null))

  if (page === 'analytics') {
    return (
      <AnalyticsPage
        planId={planId}
        onBack={() => setPage('dashboard')}
      />
    )
  }

  if (page === 'crop-comparison') {
    return (
      <CropComparisonPage
        planId={planId}
        onBack={() => setPage('dashboard')}
      />
    )
  }

  if (page === 'plan-history') {
    return (
      <PlanHistoryPage
        planId={planId}
        onBack={() => setPage('dashboard')}
      />
    )
  }

  if (page === 'dashboard') {
    return (
      <DashboardPage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        goalData={goalData}
        generatedPlan={generatedPlan}
        onBackToConfirm={() => setPage('confirm-plan')}
        onOpenReplan={() => setPage('replan')}
        onOpenWorkSchedule={() => setPage('work-schedule-employer')}
        onViewAnalytics={() => setPage('analytics')}
        onViewCropComparison={() => setPage('crop-comparison')}
        onViewPlanHistory={() => setPage('plan-history')}
      />
    )
  }

  if (page === 'work-schedule-employer') {
    return (
      <WorkSchedulePage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        goalData={goalData}
        generatedPlan={generatedPlan}
        mode="employer"
        completedTaskIds={completedTaskIds}
        onToggleTask={(taskId) => {
          setCompletedTaskIds((prev) =>
            prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
          )
        }}
        onBack={() => setPage('dashboard')}
      />
    )
  }

  if (page === 'work-schedule-employee') {
    return (
      <WorkSchedulePage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        goalData={goalData}
        generatedPlan={generatedPlan}
        mode="employee"
        completedTaskIds={completedTaskIds}
        onToggleTask={(taskId) => {
          setCompletedTaskIds((prev) =>
            prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
          )
        }}
        onBack={() => setPage('welcome')}
      />
    )
  }

  if (page === 'replan') {
    return (
      <ReplanPage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        goalData={goalData}
        generatedPlan={generatedPlan}
        onBackToDashboard={() => setPage('dashboard')}
        onApplyPlan={(nextPlan) => {
          setGeneratedPlan(nextPlan)
          setPage('dashboard')
        }}
      />
    )
  }

  if (page === 'confirm-plan') {
    return (
      <ConfirmPlanPage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        goalData={goalData}
        generatedPlan={generatedPlan}
        onBackToGenerate={() => setPage('generate-plan')}
        onConfirm={() => setPage('dashboard')}
      />
    )
  }

  if (page === 'generate-plan') {
    return (
      <GeneratePlanPage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        goalData={goalData}
        generatedPlan={generatedPlan}
        onGeneratePlan={(nextPlan) => setGeneratedPlan(nextPlan)}
        onBackToDefineGoal={() => setPage('define-goal')}
        onContinue={() => setPage('confirm-plan')}
      />
    )
  }

  if (page === 'define-goal') {
    return (
      <DefineGoalPage
        farm={setupFarmData}
        selectedCropIds={selectedCropIds}
        initialGoalData={goalData}
        onBackToSelectCrops={() => setPage('select-crops')}
        onContinue={(nextGoalData) => {
          setGoalData(nextGoalData)
          setGeneratedPlan(generatePlanData({
            farm: setupFarmData,
            selectedCropIds,
            goalData: nextGoalData,
          }))
          setPage('generate-plan')
        }}
      />
    )
  }

  if (page === 'select-crops') {
    return (
      <SelectCropsPage
        farmName={setupFarmData.farmName}
        selectedCropIds={selectedCropIds}
        onBackToSetup={() => setPage('setup-farm')}
        onContinue={(nextSelectedCropIds) => {
          setSelectedCropIds(nextSelectedCropIds)
          setGoalData((prev) => ({
            ...prev,
            cropGoals: createBalancedCropGoals(setupFarmData, nextSelectedCropIds),
          }))
          setGeneratedPlan(null)
          setPage('define-goal')
        }}
      />
    )
  }

  if (page === 'setup-farm') {
    return (
      <SetupFarmPage
        initialData={setupFarmData}
        onBackToWelcome={() => setPage('welcome')}
        onContinue={(nextSetupFarmData) => {
          setSetupFarmData(nextSetupFarmData)
          setGoalData((prev) => ({
            ...prev,
            cropGoals: createBalancedCropGoals(nextSetupFarmData, selectedCropIds),
          }))
          setGeneratedPlan(null)
          setPage('select-crops')
        }}
      />
    )
  }

  return (
    <>
      <Toaster position="top-right" />
      <WelcomePage
        onOpenEmployer={() => setPage('setup-farm')}
        onOpenEmployee={() => setPage('work-schedule-employee')}
      />
    </>
  )
}

export default App
