/**
 * Geo Explorer–style Gemini helpers (see Free-AI-Things/Geo-Explorer).
 * API key must come from VITE_GEMINI_API_KEY — never commit real keys.
 */

export const GEO_EXPLORER_SYSTEM_PROMPT = `You are "Geo Explorer" / Geo AI: a concise assistant inside a map workspace (satellite globe or GIS map).

**Natural language (no fixed commands):** Users may phrase requests freely — e.g. “show me…”, “describe…”, “find…”, “display on the map…”, “what is…”, “where is…”, Arabic equivalents. There is **no** required template (you do not need phrases like “from LayerName”). Infer intent, extract names/codes/field values from their wording, and tie answers to **Added layers** and **GIS Content** summaries when those layers are listed.

**Data-first:** When the system message includes vector layer summaries (active layers and/or GIS Content), any question about layer names, fields/attributes, feature IDs, counts, averages, or distributions MUST be answered **only** from that layer text. Be brief and professional: short **Interpretation** (1–3 sentences), then **Key attributes** or **Summary stats** as tight bullets (\`Field: value\`). Do not invent field values, counts, or coordinates that are not supported by the layer summaries.

**General geography:** If the question is clearly about world places, navigation, or imagery with **no** tie to the listed layers, you may use general knowledge — still stay concise.

**MAP_QUERY discipline:** Output MAP_QUERY **only** when a single WGS84 point is justified: either (a) explicitly requested by the user with reliable coordinates, or (b) a feature centroid from LAYER DATA that truly matches the question. Before saying an id/code/name is **not** in the data, check **every** attribute column listed in the fields=[…] lines, the per-layer **value catalogs** (all string fields sampled), **example attributes**, and any **### RESOLVED LAYER FEATURE** block — matches often live in Structure_Name, Unit_ID, tags, etc., not only Farm_Code/Farm_Name. If still absent after that, say it is **not in the loaded features** (Arabic or English to match the user) and **omit MAP_QUERY** — never substitute a random city or unrelated feature.

When the user should see ONE clear point on the map, end with a new line exactly:
MAP_QUERY:<longitude>,<latitude>
Example: MAP_QUERY:55.2708,25.2048
If there is no single justified location, omit MAP_QUERY entirely.
Do not put MAP_QUERY inside markdown code fences.`;

/**
 * Satellite “Geo AI” / GIS Geo Explorer shared Copilot contract (Gemini + Claude + DeepSeek system prompts).
 * Spatial priorities align with `geoAiWeatherEngine.resolveGeoAiWeatherFactsCoords`; map fly uses MAP_QUERY.
 */
