/**
 * Map feature label style for Satellite Intelligence GIS layers.
 */

export type SiLabelFontFamily =
  | 'open-sans'
  | 'arial'
  | 'roboto'
  | 'din'
  | 'din-medium'
  | 'source-sans'
  | 'lato'
  | 'montserrat'
  | 'poppins'
  | 'raleway'
  | 'oswald'
  | 'ubuntu'
  | 'pt-sans'
  | 'noto-sans'
  | 'merriweather'
  | 'playfair'
  | 'roboto-condensed'
  | 'barlow'
  | 'inter'
  | 'nunito'

export type SiLayerLabelStyle = {
  fieldName: string
  fontFamily: SiLabelFontFamily
  fontSize: number
  fontWeight: 'regular' | 'bold'
  fontStyle: 'normal' | 'italic'
  textColor: string
  haloColor: string
  haloWidth: number
  /** Map zoom at which labels start appearing (inclusive). */
  minZoom: number
  /** Map zoom at which labels stop appearing (exclusive in Mapbox). */
  maxZoom: number
}

export const SI_LABEL_ZOOM_MIN = 0
export const SI_LABEL_ZOOM_MAX = 24

export const DEFAULT_SI_LAYER_LABEL_STYLE: SiLayerLabelStyle = {
  fieldName: '',
  fontFamily: 'open-sans',
  fontSize: 12,
  fontWeight: 'regular',
  fontStyle: 'normal',
  textColor: '#f8fafc',
  haloColor: '#020617',
  haloWidth: 1.4,
  minZoom: SI_LABEL_ZOOM_MIN,
  maxZoom: SI_LABEL_ZOOM_MAX,
}

type FontDef = {
  id: SiLabelFontFamily
  label: string
  /** CSS stack for the settings preview only. */
  cssFamily: string
  /** Mapbox GL font names: regular / bold / italic / boldItalic (fallback to regular). */
  mapbox: {
    regular: string
    bold: string
    italic: string
    boldItalic: string
  }
}

/**
 * Fonts available via `mapbox://fonts/mapbox/{fontstack}/{range}.pbf`
 * (with Arial Unicode always appended as glyph fallback).
 */
