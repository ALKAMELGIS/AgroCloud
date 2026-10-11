import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/mapbox'
import { placeSiFloodSimulationLayers } from '@/modules/remote-sensing/imagery/siMapAnalysisLayerOrder'
import { floodMapCompositeDataUrl } from './floodMapComposite'
import type { UseFloodSimulationReturn } from './useFloodSimulation'

type Props = {
  model: UseFloodSimulationReturn
}

const SOURCE_ID = 'si-flood-sim-raster'
const LAYER_ID = 'si-flood-sim-raster-layer'

export function FloodSimulationMapLayers({ model }: Props) {
  const {
    result,
    previewUrl,
    frameIndex,
    vizMode,
    fineTune,
    imageCoordinates,
    resultsVisible,
    phase,
  } = model
  const maps = useMap()
  const [url, setUrl] = useState<string | null>(null)

  const computed = useMemo(() => {
    if (result) return floodMapCompositeDataUrl(result, frameIndex, vizMode, fineTune)
    return previewUrl
  }, [result, frameIndex, vizMode, fineTune, previewUrl])

  useEffect(() => {
    setUrl(computed ?? null)
  }, [computed])

  const placeLayers = useCallback(() => {
    const map = maps.current?.getMap?.()
    if (!map?.isStyleLoaded?.()) return
    if (!map.getLayer(LAYER_ID)) return
    placeSiFloodSimulationLayers(map)
    map.triggerRepaint?.()
  }, [maps])

  useEffect(() => {
    if (!url || !imageCoordinates || !resultsVisible) return
    let frames = 0
    let raf = 0
    const tick = () => {
      placeLayers()
      const map = maps.current?.getMap?.()
      if (map && frames < 48) {
        frames += 1
        raf = requestAnimationFrame(tick)
      }
    }
    tick()
    const map = maps.current?.getMap?.()
    map?.on?.('idle', placeLayers)
    map?.on?.('styledata', placeLayers)
    return () => {
      cancelAnimationFrame(raf)
      map?.off?.('idle', placeLayers)
      map?.off?.('styledata', placeLayers)
    }
  }, [url, imageCoordinates, resultsVisible, placeLayers, maps, phase])

  if (!resultsVisible || !url || !imageCoordinates) return null

  return (
    <Source
      key={url.slice(0, 80)}
      id={SOURCE_ID}
      type="image"
      url={url}
      coordinates={imageCoordinates}
    >
      <Layer
        id={LAYER_ID}
        type="raster"
        paint={{
          'raster-opacity': fineTune.waterOpacity,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
        }}
      />
    </Source>
  )
}
