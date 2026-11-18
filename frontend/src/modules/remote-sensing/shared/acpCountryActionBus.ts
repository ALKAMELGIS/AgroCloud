/** Portfolio country selection — map camera + dashboard panels (Map-to-Action). */

export const ACP_COUNTRY_SELECT_EVENT = 'acp-country-select'

export type AcpCountrySelectDetail = {
  country: string
  previous: string
  flyMap: boolean
  at: number
}

type AcpCountrySelectListener = (detail: AcpCountrySelectDetail) => void

const listeners = new Set<AcpCountrySelectListener>()

export function emitAcpCountrySelect(
  detail: Omit<AcpCountrySelectDetail, 'at'>,
): AcpCountrySelectDetail {
  const payload: AcpCountrySelectDetail = { ...detail, at: Date.now() }
  listeners.forEach(listener => listener(payload))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACP_COUNTRY_SELECT_EVENT, { detail: payload }))
  }
  return payload
}

export function subscribeAcpCountrySelect(listener: AcpCountrySelectListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Map layers/WMS keep full portfolio geometry — country filter applies to panels + camera only. */
export const ACP_MAP_LAYER_COUNTRY_SCOPE = 'all'
