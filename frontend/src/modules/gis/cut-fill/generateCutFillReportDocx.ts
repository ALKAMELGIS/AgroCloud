import JSZip from 'jszip'
import { loadTimeSeriesReportDocxTemplate } from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/loadTimeSeriesReportDocxTemplate'
import {
  buildDocxChartXml,
  buildEmptyChartRelsXml,
} from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/timeSeriesDocxNativeCharts'
import { buildCutFillDocxDocumentXml } from './buildCutFillDocxDocument'
import { buildCutFillDocxModel } from './cutFillDocxModel'
import type { CutFillAnalysisResult } from './cutFillTypes'

const HEADER_REL_ID = 'rIdHdr'
const FOOTER_REL_ID = 'rIdFtr'

function patchHeaderFooterXml(xml: string, generatedBy: string, generatedStamp: string): string {
  let out = xml
  out = out.replace(/MOHAMED ALKAMEL/g, generatedBy)
  out = out.replace(/Generated \d{4}-\d{2}-\d{2}/g, `Generated ${generatedStamp.slice(0, 10)}`)
  return out
}

function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function buildDocumentRels(
  charts: Array<{ rId: string; fileStem: string }>,
  images: Array<{ rId: string; fileName: string }>,
): string {
  const staticRels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>`,
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>`,
    `<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>`,
    `<Relationship Id="${HEADER_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`,
    `<Relationship Id="${FOOTER_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
    `<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
  ]
  const chartRels = charts.map(
    c =>
      `<Relationship Id="${c.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/${c.fileStem}.xml"/>`,
  )
  const imageRels = images.map(
    img =>
      `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`,
  )
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...staticRels, ...chartRels, ...imageRels].join('')}</Relationships>`
}

function patchDocumentXmlHeaderFooterRefs(xml: string): string {
  return xml.replace(/rIdHdr/g, HEADER_REL_ID).replace(/rIdFtr/g, FOOTER_REL_ID)
}

function ensureContentTypes(xml: string, chartStems: string[], pngFiles: string[]): string {
  let out = xml
  for (const stem of chartStems) {
    const part = `/word/charts/${stem}.xml`
    if (!out.includes(part)) {
      out = out.replace(
        '</Types>',
        `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`,
      )
    }
  }
  for (const file of pngFiles) {
    const part = `/word/media/${file}`
    if (!out.includes(part)) {
      out = out.replace(
        '</Types>',
        `<Override PartName="${part}" ContentType="image/png"/></Types>`,
      )
    }
  }
  return out
}

export async function generateCutFillReportDocx(
  result: CutFillAnalysisResult,
  aoiMask: Uint8Array | null,
  opts?: { aoiName?: string },
): Promise<void> {
  const model = await buildCutFillDocxModel(result, aoiMask, opts)
  const templateBuffer = await loadTimeSeriesReportDocxTemplate()
  const zip = await JSZip.loadAsync(templateBuffer)

  zip.file(
    'word/document.xml',
    patchDocumentXmlHeaderFooterRefs(buildCutFillDocxDocumentXml(model)),
  )

  const images = [...model.mapImages, ...(model.profileImage ? [model.profileImage] : [])]
  zip.file(
    'word/_rels/document.xml.rels',
    buildDocumentRels(
      model.nativeCharts.map(c => ({ rId: c.rId, fileStem: c.fileStem })),
      images.map(img => ({ rId: img.rId, fileName: img.fileName })),
    ),
  )

  for (const path of Object.keys(zip.files).filter(p => p.startsWith('word/charts/'))) {
    zip.remove(path)
  }
  for (const chart of model.nativeCharts) {
    zip.file(`word/charts/${chart.fileStem}.xml`, buildDocxChartXml(chart))
    zip.file(`word/charts/_rels/${chart.fileStem}.xml.rels`, buildEmptyChartRelsXml())
  }

  for (const path of Object.keys(zip.files).filter(p => p.startsWith('word/media/'))) {
    zip.remove(path)
  }
  for (const img of images) {
    zip.file(`word/media/${img.fileName}`, base64ToUint8(img.base64), { binary: true })
  }

  const ctFile = zip.file('[Content_Types].xml')
  if (ctFile) {
    const ctXml = await ctFile.async('string')
    zip.file(
      '[Content_Types].xml',
      ensureContentTypes(
        ctXml,
        model.nativeCharts.map(c => c.fileStem),
        images.map(i => i.fileName),
      ),
    )
  }

  const headerFile = zip.file('word/header1.xml')
  if (headerFile) {
    const headerXml = await headerFile.async('string')
    zip.file('word/header1.xml', patchHeaderFooterXml(headerXml, model.generatedBy, model.generatedStamp))
  }
  const footerFile = zip.file('word/footer1.xml')
  if (footerFile) {
    const footerXml = await footerFile.async('string')
    zip.file('word/footer1.xml', patchHeaderFooterXml(footerXml, model.generatedBy, model.generatedStamp))
  }

  const coreFile = zip.file('docProps/core.xml')
  if (coreFile) {
    let coreXml = await coreFile.async('string')
    coreXml = coreXml.replace(/<dc:creator>.*?<\/dc:creator>/, `<dc:creator>${model.generatedBy}</dc:creator>`)
    coreXml = coreXml.replace(
      /<dc:title>.*?<\/dc:title>/,
      `<dc:title>Cut &amp; Fill Engineering Report</dc:title>`,
    )
    zip.file('docProps/core.xml', coreXml)
  }

  const safeAoi = model.aoiName.replace(/[^\w.-]+/g, '_').slice(0, 36)
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Cut_Fill_Report_${safeAoi}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
