import { useCallback, useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from '../../../lib/copyTextToClipboard'
import './SiCopyTextButton.css'

export type SiCopyTextButtonProps = {
  text: string
  /** Extra classes on the button */
  className?: string
  title?: string
  /** Shown briefly after a successful copy */
  copiedLabel?: string
  /** Accessible name when not copied */
  ariaLabel?: string
  /** Icon-only success state (e.g. dense layer rows) */
  variant?: 'default' | 'compact'
}

const COPIED_MS = 2000

export function SiCopyTextButton({
  text,
  className = '',
  title = 'Copy to clipboard',
  copiedLabel = 'Copied',
  ariaLabel = 'Copy text',
  variant = 'default',
}: SiCopyTextButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const ok = await copyTextToClipboard(text)
      if (!ok) return
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS)
    },
    [text],
  )

  return (
    <button
      type="button"
      className={`si-copy-text-btn si-copy-text-btn--${variant}${
        copied ? ' si-copy-text-btn--done' : ''
      }${className ? ` ${className}` : ''}`}
      title={copied ? copiedLabel : title}
      aria-label={copied ? copiedLabel : ariaLabel}
      onClick={onClick}
    >
      <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} aria-hidden />
      {copied && variant === 'default' ? (
        <span className="si-copy-text-btn__label">{copiedLabel}</span>
      ) : null}
    </button>
  )
}
