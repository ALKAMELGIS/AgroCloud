import { describe, expect, it } from 'vitest'
import {
  buildAcpMapViewPublishSignature,
  quantizeAcpMapViewBbox,
} from './map/acpMapViewPublish'

describe('acpMapViewPublish', () => {
  it('quantizes bbox to reduce publish churn', () => {
    const a: [number, number, number, number] = [54.512, 23.508, 55.518, 24.512]
    const b: [number, number, number, number] = [54.513, 23.509, 55.519, 24.513]
    expect(quantizeAcpMapViewBbox(a)).toEqual(quantizeAcpMapViewBbox(b))
  })

  it('buildAcpMapViewPublishSignature ignores minor pan within tile', () => {
    const bbox: [number, number, number, number] = [54.51, 23.51, 55.51, 24.51]
    const sigA = buildAcpMapViewPublishSignature(bbox, 12.02)
    const sigB = buildAcpMapViewPublishSignature(
      [54.515, 23.515, 55.515, 24.515],
      12.04,
    )
    expect(sigA).toBe(sigB)
  })
})
