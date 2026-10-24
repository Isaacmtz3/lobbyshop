import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { ProfileRole } from '../types'

const ROLE_OPTIONS: { value: ProfileRole; label: string; blurb: string }[] = [
  { value: 'client', label: 'Client', blurb: 'Browse shops, check in, see live wait times' },
  { value: 'shop_owner', label: 'Shop owner', blurb: 'List your shop and run its queue board' },
]

export function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const defaultRole = (location.state as { defaultRole?: ProfileRole } | null)?.defaultRole
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<ProfileRole>(defaultRole === 'shop_owner' ? 'shop_owner' : 'client')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!agreedToTerms) return
    setLoading(true)
    setError(null)
    try {
      const { needsEmailConfirmation } = await signUp(email, password, fullName, phone, role)
      if (needsEmailConfirmation) {
        setConfirmSent(true)
      } else {
        navigate(role === 'shop_owner' ? '/owner' : '/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (confirmSent) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="mb-3 font-display text-2xl font-bold text-bone">Check your email</h1>
        <p className="text-sm text-mute">
          We sent a confirmation link to {email}. Click it, then come back and sign in.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 font-display text-2xl font-bold text-bone">Sign up</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">I am a…</label>
          <div className="grid gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setRole(opt.value)}
                className={`rounded border px-3 py-2.5 text-left transition-colors ${
                  role === opt.value ? 'border-brand bg-brand/10' : 'border-line bg-panel2'
                }`}
              >
                <p className="text-sm font-medium text-bone">{opt.label}</p>
                <p className="text-xs text-mute">{opt.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Full name</label>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="So shops can reach you about your spot in line"
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone placeholder:text-mute/60"
          />
        </div>
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
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <label className="flex items-start gap-2.5 text-sm text-mute">
          <input
            type="checkbox"
            required
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-panel2 accent-brand"
          />
          <span>
            I agree to Lobby's{' '}
            <Link to="/terms" target="_blank" className="text-brandBright hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="text-brandBright hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error && <p className="text-sm text-crimsonBright">{error}</p>}
        <button
          type="submit"
          disabled={loading || !agreedToTerms}
          className="w-full rounded bg-brand px-4 py-2.5 font-medium text-bone transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        Already have an account?{' '}
        <Link to="/login" className="text-brandBright hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
