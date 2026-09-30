type Props = {
  /** When true, toolbar is hidden — show “expand tools” glyph. */
  collapsed?: boolean
}

/** Toolbar collapse / expand glyph for the map rail toggle. */
export function AcpHideToolbarIcon({ collapsed = false }: Props) {
  return (
    <svg
      className="acp-hide-toolbar-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      focusable="false"
    >
      <rect x="2" y="2.5" width="12" height="2" rx="0.75" fill="currentColor" opacity="0.92" />
      <rect x="2" y="6" width="12" height="2" rx="0.75" fill="currentColor" opacity="0.72" />
      <rect x="2" y="9.5" width="12" height="2" rx="0.75" fill="currentColor" opacity="0.52" />
      {collapsed ? (
        <path
          d="M5 13.25 L8 11.25 L11 13.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5 11.25 L8 13.25 L11 11.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
