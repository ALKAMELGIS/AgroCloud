/**
 * Geo AI Agent turn runner.
 *
 * 1. Snapshot live map state into the system prompt
 * 2. Prefer native tools (Gemini functionDeclarations / Claude tool_use / DeepSeek tools)
 * 3. Fall back to MAP_ACTION / MAP_QUERY text protocol for Ollama (and any adapter without tools)
 * 4. Execute tools → append results → optional second model step
 * 5. Surface a user-visible answer with Summary / Evidence / Map actions
 */

import {
  agroChatWithDeepSeek,
  agroChatWithOllama,
} from './agroAiChat'
import { claudeGeoAiComplete } from './geoAiChatClaude'
import {
  executeGeoAiMapCommands,
  parseGeoAiMapCommands,
  stripGeoAiMapActionLines,
  type GeoAiMapCommandHandlers,
  type GeoAiMapCommandResult,
} from './geoAiCommandExecutor'
import {
  buildGeoAiLiveMapStateBlock,
  type GeoAiLiveMapState,
} from './geoAiLiveMapContext'
import {
  geminiGenerateContent,
  parseMapQueryLngLat,
  stripGeoAiCopilotJsonLine,
  stripMapQueryLine,
  type GeminiContent,
} from './geoExplorerGemini'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'
import {
  collectMapActionSummaries,
  executeGeoAiAgentTool,
  formatToolResultsForModel,
  getClaudeToolDefinitions,
  getGeminiFunctionDeclarations,
  getOpenAiCompatibleTools,
  type GeoAiAgentToolHost,
  type GeoAiAgentToolResult,
  type GeoAiAgentWeatherFetcher,
} from './geoAiAgentTools'
import {
  buildGeoAiAnalystPackToolCalls,
  classifyGeoAiAnalystIntent,
  geoAiAnalystPackLabel,
  type GeoAiAnalystPackId,
} from './geoAiAnalystPacks'
import type { GeoAiStatsResult } from './geoAiStatsEngine'

export type GeoAiAgentProvider = 'gemini' | 'claude' | 'deepseek' | 'ollama'

export type GeoAiAgentChatTurn = { role: 'user' | 'assistant'; text: string }

export type GeoAiAgentToolCall = {
  id: string
  name: string
  args: Record<string, unknown>
}

export type GeoAiAgentModelStep = {
  text: string
  toolCalls: GeoAiAgentToolCall[]
  /** Raw provider payload bits needed to continue a multi-turn tool loop. */
  raw?: unknown
}

/**
 * Pluggable model adapter. Built-in factories cover Gemini / Claude / DeepSeek / Ollama;
 * tests can inject a mock.
 */
export type GeoAiAgentModelAdapter = {
  provider: GeoAiAgentProvider
  supportsNativeTools: boolean
  complete: (input: {
    system: string
    turns: GeoAiAgentChatTurn[]
    userMessage: string
    /** Prior tool-loop continuation messages (provider-specific encoding as plain turns when possible). */
    continuation?: GeoAiAgentChatTurn[]
    toolsEnabled: boolean
    priorToolRound?: {
      assistantText: string
      toolCalls: GeoAiAgentToolCall[]
      toolResults: GeoAiAgentToolResult[]
    }
  }) => Promise<GeoAiAgentModelStep>
}

