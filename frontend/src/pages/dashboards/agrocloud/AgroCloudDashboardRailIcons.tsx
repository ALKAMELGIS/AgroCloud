type RailIconProps = {
  className?: string
}

const svgBase = {
  viewBox: '0 0 16 16',
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Plus inside circle — ArcGIS dashboard rail add control. */
export function RailAddIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 5.25v5.5M5.25 8h5.5" />
    </svg>
  )
}

/** Monitor outline — View panel. */
export function RailViewIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className}>
      <rect x="2.5" y="3" width="11" height="7.5" rx="0.75" />
      <path d="M6 13.5h4M8 10.5v3" />
    </svg>
  )
}

/** Cylinder — Data sources. */
export function RailDataIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className}>
      <ellipse cx="8" cy="4.25" rx="4.25" ry="1.35" />
      <path d="M3.75 4.25v7.5c0 .75 1.9 1.35 4.25 1.35s4.25-.6 4.25-1.35v-7.5" />
      <ellipse cx="8" cy="11.75" rx="4.25" ry="1.35" />
    </svg>
  )
}

/** Palette with brush — Theme. */
export function RailThemeIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className}>
      <path d="M8.75 3.25c-2.6 0-4.5 1.65-4.5 3.75 0 1.35.85 2.1 2.05 2.1.55 0 .95-.15 1.35-.55.4.75.95 1.15 1.75 1.15 1.45 0 2.35-1.15 2.35-2.55 0-2.35-1.55-3.9-3-3.9Z" />
      <circle cx="6.15" cy="5.35" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="7.55" cy="4.55" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="9.15" cy="4.75" r="0.55" fill="currentColor" stroke="none" />
      <path d="M11.25 11.25 13.25 13.25" />
      <path d="M10.35 10.35 12.1 8.6a.75.75 0 0 1 1.05 0l.3.3a.75.75 0 0 1 0 1.05l-1.75 1.75Z" />
    </svg>
  )
}

/** Calendar with clock — Time and region. */
export function RailTimeRegionIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className}>
      <rect x="3" y="4.25" width="8.5" height="8.25" rx="0.75" />
      <path d="M3 6.75h8.5M5.25 3v1.75M9.25 3v1.75" />
      <path d="M5.25 8.75h1.5M5.25 10.75h1.5" />
      <circle cx="11.75" cy="11.25" r="2.35" />
      <path d="M11.75 10.1v2.3M10.65 11.25h2.2" />
    </svg>
  )
}

/** Floppy disk outline — Save. */
export function RailSaveIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className}>
      <path d="M4 3h6.35L13 5.65V13a.75.75 0 0 1-.75.75H4.75A.75.75 0 0 1 4 13V3.75A.75.75 0 0 1 4.75 3H4Z" />
      <path d="M10.25 3v3.25H6.5V3" />
      <rect x="5.25" y="9.25" width="5.5" height="3" rx="0.5" />
    </svg>
  )
}

export function RailChevronRightIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className} width={12} height={12}>
      <path d="m4.5 3 3 5-3 5" />
      <path d="m7.5 3 3 5-3 5" />
    </svg>
  )
}

export function RailChevronLeftIcon({ className }: RailIconProps) {
  return (
    <svg {...svgBase} className={className} width={12} height={12}>
      <path d="m11.5 3-3 5 3 5" />
      <path d="m8.5 3-3 5 3 5" />
    </svg>
  )
}
