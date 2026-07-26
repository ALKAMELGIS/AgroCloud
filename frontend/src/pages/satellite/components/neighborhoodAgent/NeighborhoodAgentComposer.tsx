import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { useGeoAiSpeechRecognition } from '../../../../hooks/useGeoAiSpeechRecognition'
import { GEO_AI_ATTACH_ACCEPT, geoAiAttachIsImage } from '../../../../lib/geoAiAttachFile'

export type NeighborhoodAgentComposerProps = {
  draft: string
  onDraftChange: (next: string) => void
  /** Optional voice override so send uses the fresh transcript, not a stale draft. */
  onSend: (voiceOverrideText?: string) => void
  busy: boolean
  sessionLabel?: string | null
  placeholder?: string
  showAttach?: boolean
  enableVoice?: boolean
  pendingImage?: { mime: string; base64: string; name?: string } | null
  fileInputRef?: RefObject<HTMLInputElement | null>
  onAttachChange?: (e: ChangeEvent<HTMLInputElement>) => void
  onClearPendingImage?: () => void
  footerNote?: string
}

/**
 * Compact Neighborhood Agent composer — attach, voice, input, send.
 */
export function NeighborhoodAgentComposer({
  draft,
  onDraftChange,
  onSend,
  busy,
  placeholder = 'Ask AI anything',
  showAttach = true,
  enableVoice = true,
  pendingImage = null,
  fileInputRef,
  onAttachChange,
  onClearPendingImage,
  footerNote,
}: NeighborhoodAgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const internalFileRef = useRef<HTMLInputElement | null>(null)
  const attachInputRef = fileInputRef ?? internalFileRef
  const attachInputId = useId()
  const attachEnabled = showAttach && !!onAttachChange
  const canSend = !busy && (!!draft.trim() || !!(attachEnabled && pendingImage))
  const attachDisabled = busy || !onAttachChange

  const voice = useGeoAiSpeechRecognition({
    disabled: busy || !enableVoice,
    onFinalTranscript: text => {
      const t = text.trim()
      if (!t) return
      onDraftChange(t)
      onSend(t)
    },
  })

  const syncHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(56, Math.max(22, el.scrollHeight))}px`
  }, [])

  useEffect(() => {
    syncHeight()
  }, [draft, syncHeight])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }

  const onMicClick = () => {
    if (!enableVoice) return
    if (voice.listening) voice.stopListening()
    else {
      voice.clearError()
      voice.startListening()
    }
  }

  const speechLangArabic = voice.lang.toLowerCase().startsWith('ar')
  const voiceUiState: 'idle' | 'listening' | 'capturing' =
    !enableVoice || busy
      ? 'idle'
      : voice.listening
        ? voice.interimTranscript.trim()
          ? 'capturing'
          : 'listening'
        : 'idle'

  const interimPreview =
    voice.interimTranscript.trim().length > 48
      ? `${voice.interimTranscript.trim().slice(0, 46)}…`
      : voice.interimTranscript.trim()

  return (
    <div className="nac-composer">
      <div className="nac-composer-surface" data-voice-state={enableVoice ? voiceUiState : undefined}>
        {pendingImage ? (
          <div className="nac-composer-pending">
            <i
              className={
                geoAiAttachIsImage(pendingImage.mime) ? 'fa-solid fa-image' : 'fa-solid fa-paperclip'
              }
              aria-hidden
            />
            <span className="nac-composer-pending-name" title={pendingImage.name || pendingImage.mime}>
              {pendingImage.name || (geoAiAttachIsImage(pendingImage.mime) ? 'Image ready' : 'File ready')}
            </span>
            {onClearPendingImage ? (
              <button type="button" className="nac-composer-pending-clear" onClick={onClearPendingImage}>
                Remove
              </button>
            ) : null}
          </div>
        ) : null}

        {enableVoice && (voiceUiState === 'listening' || voiceUiState === 'capturing') ? (
          <div className="nac-composer-voice-hint" aria-live="polite">
            <span className="nac-composer-voice-dot" aria-hidden />
            <span className="nac-composer-voice-hint-text">
              {voiceUiState === 'capturing' && interimPreview
                ? interimPreview
                : voiceUiState === 'capturing'
                  ? 'Capturing…'
                  : 'Listening…'}
            </span>
          </div>
        ) : null}

        {voice.error ? (
          <p className="nac-composer-voice-error" role="alert">
            {voice.error}
          </p>
        ) : null}

        <div className="nac-composer-row">
          <div className="nac-composer-toolbar-start">
            <input
              id={attachInputId}
              ref={attachInputRef}
              type="file"
              className="nac-composer-file-input"
              accept={GEO_AI_ATTACH_ACCEPT}
              onChange={onAttachChange}
              tabIndex={-1}
              aria-hidden
              /* Keep enabled for label→picker; busy is blocked on the label only
                 so the UA never paints a gray disabled file-button. */
              disabled={!onAttachChange}
            />
            <label
              htmlFor={attachDisabled ? undefined : attachInputId}
              className={['nac-composer-attach', attachDisabled ? 'nac-composer-attach--disabled' : '']
                .filter(Boolean)
                .join(' ')}
              title="Attach file (images, PDF, text, Office…)"
              aria-label="Attach file"
              aria-disabled={attachDisabled || undefined}
              onClick={e => {
                if (attachDisabled) {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
            >
              <i className="fa-solid fa-paperclip" aria-hidden />
            </label>

            {enableVoice ? (
              <button
                type="button"
                className={[
                  'nac-composer-icon-btn',
                  voice.listening ? 'nac-composer-icon-btn--active' : '',
                  voiceUiState === 'capturing' ? 'nac-composer-icon-btn--live' : '',
                  !voice.supported ? 'nac-composer-icon-btn--muted' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onMicClick}
                disabled={busy || !voice.supported}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop voice input' : 'Record voice'}
                title={
                  voice.supported
                    ? `${voice.listening ? 'Stop' : 'Record'} voice (${speechLangArabic ? 'Arabic' : 'English'})`
                    : 'Voice not supported in this browser'
                }
              >
                <i className={`fa-solid ${voice.listening ? 'fa-stop' : 'fa-microphone'}`} aria-hidden />
              </button>
            ) : null}
          </div>

          <textarea
            ref={textareaRef}
            className="nac-composer-input"
            rows={1}
            value={draft}
            onChange={e => {
              onDraftChange(e.target.value)
              requestAnimationFrame(syncHeight)
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Ask AI anything"
            disabled={busy}
          />

          <button
            type="button"
            className={['nac-composer-send', canSend ? 'nac-composer-send--ready' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSend()}
            disabled={!canSend}
            aria-label="Send message"
            title="Send"
          >
            <i className="fa-solid fa-arrow-up" aria-hidden />
          </button>
        </div>
      </div>
      {footerNote ? <p className="nac-composer-footnote">{footerNote}</p> : null}
    </div>
  )
}
