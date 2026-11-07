type Props = {
  text: string
  active: boolean
  className?: string
}

/** Plain matte text while ticker runs — scroll only, no per-letter flip (avoids flicker). */
export function DevelopEliteAirportFlapText({ text, active, className }: Props) {
  const tickerClass = active ? ' develop-elite__list-text--ticker' : ''
  const merged = `${className ?? ''}${tickerClass}`.trim()
  return <span className={merged || undefined}>{text}</span>
}
