/** Where a signup/sign-in should return to afterwards (e.g. the shop page
 * someone was trying to check into). Stored in localStorage because the
 * email-confirmation round trip leaves the app: the confirmation link may
 * land back on "/" instead of the shop page, and this is the backup that
 * sends the fresh account straight to the shop to finish checking in.
 * Internal paths only, 24h expiry, consumed on first use — never an
 * open redirect and never a stale hijack of a later sign-in. */
const KEY = 'lobbyshop-pending-next'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function isSafeNextPath(path: string | null): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//') && !path.includes('://')
}

export function savePendingNext(path: string) {
  if (!isSafeNextPath(path)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() }))
  } catch {
    // Private mode or blocked storage: the email redirect itself still tries.
  }
}

export function consumePendingNext(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    localStorage.removeItem(KEY)
    const { path, ts } = JSON.parse(raw) as { path?: unknown; ts?: unknown }
    if (typeof path !== 'string' || typeof ts !== 'number') return null
    if (Date.now() - ts > MAX_AGE_MS) return null
    return isSafeNextPath(path) ? path : null
  } catch {
    return null
  }
}
