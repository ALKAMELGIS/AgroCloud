import { Suspense } from 'react'
import Home from '../Home'
import Overview from '../dashboards/Overview'
import ExternalPageLink from './ExternalPageLink'
import { lazyWithRetry } from '../../lib/lazyWithRetry'

const GisMap = lazyWithRetry(() => import('../satellite/GisMap'), 'GisMap')
const SatelliteIntelligence = lazyWithRetry(() => import('../satellite/SatelliteIntelligence'), 'SatelliteIntelligence')

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <p>This page is configured from System Settings — assign a binding target or replace this placeholder.</p>
    </div>
  )
}

export type BindTarget =
  | 'placeholder'
  | 'home'
  | 'gis'
  | 'satellite-indices'
  | 'dashboards-overview'
  | 'external'

export default function DynamicBindPage({
  bindTarget,
  title,
  externalUrl,
}: {
  bindTarget: BindTarget
  title: string
  externalUrl?: string
}) {
  const fb = <div style={{ padding: 16 }}>Loading…</div>
  switch (bindTarget) {
    case 'home':
      return (
        <Suspense fallback={fb}>
          <Home />
        </Suspense>
      )
    case 'gis':
      return (
        <Suspense fallback={fb}>
          <GisMap />
        </Suspense>
      )
    case 'satellite-indices':
      return (
        <Suspense fallback={fb}>
          <SatelliteIntelligence />
        </Suspense>
      )
    case 'dashboards-overview':
      return (
        <Suspense fallback={fb}>
          <Overview />
        </Suspense>
      )
    case 'external':
      return <ExternalPageLink url={externalUrl ?? ''} title={title} />
    default:
      return <Placeholder title={title} />
  }
}
