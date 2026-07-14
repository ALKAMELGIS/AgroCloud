import { useCallback, useMemo, useState } from 'react'
import { discoverArcGisServiceLayers, type ArcGisDiscoveredLayer } from '../../../../lib/arcgisServiceDiscover'
import { fetchWfsGeoJson } from '../../../../lib/gisConnections/ogcWfsClient'
import { GIS_CONTENT_DATA_FORMAT_LABELS } from '../../../../lib/gisContentRepository'
import { useGisContentPortal } from '../../../../lib/gisContentPortalStore'
import type { GisContentRow } from '../../../master/gisContentPortalData'
import { GisDataManager } from '../../../satellite/gisDataManager'
import type { GisDataManagerPortalItem } from '../../../satellite/gisDataManager'
import { useAcpPlatform } from '../acpPlatformContext'
import { isAcpExcludedPortalMapRow } from './acpPortalMapLayers'
import {
  ingestAcpLayerFromArcGisRest,
  ingestAcpLayerFromGisContent,
  ingestAcpLayerFromUpload,
  ingestAcpLayerFromUrl,
  ingestAcpWmsLayer,
  ingestAcpWmtsLayer,
  type AcpIngestLayerResult,
} from './acpGisLayerIngest'

export const ACP_GIS_DM_ANCHOR_ID = 'acp-map-rail-add-gis-btn'

type Props = {
  onClose: () => void
  open?: boolean
}

function ogcLayerNameFromUrl(url: string, fallback?: string): string {
  try {
    const parsed = new URL(url)
    const layers =
      parsed.searchParams.get('layers') ||
      parsed.searchParams.get('LAYERS') ||
      parsed.searchParams.get('layer') ||
      parsed.searchParams.get('LAYER')
    const first = layers?.split(',')[0]?.trim()
    if (first) return first
  } catch {
    /* ignore malformed URL */
  }
  return fallback?.trim() || ''
}

function tileMatrixSetFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const value =
      parsed.searchParams.get('tilematrixset') ||
      parsed.searchParams.get('TILEMATRIXSET') ||
      parsed.searchParams.get('TileMatrixSet')
    return value?.trim() || undefined
  } catch {
    return undefined
  }
}

