import React, { useCallback, useEffect, useState } from 'react'
import type { GeoExplorerMapLink, GeoExplorerMessage, GeoExplorerPart } from '../../../../lib/geoExplorerGemini'
import { stripGeoExplorerBubbleDisplayText } from '../../../../lib/geoExplorerGemini'
import { splitTextIntoMarkdownSegments, type GeoMarkdownSegment } from '../../../../lib/geoAiMarkdownTable'
import { sanitizeNeighborhoodAgentReplyText } from '../../../../lib/neighborhoodAgentPlaceIntent'
import {
  liftBulletBreakdownFromText,
  shouldAutoChartNeighborhoodAgentTable,
} from '../../../../lib/neighborhoodAgentStatsViz'
import {
  isWeatherForecastTable,
  isWeatherNowTable,
  liftWeatherNarrativeFromText,
  weatherLiftFromTables,
  type NeighborhoodAgentWeatherLift,
} from '../../../../lib/neighborhoodAgentWeatherViz'
import { type GeoExplorerMapAction } from '../GeoExplorerDynamicTable'
import {
  NeighborhoodAgentCompactTable,
  NeighborhoodAgentStatsChart,
  NeighborhoodAgentWeatherCard,
} from './NeighborhoodAgentStatsChart'

export type NeighborhoodAgentTranscriptProps = {
  messages: GeoExplorerMessage[]
  busy?: boolean
  busyLabel?: string
  error?: string | null
  onTableMapAction?: (action: GeoExplorerMapAction, link: GeoExplorerMapLink) => void
  onTableBatchZoom?: (links: GeoExplorerMapLink[]) => void
  onTableSelectionLinksChange?: (tableId: string, links: GeoExplorerMapLink[]) => void
  mapFocusFeatureKey?: string | null
  onTableQuerySelectApplied?: () => void
  onFocusMap?: (focus: { lng: number; lat: number; label?: string }) => void
  messagesRef?: React.RefObject<HTMLDivElement | null>
  onMessagesScroll?: () => void
  hasOlderMessages?: boolean
  onLoadOlder?: () => void
  /** Save edited user text (truncate + re-run when wired). */
  onSaveEditedUserMessage?: (messageId: string, nextText: string) => void
  /** Put edited text into the composer without re-running. */
  onUseEditedInComposer?: (text: string) => void
}

type AssistantSegment =
  | GeoMarkdownSegment
  | { type: 'weather'; weather: NeighborhoodAgentWeatherLift }

