/**
 * ArcGIS REST layer definition → human-readable attribute values
 * (coded-value domains, subtype typeIdField / types[].domains).
 * Mirrors GIS Content table behavior for Geo AI context strings.
 */

export type ArcgisLayerDefLite = {
  fields?: unknown[]
  types?: unknown[]
  typeIdField?: string
  geometryType?: string
  name?: string
}

export function readCodedValueDescription(coded: any): string {
  const candidates = [coded?.description, coded?.label, coded?.name, coded?.displayName]
  const found = candidates.find(v => typeof v === 'string' && v.trim())
  return typeof found === 'string' ? found.trim() : ''
}

export function buildArcFieldsByLower(arcDef: ArcgisLayerDefLite | null | undefined): Map<string, any> {
  const map = new Map<string, any>()
  if (!arcDef || !Array.isArray(arcDef.fields)) return map
  arcDef.fields.forEach((field: any) => {
    if (typeof field?.name === 'string') map.set(field.name.toLowerCase(), field)
  })
  return map
}

/**
 * Single-value legend/table label from layer schema: coded-value domains on the field,
 * subtype-specific {@code types[].domains[field]}, and subtype names when {@code fieldName}
 * is the {@code typeIdField}.
 */
export function arcLegendLabelForFieldValue(
  fieldName: string,
  rawCode: string | number | null | undefined,
  arcDef: ArcgisLayerDefLite | null | undefined,
  fieldsByLower: Map<string, any>,
): string {
  const rawText = rawCode === null || rawCode === undefined ? '' : String(rawCode)
  if (!String(fieldName ?? '').trim() || rawText === '') return rawText
  if (!arcDef) return rawText

  const fnLower = String(fieldName).toLowerCase()
  const arcTypeIdField = typeof arcDef.typeIdField === 'string' ? arcDef.typeIdField : ''

  if (arcTypeIdField && fnLower === String(arcTypeIdField).toLowerCase()) {
    const arcTypes = (Array.isArray(arcDef.types) ? arcDef.types : []) as any[]
    const st = arcTypes.find((type: any) => String(type?.id) === rawText)
    const name = typeof st?.name === 'string' ? String(st.name).trim() : ''
    const desc = typeof st?.description === 'string' ? String(st.description).trim() : ''
    if (name) return name
    if (desc) return desc
    return rawText
  }

  const tryDomain = (domain: any): string | null => {
    if (!domain || domain.type !== 'codedValue' || !Array.isArray(domain.codedValues)) return null
    const coded = domain.codedValues.find((cv: any) => String(cv?.code) === rawText)
    const d = readCodedValueDescription(coded)
    return d || null
  }

  const fieldDef = fieldsByLower.get(fnLower)
  const fromField = tryDomain(fieldDef?.domain)
  if (fromField) return fromField

  const arcTypes = (Array.isArray(arcDef.types) ? arcDef.types : []) as any[]
  for (const st of arcTypes) {
    const subtypeDomains = st?.domains && typeof st.domains === 'object' ? st.domains : null
    if (!subtypeDomains) continue
    const dom = subtypeDomains[fieldName] ?? subtypeDomains[String(fieldName)]
    const label = tryDomain(dom)
    if (label) return label
  }

  return rawText
}

export function getArcSubtype(ft: any, arcDef: ArcgisLayerDefLite | null | undefined): any | null {
  if (!arcDef) return null
  const arcTypeIdField = typeof arcDef.typeIdField === 'string' ? arcDef.typeIdField : ''
  if (!arcTypeIdField) return null
  const raw = ft?.properties?.[arcTypeIdField]
  const arcTypes = Array.isArray(arcDef.types) ? arcDef.types : []
  return arcTypes.find((type: any) => String(type?.id) === String(raw)) || null
}

export function getArcDomainForField(
  ft: any,
  fieldName: string,
  arcDef: ArcgisLayerDefLite | null | undefined,
  fieldsByLower?: Map<string, any>,
): any | null {
  if (!arcDef) return null
  const subtype = getArcSubtype(ft, arcDef)
  const subtypeDomains = subtype && subtype.domains && typeof subtype.domains === 'object' ? subtype.domains : null
  const subtypeDomain = subtypeDomains ? subtypeDomains[fieldName] ?? subtypeDomains[String(fieldName)] : null
  if (subtypeDomain) return subtypeDomain
  const map = fieldsByLower ?? buildArcFieldsByLower(arcDef)
  const fieldDef = map.get(String(fieldName).toLowerCase())
  return fieldDef?.domain ?? null
}

export type ArcDisplayParts = {
  code: string
  description: string
  display: string
  title: string
  hasDomain: boolean
  missingDescription: boolean
}

export function getArcDisplayValue(
  ft: any,
  fieldName: string,
  raw: any,
  arcDef: ArcgisLayerDefLite | null | undefined,
  fieldsByLower: Map<string, any>,
  domainDisplayMode: 'description' | 'code' = 'description',
): ArcDisplayParts {
  const rawText = raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
  if (!arcDef) {
    return { code: rawText, description: '', display: rawText, title: rawText, hasDomain: false, missingDescription: false }
  }

  const arcTypeIdField = typeof arcDef.typeIdField === 'string' ? arcDef.typeIdField : ''
  const arcTypes = Array.isArray(arcDef.types) ? arcDef.types : []

  if (arcTypeIdField && String(fieldName).toLowerCase() === String(arcTypeIdField).toLowerCase()) {
    const subtype = getArcSubtype(ft, arcDef)
    const label =
      typeof subtype?.name === 'string' && subtype.name
        ? subtype.name
        : typeof subtype?.description === 'string'
          ? subtype.description
          : ''
    const description = label.trim()
    const display = domainDisplayMode === 'description' && description ? description : rawText
    const title = description ? `${description} (code: ${rawText})` : rawText
    return {
      code: rawText,
      description,
      display,
      title,
      hasDomain: Boolean(subtype),
      missingDescription: Boolean(subtype && rawText && !description),
    }
  }

  const domain = getArcDomainForField(ft, fieldName, arcDef, fieldsByLower)
  if (domain?.type === 'codedValue' && Array.isArray(domain?.codedValues)) {
    const coded = domain.codedValues.find((cv: any) => String(cv?.code) === rawText)
    const description = readCodedValueDescription(coded)
    const display = domainDisplayMode === 'description' && description ? description : rawText
    const title = description ? `${description} (code: ${rawText})` : rawText
    return {
      code: rawText,
      description,
      display,
      title,
      hasDomain: true,
      missingDescription: Boolean(rawText && !description),
    }
  }

  return { code: rawText, description: '', display: rawText, title: rawText, hasDomain: false, missingDescription: false }
}

/** One string per field for LLM context: prefer domain/subtype description; keep stored code in parentheses when both exist. */
export function formatFeaturePropertiesForGeoAi(
  props: Record<string, unknown>,
  ft: { properties?: Record<string, unknown> },
  arcDef: ArcgisLayerDefLite | null | undefined,
): Record<string, string> {
  if (!props || typeof props !== 'object') return {}
  if (!arcDef) {
    return Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
    )
  }
  const fieldsByLower = buildArcFieldsByLower(arcDef)
  const out: Record<string, string> = {}
  for (const key of Object.keys(props)) {
    const raw = props[key]
    const parts = getArcDisplayValue(ft, key, raw, arcDef, fieldsByLower, 'description')
    if (parts.hasDomain && parts.description && parts.description !== parts.code) {
      out[key] = `${parts.description} (stored code: ${parts.code})`
    } else if (parts.description) {
      out[key] = parts.description
    } else {
      out[key] = parts.code
    }
  }
  return out
}
