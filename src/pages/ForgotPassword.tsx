import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="mb-3 font-display text-2xl font-bold text-bone">Check your email</h1>
        <p className="text-sm text-mute">
          If an account exists for {email}, we sent it a password-reset link. Click it, then set a new
          password.
        </p>
        <p className="mt-4 text-sm text-mute">
          <Link to="/login" className="text-brandBright hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 font-display text-2xl font-bold text-bone">Forgot password?</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        {error && <p className="text-sm text-crimsonBright">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-brand px-4 py-2.5 font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        <Link to="/login" className="text-brandBright hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
