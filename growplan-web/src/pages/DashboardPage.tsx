import { useMemo, useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bot,
  CalendarDays,
  Check,
  Droplets,
  Grid3X3,
  Leaf,
  MessageSquare,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Sprout,
  Thermometer,
  Waves,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { cropLibrary, type CropId } from '../constants/crops'
import { generatePlanData } from '../lib/planGenerator'
import type { GeneratedPlanData, GoalData, SetupFarmData } from '../types/planning'

type DashboardPageProps = {
  farm: SetupFarmData
  selectedCropIds: CropId[]
  goalData: GoalData
  generatedPlan: GeneratedPlanData | null
  onBackToConfirm: () => void
  onOpenReplan: () => void
  onOpenWorkSchedule: () => void
  onViewAnalytics: () => void
  onViewCropComparison: () => void
  onViewPlanHistory: () => void
}

const flowItems = [
  'Setup Farm',
  'Define Goal',
  'Generate Plan',
  'Execute',
  'Monitor',
  'Re-plan',
  'Harvest',
]

type ChatMessage = {
  role: 'user' | 'bot'
  text: string
}

export function DashboardPage({
  farm,
  selectedCropIds,
  goalData,
  generatedPlan,
  onBackToConfirm,
  onOpenReplan,
  onOpenWorkSchedule,
  onViewAnalytics,
  onViewCropComparison,
  onViewPlanHistory,
}: DashboardPageProps) {
  const sideItems = [
    { label: 'Overview', icon: Grid3X3, active: true, tabClass: 'tab-key-overview' },
    { label: 'Farm Grid', icon: Sprout },
    { label: 'Plan', icon: CalendarDays },
    { label: 'Work Schedule', icon: Sparkles, onClick: onOpenWorkSchedule, tabClass: 'tab-key-work-schedule' },
    { label: 'Crops', icon: Leaf },
    { label: 'Sensors', icon: Waves },
    { label: 'Alerts', icon: Bell },
  ]

  const selectedCrops = useMemo(
    () => cropLibrary.filter((crop) => selectedCropIds.includes(crop.id)),
    [selectedCropIds],
  )

  const resolvedPlan = useMemo(
    () =>
      generatedPlan ??
      generatePlanData({
        farm,
        selectedCropIds,
        goalData,
      }),
    [farm, generatedPlan, goalData, selectedCropIds],
  )

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: 'Hello! I am your AgriMatrix Copilot. How can I help with your plan today?',
    },
  ])
  const [isCopilotThinking, setIsCopilotThinking] = useState(false)
  const [isRiskReady, setIsRiskReady] = useState(false)
  const thinkingTimerRef = useRef<number | null>(null)
  const riskTimerRef = useRef<number | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isCopilotThinking])

  useEffect(() => {
    return () => {
      if (thinkingTimerRef.current !== null) {
        window.clearTimeout(thinkingTimerRef.current)
      }
      if (riskTimerRef.current !== null) {
        window.clearTimeout(riskTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setIsRiskReady(false)
    riskTimerRef.current = window.setTimeout(() => {
      setIsRiskReady(true)
      riskTimerRef.current = null
    }, 5000)
  }, [farm.farmName, goalData, selectedCropIds])

  const accountInitials =
    farm.farmName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'GF'

  const primaryCrop = selectedCrops[0]
  const primaryGoal = primaryCrop ? goalData.cropGoals[primaryCrop.id]?.targetPerWeek ?? 0 : 0

  const gridCells = useMemo(() => {
    return resolvedPlan.cells.map((cell) => {
      const crop = cropLibrary.find((item) => item.id === cell.cropId)
      return {
        cropId: cell.cropId,
        name: cell.label,
        color: cell.color,
        category: crop?.category ?? 'Leafy Green',
      }
    })
  }, [resolvedPlan.cells])

  const cropMix = useMemo(() => {
    const total = gridCells.length
    return selectedCrops.map((crop) => {
      const count = gridCells.filter((cell) => cell.cropId === crop.id).length
      return {
        id: crop.id,
        name: crop.name,
        color: crop.accent,
        count,
        percent: Math.round((count / total) * 100),
      }
    })
  }, [gridCells, selectedCrops])

  const nextSeedWeek = resolvedPlan.nurseryLoad[0]?.week ?? 1
  const nextSeedBatch = useMemo(() => {
    return resolvedPlan.nurserySchedule
      .filter((batch) => batch.seedWeek === nextSeedWeek)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
  }, [nextSeedWeek, resolvedPlan.nurserySchedule])

  const readyToTransplant = useMemo(() => {
    return resolvedPlan.nurserySchedule
      .filter((batch) => batch.transplantWeek === nextSeedWeek)
      .reduce((sum, batch) => sum + batch.seedlings, 0)
  }, [nextSeedWeek, resolvedPlan.nurserySchedule])

  const peakNurseryLoad = useMemo(() => {
    return resolvedPlan.nurseryLoad.reduce(
      (peak, item) => (item.activeSeedlings > peak.activeSeedlings ? item : peak),
      resolvedPlan.nurseryLoad[0] ?? {
        week: 1,
        activeSeedlings: 0,
        capacity: farm.nurseryCapacity,
        utilizationPercent: 0,
        risk: 'Low' as const,
      },
    )
  }, [farm.nurseryCapacity, resolvedPlan.nurseryLoad])
  const nurseryLoadWeeks = useMemo(() => resolvedPlan.nurseryLoad.slice(0, 8), [resolvedPlan.nurseryLoad])

  const primaryCropName = primaryCrop?.name ?? 'Crop'
  const secondaryCrop = selectedCrops[1] || selectedCrops[0]
  const secondaryCropName = secondaryCrop?.name ?? 'Crop'

  const handleAsk = (question: string) => {
    if (isCopilotThinking) return

    let response = "I'm analyzing the data..."

    if (question.includes(secondaryCropName) && (question.includes('edge') || question.includes('placed'))) {
      if (secondaryCrop?.id === 'mint') {
        response = 'Mint is placed at the edge because it has a spreading growth habit. Keeping it isolated prevents it from competing with more compact crops.'
      } else {
        response = `${secondaryCropName} is positioned to optimize light and water zone compatibility while maintaining 100% space utilization across your grid.`
      }
    } else if (question.includes('100%')) {
      response = `The plan targets 100% utilization to maximize your space. Every available grid in your ${farm.rows}x${farm.columns} setup is assigned a crop based on your goal.`
    } else if (question.toLowerCase().includes('risk') || question.toLowerCase().includes('disease')) {
      response = `The primary risks are: 1) Suspected leaf disease in ${primaryCropName} Zone B affecting 8 trays, and 2) Nursery load reaching ${peakNurseryLoad.activeSeedlings} seedlings (${peakNurseryLoad.utilizationPercent}%) in Week ${peakNurseryLoad.week}. Recommended action is isolate Zone B and re-sequence transplant tasks.`
    } else if (question.includes('seed next week')) {
      response = `In Week ${nextSeedWeek}, you should seed ${nextSeedBatch} seedlings. This ensures they are ready for transplanting after the ${farm.seedlingLeadDays}-day lead time.`
    }

    setChatHistory((prev) => [
      ...prev,
      { role: 'user', text: question },
    ])
    setIsCopilotThinking(true)

    thinkingTimerRef.current = window.setTimeout(() => {
      setChatHistory((prev) => [...prev, { role: 'bot', text: response }])
      setIsCopilotThinking(false)
      thinkingTimerRef.current = null
    }, 950)
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-side">
        <nav className="dashboard-nav">
          {sideItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                className={`${item.active ? 'active' : ''} ${item.tabClass ?? ''}`.trim()}
                onClick={item.onClick}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <section className="dashboard-main">
        <AppHeader accountName={farm.farmName} accountInitials={accountInitials} variant="edge" />

        <section className="dashboard-kpis">
          <article>
            <p>Utilization</p>
            <strong>{resolvedPlan.utilizationPercent}%</strong>
          </article>
          <article>
            <p>Expected revenue</p>
            <strong>${(resolvedPlan.expectedRevenue / 1000).toFixed(1)}k</strong>
          </article>
          <article>
            <p>Stockout risk</p>
            <strong>{resolvedPlan.stockoutRisk}</strong>
          </article>
          <article>
            <p>Nursery risk</p>
            <strong>{resolvedPlan.seedlingCapacityRisk}</strong>
          </article>
          <article className="goal-kpi">
            <p>
              Goal: {primaryGoal} kg {primaryCrop?.name.toLowerCase() ?? 'crop'} / week
            </p>
            <span>{Math.max(78, Math.min(97, resolvedPlan.utilizationPercent - 3))}% target progress</span>
          </article>
          <button
            type="button"
            className={`risk-kpi replan-trigger ${isRiskReady ? 'ready' : 'waiting'}`}
            onClick={onOpenReplan}
            disabled={!isRiskReady}
          >
            <p>
              {isRiskReady ? <BellRing size={14} className="risk-alarm-icon" /> : <LoaderCircle size={14} className="spin" />}
              {isRiskReady
                ? `Risk: suspected disease in ${primaryCropName.toLowerCase()} Zone B`
                : 'Monitoring crop health signals...'}
            </p>
            <strong>{isRiskReady ? 'Click Here to Replan !' : 'Waiting for incident signal'}</strong>
          </button>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" onClick={onViewAnalytics}>Analytics</button>
            <button type="button" onClick={onViewCropComparison}>Compare Crops</button>
            <button type="button" onClick={onViewPlanHistory}>Plan History</button>
          </div>
        </section>

        <section className="dashboard-content">
          <div className="dashboard-left-stack">
            <section className="dashboard-grid-card">
              <header>
                <h2>Farm Grid</h2>
              </header>
              <div className="dashboard-grid-layout">
                <div className="dashboard-grid-wrapper">
                  <div className="dashboard-grid-size">
                    Layout: {resolvedPlan.rows}x{resolvedPlan.columns}
                  </div>
                  <div
                    className="dashboard-grid"
                    style={{ gridTemplateColumns: `repeat(${resolvedPlan.columns}, 30px)` }}
                  >
                    {gridCells.map((cell, idx) => (
                      <span
                        key={idx}
                        style={{ backgroundColor: cell.color }}
                        title={cell.name}
                      ></span>
                    ))}
                  </div>
                </div>

                <aside className="dashboard-grid-insights">
                  <section className="crop-mix-card">
                    <h3>Crop Mix</h3>
                    {cropMix.map((item) => (
                      <article key={item.id}>
                        <div>
                          <b style={{ backgroundColor: item.color }}></b>
                          <span>{item.name}</span>
                        </div>
                        <p>{item.percent}%</p>
                        <small>({item.count}/{gridCells.length})</small>
                      </article>
                    ))}
                  </section>

                  <section className="crop-mix-card nursery-insight-card">
                    <h3>Nursery Queue</h3>
                    <article>
                      <div>
                        <span>Next seeding batch</span>
                      </div>
                      <p>W{nextSeedWeek}</p>
                      <small>{nextSeedBatch} seedlings</small>
                    </article>
                    <article>
                      <div>
                        <span>Ready to transplant</span>
                      </div>
                      <p>{readyToTransplant}</p>
                      <small>this week</small>
                    </article>
                    <article>
                      <div>
                        <span>Peak nursery load</span>
                      </div>
                      <p>{peakNurseryLoad.activeSeedlings}</p>
                      <small>W{peakNurseryLoad.week}</small>
                    </article>
                  </section>

                  <section className="sensor-mini-card">
                    <h3>Live Sensors (Zone Avg)</h3>
                    <article>
                      <span>
                        <Droplets size={13} />
                        pH
                      </span>
                      <strong>6.1</strong>
                      <small>Optimal</small>
                    </article>
                    <article>
                      <span>
                        <Waves size={13} />
                        EC
                      </span>
                      <strong>1.8 mS/cm</strong>
                      <small>Optimal</small>
                    </article>
                    <article>
                      <span>
                        <Thermometer size={13} />
                        Temperature
                      </span>
                      <strong>21.4 c</strong>
                      <small>Optimal</small>
                    </article>
                  </section>
                </aside>
              </div>
            </section>

            <section className="dashboard-plan-card">
              <header>
                <h2>8-Week Plan</h2>
              </header>
              <div className="plan-mini-table">
                {resolvedPlan.timelineRows.map((row) => (
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
                          backgroundColor: row.color,
                          gridColumn: `${row.transplantWeek} / span ${row.growWeeks}`,
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
              <div className="confirm-timeline-table nursery-load-table">
                <div className="timeline-head nursery-load-head">
                  <span>Nursery Load</span>
                  {nurseryLoadWeeks.map((item) => (
                    <b key={item.week}>W{item.week}</b>
                  ))}
                </div>
                <div className="timeline-row-confirm nursery-load-row-confirm">
                  <span>Seedlings</span>
                  <div className="timeline-track-confirm nursery-track-confirm">
                    {nurseryLoadWeeks.map((item) => (
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
            </section>
          </div>

          <aside className="dashboard-copilot">
            <header>
              <h2>
                <Bot size={18} />
                AI Copilot
              </h2>
            </header>

            <section className="copilot-goal-pill">
              <p>
                Goal: {primaryGoal} kg {primaryCrop?.name.toLowerCase() ?? 'crop'} / week
              </p>
              <span>
                Nursery peak {peakNurseryLoad.activeSeedlings}/{farm.nurseryCapacity} seedlings
              </span>
            </section>

            <div className="copilot-chat-history">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.role}`}>
                  {msg.text}
                </div>
              ))}
              {isCopilotThinking ? (
                <div className="chat-bubble bot thinking">
                  <LoaderCircle size={14} className="spin" />
                  AgriMatrix is thinking...
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="copilot-actions">
              <button
                type="button"
                disabled={isCopilotThinking}
                onClick={() => handleAsk(`Why is ${secondaryCropName} placed here?`)}
              >
                Why is {secondaryCropName} placed here?
              </button>
              <button type="button" disabled={isCopilotThinking} onClick={() => handleAsk('What are the current disease risks?')}>
                Explain risk
              </button>
              <button
                type="button"
                disabled={isCopilotThinking}
                onClick={() => handleAsk('Why is this plan 100% utilized?')}
              >
                Why 100% utilized?
              </button>
              <button type="button" disabled={isCopilotThinking} onClick={() => handleAsk('What should I seed next week?')}>
                What to seed?
              </button>
            </div>

            <div className="copilot-input-visual">
              <p>{isCopilotThinking ? 'AI is drafting a response...' : 'Select a prompt above to interact'}</p>
              <Send size={16} />
            </div>

            <button type="button" className="back-confirm-btn" onClick={onBackToConfirm}>
              <MessageSquare size={16} />
              Back to Confirm Plan
            </button>
          </aside>
        </section>

        <section className="dashboard-flow-strip">
          {flowItems.map((item, idx) => {
            const done = idx <= 3
            const active = idx === 4
            return (
              <article key={item} className={active ? 'active' : ''}>
                <span>{done ? <Check size={14} /> : idx + 1}</span>
                <p>{item}</p>
              </article>
            )
          })}
          <div className="flow-risk-badge">
            <AlertTriangle size={14} />
            <span>Delay watch</span>
          </div>
          <div className="flow-status-pill">
            <ShieldCheck size={14} />
            <span>Plan locked</span>
          </div>
        </section>
      </section>
    </main>
  )
}
