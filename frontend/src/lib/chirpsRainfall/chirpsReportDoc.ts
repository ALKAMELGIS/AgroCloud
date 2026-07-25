/**
 * Minimal DOCX-style HTML report for CHIRPS rainfall (opens in Word).
 * Professional maps with basemap/legend are available via GeoTIFF + map atlas in future iterations.
 */
import { downloadBlob } from '../hydroWatershed/geoTiffExport'
import type { ChirpsAnalytics, ChirpsSeriesPoint } from './chirpsIndices'

export function exportChirpsHtmlReport(input: {
  aoiName: string
  start: string
  end: string
  source: string
  points: ChirpsSeriesPoint[]
  analytics: ChirpsAnalytics
}): string {
  const rows = input.points
    .map(
      p =>
        `<tr><td>${p.date}</td><td>${p.rainfallMm == null ? '—' : p.rainfallMm.toFixed(2)}</td></tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>CHIRPS Rainfall Report — ${input.aoiName}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;margin:24px;color:#0f172a}
h1{color:#0c4a6e} table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #cbd5e1;padding:6px 8px;font-size:12px}
th{background:#e0f2fe;text-align:left}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}
.kpi div{background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:8px}
.note{font-size:12px;color:#64748b}
</style></head><body>
<h1>Precipitation / Rainfall Analysis</h1>
<p><b>Source:</b> ${input.source} (UCSB CHIRPS)</p>
<p><b>AOI:</b> ${input.aoiName} · <b>Period:</b> ${input.start} → ${input.end}</p>
<p class="note">P = Σ Rainfall(mm) · RAI = ((Current−Mean)/Mean)×100 · SPI = (P−Pmean)/Pstd · RTI = linear trend · RDI = season/historical · WAI = 0.5·Rain + 0.3·NDMI + 0.2·NDWI</p>
<div class="kpi">
<div><b>Total P</b><br/>${input.analytics.totalMm?.toFixed(1) ?? '—'} mm</div>
<div><b>RAI</b><br/>${input.analytics.rai?.toFixed(1) ?? '—'} %</div>
<div><b>SPI</b><br/>${input.analytics.spi?.toFixed(2) ?? '—'} (${input.analytics.spiLabel})</div>
<div><b>RTI</b><br/>${input.analytics.rti?.toFixed(3) ?? '—'} mm/step</div>
<div><b>RDI</b><br/>${input.analytics.rdi?.toFixed(2) ?? '—'}</div>
<div><b>WAI</b><br/>${input.analytics.wai?.toFixed(2) ?? '—'}</div>
</div>
<h2>Rainfall series</h2>
<table><thead><tr><th>Date</th><th>Rainfall (mm)</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">Open the companion *_rgb.tif GeoTIFF in ArcGIS Pro for the map (basemap + AOI + legend via project layout). Unit: mm.</p>
</body></html>`
  const filename = `chirps_rainfall_report_${input.start.replace(/-/g, '')}.doc`
  downloadBlob(new Blob([html], { type: 'application/msword' }), filename)
  return filename
}