export type GeoAiAgentTurnParams = {
  provider: GeoAiAgentProvider
  /** Override the built-in adapter (tests / custom backends). */
  adapter?: GeoAiAgentModelAdapter
  apiKey?: string
  ollama?: { baseUrl: string; model: string }
  /** Base system instruction (Copilot rules + data context, etc.). */
  systemInstruction: string
  history: GeoAiAgentChatTurn[]
  userMessage: string
  liveMapState: GeoAiLiveMapState | null | undefined
  vectorLayers: GeoAiMapLayer[]
  mapHandlers: GeoAiMapCommandHandlers
  weatherFetcher?: GeoAiAgentWeatherFetcher
  /** Cap native tool rounds (default 2 = call tools once, then final answer). */
  maxToolRounds?: number
  /**
   * When MAP_ACTION lines appear (Ollama / text fallback), execute them via mapHandlers.
   * Defaults to true.
   */
  executeMapActionsFromText?: boolean
  /**
   * Quick-action chip id (e.g. `vegetation`) — preferred over free-text classify
   * for analyst pack selection.
   */
  chipId?: string | null
  /**
   * Force a specific analyst pack (tests / callers). `null` disables packs;
   * omit to auto-classify from chipId / userMessage.
   */
  analystPackId?: GeoAiAnalystPackId | null
  /** When false, skip auto analyst-pack preflight (default true). */
  enableAnalystPacks?: boolean
}

export type GeoAiAgentTurnResult = {
  /** Display text with Summary / Evidence / Map actions sections when tools ran. */
  replyText: string
  /** Raw final model prose (before evidence packaging). */
  rawModelText: string
  toolResults: GeoAiAgentToolResult[]
  mapCommandResults: GeoAiMapCommandResult[]
  usedNativeTools: boolean
  usedMapActionFallback: boolean
  /** Analyst pack that auto-ran tools this turn, if any. */
  usedAnalystPack?: GeoAiAnalystPackId | null
  /** Optional table from vector stats for the chat bubble. */
  table?: GeoExplorerDataTablePayload
  mapFirstSync?: GeoAiStatsResult['mapFirstSync']
  /** MAP_QUERY coords if the model (or fallback) requested a pin. */
  mapQueryLngLat?: [number, number] | null
}

const NATIVE_TOOL_SYSTEM_ADDENDUM = `### GIS AGENT TOOLS
You have executable GIS tools for map control, vector statistics, live RS/legend readout, and weather.
- Prefer calling tools for facts (counts, class areas, weather numbers, map actions) instead of inventing them.
- After tool results arrive, write a concise analyst answer for the user.
- Structure the final user-facing answer with these headings when tools were used:
  **Summary** — 1–3 sentences
  **Evidence** — bullets citing tool outputs (layer names, areas, counts, dates)
  **Map actions** — what changed on the map (or "None")
- Do not invent MAP_ACTION lines when native tools are available; call the tools instead.`

const MAP_ACTION_FALLBACK_ADDENDUM = `### MAP_ACTION / MAP_QUERY (text protocol — no native tools)
When you need to control the map, emit one or more single-line commands BEFORE any GEO_AI_JSON trace:
MAP_ACTION:{"op":"flyTo","lng":55.27,"lat":25.20,"zoom":12}
MAP_ACTION:{"op":"zoomToAoi"}
MAP_ACTION:{"op":"setLayerVisibility","layer":"NDVI","visible":false}
MAP_ACTION:{"op":"setLayerOpacity","layer":"Parcels","opacity":0.5}
MAP_ACTION:{"op":"switchBasemap","basemap":"satellite"}
MAP_ACTION:{"op":"searchPlace","query":"Dubai"}
MAP_ACTION:{"op":"identifyBasemap"}
MAP_ACTION:{"op":"zoomToLayer","layer":"Parcels"}
For a single justified pin use: MAP_QUERY:<longitude>,<latitude>
Still answer the user in prose. Prefer **Summary** / **Evidence** / **Map actions** structure.`

const FINAL_ANSWER_NUDGE =
  'Using ONLY the tool results above plus the live map context, write the final user-facing answer with **Summary**, **Evidence**, and **Map actions** headings. Do not call more tools unless critically missing.'

const ANALYST_PACK_SYNTHESIS_NUDGE =
  'An analyst pack already executed GIS tools against the live map / loaded layers. Using ONLY those authoritative tool results (and live map context), write the final user-facing answer with **Summary**, **Evidence**, and **Map actions** headings. Do not invent counts, class areas, or weather numbers. Do not call more tools.'

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendLiveMapSnapshot(system: string, liveMapState: GeoAiLiveMapState | null | undefined): string {
  const block = buildGeoAiLiveMapStateBlock(liveMapState)
  if (!block) return system
  return `${system}\n\n---\n${block}`
}

