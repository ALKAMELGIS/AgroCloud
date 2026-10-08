import { useEffect, useRef } from 'react'

import maplibregl, { type StyleSpecification } from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'

import {

  buildBasemapCatalog,

  catalogEntryById,

  mapboxGlStyleForEntry,

  resolveBasemapId,

} from '@/modules/gis/map/basemapCatalog'

import { bindSiGlobeCockpitSpin, nudgeSiMapboxGlobeCanvas } from '@/modules/gis/map/siGlobeCockpit'

import {

  applyMapLibreGlobeGalaxySky,

  mergeMapLibreGlobeCockpitStyle,

  setMapLibreGlobeProjection,

} from '@/modules/gis/map/maplibreGlobeEnvironment'

import { ensureRasterStyleMaxNativeZoom } from '@/modules/gis/layers/raster/rasterTileZoom'

import { agroCloudMapboxTransformRequest } from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'

import {

  DEVELOP_ELITE_GLOBE_COCKPIT_MAX_PITCH,

  DEVELOP_ELITE_GLOBE_COCKPIT_MAX_ZOOM,

  DEVELOP_ELITE_GLOBE_COCKPIT_VIEW,

} from './developEliteGlobeCockpitView'



const GLOBE_COCKPIT_BASEMAP_ID = 'google-satellite-hybrid'



function resolveGlobeCockpitStyle(): StyleSpecification {

  const catalog = buildBasemapCatalog('')

  const entry =

    catalogEntryById(catalog, resolveBasemapId(GLOBE_COCKPIT_BASEMAP_ID)) ?? catalog[0]

  const style = entry ? mapboxGlStyleForEntry(entry) : mapboxGlStyleForEntry(catalog[0]!)

  const raw = typeof style === 'string' ? JSON.parse(style) : style

  const withZoom = ensureRasterStyleMaxNativeZoom(raw as Record<string, unknown>)

  return mergeMapLibreGlobeCockpitStyle(withZoom) as StyleSpecification

}



function applyGlobeEnvironment(map: maplibregl.Map): void {

  setMapLibreGlobeProjection(map)

  applyMapLibreGlobeGalaxySky(map)

}



type Props = {

  active: boolean

}



/** 3D globe + galaxy sky (MapLibre globe projection + sky atmosphere). */

export function DevelopEliteGlobeCockpitCanvas({ active }: Props) {

  const hostRef = useRef<HTMLDivElement | null>(null)

  const mapRef = useRef<maplibregl.Map | null>(null)

  const spinPausedRef = useRef(false)

  const activeRef = useRef(active)

  activeRef.current = active



  useEffect(() => {

    const el = hostRef.current

    if (!el) return



    const lng = DEVELOP_ELITE_GLOBE_COCKPIT_VIEW.longitude ?? 20

    const lat = DEVELOP_ELITE_GLOBE_COCKPIT_VIEW.latitude ?? 0

    const zoom = DEVELOP_ELITE_GLOBE_COCKPIT_VIEW.zoom ?? 0.78

    const pitch = DEVELOP_ELITE_GLOBE_COCKPIT_VIEW.pitch ?? 34

    const bearing = DEVELOP_ELITE_GLOBE_COCKPIT_VIEW.bearing ?? 0



    const map = new maplibregl.Map({

      container: el,

      style: resolveGlobeCockpitStyle(),

      center: [lng, lat],

      zoom,

      pitch,

      bearing,

      maxZoom: DEVELOP_ELITE_GLOBE_COCKPIT_MAX_ZOOM,

      maxPitch: DEVELOP_ELITE_GLOBE_COCKPIT_MAX_PITCH,

      projection: { type: 'globe' },

      attributionControl: false,

      fadeDuration: 0,

      renderWorldCopies: false,

      dragRotate: true,

      pitchWithRotate: true,

      transformRequest: (url, resourceType) =>

        agroCloudMapboxTransformRequest(url, resourceType ?? undefined) as {

          url: string

          credentials?: 'omit' | 'same-origin' | 'include'

        },

    })

    mapRef.current = map



    let unbindSpin = () => {}



    const boot = () => {

      applyGlobeEnvironment(map)

      nudgeSiMapboxGlobeCanvas(map, el)

      unbindSpin()

      unbindSpin = bindSiGlobeCockpitSpin(map, {

        isPaused: () => !activeRef.current || spinPausedRef.current,

        onUserEngaged: () => {

          spinPausedRef.current = true

        },

      })

    }



    const onStyleData = () => applyGlobeEnvironment(map)



    if (map.loaded()) boot()

    else map.once('load', boot)

    map.on('style.load', onStyleData)



    const ro = new ResizeObserver(() => {

      if (!activeRef.current) return

      nudgeSiMapboxGlobeCanvas(map, el)

    })

    ro.observe(el)



    return () => {

      map.off('style.load', onStyleData)

      unbindSpin()

      ro.disconnect()

      map.remove()

      mapRef.current = null

    }

  }, [])



  useEffect(() => {

    if (!active) return

    spinPausedRef.current = false

    const map = mapRef.current

    const el = hostRef.current

    if (!map || !el) return

    requestAnimationFrame(() => {

      applyGlobeEnvironment(map)

      nudgeSiMapboxGlobeCanvas(map, el)

      map.resize()

      map.triggerRepaint()

    })

  }, [active])



  return (

    <div

      className="develop-elite-map__globe-cockpit si-map-container si-map-container--globe-cockpit develop-elite-map__galaxy-backdrop"

      ref={hostRef}

      role="tabpanel"

      id="de-map-pane-globe"

      aria-labelledby="de-map-tab-globe"

    />

  )

}