export const GEO_AI_COPILOT_RULES = `### GEO AI COPILOT (mission — integrate GIS + map + weather)
You are **Geo AI Copilot**: an advanced geospatial assistant wired to vector layers, map anchors, and (when appended below) weather APIs.

**1. Spatial context (determine location before answering)** — priority order for interpreting user intent:
- **a)** Map focus / pin / “here” → "### SESSION MAP ANCHOR" or "### WEATHER COORDINATE SOURCE: map_anchor"
- **b)** Selected feature / popup / inspect (“this farm”, هذه المزرعة) → inspect/popup coordinates in coordinate-source blocks
- **c)** **GIS layer attributes** → centroid from "### RESOLVED LAYER FEATURE" or best attribute match (farm/code/name/category/crop/type fields across ALL serialized columns and catalogs — not keyword lookup only)
- **d)** Place name → geocoder-derived coordinates only when blocks explicitly tied geocoding to facts

When SYSTEM lacks usable coordinates for weather/spatial tasks: briefly ask (Arabic or English to match user) to click the map, pick a feature, or name a place clearly.

**2. GIS intelligence** — Layer mentions imply searching summaries across attributes (codes, names, crop/category/type/site strings). Prefer authoritative "### RESOLVED LAYER FEATURE" JSON when present. Never claim absence until catalogs/resolv blocks contradict.

**2b. Map-driven selection (client)** — When the user asks for **Select by attributes** with a \`WHERE …\` clause, **Select by location** (within / intersect / overlap a named layer), **Near / buffer** phrasing (treated as intersect-with-mask when a mask layer exists), or SQL-like filters on layer fields, the app runs a **local Geo AI stats pipeline** first: results render as an **interactive attribute table** (search, sort, optional extra fields, multi-row selection, CSV/Excel export) and **map fit + highlight** sync without reload. Encourage precise layer names, \`WHERE\` syntax (\`=\`, \`<>\`, \`LIKE\`, \`IN (...)\`, \`AND\` / \`OR\`), and clear mask layer names for spatial filters. Mention the table explicitly when rows are returned.

**3. Weather integration** — All numeric weather must come **only** from "### OPENWEATHER FACTS", "### OPEN-METEO FACTS", or "### OPEN-METEO COMPACT" when present (temperature, humidity, wind, forecast). Do not invent values.

**4. Map actions (conceptual → app)** — You drive behavior via prose plus MAP_QUERY when a justified single point exists:
- **zoomTo** ≈ output MAP_QUERY:<lng>,<lat> on its own line (same constraints as above).
- **highlightFeature / popup data** ≈ resolved GIS attributes shown from "### RESOLVED LAYER FEATURE"; cite matching summary briefly.

**5. Smart analysis** — When both GIS attributes AND appended weather/agri heuristic blocks apply: tie concise bullets (e.g. vegetation/stress hints only when justified by provided NDVI + numeric weather/heuristic lines).

**6. Structured trace — REQUIRED EVERY REPLY** — After all prose for the user, emit exactly **one final line** (single-line JSON, no markdown fences):
GEO_AI_JSON:{...minified JSON on one line...}

Strict schema (omit unused keys or use {}):
{"intent":"weather"|"gis_search"|"analysis"|"unknown","location":{"lat":number|null,"lon":number|null},"feature":{},"action":"zoom"|"highlight"|"weather"|"none","data":{},"insight":"","response":"<≤260 chars echo summary>"}

- **intent**: classify dominant purpose this turn.
- **location.lat/lon**: primary analytical coords used or null if undetermined.
- **feature**: key/value subset only when GIS matched one logical entity (else {}).
- **action**: zoom → MAP_QUERY present this reply; highlight → authoritative FEATURE/resolv tie without MAP_QUERY; weather → weather facts relied on.
- **data**: optional numeric crumbs actually sourced from CONTEXT blocks only (no hallucinations).
- **insight**: one tight analytic clause when GIS+weather combined OR optional heuristic justified OR empty string.
- **response**: short recap copied tone/language from main prose.

**7. Language** — Reply language mirrors user (Arabic/English/etc.); keep prose concise.

**8. Fail-safe** — No fabricated coords or figures; when anchors+facts insufficient for spatial confidence, ask for clarification per §1.`;

/** Appended when LAYER DATA blocks are present (Added layers + GIS Content). */
export const GEO_EXPLORER_LAYER_RULES = `LAYER DATA rules (when "LAYER DATA" / layer list / GIS Content sections appear):
- **Natural phrasing:** Treat “show / describe / find / display / highlight / zoom to …” as requests about layer data when the message also names a layer, asset id/code, field concept, or map surface — same as explicit “query layer X”.
- **Priority:** Facts, statistics, and locations must come from those layers (and GIS Content) before any general web knowledge whenever the user mentions layers, fields, features, parcels, or tabular values.
- **Concise analyst tone:** Short interpretation + bullets; for numeric summaries give one clear sentence (e.g. dominant class, approximate range) only if supported by the provided samples — no hallucinated precision.
- **Domains:** When samples show domain/subtype descriptions ("Label (stored code: …)"), use the human-readable label in answers.
- **Id catalogs & resolved rows:** Lines that include **"Layer id catalog"** list real attribute values sampled from **all** loaded features across **many** fields (not only Farm_Code). A **"### RESOLVED LAYER FEATURE"** block is a confident match for the current user message. If either contains the user’s id/code/name fragment, treat it as present—**never** say "not found" only because the one-line "example attributes" showed a different row.
- **Not found:** Only if the requested text is absent from **every** field catalog, RESOLVED blocks, and attribute JSON in the layer summaries for the layers the user cares about, state that it is **not in the loaded feature data** (e.g. "غير موجود في بيانات الطبقات المحمّلة" / "Not in the loaded layer data") and **omit MAP_QUERY**. Never move the map to a substitute location.
- **MAP_QUERY:** Only when a single feature match is evident from LAYER DATA or the user gave explicit coordinates. Never output MAP_QUERY for a "best guess" world city when the user asked about layer data that is missing.
- **General questions:** If there is no layer tie, answer from general knowledge; MAP_QUERY only when a single global place is clearly intended.`;

