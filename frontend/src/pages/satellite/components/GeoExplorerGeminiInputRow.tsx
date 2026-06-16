import type { ChangeEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGeoAiSpeechRecognition } from '../../../hooks/useGeoAiSpeechRecognition'
import type { GeoExplorerCssPrefix } from './GeoExplorerGeminiChatBody'

export type GeoExplorerGeminiInputRowProps = {
  cssPrefix: GeoExplorerCssPrefix
  draft: string
  onDraftChange: (next: string) => void
  /** Send using current draft + attachments, or pass final voice text (skips stale draft read). */
  onSend: (voiceOverrideText?: string) => void
  busy: boolean
  /** When `showAttach` is true, image attach is shown and pending image gates Send. */
  pendingImage: { mime: string; base64: string } | null
  fileInputRef?: RefObject<HTMLInputElement | null>
  onAttachChange?: (e: ChangeEvent<HTMLInputElement>) => void
  textareaAriaLabel: string
  showAttach?: boolean
  enableVoice?: boolean
  /** Overrides default Geo AI placeholder (Claude / DeepSeek prompts). */
  placeholder?: string
  /** Dynamic context for smart suggestions/help words. */
  availableFields?: string[]
  availableNumericFields?: string[]
  availableLayers?: string[]
  availableGeometryOps?: string[]
  smartSuggestionsEnabled?: boolean
}

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

const RECENT_LS_KEY = 'geo_ai_suggestions_recent_v1'
const MAX_VISIBLE = 7
const PROGRESSIVE_MS = 380

type RankedChip = {
  key: string
  /** Shown in UI */
  label: string
  /** Inserted into draft */
  insert: string
  tier: 'recent' | 'context' | 'op' | 'spatial' | 'help'
  score: number
}

