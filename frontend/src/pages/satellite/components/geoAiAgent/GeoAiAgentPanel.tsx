import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../../../state/auth';
import { GeoAiAgentBuilder } from './GeoAiAgentBuilder';
import {
  DEFAULT_GEO_AI_AGENT_CHIPS,
  DEFAULT_GEO_AI_AGENT_PREFS,
  fabIconFaClass,
  formatGeoAiAgentGreeting,
  type GeoAiAgentPrefs,
} from './geoAiAgentPrefs';
import './geoAiAgent.css';

export type GeoAiAgentQuickChip = {
  id: string;
  label: string;
  /** Prompt sent via onQuickAction; omit for “More” expand-only chips */
  prompt?: string;
  more?: boolean;
};

export type GeoAiAgentHistoryEntry = {
  id: string;
  title: string;
  at: number;
};

const MORE_CHIPS: GeoAiAgentQuickChip[] = [
  { id: 'layer-summary', label: 'Summarize layers →', prompt: 'Summarize the loaded GIS layers and key attribute fields on this map.' },
  { id: 'weather', label: 'Weather near AOI →', prompt: 'What is the weather context near the current AOI or map pin?' },
  { id: 'identify', label: 'Identify selection →', prompt: 'Identify and describe the currently selected or visible features.' },
];

export type GeoAiAgentPanelProps = {
  /** When true, show greeting + chips instead of the chat transcript area. */
  isEmpty: boolean;
  onNewChat: () => void;
  /** Fired when a quick-action chip is chosen (canned prompt + chip id for analyst packs). */
  onQuickAction: (prompt: string, chipId?: string) => void;
  /** Optional override for greeting name; falls back to auth user first name. */
  userName?: string;
  /** Prior chats captured before New Chat (session UI). */
  historyEntries?: GeoAiAgentHistoryEntry[];
  onSelectHistoryEntry?: (entry: GeoAiAgentHistoryEntry) => void;
  /** Shell actions when the float title bar is hidden under agent chrome. */
  onMinimize?: () => void;
  onRequestClose?: () => void;
  /** Extra controls (model tabs live in children; this is for header trailing actions). */
  headerExtra?: ReactNode;
  /** Agent Builder prefs (greeting, chips, header toggles). */
  prefs?: GeoAiAgentPrefs;
  onPrefsChange?: (next: GeoAiAgentPrefs) => void;
  children: ReactNode;
};

function firstNameFrom(full: string | undefined | null): string {
  const t = String(full ?? '').trim();
  if (!t) return 'there';
  const first = t.split(/\s+/)[0];
  return first || 'there';
}

