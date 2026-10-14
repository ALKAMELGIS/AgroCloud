import { readCurrentUser } from '@/core/auth/auth'
import { buildCutFillProfile, type CutFillProfile } from './cutFillProfile'
import { buildReportMapFigures } from './cutFillReportMapRender'
import { renderCutFillProfilePngBase64 } from './cutFillReportProfilePng'
import { cutFillReportVolumes, formatCutFillReportStamp } from './cutFillExports'
import type { CutFillAnalysisResult } from './cutFillTypes'
import type { DocxNativeChartSpec } from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/timeSeriesDocxNativeCharts'

export type CutFillDocxImage = {
  rId: string
  fileName: string
  base64: string
  label: string
  legendCaption: string
}

export type CutFillDocxModel = {
  title: string
  aoiName: string
  generatedBy: string
  generatedStamp: string
  crsLabel: string
  verticalDatum: string
  executiveNarrative: string
  kpiRows: Array<[string, string]>
  volumeRows: Array<[string, string]>
  mapImages: CutFillDocxImage[]
  profileImage: CutFillDocxImage | null
  nativeCharts: DocxNativeChartSpec[]
}

function ha(m2: number): string {
  return (m2 / 10_000).toFixed(2)
}

function vol(m3: number): string {
  return Number.isFinite(m3) ? Math.round(m3).toLocaleString('en-US') : '—'
}

function subsampleProfile(profile: CutFillProfile, maxPoints = 28): CutFillProfile['samples'] {
  const samples = profile.samples
  if (samples.length <= maxPoints) return samples
  const step = Math.ceil(samples.length / maxPoints)
  const out = samples.filter((_, i) => i % step === 0)
  const last = samples[samples.length - 1]
  if (last && out[out.length - 1] !== last) out.push(last)
  return out
}

function profileLineChart(profile: CutFillProfile): DocxNativeChartSpec | null {
  const samples = subsampleProfile(profile)
  if (samples.length < 2) return null
  return {
    rId: 'rIdCfChartProfile',
    fileStem: 'cutfill-profile-line',
    title: 'Existing vs Design Elevation',
    yAxisLabel: 'Elevation (m)',
    xAxisLabel: 'Distance (m)',
    categories: samples.map(s => s.distanceM.toFixed(0)),
    series: [
      { name: 'Existing', values: samples.map(s => s.existingZ), color: '57534E' },
      { name: 'Design', values: samples.map(s => s.designZ), color: '2563EB' },
    ],
    kind: 'line',
  }
}

