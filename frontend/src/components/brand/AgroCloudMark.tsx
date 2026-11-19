type AgroCloudMarkProps = {
  size?: number
  title?: string
  className?: string
  flat?: boolean
}

const markUrl = `${import.meta.env.BASE_URL}agrocloud-mark-leaves.png`

/**
 * AgroCloud header mark — white vector-style leaves + ring (transparent PNG).
 */
export function AgroCloudMark({ size = 28, title, className }: AgroCloudMarkProps) {
  const label = title ?? 'AgroCloud'
  const cls = className ? `agro-cloud-mark ${className}` : 'agro-cloud-mark'

  return (
    <img
      className={cls}
      src={markUrl}
      width={size}
      height={size}
      alt={label}
      decoding="async"
      draggable={false}
    />
  )
}

export const AGRO_CLOUD_MARK_URL = markUrl

/** @deprecated Inline SVG default removed; use AGRO_CLOUD_MARK_URL. */
export const AGRO_CLOUD_MARK_SVG_INLINE = ''
export const AGRO_CLOUD_LOGO_URL = AGRO_CLOUD_MARK_URL
