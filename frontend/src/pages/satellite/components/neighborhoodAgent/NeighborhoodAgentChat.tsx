import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { GeoExplorerMapLink, GeoExplorerMessage } from '../../../../lib/geoExplorerGemini';
import { buildNeighborhoodAgentFollowUps } from '../../../../lib/neighborhoodAgentFollowUps';
import { useSiInstanceScope } from '../../siInstanceScope';
import type { GeoExplorerMapAction } from '../GeoExplorerDynamicTable';
import type { NeighborhoodAgentEvidencePayload } from './neighborhoodAgentEvidence';
import { NeighborhoodAgentComposer } from './NeighborhoodAgentComposer';
import { NeighborhoodAgentTranscript } from './NeighborhoodAgentTranscript';
import {
  GeoAiAgentEmptyState,
} from '../geoAiAgent/GeoAiAgentPanel';
import type { GeoAiAgentPrefs } from '../geoAiAgent/geoAiAgentPrefs';
import './neighborhoodAgent.css';

const STORAGE_KEY = 'si-sat-neighborhood-agent-pos-v2';
const STORAGE_SIZE_KEY = 'si-sat-neighborhood-agent-size-v2';

type StoredPos = { x: number; y: number };
type StoredSize = { w: number; h: number };
type ResizeHandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type NeighborhoodAgentQuickPrompt = {
  id: string;
  label: string;
  prompt: string;
  primary?: boolean;
};
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultSize(): StoredSize {
  if (typeof window === 'undefined') return { w: 380, h: 520 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const compact = vw > 600;
  const w = compact ? Math.min(400, vw - 32) : Math.max(280, vw - 20);
  const h = compact
    ? Math.min(560, Math.max(340, Math.round(vh * 0.55)))
    : Math.min(Math.round(vh * 0.72), vh - 130);
  return { w: Math.round(Math.max(280, w)), h: Math.round(Math.max(300, h)) };
}

function readStoredPos(storageKey: string): StoredPos | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredPos).x === 'number' &&
      typeof (parsed as StoredPos).y === 'number'
    ) {
      return { x: (parsed as StoredPos).x, y: (parsed as StoredPos).y };
    }
  } catch {
    // ignore
  }
  return null;
}

function readStoredSize(storageKey: string): StoredSize | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredSize).w === 'number' &&
      typeof (parsed as StoredSize).h === 'number'
    ) {
      return { w: (parsed as StoredSize).w, h: (parsed as StoredSize).h };
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredPos(pos: StoredPos, storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function writeStoredSize(size: StoredSize, storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(size));
  } catch {
    // ignore
  }
}

function maxPanelSize(): StoredSize {
  if (typeof window === 'undefined') return { w: 720, h: 900 };
  return {
    w: Math.max(320, window.innerWidth - 16),
    h: Math.max(360, window.innerHeight - 24),
  };
}

function minPanelSize(): StoredSize {
  return { w: 300, h: 320 };
}