function readRecentScores(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECENT_LS_KEY) : null
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function bumpRecent(insert: string) {
  try {
    const key = RECENT_LS_KEY
    const rec = readRecentScores()
    rec[insert] = (rec[insert] ?? 0) + 1
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
}

function normalizeChipKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

type OptimizePack = {
  refined: string
  stats: string[]
  math: string[]
  spatial: string[]
}

function buildOptimizePack(
  draft: string,
  layers: string[],
  fields: string[],
  numericFields: string[],
  geometryOps: string[],
): OptimizePack {
  const layer = layers[0]
  const num = numericFields[0] ?? fields.find(f => /\b(area|total|count|sum|length|width|height|amount|price|qty)\b/i.test(f)) ?? fields[0] ?? 'NumericField'
  const cat =
    fields.find(f => f !== num && !numericFields.includes(f)) ?? fields.find(f => f !== num) ?? 'Farm_Code'
  const layerPhrase = layer ? ` on layer "${layer}"` : ''

  const stats = [
    `Count records${layerPhrase}`,
    `SUM(${num})${layerPhrase}`,
    `Average ${num}${layerPhrase}`,
    `Group by ${cat}`,
    `Min ${num} and Max ${num}${layerPhrase}`,
  ]
  const math = [`${num} < 3000`, `${num} > 100`, `${cat} = MH101`, `${num} >= 500 and ${num} <= 2000`]
  const spatial = geometryOps.slice(0, 5).map(op => `${op}: describe boundary then filter attributes`)

  const d = draft.trim()
  let refined = ''
  if (!d) {
    refined = `SUM(${num}) where ${num} < 3000${layerPhrase}`
  } else if (/sum|total|مجموع|اجمالي/i.test(d) && !/\b(where|>|<|>=|<=|=)\b/i.test(d)) {
    refined = `${d.trim()} where ${num} < 3000`
  } else if (/count|عدد/i.test(d) && layer) {
    refined = `Count records${layerPhrase}`
  } else if (/group|تجميع/i.test(d)) {
    refined = `Group by ${cat}${layerPhrase}`
  } else {
    refined = `${d.trim()} — specify layer (${layer ?? '…'}), field (${num}), and comparison for sharper stats`
  }

  return { refined, stats, math, spatial }
}

function relevanceBonus(q: string, label: string): number {
  if (!q) return 0
  const L = label.toLowerCase()
  const Q = q.toLowerCase()
  if (!Q) return 0
  if (L.startsWith(Q)) return 22
  if (L.includes(Q)) return 12
  let bonus = 0
  for (const tok of Q.split(/\s+/).filter(t => t.length > 1)) {
    if (L.includes(tok)) bonus += 6
  }
  return bonus
}

/**
 * Geo AI / Geo Explorer composer: textarea for text, floating voice/lang dock beside it, attach + send.
 */
export function GeoExplorerGeminiInputRow(props: GeoExplorerGeminiInputRowProps) {
  const {
    cssPrefix,
    draft,
    onDraftChange,
    onSend,
    busy,
    pendingImage,
    fileInputRef,
    onAttachChange,
    textareaAriaLabel,
    showAttach = true,
    enableVoice = true,
    placeholder = 'Describe a place, ask for directions, or plan a trip…',
    availableFields = [],
    availableNumericFields = [],
    availableLayers = [],
    availableGeometryOps = ['Within', 'Intersects', 'Buffer', 'Contains'],
    smartSuggestionsEnabled = true,
  } = props

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const optimizeWrapRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [composerFocused, setComposerFocused] = useState(false)
  const [progressiveCap, setProgressiveCap] = useState(4)
  const [chipFocusIdx, setChipFocusIdx] = useState<number | null>(null)
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  const voice = useGeoAiSpeechRecognition({
    disabled: busy || !enableVoice,
    onFinalTranscript: text => {
      const t = text.trim()
      if (!t) return
      onDraftChange(t)
      onSend(t)
    },
  })

  const onMicClick = () => {
    if (voice.listening) voice.stopListening()
    else {
      voice.clearError()
      voice.startListening()
    }
  }

  const speechLangArabic = voice.lang.toLowerCase().startsWith('ar')
  const voiceUiState: 'idle' | 'listening' | 'capturing' =
    !enableVoice || busy ? 'idle' : voice.listening ? (voice.interimTranscript.trim() ? 'capturing' : 'listening') : 'idle'

  const interimPreview =
    voice.interimTranscript.trim().length > 56 ? `${voice.interimTranscript.trim().slice(0, 54)}…` : voice.interimTranscript.trim()

  const qRaw = draft.trim()
  const q = qRaw.toLowerCase()

  const recentMap = useMemo(() => readRecentScores(), [draft])

  const rankedChips = useMemo((): RankedChip[] => {
    const dedupe = new Map<string, RankedChip>()
    const push = (c: RankedChip) => {
      const k = normalizeChipKey(c.key)
      const prev = dedupe.get(k)
      if (!prev || c.score > prev.score) dedupe.set(k, { ...c, key: k })
    }

    const recentBoost = (insert: string, base: number, tier: RankedChip['tier']) => {
      const uses = recentMap[insert] ?? recentMap[insert.replace(/^Field:\s*/i, '').trim()] ?? 0
      const rb = uses > 0 ? Math.min(18, 5 + Math.log10(uses + 1) * 8) : 0
      return base + rb + relevanceBonus(qRaw, insert) + relevanceBonus(qRaw, insert.replace(/^Field:\s*/i, ''))
    }

    const calcIntent =
      /احسب|calculate|sum|average|mean|count|min|max|statistics|stat\b|group\s*by|مجموع|متوسط|عدد|إحصاء|احص/i.test(qRaw)
    const filterIntent =
      /حدد|select|where|filter|>|<|=|!|within|intersects|contains|buffer|اكبر|اصغر|أكبر|أصغر/i.test(qRaw)
    const focusedOrTyping = composerFocused || qRaw.length > 0

    if (!focusedOrTyping && !qRaw) {
      return []
    }

    const topRecent = Object.entries(recentMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([insert]) => ({
        key: insert,
        label: insert.length > 28 ? `${insert.slice(0, 26)}…` : insert,
        insert,
        tier: 'recent' as const,
        score: recentBoost(insert, 80, 'recent'),
      }))
    for (const c of topRecent) push(c)

    if (availableLayers.length && (qRaw.length >= 2 || calcIntent || filterIntent)) {
      const layers =
        qRaw.length >= 2
          ? availableLayers.filter(l => l.toLowerCase().includes(q)).slice(0, 4)
          : availableLayers.slice(0, 2)
      for (const l of layers) {
        const insert = l.includes(' ') ? `Layer: "${l}"` : `Layer: ${l}`
        push({
          key: insert,
          label: `Layer · ${l.length > 22 ? `${l.slice(0, 20)}…` : l}`,
          insert,
          tier: 'context',
          score: recentBoost(insert, 72, 'context'),
        })
      }
    }

    if (availableFields.length && qRaw.length >= 2) {
      const fields = availableFields.filter(f => f.toLowerCase().includes(q)).slice(0, 4)
      for (const f of fields) {
        const insert = `Field: ${f}`
        push({
          key: insert,
          label: `Field · ${f.length > 22 ? `${f.slice(0, 20)}…` : f}`,
          insert,
          tier: 'context',
          score: recentBoost(insert, 68, 'context'),
        })
      }
    }

    if (availableNumericFields.length && (calcIntent || qRaw.length >= 2)) {
      const nums =
        qRaw.length >= 2
          ? availableNumericFields.filter(f => f.toLowerCase().includes(q)).slice(0, 3)
          : availableNumericFields.slice(0, 2)
      for (const f of nums) {
        const insert = `Numeric: ${f}`
        push({
          key: insert,
          label: `# ${f.length > 18 ? `${f.slice(0, 16)}…` : f}`,
          insert,
          tier: 'context',
          score: recentBoost(insert, 62, 'context'),
        })
      }
    }

    if (calcIntent || (composerFocused && qRaw.length === 0 && !filterIntent)) {
      const aggAll = ['Sum', 'Average', 'Count', 'Min', 'Max', 'Group By']
      const aggPick = calcIntent || qRaw.length >= 2 ? aggAll : aggAll.slice(0, 4)
      for (const op of aggPick) {
        push({
          key: op,
          label: op,
          insert: op,
          tier: 'op',
          score: recentBoost(op, calcIntent ? 58 : 42, 'op'),
        })
      }
    }

    if (filterIntent || (composerFocused && qRaw.length === 0 && !calcIntent)) {
      const cmpAll = ['>', '<', '>=', '<=', '=', '!=']
      const cmpPick = qRaw.length >= 2 || filterIntent ? cmpAll : cmpAll.slice(0, 4)
      for (const op of cmpPick) {
        push({
          key: op,
          label: op,
          insert: op,
          tier: 'op',
          score: recentBoost(op, filterIntent ? 54 : 34, 'op'),
        })
      }
      const geoCap = qRaw.length >= 2 || filterIntent ? availableGeometryOps.length : Math.min(2, availableGeometryOps.length)
      for (const g of availableGeometryOps.slice(0, geoCap)) {
        push({
          key: g,
          label: g,
          insert: g,
          tier: 'spatial',
          score: recentBoost(g, filterIntent ? 52 : 30, 'spatial'),
        })
      }
    }

    if (
      calcIntent ||
      /group|summary|calculate|field|range|filter|records/i.test(qRaw) ||
      (composerFocused && qRaw.length === 0)
    ) {
      const qa: Array<[string, number]> = [
        ['Group by summary', 46],
        ['Calculate field preview', 44],
        ['Count records', 48],
        ['Range filter', 40],
      ]
      for (const [insert, base] of qa) {
        if (!calcIntent && !filterIntent && qRaw.length > 0 && !/group|calculate|count|range|filter/i.test(qRaw))
          continue
        push({
          key: insert,
          label: insert.replace(/\spreview$/i, '').trim(),
          insert,
          tier: 'help',
          score: recentBoost(insert, base, 'help'),
        })
      }
    }

    if (composerFocused && qRaw.length === 0 && dedupe.size < 4) {
      for (const h of ['select where', 'within', 'intersects']) {
        push({
          key: h,
          label: h,
          insert: h,
          tier: 'help',
          score: recentBoost(h, 36, 'help'),
        })
      }
    }

    return [...dedupe.values()].sort((a, b) => b.score - a.score)
  }, [
    q,
    qRaw,
    composerFocused,
    recentMap,
    availableFields,
    availableNumericFields,
    availableLayers,
    availableGeometryOps,
  ])

  const visibleChips = useMemo(() => rankedChips.slice(0, Math.min(progressiveCap, MAX_VISIBLE)), [rankedChips, progressiveCap])

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    if (reduced) {
      setProgressiveCap(MAX_VISIBLE)
      return
    }
    setProgressiveCap(4)
    const t = window.setTimeout(() => setProgressiveCap(MAX_VISIBLE), PROGRESSIVE_MS)
    return () => window.clearTimeout(t)
  }, [qRaw, composerFocused])

  useEffect(() => {
    chipRefs.current = []
  }, [visibleChips.length])

  const showSuggestPanel =
    smartSuggestionsEnabled && !busy && (composerFocused || qRaw.length > 0) && visibleChips.length > 0

  const showOptimizeChrome =
    smartSuggestionsEnabled && !busy && (composerFocused || qRaw.length > 0)

  const optimizePack = useMemo(
    () => buildOptimizePack(qRaw, availableLayers, availableFields, availableNumericFields, availableGeometryOps),
    [qRaw, availableLayers, availableFields, availableNumericFields, availableGeometryOps],
  )

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxPx =
      typeof window !== 'undefined' ? Math.min(340, Math.max(200, Math.round(window.innerHeight * 0.42))) : 280
    const h = Math.min(Math.max(el.scrollHeight, 44), maxPx)
    el.style.height = `${h}px`
  }, [])

  useEffect(() => {
    syncTextareaHeight()
  }, [draft, busy, syncTextareaHeight])

  useEffect(() => {
    const onResize = () => syncTextareaHeight()
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [syncTextareaHeight])

  useEffect(() => {
    if (!optimizeOpen) return
    const onDocMouseDown = (ev: Event) => {
      const el = optimizeWrapRef.current
      const t = ev.target
      if (!el || !(t instanceof Node) || el.contains(t)) return
      setOptimizeOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [optimizeOpen])

  useEffect(() => {
    if (!showSuggestPanel) setChipFocusIdx(null)
    else if (chipFocusIdx != null && chipFocusIdx >= visibleChips.length) setChipFocusIdx(visibleChips.length - 1)
  }, [showSuggestPanel, visibleChips.length, chipFocusIdx])

  const applySuggestion = useCallback(
    (insert: string) => {
      const clean = insert.replace(/^Field:\s*/i, '').replace(/^Layer:\s*/i, '').replace(/^Numeric:\s*/i, '')
      const next = draft.trim() ? `${draft} ${clean}` : clean
      onDraftChange(next)
      bumpRecent(clean)
      setChipFocusIdx(null)
      textareaRef.current?.focus()
    },
    [draft, onDraftChange],
  )

  const applyReplaceDraft = useCallback(
    (next: string) => {
      const t = next.trim()
      if (!t) return
      onDraftChange(t)
      textareaRef.current?.focus()
    },
    [onDraftChange],
  )

  const toggleOptimize = useCallback((ev: ReactMouseEvent) => {
    ev.preventDefault()
    setOptimizeOpen(o => !o)
  }, [])

  useEffect(() => {
    if (!optimizeOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOptimizeOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [optimizeOpen])

  const renderOptimizeTrigger = () => (
    <button
      type="button"
      className={`${pfx(cssPrefix, 'optimize-input-btn')} ${optimizeOpen ? pfx(cssPrefix, 'optimize-input-btn--open') : ''}`}
      onMouseDown={ev => ev.preventDefault()}
      onClick={toggleOptimize}
      aria-expanded={optimizeOpen}
      aria-haspopup="dialog"
      aria-label="Optimize Your Input — templates for layers and fields"
      title="Optimize Your Input"
    >
      <i className="fa-solid fa-sparkles" aria-hidden />
      <span className={pfx(cssPrefix, 'optimize-input-btn-label')}>Optimize</span>
    </button>
  )

  const insertFromOptimize = useCallback(
    (text: string, mode: 'append' | 'replace') => {
      const t = text.trim()
      if (!t) return
      if (mode === 'replace') applyReplaceDraft(t)
      else applySuggestion(t)
      setOptimizeOpen(false)
    },
    [applyReplaceDraft, applySuggestion],
  )

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestPanel || !visibleChips.length) return

    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1
      const chip = visibleChips[idx]
      if (chip) {
        e.preventDefault()
        applySuggestion(chip.insert)
      }
      return
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      e.preventDefault()
      setChipFocusIdx(0)
      requestAnimationFrame(() => chipRefs.current[0]?.focus())
    }
  }

  const onChipKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(idx + 1, visibleChips.length - 1)
      setChipFocusIdx(next)
      chipRefs.current[next]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx <= 0) {
        setChipFocusIdx(null)
        textareaRef.current?.focus()
      } else {
        const prev = idx - 1
        setChipFocusIdx(prev)
        chipRefs.current[prev]?.focus()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setChipFocusIdx(null)
      textareaRef.current?.focus()
    }
  }

  const optimizePopover = optimizeOpen ? (
    <div
      className={pfx(cssPrefix, 'optimize-popover')}
      role="dialog"
      aria-label="Optimize Your Input"
      onMouseDown={ev => ev.preventDefault()}
    >
      <div className={pfx(cssPrefix, 'optimize-popover-head')}>
        <span className={pfx(cssPrefix, 'optimize-popover-title')}>Optimize Your Input</span>
        <button
          type="button"
          className={pfx(cssPrefix, 'optimize-popover-close')}
          aria-label="Close"
          onClick={() => setOptimizeOpen(false)}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      <p className={pfx(cssPrefix, 'optimize-popover-lead')}>
        Templates use your loaded layers and fields. Tap to append; use “Use wording” to replace the draft.
      </p>

      <div className={pfx(cssPrefix, 'optimize-refined')}>
        <span className={pfx(cssPrefix, 'optimize-refined-label')}>Suggested wording</span>
        <p className={pfx(cssPrefix, 'optimize-refined-text')}>{optimizePack.refined}</p>
        <div className={pfx(cssPrefix, 'optimize-refined-actions')}>
          <button type="button" className={pfx(cssPrefix, 'optimize-chip-primary')} onClick={() => insertFromOptimize(optimizePack.refined, 'replace')}>
            Use wording
          </button>
          <button type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(optimizePack.refined, 'append')}>
            Append
          </button>
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-section')}>
        <div className={pfx(cssPrefix, 'optimize-section-title')}>
          Stats Ops <span className={pfx(cssPrefix, 'optimize-section-sub')}>(إحصائياً)</span>
        </div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.stats.map(s => (
            <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
              {s.length > 52 ? `${s.slice(0, 50)}…` : s}
            </button>
          ))}
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-section')}>
        <div className={pfx(cssPrefix, 'optimize-section-title')}>
          Math Ops <span className={pfx(cssPrefix, 'optimize-section-sub')}>(رياضياً)</span>
        </div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.math.map(s => (
            <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-section')}>
        <div className={pfx(cssPrefix, 'optimize-section-title')}>
          Spatial Ops <span className={pfx(cssPrefix, 'optimize-section-sub')}>(مكانياً)</span>
        </div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.spatial.map(s => (
            <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
              {s.length > 56 ? `${s.slice(0, 54)}…` : s}
            </button>
          ))}
        </div>
      </div>

      <p className={pfx(cssPrefix, 'optimize-context')}>
        Layers: {availableLayers.length ? availableLayers.slice(0, 4).join(', ') : '—'}
        {availableLayers.length > 4 ? '…' : ''} · Fields: {availableFields.length} · Numeric: {availableNumericFields.length}
      </p>
    </div>
  ) : null

  return (
    <>
      {showOptimizeChrome ? (
        <div ref={optimizeWrapRef} className={pfx(cssPrefix, 'optimize-wrap')}>
          {optimizePopover}
          {showSuggestPanel ? (
            <div className={pfx(cssPrefix, 'smart-suggest-panel')} role="region" aria-label="Smart suggestions">
              <div className={pfx(cssPrefix, 'smart-suggest-toolbar')}>
                <span className={pfx(cssPrefix, 'smart-suggest-title')}>Smart suggestions</span>
                {renderOptimizeTrigger()}
                <span className={pfx(cssPrefix, 'smart-suggest-toolbar-spacer')} aria-hidden />
                <span className={pfx(cssPrefix, 'smart-suggest-meta')}>
                  {visibleChips.length}/{Math.min(rankedChips.length, MAX_VISIBLE)} · Alt+1–9
                </span>
              </div>
              <div className={pfx(cssPrefix, 'smart-suggest-scroll')} role="listbox" aria-label="Suggestion chips">
                {visibleChips.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    role="option"
                    ref={el => {
                      chipRefs.current[i] = el
                    }}
                    tabIndex={chipFocusIdx === i ? 0 : -1}
                    className={`${pfx(cssPrefix, 'smart-chip')} ${pfx(cssPrefix, `smart-chip--${c.tier}`)}`}
                    title={`${c.insert} — Alt+${i + 1}`}
                    onMouseDown={ev => ev.preventDefault()}
                    onClick={() => applySuggestion(c.insert)}
                    onKeyDown={e => onChipKeyDown(e, i)}
                  >
                    <span className={pfx(cssPrefix, 'smart-chip-label')}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={pfx(cssPrefix, 'optimize-strip')} role="region" aria-label="Input assist">
              <span className={pfx(cssPrefix, 'optimize-strip-label')}>Assist</span>
              {renderOptimizeTrigger()}
            </div>
          )}
        </div>
      ) : null}
      <div className={pfx(cssPrefix, 'composer-surface')} data-voice-state={enableVoice ? voiceUiState : undefined}>
        <div className={pfx(cssPrefix, 'composer-field')}>
          <textarea
            ref={textareaRef}
            className={pfx(cssPrefix, 'input')}
            rows={1}
            value={draft}
            onChange={e => {
              onDraftChange(e.target.value)
              requestAnimationFrame(() => syncTextareaHeight())
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => {
              window.setTimeout(() => {
                const a = document.activeElement
                if (a && a.closest?.(`.${pfx(cssPrefix, 'smart-suggest-panel')}`)) return
                if (a && a.closest?.(`.${pfx(cssPrefix, 'optimize-wrap')}`)) return
                setComposerFocused(false)
              }, 0)
            }}
            onKeyDown={e => {
              onTextareaKeyDown(e)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder={placeholder}
            aria-label={textareaAriaLabel}
            disabled={busy}
          />
          {enableVoice && (voiceUiState === 'listening' || voiceUiState === 'capturing') ? (
            <div className={pfx(cssPrefix, 'composer-voice-hint')} aria-live="polite">
              {voiceUiState === 'capturing' && interimPreview ? (
                <>
                  <span className={pfx(cssPrefix, 'composer-voice-dot')} aria-hidden />
                  <span className={pfx(cssPrefix, 'composer-voice-hint-text')}>{interimPreview}</span>
                </>
              ) : (
                <>
                  <span className={pfx(cssPrefix, 'composer-voice-dot')} aria-hidden />
                  <span className={pfx(cssPrefix, 'composer-voice-hint-text')}>
                    {voiceUiState === 'capturing' ? 'Capturing…' : 'Listening…'}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>

        <footer className={pfx(cssPrefix, 'composer-toolbar')} aria-label="Composer actions">
          {enableVoice ? (
            <div className={pfx(cssPrefix, 'composer-toolbar-start')}>
              <button
                type="button"
                className={`${pfx(cssPrefix, 'composer-icon-btn')} ${voice.listening ? `${pfx(cssPrefix, 'composer-icon-btn--active')}` : ''} ${
                  voiceUiState === 'capturing' ? `${pfx(cssPrefix, 'composer-icon-btn--live')}` : ''
                } ${!voice.supported ? `${pfx(cssPrefix, 'composer-icon-btn--muted')}` : ''}`}
                onClick={onMicClick}
                disabled={busy}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
                title={
                  voice.supported
                    ? `${voice.listening ? 'Stop' : 'Start'} voice (${speechLangArabic ? 'Arabic' : 'English'})`
                    : 'Voice not supported in this browser'
                }
              >
                <i className="fa-solid fa-microphone" aria-hidden />
              </button>
              <button
                type="button"
                className={`${pfx(cssPrefix, 'composer-icon-btn')} ${pfx(cssPrefix, 'composer-icon-btn--lang')}`}
                onClick={() => {
                  voice.cycleLang()
                  voice.clearError()
                }}
                disabled={busy}
                aria-label={`Speech language: ${speechLangArabic ? 'Arabic' : 'English'}. Switch.`}
                title={`${speechLangArabic ? 'Arabic' : 'English'} — click to toggle`}
              >
                <i className="fa-solid fa-language" aria-hidden />
                <span className={pfx(cssPrefix, 'composer-lang-badge')}>{speechLangArabic ? 'AR' : 'EN'}</span>
              </button>
            </div>
          ) : null}
          <span className={pfx(cssPrefix, 'composer-toolbar-spacer')} />
          {showAttach && fileInputRef && onAttachChange ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className={pfx(cssPrefix, 'file-input')}
                accept="image/*"
                onChange={onAttachChange}
                aria-hidden
                tabIndex={-1}
              />
              <button
                type="button"
                className={pfx(cssPrefix, 'composer-icon-btn')}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Attach image"
                title="Attach image"
              >
                <i className="fa-solid fa-paperclip" aria-hidden />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`${pfx(cssPrefix, 'composer-icon-btn')} ${pfx(cssPrefix, 'composer-icon-btn--send')}`}
            onClick={() => onSend()}
            disabled={busy || (!draft.trim() && !(showAttach && pendingImage))}
            aria-label="Send message"
            title="Send"
          >
            <i className="fa-solid fa-paper-plane" aria-hidden />
          </button>
        </footer>

        {voice.error ? <p className={pfx(cssPrefix, 'voice-error')}>{voice.error}</p> : null}
      </div>
    </>
  )
}