/** Prefer a short trailing heading as the chart/table title when markdown had no title. */
function withInferredTableTitles(segments: AssistantSegment[]): AssistantSegment[] {
  const out: AssistantSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (seg.type !== 'table') {
      out.push(seg)
      continue
    }
    let title = (seg.table.title || '').trim()
    if (!title || title === 'Summary table') {
      const prev = out[out.length - 1]
      if (prev?.type === 'text') {
        const lines = prev.text
          .split(/\r?\n/)
          .map(l => l.replace(/^#+\s*/, '').replace(/\*+/g, '').trim())
          .filter(Boolean)
        const last = lines[lines.length - 1] || ''
        if (last.length >= 3 && last.length <= 72 && !/[.!?…]$/.test(last)) {
          title = last
          const kept = lines.slice(0, -1).join('\n').trim()
          if (kept) out[out.length - 1] = { type: 'text', text: kept }
          else out.pop()
        }
      }
    }
    out.push({
      type: 'table',
      table: title && title !== seg.table.title ? { ...seg.table, title } : seg.table,
    })
  }
  return out
}

function pushTextOrLift(out: AssistantSegment[], rawText: string) {
  const weather = liftWeatherNarrativeFromText(rawText)
  if (weather.currentTable || weather.forecastTable) {
    if (weather.text.trim()) {
      const t = sanitizeNeighborhoodAgentReplyText(weather.text)
      if (t.trim()) out.push({ type: 'text', text: t })
    }
    out.push({ type: 'weather', weather })
    return
  }

  const lifted = liftBulletBreakdownFromText(rawText)
  if (lifted.table) {
    if (lifted.text.trim()) {
      const t = sanitizeNeighborhoodAgentReplyText(lifted.text)
      if (t.trim()) out.push({ type: 'text', text: t })
    }
    out.push({ type: 'table', table: lifted.table })
    return
  }

  const t = sanitizeNeighborhoodAgentReplyText(rawText)
  if (t.trim()) out.push({ type: 'text', text: t })
}

/** Merge markdown Now + Forecast tables into one weather analysis block. */
function coalesceWeatherSegments(segments: AssistantSegment[]): AssistantSegment[] {
  const out: AssistantSegment[] = []
  const used = new Set<number>()

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    const seg = segments[i]!

    if (seg.type === 'table' && (isWeatherNowTable(seg.table) || isWeatherForecastTable(seg.table))) {
      let current = isWeatherNowTable(seg.table) ? seg.table : null
      let forecast = isWeatherForecastTable(seg.table) ? seg.table : null
      used.add(i)

      for (let j = i + 1; j < segments.length && j <= i + 5; j++) {
        if (used.has(j)) continue
        const s = segments[j]!
        if (s.type === 'text') {
          const t = s.text.replace(/^#+\s*/gm, '').trim()
          if (
            /^(weather|now|forecast|summary|map actions)\b/i.test(t) ||
            (t.length < 90 && /^(temp|feels|humidity|wind)\b/i.test(t))
          ) {
            used.add(j)
            continue
          }
          break
        }
        if (s.type === 'table') {
          if (!current && isWeatherNowTable(s.table)) {
            current = s.table
            used.add(j)
            continue
          }
          if (!forecast && isWeatherForecastTable(s.table)) {
            forecast = s.table
            used.add(j)
            continue
          }
        }
        break
      }

      let lead = ''
      const prev = out[out.length - 1]
      if (prev?.type === 'text') {
        const cleaned = prev.text
          .replace(/^#+\s*Summary\s*/gim, '')
          .replace(/\bMap actions\b[\s\S]*$/i, '')
          .replace(/^#+\s*/gm, '')
          .trim()
        if (!cleaned || /^(summary|weather)\s*$/i.test(cleaned)) {
          out.pop()
        } else if (cleaned.length <= 180) {
          lead = cleaned
          out.pop()
        }
      }

      const weather = weatherLiftFromTables(current, forecast, lead)
      if (weather) {
        if (weather.text.trim()) out.push({ type: 'text', text: weather.text })
        out.push({ type: 'weather', weather })
        continue
      }
    }

    if (seg.type === 'text') {
      const t = seg.text
        .replace(/^#+\s*Map actions\s*$/gim, '')
        .replace(/^#+\s*Summary\s*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (!t) continue
      out.push({ type: 'text', text: t })
      continue
    }

    out.push(seg)
  }
  return out
}

function assistantSegments(parts: GeoExplorerPart[]): AssistantSegment[] {
  const out: AssistantSegment[] = []
  for (const p of parts) {
    if (p.type === 'text') {
      const stripped = stripGeoExplorerBubbleDisplayText(p.text)
      for (const seg of splitTextIntoMarkdownSegments(stripped)) {
        if (seg.type === 'text') {
          if (!seg.text.trim()) continue
          pushTextOrLift(out, seg.text)
        } else {
          out.push(seg)
        }
      }
    } else if (p.type === 'dataTable') {
      out.push({ type: 'table', table: p.table })
    }
  }
  return coalesceWeatherSegments(withInferredTableTitles(out))
}

function userText(parts: GeoExplorerPart[]): string {
  return parts
    .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('\n')
    .trim()
}

/** Compact in-bubble edit for a user question. */
function NeighborhoodAgentUserEdit({
  messageId,
  text,
  disabled,
  onSave,
  onUseInComposer,
}: {
  messageId: string
  text: string
  disabled?: boolean
  onSave?: (messageId: string, nextText: string) => void
  onUseInComposer?: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(text)

  useEffect(() => {
    if (!open) setDraft(text)
  }, [text, open, messageId])

  const handleCancel = useCallback(() => {
    setDraft(text)
    setOpen(false)
  }, [text])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleCancel])

  const commit = useCallback(() => {
    const t = draft.trim()
    if (!t || disabled) return
    if (onSave) {
      onSave(messageId, t)
      setOpen(false)
      return
    }
    if (onUseInComposer) {
      onUseInComposer(t)
      setOpen(false)
    }
  }, [draft, disabled, messageId, onSave, onUseInComposer])

  if (!text.trim()) return null

  if (open) {
    return (
      <div className="nac-user-edit" role="region" aria-label="Edit message">
        <textarea
          id={`nac-user-edit-${messageId}`}
          className="nac-user-edit-textarea"
          value={draft}
          disabled={disabled}
          rows={Math.min(5, Math.max(2, draft.split(/\r?\n/).length))}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
          }}
          autoFocus
        />
        <div className="nac-user-edit-actions">
          <button type="button" className="nac-user-edit-btn" onClick={handleCancel} disabled={disabled}>
            Cancel
          </button>
          {onUseInComposer && onSave ? (
            <button
              type="button"
              className="nac-user-edit-btn"
              disabled={disabled || !draft.trim()}
              onClick={() => {
                onUseInComposer(draft.trim())
                setOpen(false)
              }}
            >
              To composer
            </button>
          ) : null}
          <button
            type="button"
            className="nac-user-edit-btn nac-user-edit-btn--primary"
            disabled={disabled || !draft.trim()}
            onClick={commit}
          >
            {onSave ? 'Save & ask' : 'Use'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="nac-user-bubble">
      <p className="nac-msg-text">{text}</p>
      {onSave || onUseInComposer ? (
        <button
          type="button"
          className="nac-user-edit-icon"
          title="Edit message"
          aria-label="Edit message"
          disabled={disabled}
          onClick={() => {
            setDraft(text)
            setOpen(true)
          }}
        >
          <i className="fa-solid fa-pen" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Native Neighborhood Agent transcript — compact bubbles; visual tables/charts/weather cards.
 */
export function NeighborhoodAgentTranscript({
  messages,
  busy = false,
  busyLabel = 'Thinking…',
  error,
  onTableMapAction,
  onTableBatchZoom: _onTableBatchZoom,
  onTableSelectionLinksChange: _onTableSelectionLinksChange,
  mapFocusFeatureKey: _mapFocusFeatureKey,
  onTableQuerySelectApplied: _onTableQuerySelectApplied,
  onFocusMap,
  messagesRef,
  onMessagesScroll,
  hasOlderMessages,
  onLoadOlder,
  onSaveEditedUserMessage,
  onUseEditedInComposer,
}: NeighborhoodAgentTranscriptProps) {
  return (
    <div className="nac-transcript" role="log" aria-live="polite" aria-relevant="additions">
      <div className="nac-transcript-scroll" ref={messagesRef} onScroll={onMessagesScroll}>
        {hasOlderMessages && onLoadOlder ? (
          <button type="button" className="nac-transcript-load-more" onClick={onLoadOlder}>
            Load earlier messages
          </button>
        ) : null}

        {messages.map(msg => {
          const isUser = msg.role === 'user'
          const hasImage = msg.parts.some(p => p.type === 'image')
          const focus = msg.mapFocus

          if (isUser) {
            const text = userText(msg.parts)
            if (!text && !hasImage) return null
            return (
              <div key={msg.id} className="nac-msg nac-msg--user">
                <div className="nac-msg-body">
                  {text ? (
                    <NeighborhoodAgentUserEdit
                      messageId={msg.id}
                      text={text}
                      disabled={busy}
                      onSave={onSaveEditedUserMessage}
                      onUseInComposer={onUseEditedInComposer}
                    />
                  ) : null}
                  {hasImage ? (
                    <p className="nac-msg-meta">
                      <i className="fa-solid fa-paperclip" aria-hidden /> Image attached
                    </p>
                  ) : null}
                </div>
              </div>
            )
          }

          const segments = assistantSegments(msg.parts)
          if (!segments.length) return null

          let tableIdx = 0
          return (
            <div key={msg.id} className="nac-msg nac-msg--assistant">
              <div className="nac-msg-avatar" aria-hidden>
                <i className="fa-solid fa-comments" />
              </div>
              <div className="nac-msg-body">
                {segments.map((seg, i) => {
                  if (seg.type === 'text') {
                    return (
                      <p key={`${msg.id}-t-${i}`} className="nac-msg-text">
                        {seg.text}
                      </p>
                    )
                  }
                  if (seg.type === 'weather') {
                    return (
                      <div key={`${msg.id}-wx-${i}`} className="nac-msg-table">
                        <NeighborhoodAgentWeatherCard
                          location={seg.weather.location}
                          condition={seg.weather.condition}
                          conditionLabel={seg.weather.conditionLabel}
                          currentTable={seg.weather.currentTable}
                          forecastTable={seg.weather.forecastTable}
                        />
                      </div>
                    )
                  }
                  const idx = tableIdx++
                  const showChart = shouldAutoChartNeighborhoodAgentTable(seg.table)
                  const isTemp = /temp|°c|forecast/i.test(
                    `${seg.table.title || ''} ${seg.table.columns.map(c => c.label).join(' ')}`,
                  )
                  return (
                    <div key={`${msg.id}-tbl-${idx}`} className="nac-msg-table">
                      {showChart ? (
                        <NeighborhoodAgentStatsChart
                          table={seg.table}
                          beginAtZero={!isTemp}
                          preferredKind="auto"
                        />
                      ) : null}
                      <NeighborhoodAgentCompactTable
                        table={seg.table}
                        onMapAction={onTableMapAction}
                      />
                    </div>
                  )
                })}
                {focus && onFocusMap ? (
                  <button
                    type="button"
                    className="nac-msg-focus-map"
                    title="Fly to this location on the map"
                    onClick={() => onFocusMap(focus)}
                  >
                    <i className="fa-solid fa-location-crosshairs" aria-hidden />
                    Focus map
                  </button>
                ) : null}
                {hasImage ? (
                  <p className="nac-msg-meta">
                    <i className="fa-solid fa-paperclip" aria-hidden /> Image attached
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}

        {busy ? (
          <div className="nac-msg nac-msg--assistant">
            <div className="nac-msg-avatar" aria-hidden>
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
            <div className="nac-msg-body">
              <p className="nac-msg-text nac-msg-text--muted">{busyLabel}</p>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="nac-transcript-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
