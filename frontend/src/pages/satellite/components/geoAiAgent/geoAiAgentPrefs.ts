/** Agent Builder prefs — Layout / Style / Content / Embed, scoped localStorage. */

export const GEO_AI_AGENT_PREFS_LS_KEY = 'si-sat-geo-ai-agent-prefs-v1';

export type GeoAiAgentLayoutMode = 'docked' | 'embedded';

export type GeoAiAgentModelTab = 'claude' | 'deepseek' | 'gemini' | 'ollama';

export type GeoAiAgentFabIconId = 'sparkles' | 'robot' | 'comments' | 'wand' | 'globe';

export type GeoAiAgentChipPref = {
  id: string;
  label: string;
  prompt: string;
};

export type GeoAiAgentPrefs = {
  layoutMode: GeoAiAgentLayoutMode;
  fabOpenIcon: GeoAiAgentFabIconId;
  fabCloseIcon: GeoAiAgentFabIconId;
  showNewChatButton: boolean;
  showHistoryButton: boolean;
  greetingText: string;
  helpPromptText: string;
  chips: GeoAiAgentChipPref[];
  defaultModelTab: GeoAiAgentModelTab;
};

export const GEO_AI_AGENT_FAB_ICON_OPTIONS: Array<{
  id: GeoAiAgentFabIconId;
  label: string;
  faClass: string;
}> = [
  { id: 'sparkles', label: 'Sparkles', faClass: 'fa-solid fa-sparkles' },
  { id: 'robot', label: 'Robot', faClass: 'fa-solid fa-robot' },
  { id: 'comments', label: 'Chat', faClass: 'fa-solid fa-comments' },
  { id: 'wand', label: 'Wand', faClass: 'fa-solid fa-wand-magic-sparkles' },
  { id: 'globe', label: 'Globe', faClass: 'fa-solid fa-globe' },
];

export const DEFAULT_GEO_AI_AGENT_CHIPS: GeoAiAgentChipPref[] = [
  {
    id: 'analyze-aoi',
    label: 'Analyze AOI →',
    prompt:
      'Analyze this AOI using the current map layers, remote sensing context, building density, and weather.',
  },
  {
    id: 'count-buildings',
    label: 'Count buildings →',
    prompt:
      'Count buildings and estimate building/road density in the current AOI or visible map extent from loaded vector layers.',
  },
  {
    id: 'vegetation',
    label: 'Vegetation health →',
    prompt:
      'Summarize vegetation health for the current AOI using NDVI / Layer Live indices if available.',
  },
  {
    id: 'flood-slope',
    label: 'Flood / slope context →',
    prompt:
      'Give flood, slope, and heat (LST / weather) context for the current AOI using available layers and map state.',
  },
];

export const DEFAULT_GEO_AI_AGENT_PREFS: GeoAiAgentPrefs = {
  layoutMode: 'docked',
  fabOpenIcon: 'sparkles',
  fabCloseIcon: 'sparkles',
  showNewChatButton: true,
  showHistoryButton: true,
  greetingText: 'Hello, {name}!',
  helpPromptText: 'How can I help?',
  chips: DEFAULT_GEO_AI_AGENT_CHIPS.map(c => ({ ...c })),
  defaultModelTab: 'ollama',
};

export function fabIconFaClass(id: GeoAiAgentFabIconId): string {
  return GEO_AI_AGENT_FAB_ICON_OPTIONS.find(o => o.id === id)?.faClass ?? 'fa-solid fa-sparkles';
}

function isModelTab(v: unknown): v is GeoAiAgentModelTab {
  return v === 'claude' || v === 'deepseek' || v === 'gemini' || v === 'ollama';
}

function isFabIcon(v: unknown): v is GeoAiAgentFabIconId {
  return (
    v === 'sparkles' || v === 'robot' || v === 'comments' || v === 'wand' || v === 'globe'
  );
}

function normalizeChip(raw: unknown, index: number): GeoAiAgentChipPref | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : '';
  if (!label || !prompt) return null;
  const id =
    typeof o.id === 'string' && o.id.trim()
      ? o.id.trim()
      : `chip-${index}-${label.toLowerCase().replace(/\s+/g, '-').slice(0, 24)}`;
  return { id, label, prompt };
}

export function normalizeGeoAiAgentPrefs(raw: unknown): GeoAiAgentPrefs {
  const base = DEFAULT_GEO_AI_AGENT_PREFS;
  if (!raw || typeof raw !== 'object') return { ...base, chips: base.chips.map(c => ({ ...c })) };
  const o = raw as Record<string, unknown>;

  const chipsRaw = Array.isArray(o.chips) ? o.chips : null;
  const chips =
    chipsRaw == null
      ? base.chips.map(c => ({ ...c }))
      : chipsRaw
          .map((c, i) => normalizeChip(c, i))
          .filter((c): c is GeoAiAgentChipPref => c != null)
          .slice(0, 12);

  return {
    layoutMode: o.layoutMode === 'embedded' ? 'embedded' : 'docked',
    fabOpenIcon: isFabIcon(o.fabOpenIcon) ? o.fabOpenIcon : base.fabOpenIcon,
    fabCloseIcon: isFabIcon(o.fabCloseIcon) ? o.fabCloseIcon : base.fabCloseIcon,
    showNewChatButton: o.showNewChatButton !== false,
    showHistoryButton: o.showHistoryButton !== false,
    greetingText:
      typeof o.greetingText === 'string' && o.greetingText.trim()
        ? o.greetingText.trim().slice(0, 120)
        : base.greetingText,
    helpPromptText:
      typeof o.helpPromptText === 'string' && o.helpPromptText.trim()
        ? o.helpPromptText.trim().slice(0, 120)
        : base.helpPromptText,
    chips: chips.length > 0 ? chips : base.chips.map(c => ({ ...c })),
    defaultModelTab: isModelTab(o.defaultModelTab) ? o.defaultModelTab : base.defaultModelTab,
  };
}

export function readGeoAiAgentPrefs(storageKey: string): GeoAiAgentPrefs {
  try {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_GEO_AI_AGENT_PREFS, chips: DEFAULT_GEO_AI_AGENT_PREFS.chips.map(c => ({ ...c })) };
    }
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { ...DEFAULT_GEO_AI_AGENT_PREFS, chips: DEFAULT_GEO_AI_AGENT_PREFS.chips.map(c => ({ ...c })) };
    }
    return normalizeGeoAiAgentPrefs(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_GEO_AI_AGENT_PREFS, chips: DEFAULT_GEO_AI_AGENT_PREFS.chips.map(c => ({ ...c })) };
  }
}

export function writeGeoAiAgentPrefs(prefs: GeoAiAgentPrefs, storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeGeoAiAgentPrefs(prefs)));
  } catch {
    // ignore quota / private mode
  }
}

export function formatGeoAiAgentGreeting(template: string, name: string): string {
  const safeName = name.trim() || 'there';
  if (template.includes('{name}')) return template.split('{name}').join(safeName);
  return template;
}

/** Read-only embed note for SI map (no external iframe product yet). */
export function buildGeoAiAgentEmbedSnippet(): string {
  return [
    '<!-- AgroCloud AI Agent — Satellite Intelligence map -->',
    'Deep-link: open Satellite Intelligence, then the AI Agent rail (Geo AI).',
    'Embedded layout places the agent in the analysis dock when a host panel is available;',
    'docked layout keeps the floating map widget.',
    'Prefs persist in localStorage key: ' + GEO_AI_AGENT_PREFS_LS_KEY,
  ].join('\n');
}
