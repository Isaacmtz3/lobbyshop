// Shop opening-hours helpers.
//
// The shops table carries an optional `hours` jsonb column (see
// supabase/migrations/20261024000000_add_shop_hours.sql — draft, not applied).
// Shape: { mon: { closed, open, close }, ..., sun: {...} } with local
// "HH:MM" times. Close must be after open on the same day; overnight hours
// are not supported. NULL hours means "hours not set": the shop is treated as
// open and check-in is NOT blocked, so shops that never set hours keep
// working exactly as before.

import type { DayHours, ShopHours } from '../types'

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

function day(open: string, close: string, closed = false): DayHours {
  return { closed, open, close }
}

// Starting template for the hours editor (a typical barbershop week). This is
// only an editor default — nothing is written until the owner saves.
export function defaultShopHours(): ShopHours {
  return {
    mon: day('10:00', '19:00'),
    tue: day('10:00', '19:00'),
    wed: day('10:00', '19:00'),
    thu: day('10:00', '19:00'),
    fri: day('10:00', '19:00'),
    sat: day('10:00', '17:00'),
    sun: day('10:00', '17:00', true),
  }
}

// Defensive parse: jsonb arrives as an object, but tolerate a JSON string and
// reject anything malformed by returning null (hours not set).
export function parseShopHours(value: unknown): ShopHours | null {
  let obj: unknown = value
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object') return null
  const record = obj as Record<string, unknown>
  const out: Record<string, DayHours> = {}
  for (const key of DAY_KEYS) {
    const d = record[key] as { closed?: unknown; open?: unknown; close?: unknown } | undefined
    if (!d || typeof d.open !== 'string' || typeof d.close !== 'string') return null
    out[key] = { closed: d.closed === true, open: d.open, close: d.close }
  }
  return out as ShopHours
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export type OpenState = { state: 'unknown' } | { state: 'open' } | { state: 'closed'; nextOpening: Date | null }

export function getOpenState(hours: ShopHours | null, now: Date): OpenState {
  if (!hours) return { state: 'unknown' }
  const dayIdx = (now.getDay() + 6) % 7 // Monday = 0
  const today = hours[DAY_KEYS[dayIdx]]
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (today && !today.closed && minutesOf(today.open) <= nowMin && nowMin < minutesOf(today.close)) {
    return { state: 'open' }
  }
  // Next opening: later today if it hasn't opened yet, else the next open day.
  for (let off = 0; off < 8; off++) {
    const idx = (dayIdx + off) % 7
    const d = hours[DAY_KEYS[idx]]
    if (!d || d.closed) continue
    const openMin = minutesOf(d.open)
    if (off === 0 && openMin <= nowMin) continue
    const date = new Date(now)
    date.setDate(now.getDate() + off)
    date.setHours(Math.floor(openMin / 60), openMin % 60, 0, 0)
    return { state: 'closed', nextOpening: date }
  }
  return { state: 'closed', nextOpening: null }
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function formatNextOpening(d: Date | null, now: Date): string {
  if (!d) return 'No upcoming opening hours listed.'
  const time = formatTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return `today at ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`
  return `${d.toLocaleDateString([], { weekday: 'long' })} at ${time}`
}
