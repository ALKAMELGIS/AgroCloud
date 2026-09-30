export type LayerCatalogCategory =
  | 'basemaps'
  | 'operational'
  | 'imagery'
  | 'analysis'
  | 'user'

export type LayerCatalogEntrySource = 'gis' | 'basemap'

export type LayerCatalogEntry = {
  id: string
  name: string
  typeLabel: string
  category: LayerCatalogCategory
  icon: string
  tone?: string
  thumbnailUrl?: string | null
  visible?: boolean
  onMap?: boolean
  modified?: string
  description?: string
  source: LayerCatalogEntrySource
  gisRowId?: string
}

export type LayerCatalogFilterTab = 'all' | LayerCatalogCategory | 'favorites' | 'recent'

export const LAYER_CATALOG_CATEGORY_ORDER: LayerCatalogCategory[] = [
  'basemaps',
  'operational',
  'imagery',
  'analysis',
  'user',
]

export const LAYER_CATALOG_CATEGORY_LABELS: Record<
  LayerCatalogCategory,
  { en: string; ar: string }
> = {
  basemaps: { en: 'Basemaps', ar: 'خرائط أساس' },
  operational: { en: 'Operational', ar: 'تشغيلية' },
  imagery: { en: 'Imagery', ar: 'صور' },
  analysis: { en: 'Analysis', ar: 'تحليل' },
  user: { en: 'User layers', ar: 'طبقات المستخدم' },
}
