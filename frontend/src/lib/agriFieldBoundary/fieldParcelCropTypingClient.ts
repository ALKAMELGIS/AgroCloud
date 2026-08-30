/**
 * Per-parcel crop typing — Prithvi 18-band HLS stack (+ country phenology fallback).
 * POST /api/crop-classification/parcels
 */

import { apiUrl } from '../apiOrigin'
import { normalizeHlsCropTypeName } from './hlsCropTypeNormalize'

export type FieldParcelCropInput = {
  fieldKey: string
  geometry: GeoJSON.Geometry
}

export type FieldParcelCropResult = {
  fieldKey: string
  cropType: string | null
  confidencePct: number | null
  engine: string | null
  sampleCount?: number
}

export type ClassifyFieldParcelsResponse = {
  engine: string
  country?: { code: string; name: string; source?: string } | null
  dates?: string[]
  parcels: FieldParcelCropResult[]
}

export class FieldParcelCropTypingError extends Error {
  readonly offline: boolean
  constructor(message: string, opts?: { offline?: boolean }) {
    super(message)
    this.name = 'FieldParcelCropTypingError'
    this.offline = Boolean(opts?.offline)
  }
}

export async function classifyFieldParcelsCropTypes(
  parcels: FieldParcelCropInput[],
  season: { start: string; end: string },
  signal?: AbortSignal,
): Promise<ClassifyFieldParcelsResponse> {
  const normalized = parcels.filter(p => p.fieldKey && p.geometry)
  if (!normalized.length) {
    return { engine: 'none', parcels: [] }
  }

  let res: Response
  try {
    res = await fetch(apiUrl('/api/crop-classification/parcels'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcels: normalized, season }),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new FieldParcelCropTypingError('Could not reach crop classification service.', { offline: true })
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
  if (!res.ok) {
    throw new FieldParcelCropTypingError(
      String(json.error || `Parcel crop typing failed (HTTP ${res.status}).`),
      { offline: res.status === 502 || res.status === 503 },
    )
  }

  const rawParcels = Array.isArray(json.parcels) ? json.parcels : []
  return {
    engine: String(json.engine || 'unknown'),
    country: (json.country as ClassifyFieldParcelsResponse['country']) ?? null,
    dates: Array.isArray(json.dates) ? (json.dates as string[]) : [],
    parcels: rawParcels.map(p => {
      const row = p as Record<string, unknown>
      const cropType = normalizeHlsCropTypeName(
        row.cropType != null ? String(row.cropType) : null,
      )
      return {
        fieldKey: String(row.fieldKey || ''),
        cropType,
        confidencePct:
          row.confidencePct != null && Number.isFinite(Number(row.confidencePct))
            ? Number(row.confidencePct)
            : null,
        engine: row.engine != null ? String(row.engine) : null,
        sampleCount: Number(row.sampleCount) || 0,
      }
    }),
  }
}

export function cropHintsMapFromParcelResults(
  parcels: FieldParcelCropResult[],
): Map<string, { cropType: string; confidencePct: number; engine: string }> {
  const out = new Map<string, { cropType: string; confidencePct: number; engine: string }>()
  for (const p of parcels) {
    if (!p.fieldKey || !p.cropType) continue
    out.set(p.fieldKey, {
      cropType: p.cropType,
      confidencePct: p.confidencePct ?? 0,
      engine: p.engine || 'unknown',
    })
  }
  return out
}