/** Shipped with Geo AI when a map pin / anchor exists — keeps follow-ups coherent and ties weather to coordinates. */
export const GEO_EXPLORER_SESSION_AND_WEATHER = `Session continuity & weather (read carefully when the next blocks appear):
- If a "### SESSION MAP ANCHOR" section is present, those coordinates are the app’s current map focus (pin or last explicit MAP_QUERY). Short follow-ups (“same place”, “here”, “that farm”, “weather there”, Arabic equivalents) refer to THIS anchor unless the user clearly names a different place or layer.
- If "### OPENWEATHER FACTS" is present (with "### WEATHER_ANSWER_RULES"), **primary** numeric weather for that question must come from that OpenWeather block for the stated “Point:” coordinates—follow WEATHER_ANSWER_RULES exactly. Cite “OpenWeather” once.
- If "### OPEN-METEO COMPACT" appears **together with** OPENWEATHER, it is an **alternative / cross-check** (still same coordinates). Prefer OpenWeather for the main answer unless it clearly failed; cite “Open-Meteo” only if you repeat its numbers.
- If "### OPEN-METEO FACTS" appears **without** OPENWEATHER (no API key case), base numeric weather on Open-Meteo only; cite “Open-Meteo” once. Do not invent numbers beyond the block.
- OPENWEATHER / OPEN-METEO blocks use the **same coordinates as SESSION MAP ANCHOR** when the anchor is present. Do **not** say the weather is for a different point than a layer feature (e.g. MH105) when the facts’ coordinates are that feature’s resolved location—the facts **are** that place for atmosphere data. Never steer the user to another city or coordinates they did not ask about.
- If the user asks for a **specific calendar day** and the facts do not contain usable data for that day (see NO_DATA_FOR_REQUESTED_DAY or failed requests), respond professionally that data could not be obtained: Arabic → **لم أتحصل على بيانات**; English → a short “I could not obtain data for that date/location.” Do **not** answer with “current” or unrelated dates as a stand-in.
- If OPEN-METEO or OpenWeather shows only fetch/API errors and no usable numbers, say so briefly—do not invent values.
- Keep answers concise: a short lead paragraph, then bullets if helpful; avoid dumping raw JSON from layer context.
- Conversations are sequential: short follow-ups (“coordinates of that place”, “same feature”, “what country”, “أعطني الإحداثيات”, “نفس الموقع”) refer to the last matched feature or SESSION MAP ANCHOR unless the user names a new layer or ID.`;

/** Row ↔ map actions (GIS feature cache or lon/lat fallback). */
export type GeoExplorerMapLink =
  | { type: 'feature'; layerId: string; featureKey: string }
  | { type: 'coords'; lng: number; lat: number; layerName?: string };

export type GeoExplorerDataTableKind =
  | 'summary'
  | 'statistics'
  | 'groupBy'
  | 'query'
  | 'spatial'
  | 'calculateField'
  | 'markdown';

export type GeoExplorerDataTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** When false, the column stays in data/export but is hidden until the user expands “More fields”. */
  defaultVisible?: boolean;
};

export type GeoExplorerDataTableRow = {
  values: Record<string, string | number | null>;
  mapLink?: GeoExplorerMapLink;
};

export type GeoExplorerDataTablePayload = {
  title?: string;
  kind: GeoExplorerDataTableKind;
  columns: GeoExplorerDataTableColumn[];
  rows: GeoExplorerDataTableRow[];
  foot?: Record<string, string | number | null>;
};

export type GeoExplorerPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; base64: string }
  | { type: 'dataTable'; table: GeoExplorerDataTablePayload };

export type GeoExplorerMessage = {
  id: string;
  role: 'user' | 'model';
  parts: GeoExplorerPart[];
};

/** Replace user text parts; preserves image / non-text parts. Empty text drops text parts only. */
export function replaceUserMessageText(msg: GeoExplorerMessage, newText: string): GeoExplorerMessage {
  if (msg.role !== 'user') return msg;
  const trimmed = newText.trim();
  const kept = msg.parts.filter((p): p is Exclude<GeoExplorerPart, { type: 'text' }> => p.type !== 'text');
  const textParts: GeoExplorerPart[] = trimmed ? [{ type: 'text', text: trimmed }] : [];
  return { ...msg, parts: [...textParts, ...kept] };
}

