import {
  docxBodyParagraph,
  docxBulletList,
  docxMetaLine,
  docxSectionHeading,
  docxSubtitle,
  docxTitle,
  wrapDocumentBody,
} from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/timeSeriesDocxXml'
import type { HydroDocxModel } from './hydroReportDocxModel'
import { HYDRO_REPORT_MAP_SPECS } from './hydroReportTypes'
import {
  docxHydroAtlasIntro,
  docxHydroCoverKpiTable,
  docxHydroCoverLocationLine,
  docxHydroFigureBlock,
  docxHydroKeyIndicators,
  docxHydroReportFooterLine,
  docxHydroSubHeading,
  docxHydroTableSection,
} from './hydroDocxLayout'

const FIGURE_NUM: Record<string, number> = Object.fromEntries(
  HYDRO_REPORT_MAP_SPECS.map((s, i) => [s.id, i + 1]),
)

const TABLE_NUM: Record<string, number> = {
  'Study Area Summary': 1,
  'Project Information': 2,
  'DEM Statistics': 3,
  'Slope Classification': 4,
  'Stream Network Summary': 5,
  'Watershed Summary': 6,
  'Drainage Basins — Area & Share of AOI': 7,
  'Drainage Basins Summary': 7,
  'Flood Risk Classification': 8,
  'Wetland Statistics': 9,
}

const TOC_SECTIONS = [
  'Executive Summary',
  'Study Area Location',
  'Project Information',
  'Hydro DEM Analysis',
  'Terrain Analysis',
  'Hydrological Analysis',
  'Watershed Delineation',
  'Drainage Basins',
  'Flood Risk Assessment',
  'Wetland Analysis',
  'Data Quality Notes',
  'Conclusions & Recommendations',
]

function fig(model: HydroDocxModel, id: string, title: string): string {
  const num = FIGURE_NUM[id] ?? 0
  const snap = model.snapshotsById[id]
  const notes = snap?.stats ?? ''
  return docxHydroFigureBlock(snap?.rId ?? null, num, title, {
    notes,
    legend: snap?.legend ?? '',
    missingNote: snap?.note,
  })
}

function tbl(model: HydroDocxModel, title: string): string {
  const table = model.tablesByTitle[title]
  if (!table) return ''
  const num = TABLE_NUM[title] ?? 0
  return docxHydroTableSection(num, table.title, table.headers, table.rows)
}