function buildSystemForProvider(
  base: string,
  liveMapState: GeoAiLiveMapState | null | undefined,
  nativeTools: boolean,
): string {
  const withMap = appendLiveMapSnapshot(base, liveMapState)
  return nativeTools
    ? `${withMap}\n\n${NATIVE_TOOL_SYSTEM_ADDENDUM}`
    : `${withMap}\n\n${MAP_ACTION_FALLBACK_ADDENDUM}`
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

function stripProtocolNoise(text: string): string {
  return stripGeoAiMapActionLines(stripGeoAiCopilotJsonLine(stripMapQueryLine(text))).trim()
}

/**
 * Package model prose + tool evidence into Summary / Evidence / Map actions
 * when the model did not already use those headings.
 */
export function formatGeoAiAgentEvidenceReply(input: {
  modelText: string
  toolResults: GeoAiAgentToolResult[]
  mapActionLines: string[]
}): string {
  const cleaned = stripProtocolNoise(input.modelText)
  const hasStructured =
    /\*\*Summary\*\*/i.test(cleaned) ||
    /^#{1,3}\s*Summary\b/im.test(cleaned) ||
    /\bSummary\s*[:—-]/im.test(cleaned)

  if (hasStructured && cleaned) return cleaned

  const evidenceBullets: string[] = []
  for (const r of input.toolResults) {
    if (!r.ok) continue
    if (r.name === 'run_vector_stats' || r.name === 'read_rs_analysis' || r.name === 'read_live_map_state' || r.name === 'get_weather_context') {
      const preview = r.content.split(/\r?\n/).filter(Boolean).slice(0, 6).join(' · ')
      evidenceBullets.push(`- **${r.name}:** ${preview.slice(0, 420)}`)
    }
  }
  const mapLines = input.mapActionLines.filter(Boolean)
  const summary =
    cleaned ||
    (evidenceBullets.length
      ? 'Completed GIS tool checks against the live map / loaded layers.'
      : 'No additional model prose was returned.')

  const parts = [`**Summary**\n${summary}`]
  parts.push(
    evidenceBullets.length
      ? `**Evidence**\n${evidenceBullets.join('\n')}`
      : '**Evidence**\n- (No structured tool evidence this turn.)',
  )
  parts.push(
    mapLines.length
      ? `**Map actions**\n${mapLines.map(l => `- ${l}`).join('\n')}`
      : '**Map actions**\n- None',
  )
  return parts.join('\n\n')
}

function pickTableAndSync(results: GeoAiAgentToolResult[]): {
  table?: GeoExplorerDataTablePayload
  mapFirstSync?: GeoAiStatsResult['mapFirstSync']
} {
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const r = results[i]!
    if (r.table || r.mapFirstSync) {
      return {
        ...(r.table ? { table: r.table } : {}),
        ...(r.mapFirstSync ? { mapFirstSync: r.mapFirstSync } : {}),
      }
    }
  }
  return {}
}