function isValidLngLat(lng: number, lat: number): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

/** Parse MAP_QUERY from model output; accepts lng,lat or corrects to lng,lat if only swapped pair is valid. */
export function parseMapQueryLngLat(text: string): [number, number] | null {
  const m = text.match(/MAP_QUERY:\s*([-\d.]+)\s*,\s*([-\d.]+)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (isValidLngLat(a, b)) return [a, b];
  if (isValidLngLat(b, a)) return [b, a];
  return null;
}

export function messageDisplayText(msg: GeoExplorerMessage): string {
  const chunks: string[] = [];
  for (const p of msg.parts) {
    if (p.type === 'text') chunks.push(p.text);
    else if (p.type === 'dataTable') {
      const t = p.table;
      chunks.push(`[Table: ${t.title ?? t.kind} (${t.rows.length} rows)]`);
    }
  }
  return chunks.join('\n');
}

export function stripMapQueryLine(text: string): string {
  return text
    .replace(/\r?\nMAP_QUERY:\s*[^\n]+/gi, '')
    .replace(/^MAP_QUERY:\s*[^\n]+\r?\n?/i, '')
    .trimEnd();
}

/** UI-only: remove appended map meta the server adds after model text (keep stored history intact for MAP_QUERY). */
export function stripGeoAiModelMetaAppend(text: string): string {
  let t = text.trimEnd()
  t = t.replace(/\n\n\(Map centered on the best place-name match for your message\.\)/gi, '')
  t = t.replace(/\n\n\(Map centered on "[^"]*" — geocoder confidence OK\.\)/gi, '')
  t = t.replace(/\n\n\(Map pin from layer[\s\S]*$/m, '')
  t = t.replace(/\n\n\*\*Map:\*\*[\s\S]*$/, '')
  return t.trimEnd()
}

/** Remove trailing Geo AI Copilot machine trace (single-line GEO_AI_JSON:{...}). */
export function stripGeoAiCopilotJsonLine(text: string): string {
  const t = text.trimEnd()
  const tag = 'GEO_AI_JSON:'
  const idx = t.lastIndexOf(tag)
  if (idx < 0) return text
  const lineStart = t.lastIndexOf('\n', idx)
  const cut = lineStart >= 0 ? t.slice(0, lineStart) : t.slice(0, idx)
  return cut.trimEnd()
}

/** Chat bubble display: MAP_QUERY line, server map-pin / geocode appendix, Copilot JSON trace, and literal `*` (markdown noise). */
export function stripGeoExplorerBubbleDisplayText(text: string): string {
  return stripGeoAiCopilotJsonLine(stripGeoAiModelMetaAppend(stripMapQueryLine(text)))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*/g, '')
    .trimEnd()
}

function partsToGeminiPayload(parts: GeoExplorerPart[]): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
  const out: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  for (const p of parts) {
    if (p.type === 'text') out.push({ text: p.text });
    else if (p.type === 'image') out.push({ inline_data: { mime_type: p.mime, data: p.base64 } });
    else {
      const tbl = p.table;
      const head = tbl.columns.map(c => c.label).join(' | ');
      const preview = tbl.rows
        .slice(0, 12)
        .map(r => tbl.columns.map(c => String(r.values[c.key] ?? '')).join(' | '))
        .join('\n');
      const summary = `[Geo AI structured table omitted from vision — ${tbl.kind}: ${tbl.rows.length} rows. Columns: ${head}${preview ? `\nSample:\n${preview}` : ''}]`;
      out.push({ text: summary });
    }
  }
  return out;
}

export type GeminiContent = { role: 'user' | 'model'; parts: ReturnType<typeof partsToGeminiPayload> };

export function messagesToGeminiContents(messages: GeoExplorerMessage[]): GeminiContent[] {
  return messages.map(m => ({
    role: m.role,
    parts: partsToGeminiPayload(m.parts),
  }));
}

/** Newest model message first: returns [lng, lat] from the first MAP_QUERY line found. */
export function lastMapQueryCoordsFromMessages(messages: GeoExplorerMessage[]): [number, number] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'model') continue
    const c = parseMapQueryLngLat(messageDisplayText(m))
    if (c) return c
  }
  return null
}

