import {
  DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE,
  DEVELOP_ELITE_PIVOT_STRUCTURE_CODE,
  type DevelopEliteAgroStructuresSubtypes,
  type DevelopEliteRasterClipSubtype,
} from './developEliteMapRasterConfig'
import { readDevelopEliteStructureTypeCode } from './developEliteKpiEngine'

export function structureMatchesDevelopEliteSubtype(
  props: Record<string, unknown>,
  opts: { farmPlots: boolean; pivot: boolean },
): boolean {
  if (!opts.farmPlots && !opts.pivot) return false
  const code = readDevelopEliteStructureTypeCode(props)
  if (code === DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE) return opts.farmPlots
  if (code === DEVELOP_ELITE_PIVOT_STRUCTURE_CODE) return opts.pivot
  return true
}

export function clipSubtypeToStructureFilter(
  clipSubtype: DevelopEliteRasterClipSubtype,
): { farmPlots: boolean; pivot: boolean } {
  if (clipSubtype === 'farm') return { farmPlots: true, pivot: false }
  if (clipSubtype === 'pivot') return { farmPlots: false, pivot: true }
  return { farmPlots: true, pivot: true }
}

export function filterAgroStructuresBySubtype(
  fc: GeoJSON.FeatureCollection,
  opts: DevelopEliteAgroStructuresSubtypes,
): GeoJSON.FeatureCollection {
  if (!fc.features.length) return fc
  if (!opts.farmPlots && !opts.pivot) {
    return fc
  }
  const features = fc.features.filter(f =>
    structureMatchesDevelopEliteSubtype((f.properties ?? {}) as Record<string, unknown>, opts),
  )
  return { type: 'FeatureCollection', features }
}