async function runToolCalls(
  calls: GeoAiAgentToolCall[],
  host: GeoAiAgentToolHost,
): Promise<GeoAiAgentToolResult[]> {
  const out: GeoAiAgentToolResult[] = []
  for (const call of calls) {
    const result = await executeGeoAiAgentTool(call.name, call.args, host)
    out.push({ ...result, name: call.name })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Provider adapters                                                          */
/* -------------------------------------------------------------------------- */

function createGeminiAdapter(apiKey: string): GeoAiAgentModelAdapter {
  return {
    provider: 'gemini',
    supportsNativeTools: true,
    async complete({ system, turns, userMessage, toolsEnabled, priorToolRound }) {
      const contents: GeminiContent[] = turns.map(t => ({
        role: t.role === 'user' ? 'user' : 'model',
        parts: [{ text: t.text }],
      }))
      contents.push({ role: 'user', parts: [{ text: userMessage }] })

      if (priorToolRound?.toolCalls.length) {
        contents.push({
          role: 'model',
          parts: priorToolRound.toolCalls.map(tc => ({
            functionCall: { name: tc.name, args: tc.args },
          })) as GeminiContent['parts'],
        })
        contents.push({
          role: 'user',
          parts: priorToolRound.toolResults.map((r, i) => ({
            functionResponse: {
              name: priorToolRound.toolCalls[i]?.name || r.name,
              response: { ok: r.ok, content: r.content },
            },
          })) as GeminiContent['parts'],
        })
        contents.push({ role: 'user', parts: [{ text: FINAL_ANSWER_NUDGE }] })
      }

      const tools = toolsEnabled
        ? [{ functionDeclarations: getGeminiFunctionDeclarations() }]
        : undefined

      const step = await geminiGenerateContentWithTools({
        apiKey,
        systemInstruction: system,
        contents,
        tools,
      })
      return step
    },
  }
}

/** Gemini generateContent that returns text and/or functionCall parts. */
async function geminiGenerateContentWithTools(params: {
  apiKey: string
  systemInstruction: string
  contents: GeminiContent[]
  tools?: unknown
}): Promise<GeoAiAgentModelStep> {
  const { apiKey, systemInstruction, contents, tools } = params
  const models = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
  ] as const
  // Native function calling needs v1beta (`tools` + `systemInstruction`).
  const versions = tools ? (['v1beta'] as const) : (['v1beta', 'v1'] as const)
  let lastErr = 'Unknown error'

  for (const model of models) {
    for (const apiVersion of versions) {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const body: Record<string, unknown> =
        apiVersion === 'v1beta'
          ? {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              ...(tools ? { tools } : {}),
            }
          : {
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `System (follow strictly):\n${systemInstruction}\n\n---\n\n` }],
                },
                ...contents,
              ],
            }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string
              functionCall?: { name?: string; args?: Record<string, unknown> }
            }>
          }
        }>
      }
      if (!res.ok) {
        lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
        continue
      }
      const parts = data?.candidates?.[0]?.content?.parts ?? []
      const text = parts.map(p => p.text).filter(Boolean).join('').trim()
      const toolCalls: GeoAiAgentToolCall[] = []
      for (const p of parts) {
        const fc = p.functionCall
        if (fc?.name) {
          toolCalls.push({
            id: newId('gfc'),
            name: fc.name,
            args: parseJsonObject(fc.args),
          })
        }
      }
      if (text || toolCalls.length) return { text, toolCalls, raw: data }
      lastErr = 'Empty model response'
    }
  }

  // Last resort: text-only generate without tools (still usable for final answer).
  try {
    const text = await geminiGenerateContent({
      apiKey,
      systemInstruction,
      contents: contents.map(c => ({
        role: c.role,
        parts: (c.parts as Array<{ text?: string }>).filter(p => typeof p.text === 'string') as GeminiContent['parts'],
      })),
    })
    return { text, toolCalls: [] }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : lastErr)
  }
}

