import { useCallback, useEffect, useState } from 'react'
import type {
  RealtimeAlertContext,
  RealtimeAlertFarmSelection,
  RealtimeAlertIssue,
  RealtimeAlertKpiPayload,
  RealtimeAlertTimeseries,
  RealtimeAlertTraceRow,
} from '../types/realtimeAlert.types'

const API = '/api/v1/realtime-alert'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${path} failed (${res.status})`)
  return res.json() as Promise<T>
}

export function useRealtimeAlertApi() {
  const [context, setContext] = useState<RealtimeAlertContext | null>(null)
  const [kpis, setKpis] = useState<RealtimeAlertKpiPayload | null>(null)
  const [issues, setIssues] = useState<RealtimeAlertIssue[]>([])
  const [recommendations, setRecommendations] = useState<Array<{ id: string; priority: string; text: string }>>([])
  const [zonesGeoJson, setZonesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [traceRows, setTraceRows] = useState<RealtimeAlertTraceRow[]>([])
  const [traceTotal, setTraceTotal] = useState(0)
  const [pestSeries, setPestSeries] = useState<RealtimeAlertTimeseries | null>(null)
  const [diseaseSeries, setDiseaseSeries] = useState<RealtimeAlertTimeseries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ctx, kpi, alerts, recs, zones, trace, pest, disease] = await Promise.all([
        fetchJson<RealtimeAlertContext>('/context'),
        fetchJson<RealtimeAlertKpiPayload>('/kpis'),
        fetchJson<{ issues: RealtimeAlertIssue[] }>('/alerts/today'),
        fetchJson<{ items: Array<{ id: string; priority: string; text: string }> }>('/recommendations'),
        fetchJson<GeoJSON.FeatureCollection>('/zones/geojson'),
        fetchJson<{ rows: RealtimeAlertTraceRow[]; total: number }>('/traceability?page=1&pageSize=50'),
        fetchJson<RealtimeAlertTimeseries>('/timeseries?metric=pest_etl'),
        fetchJson<RealtimeAlertTimeseries>('/timeseries?metric=disease_etl'),
      ])
      setContext(ctx)
      setKpis(kpi)
      setIssues(alerts.issues ?? [])
      setRecommendations(recs.items ?? [])
      setZonesGeoJson(zones)
      setTraceRows(trace.rows ?? [])
      setTraceTotal(trace.total ?? 0)
      setPestSeries(pest)
      setDiseaseSeries(disease)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    context,
    kpis,
    setKpis,
    issues,
    recommendations,
    zonesGeoJson,
    traceRows,
    traceTotal,
    pestSeries,
    diseaseSeries,
    loading,
    error,
    refresh,
  }
}

export function buildDefaultSelection(ctx: RealtimeAlertContext | null): RealtimeAlertFarmSelection {
  const d = ctx?.defaults ?? {}
  return {
    farmId: d.farmId ?? ctx?.farms?.[0]?.id ?? '',
    cropId: d.cropId ?? ctx?.crops?.[0]?.id ?? '',
    locationId: d.locationId ?? ctx?.locations?.[0]?.id ?? '',
    sowingDate: d.sowingDate ?? '',
    analysisDate: d.analysisDate ?? new Date().toISOString().slice(0, 10),
  }
}
