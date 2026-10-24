import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function ResetPassword() {
  const { loading, session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-sm px-5 py-16 text-mute">Checking your reset link…</div>
  }

  // The reset email returns here with a recovery session (Supabase picks it
  // up from the link automatically). Without one the link is expired, used,
  // or was opened in a different browser — request a fresh one.
  if (!session) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="mb-3 font-display text-2xl font-bold text-bone">Reset link expired</h1>
        <p className="text-sm text-mute">
          This reset link is invalid or has already been used. Request a new one and open it in this
          browser.
        </p>
        <p className="mt-4 text-sm text-mute">
          <Link to="/forgot-password" className="text-brandBright hover:underline">
            Request a new reset link
          </Link>
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="mb-3 font-display text-2xl font-bold text-bone">Password updated</h1>
        <p className="text-sm text-mute">Your new password is set. You can sign in with it now.</p>
        <p className="mt-4 text-sm text-mute">
          <Link to="/login" className="text-brandBright hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 font-display text-2xl font-bold text-bone">Set a new password</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">New password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Confirm new password</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        {error && <p className="text-sm text-crimsonBright">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded bg-brand px-4 py-2.5 font-medium text-bone transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  )
}
