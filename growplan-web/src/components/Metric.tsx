interface MetricProps {
  value: string | number
  label: string
  positive?: boolean
  negative?: boolean
  className?: string
}

export function Metric({ value, label, positive, negative, className = '' }: MetricProps) {
  const valueClass = positive ? 'positive' : negative ? 'negative' : ''
  return (
    <div className={`metric ${className}`}>
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${valueClass}`}>{value}</span>
    </div>
  )
}
