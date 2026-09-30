import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildWeatherClimateReportPayload } from './weatherClimateAnalysisEngine'
import { buildWeatherIntelligenceDocxModel } from './weatherIntelligenceDocxModel'
import { buildWeatherIntelligenceDocxDocumentXml } from './buildWeatherIntelligenceDocxDocument'
import {
  buildDocxChartXml,
  buildEmptyChartRelsXml,
} from '../../temporal-analysis/timeSeriesReport/timeSeriesDocxNativeCharts'

import templateUrl from '../../temporal-analysis/timeSeriesReport/templates/Agricultural_Satellite_Intelligence_Report.template.docx?url'

function makeHourly(days: number) {
  const pts = []
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2020, 0, 1 + i))
    const date = d.toISOString().slice(0, 10)
    for (let h = 0; h < 24; h += 6) {
      pts.push({
        time: `${date}T${String(h).padStart(2, '0')}:00`,
        temperatureC: 25 + Math.sin(i / 30) * 8,
        precipitationMm: i % 7 === 0 ? 2 : 0,
        humidityPct: 40 + (h / 6) * 10,
        windSpeedKmh: 15,
        shortwaveRadiationWm2: 200,
        et0Mm: 0.2,
        pressureHpa: 1013,
      })
    }
  }
  return pts
}

function buildDocumentRels(chartAssets: Array<{ rId: string; fileStem: string }>): string {
  const staticRels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>`,
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>`,
    `<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>`,
    `<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`,
    `<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
    `<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
  ]
  const chartRels = chartAssets.map(
    c =>
      `<Relationship Id="${c.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/${c.fileStem}.xml"/>`,
  )
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...staticRels, ...chartRels].join('')}</Relationships>`
}

describe('weatherClimateReportDocxPack', () => {
  it('packs a valid docx zip with matching chart relationships', async () => {
    const hourly = makeHourly(800)
    const payload = buildWeatherClimateReportPayload({
      aoiName: 'Buraydah Hail Saudi Arabia',
      aoiLocation: 'Buraydah, SA',
      lat: 26.3,
      lng: 43.9,
      timezone: 'Asia/Riyadh',
      analysisStart: '2020-01-01',
      analysisEnd: '2022-03-15',
      loadedStart: '2020-01-01',
      loadedEnd: '2022-03-15',
      hourlyRecords: hourly,
      timeAggregation: 'day',
    })

    const { model } = await buildWeatherIntelligenceDocxModel(payload)
    const docXml = buildWeatherIntelligenceDocxDocumentXml(model)
    const rIdsInDoc = [...docXml.matchAll(/r:id="(rIdChart\d+)"/g)].map(m => m[1])
    const chartRIds = model.nativeCharts.map(c => c.rId)
    expect(rIdsInDoc.sort()).toEqual(chartRIds.sort())

    for (const chart of model.nativeCharts) {
      const xml = buildDocxChartXml(chart)
      expect(xml).not.toMatch(/NaN|undefined/)
      expect(xml).toContain('<c:chartSpace')
    }

    const templateResponse = await fetch(templateUrl)
    const templateBuffer = await templateResponse.arrayBuffer()
    const zip = await JSZip.loadAsync(templateBuffer)
    zip.file('word/document.xml', docXml)
    zip.file(
      'word/_rels/document.xml.rels',
      buildDocumentRels(model.nativeCharts.map(c => ({ rId: c.rId, fileStem: c.fileStem }))),
    )
    for (const chart of model.nativeCharts) {
      zip.file(`word/charts/${chart.fileStem}.xml`, buildDocxChartXml(chart))
      zip.file(`word/charts/_rels/${chart.fileStem}.xml.rels`, buildEmptyChartRelsXml())
    }

    const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const outPath = path.join(os.tmpdir(), 'tmp-weather-debug.docx')
    fs.writeFileSync(outPath, outBuf)

    const roundTrip = await JSZip.loadAsync(outBuf)
    for (const chart of model.nativeCharts) {
      const part = roundTrip.file(`word/charts/${chart.fileStem}.xml`)
      expect(part).toBeTruthy()
    }
    expect(roundTrip.file('word/document.xml')).toBeTruthy()
  })
})
