import { useNavigate } from 'react-router-dom'
import type { ProfileRole } from '../types'

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_PROPS}>
      <path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}

function StoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_PROPS}>
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M2.5 6 4 3h16l1.5 3a2.5 2.5 0 0 1-5 1 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5-1Z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...ICON_PROPS}>
      <rect x="3" y="5" width="18" height="16" rx="5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2c2.9.5 5 2.7 5 5.8" />
    </svg>
  )
}

function ScissorsWatermark() {
  return (
    <svg
      className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 text-white/[0.04]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="m20 4-14.5 14.5M20 20 8.5 8.5" />
    </svg>
  )
}

/** Subtle film-grain overlay — the single cheapest trick for making a flat
 * gradient read as "designed" instead of a default CSS background. */
function Grain({ className = '' }: { className?: string }) {
  return (
    <svg className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" opacity="0.045" />
    </svg>
  )
}

/** Hand-drawn flat-illustration barber chair — fills the hero's empty
 * right column on desktop with on-theme content instead of leaving it
 * blank, no external image or generation service involved. */
function BarberChairIllustration() {
  return (
    <svg viewBox="0 0 320 320" className="h-full w-full">
      <defs>
        <radialGradient id="chairGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#2f6fed" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#2f6fed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="chairBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      <circle cx="160" cy="150" r="150" fill="url(#chairGlow)" />
      <ellipse cx="160" cy="280" rx="90" ry="12" fill="#0f172a" opacity="0.08" />

      {/* mirror ring behind the chair */}
      <circle cx="160" cy="130" r="92" fill="none" stroke="#2f6fed" strokeOpacity="0.15" strokeWidth="10" />

      {/* pedestal base + column */}
      <path d="M118 272c0-10 19-16 42-16s42 6 42 16" fill="#1a4fc2" />
      <rect x="150" y="196" width="20" height="62" rx="6" fill="url(#chairBody)" />
      <ellipse cx="160" cy="196" rx="34" ry="10" fill="#334155" />

      {/* seat */}
      <rect x="112" y="168" width="96" height="34" rx="12" fill="url(#chairBody)" />
      {/* armrests */}
      <rect x="92" y="166" width="26" height="14" rx="7" fill="#1e293b" />
      <rect x="202" y="166" width="26" height="14" rx="7" fill="#1e293b" />

      {/* backrest, tilted slightly */}
      <g transform="rotate(-6 160 110)">
        <rect x="122" y="56" width="76" height="118" rx="16" fill="url(#chairBody)" />
        <rect x="134" y="70" width="52" height="90" rx="10" fill="#2f6fed" fillOpacity="0.1" />
      </g>
      {/* headrest */}
      <rect x="136" y="42" width="48" height="26" rx="10" fill="#334155" />

      {/* accent stripe echoing the barber pole */}
      <rect x="150" y="196" width="20" height="62" rx="6" fill="none" stroke="#e8392e" strokeOpacity="0.25" strokeWidth="1.5" />
    </svg>
  )
}

/** Glossy, chrome-capped barber pole — a detailed illustration rather than
 * a flat striped bar, matching a classic storefront barber-pole look. */
function BarberPole({ className = 'h-16 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 260" className={`${className} shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]`}>
      <defs>
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="35%" stopColor="#cbd5e1" />
          <stop offset="65%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <pattern id="poleStripes" width="30" height="30" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="30" height="30" fill="#ffffff" />
          <rect width="11" height="30" fill="#e8392e" />
          <rect x="19" width="11" height="30" fill="#2f6fed" />
        </pattern>
        <clipPath id="bodyClip">
          <rect x="21" y="52" width="58" height="156" rx="27" />
        </clipPath>
      </defs>

      {/* body */}
      <rect x="21" y="52" width="58" height="156" rx="27" fill="url(#poleStripes)" stroke="#0f172a" strokeWidth="5" />
      <rect x="30" y="58" width="13" height="144" rx="6.5" fill="#ffffff" opacity="0.3" clipPath="url(#bodyClip)" />

      {/* top chrome cap + sphere */}
      <rect x="13" y="36" width="74" height="24" rx="12" fill="url(#chrome)" stroke="#0f172a" strokeWidth="5" />
      <circle cx="50" cy="26" r="25" fill="url(#chrome)" stroke="#0f172a" strokeWidth="5" />
      <ellipse cx="40" cy="16" rx="9" ry="6" fill="#ffffff" opacity="0.75" />

      {/* bottom chrome caps */}
      <rect x="13" y="200" width="74" height="24" rx="12" fill="url(#chrome)" stroke="#0f172a" strokeWidth="5" />
      <rect x="18" y="221" width="64" height="26" rx="13" fill="url(#chrome)" stroke="#0f172a" strokeWidth="5" />
      <ellipse cx="34" cy="232" rx="8" ry="5" fill="#ffffff" opacity="0.6" />
    </svg>
  )
}

