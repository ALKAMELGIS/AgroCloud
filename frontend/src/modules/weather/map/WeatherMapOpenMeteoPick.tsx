import { useCallback, useEffect, useRef, useState } from 'react'

import { createPortal } from 'react-dom'

import { CircleMarker, useMap } from 'react-leaflet'

import {

  fetchOpenMeteoWeatherMapPick,

  type OpenMeteoWeatherSnapshot,

} from '@/modules/remote-sensing/weather/openMeteoWeather'

import { registerDevelopEliteMapIntelPick } from '@/modules/dashboard/develop-elite/developEliteMapIntelPick'

import { wmoWeatherEmojiMeta } from '../config/wmoWeatherEmoji'



type Props = {

  active: boolean

  onActiveChange: (active: boolean) => void

  onApplyPick?: (point: { lat: number; lng: number; label: string }) => void

}



function WeatherMapPickLoader({

  active,

  point,

  onSnapshot,

  onStatus,

  onError,

}: {

  active: boolean

  point: { lat: number; lng: number } | null

  onSnapshot: (snap: OpenMeteoWeatherSnapshot | null) => void

  onStatus: (s: 'idle' | 'loading' | 'ready' | 'error') => void

  onError: (msg: string) => void

}) {

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)



  useEffect(() => {

    if (!active || !point) {

      if (!active) {

        onStatus('idle')

        onSnapshot(null)

        onError('')

      }

      return

    }



    if (debounceRef.current) clearTimeout(debounceRef.current)

    const ac = new AbortController()

    debounceRef.current = window.setTimeout(() => {

      onStatus('loading')

      onError('')

      fetchOpenMeteoWeatherMapPick(point.lat, point.lng, ac.signal)

        .then(snap => {

          if (ac.signal.aborted) return

          onSnapshot(snap)

          onStatus('ready')

        })

        .catch(err => {

          if (ac.signal.aborted) return

          if (err instanceof DOMException && err.name === 'AbortError') return

          onSnapshot(null)

          onError('Open-Meteo did not respond')

          onStatus('error')

        })

    }, 220)



    return () => {

      if (debounceRef.current) clearTimeout(debounceRef.current)

      ac.abort()

    }

  }, [active, onError, onSnapshot, onStatus, point])



  return null

}



export function WeatherMapOpenMeteoPickEngine({

  active,

  onApplyPick,

}: {

  active: boolean

  onApplyPick?: (point: { lat: number; lng: number; label: string }) => void

}) {

  const map = useMap()

  const host = map.getContainer()

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)

  const [snapshot, setSnapshot] = useState<OpenMeteoWeatherSnapshot | null>(null)

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const [error, setError] = useState('')



  useEffect(() => {

    if (!active) {

      setPoint(null)

      setSnapshot(null)

      setStatus('idle')

      setError('')

    }

  }, [active])



  useEffect(() => {

    if (!active) return

    return registerDevelopEliteMapIntelPick(map, (lat, lng) => setPoint({ lat, lng }))

  }, [active, map])



  const stopMapEvent = (event: { stopPropagation(): void }) => {

    event.stopPropagation()

  }



  const applyPick = useCallback(() => {

    if (!point) return

    const label = `Map pick ${point.lat.toFixed(2)}°, ${point.lng.toFixed(2)}°`

    onApplyPick?.({ lat: point.lat, lng: point.lng, label })

  }, [onApplyPick, point])



  const wxMeta = wmoWeatherEmojiMeta(snapshot?.weatherCode)

  const tempWhole =

    snapshot?.temperatureC != null && Number.isFinite(snapshot.temperatureC)

      ? Math.round(snapshot.temperatureC)

      : null



  if (!host) return null



  return (

    <>

      <WeatherMapPickLoader

        active={active}

        point={point}

        onSnapshot={setSnapshot}

        onStatus={setStatus}

        onError={setError}

      />

      {active && point ? (

        <CircleMarker

          center={[point.lat, point.lng]}

          radius={9}

          pathOptions={{

            color: 'rgba(255, 204, 0, 0.85)',

            fillColor: 'rgba(255, 204, 0, 0.55)',

            fillOpacity: 0.92,

            weight: 2,

          }}

        />

      ) : null}

      {active

        ? createPortal(

            <aside

              className="weather-map-stage__insight-panel weather-om-pick-panel"

              aria-label="Open-Meteo map pick"

              onPointerDown={stopMapEvent}

              onClick={stopMapEvent}

              onDoubleClick={stopMapEvent}

            >

              <div className="weather-om-pick-panel__sheen" aria-hidden />

              <header className="weather-om-pick-panel__head">

                <span className="weather-om-pick-panel__brand">Open-Meteo</span>

                {status === 'ready' ? (

                  <span className="weather-om-pick-panel__live" aria-live="polite">Live</span>

                ) : null}

              </header>



              {!point ? (

                <p className="weather-om-pick-panel__hint">Click the map to sample weather at a point.</p>

              ) : null}



              {point && status === 'loading' ? (

                <div className="weather-om-pick-panel__loading" aria-busy="true">

                  <span

                    className={`weather-om-pick-panel__emoji weather-om-pick-panel__emoji--${wxMeta.anim}`}

                    aria-hidden

                  >

                    {wxMeta.emoji}

                  </span>

                  <span className="weather-om-pick-panel__loading-text">Reading forecast…</span>

                </div>

              ) : null}



              {status === 'error' ? (

                <p className="weather-om-pick-panel__error">{error}</p>

              ) : null}



              {snapshot && point ? (

                <div className="weather-om-pick-panel__body">

                  <div className="weather-om-pick-panel__hero">

                    <span

                      className={`weather-om-pick-panel__emoji weather-om-pick-panel__emoji--${wxMeta.anim}`}

                      aria-hidden

                    >

                      {wxMeta.emoji}

                    </span>

                    <div className="weather-om-pick-panel__temp-block">

                      <span className="weather-om-pick-panel__temp" aria-label="Temperature">

                        {tempWhole != null ? tempWhole : '—'}

                        <span className="weather-om-pick-panel__temp-unit">°C</span>

                      </span>

                      <span className="weather-om-pick-panel__condition">{snapshot.conditionLabel}</span>

                    </div>

                  </div>



                  <dl className="weather-om-pick-panel__metrics">

                    <div>

                      <dt>Humidity</dt>

                      <dd>

                        {snapshot.humidityPct != null ? `${Math.round(snapshot.humidityPct)}%` : '—'}

                      </dd>

                    </div>

                    <div>

                      <dt>Wind</dt>

                      <dd>

                        {snapshot.windSpeedKmh != null

                          ? `${Math.round(snapshot.windSpeedKmh)} km/h`

                          : '—'}

                        {snapshot.windDirectionLabel ? ` ${snapshot.windDirectionLabel}` : ''}

                      </dd>

                    </div>

                  </dl>



                  <p className="weather-om-pick-panel__coords">

                    {point.lat.toFixed(3)}°, {point.lng.toFixed(3)}°

                  </p>



                  <button type="button" className="weather-om-pick-panel__apply" onClick={applyPick}>

                    Use for dashboard forecast

                  </button>

                </div>

              ) : null}

            </aside>,

            host,

          )

        : null}

    </>

  )

}