export const SI_LABEL_FONT_DEFS: FontDef[] = [
  {
    id: 'open-sans',
    label: 'Open Sans',
    cssFamily: '"Open Sans", "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Open Sans Regular',
      bold: 'Open Sans Bold',
      italic: 'Open Sans Italic',
      boldItalic: 'Open Sans Bold Italic',
    },
  },
  {
    id: 'arial',
    label: 'Arial Unicode',
    cssFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    mapbox: {
      regular: 'Arial Unicode MS Regular',
      bold: 'Arial Unicode MS Bold',
      italic: 'Arial Unicode MS Regular',
      boldItalic: 'Arial Unicode MS Bold',
    },
  },
  {
    id: 'roboto',
    label: 'Roboto',
    cssFamily: 'Roboto, "Helvetica Neue", sans-serif',
    mapbox: {
      regular: 'Roboto Regular',
      bold: 'Roboto Bold',
      italic: 'Roboto Italic',
      boldItalic: 'Roboto Bold Italic',
    },
  },
  {
    id: 'roboto-condensed',
    label: 'Roboto Condensed',
    cssFamily: '"Roboto Condensed", Roboto, sans-serif',
    mapbox: {
      regular: 'Roboto Condensed Regular',
      bold: 'Roboto Condensed Bold',
      italic: 'Roboto Condensed Italic',
      boldItalic: 'Roboto Condensed Bold Italic',
    },
  },
  {
    id: 'din',
    label: 'DIN Offc Pro',
    cssFamily: '"DIN Alternate", "Segoe UI", sans-serif',
    mapbox: {
      regular: 'DIN Offc Pro Regular',
      bold: 'DIN Offc Pro Bold',
      italic: 'DIN Offc Pro Italic',
      boldItalic: 'DIN Offc Pro Bold',
    },
  },
  {
    id: 'din-medium',
    label: 'DIN Offc Pro Medium',
    cssFamily: '"DIN Alternate", "Segoe UI", sans-serif',
    mapbox: {
      regular: 'DIN Offc Pro Medium',
      bold: 'DIN Offc Pro Bold',
      italic: 'DIN Offc Pro Medium',
      boldItalic: 'DIN Offc Pro Bold',
    },
  },
  {
    id: 'source-sans',
    label: 'Source Sans Pro',
    cssFamily: '"Source Sans 3", "Source Sans Pro", "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Source Sans Pro Regular',
      bold: 'Source Sans Pro Bold',
      italic: 'Source Sans Pro Italic',
      boldItalic: 'Source Sans Pro Bold Italic',
    },
  },
  {
    id: 'lato',
    label: 'Lato',
    cssFamily: 'Lato, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Lato Regular',
      bold: 'Lato Bold',
      italic: 'Lato Italic',
      boldItalic: 'Lato Bold Italic',
    },
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    cssFamily: 'Montserrat, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Montserrat Regular',
      bold: 'Montserrat Bold',
      italic: 'Montserrat Italic',
      boldItalic: 'Montserrat Bold Italic',
    },
  },
  {
    id: 'poppins',
    label: 'Poppins',
    cssFamily: 'Poppins, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Poppins Regular',
      bold: 'Poppins Bold',
      italic: 'Poppins Italic',
      boldItalic: 'Poppins Bold Italic',
    },
  },
  {
    id: 'raleway',
    label: 'Raleway',
    cssFamily: 'Raleway, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Raleway Regular',
      bold: 'Raleway Bold',
      italic: 'Raleway Italic',
      boldItalic: 'Raleway Bold Italic',
    },
  },
  {
    id: 'oswald',
    label: 'Oswald',
    cssFamily: 'Oswald, "Arial Narrow", sans-serif',
    mapbox: {
      regular: 'Oswald Regular',
      bold: 'Oswald Bold',
      italic: 'Oswald Regular',
      boldItalic: 'Oswald Bold',
    },
  },
  {
    id: 'ubuntu',
    label: 'Ubuntu',
    cssFamily: 'Ubuntu, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Ubuntu Regular',
      bold: 'Ubuntu Bold',
      italic: 'Ubuntu Italic',
      boldItalic: 'Ubuntu Bold Italic',
    },
  },
  {
    id: 'pt-sans',
    label: 'PT Sans',
    cssFamily: '"PT Sans", "Segoe UI", sans-serif',
    mapbox: {
      regular: 'PT Sans Regular',
      bold: 'PT Sans Bold',
      italic: 'PT Sans Italic',
      boldItalic: 'PT Sans Bold Italic',
    },
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    cssFamily: '"Noto Sans", "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Noto Sans Regular',
      bold: 'Noto Sans Bold',
      italic: 'Noto Sans Italic',
      boldItalic: 'Noto Sans Bold Italic',
    },
  },
  {
    id: 'inter',
    label: 'Inter',
    cssFamily: 'Inter, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Inter Regular',
      bold: 'Inter Bold',
      italic: 'Inter Italic',
      boldItalic: 'Inter Bold Italic',
    },
  },
  {
    id: 'nunito',
    label: 'Nunito',
    cssFamily: 'Nunito, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Nunito Regular',
      bold: 'Nunito Bold',
      italic: 'Nunito Italic',
      boldItalic: 'Nunito Bold Italic',
    },
  },
  {
    id: 'barlow',
    label: 'Barlow',
    cssFamily: 'Barlow, "Segoe UI", sans-serif',
    mapbox: {
      regular: 'Barlow Regular',
      bold: 'Barlow Bold',
      italic: 'Barlow Italic',
      boldItalic: 'Barlow Bold Italic',
    },
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    cssFamily: 'Merriweather, Georgia, serif',
    mapbox: {
      regular: 'Merriweather Regular',
      bold: 'Merriweather Bold',
      italic: 'Merriweather Italic',
      boldItalic: 'Merriweather Bold Italic',
    },
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    cssFamily: '"Playfair Display", Georgia, serif',
    mapbox: {
      regular: 'Playfair Display Regular',
      bold: 'Playfair Display Bold',
      italic: 'Playfair Display Italic',
      boldItalic: 'Playfair Display Bold Italic',
    },
  },
]

export const SI_LABEL_FONT_FAMILY_OPTIONS: Array<{ id: SiLabelFontFamily; label: string }> =
  SI_LABEL_FONT_DEFS.map(d => ({ id: d.id, label: d.label }))

const FONT_IDS = new Set<string>(SI_LABEL_FONT_DEFS.map(d => d.id))

export function isSiLabelFontFamily(v: unknown): v is SiLabelFontFamily {
  return typeof v === 'string' && FONT_IDS.has(v)
}

export function getSiLabelFontDef(id: SiLabelFontFamily): FontDef {
  return SI_LABEL_FONT_DEFS.find(d => d.id === id) ?? SI_LABEL_FONT_DEFS[0]!
}

export const SI_LABEL_FONT_SIZE_OPTIONS = [9, 10, 11, 12, 14, 16, 18, 20, 24] as const

/** Droplist values for label visibility zoom range. */
export const SI_LABEL_ZOOM_OPTIONS = Array.from(
  { length: SI_LABEL_ZOOM_MAX - SI_LABEL_ZOOM_MIN + 1 },
  (_, i) => SI_LABEL_ZOOM_MIN + i,
)

function clampLabelZoom(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.max(SI_LABEL_ZOOM_MIN, Math.min(SI_LABEL_ZOOM_MAX, Math.round(v)))
}

const ARIAL_FALLBACK = 'Arial Unicode MS Regular'
const ARIAL_BOLD_FALLBACK = 'Arial Unicode MS Bold'