/** Claude / DeepSeek Geo AI: plain `{text}` history or full `GeoExplorerMessage` parts. */
export function lastMapQueryCoordsFromSimpleChatHistory(
  messages: Array<{ role: string; text?: string; parts?: GeoExplorerPart[] }>,
): [number, number] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant' && m.role !== 'model') continue
    const raw =
      Array.isArray(m.parts) && m.parts.length
        ? m.parts
            .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
            .map(p => p.text)
            .join('\n')
        : typeof m.text === 'string'
          ? m.text
          : ''
    const c = parseMapQueryLngLat(raw)
    if (c) return c
  }
  return null
}

/**
 * Stable IDs first (see https://ai.google.dev/gemini-api/docs/models).
 * Avoid deprecated aliases like `gemini-1.5-flash-latest` — they often return 404 on v1beta.
 * Do not prefer gemini-2.0-flash early: many keys still show free-tier quota 0 for 2.0 Flash.
 */
const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
] as const;

/** Try v1beta first (supports `systemInstruction`); v1 REST rejects that field — merge system into `contents` for v1. */
const GEMINI_API_VERSIONS = ['v1beta', 'v1'] as const;

/** v1 `generateContent` does not accept `systemInstruction`; prefix the first user turn (clone, do not mutate caller `contents`). */
function mergeSystemIntoContents(systemInstruction: string, contents: GeminiContent[]): GeminiContent[] {
  const prefix = `System (follow strictly):\n${systemInstruction}\n\n---\n\n`
  const out: GeminiContent[] = contents.map(row => ({
    role: row.role,
    parts: row.parts.map(part => ({ ...part })),
  }))
  const userIdx = out.findIndex(r => r.role === 'user')
  if (userIdx < 0) {
    return [{ role: 'user', parts: [{ text: prefix.trimEnd() }] }, ...out]
  }
  const parts = [...out[userIdx]!.parts]
  if (parts.length === 0) {
    parts.push({ text: prefix.trimEnd() })
  } else {
    const first = parts[0] as { text?: string; inline_data?: { mime_type: string; data: string } }
    if (typeof first?.text === 'string') {
      parts[0] = { text: prefix + first.text }
    } else {
      parts.unshift({ text: prefix.trimEnd() })
    }
  }
  out[userIdx] = { role: 'user', parts }
  return out
}

function isNonRetryableGeminiAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('api key not valid') ||
    m.includes('invalid api key') ||
    m.includes('invalid argument') && m.includes('key')
  );
}

function shouldTryNextGeminiModel(status: number, message: string): boolean {
  const m = message.toLowerCase();
  return (
    status === 404 ||
    status === 400 ||
    status === 403 ||
    status === 429 ||
    status === 503 ||
    m.includes('quota') ||
    m.includes('exceeded') ||
    m.includes('billing') ||
    m.includes('limit: 0') ||
    m.includes('resource_exhausted') ||
    m.includes('resource exhausted') ||
    m.includes('rate limit') ||
    m.includes('rate_limit') ||
    m.includes('overloaded') ||
    m.includes('not found') ||
    m.includes('is not found') ||
    m.includes('not supported') ||
    m.includes('permission_denied') ||
    m.includes('permission denied')
  );
}

export async function geminiGenerateContent(params: {
  apiKey: string;
  systemInstruction: string;
  contents: GeminiContent[];
}): Promise<string> {
  const { apiKey, systemInstruction, contents } = params;
  let lastErr = 'Unknown error';

  for (const model of GEMINI_MODEL_CANDIDATES) {
    for (const apiVersion of GEMINI_API_VERSIONS) {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body =
        apiVersion === 'v1beta'
          ? {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
            }
          : { contents: mergeSystemIntoContents(systemInstruction, contents) }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`;
        if (isNonRetryableGeminiAuthError(String(lastErr))) throw new Error(lastErr);
        if (shouldTryNextGeminiModel(res.status, String(lastErr))) {
          /* try next apiVersion or next model */
          continue;
        }
        throw new Error(lastErr);
      }
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text)
          .filter(Boolean)
          .join('') ?? '';
      if (!text) {
        lastErr = 'Empty model response';
        continue;
      }
      return text;
    }
  }

  const hint =
    /quota|exceeded|rate|billing|limit:\s*0/i.test(lastErr)
      ? ' Enable billing in Google AI Studio / Cloud console, or wait and retry; free-tier limits vary by model.'
      : '';
  throw new Error(`${lastErr}${hint}`);
}
