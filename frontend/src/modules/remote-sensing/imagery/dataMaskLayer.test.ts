import { describe, expect, it, vi } from 'vitest'
import {
  buildDataMaskLayerEvalscript,
  DATAMASK_LAYER_ID,
  isDataMaskLayerId,
  logDataMaskLayerAvailability,
} from './dataMaskLayer'

describe('dataMaskLayer', () => {
  it('recognizes DATAMASK layer ids', () => {
    expect(isDataMaskLayerId('DATAMASK')).toBe(true)
    expect(isDataMaskLayerId('DataMask')).toBe(true)
    expect(isDataMaskLayerId('data_mask')).toBe(true)
    expect(isDataMaskLayerId('NDVI')).toBe(false)
  })

  it('builds a paint-ready evalscript with B04 + dataMask and UINT8 output', () => {
    const script = buildDataMaskLayerEvalscript()
    expect(script).toContain('"dataMask"')
    expect(script).toContain('"B04"')
    expect(script).toContain('output: { bands: 4')
    expect(script).toContain('s.dataMask')
    expect(script).toContain('UINT8')
    expect(script).toContain('return [40, 220, 90, 255]')
    expect(script).toContain('return [180, 40, 40, 255]')
    expect(script).not.toContain('return [0, 0, 0, 0]')
  })

  it('logs capability presence vs Layer Index registration', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    logDataMaskLayerAvailability({
      capabilityLayers: [{ name: '3_NDVI', title: 'NDVI' }],
      registeredInIndex: true,
    })
    expect(info).toHaveBeenCalled()
    const payload = info.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload.sourceBandInEvalscripts).toBe(true)
    expect(payload.capabilityNamedWmsLayer).toBe(false)
    expect(payload.registeredInIndex).toBe(true)
    expect(DATAMASK_LAYER_ID).toBe('DATAMASK')
    info.mockRestore()
  })
})
