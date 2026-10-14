import {
  CHART_IMAGE_CX,
  CHART_IMAGE_CY,
  docxBodyParagraph,
  docxInlineChart,
  docxInlineImage,
  docxImageCaption,
  docxMetaLine,
  docxSectionHeading,
  docxTable,
  docxTitle,
  wrapDocumentBody,
} from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/timeSeriesDocxXml'
import type { CutFillDocxModel } from './cutFillDocxModel'
import {
  CUT_FILL_PROFILE_CHART_CX,
  CUT_FILL_PROFILE_CHART_CY,
  CUT_FILL_PROFILE_IMAGE_CX,
  CUT_FILL_PROFILE_IMAGE_CY,
  docxCutFillMapAtlas,
} from './cutFillDocxLayout'

const KPI_COLS = [3600, 6480]

export function buildCutFillDocxDocumentXml(model: CutFillDocxModel): string {
  const parts: string[] = []

  parts.push(docxTitle(model.title))
  parts.push(
    docxMetaLine([
      { text: model.aoiName },
      { text: `  ·  ${model.crsLabel}` },
      { text: `  ·  ${model.verticalDatum}` },
    ]),
  )
  parts.push(
    docxMetaLine([
      { text: `Prepared by ${model.generatedBy}` },
      { text: `  ·  Generated ${model.generatedStamp}` },
    ]),
  )

  parts.push(docxSectionHeading('Executive Summary'))
  parts.push(docxBodyParagraph(model.executiveNarrative))

  parts.push(docxSectionHeading('Earthwork KPIs'))
  parts.push(docxTable(['Metric', 'Value'], model.kpiRows, KPI_COLS))

  parts.push(docxSectionHeading('Volume Summary'))
  parts.push(docxTable(['Item', 'Value'], model.volumeRows, KPI_COLS))

  parts.push(docxSectionHeading('Statistical Charts'))
  for (const chart of model.nativeCharts.filter(c => c.fileStem !== 'cutfill-profile-line')) {
    parts.push(docxInlineChart(chart.rId, CHART_IMAGE_CX, CHART_IMAGE_CY, { center: true }))
  }

  const profileChart = model.nativeCharts.find(c => c.fileStem === 'cutfill-profile-line')
  if (profileChart) {
    parts.push(docxSectionHeading('Profile', false))
    parts.push(docxBodyParagraph('Existing vs design profile (longest section)'))
    parts.push(
      docxInlineChart(profileChart.rId, CUT_FILL_PROFILE_CHART_CX, CUT_FILL_PROFILE_CHART_CY, {
        center: true,
      }),
    )
  }

  parts.push(docxSectionHeading('Map Atlas'))
  parts.push(
    docxBodyParagraph(
      'Symbology matches the interactive Cut & Fill map layers (classification, ΔZ, existing, and design surfaces).',
    ),
  )
  parts.push(
    docxCutFillMapAtlas(
      model.mapImages.map(img => ({
        rId: img.rId,
        label: img.label,
        legendCaption: img.legendCaption,
      })),
    ),
  )

  if (model.profileImage) {
    parts.push(docxSectionHeading('Elevation Profile'))
    parts.push(docxBodyParagraph(model.profileImage.label))
    parts.push(docxInlineImage(model.profileImage.rId, CUT_FILL_PROFILE_IMAGE_CX, CUT_FILL_PROFILE_IMAGE_CY))
    parts.push(docxImageCaption([model.profileImage.label]))
  }

  parts.push(docxSectionHeading('Notes'))
  parts.push(
    docxBodyParagraph(
      'Volumes integrate cell areas over the AOI using the selected vertical tolerance. Export GeoTIFF, Shapefile, CSV, and PDF from the Cut & Fill Export step for CAD/GIS workflows.',
    ),
  )

  return wrapDocumentBody(parts.join(''))
}