function createClaudeAdapter(apiKey: string): GeoAiAgentModelAdapter {
  return {
    provider: 'claude',
    supportsNativeTools: true,
    async complete({ system, turns, userMessage, toolsEnabled, priorToolRound }) {
      if (!toolsEnabled) {
        const text = await claudeGeoAiComplete({ apiKey, system, turns, userMessage })
        return { text, toolCalls: [] }
      }

      const models = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'] as const
      type ContentBlock =
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string }

      const messages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = [
        ...turns.map(t => ({
          role: t.role as 'user' | 'assistant',
          content: [{ type: 'text' as const, text: t.text }],
        })),
        { role: 'user', content: userMessage },
      ]

      if (priorToolRound?.toolCalls.length) {
        const assistantBlocks: ContentBlock[] = []
        if (priorToolRound.assistantText.trim()) {
          assistantBlocks.push({ type: 'text', text: priorToolRound.assistantText })
        }
        for (const tc of priorToolRound.toolCalls) {
          assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
        }
        messages.push({ role: 'assistant', content: assistantBlocks })
        const resultBlocks: ContentBlock[] = priorToolRound.toolCalls.map((tc, i) => ({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: priorToolRound.toolResults[i]?.content || '(empty)',
        }))
        messages.push({
          role: 'user',
          content: [...resultBlocks, { type: 'text', text: FINAL_ANSWER_NUDGE }],
        })
      }

      let lastErr = 'Unknown error'
      for (const model of models) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system,
            messages,
            tools: getClaudeToolDefinitions(),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string }
          content?: Array<{
            type?: string
            text?: string
            id?: string
            name?: string
            input?: Record<string, unknown>
          }>
        }
        if (!res.ok) {
          lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
          if (res.status === 404 || res.status === 400) continue
          throw new Error(lastErr)
        }
        const blocks = data.content ?? []
        const text = blocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('')
          .trim()
        const toolCalls: GeoAiAgentToolCall[] = []
        for (const b of blocks) {
          if (b.type === 'tool_use' && b.name && b.id) {
            toolCalls.push({
              id: b.id,
              name: b.name,
              args: parseJsonObject(b.input),
            })
          }
        }
        if (text || toolCalls.length) return { text, toolCalls, raw: data }
        lastErr = 'Empty Claude response'
      }
      throw new Error(lastErr)
    },
  }
}

function createDeepSeekAdapter(apiKey: string): GeoAiAgentModelAdapter {
  return {
    provider: 'deepseek',
    supportsNativeTools: true,
    async complete({ system, turns, userMessage, toolsEnabled, priorToolRound }) {
      if (!toolsEnabled) {
        const text = await agroChatWithDeepSeek({ apiKey, system, turns, userMessage })
        return { text, toolCalls: [] }
      }

      type Msg = {
        role: 'system' | 'user' | 'assistant' | 'tool'
        content: string | null
        tool_calls?: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }>
        tool_call_id?: string
      }

      const messages: Msg[] = [{ role: 'system', content: system }]
      for (const t of turns) {
        messages.push({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text })
      }
      messages.push({ role: 'user', content: userMessage })

      if (priorToolRound?.toolCalls.length) {
        messages.push({
          role: 'assistant',
          content: priorToolRound.assistantText || null,
          tool_calls: priorToolRound.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
          })),
        })
        for (let i = 0; i < priorToolRound.toolCalls.length; i += 1) {
          const tc = priorToolRound.toolCalls[i]!
          const tr = priorToolRound.toolResults[i]
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: tr?.content || '(empty)',
          })
        }
        messages.push({ role: 'user', content: FINAL_ANSWER_NUDGE })
      }

      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          max_tokens: 4096,
          tools: getOpenAiCompatibleTools(),
          tool_choice: 'auto',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
        choices?: Array<{
          message?: {
            content?: string | null
            tool_calls?: Array<{
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
        }>
      }
      if (!res.ok) {
        throw new Error(data?.error?.message || res.statusText || `HTTP ${res.status}`)
      }
      const msg = data.choices?.[0]?.message
      const text = (msg?.content || '').trim()
      const toolCalls: GeoAiAgentToolCall[] = []
      for (const tc of msg?.tool_calls ?? []) {
        if (!tc.function?.name) continue
        toolCalls.push({
          id: tc.id || newId('ds'),
          name: tc.function.name,
          args: parseJsonObject(tc.function.arguments),
        })
      }
      return { text, toolCalls, raw: data }
    },
  }
}

function createOllamaAdapter(opts: { baseUrl: string; model: string }): GeoAiAgentModelAdapter {
  return {
    provider: 'ollama',
    supportsNativeTools: false,
    async complete({ system, turns, userMessage }) {
      const text = await agroChatWithOllama({
        baseUrl: opts.baseUrl,
        model: opts.model,
        system,
        turns,
        userMessage,
      })
      return { text, toolCalls: [] }
    },
  }
}