export type NeighborhoodAgentChatProps = {
  open: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRequestClose: () => void;
  onMinimize?: () => void;
  isEmpty: boolean;
  onNewChat: () => void;
  /** Clear current transcript without leaving the panel. Defaults to onNewChat. */
  onClearChat?: () => void;
  onQuickAction: (prompt: string, chipId?: string) => void;
  /** Session title when a chat is underway; falls back to “New AI chat”. */
  sessionTitle?: string | null;
  /** New composer — replaces GeoExplorerGeminiInputRow in this shell. */
  draft: string;
  onDraftChange: (next: string) => void;
  onSend: (voiceOverrideText?: string) => void;
  busy: boolean;
  showAttach?: boolean;
  enableVoice?: boolean;
  pendingImage?: { mime: string; base64: string; name?: string } | null;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  onAttachChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearPendingImage?: () => void;
  /** Transcript (replaces GeoExplorerGeminiMessageParts / si-geo-explorer-bubble-text). */
  messages: GeoExplorerMessage[];
  busyLabel?: string;
  chatError?: string | null;
  messagesRef?: RefObject<HTMLDivElement | null>;
  onMessagesScroll?: () => void;
  hasOlderMessages?: boolean;
  onLoadOlder?: () => void;
  onTableMapAction?: (action: GeoExplorerMapAction, link: GeoExplorerMapLink) => void;
  onTableBatchZoom?: (links: GeoExplorerMapLink[]) => void;
  onTableSelectionLinksChange?: (tableId: string, links: GeoExplorerMapLink[]) => void;
  mapFocusFeatureKey?: string | null;
  onTableQuerySelectApplied?: () => void;
  /** Re-fly map to a stored pin from a Focus map chip. */
  onFocusMap?: (focus: { lng: number; lat: number; label?: string }) => void;
  /** Truncate after this user message and re-ask with edited text. */
  onSaveEditedUserMessage?: (messageId: string, nextText: string) => void;
  /** Put edited text into the composer without re-running. */
  onUseEditedInComposer?: (text: string) => void;
  /** GeoAI Agent prefs — enables GeoAiAgentPanel empty state + GIS quick chips. */
  geoAiAgentPrefs?: GeoAiAgentPrefs;
  userName?: string;
  /** Optional extras under the transcript (e.g. docked identify). */
  children?: ReactNode;
};