export function buildHydroDocxDocumentXml(model: HydroDocxModel): string {
  const parts: string[] = []

  if (model.coverLocationLine) parts.push(docxHydroCoverLocationLine(model.coverLocationLine))
  parts.push(docxTitle('HYDRO WATERSHED & FLOOD RISK'))
  parts.push(docxSubtitle('Professional Assessment Report'))
  parts.push(
    docxMetaLine([
      { text: model.aoiName },
      { text: model.locationLabel ? `  ·  ${model.locationLabel}` : '' },
      { text: `  ·  Total Area ${model.sitePlanAreaLabel}` },
    ]),
  )
  parts.push(
    docxHydroCoverKpiTable([
      ['STUDY AREA NAME', model.aoiName],
      ['LOCATION', model.locationLabel || '—'],
      ['TOTAL AREA', model.sitePlanAreaLabel],
      ['CENTROID', model.centroidLabel],
      ['REPORT DATE', model.analysisDate],
    ]),
  )
  parts.push(
    docxMetaLine([
      { text: `Hydro Watershed & Flood Risk Assessment Report  ·  ${model.analysisDate.slice(0, 4)}` },
    ]),
  )

  parts.push(docxSectionHeading('Table of Contents'))
  parts.push(docxBulletList(TOC_SECTIONS))
  parts.push(docxSectionHeading('List of Figures'))
  parts.push(
    docxBulletList(
      HYDRO_REPORT_MAP_SPECS.map((s, i) => `Figure ${i + 1}. ${s.title}`),
    ),
  )
  parts.push(docxSectionHeading('List of Tables'))
  parts.push(
    docxBulletList(
      model.tables.map((t, i) => {
        const n = TABLE_NUM[t.title] ?? i + 1
        return `Table ${n}. ${t.title}`
      }),
    ),
  )

  parts.push(docxSectionHeading('Executive Summary'))
  parts.push(docxBodyParagraph(model.executiveNarrative))
  parts.push(docxHydroSubHeading('Key Indicators'))
  parts.push(docxHydroKeyIndicators(model.keyIndicators))

  parts.push(docxSectionHeading('Study Area Location'))
  parts.push(docxHydroAtlasIntro())
  parts.push(fig(model, 'aoi-location', 'AOI Location Map'))
  parts.push(tbl(model, 'Study Area Summary'))

  parts.push(docxSectionHeading('Project Information'))
  parts.push(tbl(model, 'Project Information'))

  parts.push(docxSectionHeading('Hydro DEM Analysis'))
  parts.push(docxBodyParagraph(model.terrainSummary))
  parts.push(fig(model, 'dem', 'DEM Elevation Map'))
  parts.push(tbl(model, 'DEM Statistics'))

  parts.push(docxSectionHeading('Terrain Analysis'))
  parts.push(
    docxBodyParagraph(
      'Slope and aspect characterise surface steepness and orientation governing runoff velocity and erosion risk.',
    ),
  )
  parts.push(fig(model, 'hillshade', 'Hillshade Map'))
  parts.push(fig(model, 'contours', 'Elevation Contour Map'))
  parts.push(fig(model, 'slope', 'Slope Analysis Map'))
  parts.push(fig(model, 'aspect', 'Aspect Analysis Map'))
  parts.push(tbl(model, 'Slope Classification'))

  parts.push(docxSectionHeading('Hydrological Analysis'))
  parts.push(docxBodyParagraph(model.hydrologicalSummary))
  parts.push(fig(model, 'flow-direction', 'Flow Direction Map'))
  parts.push(fig(model, 'flow-accum', 'Flow Accumulation Map'))
  parts.push(fig(model, 'streams', 'Stream Network Map'))
  parts.push(tbl(model, 'Stream Network Summary'))

  parts.push(docxSectionHeading('Watershed Delineation'))
  parts.push(
    docxBodyParagraph(
      'Primary watershed basins are delineated from D8 terminal outlets, ranked by area, and rendered with coordinated colours on the map layer and legend (matching the interactive Hydro Watershed map).',
    ),
  )
  parts.push(fig(model, 'watershed', 'Watershed Delineation Map'))
  parts.push(tbl(model, 'Watershed Summary'))

  parts.push(docxSectionHeading('Drainage Basins'))
  parts.push(
    docxBodyParagraph(
      'The Drainage Basins Map colours every primary drainage basin with a coordinated palette. Basin boundaries are emphasised on the layer; the report legend lists each Drainage Basin with its area (km²).',
    ),
  )
  parts.push(fig(model, 'basins', 'Drainage Basins Map'))
  parts.push(tbl(model, 'Drainage Basins — Area & Share of AOI') || tbl(model, 'Drainage Basins Summary'))

  parts.push(docxSectionHeading('Flood Risk Assessment'))
  parts.push(docxBodyParagraph(model.floodRiskSummary))
  parts.push(fig(model, 'flood-risk', 'Flood Risk Assessment Map'))
  parts.push(tbl(model, 'Flood Risk Classification'))

  parts.push(docxSectionHeading('Wetland Analysis'))
  parts.push(docxBodyParagraph(model.wetlandSummary))
  parts.push(fig(model, 'wetland', 'Wetland Analysis Map'))
  parts.push(tbl(model, 'Wetland Statistics'))

  parts.push(docxSectionHeading('Data Quality Notes'))
  parts.push(docxBodyParagraph(model.dataQualityNotes))

  parts.push(docxSectionHeading('Conclusions & Recommendations'))
  parts.push(docxHydroSubHeading('12.1 Conclusions'))
  parts.push(docxBodyParagraph(model.conclusion))
  parts.push(docxHydroSubHeading('12.2 Recommendations'))
  parts.push(docxBulletList(model.recommendations))
  parts.push(docxHydroReportFooterLine(model.projectName, model.generatedStamp))

  return wrapDocumentBody(parts.join(''))
}
