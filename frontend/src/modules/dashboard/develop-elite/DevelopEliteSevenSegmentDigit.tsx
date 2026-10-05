import { memo } from 'react'
import { developEliteSevenSegmentMask } from './developEliteUaeClock'

type Props = {
  char: string
  variant?: 'primary' | 'accent'
  className?: string
}

const SEGMENT_RECTS = [
  { x: 4, y: 1, width: 12, height: 3, rx: 1 },
  { x: 15, y: 3, width: 3, height: 13, rx: 1 },
  { x: 15, y: 19, width: 3, height: 13, rx: 1 },
  { x: 4, y: 31, width: 12, height: 3, rx: 1 },
  { x: 1, y: 19, width: 3, height: 13, rx: 1 },
  { x: 1, y: 3, width: 3, height: 13, rx: 1 },
  { x: 4, y: 16, width: 12, height: 3, rx: 1 },
] as const

function DevelopEliteSevenSegmentDigitInner({ char, variant = 'primary', className }: Props) {
  const mask = developEliteSevenSegmentMask(char)
  const onClass =
    variant === 'accent'
      ? 'develop-elite-seven-seg__bar is-on is-accent'
      : 'develop-elite-seven-seg__bar is-on'

  return (
    <svg
      className={`develop-elite-seven-seg${className ? ` ${className}` : ''}`}
      viewBox="0 0 20 36"
      aria-hidden
    >
      {SEGMENT_RECTS.map((rect, i) => (
        <rect
          key={i}
          className={mask[i] ? onClass : 'develop-elite-seven-seg__bar'}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={rect.rx}
        />
      ))}
    </svg>
  )
}

export const DevelopEliteSevenSegmentDigit = memo(DevelopEliteSevenSegmentDigitInner)

function DevelopEliteSevenSegmentColonInner({ pulse }: { pulse: boolean }) {
  return (
    <svg
      className={`develop-elite-seven-seg develop-elite-seven-seg--colon${pulse ? ' is-pulse' : ''}`}
      viewBox="0 0 10 36"
      aria-hidden
    >
      <rect className="develop-elite-seven-seg__dot is-on" x="3.5" y="10" width="3" height="3" rx="0.6" />
      <rect className="develop-elite-seven-seg__dot is-on" x="3.5" y="23" width="3" height="3" rx="0.6" />
    </svg>
  )
}

export const DevelopEliteSevenSegmentColon = memo(DevelopEliteSevenSegmentColonInner)