/** Mapbox GL `text-font` stacks — primary font + Arial Unicode fallback. */
export function resolveSiLabelMapboxFontStack(
  style: Pick<SiLayerLabelStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'>,
): string[] {
  const def = getSiLabelFontDef(style.fontFamily)
  const bold = style.fontWeight === 'bold'
  const italic = style.fontStyle === 'italic'
  let primary: string
  if (bold && italic) primary = def.mapbox.boldItalic
  else if (bold) primary = def.mapbox.bold
  else if (italic) primary = def.mapbox.italic
  else primary = def.mapbox.regular

  const fallback = bold ? ARIAL_BOLD_FALLBACK : ARIAL_FALLBACK
  if (primary === fallback) return [primary]
  return [primary, fallback]
}

/** CSS font-family for the Label settings preview. */
export function resolveSiLabelPreviewCssFamily(fontFamily: SiLabelFontFamily): string {
  return getSiLabelFontDef(fontFamily).cssFamily
}

const PREVIEW_FONTS_LINK_ID = 'si-layer-label-preview-fonts'

/**
 * Load web fonts so the labeling panel font list renders each face correctly.
 * Mapbox still uses its own glyph stacks on the map.
 */
export function ensureSiLabelPreviewFontsLoaded(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(PREVIEW_FONTS_LINK_ID)) return
  const link = document.createElement('link')
  link.id = PREVIEW_FONTS_LINK_ID
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?' +
    [
      'family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700',
      'family=Roboto:ital,wght@0,400;0,700;1,400;1,700',
      'family=Roboto+Condensed:ital,wght@0,400;0,700;1,400;1,700',
      'family=Source+Sans+3:ital,wght@0,400;0,700;1,400;1,700',
      'family=Lato:ital,wght@0,400;0,700;1,400;1,700',
      'family=Montserrat:ital,wght@0,400;0,700;1,400;1,700',
      'family=Poppins:ital,wght@0,400;0,700;1,400;1,700',
      'family=Raleway:ital,wght@0,400;0,700;1,400;1,700',
      'family=Oswald:wght@400;700',
      'family=Ubuntu:ital,wght@0,400;0,700;1,400;1,700',
      'family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700',
      'family=Noto+Sans:ital,wght@0,400;0,700;1,400;1,700',
      'family=Inter:ital,wght@0,400;0,700;1,400;1,700',
      'family=Nunito:ital,wght@0,400;0,700;1,400;1,700',
      'family=Barlow:ital,wght@0,400;0,700;1,400;1,700',
      'family=Merriweather:ital,wght@0,400;0,700;1,400;1,700',
      'family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700',
    ].join('&') +
    '&display=swap'
  document.head.appendChild(link)
}

export function normalizeSiLayerLabelStyle(raw: unknown): SiLayerLabelStyle {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const fontFamily = isSiLabelFontFamily(o.fontFamily)
    ? o.fontFamily
    : DEFAULT_SI_LAYER_LABEL_STYLE.fontFamily
  const fontSize =
    typeof o.fontSize === 'number' && Number.isFinite(o.fontSize)
      ? Math.max(8, Math.min(36, Math.round(o.fontSize)))
      : DEFAULT_SI_LAYER_LABEL_STYLE.fontSize
  const fontWeight = o.fontWeight === 'bold' ? 'bold' : 'regular'
  const fontStyle = o.fontStyle === 'italic' ? 'italic' : 'normal'
  const textColor =
    typeof o.textColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(o.textColor.trim())
      ? o.textColor.trim()
      : DEFAULT_SI_LAYER_LABEL_STYLE.textColor
  const haloColor =
    typeof o.haloColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(o.haloColor.trim())
      ? o.haloColor.trim()
      : DEFAULT_SI_LAYER_LABEL_STYLE.haloColor
  const haloWidth =
    typeof o.haloWidth === 'number' && Number.isFinite(o.haloWidth)
      ? Math.max(0, Math.min(4, o.haloWidth))
      : DEFAULT_SI_LAYER_LABEL_STYLE.haloWidth
  const fieldName = typeof o.fieldName === 'string' ? o.fieldName.trim() : ''
  let minZoom = clampLabelZoom(o.minZoom, DEFAULT_SI_LAYER_LABEL_STYLE.minZoom)
  let maxZoom = clampLabelZoom(o.maxZoom, DEFAULT_SI_LAYER_LABEL_STYLE.maxZoom)
  if (minZoom > maxZoom) {
    const t = minZoom
    minZoom = maxZoom
    maxZoom = t
  }
  // Mapbox needs maxzoom strictly greater than minzoom for a visible range.
  if (maxZoom <= minZoom) {
    maxZoom = Math.min(SI_LABEL_ZOOM_MAX, minZoom + 1)
  }
  return {
    fieldName,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    textColor,
    haloColor,
    haloWidth,
    minZoom,
    maxZoom,
  }
}

export function siLayerLabelStylePaintSig(style: Partial<SiLayerLabelStyle> | null | undefined): string {
  if (!style) return ''
  const n = normalizeSiLayerLabelStyle(style)
  return `${n.fontFamily}:${n.fontSize}:${n.fontWeight}:${n.fontStyle}:${n.textColor}:${n.haloColor}:${n.haloWidth}:${n.minZoom}:${n.maxZoom}`
}