export function createGeoAiAgentModelAdapter(
  provider: GeoAiAgentProvider,
  opts: { apiKey?: string; ollama?: { baseUrl: string; model: string } },
): GeoAiAgentModelAdapter {
  switch (provider) {
    case 'gemini':
      if (!opts.apiKey?.trim()) throw new Error('Gemini API key is required for the agent turn.')
      return createGeminiAdapter(opts.apiKey.trim())
    case 'claude':
      if (!opts.apiKey?.trim()) throw new Error('Claude API key is required for the agent turn.')
      return createClaudeAdapter(opts.apiKey.trim())
    case 'deepseek':
      if (!opts.apiKey?.trim()) throw new Error('DeepSeek API key is required for the agent turn.')
      return createDeepSeekAdapter(opts.apiKey.trim())
    case 'ollama':
      return createOllamaAdapter({
        baseUrl: opts.ollama?.baseUrl || 'http://localhost:11434',
        model: opts.ollama?.model || 'llama3.1',
      })
    default:
      throw new Error(`Unsupported Geo AI agent provider: ${provider as string}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Turn runner                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Resolve which analyst pack (if any) should auto-run for this turn.
 * `analystPackId: null` explicitly disables; omit to auto-classify.
 */
export function resolveGeoAiAnalystPackId(params: {
  userMessage: string
  chipId?: string | null
  analystPackId?: GeoAiAnalystPackId | null
  enableAnalystPacks?: boolean
}): GeoAiAnalystPackId | null {
  if (params.enableAnalystPacks === false) return null
  if (params.analystPackId === null) return null
  if (params.analystPackId) return params.analystPackId
  return classifyGeoAiAnalystIntent(params.userMessage, params.chipId)
}

/**
 * Run one Geo AI agent turn: snapshot map → optional analyst-pack tool preflight →
 * model (+ native tools or MAP_ACTION fallback) → execute → optional second model
 * step → evidence-formatted reply.
 */
export async function runGeoAiAgentTurn(params: GeoAiAgentTurnParams): Promise<GeoAiAgentTurnResult> {
  const adapter =
    params.adapter ??
    createGeoAiAgentModelAdapter(params.provider, {
      apiKey: params.apiKey,
      ollama: params.ollama,
    })

  const host: GeoAiAgentToolHost = {
    mapHandlers: params.mapHandlers,
    liveMapState: params.liveMapState,
    vectorLayers: params.vectorLayers ?? [],
    weatherFetcher: params.weatherFetcher,
  }

  const useNative = adapter.supportsNativeTools
  const system = buildSystemForProvider(params.systemInstruction, params.liveMapState, useNative)
  const maxRounds = Math.max(1, Math.min(params.maxToolRounds ?? 2, 4))

  const allToolResults: GeoAiAgentToolResult[] = []
  let usedNativeTools = false
  let usedMapActionFallback = false
  let usedAnalystPack: GeoAiAnalystPackId | null = null
  let mapCommandResults: GeoAiMapCommandResult[] = []
  let mapActionLines: string[] = []
  let rawModelText = ''
  let mapQueryLngLat: [number, number] | null = null

  let priorToolRound: {
    assistantText: string
    toolCalls: GeoAiAgentToolCall[]
    toolResults: GeoAiAgentToolResult[]
  } | undefined

  // --- Analyst pack preflight: auto-run multi-tool intents (chips + classifier) ---
  const packId = resolveGeoAiAnalystPackId({
    userMessage: params.userMessage,
    chipId: params.chipId,
    analystPackId: params.analystPackId,
    enableAnalystPacks: params.enableAnalystPacks,
  })
  if (packId) {
    const packSpecs = buildGeoAiAnalystPackToolCalls(packId, params.userMessage)
    if (packSpecs.length) {
      usedAnalystPack = packId
      const packCalls: GeoAiAgentToolCall[] = packSpecs.map(s => ({
        id: newId('pack'),
        name: s.name,
        args: s.args,
      }))
      const packResults = await runToolCalls(packCalls, host)
      allToolResults.push(...packResults)
      mapActionLines.push(...collectMapActionSummaries(packResults))
      for (const r of packResults) {
        if (r.mapResults?.length) mapCommandResults.push(...r.mapResults)
      }

      const packBlock = [
        `### PRE-EXECUTED ANALYST PACK: ${geoAiAnalystPackLabel(packId)} (${packId})`,
        'These tool results are authoritative — cite them in Evidence; do not invent numbers.',
        formatToolResultsForModel(packResults),
        ANALYST_PACK_SYNTHESIS_NUDGE,
      ].join('\n\n')

      const systemWithPack = `${system}\n\n${packBlock}`
      const step = await adapter.complete({
        system: systemWithPack,
        turns: params.history,
        userMessage: params.userMessage,
        toolsEnabled: false,
        priorToolRound: useNative
          ? {
              assistantText: `Running analyst pack: ${geoAiAnalystPackLabel(packId)}.`,
              toolCalls: packCalls,
              toolResults: packResults,
            }
          : undefined,
      })
      rawModelText = step.text || ''
      const mq = parseMapQueryLngLat(step.text)
      if (mq) mapQueryLngLat = mq
    }
  }

  // Native / MAP_ACTION loop only when no analyst pack already synthesized.
  if (!usedAnalystPack) {
    for (let round = 0; round < maxRounds; round += 1) {
      const step = await adapter.complete({
        system,
        turns: params.history,
        userMessage: params.userMessage,
        toolsEnabled: useNative,
        priorToolRound,
      })

      rawModelText = step.text || rawModelText
      const mq = parseMapQueryLngLat(step.text)
      if (mq) mapQueryLngLat = mq

      if (useNative && step.toolCalls.length) {
        usedNativeTools = true
        const toolResults = await runToolCalls(step.toolCalls, host)
        allToolResults.push(...toolResults)
        mapActionLines.push(...collectMapActionSummaries(toolResults))
        for (const r of toolResults) {
          if (r.mapResults?.length) mapCommandResults.push(...r.mapResults)
        }

        // If this was the last allowed round, stop and format with what we have.
        if (round >= maxRounds - 1) break

        priorToolRound = {
          assistantText: step.text,
          toolCalls: step.toolCalls,
          toolResults,
        }
        continue
      }

      // No native tool calls — treat as final prose (or MAP_ACTION fallback).
      rawModelText = step.text
      break
    }
  }

  // Text-protocol map commands (Ollama / models that still emit MAP_ACTION).
  const executeTextActions = params.executeMapActionsFromText !== false
  if (executeTextActions && rawModelText) {
    const cmds = parseGeoAiMapCommands(rawModelText)
    if (cmds.length) {
      usedMapActionFallback = true
      const results = executeGeoAiMapCommands(cmds, params.mapHandlers)
      mapCommandResults.push(...results)
      for (const r of results) {
        if (r.message) mapActionLines.push(r.message)
      }
    }
  }

  // When tools ran but model returned empty final text, nudge a compact package.
  if (
    (usedNativeTools || usedAnalystPack) &&
    !stripProtocolNoise(rawModelText) &&
    allToolResults.length
  ) {
    rawModelText = formatToolResultsForModel(allToolResults)
  }

  const replyText = formatGeoAiAgentEvidenceReply({
    modelText: rawModelText,
    toolResults: allToolResults,
    mapActionLines,
  })

  const extras = pickTableAndSync(allToolResults)

  return {
    replyText,
    rawModelText,
    toolResults: allToolResults,
    mapCommandResults,
    usedNativeTools,
    usedMapActionFallback,
    usedAnalystPack,
    mapQueryLngLat,
    ...extras,
  }
}
