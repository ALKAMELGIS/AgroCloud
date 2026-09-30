import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_GEO_AI_AGENT_CHIPS,
  GEO_AI_AGENT_FAB_ICON_OPTIONS,
  buildGeoAiAgentEmbedSnippet,
  type GeoAiAgentChipPref,
  type GeoAiAgentFabIconId,
  type GeoAiAgentLayoutMode,
  type GeoAiAgentModelTab,
  type GeoAiAgentPrefs,
} from './geoAiAgentPrefs';

export type GeoAiAgentBuilderTab = 'layout' | 'style' | 'content' | 'embed';

export type GeoAiAgentBuilderProps = {
  prefs: GeoAiAgentPrefs;
  onChange: (next: GeoAiAgentPrefs) => void;
  onClose: () => void;
  onReset?: () => void;
};

const BUILDER_TABS: Array<{ id: GeoAiAgentBuilderTab; label: string }> = [
  { id: 'layout', label: 'Layout' },
  { id: 'style', label: 'Style' },
  { id: 'content', label: 'Content' },
  { id: 'embed', label: 'Embed' },
];

const MODEL_OPTIONS: Array<{ id: GeoAiAgentModelTab; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'ollama', label: 'AgroCloud AI Chat' },
];

function newChipId(): string {
  return `chip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function GeoAiAgentBuilder({ prefs, onChange, onClose, onReset }: GeoAiAgentBuilderProps) {
  const [tab, setTab] = useState<GeoAiAgentBuilderTab>('layout');
  const embedSnippet = useMemo(() => buildGeoAiAgentEmbedSnippet(), []);
  const [copied, setCopied] = useState(false);

  const patch = useCallback(
    (partial: Partial<GeoAiAgentPrefs>) => {
      onChange({ ...prefs, ...partial });
    },
    [onChange, prefs],
  );

  const updateChip = useCallback(
    (index: number, partial: Partial<GeoAiAgentChipPref>) => {
      const chips = prefs.chips.map((c, i) => (i === index ? { ...c, ...partial } : c));
      patch({ chips });
    },
    [patch, prefs.chips],
  );

  const removeChip = useCallback(
    (index: number) => {
      patch({ chips: prefs.chips.filter((_, i) => i !== index) });
    },
    [patch, prefs.chips],
  );

  const addChip = useCallback(() => {
    if (prefs.chips.length >= 12) return;
    patch({
      chips: [
        ...prefs.chips,
        {
          id: newChipId(),
          label: 'New action →',
          prompt: 'Describe what this quick action should ask the agent.',
        },
      ],
    });
  }, [patch, prefs.chips]);

  const restoreDefaultChips = useCallback(() => {
    patch({ chips: DEFAULT_GEO_AI_AGENT_CHIPS.map(c => ({ ...c })) });
  }, [patch]);

  const handleCopyEmbed = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [embedSnippet]);

  return (
    <div className="geo-ai-agent-builder" role="dialog" aria-label="Agent Builder">
      <div className="geo-ai-agent-builder-head">
        <div className="geo-ai-agent-builder-head-text">
          <span className="geo-ai-agent-builder-title">Agent Builder</span>
          <span className="geo-ai-agent-builder-sub">Layout, style, content & embed</span>
        </div>
        <div className="geo-ai-agent-builder-head-actions">
          {onReset ? (
            <button
              type="button"
              className="geo-ai-agent-builder-text-btn"
              title="Reset to defaults"
              onClick={onReset}
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            className="geo-ai-agent-icon-btn"
            title="Close Agent Builder"
            aria-label="Close Agent Builder"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
      </div>

      <div className="geo-ai-agent-builder-tabs" role="tablist" aria-label="Agent Builder sections">
        {BUILDER_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`geo-ai-agent-builder-tab${tab === t.id ? ' geo-ai-agent-builder-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="geo-ai-agent-builder-body" role="tabpanel">
        {tab === 'layout' ? (
          <div className="geo-ai-agent-builder-section">
            <p className="geo-ai-agent-builder-hint">
              Choose how the AI Agent sits on Satellite Intelligence.
            </p>
            <div className="geo-ai-agent-builder-choice-grid" role="radiogroup" aria-label="Layout mode">
              {(
                [
                  {
                    id: 'docked' as GeoAiAgentLayoutMode,
                    title: 'Docked',
                    desc: 'Floating map widget (current). Drag and resize freely.',
                  },
                  {
                    id: 'embedded' as GeoAiAgentLayoutMode,
                    title: 'Embedded',
                    desc: 'Host inside the analysis dock when a panel host is available.',
                  },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.layoutMode === opt.id}
                  className={`geo-ai-agent-builder-choice${
                    prefs.layoutMode === opt.id ? ' geo-ai-agent-builder-choice--active' : ''
                  }`}
                  onClick={() => patch({ layoutMode: opt.id })}
                >
                  <span className="geo-ai-agent-builder-choice-title">{opt.title}</span>
                  <span className="geo-ai-agent-builder-choice-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
            {prefs.layoutMode === 'embedded' ? (
              <p className="geo-ai-agent-builder-note">
                Embedded mode is saved. Until a dock host is wired, the floating panel remains the
                active surface.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'style' ? (
          <div className="geo-ai-agent-builder-section">
            <p className="geo-ai-agent-builder-hint">Icons for the minimized FAB and header actions.</p>

            <label className="geo-ai-agent-builder-field">
              <span className="geo-ai-agent-builder-label">Open FAB icon</span>
              <div className="geo-ai-agent-builder-icon-picks" role="group" aria-label="Open FAB icon">
                {GEO_AI_AGENT_FAB_ICON_OPTIONS.map(opt => (
                  <IconPickButton
                    key={`open-${opt.id}`}
                    option={opt}
                    selected={prefs.fabOpenIcon === opt.id}
                    onSelect={() => patch({ fabOpenIcon: opt.id })}
                  />
                ))}
              </div>
            </label>

            <label className="geo-ai-agent-builder-field">
              <span className="geo-ai-agent-builder-label">Close / minimize FAB icon</span>
              <div className="geo-ai-agent-builder-icon-picks" role="group" aria-label="Close FAB icon">
                {GEO_AI_AGENT_FAB_ICON_OPTIONS.map(opt => (
                  <IconPickButton
                    key={`close-${opt.id}`}
                    option={opt}
                    selected={prefs.fabCloseIcon === opt.id}
                    onSelect={() => patch({ fabCloseIcon: opt.id })}
                  />
                ))}
              </div>
            </label>

            <div className="geo-ai-agent-builder-toggles">
              <ToggleRow
                label="Show New Chat"
                checked={prefs.showNewChatButton}
                onChange={v => patch({ showNewChatButton: v })}
              />
              <ToggleRow
                label="Show Chat History"
                checked={prefs.showHistoryButton}
                onChange={v => patch({ showHistoryButton: v })}
              />
            </div>
          </div>
        ) : null}

        {tab === 'content' ? (
          <div className="geo-ai-agent-builder-section">
            <p className="geo-ai-agent-builder-hint">
              Greeting, empty-state prompt, quick-action chips, and default model tab.
            </p>

            <label className="geo-ai-agent-builder-field">
              <span className="geo-ai-agent-builder-label">Greeting</span>
              <input
                className="geo-ai-agent-builder-input"
                type="text"
                value={prefs.greetingText}
                maxLength={120}
                placeholder="Hello, {name}!"
                onChange={e => patch({ greetingText: e.target.value })}
              />
              <span className="geo-ai-agent-builder-field-hint">Use {'{name}'} for the user&apos;s first name.</span>
            </label>

            <label className="geo-ai-agent-builder-field">
              <span className="geo-ai-agent-builder-label">Help prompt</span>
              <input
                className="geo-ai-agent-builder-input"
                type="text"
                value={prefs.helpPromptText}
                maxLength={120}
                placeholder="How can I help?"
                onChange={e => patch({ helpPromptText: e.target.value })}
              />
            </label>

            <label className="geo-ai-agent-builder-field">
              <span className="geo-ai-agent-builder-label">Default model tab</span>
              <select
                className="geo-ai-agent-builder-select"
                value={prefs.defaultModelTab}
                onChange={e => patch({ defaultModelTab: e.target.value as GeoAiAgentModelTab })}
              >
                {MODEL_OPTIONS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="geo-ai-agent-builder-chips-editor">
              <div className="geo-ai-agent-builder-chips-editor-head">
                <span className="geo-ai-agent-builder-label">Quick-action chips</span>
                <div className="geo-ai-agent-builder-chips-editor-actions">
                  <button type="button" className="geo-ai-agent-builder-text-btn" onClick={restoreDefaultChips}>
                    Defaults
                  </button>
                  <button
                    type="button"
                    className="geo-ai-agent-builder-text-btn"
                    onClick={addChip}
                    disabled={prefs.chips.length >= 12}
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="geo-ai-agent-builder-chip-list">
                {prefs.chips.map((chip, index) => (
                  <div key={chip.id} className="geo-ai-agent-builder-chip-row">
                    <input
                      className="geo-ai-agent-builder-input"
                      type="text"
                      value={chip.label}
                      maxLength={48}
                      aria-label={`Chip ${index + 1} label`}
                      placeholder="Label →"
                      onChange={e => updateChip(index, { label: e.target.value })}
                    />
                    <textarea
                      className="geo-ai-agent-builder-textarea"
                      value={chip.prompt}
                      maxLength={400}
                      rows={2}
                      aria-label={`Chip ${index + 1} prompt`}
                      placeholder="Prompt sent when the chip is clicked"
                      onChange={e => updateChip(index, { prompt: e.target.value })}
                    />
                    <button
                      type="button"
                      className="geo-ai-agent-icon-btn"
                      title="Remove chip"
                      aria-label={`Remove chip ${index + 1}`}
                      onClick={() => removeChip(index)}
                      disabled={prefs.chips.length <= 1}
                    >
                      <i className="fa-solid fa-trash-can" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'embed' ? (
          <div className="geo-ai-agent-builder-section">
            <p className="geo-ai-agent-builder-hint">
              Read-only note for Satellite Intelligence. External iframe embed is not shipped yet.
            </p>
            <pre className="geo-ai-agent-builder-embed-snippet" tabIndex={0}>
              {embedSnippet}
            </pre>
            <div className="geo-ai-agent-builder-embed-actions">
              <button type="button" className="geo-ai-agent-builder-primary-btn" onClick={() => void handleCopyEmbed()}>
                {copied ? 'Copied' : 'Copy note'}
              </button>
            </div>
            <p className="geo-ai-agent-builder-note">
              Deep-link tip: open the SI map, then use the Geo AI / AI Agent rail to restore this
              panel. Prefs already persist in this browser.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IconPickButton({
  option,
  selected,
  onSelect,
}: {
  option: { id: GeoAiAgentFabIconId; label: string; faClass: string };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`geo-ai-agent-builder-icon-pick${selected ? ' geo-ai-agent-builder-icon-pick--active' : ''}`}
      title={option.label}
      aria-label={option.label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <i className={option.faClass} aria-hidden />
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="geo-ai-agent-builder-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`geo-ai-agent-builder-switch${checked ? ' geo-ai-agent-builder-switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="geo-ai-agent-builder-switch-knob" />
      </button>
    </label>
  );
}
