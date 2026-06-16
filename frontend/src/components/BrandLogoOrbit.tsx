import type { CSSProperties } from 'react'

const logoUrl = `${import.meta.env.BASE_URL}elite-agro-logo-white.png`

type BrandLogoOrbitProps = {
  /** Max width in px (height follows aspect ratio). */
  size?: number
  className?: string
  animate?: boolean
  title?: string
}

/** Elite Agro Projects white logo (splash / hero). */
export function BrandLogoOrbit({ size = 320, className, title = 'Elite Agro Projects' }: BrandLogoOrbitProps) {
  const wrapCls = ['brand-logo-orbit', 'brand-logo-orbit--wide', className].filter(Boolean).join(' ')
  const style = { width: size, maxWidth: '92vw' } as CSSProperties

  return (
    <div className={wrapCls} style={style} role="img" aria-label={title}>
      <img
        className="brand-logo-orbit__logo"
        src={logoUrl}
        alt=""
        decoding="async"
        draggable={false}
      />
    </div>
  )
}
