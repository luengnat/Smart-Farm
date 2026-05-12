import { useState } from 'react'

interface LoginPageProps {
  onLogin: (email: string, password: string) => void
  onGoToRegister: () => void
}

export function LoginPage({ onLogin, onGoToRegister }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin(email, password)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-base)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        padding: 'var(--space-8)',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          marginBottom: 'var(--space-2)',
        }}>
          GrowPlan
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-8)',
        }}>
          Sign in to your farm
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@farm.com"
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" type="submit">
            Sign in
          </button>
        </form>
        <p style={{
          textAlign: 'center',
          marginTop: 'var(--space-6)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}>
          Don't have an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onGoToRegister() }}>
            Create one
          </a>
        </p>
      </div>
    </div>
  )
}
