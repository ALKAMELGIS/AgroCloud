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