export function Landing() {
  const navigate = useNavigate()

  function goToSignUp(defaultRole: ProfileRole) {
    navigate('/signup', { state: { defaultRole } })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      {/* Gradient-mesh backdrop: two soft, oversized blurred blobs behind the
          hero. This is what gives a flat-white page actual depth without a photo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden">
        <div className="absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-brand/15 blur-[110px]" />
        <div className="absolute -right-24 top-10 h-[420px] w-[420px] rounded-full bg-crimson/10 blur-[110px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-900/5 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-extrabold tracking-tight text-brand">Lobby</span>
            <BarberPole />
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => navigate('/login')}
              className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:block"
            >
              Sign in
            </button>
            <button
              onClick={() => goToSignUp('shop_owner')}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(47,111,237,0.5)] transition-all hover:-translate-y-px hover:bg-brandBright hover:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_24px_-6px_rgba(47,111,237,0.6)] active:translate-y-0"
            >
              For barbershops
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        <div className="grid items-center gap-10 pt-14 sm:grid-cols-[1.1fr_0.9fr] sm:gap-6 sm:pt-20">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-brand">
              The barbershop queue, made easy
            </p>
            <h1 className="max-w-xl sm:max-w-none font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              Find your next cut.
              <br />
              <span className="bg-gradient-to-r from-brand to-[#1a4fc2] bg-clip-text text-transparent">
                Know the wait
              </span>{' '}
              before you go.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
              Explore nearby barbershops, check live wait times, then join the queue or book with
              your barber.
            </p>

            <div className="mt-9 max-w-sm space-y-3">
              <button
                onClick={() => goToSignUp('client')}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-4 text-base font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_24px_-8px_rgba(47,111,237,0.55)] transition-all hover:-translate-y-0.5 hover:bg-brandBright hover:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_16px_28px_-8px_rgba(47,111,237,0.65)] active:translate-y-0"
              >
                <PinIcon />
                Browse shops
              </button>
              <button
                onClick={() => goToSignUp('shop_owner')}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand bg-white px-6 py-4 text-base font-semibold text-brand shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand/5 hover:shadow-md active:translate-y-0"
              >
                <StoreIcon />
                I own a barbershop
              </button>
              <p className="pt-1 text-center text-sm text-slate-500 sm:hidden">
                Already have an account?{' '}
                <button onClick={() => navigate('/login')} className="font-medium text-brand hover:underline">
                  Sign in
                </button>
              </p>
            </div>
          </div>

          <div className="hidden sm:block" aria-hidden>
            <BarberChairIllustration />
          </div>
        </div>

        <div className="relative mt-16 overflow-hidden rounded-3xl bg-slate-900 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.5)] sm:mt-24">
          {/* Ambient glow + grain give the dark panel a photographic feel without a photo */}
          <div className="pointer-events-none absolute -left-20 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-crimson/20 blur-[90px]" />
          <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-brand/25 blur-[90px]" />
          <Grain className="opacity-60 mix-blend-overlay" />
          <ScissorsWatermark />

          <div className="relative flex min-h-[320px] items-center">
            <div className="flex h-full shrink-0 items-stretch py-10 pl-6 sm:pl-10">
              <div
                className="w-6 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                style={{
                  background:
                    'repeating-linear-gradient(45deg, #e8392e 0 10px, #ffffff 10px 20px, #2f6fed 20px 30px, #ffffff 30px 40px)',
                }}
              />
            </div>
            <div className="grid flex-1 gap-8 px-6 py-10 sm:grid-cols-2 sm:items-center sm:px-10">
              <div>
                <h2 className="font-display text-2xl font-bold leading-snug text-white sm:text-3xl">
                  Your next cut, without the guesswork
                </h2>
                <div className="mt-4 h-1 w-10 rounded-full bg-brand" />
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 text-slate-900 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1),0_24px_48px_-16px_rgba(0,0,0,0.25)]">
                <p className="font-display text-lg font-bold">Platinum Kutz Barbershop</p>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-volt">
                  <span className="h-2 w-2 rounded-full bg-volt shadow-[0_0_0_3px_rgba(53,208,127,0.15)]" />
                  Live wait time
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">8 min wait</p>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                  <PeopleIcon />
                  3 barbers available
                </div>
                <button
                  onClick={() => goToSignUp('client')}
                  className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-brandBright hover:shadow-md active:translate-y-0"
                >
                  Join queue
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 sm:mt-28">
          <h2 className="text-center font-display text-3xl font-extrabold tracking-tight">How Lobby works</h2>
          <div className="relative mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent sm:block" />
            {[
              { step: 1, icon: <PinIcon />, label: 'Find a shop' },
              { step: 2, icon: <ClockIcon />, label: 'Check the wait' },
              { step: 3, icon: <CalendarIcon />, label: 'Join or book' },
            ].map(({ step, icon, label }) => (
              <div key={step} className="relative flex flex-col items-center text-center">
                <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {step}
                </span>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand/20 bg-brand/5 text-brand shadow-[0_4px_12px_-4px_rgba(47,111,237,0.3)]">
                  {icon}
                </div>
                <p className="mt-3 font-semibold text-slate-900">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
