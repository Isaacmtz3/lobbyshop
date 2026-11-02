import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { isSafeNextPath, savePendingNext } from '../lib/pendingNext'
import { useAuth } from '../contexts/AuthContext'

const US_STATES = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' }, { abbr: 'AZ', name: 'Arizona' },
  { abbr: 'AR', name: 'Arkansas' }, { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DE', name: 'Delaware' }, { abbr: 'DC', name: 'Dist. of Columbia' },
  { abbr: 'FL', name: 'Florida' }, { abbr: 'GA', name: 'Georgia' }, { abbr: 'HI', name: 'Hawaii' },
  { abbr: 'ID', name: 'Idaho' }, { abbr: 'IL', name: 'Illinois' }, { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' }, { abbr: 'KS', name: 'Kansas' }, { abbr: 'KY', name: 'Kentucky' },
  { abbr: 'LA', name: 'Louisiana' }, { abbr: 'ME', name: 'Maine' }, { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' }, { abbr: 'MN', name: 'Minnesota' },
  { abbr: 'MS', name: 'Mississippi' }, { abbr: 'MO', name: 'Missouri' }, { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' }, { abbr: 'NV', name: 'Nevada' }, { abbr: 'NH', name: 'New Hampshire' },
  { abbr: 'NJ', name: 'New Jersey' }, { abbr: 'NM', name: 'New Mexico' }, { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' }, { abbr: 'ND', name: 'North Dakota' }, { abbr: 'OH', name: 'Ohio' },
  { abbr: 'OK', name: 'Oklahoma' }, { abbr: 'OR', name: 'Oregon' }, { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' }, { abbr: 'SC', name: 'South Carolina' }, { abbr: 'SD', name: 'South Dakota' },
  { abbr: 'TN', name: 'Tennessee' }, { abbr: 'TX', name: 'Texas' }, { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' }, { abbr: 'VA', name: 'Virginia' }, { abbr: 'WA', name: 'Washington' },
  { abbr: 'WV', name: 'West Virginia' }, { abbr: 'WI', name: 'Wisconsin' }, { abbr: 'WY', name: 'Wyoming' },
]

export function SignUp() {
  const { signUp, resendConfirmation } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const safeNext = isSafeNextPath(next) ? next : null
  const emailRedirectTo = safeNext ? `${window.location.origin}${safeNext}` : undefined
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  async function handleResend() {
    setResending(true)
    setResendError(null)
    try {
      await resendConfirmation(email, emailRedirectTo)
      setResent(true)
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!agreedToTerms) return
    setLoading(true)
    setError(null)
    try {
      if (safeNext) savePendingNext(safeNext)
      const { needsEmailConfirmation } = await signUp(
        email,
        password,
        fullName,
        phone,
        'client',
        emailRedirectTo,
        city,
        state,
      )
      if (needsEmailConfirmation) {
        setConfirmSent(true)
      } else {
        navigate(safeNext ?? '/')
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
          We sent a confirmation link to {email}.{' '}
          {safeNext
            ? "Click it, then you'll come right back here to continue checking in."
            : 'Click it, then come back and sign in.'}
        </p>
        <p className="mt-4 text-sm text-mute">
          Didn't get it?{' '}
          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="text-brandBright hover:underline disabled:opacity-50"
          >
            {resending ? 'Sending…' : resent ? 'Confirmation email resent' : 'Resend confirmation email'}
          </button>
        </p>
        {resendError && <p className="mt-2 text-sm text-crimsonBright">{resendError}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 font-display text-2xl font-bold text-bone">Sign up</h1>
      <p className="mb-6 text-sm text-mute">
        Own a barbershop? Owner access is enabled after approval.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Corpus Christi"
              autoComplete="address-level2"
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone placeholder:text-mute/60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s.abbr} value={s.abbr}>
                  {s.abbr} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-mute">
          We use your city to show you barbershops near you first.
        </p>
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
            I agree to Lobbyshop's{' '}
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
          className="w-full rounded bg-brand px-4 py-2.5 font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        Already have an account?{' '}
        <Link
          to={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : '/login'}
          className="text-brandBright hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
