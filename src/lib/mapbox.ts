const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface AddressSuggestion {
  id: string
  placeName: string
  addressLine: string
  city: string | null
  lat: number
  lng: number
}

export async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 3) return []

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`)
  url.searchParams.set('access_token', MAPBOX_TOKEN)
  url.searchParams.set('autocomplete', 'true')
  url.searchParams.set('types', 'address')
  url.searchParams.set('country', 'us')
  url.searchParams.set('limit', '5')

  const res = await fetch(url.toString())
  if (!res.ok) return []
  const data = await res.json()

  return (data.features ?? []).map((f: MapboxFeature) => {
    const city = f.context?.find((c) => c.id.startsWith('place.'))?.text ?? null
    const houseNumber = f.address ? `${f.address} ` : ''
    return {
      id: f.id,
      placeName: f.place_name,
      addressLine: `${houseNumber}${f.text}`,
      city,
      lat: f.center[1],
      lng: f.center[0],
    }
  })
}

interface MapboxFeature {
  id: string
  place_name: string
  text: string
  address?: string
  center: [number, number]
  context?: { id: string; text: string }[]
}
