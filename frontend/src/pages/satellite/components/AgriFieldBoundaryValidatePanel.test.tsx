import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgriFieldBoundaryValidatePanel } from './AgriFieldBoundaryValidatePanel'

afterEach(cleanup)

function field(lon: number, props: Record<string, unknown>): GeoJSON.Feature {
  const size = 0.002
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon, 24],
          [lon + size, 24],
          [lon + size, 24 + size],
          [lon, 24 + size],
          [lon, 24],
        ],
      ],
    },
  }
}

const detection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    field(55.0, { area_ha: 0.6, footprint_method: 'pivot-circle', footprint_regularized: true }),
    field(55.01, { area_ha: 12, footprint_method: 'obb', footprint_regularized: true }),
    field(55.02, { area_ha: 60, footprint_method: 'kept' }),
  ],
}

describe('AgriFieldBoundaryValidatePanel', () => {
  it('asks for a detection when there is no result yet', () => {
    render(
      <AgriFieldBoundaryValidatePanel geojson={null} fieldCount={0} totalAreaHa={0} engine={null} />,
    )
    expect(screen.getByText(/Detect Fields/)).toBeTruthy()
  })

  it('renders validation chart lead-in, reference prompt, chips and Epochs Details', () => {
    render(
      <AgriFieldBoundaryValidatePanel
        geojson={detection}
        fieldCount={3}
        totalAreaHa={72.6}
        engine="ftw-live"
        score={0.82}
        epochHistory={[
          {
            epoch: 1,
            train_loss: 1163.396,
            val_loss: 312.6799,
            seconds: 5,
            metrics: { average_precision: 0.469581 },
          },
        ]}
      />,
    )
    expect(screen.getByText('Validation Detection')).toBeTruthy()
    expect(screen.getByText(/Compare detections with a reference/)).toBeTruthy()
    expect(screen.getByText(/Precision \/ Recall \/ F1/)).toBeTruthy()
    expect(screen.getByText(/Upload a reference GeoJSON|FoW \/ FTW/)).toBeTruthy()
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getByText('Epochs Details')).toBeTruthy()
    expect(screen.getByText('Training Loss')).toBeTruthy()
    expect(screen.getByText('1163.396')).toBeTruthy()
    expect(screen.getByText('82%')).toBeTruthy()
    expect(screen.getByText('ftw-live')).toBeTruthy()
  })

  it('hides KPI chips and Epochs Details in dashboard variant', () => {
    render(
      <AgriFieldBoundaryValidatePanel
        variant="dashboard"
        geojson={detection}
        fieldCount={3}
        totalAreaHa={72.6}
        engine="ftw-live"
        score={0.82}
        epochHistory={[
          {
            epoch: 1,
            train_loss: 1.2,
            val_loss: 0.9,
            seconds: 5,
          },
        ]}
      />,
    )
    expect(screen.getByText('Validation Detection')).toBeTruthy()
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.queryByText('Accuracy vs reference')).toBeNull()
    expect(screen.queryByText('Epochs Details')).toBeNull()
    expect(screen.queryByText('82%')).toBeNull()
  })

  it('auto-applies training reference and shows validation metrics', () => {
    const reference: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        field(55.0, { area_ha: 0.6 }),
        field(55.01, { area_ha: 12 }),
      ],
    }
    render(
      <AgriFieldBoundaryValidatePanel
        geojson={detection}
        fieldCount={3}
        totalAreaHa={72.6}
        engine="ftw-live"
        initialReference={reference}
        initialReferenceName="Training samples · 2 polygons"
      />,
    )
    expect(screen.getByText('Training samples · 2 polygons')).toBeTruthy()
    expect(screen.getAllByText(/Precision/).length).toBeGreaterThan(0)
  })
})
