import { useCallback, useState } from 'react'
import { appAlert } from '../../../lib/appDialog'
import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import type { GisContentRow } from '../../master/gisContentPortalData'
import type {
  AgroCloudDashboardConfig,
  AgroCloudDashboardElementKind,
} from './agroCloudDashboardData'
import {
  appendElementWithoutDataBinding,
  applyDashboardLayerSelection,
  registerGisContentForLayerPick,
  type DashboardLayerOption,
  type DashboardPendingElement,
  widgetKindSkipsDataPicker,
} from './agroCloudDashboardLayerSelection'
import {
  addMapFromGisContentWithSettings,
  appendDashboardElement,
  createGenericDashboardElement,
  updateIndicatorElementSettings,
  updateMapElementSettings,
  type IndicatorElementUpdatePayload,
} from './agroCloudDashboardElements'
import { widgetRequiresDataPicker } from './agroCloudDashboardWidgetRegistry'
import {
  defaultMapWidgetSettings,
  type AgroCloudDashboardMapWidgetSettings,
} from './agroCloudDashboardMapWidgetSettings'

export type MapWidgetConfigSession = {
  row: GisContentRow
  elementId: string | null
  initialSettings: AgroCloudDashboardMapWidgetSettings
}

export type UseDashboardAddElementFlowOptions = {
  setConfig: (updater: (prev: AgroCloudDashboardConfig) => AgroCloudDashboardConfig) => void
  onAfterAdd?: (next: AgroCloudDashboardConfig) => void
}

/** Step 1: Select a layer · Step 2: Browse all layers (GIS Content) */
export type DashboardLayerPickerStep = 'closed' | 'select' | 'browse'