export function NeighborhoodAgentChat({
  open,
  expanded,
  onToggleExpanded,
  onRequestClose,
  onMinimize,
  isEmpty,
  onNewChat,
  onClearChat,
  onQuickAction,
  sessionTitle,
  draft,
  onDraftChange,
  onSend,
  busy,
  showAttach = true,
  enableVoice = true,
  pendingImage = null,
  fileInputRef,
  onAttachChange,
  onClearPendingImage,
  messages,
  busyLabel,
  chatError = null,
  messagesRef,
  onMessagesScroll,
  hasOlderMessages,
  onLoadOlder,
  onTableMapAction,
  onTableBatchZoom,
  onTableSelectionLinksChange,
  mapFocusFeatureKey,
  onTableQuerySelectApplied,
  onFocusMap,
  onSaveEditedUserMessage,
  onUseEditedInComposer,
  geoAiAgentPrefs,
  userName,
  children,
}: NeighborhoodAgentChatProps) {
  const { scopedStorageKey } = useSiInstanceScope();
  const posStorageKey = scopedStorageKey(STORAGE_KEY);
  const sizeStorageKey = scopedStorageKey(STORAGE_SIZE_KEY);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    target: 'fab' | 'header';
    moved: number;
  } | null>(null);

  const resizeRef = useRef<{
    pointerId: number;
    handle: ResizeHandleId;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startOx: number;
    startOy: number;
  } | null>(null);

  const [offset, setOffset] = useState<StoredPos>(() => readStoredPos(posStorageKey) ?? { x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<StoredSize>(() => {
    const s = readStoredSize(sizeStorageKey);
    if (!s) return defaultSize();
    const mn = minPanelSize();
    const mx = maxPanelSize();
    return {
      w: clamp(s.w, mn.w, mx.w),
      h: clamp(s.h, mn.h, mx.h),
    };
  });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const stored = readStoredPos(posStorageKey);
    if (stored) setOffset(stored);
  }, [posStorageKey]);

  const clampOffsetToViewport = useCallback(
    (next: StoredPos, size: StoredSize = panelSize) => {
      const el = rootRef.current;
      if (!el) return next;
      const w = size.w;
      const h = size.h;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - w - margin);
      const maxY = Math.max(margin, window.innerHeight - h - margin);
      const minX = margin - w + 56;
      const minY = margin - h + 56;
      return {
        x: clamp(next.x, minX, maxX),
        y: clamp(next.y, minY, maxY),
      };
    },
    [panelSize.w, panelSize.h],
  );

  const clampSize = useCallback((s: StoredSize): StoredSize => {
    const mn = minPanelSize();
    const mx = maxPanelSize();
    return {
      w: clamp(s.w, mn.w, mx.w),
      h: clamp(s.h, mn.h, mx.h),
    };
  }, []);

  const onPointerDownFab = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'fab',
        moved: 0,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [offset.x, offset.y],
  );

  const onPointerDownHeader = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button') || target?.closest('.nac-resize-handle')) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'header',
        moved: 0,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const next = clampOffsetToViewport(
        {
          x: drag.originX + dx,
          y: drag.originY + dy,
        },
        panelSize,
      );
      setOffset(next);
    },
    [clampOffsetToViewport, panelSize],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const wasFab = drag.target === 'fab';
      const moved = drag.moved;
      dragRef.current = null;
      setDragging(false);
      setOffset(prev => {
        const clamped = clampOffsetToViewport(prev, panelSize);
        writeStoredPos(clamped, posStorageKey);
        return clamped;
      });
      if (wasFab && !expanded && moved < 8) {
        onToggleExpanded();
      }
    },
    [clampOffsetToViewport, expanded, onToggleExpanded, panelSize, posStorageKey],
  );

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, endDrag, onPointerMove]);

  const applyResizeDelta = useCallback(
    (clientX: number, clientY: number) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = clientX - r.startX;
      const dy = clientY - r.startY;

      let w = r.startW;
      let h = r.startH;
      let ox = r.startOx;
      let oy = r.startOy;

      switch (r.handle) {
        case 'e':
          w = r.startW + dx;
          break;
        case 'w':
          w = r.startW - dx;
          ox = r.startOx + dx;
          break;
        case 'n':
          h = r.startH - dy;
          break;
        case 's':
          h = r.startH + dy;
          break;
        case 'ne':
          w = r.startW + dx;
          h = r.startH - dy;
          break;
        case 'nw':
          w = r.startW - dx;
          ox = r.startOx + dx;
          h = r.startH - dy;
          break;
        case 'se':
          w = r.startW + dx;
          h = r.startH + dy;
          break;
        case 'sw':
          w = r.startW - dx;
          ox = r.startOx + dx;
          h = r.startH + dy;
          break;
        default:
          break;
      }

      const nextSize = clampSize({ w, h });
      let nextOx = ox;
      const nextOy = oy;
      if (nextSize.w !== w && (r.handle === 'w' || r.handle === 'nw' || r.handle === 'sw')) {
        nextOx = r.startOx + (r.startW - nextSize.w);
      }

      const clampedPos = clampOffsetToViewport({ x: nextOx, y: nextOy }, nextSize);
      setPanelSize(nextSize);
      setOffset(clampedPos);
    },
    [clampSize, clampOffsetToViewport],
  );

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      applyResizeDelta(e.clientX, e.clientY);
    },
    [applyResizeDelta],
  );

  const endResize = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
      setPanelSize(sz => {
        const c = clampSize(sz);
        writeStoredSize(c, sizeStorageKey);
        setOffset(o => {
          const clamped = clampOffsetToViewport(o, c);
          writeStoredPos(clamped, posStorageKey);
          return clamped;
        });
        return c;
      });
    },
    [clampOffsetToViewport, clampSize, posStorageKey, sizeStorageKey],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandleId) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        pointerId: e.pointerId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startW: panelSize.w,
        startH: panelSize.h,
        startOx: offset.x,
        startOy: offset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setResizing(true);
    },
    [offset.x, offset.y, panelSize.w, panelSize.h],
  );

  useEffect(() => {
    if (!resizing) return;
    window.addEventListener('pointermove', onResizePointerMove, { passive: true });
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
    return () => {
      window.removeEventListener('pointermove', onResizePointerMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
    };
  }, [endResize, onResizePointerMove, resizing]);

  useEffect(() => {
    if (!expanded) return;
    const onWin = () => {
      setPanelSize(s => {
        const c = clampSize(s);
        setOffset(o => clampOffsetToViewport(o, c));
        return c;
      });
    };
    window.addEventListener('resize', onWin, { passive: true });
    window.addEventListener('orientationchange', onWin, { passive: true });
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('orientationchange', onWin);
    };
  }, [expanded, clampOffsetToViewport, clampSize]);

  const transformStyle = useMemo(
    () => ({ transform: `translate3d(calc(-50% + ${offset.x}px), ${offset.y}px, 0)` }),
    [offset.x, offset.y],
  );

  const panelStyle = useMemo(
    () =>
      ({
        width: `${panelSize.w}px`,
        height: `${panelSize.h}px`,
        maxWidth: 'none',
        maxHeight: 'none',
      }) as React.CSSProperties,
    [panelSize.w, panelSize.h],
  );

  const resizeHandles: Array<{ id: ResizeHandleId; className: string; label: string }> = useMemo(
    () => [
      { id: 'n', className: 'nac-resize-handle nac-resize-handle--n', label: 'Resize height from top' },
      { id: 's', className: 'nac-resize-handle nac-resize-handle--s', label: 'Resize height from bottom' },
      { id: 'e', className: 'nac-resize-handle nac-resize-handle--e', label: 'Resize width from end' },
      { id: 'w', className: 'nac-resize-handle nac-resize-handle--w', label: 'Resize width from start' },
      { id: 'ne', className: 'nac-resize-handle nac-resize-handle--ne', label: 'Resize corner' },
      { id: 'nw', className: 'nac-resize-handle nac-resize-handle--nw', label: 'Resize corner' },
      { id: 'se', className: 'nac-resize-handle nac-resize-handle--se', label: 'Resize corner' },
      { id: 'sw', className: 'nac-resize-handle nac-resize-handle--sw', label: 'Resize corner' },
    ],
    [],
  );

  const title = !isEmpty && sessionTitle?.trim() ? sessionTitle.trim() : 'Chat AI Agent';
  const useGeoAiEmptyShell = Boolean(geoAiAgentPrefs) && isEmpty;

  const followUps = useMemo(() => {
    if (useGeoAiEmptyShell) return [] as NeighborhoodAgentQuickPrompt[];
    if (isEmpty) {
      return [
        {
          id: 'gis-ndvi',
          label: 'Average NDVI in AOI',
          prompt: 'What is the average NDVI inside the current AOI?',
          primary: true,
        },
        {
          id: 'gis-stress',
          label: 'Stressed area %',
          prompt: 'What percentage of the AOI shows stressed vegetation based on the active index?',
        },
        {
          id: 'gis-buffer',
          label: 'Buffer AOI 500m',
          prompt: 'Create a 500 m buffer around the current AOI and show it on the map.',
        },
      ] satisfies NeighborhoodAgentQuickPrompt[];
    }
    const lastModel = [...messages].reverse().find(m => m.role === 'model' || m.role === 'assistant')
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastModel && !lastUser) return []

    const modelText = lastModel
      ? lastModel.parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join('\n')
      : ''
    const userText = lastUser
      ? lastUser.parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join('\n')
      : ''
    const hasTableOrChartCue = !!lastModel?.parts.some(p => p.type === 'dataTable')

    return buildNeighborhoodAgentFollowUps({
      evidence: (lastModel?.agentEvidence as NeighborhoodAgentEvidencePayload | undefined) ?? null,
      lastUserText: userText,
      lastAssistantText: modelText,
      hasTableOrChartCue,
    })
  }, [isEmpty, messages, useGeoAiEmptyShell])

  const handleMinimize = useCallback(() => {
    (onMinimize ?? onToggleExpanded)();
  }, [onMinimize, onToggleExpanded]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={[
        'nac-float',
        dragging ? 'nac-float--dragging' : '',
        resizing ? 'nac-float--resizing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={transformStyle}
      role="region"
      aria-label="Chat AI Agent"
    >
      <div className="nac-float-inner">
        {expanded ? (
          <div
            className={[
              'nac-panel',
              'nac-panel--sized',
              dragging ? 'nac-panel--dragging' : '',
              resizing ? 'nac-panel--resizing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={panelStyle}
          >
            <header className="nac-header" data-nac-drag-handle onPointerDown={onPointerDownHeader}>
              <div className="nac-header-main">
                <div className="nac-title-row">
                  <h2 className="nac-title">{title}</h2>
                  {isEmpty ? (
                    <p className="nac-subtitle">Spatial intelligence · server GIS</p>
                  ) : null}
                </div>
              </div>
              <div className="nac-header-actions">
                {!isEmpty ? (
                  <button
                    type="button"
                    className="nac-icon-btn nac-icon-btn--clear"
                    title="Clear chat"
                    aria-label="Clear chat"
                    disabled={busy}
                    onClick={() => (onClearChat ?? onNewChat)()}
                  >
                    <i className="fa-solid fa-broom" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="nac-icon-btn"
                  title="New chat"
                  aria-label="New chat"
                  onClick={onNewChat}
                >
                  <i className="fa-solid fa-plus" aria-hidden />
                </button>
                <button
                  type="button"
                  className="nac-icon-btn"
                  title="Minimize"
                  aria-label="Minimize Chat AI Agent"
                  onClick={handleMinimize}
                >
                  <i className="fa-solid fa-chevron-down" aria-hidden />
                </button>
                <button
                  type="button"
                  className="nac-icon-btn"
                  title="Close"
                  aria-label="Close Chat AI Agent"
                  onClick={onRequestClose}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </header>

            <div className="nac-body">
              <div
                className={['nac-chat-slot', isEmpty ? 'nac-chat-slot--empty' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {!isEmpty ? (
                  <NeighborhoodAgentTranscript
                    messages={messages}
                    busy={busy}
                    busyLabel={busyLabel}
                    error={chatError}
                    messagesRef={messagesRef}
                    onMessagesScroll={onMessagesScroll}
                    hasOlderMessages={hasOlderMessages}
                    onLoadOlder={onLoadOlder}
                    onTableMapAction={onTableMapAction}
                    onTableBatchZoom={onTableBatchZoom}
                    onTableSelectionLinksChange={onTableSelectionLinksChange}
                    mapFocusFeatureKey={mapFocusFeatureKey}
                    onTableQuerySelectApplied={onTableQuerySelectApplied}
                    onFocusMap={onFocusMap}
                    onSaveEditedUserMessage={onSaveEditedUserMessage}
                    onUseEditedInComposer={onUseEditedInComposer}
                  />
                ) : null}
                {useGeoAiEmptyShell ? (
                  <GeoAiAgentEmptyState
                    prefs={geoAiAgentPrefs}
                    userName={userName}
                    onQuickAction={onQuickAction}
                  />
                ) : null}
                {children}
              </div>

              {followUps.length > 0 || !isEmpty ? (
                <div className="nac-follow-ups" role="group" aria-label={isEmpty ? 'Spatial analysis tools' : 'Suggested next analyses'}>
                  {isEmpty ? <div className="nac-gis-tools-label">Spatial Analysis</div> : null}
                  {!isEmpty ? (
                    <button
                      type="button"
                      className="nac-follow-up-chip nac-follow-up-chip--clear"
                      disabled={busy}
                      title="Clear chat"
                      aria-label="Clear chat"
                      onClick={() => (onClearChat ?? onNewChat)()}
                    >
                      <i className="fa-solid fa-broom" aria-hidden />
                      Clear
                    </button>
                  ) : null}
                  {followUps.map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      className={[
                        'nac-follow-up-chip',
                        chip.primary ? 'nac-follow-up-chip--primary' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={busy}
                      onClick={() => onQuickAction(chip.prompt, chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <NeighborhoodAgentComposer
                draft={draft}
                onDraftChange={onDraftChange}
                onSend={onSend}
                busy={busy}
                showAttach={showAttach}
                enableVoice={enableVoice}
                pendingImage={pendingImage}
                fileInputRef={fileInputRef}
                onAttachChange={onAttachChange}
                onClearPendingImage={onClearPendingImage}
              />
            </div>

            {resizeHandles.map(h => (
              <button
                key={h.id}
                type="button"
                className={h.className}
                aria-label={h.label}
                title={h.label}
                onPointerDown={ev => onResizePointerDown(ev, h.id)}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="nac-fab"
            title="Chat AI Agent — expand"
            aria-expanded={expanded}
            aria-label="Chat AI Agent"
            onPointerDown={onPointerDownFab}
          >
            <span className="nac-fab-label">Chat AI Agent</span>
            <i className="fa-solid fa-comments" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
