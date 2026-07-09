import JSZip from 'jszip'
import { buildTimeSeriesDocxDocumentXml } from './buildTimeSeriesDocxDocument'
import { base64ToUint8, buildTimeSeriesDocxModel } from './timeSeriesReportDocxModel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

import templateUrl from './templates/Agricultural_Satellite_Intelligence_Report.template.docx?url'

const HEADER_REL_ID = 'rIdHdr'
const FOOTER_REL_ID = 'rIdFtr'

function patchHeaderFooterXml(xml: string, generatedBy: string, generatedStamp: string): string {
  let out = xml
  out = out.replace(/MOHAMED ALKAMEL/g, generatedBy)
  out = out.replace(/Generated \d{4}-\d{2}-\d{2}/g, `Generated ${generatedStamp.slice(0, 10)}`)
  return out
}

function buildDocumentRels(imageAssets: Array<{ rId: string; fileName: string }>): string {
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
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...staticRels, ...imageRels].join('')}</Relationships>`
}

function patchDocumentXmlHeaderFooterRefs(xml: string): string {
  return xml.replace(/rIdHdr/g, HEADER_REL_ID).replace(/rIdFtr/g, FOOTER_REL_ID)
}

export async function generateTimeSeriesReportDocx(payload: TimeSeriesReportPayload): Promise<void> {
  const templateResponse = await fetch(templateUrl)
  if (!templateResponse.ok) throw new Error('Failed to load Word report template')
  const templateBuffer = await templateResponse.arrayBuffer()

  const { model, images } = await buildTimeSeriesDocxModel(payload)
  const zip = await JSZip.loadAsync(templateBuffer)

  const documentXml = patchDocumentXmlHeaderFooterRefs(buildTimeSeriesDocxDocumentXml(model))
  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', buildDocumentRels(images))

  const existingMedia = Object.keys(zip.files).filter(p => p.startsWith('word/media/'))
  for (const path of existingMedia) {
    zip.remove(path)
  }
  for (const img of images) {
    zip.file(`word/media/${img.fileName}`, base64ToUint8(img.base64), { binary: true })
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
    coreXml = coreXml.replace(/<dc:title>.*?<\/dc:title>/, `<dc:title>Agricultural Satellite Intelligence Report</dc:title>`)
    zip.file('docProps/core.xml', coreXml)
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Agricultural_Satellite_Intelligence_Report.docx'
  a.click()
  URL.revokeObjectURL(url)
}
