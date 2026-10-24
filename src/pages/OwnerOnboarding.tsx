import { useEffect, useState, type FormEvent } from 'react'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Shop } from '../types'
import { OwnerDashboard } from './OwnerDashboard'

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function OwnerOnboarding() {
  const { user } = useAuth()
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('shops')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setShop(data as Shop | null)
        setLoading(false)
      })
  }, [user])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSubmitting(true)
    setError(null)

    const { data: newShop, error: shopError } = await supabase
      .from('shops')
      .insert({
        owner_id: user.id,
        name,
        slug,
        city,
        address,
        phone,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      .select()
      .single()

    if (shopError) {
      setError(shopError.message)
      setSubmitting(false)
      return
    }

    const { error: staffError } = await supabase
      .from('shop_staff')
      .insert({ shop_id: newShop.id, user_id: user.id, role: 'owner' })

    if (staffError) {
      setError(staffError.message)
      setSubmitting(false)
      return
    }

    setShop(newShop as Shop)
    setSubmitting(false)
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-5 py-10 text-mute">Loading…</div>
  }

  if (shop) {
    return <OwnerDashboard shop={shop} onShopUpdated={setShop} />
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <h1 className="mb-1 font-display text-2xl font-bold text-bone">List your shop on Lobby</h1>
      <p className="mb-6 text-sm text-mute">
        Set up your queue board — clients will find you from the shop directory.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Shop name</label>
          <input
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugEdited) setSlug(slugify(e.target.value))
            }}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">
            Lobby URL — lobby.app/shop/{slug || 'your-shop'}
          </label>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value))
              setSlugEdited(true)
            }}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Address</label>
          <AddressAutocomplete
            value={address}
            onChange={(next) => {
              setAddress(next)
              setCoords(null)
            }}
            onSelect={(suggestion) => {
              setAddress(suggestion.addressLine)
              if (suggestion.city) setCity(suggestion.city)
              setCoords({ lat: suggestion.lat, lng: suggestion.lng })
            }}
          />
        </div>
        {error && <p className="text-sm text-crimsonBright">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand px-4 py-2.5 font-medium text-bone transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {submitting ? 'Creating…' : 'Create shop'}
        </button>
      </form>
    </div>
  )
}
