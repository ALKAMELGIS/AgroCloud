import type { ReactNode, RefObject } from 'react'

type Props = {
  viewportRef: RefObject<HTMLDivElement | null>
  tickerActive: boolean
  children: ReactNode
}

/** Clips the list while Play uses transform-based airport-board scroll. */
export function DevelopEliteListTickerViewport({ viewportRef, tickerActive, children }: Props) {
  return (
    <div
      ref={viewportRef}
      className={`develop-elite__list-viewport${
        tickerActive ? ' develop-elite__list-viewport--ticker' : ''
      }`}
    >
      {children}
    </div>
  )
}
