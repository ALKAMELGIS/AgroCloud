import { geminiGenerateContent, type GeminiContent } from './geoExplorerGemini'

export const AGRO_AI_CHAT_SYSTEM = `You are AgriCloud AI Agro-Chat — a professional assistant for agriculture, GIS-backed farm data, and clear explanations.

A block titled "GIS Content" is appended below. It summarizes layers saved from GIS Map in this browser (names, fields, sample attributes, feature counts). Treat it as the authoritative source for anything that must match the user's actual stored layers.

## How to combine GIS Content and general knowledge (every reply)

1) **GIS-first (site / layer–specific)**  
If the question is about the user's layers, fields, attribute values, patterns in their data, or anything that could be answered from the GIS Content snapshot — **consult the GIS block first**. Quote layer names and field names when you rely on it.  
If the answer is **not** in the GIS block (missing layer, missing field, or no values), say so explicitly, then you may use step 2 for the rest of the question only where appropriate.

2) **General AI (not from their files)**  
For questions that are **clearly general** and do not require reading their layer rows — e.g. typical weather or climate for a country or region when they are not asking you to read a weather **layer** they saved, definitions (what is NDVI), generic agronomy, world geography — you **may** use your general knowledge.  
**Label** those parts so the user can tell the source, e.g. a short line: "General:" / "من المعرفة العامة:" before general content.

3) **Hybrid questions**  
If one part needs GIS (their fields, their site) and another part is general — answer the GIS part strictly from the snapshot; answer the general part with a clear label, and keep the two visually separated (bullets or short sections).

## Accuracy rules  
- Never invent attribute values, statistics, or coordinates that are not implied by the GIS Content text.  
- Do not imply that general-knowledge text was extracted from their GIS files.  
- Prefer concise structure: short headings, bullets, brief paragraphs.  
- **Reply language:** Follow the "UI locale — reply language" line appended immediately after this system block (English or Arabic per user app settings).`

export type AgroChatTurn = { role: 'user' | 'assistant'; text: string }

function geminiContentsFromTurns(turns: AgroChatTurn[], userMessage: string): GeminiContent[] {
  const rows: GeminiContent[] = turns.map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.text }],
  }))
  rows.push({ role: 'user', parts: [{ text: userMessage }] })
  return rows
}

export async function agroChatWithGemini(params: {
  apiKey: string
  systemInstruction: string
  turns: AgroChatTurn[]
  userMessage: string
}): Promise<string> {
  const { apiKey, systemInstruction, turns, userMessage } = params
  return geminiGenerateContent({
    apiKey,
    systemInstruction,
    contents: geminiContentsFromTurns(turns, userMessage),
  })
}

const DEEPSEEK_MODEL = 'deepseek-chat'

export async function agroChatWithDeepSeek(params: {
  apiKey: string
  system: string
  turns: AgroChatTurn[]
  userMessage: string
}): Promise<string> {
  const { apiKey, system, turns, userMessage } = params
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: system }]
  for (const t of turns) {
    messages.push({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text })
  }
  messages.push({ role: 'user', content: userMessage })

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: 4096,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: string } }>
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || res.statusText || `HTTP ${res.status}`)
  }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty DeepSeek response')
  return text
}

/** Same-origin backend proxy → Ollama native `/api/chat` (avoids browser CORS). */
export const OLLAMA_CHAT_PROXY_URL = '/api/ollama/chat'
export const OLLAMA_STATUS_PROXY_URL = '/api/ollama/status'
export const OLLAMA_WARM_PROXY_URL = '/api/ollama/warm'

/**
 * Preload the model into memory so the user's first chat turn returns quickly
 * (skips the multi-second cold load into VRAM). Fire-and-forget — never throws.
 */
export async function warmOllama(baseUrl: string, model: string): Promise<void> {
  const root = (baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '')
  try {
    await fetch(OLLAMA_WARM_PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: root, model: (model || 'llama3.1').trim() }),
    })
  } catch {
    /* warm-up is best-effort; ignore failures */
  }
}

export type OllamaHealth = { reachable: boolean; baseUrl: string; models: string[]; error?: string }

/**
 * Health check for the local Ollama daemon via the backend proxy. Used to gate
 * chat requests and to drive provider fallback (don't bother calling a dead
 * daemon). Never throws — returns `{ reachable: false }` on any failure.
 */
export async function checkOllamaHealth(baseUrl: string): Promise<OllamaHealth> {
  const root = (baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '')
  try {
    const res = await fetch(`${OLLAMA_STATUS_PROXY_URL}?baseUrl=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
    const data = (await res.json().catch(() => ({}))) as Partial<OllamaHealth>
    if (!res.ok || !data?.reachable) {
      return { reachable: false, baseUrl: root, models: [], error: data?.error || `HTTP ${res.status}` }
    }
    return { reachable: true, baseUrl: root, models: Array.isArray(data.models) ? data.models : [] }
  } catch (err) {
    return { reachable: false, baseUrl: root, models: [], error: err instanceof Error ? err.message : 'unreachable' }
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Local Ollama via the backend proxy (`/api/ollama/chat` → Ollama `/api/chat`).
 *
 * The browser cannot call the Ollama daemon (`:11434`) directly — its CORS
 * policy rejects the app origin, surfacing as "Failed to fetch". The backend
 * (same Node process) forwards to Ollama's native chat endpoint with no CORS.
 * Needs no API key — only the base URL of the running Ollama server and a model
 * pulled locally (e.g. `ollama pull llama3.1`).
 */
export async function agroChatWithOllama(params: {
  baseUrl: string
  model: string
  system: string
  turns: AgroChatTurn[]
  userMessage: string
}): Promise<string> {
  const { baseUrl, model, system, turns, userMessage } = params
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: system }]
  for (const t of turns) {
    messages.push({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text })
  }
  messages.push({ role: 'user', content: userMessage })

  const root = (baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '')
  const usableModel = (model || 'llama3.1').trim()

  // Retry transient failures (proxy not ready, daemon warming up, 502 from the
  // proxy). 4xx (bad request / model not found) is returned immediately — no
  // point retrying a deterministic error.
  const maxAttempts = 3
  let lastError = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await fetch(OLLAMA_CHAT_PROXY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl: root, model: usableModel, messages }),
      })
    } catch (err) {
      lastError = `Could not reach the app server to proxy Ollama. ${err instanceof Error ? err.message : ''}`.trim()
      if (attempt < maxAttempts) {
        await sleep(500 * attempt)
        continue
      }
      throw new Error(lastError)
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string; reply?: string }
    if (!res.ok) {
      lastError = data?.error || res.statusText || `HTTP ${res.status}`
      const transient = res.status >= 500 || res.status === 408 || res.status === 429
      if (transient && attempt < maxAttempts) {
        await sleep(500 * attempt)
        continue
      }
      throw new Error(lastError)
    }
    const text = (data.reply || '').trim()
    if (!text) throw new Error('Empty Ollama response')
    return text
  }
  throw new Error(lastError || 'Ollama request failed')
}
