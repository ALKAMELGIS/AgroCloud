import {
  docxBodyParagraph,
  docxBulletList,
  docxItalicNote,
  docxMetaLine,
  docxSectionHeading,
  docxSubtitle,
  docxTable,
  docxTitle,
  wrapDocumentBody,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxXml'
import type { EoEnrichmentDocxModel } from './buildEoEnrichmentDocxModel'

function evenWidths(n: number, total = 10080): number[] {
  if (n <= 0) return []
  const w = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - w * (n - 1) : w))
}

export function buildEoEnrichmentDocxDocumentXml(model: EoEnrichmentDocxModel): string {
  const parts: string[] = []
  parts.push(docxTitle('EO LAYER ENRICHMENT'))
  parts.push(docxSubtitle('Professional Agricultural Intelligence Report'))
  parts.push(docxMetaLine([{ text: 'Prepared by ' }, { text: model.generatedBy }, { text: '  ·  ' }, { text: model.generatedStamp }]))
  parts.push(docxMetaLine([{ text: `Layer: ${model.layerName}  ·  ${model.featureCount} polygon(s)  ·  ${model.fieldCount} field(s)  ·  Scene ${model.acquisitionDate}` }]))
  parts.push(docxSectionHeading('1. Executive Summary'))
  parts.push(docxBodyParagraph(model.executiveSummary))
  parts.push(docxSectionHeading('2. Crop Type Distribution'))
  if (model.cropDistribution.length) {
    parts.push(docxTable(['Crop Type', 'Fields', 'Share'], model.cropDistribution.map(r => [r.crop, String(r.count), r.pct]), evenWidths(3)))
  } else {
    parts.push(docxItalicNote('No Crop Type field present on this layer schema.'))
  }
  parts.push(docxSectionHeading('3. Crop Health & Water Stress'))
  if (model.healthDistribution.length) {
    parts.push(docxTable(['Crop Health', 'Fields'], model.healthDistribution.map(r => [r.label, String(r.count)]), evenWidths(2)))
  }
  if (model.stressDistribution.length) {
    parts.push(docxTable(['Water Stress', 'Fields'], model.stressDistribution.map(r => [r.label, String(r.count)]), evenWidths(2)))
  }
  if (!model.healthDistribution.length && !model.stressDistribution.length) {
    parts.push(docxItalicNote('Health / stress columns were not part of the input layer schema.'))
  }
  parts.push(docxSectionHeading('4. Enriched Field Attributes'))
  parts.push(docxBodyParagraph('The following table shows values written into the existing layer attributes after enrichment from the latest Sentinel-2 scene and NDVI time-series planting/harvest detection.'))
  if (model.tableHeaders.length && model.tableRows.length) {
    parts.push(docxTable(model.tableHeaders, model.tableRows, evenWidths(model.tableHeaders.length)))
  } else {
    parts.push(docxItalicNote('No attribute rows available.'))
  }
  parts.push(docxItalicNote(model.dataNotes))
  parts.push(docxSectionHeading('5. Recommendations'))
  parts.push(docxBulletList(model.recommendations))
  parts.push(docxSectionHeading('6. Data & Methods'))
  parts.push(docxBodyParagraph('Source imagery: Sentinel-2 L2A via Sentinel Hub Statistical API and Planetary Computer STAC catalog. Only attributes already present on the input vector layer were populated. Crop type is a relative spectral estimate from latest-scene NDVI/NDMI/NDWI. Estimated planting and harvest dates follow the latest green-up and senescence signals in the field NDVI time series (with crop-cycle fallback when harvest is not yet observed).'))
  parts.push(docxItalicNote('AgroCloud Satellite Intelligence · Confidential · For professional agricultural monitoring use.'))
  return wrapDocumentBody(parts.join(''))
}