import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildGeoQuestionEditSuggestions } from '../../../lib/geoQuestionEditSuggestions'
import type { GeoExplorerCssPrefix } from './GeoExplorerGeminiChatBody'
import { SiCopyTextButton } from './SiCopyTextButton'

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

export type GeoAiEditQuestionToolProps = {
  cssPrefix: GeoExplorerCssPrefix
  messageId: string
  originalText: string
  onCommit: (next: string) => void
  onUseInComposer?: (text: string) => void
  suggestLayers?: string[]
  suggestFields?: string[]
  suggestNumericFields?: string[]
}

export function GeoAiEditQuestionTool(props: GeoAiEditQuestionToolProps) {
  const {
    cssPrefix,
    messageId,
    originalText,
    onCommit,
    onUseInComposer,
    suggestLayers = [],
    suggestFields = [],
    suggestNumericFields = [],
  } = props

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(originalText)
  const [undoStack, setUndoStack] = useState<string[]>([])

  useEffect(() => {
    if (!open) setDraft(originalText)
  }, [originalText, open, messageId])

  const suggestions = useMemo(
    () =>
      buildGeoQuestionEditSuggestions(draft || originalText, {
        layers: suggestLayers,
        fields: suggestFields,
        numericFields: suggestNumericFields,
      }),
    [draft, originalText, suggestLayers, suggestFields, suggestNumericFields],
  )

  const combinedSuggestions = useMemo(() => {
    const ctxLine =
      suggestLayers.length || suggestFields.length
        ? [
            ...(suggestLayers.slice(0, 1).map(l => `Focus layer "${l}" for this question.`)),
            ...(suggestFields.slice(0, 1).map(f => `Include field ${f} in the analysis.`)),
          ]
        : []
    const merged = [...suggestions, ...ctxLine]
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of merged) {
      const k = s.trim().toLowerCase()
      if (!seen.has(k)) {
        seen.add(k)
        out.push(s)
      }
    }
    return out.slice(0, 8)
  }, [suggestions, suggestLayers, suggestFields])

  const applySuggestion = useCallback((s: string) => {
    setUndoStack(st => [...st, draft])
    setDraft(s)
  }, [draft])

  const undoSuggestion = useCallback(() => {
    setUndoStack(st => {
      if (st.length === 0) return st
      const prev = st[st.length - 1]
      setDraft(prev)
      return st.slice(0, -1)
    })
  }, [])

  const resetToCommitted = useCallback(() => {
    setDraft(originalText)
    setUndoStack([])
  }, [originalText])

  const handleCancel = useCallback(() => {
    setDraft(originalText)
    setUndoStack([])
    setOpen(false)
  }, [originalText])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleCancel])

  const handleSave = useCallback(() => {
    const t = draft.trim()
    if (!t) return
    onCommit(t)
    setOpen(false)
    setUndoStack([])
  }, [draft, onCommit])

  if (!originalText.trim()) {
    return null
  }

  return (
    <div className={pfx(cssPrefix, 'edit-q-wrap')}>
      <div className={pfx(cssPrefix, 'edit-q-head')}>
        {!open ? (
          <p className={pfx(cssPrefix, 'bubble-text')}>{originalText}</p>
        ) : (
          <div className={pfx(cssPrefix, 'edit-q-editor')} role="region" aria-label="Edit question">
            <label className={pfx(cssPrefix, 'edit-q-label')} htmlFor={`${cssPrefix}-edit-q-${messageId}`}>
              Edit · Live preview
            </label>
            <textarea
              id={`${cssPrefix}-edit-q-${messageId}`}
              className={pfx(cssPrefix, 'edit-q-textarea')}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter' || e.shiftKey) return
                e.preventDefault();
                handleSave();
              }}
              rows={Math.min(8, Math.max(3, String(draft).split(/\r?\n/).length))}
              spellCheck
            />
            {combinedSuggestions.length > 0 ? (
              <div className={pfx(cssPrefix, 'edit-q-suggestions')}>
                <span className={pfx(cssPrefix, 'edit-q-suggestions-label')}>Suggestions</span>
                <div className={pfx(cssPrefix, 'edit-q-chip-row')}>
                  {combinedSuggestions.map((s, i) => (
                    <button
                      key={`${i}-${s.slice(0, 48)}`}
                      type="button"
                      className={pfx(cssPrefix, 'edit-q-chip')}
                      onClick={() => applySuggestion(s)}
                    >
                      {s.length > 96 ? `${s.slice(0, 94)}…` : s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={pfx(cssPrefix, 'edit-q-actions')}>
              <button type="button" className={pfx(cssPrefix, 'edit-q-btn')} onClick={resetToCommitted}>
                Reset
              </button>
              <button
                type="button"
                className={pfx(cssPrefix, 'edit-q-btn')}
                onClick={undoSuggestion}
                disabled={undoStack.length === 0}
              >
                Undo
              </button>
              <button type="button" className={pfx(cssPrefix, 'edit-q-btn')} onClick={handleCancel}>
                Cancel
              </button>
              <button type="button" className={pfx(cssPrefix, 'edit-q-btn-primary')} onClick={handleSave}>
                Save
              </button>
              {onUseInComposer ? (
                <button
                  type="button"
                  className={pfx(cssPrefix, 'edit-q-btn-secondary')}
                  onClick={() => {
                    onUseInComposer(draft.trim())
                    setOpen(false)
                  }}
                >
                  Use in composer
                </button>
              ) : null}
            </div>
          </div>
        )}
        {!open ? (
          <div className={pfx(cssPrefix, 'edit-q-tools')}>
            <SiCopyTextButton
              text={originalText}
              className={pfx(cssPrefix, 'edit-q-copy-btn')}
              title="Copy question"
              ariaLabel="Copy question text"
              variant="compact"
            />
            <button
              type="button"
              className={pfx(cssPrefix, 'edit-q-icon-btn')}
              aria-label="Edit question"
              title="Edit question"
              onClick={() => {
                setDraft(originalText)
                setUndoStack([])
                setOpen(true)
              }}
            >
              <i className="fa-solid fa-pen" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
