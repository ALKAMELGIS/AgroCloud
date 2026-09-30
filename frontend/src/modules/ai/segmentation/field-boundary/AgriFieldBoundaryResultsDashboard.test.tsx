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
        engine="delineate-anything"
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
        engine="delineate-anything"
        score={0.82}
        epochHistory={epochHistory}
      />,
    )
    expect(screen.getByText('Optimal Learning Rate Finder')).toBeTruthy()
    expect(screen.queryByText('Validation Detection')).toBeNull()
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getByText('Training vs Validation Loss')).toBeTruthy()
    expect(screen.getByText('Optimal Learning Rate')).toBeTruthy()
    expect(screen.getByText('Dataset Distribution')).toBeTruthy()
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
        engine="delineate-anything"
        score={0.82}
      />,
    )
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getAllByText('Validation Detection').length).toBeGreaterThan(0)
    expect(screen.queryByText('Field Results Dashboard')).toBeNull()
  })

  it('shows Optimal Learning Rate chart after field detect without epoch history', () => {
    render(
      <AgriFieldBoundaryResultsDashboard
        open
        variant="inline"
        onClose={() => {}}
        mapContainerRef={{ current: null }}
        geojson={geojson}
        fieldCount={70}
        totalAreaHa={120}
        engine="ftw-inference-s2"
        score={0.72}
        activeAoiKey="aoi-test"
        aoiLabel="Active AOI"
      />,
    )
    expect(screen.getByText('Optimal Learning Rate')).toBeTruthy()
    expect(screen.queryByText(/No LR sweep yet/i)).toBeNull()
    expect(screen.getByText('70 samples')).toBeTruthy()
  })

  it('shows Optimal Learning Rate chart from training sample counts when fieldCount is zero', () => {
    render(
      <AgriFieldBoundaryResultsDashboard
        open
        variant="inline"
        onClose={() => {}}
        mapContainerRef={{ current: null }}
        geojson={null}
        fieldCount={0}
        totalAreaHa={0}
        engine="ftw-inference-s2"
        activeAoiKey="aoi-samples"
        aoiLabel="Active AOI (Edit)"
        approvedSamples={63}
        draftSamples={7}
      />,
    )
    expect(screen.getByText('Optimal Learning Rate')).toBeTruthy()
    expect(screen.queryByText(/No LR sweep yet/i)).toBeNull()
    expect(screen.getByText('70 samples')).toBeTruthy()
  })

  it('explains pretrained field engines when there is no epoch history', () => {
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
        engine="delineate-anything"
        score={0.9}
        epochHistory={[]}
      />,
    )
    expect(screen.getAllByText(/Pretrained engine/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Validation Detection')).toBeNull()
    expect(screen.getByText('Training vs Validation Loss')).toBeTruthy()
    expect(screen.getByText('Optimal Learning Rate')).toBeTruthy()
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
    expect(screen.getByText('Optimal Learning Rate Finder')).toBeTruthy()
    expect(screen.getByText('18%')).toBeTruthy()
    expect(document.body.querySelector('#si-afb-results-dashboard')).toBeTruthy()
  })
})
