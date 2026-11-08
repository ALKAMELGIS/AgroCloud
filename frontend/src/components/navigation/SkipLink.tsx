import type { MouseEvent } from 'react'
import { useLanguage } from '@/core/localization/i18n'

/** Id of the focusable `<main>` landmark both app shells render. */
export const MAIN_CONTENT_ID = 'main-content'

/**
 * "Skip to content" link for keyboard users — first tab stop on every page, visible only on focus.
 * The app uses hash routing, so a plain `#main-content` href would change the route; move focus instead.
 */
export function SkipLink() {
  const { language } = useLanguage()
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const main = document.getElementById(MAIN_CONTENT_ID)
    if (!main) return
    main.focus({ preventScroll: true })
    main.scrollIntoView({ block: 'start' })
  }
  return (
    <a className="ds-skip-link" href={`#${MAIN_CONTENT_ID}`} onClick={onClick}>
      {language === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}
    </a>
  )
}
