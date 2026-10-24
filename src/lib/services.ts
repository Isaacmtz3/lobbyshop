import { supabase } from './supabase'
import type { ShopService } from '../types'

// Live per-shop menu. Callers keep a small generic fallback list so
// check-in never breaks for a shop that hasn't set up services yet.
export async function fetchShopServices(shopId: string, activeOnly = true): Promise<ShopService[]> {
  let query = supabase.from('shop_services').select('*').eq('shop_id', shopId)
  if (activeOnly) query = query.eq('active', true)
  const { data } = await query.order('sort_order').order('name')
  return (data as ShopService[]) ?? []
}

export function formatPriceCents(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`
  return `$${(cents / 100).toFixed(2)}`
}

export interface ServiceOption {
  name: string
  label: string
}

// Picker options from the live menu (label carries the price); falls back to
// the generic list when the shop has no live services yet.
export function toServiceOptions(services: ShopService[], fallback: string[]): ServiceOption[] {
  if (services.length > 0) {
    return services.map((s) => ({ name: s.name, label: `${s.name} — ${formatPriceCents(s.price_cents)}` }))
  }
  return fallback.map((name) => ({ name, label: name }))
}
