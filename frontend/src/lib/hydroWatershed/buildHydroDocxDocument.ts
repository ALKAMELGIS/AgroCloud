import {
  docxBodyParagraph,
  docxBulletList,
  docxInlineImage,
  docxItalicNote,
  docxMetaLine,
  docxSectionHeading,
  docxSubtitle,
  docxTable,
  docxTitle,
  wrapDocumentBody,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxXml'
import type { HydroDocxModel } from './hydroReportDocxModel'

const HYDRO_MAP_CX = 5200380
const HYDRO_MAP_CY = 3463620

function keyValueTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<w:tr><w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(k)}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="6100" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(v)}</w:t></w:r></w:p></w:tc></w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="6100"/></w:tblGrid>${body}</w:tbl>`
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildHydroDocxDocumentXml(model: HydroDocxModel): string {
  const parts: string[] = []

  parts.push(docxTitle('HYDRO WATERSHED & FLOOD RISK'))
  parts.push(docxSubtitle('Professional Assessment Report'))
  parts.push(
    docxMetaLine([
      { text: 'Prepared by ' },
      { text: model.generatedBy },
      { text: `  ·  ${model.projectName}` },
      { text: `  ·  ${model.analysisDate}` },
    ]),
  )
  parts.push(docxMetaLine([{ text: `AOI: ${model.aoiName}  ·  ${model.areaHa}  ·  ${model.centroidLabel}` }]))

  parts.push(docxSectionHeading('Table of Contents'))
  parts.push(
    docxBulletList([
      'Executive Summary',
      'Project Information',
      'Snapshot Maps — GIS Map Atlas',
      'Hydro DEM Analysis',
      'Terrain Analysis',
      'Hydrological Analysis',
      'Watershed Delineation',
      'Drainage Basins',
      'Flood Risk Assessment',
      'Wetland Analysis',
      'GIS Data Tables',
      'Conclusions & Recommendations',
    ]),
  )

  parts.push(docxSectionHeading('Executive Summary'))
  parts.push(docxBodyParagraph(model.executiveNarrative))
  parts.push(docxSectionHeading('Terrain Summary'))
  parts.push(docxBodyParagraph(model.terrainSummary))
  parts.push(docxSectionHeading('Hydrological Summary'))
  parts.push(docxBodyParagraph(model.hydrologicalSummary))
  parts.push(docxSectionHeading('Flood Risk Summary'))
  parts.push(docxBodyParagraph(model.floodRiskSummary))
  parts.push(docxSectionHeading('Wetland Summary'))
  parts.push(docxBodyParagraph(model.wetlandSummary))
  parts.push(docxSectionHeading('Assessment Conclusion'))
  parts.push(docxBodyParagraph(model.conclusion))

  parts.push(docxSectionHeading('Project Information'))
  parts.push(
    keyValueTable([
      ['AOI Name', model.aoiName],
      ['Study Area', model.areaHa],
      ['Centroid', model.centroidLabel],
      ['Coordinate Reference System', model.crs],
      ['Analysis Date', model.analysisDate],
      ['DEM Source', model.demSource],
      ['DEM Resolution', model.demResolution],
      ['Completed Workflow Steps', model.completedStepsLabel],
    ]),
  )

  parts.push(docxSectionHeading('Snapshot Maps — GIS Map Atlas'))
  parts.push(
    docxItalicNote(
      'High-resolution GIS snapshots with satellite basemap, AOI boundary, legend, north arrow, scale bar, and coordinate reference. Generated from cached Hydro Watershed Workflow outputs.',
    ),
  )

  for (const snap of model.snapshotBlocks) {
    parts.push(docxSectionHeading(snap.title))
    if (snap.rId) {
      parts.push(docxInlineImage(snap.rId, HYDRO_MAP_CX, HYDRO_MAP_CY))
    } else {
      parts.push(docxItalicNote(snap.note ?? 'Map not available — run the required analysis steps first.'))
    }
    if (snap.stats) parts.push(docxItalicNote(snap.stats))
    if (snap.legend) parts.push(docxItalicNote(`Legend: ${snap.legend}`))
  }

  parts.push(docxSectionHeading('Hydro DEM Analysis'))
  parts.push(docxBodyParagraph(model.terrainSummary))

  parts.push(docxSectionHeading('Terrain Analysis'))
  parts.push(docxBodyParagraph('Slope and aspect characterise surface steepness and orientation governing runoff velocity and erosion risk.'))

  parts.push(docxSectionHeading('Hydrological Analysis'))
  parts.push(docxBodyParagraph(model.hydrologicalSummary))

  parts.push(docxSectionHeading('Watershed Delineation'))
  parts.push(
    docxBodyParagraph(
      'Primary watershed basins are delineated from D8 terminal outlets, ranked by area, and rendered with coordinated colours on the map layer and legend (matching the interactive Hydro Watershed map).',
    ),
  )

  parts.push(docxSectionHeading('Drainage Basins'))
  parts.push(
    docxBodyParagraph(
      'The Drainage Basins Map colours every primary drainage basin with a coordinated palette. Basin boundaries are emphasised on the layer; the report legend lists each Drainage Basin with its area (km²).',
    ),
  )

  parts.push(docxSectionHeading('Flood Risk Assessment'))
  parts.push(docxBodyParagraph(model.floodRiskSummary))

  parts.push(docxSectionHeading('Wetland Analysis'))
  parts.push(docxBodyParagraph(model.wetlandSummary))

  parts.push(docxSectionHeading('GIS Data Tables'))
  for (const table of model.tables) {
    parts.push(docxSectionHeading(table.title))
    const colW = Math.floor(9300 / table.headers.length)
    parts.push(docxTable(table.headers, table.rows, table.headers.map(() => colW)))
  }

  parts.push(docxSectionHeading('Conclusions & Recommendations'))
  parts.push(docxBodyParagraph(model.conclusion))
  parts.push(docxBulletList(model.recommendations))

  parts.push(docxSectionHeading('Data Quality Notes'))
  parts.push(docxBodyParagraph(model.dataQualityNotes))

  parts.push(
    docxItalicNote(
      `Generated ${model.generatedStamp} by ${model.projectName}. AgroCloud Hydro Watershed Workflow — enterprise GIS reporting.`,
    ),
  )

  return wrapDocumentBody(parts.join(''))
}
