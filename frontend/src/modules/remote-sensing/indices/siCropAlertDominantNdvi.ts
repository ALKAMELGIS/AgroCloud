/**
 * NDVI histogram — Sentinel Hub Statistical API evalscript + dominant-class analysis.
 * Aligns histogram bins with unified NDVI alert zones (siCropAlertNdviZones).
 */

import { NDVI_ALERT_ZONES, type NdviAlertZoneId } from './siCropAlertNdviZones'

export type NdviHistogramBin = {
  lowEdge: number
  highEdge: number
  count: number
}

export type NdviClassDistributionEntry = {
  zoneId: NdviAlertZoneId
  label: string
  count: number
  areaPct: number
}

export type DominantNdviSummary = {
  dominantNdvi: number
  dominantLevel: NdviAlertZoneId
  dominantAreaPct: number
  ndviClassDistribution: NdviClassDistributionEntry[]
}

/** NDVI-only evalscript for Statistical API histogram requests. */
export const CROP_ALERT_NDVI_HISTOGRAM_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "SCL", "dataMask"]
    }],
    output: [
      {
        id: "ndvi",
        bands: ["ndvi"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  var d = samples.B08 + samples.B04;
  var ndvi = d > 1e-6 ? (samples.B08 - samples.B04) / d : NaN;
  var valid = samples.dataMask && !cloud && !isNaN(ndvi);
  return {
    ndvi: [ndvi],
    dataMask: [valid ? 1 : 0]
  };
}`

const NDVI_HISTOGRAM_BIN_EDGES = [-1, -0.2, 0, 0.05, 0.25, 0.4, 0.6, 0.75, 1]

/** Statistical API calculations block for NDVI histogram + mean. */
export function buildNdviHistogramCalculations(): Record<string, unknown> {
  return {
    ndvi: {
      histograms: {
        ndvi: {
          bins: NDVI_HISTOGRAM_BIN_EDGES,
        },
      },
      statistics: {
        ndvi: {},
      },
    },
  }
}

function zoneIdForNdviMidpoint(mid: number): NdviAlertZoneId {
  if (mid < 0.05) return 'bare'
  if (mid < 0.25) return 'stress'
  if (mid < 0.4) return 'watch'
  if (mid < 0.6) return 'healthy'
  if (mid < 0.75) return 'growth'
  return 'harvest-ready'
}

/** Map Statistical API histogram bins to unified NDVI zone distribution. */
export function summarizeNdviHistogram(
  bins: NdviHistogramBin[],
  options?: { overflow?: number; underflow?: number; mean?: number | null },
): DominantNdviSummary {
  const zoneCounts = new Map<NdviAlertZoneId, number>()
  for (const zone of NDVI_ALERT_ZONES) zoneCounts.set(zone.id, 0)

  let total = 0
  for (const bin of bins) {
    const count = Number.isFinite(bin.count) ? Math.max(0, bin.count) : 0
    if (count <= 0) continue
    const mid = (bin.lowEdge + bin.highEdge) / 2
    const zoneId = zoneIdForNdviMidpoint(mid)
    zoneCounts.set(zoneId, (zoneCounts.get(zoneId) ?? 0) + count)
    total += count
  }

  const overflow = Math.max(0, options?.overflow ?? 0)
  const underflow = Math.max(0, options?.underflow ?? 0)
  total += overflow + underflow
  if (underflow > 0) zoneCounts.set('bare', (zoneCounts.get('bare') ?? 0) + underflow)
  if (overflow > 0) {
    zoneCounts.set('harvest-ready', (zoneCounts.get('harvest-ready') ?? 0) + overflow)
  }

  const ndviClassDistribution: NdviClassDistributionEntry[] = NDVI_ALERT_ZONES.map(zone => {
    const count = zoneCounts.get(zone.id) ?? 0
    return {
      zoneId: zone.id,
      label: zone.label,
      count,
      areaPct: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }
  })

  let dominantLevel: NdviAlertZoneId = 'healthy'
  let dominantCount = -1
  for (const entry of ndviClassDistribution) {
    if (entry.count > dominantCount) {
      dominantCount = entry.count
      dominantLevel = entry.zoneId
    }
  }

  const dominantZone = NDVI_ALERT_ZONES.find(z => z.id === dominantLevel) ?? NDVI_ALERT_ZONES[3]!
  const dominantAreaPct =
    ndviClassDistribution.find(d => d.zoneId === dominantLevel)?.areaPct ?? 0
  const dominantNdvi =
    typeof options?.mean === 'number' && Number.isFinite(options.mean)
      ? options.mean
      : (dominantZone.min + Math.min(dominantZone.max, 1)) / 2

  return {
    dominantNdvi: Number(dominantNdvi.toFixed(4)),
    dominantLevel,
    dominantAreaPct,
    ndviClassDistribution,
  }
}
