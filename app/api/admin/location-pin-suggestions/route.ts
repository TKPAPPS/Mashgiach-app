import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { distanceMeters } from '@/lib/utils/gps'

// Suggests corrected GPS pins for locations whose stored coordinates disagree
// with where inspectors actually scan. For each location we cluster the recent
// device positions, reject outliers, and if the tight cluster center sits far
// from the stored pin we surface it as a suggested correction. The admin
// reviews and applies it; nothing is changed here.

const MIN_SAMPLES = 3          // need at least this many good points to trust a cluster
const OUTLIER_RADIUS_M = 150   // points beyond this from the rough median are dropped
const MAX_SPREAD_M = 60        // reject loose clusters (median absolute deviation cap)
const MIN_OFFSET_M = 80        // only suggest when the pin is at least this far off
const MAX_OFFSET_M = 3000      // beyond this the scan data itself is suspect (wrong city / QR mixup), not a fixable pin

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

type Point = { lat: number; lng: number }

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()

  const { data: locations } = await service
    .from('locations')
    .select('id, name, city, lat, lng')
    .eq('status', 'active')

  const { data: logs } = await service
    .from('visit_logs')
    .select('location_id, device_lat, device_lng, created_at')
    .not('device_lat', 'is', null)
    .not('device_lng', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3000)

  if (!locations || !logs) return NextResponse.json({ suggestions: [] })

  const byLocation = new Map<string, Point[]>()
  for (const log of logs) {
    if (!log.location_id || log.device_lat == null || log.device_lng == null) continue
    const arr = byLocation.get(log.location_id) ?? []
    arr.push({ lat: log.device_lat, lng: log.device_lng })
    byLocation.set(log.location_id, arr)
  }

  const suggestions = []

  for (const loc of locations) {
    if (loc.lat == null || loc.lng == null) continue
    const points = byLocation.get(loc.id) ?? []
    if (points.length < MIN_SAMPLES) continue

    // Pass 1: rough median, then drop points far from it.
    const roughLat = median(points.map(p => p.lat))
    const roughLng = median(points.map(p => p.lng))
    const kept = points.filter(p => distanceMeters(p.lat, p.lng, roughLat, roughLng) <= OUTLIER_RADIUS_M)
    if (kept.length < MIN_SAMPLES) continue

    // Pass 2: median of survivors is the suggested pin.
    const sugLat = median(kept.map(p => p.lat))
    const sugLng = median(kept.map(p => p.lng))

    // Reject loose clusters: typical distance of survivors from the center.
    const spread = median(kept.map(p => distanceMeters(p.lat, p.lng, sugLat, sugLng)))
    if (spread > MAX_SPREAD_M) continue

    const offset = Math.round(distanceMeters(loc.lat, loc.lng, sugLat, sugLng))
    if (offset < MIN_OFFSET_M || offset > MAX_OFFSET_M) continue

    suggestions.push({
      id: loc.id,
      name: loc.name,
      city: loc.city,
      current_lat: loc.lat,
      current_lng: loc.lng,
      suggested_lat: Number(sugLat.toFixed(7)),
      suggested_lng: Number(sugLng.toFixed(7)),
      offset_m: offset,
      samples: kept.length,
      spread_m: Math.round(spread),
    })
  }

  suggestions.sort((a, b) => b.offset_m - a.offset_m)
  return NextResponse.json({ suggestions })
}
