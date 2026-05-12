import type { ReactNode } from 'react'

interface SurfaceProps {
  children: ReactNode
  elevated?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Surface({ children, elevated, className = '', style }: SurfaceProps) {
  return (
    <div className={`${elevated ? 'surface-elevated' : 'surface'} ${className}`} style={style}>
      {children}
    </div>
  )
}
