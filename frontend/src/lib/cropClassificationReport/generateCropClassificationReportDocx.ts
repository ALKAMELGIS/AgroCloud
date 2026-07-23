import JSZip from 'jszip'
import { buildCropClassificationReportPayload } from './buildCropClassificationReportPayload'
import { buildCropClassificationDocxDocumentXml } from './buildCropClassificationDocxDocument'
import {
  base64ToUint8,
  buildCropClassificationDocxModel,
} from './cropClassificationReportDocxModel'
import {
  buildDocxChartXml,
  buildEmptyChartRelsXml,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxNativeCharts'
import type { BuildCropClassificationReportInput } from './cropClassificationReportTypes'

import templateUrl from '../../pages/satellite/lib/timeSeriesReport/templates/Agricultural_Satellite_Intelligence_Report.template.docx?url'

const HEADER_REL_ID = 'rIdHdr'
const FOOTER_REL_ID = 'rIdFtr'

function patchHeaderFooterXml(xml: string, generatedBy: string, generatedStamp: string): string {
  let out = xml
  out = out.replace(/MOHAMED ALKAMEL/g, generatedBy)
  out = out.replace(/Generated \d{4}-\d{2}-\d{2}/g, `Generated ${generatedStamp.slice(0, 10)}`)
  return out
}

function buildDocumentRels(
  imageAssets: Array<{ rId: string; fileName: string }>,
  chartAssets: Array<{ rId: string; fileStem: string }>,
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
  const imageRels = imageAssets.map(
    img =>
      `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`,
  )
  const chartRels = chartAssets.map(
    c =>
      `<Relationship Id="${c.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/${c.fileStem}.xml"/>`,
  )
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...staticRels, ...imageRels, ...chartRels].join('')}</Relationships>`
}

function ensureUpdateFieldsOnOpen(settingsXml: string): string {
  if (settingsXml.includes('<w:updateFields')) {
    return settingsXml.replace(/<w:updateFields[^/]*\/>/, '<w:updateFields w:val="true"/>')
  }
  return settingsXml.replace(/<w:settings([^>]*)>/, '<w:settings$1><w:updateFields w:val="true"/>')
}

function brandHeadingStyles(stylesXml: string): string {
  let out = stylesXml
  out = out.replace(
    /(<w:style w:type="paragraph" w:styleId="Heading1">[\s\S]*?<w:rPr>)[\s\S]*?(<\/w:rPr>)/,
    `$1<w:b/><w:bCs/><w:color w:val="1F4D2C"/><w:sz w:val="24"/><w:szCs w:val="24"/>$2`,
  )
  out = out.replace(
    /(<w:style w:type="paragraph" w:styleId="Heading2">[\s\S]*?<w:rPr>)[\s\S]*?(<\/w:rPr>)/,
    `$1<w:b/><w:bCs/><w:color w:val="3F7D4F"/><w:sz w:val="22"/><w:szCs w:val="22"/>$2`,
  )
  return out
}

function ensureContentTypes(xml: string, chartStems: string[]): string {
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
  return out
}

export async function generateCropClassificationReportDocx(
  input: BuildCropClassificationReportInput,
): Promise<void> {
  const payload = await buildCropClassificationReportPayload(input)
  const { model, images } = buildCropClassificationDocxModel(payload)

  const templateResponse = await fetch(templateUrl)
  if (!templateResponse.ok) throw new Error('Failed to load Word report template')
  const templateBuffer = await templateResponse.arrayBuffer()
  const zip = await JSZip.loadAsync(templateBuffer)

  zip.file('word/document.xml', buildCropClassificationDocxDocumentXml(model))
  zip.file(
    'word/_rels/document.xml.rels',
    buildDocumentRels(
      images,
      model.nativeCharts.map(c => ({ rId: c.rId, fileStem: c.fileStem })),
    ),
  )

  const existingMedia = Object.keys(zip.files).filter(p => p.startsWith('word/media/'))
  for (const path of existingMedia) zip.remove(path)
  for (const img of images) {
    zip.file(`word/media/${img.fileName}`, base64ToUint8(img.base64), { binary: true })
  }

  const existingCharts = Object.keys(zip.files).filter(p => p.startsWith('word/charts/'))
  for (const path of existingCharts) zip.remove(path)
  for (const chart of model.nativeCharts) {
    zip.file(`word/charts/${chart.fileStem}.xml`, buildDocxChartXml(chart))
    zip.file(`word/charts/_rels/${chart.fileStem}.xml.rels`, buildEmptyChartRelsXml())
  }

  const ctFile = zip.file('[Content_Types].xml')
  if (ctFile) {
    const ctXml = await ctFile.async('string')
    zip.file(
      '[Content_Types].xml',
      ensureContentTypes(
        ctXml,
        model.nativeCharts.map(c => c.fileStem),
      ),
    )
  }

  const settingsFile = zip.file('word/settings.xml')
  if (settingsFile) {
    const settingsXml = await settingsFile.async('string')
    zip.file('word/settings.xml', ensureUpdateFieldsOnOpen(settingsXml))
  }

  const stylesFile = zip.file('word/styles.xml')
  if (stylesFile) {
    const stylesXml = await stylesFile.async('string')
    zip.file('word/styles.xml', brandHeadingStyles(stylesXml))
  }

  const headerFile = zip.file('word/header1.xml')
  if (headerFile) {
    const headerXml = await headerFile.async('string')
    zip.file(
      'word/header1.xml',
      patchHeaderFooterXml(headerXml, model.generatedBy, model.generatedStamp),
    )
  }
  const footerFile = zip.file('word/footer1.xml')
  if (footerFile) {
    const footerXml = await footerFile.async('string')
    zip.file(
      'word/footer1.xml',
      patchHeaderFooterXml(footerXml, model.generatedBy, model.generatedStamp),
    )
  }

  const coreFile = zip.file('docProps/core.xml')
  if (coreFile) {
    let coreXml = await coreFile.async('string')
    coreXml = coreXml.replace(
      /<dc:creator>.*?<\/dc:creator>/,
      `<dc:creator>${model.generatedBy}</dc:creator>`,
    )
    coreXml = coreXml.replace(
      /<dc:title>.*?<\/dc:title>/,
      `<dc:title>Crop Classification Intelligence Report</dc:title>`,
    )
    zip.file('docProps/core.xml', coreXml)
  }

  const safeName = input.aoiName.replace(/[^\w.-]+/g, '_').slice(0, 40)
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Crop_Classification_Intelligence_Report_${safeName || 'AOI'}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
