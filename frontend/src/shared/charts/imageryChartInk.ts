import { useEffect, useState } from 'react'

export type ImageryChartInk = {
  tick: string
  label: string
  title: string
  grid: string
  gridFaint: string
  sliceBorder: string
  indexLine: string
}

const DARK_INK: ImageryChartInk = {
  tick: '#94a3b8',
  label: '#cbd5e1',
  title: 'rgba(255,255,255,0.72)',
  grid: 'rgba(255,255,255,0.06)',
  gridFaint: 'rgba(255,255,255,0.04)',
  sliceBorder: '#0a0a0a',
  indexLine: '#6ee7b7',
}

const LIGHT_INK: ImageryChartInk = {
  tick: '#64748b',
  label: '#334155',
  title: 'rgba(15,23,42,0.72)',
  grid: 'rgba(15,23,42,0.08)',
  gridFaint: 'rgba(15,23,42,0.05)',
  sliceBorder: '#ffffff',
  indexLine: '#059669',
}

function readIsLightTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
}

/** Chart.js colors for the Imagery Time Series panel, following `html[data-theme]`. */
export function useImageryChartInk(): ImageryChartInk {
  const [isLight, setIsLight] = useState(readIsLightTheme)

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setIsLight(readIsLightTheme()))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    setIsLight(readIsLightTheme())
    return () => observer.disconnect()
  }, [])

  return isLight ? LIGHT_INK : DARK_INK
}
