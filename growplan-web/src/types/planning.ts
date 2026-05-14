import type { CropId } from '../constants/crops'

export type GoalPriority = 'maximize-space' | 'minimize-stockout'

export type SetupFarmData = {
  farmName: string
  farmLocation: string
  rows: number
  columns: number
  levels: number
  lightingZones: number
  irrigationZones: number
  nurseryCapacity: number
  seedlingLeadDays: number
  growingSystem: string
  lightingAssignments: number[]
  irrigationAssignments: number[]
}

export type CropGoal = {
  targetPerWeek: number
  reservePercent: number
}

export type CropGoalsById = Record<CropId, CropGoal>

export type GoalData = {
  planningHorizon: string
  priority: GoalPriority
  cropGoals: CropGoalsById
}

export type CellPhase = 'empty' | 'planned' | 'seeded' | 'growing' | 'harvestable' | 'harvested'

export type GeneratedPlanCell = {
  cropId: CropId | ''
  color: string
  label: string
  weekStarted: number
  weekHarvestExpected: number
  status: string
}

export type CropPlanSummary = {
  cropId: CropId
  label: string
  color: string
  allocatedCells: number
  targetPerWeek: number
  reservePercent: number
  seedlingsPerWeek: number
}

export type PlanTimelineRow = {
  cropId: CropId
  label: string
  color: string
  seedWeek: number
  transplantWeek: number
  growWeeks: number
  harvestWeek: number
}

export type NurseryBatch = {
  cropId: CropId
  label: string
  color: string
  seedWeek: number
  transplantWeek: number
  seedlings: number
  status: 'Scheduled' | 'At capacity' | 'Over capacity'
}

export type NurseryLoadWeek = {
  week: number
  activeSeedlings: number
  capacity: number
  utilizationPercent: number
  risk: 'Low' | 'Medium' | 'High'
}

export type GeneratedPlanData = {
  rows: number
  columns: number
  levels: number
  currentWeek: number
  cells: GeneratedPlanCell[]
  utilizationPercent: number
  requiredCapacity: number
  availableCapacity: number
  stockoutRisk: 'Low' | 'Medium' | 'High'
  seedlingCapacityRisk: 'Low' | 'Medium' | 'High'
  expectedRevenue: number
  cropSummaries: CropPlanSummary[]
  timelineRows: PlanTimelineRow[]
  nurserySchedule: NurseryBatch[]
  nurseryLoad: NurseryLoadWeek[]
}

// --- Analytics ---

export type WeeklyRevenueEntry = {
  week: number
  total: number
  [cropId: string]: number
}

export type WeeklyCostEntry = {
  week: number
  labor: number
  nutrients: number
  energy: number
  seeds: number
  total: number
}

export type WeeklyProfitEntry = {
  week: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

export type AnalyticsData = {
  revenueByWeek: WeeklyRevenueEntry[]
  costByWeek: WeeklyCostEntry[]
  profitByWeek: WeeklyProfitEntry[]
  cumulativeRevenue: number
  cumulativeCost: number
  cumulativeProfit: number
}

// --- Timeline ---

export type TimelineInterval = {
  cellIndex: number
  startWeek: number
  endWeek: number
  phase: 'growing' | 'harvest'
}

export type TimelineCrop = {
  cropId: string
  cropName: string
  color: string
  intervals: TimelineInterval[]
}

export type TimelineData = {
  crops: TimelineCrop[]
  currentWeek: number
  horizonWeeks: number
}

// --- History ---

export type SnapshotSummary = {
  id: number
  snapshotType: 'confirmed' | 'replanned' | 'week-advanced'
  totalGrids: number
  cropCount: number
  revenuePerWeek: number
  createdAt: string
}

export type HistoryData = {
  snapshots: SnapshotSummary[]
  total: number
  page: number
  limit: number
}

// --- Crop Comparison ---

export type CropMetrics = {
  revenuePerGridWeek: number
  costPerGridWeek: number
  netMarginPerGridWeek: number
  marginPct: number
  cycleWeeks: number
  nurseryTraysPerCycle: number
  seedCostPerCycle: number
}

export type RadarScores = {
  revenue: number
  speed: number
  yield: number
  price: number
  ease: number
}

export type ComparisonCrop = {
  cropId: string
  cropName: string
  color: string
  metrics: CropMetrics
  radarScores: RadarScores
}

export type CropComparisonData = {
  crops: ComparisonCrop[]
  recommended: string
}

// --- Plan Summary ---

export type PlanSummary = {
  id: number
  status: string
  horizonWeeks: number
  currentWeek: number
  goalPriority: string
  selectedCrops: string[]
  revenueTotal: number | null
  createdAt: string
}
