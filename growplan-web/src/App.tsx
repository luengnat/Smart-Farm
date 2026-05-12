import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import './App.css'
import { cropLibrary, type CropId } from './constants/crops'
import { generatePlanData } from './lib/planGenerator'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DefineGoalPage } from './pages/DefineGoalPage'
import { ConfirmPlanPage } from './pages/ConfirmPlanPage'
import { DashboardPage } from './pages/DashboardPage'
import { GeneratePlanPage } from './pages/GeneratePlanPage'
import { ReplanPage } from './pages/ReplanPage'
import { SelectCropsPage } from './pages/SelectCropsPage'
import { SetupFarmPage } from './pages/SetupFarmPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CropComparisonPage } from './pages/CropComparisonPage'
import { PlanHistoryPage } from './pages/PlanHistoryPage'
import type { CropGoalsById, GeneratedPlanData, GoalData, SetupFarmData } from './types/planning'

type Page =
  | 'login'
  | 'register'
  | 'setup-farm'
  | 'select-crops'
  | 'define-goal'
  | 'generate-plan'
  | 'confirm-plan'
  | 'dashboard'
  | 'replan'
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

const WIZARD_KEY = 'gp_wizard_draft'

function saveWizardDraft(data: { page: string; setupFarmData?: SetupFarmData; selectedCropIds?: CropId[] }) {
  saveToStorage(WIZARD_KEY, data)
}

function loadWizardDraft(): { page: string; setupFarmData?: SetupFarmData; selectedCropIds?: CropId[] } | null {
  try {
    const stored = localStorage.getItem(WIZARD_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function clearWizardDraft() {
  localStorage.removeItem(WIZARD_KEY)
}

const SHELL_PAGES: Page[] = ['dashboard', 'analytics', 'crop-comparison', 'plan-history', 'replan']

function App() {
  const initialSetupFarmData = createInitialSetupFarmData()
  const draft = loadWizardDraft()

  const [page, setPage] = useState<Page>((draft?.page as Page) || 'login')
  const [setupFarmData, setSetupFarmData] = useState<SetupFarmData>(draft?.setupFarmData || initialSetupFarmData)
  const [selectedCropIds, setSelectedCropIds] = useState<CropId[]>(draft?.selectedCropIds || [])
  const [goalData, setGoalData] = useState<GoalData>(
    createInitialGoalData(draft?.setupFarmData || initialSetupFarmData, draft?.selectedCropIds || []),
  )
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlanData | null>(null)
  const [farmId, setFarmId] = useState<number | null>(loadFromStorage('gp_farmId', null))
  const [planId, setPlanId] = useState<number | null>(loadFromStorage('gp_planId', null))

  // Auth pages (no shell)
  if (page === 'login') {
    return (
      <>
        <Toaster position="top-right" />
        <LoginPage
          onLogin={() => setPage('dashboard')}
          onGoToRegister={() => setPage('register')}
        />
      </>
    )
  }

  if (page === 'register') {
    return (
      <>
        <Toaster position="top-right" />
        <RegisterPage
          onRegister={() => setPage('setup-farm')}
          onGoToLogin={() => setPage('login')}
        />
      </>
    )
  }

  // Wizard pages (no shell)
  if (page === 'setup-farm') {
    return (
      <>
        <Toaster position="top-right" />
        <SetupFarmPage
          initialData={setupFarmData}
          onBackToWelcome={() => setPage('login')}
          onContinue={(nextSetupFarmData) => {
            setSetupFarmData(nextSetupFarmData)
            setGoalData((prev) => ({
              ...prev,
              cropGoals: createBalancedCropGoals(nextSetupFarmData, selectedCropIds),
            }))
            setGeneratedPlan(null)
            saveWizardDraft({ page: 'select-crops', setupFarmData: nextSetupFarmData, selectedCropIds })
            setPage('select-crops')
          }}
        />
      </>
    )
  }

  if (page === 'select-crops') {
    return (
      <>
        <Toaster position="top-right" />
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
            saveWizardDraft({ page: 'define-goal', selectedCropIds: nextSelectedCropIds })
            setPage('define-goal')
          }}
        />
      </>
    )
  }

  if (page === 'define-goal') {
    return (
      <>
        <Toaster position="top-right" />
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
            saveWizardDraft({ page: 'generate-plan', selectedCropIds })
            setPage('generate-plan')
          }}
        />
      </>
    )
  }

  if (page === 'generate-plan') {
    return (
      <>
        <Toaster position="top-right" />
        <GeneratePlanPage
          farm={setupFarmData}
          selectedCropIds={selectedCropIds}
          goalData={goalData}
          generatedPlan={generatedPlan}
          onGeneratePlan={(nextPlan) => { setGeneratedPlan(nextPlan); clearWizardDraft() }}
          onBackToDefineGoal={() => setPage('define-goal')}
          onContinue={() => setPage('confirm-plan')}
        />
      </>
    )
  }

  if (page === 'confirm-plan') {
    return (
      <>
        <Toaster position="top-right" />
        <ConfirmPlanPage
          farm={setupFarmData}
          selectedCropIds={selectedCropIds}
          goalData={goalData}
          generatedPlan={generatedPlan}
          onBackToGenerate={() => setPage('generate-plan')}
          onConfirm={() => setPage('dashboard')}
        />
      </>
    )
  }

  // Shell pages (with AppShell)
  if (SHELL_PAGES.includes(page)) {
    let content: React.ReactNode

    if (page === 'dashboard') {
      content = (
        <DashboardPage
          farm={setupFarmData}
          selectedCropIds={selectedCropIds}
          goalData={goalData}
          generatedPlan={generatedPlan}
          onBackToConfirm={() => setPage('confirm-plan')}
          onOpenReplan={() => setPage('replan')}
        />
      )
    } else if (page === 'analytics') {
      content = <AnalyticsPage planId={planId} onBack={() => setPage('dashboard')} />
    } else if (page === 'crop-comparison') {
      content = <CropComparisonPage planId={planId} onBack={() => setPage('dashboard')} />
    } else if (page === 'plan-history') {
      content = <PlanHistoryPage planId={planId} onBack={() => setPage('dashboard')} />
    } else if (page === 'replan') {
      content = (
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

    return (
      <>
        <Toaster position="top-right" />
        <AppShell
          currentPage={page}
          onNavigate={(p) => setPage(p as Page)}
          farmName={setupFarmData.farmName}
        >
          {content}
        </AppShell>
      </>
    )
  }

  // Fallback (should not reach here)
  return (
    <>
      <Toaster position="top-right" />
      <LoginPage
        onLogin={() => setPage('dashboard')}
        onGoToRegister={() => setPage('register')}
      />
    </>
  )
}

export default App
