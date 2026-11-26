import type { GpsCheck } from '@/lib/supabase/types'
export type { GpsCheck, GpsEnforcement } from '@/lib/supabase/types'

/** Haversine distance in metres between two GPS coordinates */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) { return (deg * Math.PI) / 180 }

export const GPS_THRESHOLD_METERS = 100

/** Extra allowance on top of the threshold for a coarse fix, capped so a
 *  very inaccurate reading cannot pass as "on site". */
export const GPS_ACCURACY_ALLOWANCE_MAX_M = 50

/** A fix less precise than this is not trusted at all. */
export const GPS_MAX_ACCURACY_M = 300

/** A rescan within this window returns the existing visit instead of creating
 *  a new row (stops accidental entry + exit seconds apart). */
export const SCAN_DEBOUNCE_MS = 2 * 60 * 1000

/** An entry older than this is treated as never closed: the next scan opens a
 *  new visit instead of closing the stale one. */
export const MAX_VISIT_HOURS = 12


export function evaluateGps(
  device: { lat: number | null; lng: number | null; accuracy: number | null },
  location: { lat: number | null; lng: number | null },
): { check: GpsCheck; distance: number | null } {
  if (location.lat == null || location.lng == null) return { check: 'location_no_coords', distance: null }
  if (device.lat == null || device.lng == null) return { check: 'no_gps', distance: null }
  const distance = Math.round(distanceMeters(device.lat, device.lng, Number(location.lat), Number(location.lng)))
  if (device.accuracy != null && device.accuracy > GPS_MAX_ACCURACY_M) return { check: 'low_accuracy', distance }
  const allowance = Math.min(device.accuracy ?? 0, GPS_ACCURACY_ALLOWANCE_MAX_M)
  if (distance > GPS_THRESHOLD_METERS + allowance) return { check: 'too_far', distance }
  return { check: 'ok', distance }
}

/** Impossible travel: two scans by the same inspector further apart than
 *  IMPOSSIBLE_TRAVEL_MIN_KM, at a speed above IMPOSSIBLE_TRAVEL_KMH, within
 *  IMPOSSIBLE_TRAVEL_WINDOW_H. On the history up to 26/11/2026 this rule matched
 *  no real inspector, so every alert is worth a look. */
export const IMPOSSIBLE_TRAVEL_MIN_KM = 5
export const IMPOSSIBLE_TRAVEL_KMH = 150
export const IMPOSSIBLE_TRAVEL_WINDOW_H = 24

export function impossibleTravel(
  prev: { lat: number; lng: number; at: string },
  cur: { lat: number; lng: number; at: string },
): { km: number; kmh: number } | null {
  const km = distanceMeters(prev.lat, prev.lng, cur.lat, cur.lng) / 1000
  const hours = Math.max((new Date(cur.at).getTime() - new Date(prev.at).getTime()) / 3600_000, 1 / 60)
  if (hours > IMPOSSIBLE_TRAVEL_WINDOW_H) return null
  const kmh = km / hours
  return km > IMPOSSIBLE_TRAVEL_MIN_KM && kmh > IMPOSSIBLE_TRAVEL_KMH ? { km, kmh } : null
}
