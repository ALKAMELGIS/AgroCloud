import { useEffect, useMemo, useState } from 'react'
import { useGisSelection } from '../../gisSelection/GisSelectionContext'
import { computeSelectionStats } from '../../../../lib/gisSelection/selectionStats'
import type { GisSelectableLayer } from '../../../../lib/gisSelection/types'
import { GisSelectByAttributesPanel } from './GisSelectByAttributesPanel'
import { GisSelectByLocationPanel } from './GisSelectByLocationPanel'
import { GisSelectionAttributeTablePanel } from './GisSelectionAttributeTablePanel'
import { GisSelectionResultsPanel } from './GisSelectionResultsPanel'
import { GisSelectionToolbar } from './GisSelectionToolbar'
import './gisSelection.css'

export function GisSelectionWorkbench() {
  const {
    active,
    setActive,
    layers,
    hits,
    tool,
    setTool,
    setMode,
    setSetMode,
    selectableLayerIds,
    setSelectableLayerIds,
    applyHits,
    clearSelection,
    zoomToSelection,
    exportSelection,
  } = useGisSelection()

  const [attributesOpen, setAttributesOpen] = useState(false)
  const [queryAttributesOpen, setQueryAttributesOpen] = useState(false)
  const [queryLocationOpen, setQueryLocationOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const [referenceLayerId, setReferenceLayerId] = useState('')

  useEffect(() => {
    if (!active || selectableLayerIds.size) return
    setSelectableLayerIds(new Set(layers.map(l => String(l.id))))
  }, [active, layers, selectableLayerIds.size, setSelectableLayerIds])

  useEffect(() => {
    if (!active) setResultsOpen(false)
  }, [active])

  const stats = useMemo(() => computeSelectionStats(hits, layers), [hits, layers])

  const layerRows: GisSelectableLayer[] = useMemo(
    () =>
      layers.map(l => {
        const featureCount = Array.isArray(l.geojson?.features) ? l.geojson!.features!.length : 0
        const selectedCount = hits.filter(h => h.layerId === String(l.id)).length
        return {
          id: String(l.id),
          name: l.name,
          featureCount,
          selectable: selectableLayerIds.has(String(l.id)),
          selectedCount,
        }
      }),
    [hits, layers, selectableLayerIds],
  )

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !e.ctrlKey) setSetMode('add')
      if (e.ctrlKey && e.shiftKey) setSetMode('subset')
      else if (e.ctrlKey) setSetMode('remove')
      if (e.key === 'Escape') {
        if (resultsOpen) setResultsOpen(false)
        else if (attributesOpen) setAttributesOpen(false)
        else if (queryAttributesOpen) setQueryAttributesOpen(false)
        else if (queryLocationOpen) setQueryLocationOpen(false)
        else setActive(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, attributesOpen, queryAttributesOpen, queryLocationOpen, resultsOpen, setActive, setSetMode])

  if (!active) return null

  return (
    <>
      <GisSelectionToolbar
        active={active}
        tool={tool}
        setMode={setMode}
        selectedCount={stats.featureCount}
        resultsOpen={resultsOpen}
        onToolChange={setTool}
        onSetModeChange={setSetMode}
        onOpenResults={() => setResultsOpen(v => !v)}
        onOpenAttributes={() => {
          setAttributesOpen(true)
          setQueryAttributesOpen(false)
          setQueryLocationOpen(false)
          setResultsOpen(false)
        }}
        onOpenLocation={() => {
          zoomToSelection()
        }}
        onClear={clearSelection}
        onDeactivate={() => setActive(false)}
      />
      <GisSelectionAttributeTablePanel open={attributesOpen} hits={hits} onClose={() => setAttributesOpen(false)} />
      <GisSelectionResultsPanel
        open={resultsOpen}
        stats={stats}
        layers={layerRows}
        onToggleLayer={(layerId, selectable) => {
          const next = new Set(selectableLayerIds)
          if (selectable) next.add(layerId)
          else next.delete(layerId)
          setSelectableLayerIds(next)
        }}
        onZoom={zoomToSelection}
        onClear={clearSelection}
        onExport={exportSelection}
        onSelectByAttributes={() => {
          setQueryAttributesOpen(true)
          setQueryLocationOpen(false)
          setResultsOpen(false)
        }}
        onSelectByLocation={() => {
          setQueryLocationOpen(true)
          setQueryAttributesOpen(false)
          setResultsOpen(false)
        }}
        onClose={() => setResultsOpen(false)}
      />
      <GisSelectByAttributesPanel
        open={queryAttributesOpen}
        layers={layers}
        selectableLayerIds={selectableLayerIds}
        onApply={incoming => applyHits(incoming)}
        onClose={() => setQueryAttributesOpen(false)}
      />
      <GisSelectByLocationPanel
        open={queryLocationOpen}
        layers={layers}
        selectableLayerIds={selectableLayerIds}
        referenceLayerId={referenceLayerId}
        onReferenceLayerChange={setReferenceLayerId}
        onApply={incoming => applyHits(incoming)}
        onClose={() => setQueryLocationOpen(false)}
      />
    </>
  )
}