export function AcpGisDataManager({ onClose, open = true }: Props) {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingPortalRowId, setAddingPortalRowId] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<ArcGisDiscoveredLayer[]>([])
  const [selectedRestUrl, setSelectedRestUrl] = useState('')
  const [restToken, setRestToken] = useState('')
  const [layerTitleHint, setLayerTitleHint] = useState('')

  const portalItems: GisDataManagerPortalItem[] = useMemo(
    () =>
      portal.rows
        .filter(r => r.type === 'feature-layer' && !isAcpExcludedPortalMapRow(r))
        .map(row => {
          const format = portal.getItemDetails(row.id)?.dataFormat
          const typeLabel = format ? GIS_CONTENT_DATA_FORMAT_LABELS[format] : row.typeLabel
          return { id: row.id, title: row.title, typeLabel, row }
        }),
    [portal],
  )

  const finishIngest = useCallback(
    async (runner: () => Promise<AcpIngestLayerResult> | AcpIngestLayerResult) => {
      setBusy(true)
      setStatus(null)
      try {
        const result = await runner()
        if (result.isAgroStructures) acp.refreshEngine()
        else if (result.geojson?.features?.length) acp.mapFocusGeoJsonRef.current?.(result.geojson)
        setStatus(result.message)
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add layer.'
        setStatus(message)
        throw err instanceof Error ? err : new Error(message)
      } finally {
        setBusy(false)
      }
    },
    [acp],
  )

  const onImportFiles = useCallback(
    async (files: File[], opts?: { layerName?: string }) => {
      const file = files[0]
      if (!file) throw new Error('No file selected.')
      await finishIngest(() => ingestAcpLayerFromUpload(file, opts?.layerName))
    },
    [finishIngest],
  )

  const onImportRemoteUrl = useCallback(
    async (url: string, opts?: { layerName?: string }) => {
      await finishIngest(() => ingestAcpLayerFromUrl(url, opts?.layerName))
    },
    [finishIngest],
  )

  const onDiscoverArcGis = useCallback(async (url: string, token?: string) => {
    setBusy(true)
    setStatus('Discovering ArcGIS layers…')
    setDiscovered([])
    setRestToken(token?.trim() || '')
    try {
      const layers = await discoverArcGisServiceLayers(url, token ?? '')
      setDiscovered(layers)
      const selectedUrl = layers[0]?.url ?? ''
      setSelectedRestUrl(selectedUrl)
      if (layers[0]?.name) setLayerTitleHint(layers[0].name)
      setStatus(
        layers.length === 1
          ? 'Found 1 layer. Select it and add to the map.'
          : `Found ${layers.length} layer(s). Select one and add to the map.`,
      )
      return {
        layers: layers.map(l => ({
          url: l.url,
          name: l.name,
          kind: l.kind,
          geometryType: l.geometryType,
        })),
        selectedUrl,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Discovery failed.'
      setStatus(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setBusy(false)
    }
  }, [])

  const onConnectArcGis = useCallback(
    async (url: string, token?: string, layerName?: string) => {
      if (layerName?.trim()) setLayerTitleHint(layerName.trim())
      await onDiscoverArcGis(url, token)
    },
    [onDiscoverArcGis],
  )

  const onAddDiscoveredArcGis = useCallback(
    async (layerUrl: string) => {
      const match = discovered.find(l => l.url === layerUrl)
      await finishIngest(() =>
        ingestAcpLayerFromArcGisRest({
          layerUrl,
          title: layerTitleHint || match?.name,
          token: restToken,
        }),
      )
    },
    [discovered, finishIngest, layerTitleHint, restToken],
  )

  const onImportOgcTile = useCallback(
    async (kind: 'wms' | 'wmts' | 'xyz', url: string, layerName?: string) => {
      if (kind === 'xyz') {
        throw new Error('XYZ tile layers are not supported in AgroCloud Platform yet. Use WMS or WMTS.')
      }
      const ogcLayer = ogcLayerNameFromUrl(url, layerName)
      if (!ogcLayer) {
        throw new Error(
          kind === 'wms'
            ? 'Enter a WMS layer name in Layer title, or include LAYERS= in the service URL.'
            : 'Enter a WMTS layer id in Layer title, or include LAYER= in the service URL.',
        )
      }
      await finishIngest(async () => {
        if (kind === 'wms') {
          return ingestAcpWmsLayer({
            serviceUrl: url,
            layerName: ogcLayer,
            title: layerName,
          })
        }
        return ingestAcpWmtsLayer({
          serviceUrl: url,
          layerName: ogcLayer,
          tileMatrixSet: tileMatrixSetFromUrl(url),
          title: layerName,
        })
      })
    },
    [finishIngest],
  )

  const onAddPortalRow = useCallback(
    (row: GisContentRow) => {
      setAddingPortalRowId(row.id)
      void finishIngest(() => ingestAcpLayerFromGisContent(row)).finally(() => setAddingPortalRowId(null))
    },
    [finishIngest],
  )

  const onImportWfs = useCallback(
    async (baseUrl: string, typeName: string, token?: string) => {
      await finishIngest(async () => {
        const fc = await fetchWfsGeoJson(baseUrl, typeName, token)
        const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
        const file = new File([blob], `${typeName || 'wfs'}.geojson`, { type: 'application/geo+json' })
        return ingestAcpLayerFromUpload(file, typeName)
      })
    },
    [finishIngest],
  )

  return (
    <GisDataManager
      open={open}
      onClose={onClose}
      portalItems={portalItems}
      anchorId={ACP_GIS_DM_ANCHOR_ID}
      statusExternal={status ?? undefined}
      discoveredArcGisLayers={discovered}
      selectedDiscoveredArcGisUrl={selectedRestUrl}
      onSelectDiscoveredArcGisUrl={setSelectedRestUrl}
      addingPortalRowId={addingPortalRowId}
      isConnecting={busy}
      isAddingDiscovered={busy}
      isImportingRemote={busy}
      onImportFiles={onImportFiles}
      onImportRemoteUrl={onImportRemoteUrl}
      onConnectArcGis={onConnectArcGis}
      onDiscoverArcGis={onDiscoverArcGis}
      onAddDiscoveredArcGis={onAddDiscoveredArcGis}
      onAddPortalRow={onAddPortalRow}
      onImportWfs={onImportWfs}
      onImportOgcTile={onImportOgcTile}
    />
  )
}
