/**
 * Geo Explorer–style Gemini helpers (see Free-AI-Things/Geo-Explorer).
 * API key must come from VITE_GEMINI_API_KEY — never commit real keys.
 */
import { stripGeoAiMapActionLines } from './geoAiCommandExecutor'

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

**4b. Executable map commands (MAP_ACTION) — for direct map control** — When the user clearly asks you to *control the map* ("turn NDVI off", "hide layer X", "set opacity to 50%", "zoom to the AOI", "zoom to layer Fields", "switch basemap to satellite", "center here"), emit one or more **MAP_ACTION** lines — each a single-line minified JSON object — BEFORE the GEO_AI_JSON trace. The app executes them on the live map. Use layer / basemap names exactly as they appear in "### LIVE MAP STATE". Supported ops (omit if not requested):
- {"op":"setLayerVisibility","layer":"<name>","visible":true|false}
- {"op":"setLayerOpacity","layer":"<name>","opacity":0..1}
- {"op":"zoomToLayer","layer":"<name>"}
- {"op":"zoomToAoi"}
- {"op":"switchBasemap","basemap":"<name>"}
- {"op":"flyTo","lng":<num>,"lat":<num>,"zoom":<num optional>,"label":"<optional>"}
- {"op":"searchPlace","query":"<place / address / POI text>"} — Google-Maps-style smart geocode (autocomplete + proximity to current view, Arabic & English) that flies to the best match and drops an info pin. Use this for ANY place/landmark/address/POI by name when you do NOT already have exact coordinates ("take me to Burj Khalifa", "find a hospital in Riyadh", "اذهب إلى برج خليفة", "أقرب محطة وقود"). Prefer this over guessing coordinates.
- {"op":"identifyBasemap","lng":<num optional>,"lat":<num optional>} — read the named places / POIs the basemap renders near a point (omit lng/lat to use the current map focus). Use for "what's here / around me / near this point / ما الذي حولي / ما هذا المكان".
- {"op":"openToolboxPanel","panel":"<id>"} — open a Satellite **map toolbox** analysis tool so the user can continue after drawing an AOI. Panel ids (aliases ok): \`remote-sensing\` (NDVI/NDWI/NDMI/WMS indices), \`imagery-time-series\`, \`flood-monitoring\` (SAR flood), \`well-site\`, \`hydro-watershed\`, \`aoi-edit\` (draw/edit AOI), \`layers\`, \`tree-detections\`, \`agri-field-boundary\`, \`crop-alerts\`, \`stress-zones\`. Use when the user asks to analyze vegetation/indices, run a time series, detect flood, recommend wells, or draw an AOI — open the panel rather than inventing analysis numbers that are not in LIVE MAP STATE.
- {"op":"gisBuffer","layer":"<name|AOI>","distance":500,"unit":"meters","output":"<optional>"} — create a buffer result layer.
- {"op":"gisIntersect","layerA":"<name>","layerB":"<name>"} — intersect two layers into a new result layer.
- {"op":"gisClip","layer":"<name>","clipLayer":"AOI"} — clip a layer by AOI/mask.
- {"op":"gisOp","tool":"dissolve|union|merge|erase|voronoi|convex_hull|area|select_by_location|export_layer",...} — other geoprocessing / export.
Format (one per line, no code fences):
MAP_ACTION:{"op":"setLayerVisibility","layer":"NDVI","visible":false}
Only emit MAP_ACTION for explicit control requests **or** when opening a toolbox panel is the right next step for an AOI analysis ask; for pure world-knowledge questions, answer with prose. Still confirm what you did in the prose (e.g. "Opened Remote sensing so you can pick NDVI on the AOI.").

**4g. Spatial geoprocessing** — When the user asks to buffer / intersect / clip / dissolve / merge / voronoi / calculate area / export a layer, prefer native \`gis_*\` / \`export_layer\` tools (or MAP_ACTION gis* when without native tools). Resolve layer names from LIVE MAP STATE; "this" means AOI or selection. Always add a **new** result layer and confirm its name — never mutate the source in place.

**4f. Satellite toolbox after AOI** — LIVE MAP STATE may list Toolbox + Available analysis tools. Workflow:
1) If no AOI and the user wants area analysis → open \`aoi-edit\` and ask them to draw, or confirm zoomToAoi when AOI exists.
2) Vegetation / NDVI / NDWI / NDMI / indices → open \`remote-sensing\` (and cite Active analysis class areas when already on).
3) Multi-date / trend / timeline → open \`imagery-time-series\`.
4) Flood / inundation / SAR → open \`flood-monitoring\`.
5) Well / drilling / hydro suitability → open \`well-site\` (or \`hydro-watershed\` for basins).
6) Never invent hectare/% numbers for an index that is not in LIVE MAP STATE Active analysis — open the tool instead and explain the next click.

**4d. World place / POI search (no layer needed) — works on ALL map data, basemap included.** Any place, address, landmark or POI on Earth is directly searchable; a loaded layer is NOT required. When the user asks to show / find / locate / navigate to a place ("show me Dubai", "where is Riyadh", "take me to the nearest pharmacy", "اعرض دبي على الخريطة", "ابحث عن أقرب مطعم"), emit a **MAP_ACTION searchPlace** with the place text (it performs Google-Maps-style smart search + autocomplete + fly-to + info pin) and answer **concisely**: one short line with the resolved **name, region/country, and coordinates** (e.g. "Dubai, United Arab Emirates — 25.2048, 55.2708"). No analysis, no headings. Match the user's language. Prefer a loaded layer feature only when the place clearly matches one (more accurate); otherwise use searchPlace. When the user just wants the camera at known coordinates use flyTo/MAP_QUERY instead.

**4e. Basemap data awareness** — The "### LIVE MAP STATE" block lists **basemap places / POIs near the current view** (name, category, distance, coordinates) read live from the basemap — treat these as facts. You can analyze and answer about basemap data (what's nearby, which POIs/roads/places are around the AOI or a point), not only user-added layers. For "what's here / around me / near this point" emit **identifyBasemap** (optionally with lng/lat). If the basemap is raster imagery the basemap-feature list is empty — fall back to searchPlace or say no named basemap features are rendered.

**4c. Live map awareness** — When a "### LIVE MAP STATE" block is present it is the AUTHORITATIVE, real-time snapshot of what the user sees: camera, basemap, drawn AOI (with measured area / centroid / bbox), the layer roster (visibility + opacity), the active analysis (index, scene date, resolution) with its live per-class legend areas, and the selected feature. Never ask the user to describe these — read them. Cite measured numbers (areas in ha/m², percentages) from this block rather than estimating.

**5. Smart analysis** — When both GIS attributes AND appended weather/agri heuristic blocks apply: tie concise bullets (e.g. vegetation/stress hints only when justified by provided NDVI + numeric weather/heuristic lines).

**5b. Analyst interpretation format** — When "### LIVE MAP STATE" reports an active analysis (NDVI / SAVI / NDWI / land cover / tree detection / terrain, etc.) and the user asks what it means / what's happening / which area is best/worst / how many hectares, answer as a GIS analyst using these compact labelled sections (omit any you cannot support from the data; keep each to 1–3 lines / tight bullets):
- **Summary** — one sentence.
- **Interpretation** — what the result means on the ground.
- **Statistics** — per-class Total Area in ha + m² + % (copy the live per-class areas from LIVE MAP STATE; never invent).
- **Findings** — dominant class, highest/lowest areas, any missing/expected class.
- **Decision** — a professional recommendation.
- **Suggested actions** — practical next steps.
- **Confidence** — qualitative (e.g. high/medium/low) with the basis (scene date, AOI size, data source).
Cite the data source (Sentinel-2 imagery + scene date, OpenWeather/Open-Meteo, model name) and label values as measured / satellite-derived / AI-estimated. Never present an estimate as a measured fact.

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

/** Compact pack / tool evidence for Neighborhood Agent Chat (optional on model turns). */
export type GeoExplorerAgentEvidence = {
  packId?: string | null;
  packLabel?: string | null;
  thoughtTitle: string;
  tools: Array<{
    name: string;
    label: string;
    ok: boolean;
    preview: string;
  }>;
};

export type GeoExplorerMessage = {
  id: string;
  role: 'user' | 'model';
  parts: GeoExplorerPart[];
  /** Present when an analyst pack (or native tools) produced Viewed / Thought chips. */
  agentEvidence?: GeoExplorerAgentEvidence;
  /** Optional map pin for Neighborhood Agent “Focus map” chip. */
  mapFocus?: { lng: number; lat: number; label?: string };
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

/**
 * Loose fallback: extract the first plausible WGS84 coordinate pair from model
 * prose (e.g. "Dubai, United Arab Emirates — 25.2048, 55.2708") when the model
 * answered a "locate / show me X" question but omitted the MAP_QUERY / MAP_ACTION
 * tag. The Geo AI prose convention is "lat, lng"; ranges are validated and the
 * swapped order is tried as a fallback. Returns [lng, lat] or null.
 *
 * To avoid false positives on normalized index values ("NDVI 0.5, 0.3"), at
 * least one of the two numbers must have |value| >= 1, and both must carry a
 * decimal point. Skipped entirely when a structured tag is already present.
 */
export function parseLooseLatLngFromReply(text: string): [number, number] | null {
  if (!text) return null;
  if (/MAP_QUERY:/i.test(text) || /MAP_ACTION:/i.test(text)) return null;
  const re = /(-?\d{1,3}\.\d+)\s*[,/]\s*(-?\d{1,3}\.\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a) < 1 && Math.abs(b) < 1) continue;
    // Prose convention is "lat, lng" → return as [lng, lat].
    if (isValidLngLat(b, a)) return [b, a];
    // Tolerate "lng, lat".
    if (isValidLngLat(a, b)) return [a, b];
  }
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

/** Chat bubble display: MAP_QUERY line, MAP_ACTION command lines, server map-pin / geocode appendix, Copilot JSON trace, and literal `*` (markdown noise). */
export function stripGeoExplorerBubbleDisplayText(text: string): string {
  return stripGeoAiMapActionLines(stripGeoAiCopilotJsonLine(stripGeoAiModelMetaAppend(stripMapQueryLine(text))))
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