export function useDashboardAddElementFlow({ setConfig, onAfterAdd }: UseDashboardAddElementFlowOptions) {
  const [pendingAdd, setPendingAdd] = useState<DashboardPendingElement | null>(null)
  const [pendingElementId, setPendingElementId] = useState<string | null>(null)
  const [layerPickerStep, setLayerPickerStep] = useState<DashboardLayerPickerStep>('closed')
  const [mapConfigSession, setMapConfigSession] = useState<MapWidgetConfigSession | null>(null)
  const [indicatorConfigElementId, setIndicatorConfigElementId] = useState<string | null>(null)

  const resetAddFlow = useCallback(() => {
    setPendingAdd(null)
    setPendingElementId(null)
    setLayerPickerStep('closed')
  }, [])

  const beginMapWidgetConfig = useCallback((row: GisContentRow, elementId: string | null = null, settings?: AgroCloudDashboardMapWidgetSettings) => {
    setMapConfigSession({
      row,
      elementId,
      initialSettings: settings ?? defaultMapWidgetSettings(row.title),
    })
    resetAddFlow()
  }, [resetAddFlow])

  const commitConfig = useCallback(
    (updater: (prev: AgroCloudDashboardConfig) => AgroCloudDashboardConfig) => {
      setConfig(prev => {
        const next = updater(prev)
        if (next !== prev) onAfterAdd?.(next)
        return next
      })
    },
    [onAfterAdd, setConfig],
  )

  const cancelAddFlow = useCallback(() => {
    if (pendingElementId) {
      setConfig(prev => ({
        ...prev,
        elements: prev.elements.filter(el => el.id !== pendingElementId),
      }))
    }
    resetAddFlow()
  }, [pendingElementId, resetAddFlow, setConfig])

  const handleElementOptionClick = useCallback(
    (kind: AgroCloudDashboardElementKind, label: string) => {
      if (widgetKindSkipsDataPicker(kind) || !widgetRequiresDataPicker(kind)) {
        commitConfig(prev => appendDashboardElement(prev, createGenericDashboardElement(kind, label)))
        return
      }

      if (kind === 'map') {
        setPendingAdd({ kind, label })
        setPendingElementId(null)
        setLayerPickerStep('select')
        return
      }

      let elementId = ''
      setConfig(prev => {
        const { config: withElement, element } = appendElementWithoutDataBinding(prev, kind, label)
        elementId = element.id
        return withElement
      })
      setPendingAdd({ kind, label })
      setPendingElementId(elementId)
      setLayerPickerStep('select')
    },
    [commitConfig, setConfig],
  )

  const handleLayerSelected = useCallback(
    (option: DashboardLayerOption) => {
      if (!pendingAdd) return

      if (pendingAdd.kind === 'map') {
        const row = getGisContentRowById(option.gisContentId)
        if (row?.type === 'web-map') {
          beginMapWidgetConfig(row)
          return
        }
      }

      commitConfig(prev => {
        if (!pendingElementId) return prev
        return applyDashboardLayerSelection(prev, pendingElementId, option)
      })
      resetAddFlow()
    },
    [beginMapWidgetConfig, commitConfig, pendingAdd, pendingElementId, resetAddFlow],
  )

  const handleBrowseGisSelected = useCallback(
    (row: GisContentRow) => {
      if (!pendingAdd) return

      if (pendingAdd.kind === 'map' && row.type === 'web-map') {
        beginMapWidgetConfig(row)
        return
      }

      let finished = false
      setConfig(prev => {
        const { config: registered, layers } = registerGisContentForLayerPick(prev, row)
        if (layers.length === 1 && pendingElementId) {
          finished = true
          const next = applyDashboardLayerSelection(registered, pendingElementId, layers[0]!)
          onAfterAdd?.(next)
          return next
        }
        return registered
      })

      if (finished) {
        resetAddFlow()
        return
      }

      setLayerPickerStep('select')
    },
    [beginMapWidgetConfig, onAfterAdd, pendingAdd, pendingElementId, resetAddFlow, setConfig],
  )

  const openMapWidgetConfig = useCallback((config: AgroCloudDashboardConfig, elementId: string) => {
    const el = config.elements.find(e => e.id === elementId)
    if (!el?.gisContentId || el.kind !== 'map') return
    const row = getGisContentRowById(el.gisContentId)
    if (!row) return
    beginMapWidgetConfig(row, elementId, el.mapSettings ?? defaultMapWidgetSettings(el.label))
  }, [beginMapWidgetConfig])

  const commitMapWidgetConfig = useCallback(
    (settings: AgroCloudDashboardMapWidgetSettings) => {
      if (!mapConfigSession) return
      const { row, elementId } = mapConfigSession
      commitConfig(prev => {
        if (elementId) return updateMapElementSettings(prev, elementId, settings)
        return addMapFromGisContentWithSettings(prev, row, settings)
      })
      setMapConfigSession(null)
    },
    [commitConfig, mapConfigSession],
  )

  const cancelMapWidgetConfig = useCallback(() => {
    setMapConfigSession(null)
  }, [])

  const openIndicatorWidgetConfig = useCallback((_config: AgroCloudDashboardConfig, elementId: string) => {
    setIndicatorConfigElementId(elementId)
  }, [])

  const commitIndicatorWidgetConfig = useCallback(
    (payload: IndicatorElementUpdatePayload) => {
      if (!indicatorConfigElementId) return
      commitConfig(prev => {
        const withSources = payload.dataSources ? { ...prev, dataSources: payload.dataSources } : prev
        return updateIndicatorElementSettings(withSources, indicatorConfigElementId, payload)
      })
      setIndicatorConfigElementId(null)
    },
    [commitConfig, indicatorConfigElementId],
  )

  const cancelIndicatorWidgetConfig = useCallback(() => {
    setIndicatorConfigElementId(null)
  }, [])

  const handleNewDataExpression = useCallback(async () => {
    await appAlert(
      'Data expressions (SQL / Arcade-style) will connect to hosted feature layers and REST services. This builder step is coming next.',
      { title: 'New data expression' },
    )
  }, [])

  return {
    pendingAdd,
    layerPickerStep,
    selectLayerOpen: layerPickerStep === 'select',
    browseGisOpen: layerPickerStep === 'browse',
    mapConfigSession,
    handleElementOptionClick,
    handleLayerSelected,
    handleBrowseGisSelected,
    cancelAddFlow,
    openBrowseGis: () => setLayerPickerStep('browse'),
    closeBrowseGis: () => setLayerPickerStep('select'),
    handleNewDataExpression,
    openMapWidgetConfig,
    commitMapWidgetConfig,
    cancelMapWidgetConfig,
    indicatorConfigElementId,
    openIndicatorWidgetConfig,
    commitIndicatorWidgetConfig,
    cancelIndicatorWidgetConfig,
  }
}
