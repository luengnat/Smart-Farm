import { useState } from 'react'

interface RegisterPageProps {
  onRegister: (email: string, password: string, displayName: string) => void
  onGoToLogin: () => void
}

export function RegisterPage({ onRegister, onGoToLogin }: RegisterPageProps) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await onRegister(email, password, displayName)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
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
          Create your account
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Display name</label>
            <input
              className="input-field"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
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
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Confirm password</label>
            <input
              className="input-field"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          {error && (
            <p style={{ color: 'var(--color-error, #ef4444)', fontSize: 'var(--text-sm)', margin: 0 }}>
              {error}
            </p>
          )}
          <button
            className="btn btn-primary btn-full btn-lg"
            type="submit"
            disabled={loading || password.length < 8 || password !== confirmPassword}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p style={{
          textAlign: 'center',
          marginTop: 'var(--space-6)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}>
          Already have an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onGoToLogin() }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
