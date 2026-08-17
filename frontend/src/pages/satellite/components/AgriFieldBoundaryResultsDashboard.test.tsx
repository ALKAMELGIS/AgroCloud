import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgriFieldBoundaryResultsDashboard } from './AgriFieldBoundaryResultsDashboard'

afterEach(cleanup)

const geojson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { area_ha: 1.2 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55, 24],
            [55.01, 24],
            [55.01, 24.01],
            [55, 24.01],
            [55, 24],
          ],
        ],
      },
    },
  ],
}

const epochHistory = [
  {
    epoch: 1,
    train_loss: 0.55,
    val_loss: 0.48,
    seconds: 5,
    learning_rate: 6e-5,
    train_accuracy: 0.7,
    val_accuracy: 0.72,
  },
  {
    epoch: 2,
    train_loss: 0.4,
    val_loss: 0.35,
    seconds: 5,
    learning_rate: 6e-5,
    train_accuracy: 0.8,
    val_accuracy: 0.84,
  },
]

describe('AgriFieldBoundaryResultsDashboard', () => {
  it('renders nothing when closed', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const mapContainerRef = { current: host }
    const { container } = render(
      <AgriFieldBoundaryResultsDashboard
        open={false}
        onClose={() => {}}
        mapContainerRef={mapContainerRef}
        geojson={geojson}
        fieldCount={1}
        totalAreaHa={1.2}
        engine="ftw-live"
      />,
    )
    expect(container.querySelector('#si-afb-results-dashboard')).toBeNull()
    host.remove()
  })

  it('shows KPIs, dual charts and Epochs Details from real history', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const mapContainerRef = createRef<HTMLDivElement>()
    Object.defineProperty(mapContainerRef, 'current', { value: host, writable: true })
    render(
      <AgriFieldBoundaryResultsDashboard
        open
        onClose={() => {}}
        mapContainerRef={mapContainerRef}
        geojson={geojson}
        fieldCount={1}
        totalAreaHa={1.2}
        engine="ftw-live"
        score={0.82}
        epochHistory={epochHistory}
      />,
    )
    expect(screen.getByText('Field Results Dashboard')).toBeTruthy()
    expect(screen.queryByText('Validation Detection')).toBeNull()
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getByText('Training loss')).toBeTruthy()
    expect(screen.getByText('Training accuracy')).toBeTruthy()
    expect(screen.getByText('Epochs Details')).toBeTruthy()
    expect(screen.getByText('0.5500')).toBeTruthy()
    expect(screen.getByText('82%')).toBeTruthy()
    host.remove()
  })

  it('renders inline results with validation panel', () => {
    render(
      <AgriFieldBoundaryResultsDashboard
        open
        variant="inline"
        onClose={() => {}}
        mapContainerRef={{ current: null }}
        geojson={geojson}
        fieldCount={1}
        totalAreaHa={1.2}
        engine="ftw-live"
        score={0.82}
      />,
    )
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getAllByText('Validation Detection').length).toBeGreaterThan(0)
    expect(screen.queryByText('Field Results Dashboard')).toBeNull()
  })

  it('explains pretrained FTW engines when there is no epoch history', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const mapContainerRef = createRef<HTMLDivElement>()
    Object.defineProperty(mapContainerRef, 'current', { value: host, writable: true })
    render(
      <AgriFieldBoundaryResultsDashboard
        open
        onClose={() => {}}
        mapContainerRef={mapContainerRef}
        geojson={geojson}
        fieldCount={1}
        totalAreaHa={1.2}
        engine="ftw-infer"
        score={0.9}
        epochHistory={[]}
      />,
    )
    expect(screen.getAllByText(/Pretrained engine/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Validation Detection')).toBeNull()
    expect(screen.getByText('Training loss')).toBeTruthy()
    expect(screen.getByText('Training accuracy')).toBeTruthy()
    expect(screen.getByText('Epochs Details')).toBeTruthy()
    host.remove()
  })

  it('pops out onto document.body when the map host is missing', () => {
    render(
      <AgriFieldBoundaryResultsDashboard
        open
        onClose={() => {}}
        mapContainerRef={{ current: null }}
        geojson={geojson}
        fieldCount={1}
        totalAreaHa={1.2}
        engine="delineate-anything"
        score={0.18}
        epochHistory={epochHistory}
      />,
    )
    expect(screen.getByText('Field Results Dashboard')).toBeTruthy()
    expect(screen.getByText('18%')).toBeTruthy()
    expect(document.body.querySelector('#si-afb-results-dashboard')).toBeTruthy()
  })
})
