import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function NavBar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  const linkClass = 'rounded px-3 py-2 text-mute transition-colors hover:text-bone sm:text-left'

  // Each role gets its own, deliberately short, set of links — a shop
  // owner doesn't need "browse shops" cluttering their bar, and a client
  // has no business seeing staff-facing agent tools.
  const roleLinks = (() => {
    if (!user) return [{ to: '/browse', label: 'Lobby' }]
    switch (profile?.role) {
      case 'shop_owner':
        return [{ to: '/owner', label: 'My shop' }]
      case 'agent':
      case 'staff':
        return [{ to: '/agent', label: 'Agent tools' }]
      case 'admin':
        return [
          { to: '/browse', label: 'Lobby' },
          { to: '/agent', label: 'Agent tools' },
          { to: '/command-center', label: 'Command Center' },
        ]
      default:
        return [{ to: '/browse', label: 'Lobby' }]
    }
  })()

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-void/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="font-display text-xl font-bold tracking-tight text-bone" onClick={() => setMenuOpen(false)}>
          Lobby
        </Link>

        <nav className="hidden items-center gap-2 text-sm sm:flex">
          {roleLinks.map((link) => (
            <Link key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </Link>
          ))}

          {!user && (
            <>
              <Link to="/login" className={linkClass}>
                Sign in
              </Link>
              <Link
                to="/signup"
                className="rounded bg-brand px-4 py-2 font-medium text-bone transition-colors hover:bg-brandBright"
              >
                Sign up
              </Link>
            </>
          )}

          {user && (
            <button onClick={handleSignOut} className={linkClass}>
              Sign out
            </button>
          )}
        </nav>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded border border-line text-bone sm:hidden"
          aria-label="Menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-line px-5 py-3 text-sm sm:hidden">
          {roleLinks.map((link) => (
            <Link key={link.to} to={link.to} className={linkClass} onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}

          {!user && (
            <>
              <Link to="/login" className={linkClass} onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link
                to="/signup"
                className="rounded bg-brand px-3 py-2 text-center font-medium text-bone"
                onClick={() => setMenuOpen(false)}
              >
                Sign up
              </Link>
            </>
          )}

          {user && (
            <button onClick={handleSignOut} className={`${linkClass} text-left`}>
              Sign out
            </button>
          )}
        </nav>
      )}
    </header>
  )
}
