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
  source: 'delineate-fbis' as const,
  model: 'delineate-fbis' as const,
  onModelChange: () => {},
  modelOptions: [{ id: 'delineate-fbis' as const, label: 'Delineate Anything (v2)' }],
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
  minAreaM2: 1,
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
  engine: 'delineate-anything',
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
  it('shows Agricultural Field Delineation model info when selected', () => {
    const { cleanupHost } = mountWithHost({
      model: 'agricultural-field-delineation',
      source: 'agricultural-field-delineation',
      modelOptions: [
        { id: 'agricultural-field-delineation' as const, label: 'Agricultural Field Delineation' },
        { id: 'delineate-fbis' as const, label: 'Delineate Anything (v2)' },
      ],
      phase: 'idle',
      hasResult: false,
      fieldCount: 0,
      resultGeojson: { type: 'FeatureCollection', features: [] },
      health: {
        agricultural_field_delineation: true,
        agricultural_field_delineation_status: {
          ready: true,
          info: {
            architecture: 'MaskRCNN',
            backbone: 'resnet50',
            resolution_m: 10,
            ap_field: 0.6429,
            bands: ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B8A', 'B09', 'B11', 'B12'],
          },
        },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'View info' }))
    expect(screen.getByLabelText('Model information')).toBeTruthy()
    expect(screen.getByText('12-band Sentinel-2 L2A BOA')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('0.6429')).toBeTruthy()
    cleanupHost()
  })
  it('exposes an icon Results control instead of a Validate text tab', () => {
    const { cleanupHost } = mountWithHost()
    expect(screen.queryByText(/^Validate$/)).toBeNull()
    const btn = screen.getByRole('tab', { name: 'Optimal Learning Rate Finder' })
    expect(btn.className).toMatch(/si-afb__tab--icon/)
    expect(btn.querySelector('.si-afb__tab-badge')?.textContent).toBe('12')
    cleanupHost()
  })

  it('shows inline results with charts when the Results tab is selected', () => {
    const { cleanupHost } = mountWithHost()
    fireEvent.click(screen.getByRole('tab', { name: 'Optimal Learning Rate Finder' }))
    expect(screen.getByText('Optimal Learning Rate Finder')).toBeTruthy()
    expect(screen.queryByText('Size distribution')).toBeNull()
    expect(screen.getAllByText('Validation Detection').length).toBeGreaterThan(0)
    expect(screen.getByText('Epochs Details')).toBeTruthy()
    cleanupHost()
  })

  it('opens the floating dashboard from Pop out', () => {
    const { cleanupHost } = mountWithHost()
    fireEvent.click(screen.getByRole('tab', { name: 'Optimal Learning Rate Finder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open floating Optimal Learning Rate Finder on the map' }))
    const float = document.getElementById('si-afb-results-dashboard')
    expect(float).toBeTruthy()
    expect(float?.textContent).toContain('Optimal Learning Rate Finder')
    expect(float?.textContent).toContain('Training vs Validation Loss')
    expect(float?.textContent).toContain('Optimal Learning Rate')
    expect(float?.textContent).toContain('Epochs Details')
    expect(float?.textContent).not.toMatch(/Validation Detection/)
    cleanupHost()
  })

  it('keeps Detect tab active when field results are ready (dashboard is manual)', () => {
    const { cleanupHost } = mountWithHost({ phase: 'done' })
    expect(screen.getByRole('tab', { name: 'Detect Fields' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByText('Attributes dashboard')).toBeNull()
    cleanupHost()
  })

  it('switches to dashboard from the post-detect stats strip', () => {
    const { cleanupHost } = mountWithHost({ phase: 'idle' })
    fireEvent.click(screen.getByRole('tab', { name: 'Detect Fields' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open layer attributes dashboard' }))
    expect(screen.getByLabelText('Field attributes dashboard')).toBeTruthy()
    cleanupHost()
  })

  it('shows attributes dashboard when the Dashboard tab is selected', () => {
    const { cleanupHost } = mountWithHost()
    fireEvent.click(screen.getByRole('tab', { name: 'Attributes dashboard' }))
    expect(screen.getByLabelText('Field attributes dashboard')).toBeTruthy()
    expect(screen.getByText('Area by field')).toBeTruthy()
    expect(screen.getByText('Crop type')).toBeTruthy()
    cleanupHost()
  })

  it('dashboard tab is icon-only with aria label', () => {
    const { cleanupHost } = mountWithHost()
    const tab = screen.getByRole('tab', { name: 'Attributes dashboard' })
    expect(tab.querySelector('.si-afb__tab-badge')).toBeNull()
    cleanupHost()
  })

  it('detect tab is icon-only with aria label', () => {
    const { cleanupHost } = mountWithHost()
    expect(screen.queryByText(/^Detect$/)).toBeNull()
    expect(screen.getByRole('tab', { name: 'Detect Fields' })).toBeTruthy()
    cleanupHost()
  })

  it('returns to Detect and closes floating dashboard on Reset', () => {
    const onReset = vi.fn()
    const { cleanupHost } = mountWithHost({ onReset })
    fireEvent.click(screen.getByRole('tab', { name: 'Optimal Learning Rate Finder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open floating Optimal Learning Rate Finder on the map' }))
    expect(document.getElementById('si-afb-results-dashboard')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Detect Fields' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onReset).toHaveBeenCalled()
    expect(document.querySelector('#si-afb-results-dashboard')).toBeNull()
    cleanupHost()
  })

  it('shows loading copy instead of legacy :8092 offline banner', () => {
    const { cleanupHost } = mountWithHost({
      phase: 'error',
      error: 'Service offline — start agri-field-boundary on :8092',
      hasResult: false,
      fieldCount: 0,
      resultGeojson: { type: 'FeatureCollection', features: [] },
      health: { loading: true, live: true, ready: false, status: 'loading' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Detect Fields' }))
    expect(screen.getByText(/Loading field model/i)).toBeTruthy()
    cleanupHost()
  })

  it('exposes Training Samples tab when training API is provided', () => {
    const generateFromPredictions = vi.fn(() => 1)
    const trainingSamples = {
      samples: [],
      selectedId: null,
      selected: null,
      counts: { draft: 0, approved: 0, rejected: 0, total: 0 },
      samplesGeojson: { type: 'FeatureCollection' as const, features: [] },
      approvedGeojson: { type: 'FeatureCollection' as const, features: [] },
      notice: null,
      error: null,
      clearNotice: () => {},
      generateFromPredictions,
      selectSample: () => {},
      acceptSample: () => {},
      acceptAllDrafts: () => 0,
      rejectSample: () => {},
      unapproveSample: () => {},
      deleteSample: () => {},
      setSampleNote: () => {},
      updateSampleGeometry: () => {},
      clearAll: () => {},
      clearByStatus: () => {},
      saveApproved: () => false,
    }
    const { cleanupHost } = mountWithHost({ trainingSamples } as any)
    fireEvent.click(screen.getByRole('tab', { name: 'Training Samples' }))
    expect(screen.getByText(/Predicted → Draft → Accept → Save/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Generate Samples/i }))
    expect(generateFromPredictions).toHaveBeenCalled()
    cleanupHost()
  })

  it('enables Show Global Fields for FTW Global even without AOI geometry yet', () => {
    const onRun = vi.fn()
    const { cleanupHost } = mountWithHost({
      hasAoi: false,
      model: 'ftw',
      source: 'ftw',
      modelOptions: [{ id: 'ftw' as const, label: 'Fields of the World (Global v3)' }],
      phase: 'idle',
      hasResult: false,
      aoiMode: 'draw',
      onAoiModeChange: () => {},
      onRun,
      ftwYear: 2025,
      onFtwYearChange: () => {},
      ftwThreshold: 70,
      onFtwThresholdChange: () => {},
      ftwGlobalOpacity: 90,
      onFtwGlobalOpacityChange: () => {},
    })
    const btn = screen.getByRole('button', { name: /Show Global Fields/i })
    expect(btn.hasAttribute('disabled')).toBe(false)
    fireEvent.click(btn)
    expect(onRun).toHaveBeenCalled()
    cleanupHost()
  })

  it('places Select AOI directly under Model for Fields of the World and other engines', () => {
    const onAoiModeChange = vi.fn()
    const ftw = mountWithHost({
      hasAoi: false,
      model: 'ftw',
      source: 'ftw',
      modelOptions: [{ id: 'ftw' as const, label: 'Fields of the World (Global v3)' }],
      phase: 'idle',
      hasResult: false,
      aoiMode: 'select',
      onAoiModeChange,
      ftwYear: 2025,
      onFtwYearChange: () => {},
      ftwThreshold: 70,
      onFtwThresholdChange: () => {},
      ftwGlobalOpacity: 90,
      onFtwGlobalOpacityChange: () => {},
    })
    const ftwLabels = [...ftw.container.querySelectorAll('#si-afb-pane-detect > .si-afb__row .si-afb__label')]
      .map(el => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    expect(ftwLabels[0]).toMatch(/^Model/)
    expect(ftwLabels[1]).toBe('Select AOI')
    expect(screen.queryByLabelText('Minimum field area in square meters')).toBeNull()
    fireEvent.change(screen.getByLabelText('Select AOI source'), { target: { value: 'draw' } })
    expect(onAoiModeChange).toHaveBeenCalledWith('draw')
    ftw.cleanupHost()

    const agro = mountWithHost({
      model: 'ftw-inference-s2',
      source: 'ftw-inference-s2',
      modelOptions: [{ id: 'ftw-inference-s2' as const, label: 'AgroDetect S2' }],
      aoiMode: 'viewport',
      onAoiModeChange: () => {},
    })
    const agroLabels = [...agro.container.querySelectorAll('#si-afb-pane-detect > .si-afb__row .si-afb__label')]
      .map(el => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    expect(agroLabels[0]).toMatch(/^Model/)
    expect(agroLabels[1]).toBe('Select AOI')
    agro.cleanupHost()
  })

  it('keeps Optimal Learning Rate tab open for FTW Global when AOI exists without detect result', () => {
    const { cleanupHost } = mountWithHost({
      hasAoi: true,
      model: 'ftw',
      source: 'ftw',
      modelOptions: [
        { id: 'ftw' as const, label: 'Fields of the World (Global v3)' },
      ],
      phase: 'idle',
      hasResult: false,
      fieldCount: 0,
      activeAoi: {
        key: 'aoi-1',
        source: 'draw',
        geometry: resultGeojson,
      },
      aoiLabel: 'Test AOI',
    })
    const tab = screen.getByRole('tab', { name: 'Optimal Learning Rate Finder' })
    expect(tab.hasAttribute('disabled')).toBe(false)
    fireEvent.click(tab)
    expect(screen.getByLabelText(/FTW Dataset — Samples:/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Build Dataset' })).toBeTruthy()
    cleanupHost()
  })
})
