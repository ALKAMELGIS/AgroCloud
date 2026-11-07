import { useEffect, useRef } from 'react'

/**
 * Calls `onEscape` when Escape is pressed while `active` is true.
 * For custom (non-MUI) overlays: MUI Dialog/Drawer already handle Escape.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape)
  handler.current = onEscape

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      handler.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])
}
