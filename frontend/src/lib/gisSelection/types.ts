import type { GeoAiMapFirstSelection } from '../geoAiStatsEngine'

export type GisSelectionTool =
  | 'select'
  | 'rectangle'
  | 'polygon'
  | 'lasso'
  | 'circle'
  | 'line'
  | 'trace'

export type GisSelectionSetMode = 'new' | 'add' | 'remove' | 'subset'

export type GisSpatialRelationship =
  | 'intersects'
  | 'within'
  | 'contains'
  | 'overlaps'
  | 'touches'
  | 'within_distance'
  | 'completely_contains'

export type GisAttributeOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'BETWEEN'

export type GisAttributeClause = {
  field: string
  operator: GisAttributeOperator
  value: string | number | boolean
  value2?: string | number
}

export type GisSelectableLayer = {
  id: string
  name: string
  featureCount: number
  selectable: boolean
  selectedCount: number
}

export type GisSelectionHit = GeoAiMapFirstSelection & {
  layerName: string
  properties: Record<string, unknown>
}

export type GisSelectionStats = {
  featureCount: number
  areaHa: number | null
  lengthKm: number | null
  numericSummaries: Array<{
    field: string
    min: number
    max: number
    avg: number
    sum: number
  }>
}

export type GisSelectionLayerSource = {
  id: string
  name: string
  geojson?: { features?: unknown[] } | null
}