export function GeoAiAgentPanel({
  isEmpty,
  onNewChat,
  onQuickAction,
  userName: userNameProp,
  historyEntries = [],
  onSelectHistoryEntry,
  onMinimize,
  onRequestClose,
  headerExtra,
  prefs: prefsProp,
  onPrefsChange,
  children,
}: GeoAiAgentPanelProps) {
  const { user } = useAuth();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showMoreChips, setShowMoreChips] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const prefs = prefsProp ?? DEFAULT_GEO_AI_AGENT_PREFS;
  const displayName = firstNameFrom(userNameProp ?? user?.name);
  const greeting = formatGeoAiAgentGreeting(prefs.greetingText, displayName);
  const helpPrompt = prefs.helpPromptText.trim() || DEFAULT_GEO_AI_AGENT_PREFS.helpPromptText;

  const primaryChips: GeoAiAgentQuickChip[] = useMemo(() => {
    const fromPrefs = (prefs.chips?.length ? prefs.chips : DEFAULT_GEO_AI_AGENT_CHIPS).map(c => ({
      id: c.id,
      label: c.label,
      prompt: c.prompt,
    }));
    return [...fromPrefs, { id: 'more', label: 'More →', more: true }];
  }, [prefs.chips]);

  const chips = useMemo(() => {
    if (!showMoreChips) return primaryChips;
    return [...primaryChips.filter(c => !c.more), ...MORE_CHIPS];
  }, [primaryChips, showMoreChips]);

  const handleChip = useCallback(
    (chip: GeoAiAgentQuickChip) => {
      if (chip.more) {
        setShowMoreChips(v => !v);
        return;
      }
      if (chip.prompt) onQuickAction(chip.prompt, chip.id);
    },
    [onQuickAction],
  );

  const handleNewChat = useCallback(() => {
    setHistoryOpen(false);
    setShowMoreChips(false);
    setBuilderOpen(false);
    onNewChat();
  }, [onNewChat]);

  const handlePrefsChange = useCallback(
    (next: GeoAiAgentPrefs) => {
      onPrefsChange?.(next);
    },
    [onPrefsChange],
  );

  const handlePrefsReset = useCallback(() => {
    onPrefsChange?.({
      ...DEFAULT_GEO_AI_AGENT_PREFS,
      chips: DEFAULT_GEO_AI_AGENT_PREFS.chips.map(c => ({ ...c })),
    });
  }, [onPrefsChange]);

  return (
    <div className="geo-ai-agent-panel" data-empty={isEmpty ? 'true' : 'false'}>
      <div className="geo-ai-agent-header" data-geo-ai-agent-drag-handle>
        <div className="geo-ai-agent-brand">
          <span className="geo-ai-agent-brand-mark" aria-hidden>
            <i className="fa-solid fa-sparkles" />
          </span>
          <span className="geo-ai-agent-brand-title">AI Agent</span>
        </div>
        <div className="geo-ai-agent-header-actions">
          {headerExtra}
          {onPrefsChange ? (
            <button
              type="button"
              className={`geo-ai-agent-icon-btn${builderOpen ? ' geo-ai-agent-icon-btn--active' : ''}`}
              title="Agent Builder"
              aria-label="Agent Builder"
              aria-pressed={builderOpen}
              onClick={() => {
                setBuilderOpen(v => !v);
                setHistoryOpen(false);
              }}
            >
              <i className="fa-solid fa-sliders" aria-hidden />
            </button>
          ) : null}
          {prefs.showNewChatButton ? (
            <button
              type="button"
              className="geo-ai-agent-icon-btn"
              title="New Chat"
              aria-label="New Chat"
              onClick={handleNewChat}
            >
              <i className="fa-solid fa-plus" aria-hidden />
            </button>
          ) : null}
          {prefs.showHistoryButton ? (
            <button
              type="button"
              className={`geo-ai-agent-icon-btn${historyOpen ? ' geo-ai-agent-icon-btn--active' : ''}`}
              title="Chat History"
              aria-label="Chat History"
              aria-pressed={historyOpen}
              onClick={() => {
                setHistoryOpen(v => !v);
                setBuilderOpen(false);
              }}
            >
              <i className="fa-solid fa-clock-rotate-left" aria-hidden />
            </button>
          ) : null}
          {onMinimize ? (
            <button
              type="button"
              className="geo-ai-agent-icon-btn"
              title="Minimize"
              aria-label="Minimize AI Agent"
              onClick={onMinimize}
            >
              <i className={fabIconFaClass(prefs.fabCloseIcon)} aria-hidden />
            </button>
          ) : null}
          {onRequestClose ? (
            <button
              type="button"
              className="geo-ai-agent-icon-btn"
              title="Close"
              aria-label="Close AI Agent"
              onClick={onRequestClose}
            >
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="geo-ai-agent-body">
        {builderOpen && onPrefsChange ? (
          <GeoAiAgentBuilder
            prefs={prefs}
            onChange={handlePrefsChange}
            onClose={() => setBuilderOpen(false)}
            onReset={handlePrefsReset}
          />
        ) : null}

        {historyOpen && !builderOpen ? (
          <div className="geo-ai-agent-history" role="dialog" aria-label="Chat History">
            <div className="geo-ai-agent-history-head">
              <span className="geo-ai-agent-history-title">Chat History</span>
              <button
                type="button"
                className="geo-ai-agent-icon-btn"
                title="Close history"
                aria-label="Close history"
                onClick={() => setHistoryOpen(false)}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
            <div className="geo-ai-agent-history-list">
              {historyEntries.length === 0 ? (
                <p className="geo-ai-agent-history-empty">
                  No saved chats yet. Start a conversation, then use New Chat to archive it here.
                </p>
              ) : (
                historyEntries.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    className="geo-ai-agent-history-item"
                    onClick={() => {
                      onSelectHistoryEntry?.(entry);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="geo-ai-agent-history-item-title">{entry.title}</span>
                    <span className="geo-ai-agent-history-item-meta">
                      {new Date(entry.at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {isEmpty && !historyOpen && !builderOpen ? (
          <div className="geo-ai-agent-empty" role="status">
            <div className="geo-ai-agent-empty-avatar" aria-hidden>
              <i className="fa-solid fa-sparkles" />
              <i className="fa-solid fa-star geo-ai-agent-empty-avatar-sparkle" />
            </div>
            <p className="geo-ai-agent-empty-hello">{greeting}</p>
            <p className="geo-ai-agent-empty-prompt">{helpPrompt}</p>
            <div className="geo-ai-agent-chips" role="group" aria-label="Quick actions">
              {chips.map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  className={`geo-ai-agent-chip${chip.more ? ' geo-ai-agent-chip--more' : ''}`}
                  onClick={() => handleChip(chip)}
                >
                  {chip.more && showMoreChips ? 'Less' : chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Chat / model tabs / composer — messages hidden via CSS when empty / builder */}
        <div
          className={[
            'geo-ai-agent-chat-slot',
            isEmpty && !historyOpen && !builderOpen ? 'geo-ai-agent-chat-slot--empty' : '',
            builderOpen ? 'geo-ai-agent-chat-slot--builder' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
