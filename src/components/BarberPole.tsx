/** Lobbyshop's logo mark: a hand-drawn barber pole, not an emoji pole.
 *  Chrome caps, polished orb top, fine red/white/blue helix — the blue is
 *  the app brand blue, so the mark and the wordmark read as one logo.
 *  Used by the landing header and the app nav. */
export function BarberPole({ className = 'h-16 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 180" className={`${className} shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]`}>
      <defs>
        <linearGradient id="poleChrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#475569" />
          <stop offset="0.22" stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#94a3b8" />
          <stop offset="0.62" stopColor="#e2e8f0" />
          <stop offset="0.82" stopColor="#64748b" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <radialGradient id="poleOrb" cx="0.38" cy="0.32" r="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#64748b" />
        </radialGradient>
        <pattern id="poleHelix" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="18" fill="#e8392e" />
          <rect x="6" width="6" height="18" fill="#f8fafc" />
          <rect x="12" width="6" height="18" fill="#2f6fed" />
        </pattern>
        <linearGradient id="poleGlass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="poleCurve" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0f172a" stopOpacity="0.28" />
          <stop offset="0.25" stopColor="#0f172a" stopOpacity="0" />
          <stop offset="0.75" stopColor="#0f172a" stopOpacity="0" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.28" />
        </linearGradient>
        <clipPath id="poleTubeClip">
          <rect x="22" y="36" width="28" height="108" rx="13" />
        </clipPath>
      </defs>

      {/* orb top */}
      <circle cx="36" cy="14" r="11" fill="url(#poleOrb)" stroke="#334155" strokeWidth="1" />
      <circle cx="32" cy="10" r="3" fill="#ffffff" opacity="0.95" />
      {/* top chrome collar */}
      <rect x="26" y="24" width="20" height="8" rx="3.5" fill="url(#poleChrome)" stroke="#334155" strokeWidth="0.75" />
      {/* tube */}
      <g clipPath="url(#poleTubeClip)">
        <rect x="22" y="36" width="28" height="108" fill="url(#poleHelix)" />
        <rect x="22" y="36" width="28" height="108" fill="url(#poleCurve)" />
        <rect x="24.5" y="36" width="7" height="108" fill="url(#poleGlass)" />
      </g>
      <rect x="22" y="36" width="28" height="108" rx="13" fill="none" stroke="#0f172a" strokeOpacity="0.35" strokeWidth="1" />
      {/* bottom chrome collar + base */}
      <rect x="26" y="144" width="20" height="8" rx="3.5" fill="url(#poleChrome)" stroke="#334155" strokeWidth="0.75" />
      <rect x="20" y="152" width="32" height="10" rx="5" fill="url(#poleChrome)" stroke="#334155" strokeWidth="1" />
    </svg>
  )
}
