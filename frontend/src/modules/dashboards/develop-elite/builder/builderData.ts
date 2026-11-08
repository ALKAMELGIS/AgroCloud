import { useEffect, useMemo, useState } from 'react'

import { fetchArcGisTableRows, resolveLiveArcgisLayerEndpoint } from '../developEliteArcgisFetch'
import type { DevelopEliteDashboardConfig } from '../developEliteDashboardConfig'
import { DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT } from '../developEliteDashboardEvents'
import { DEVELOP_ELITE_DATA_SOURCES, readDevelopEliteDataSourceUrl } from '../developEliteDataSourceRegistry'
import type { BuilderFieldInfo, BuilderRow } from './builderStats'
import type { BuilderDataSourceRef } from './builderTypes'

export type BuilderSourceOption = { value: string; label: string; url: string }

/** Data sources an element can use: every layer configured in Settings → Data. */
export function builderCatalogSources(config: DevelopEliteDashboardConfig): BuilderSourceOption[] {
  return [...DEVELOP_ELITE_DATA_SOURCES]
    .sort((a, b) => a.order - b.order)
    .map(def => ({ value: def.key, label: def.title, url: readDevelopEliteDataSourceUrl(config, def.key) }))
    .filter(o => o.url)
}

export function builderSourceUrl(source: BuilderDataSourceRef | null, config: DevelopEliteDashboardConfig): string {
  if (!source) return ''
  if (source.kind === 'url') return source.url.trim()
  return builderCatalogSources(config).find(o => o.value === source.key)?.url ?? ''
}

export function builderSourceLabel(source: BuilderDataSourceRef | null, config: DevelopEliteDashboardConfig): string {
  if (!source) return ''
  if (source.kind === 'url') return 'Custom layer'
  return builderCatalogSources(config).find(o => o.value === source.key)?.label ?? source.key
}

type LayerPayload = { fields: BuilderFieldInfo[]; rows: BuilderRow[]; name: string }

const cache = new Map<string, Promise<LayerPayload>>()

function fieldType(esriType: string): BuilderFieldInfo['type'] {
  if (/Integer|Double|Single|SmallInteger|OID|BigInteger/i.test(esriType)) return 'number'
  if (/String|GUID|GlobalID/i.test(esriType)) return 'string'
  if (/Date/i.test(esriType)) return 'date'
  return 'other'
}

const HIDDEN_FIELDS = /^(Shape__|Shape_|SHAPE|GlobalID$|created_|last_edited_)/i

async function loadLayer(url: string): Promise<LayerPayload> {
  const endpoint = await resolveLiveArcgisLayerEndpoint(url, 'layer')
  const metaRes = await fetch(`${endpoint.replace(/\/+$/, '')}?f=json`)
  if (!metaRes.ok) throw new Error(`Layer metadata failed (${metaRes.status})`)
  const meta = (await metaRes.json()) as {
    name?: string
    error?: { message?: string; details?: string[] }
    fields?: Array<{ name: string; alias?: string; type: string; domain?: { codedValues?: Array<{ name: string; code: unknown }> } }>
  }
  if (meta.error) throw new Error(meta.error.details?.[0] || meta.error.message || 'Layer not found')
  const fields: BuilderFieldInfo[] = (meta.fields ?? [])
    .filter(f => !HIDDEN_FIELDS.test(f.name))
    .map(f => {
      const codes = f.domain?.codedValues?.length
        ? new Map(f.domain.codedValues.map(cv => [String(cv.code), String(cv.name)]))
        : undefined
      return { name: f.name, alias: f.alias || f.name, type: fieldType(f.type), ...(codes ? { codes } : {}) }
    })
  const rows = await fetchArcGisTableRows(endpoint)
  return { fields, rows, name: meta.name ?? '' }
}

/** Shared, cached load (many elements on one layer fetch it once). */
export function loadBuilderLayer(url: string): Promise<LayerPayload> {
  const key = url.trim().toLowerCase()
  let pending = cache.get(key)
  if (!pending) {
    pending = loadLayer(url.trim())
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

export function clearBuilderLayerCache(): void {
  cache.clear()
}

export type BuilderLayerState = {
  loading: boolean
  error: string | null
  fields: BuilderFieldInfo[]
  rows: BuilderRow[]
}

const EMPTY: BuilderLayerState = { loading: false, error: null, fields: [], rows: [] }

/** Rows + fields for a layer URL; reloads on the dashboard Refresh button. */
export function useBuilderLayer(url: string): BuilderLayerState {
  const [state, setState] = useState<BuilderLayerState>(url ? { ...EMPTY, loading: true } : EMPTY)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const onRefresh = () => {
      clearBuilderLayerCache()
      setNonce(n => n + 1)
    }
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, onRefresh)
  }, [])

  useEffect(() => {
    if (!url) {
      setState(EMPTY)
      return
    }
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))
    loadBuilderLayer(url).then(
      p => alive && setState({ loading: false, error: null, fields: p.fields, rows: p.rows }),
      (e: unknown) =>
        alive &&
        setState({
          loading: false,
          error: e instanceof Error && !/failed to fetch/i.test(e.message) ? e.message : 'Could not reach this layer.',
          fields: [],
          rows: [],
        }),
    )
    return () => {
      alive = false
    }
  }, [url, nonce])

  return state
}

export function useBuilderFieldMap(fields: BuilderFieldInfo[]): Map<string, BuilderFieldInfo> {
  return useMemo(() => new Map(fields.map(f => [f.name, f])), [fields])
}