export async function buildCutFillDocxModel(
  result: CutFillAnalysisResult,
  aoiMask: Uint8Array | null,
  opts?: { aoiName?: string },
): Promise<CutFillDocxModel> {
  const s = result.summary
  const p = result.parameters
  const volumes = cutFillReportVolumes(s)
  const generatedStamp = formatCutFillReportStamp(new Date())
  const generatedBy = readCurrentUser()?.name?.trim() || 'AgroCloud User'
  const aoiName = opts?.aoiName?.trim() || 'Study AOI'
  const net = s.netVolumeM3
  const balance =
    !Number.isFinite(net) || Math.abs(net) < 0.5
      ? 'balanced'
      : net > 0
        ? 'earthwork surplus (cut exceeds fill)'
        : 'material import required (fill exceeds cut)'

  const executiveNarrative = [
    `This Cut & Fill Assessment quantifies earthwork between the existing ground surface and the design grade across ${aoiName}.`,
    `The analysis reports ${ha(s.cutAreaM2)} ha of cut, ${ha(s.fillAreaM2)} ha of fill, and ${ha(s.noChangeAreaM2)} ha within the ${p.verticalToleranceM} m vertical tolerance.`,
    `Total cut volume is ${vol(s.cutVolumeM3)} m³ and fill volume is ${vol(s.fillVolumeM3)} m³ (${balance}).`,
    `Maximum cut depth is ${s.maxCutM.toFixed(2)} m and maximum fill rise is ${s.maxFillM.toFixed(2)} m (average |ΔZ| ${s.avgAbsDiffM.toFixed(2)} m).`,
    `Coordinates: ${p.crsLabel}. Vertical datum: ${p.verticalDatumLabel}.`,
  ].join(' ')

  const reportMaps = await buildReportMapFigures(result, aoiMask)
  const mapImages: CutFillDocxImage[] = reportMaps.map((m, i) => ({
    rId: `rIdCfImg${i + 1}`,
    fileName: `cutfill-map-${i + 1}.png`,
    base64: m.base64,
    label: m.label,
    legendCaption: m.legendCaption,
  }))

  const profile = buildCutFillProfile(result.dem, result.existingElev, result.designElev, result.difference)
  let profileImage: CutFillDocxModel['profileImage'] = null
  if (profile) {
    const base64 = renderCutFillProfilePngBase64(profile)
    if (base64) {
      profileImage = {
        rId: 'rIdCfProfile',
        fileName: 'cutfill-profile.png',
        base64,
        label: 'Existing vs design profile (longest section)',
        legendCaption: '',
      }
    }
  }

  const nativeCharts: DocxNativeChartSpec[] = [
    {
      rId: 'rIdCfChartVol',
      fileStem: 'cutfill-volumes',
      title: 'Earthwork volumes',
      yAxisLabel: 'Volume (m³)',
      categories: ['Cut', 'Fill'],
      series: [{ name: 'Volume', values: [s.cutVolumeM3, s.fillVolumeM3], color: 'DC2626' }],
      kind: 'bar',
      hideLegend: true,
    },
    {
      rId: 'rIdCfChartArea',
      fileStem: 'cutfill-areas',
      title: 'Classified areas',
      yAxisLabel: 'Area (ha)',
      categories: ['Cut', 'Fill', 'No change'],
      series: [
        {
          name: 'Area',
          values: [s.cutAreaM2 / 10_000, s.fillAreaM2 / 10_000, s.noChangeAreaM2 / 10_000],
          color: '2563EB',
        },
      ],
      kind: 'bar',
      hideLegend: true,
    },
  ]
  const profileChart = profile ? profileLineChart(profile) : null
  if (profileChart) nativeCharts.push(profileChart)

  return {
    title: 'Cut & Fill Engineering Report',
    aoiName,
    generatedBy,
    generatedStamp,
    crsLabel: p.crsLabel,
    verticalDatum: p.verticalDatumLabel,
    executiveNarrative,
    kpiRows: [
      ['Cut area', `${ha(s.cutAreaM2)} ha`],
      ['Fill area', `${ha(s.fillAreaM2)} ha`],
      ['No-change area', `${ha(s.noChangeAreaM2)} ha`],
      ['Cut volume', `${vol(s.cutVolumeM3)} m³`],
      ['Fill volume', `${vol(s.fillVolumeM3)} m³`],
      ['Net volume', `${net > 0 ? '+' : ''}${vol(net)} m³`],
      ['Max cut depth', `${s.maxCutM.toFixed(2)} m`],
      ['Max fill depth', `${s.maxFillM.toFixed(2)} m`],
      ['Avg |ΔZ|', `${s.avgAbsDiffM.toFixed(2)} m`],
      ['Vertical tolerance', `${p.verticalToleranceM} m`],
      ['Contour interval', `${p.contourIntervalM} m`],
    ],
    volumeRows: [
      ['2D area (m²)', volumes.areaSqM.toFixed(2)],
      ['Cut (m³)', volumes.cutCuM.toFixed(2)],
      ['Fill (m³)', volumes.fillCuM.toFixed(2)],
      ['Net (m³)', volumes.netLabel],
      ['Cut factor', volumes.cutFactorLabel],
      ['Fill factor', volumes.fillFactorLabel],
    ],
    mapImages,
    profileImage,
    nativeCharts,
  }
}
