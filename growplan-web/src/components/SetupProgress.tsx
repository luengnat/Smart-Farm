import { Check } from 'lucide-react'
import type { SetupStep } from '../constants/setupSteps'

type SetupProgressProps = {
  activeStep: number
  steps: SetupStep[]
}

export function SetupProgress({ activeStep, steps }: SetupProgressProps) {
  const completed = Math.max(0, Math.min(activeStep, steps.length))
  const progressWidth = steps.length > 0 ? `${(completed / steps.length) * 100}%` : '0%'

  return (
    <aside className="setup-sidebar">
      <p className="setup-progress-title">Setup Progress</p>
      <p className="setup-progress-meta">
        {completed} of {steps.length} completed
      </p>
      <div className="progress-track" aria-hidden="true">
        <span className="progress-fill" style={{ width: progressWidth }}></span>
      </div>

      <ul className="step-list">
        {steps.map((step) => {
          const isActive = step.id === activeStep
          const isDone = step.id < activeStep

          return (
            <li
              key={step.id}
              className={`step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
            >
              <span className="step-badge">{isDone ? <Check size={14} /> : step.id}</span>
              <div>
                <p>{step.title}</p>
                <small>{step.subtitle}</small>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

