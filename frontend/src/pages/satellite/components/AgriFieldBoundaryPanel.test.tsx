import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgriFieldBoundaryPanel } from './AgriFieldBoundaryPanel'

afterEach(cleanup)

const resultGeojson: GeoJSON.FeatureCollection = {
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

const baseProps = {
  hasAoi: true,
  source: 'ftw-live' as const,
  model: 'ftw-live' as const,
  onModelChange: () => {},
  modelOptions: [{ id: 'ftw-live' as const, label: 'FTW Live' }],
  imagery: 'basemap' as const,
  onImageryChange: () => {},
  imageryOptions: [{ id: 'basemap' as const, label: 'Basemap' }],
  sceneDateFrom: '2024-01-01',
  sceneDateTo: '2024-12-31',
  onSceneDateFromChange: () => {},
  onSceneDateToChange: () => {},
  onUploadImageFile: () => {},
  minConfidence: 0.35,
  onMinConfidenceChange: () => {},
  minAreaM2: 200,
  onMinAreaM2Change: () => {},
  fillOpacity: 0.35,
  onFillOpacityChange: () => {},
  phase: 'done' as const,
  progress: 100,
  busy: false,
  error: null,
  offline: false,
  fieldCount: 12,
  totalAreaHa: 45.5,
  engine: 'ftw-live',
  hasResult: true,
  resultGeojson,
  onRun: () => {},
  onReset: () => {},
  onExportGeojson: () => {},
  onExportShapefile: () => {},
}

function mountWithHost(props: Partial<typeof baseProps> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const mapContainerRef = { current: host }
  const view = render(<AgriFieldBoundaryPanel {...baseProps} {...props} mapContainerRef={mapContainerRef} />)
  return {
    ...view,
    host,
    cleanupHost: () => {
      view.unmount()
      host.remove()
    },
  }
}

describe('AgriFieldBoundaryPanel Results dashboard trigger', () => {
  it('exposes an icon Results control instead of a Validate text tab', () => {
    const { cleanupHost } = mountWithHost()
    expect(screen.queryByText(/^Validate$/)).toBeNull()
    const btn = screen.getByRole('tab', { name: 'Results dashboard' })
    expect(btn.className).toMatch(/si-afb__tab--icon/)
    expect(btn.querySelector('.si-afb__tab-badge')?.textContent).toBe('12')
    cleanupHost()
  })

  it('shows inline results with charts when the Results tab is selected', () => {
    const { cleanupHost } = mountWithHost()
    fireEvent.click(screen.getByRole('tab', { name: 'Results dashboard' }))
    expect(screen.getByText('Field Results')).toBeTruthy()
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getAllByText('Validation Detection').length).toBeGreaterThan(0)
    expect(screen.getByText('Epochs Details')).toBeTruthy()
    cleanupHost()
  })

  it('opens the floating dashboard from Pop out', () => {
    const { cleanupHost } = mountWithHost()
    fireEvent.click(screen.getByRole('tab', { name: 'Results dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open floating dashboard on the map' }))
    expect(screen.getByText('Field Results Dashboard')).toBeTruthy()
    cleanupHost()
  })

  it('switches to inline results from the post-detect stats strip', () => {
    const { cleanupHost } = mountWithHost({ phase: 'idle' })
    fireEvent.click(screen.getByRole('button', { name: 'Open field results dashboard' }))
    expect(screen.getAllByText('Validation Detection').length).toBeGreaterThan(0)
    cleanupHost()
  })

  it('returns to Detect and closes floating dashboard on Reset', () => {
    const onReset = vi.fn()
    const { cleanupHost } = mountWithHost({ onReset })
    fireEvent.click(screen.getByRole('tab', { name: 'Results dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open floating dashboard on the map' }))
    expect(screen.getByText('Field Results Dashboard')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Detect/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onReset).toHaveBeenCalled()
    expect(screen.queryByText('Field Results Dashboard')).toBeNull()
    cleanupHost()
  })
})
