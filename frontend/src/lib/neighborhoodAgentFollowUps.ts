/**
 * Smart follow-up suggestions for Neighborhood Agent — shown only after analysis / replies,
 * never on the empty default screen.
 */

import type { GeoAiAnalystPackId } from './geoAiAnalystPacks'

export type NeighborhoodAgentFollowUp = {
  id: string
  label: string
  prompt: string
  primary?: boolean
}

export type NeighborhoodAgentFollowUpEvidence = {
  packId?: GeoAiAnalystPackId | null
  tools?: Array<{ name: string }>
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text)
}

type CatalogEntry = {
  id: string
  packId?: GeoAiAnalystPackId
  en: { label: string; prompt: string }
  ar: { label: string; prompt: string }
}

const CATALOG: CatalogEntry[] = [
  {
    id: 'fu-neighborhood',
    packId: 'neighborhood',
    en: {
      label: 'Neighborhood surroundings',
      prompt:
        'Describe the neighborhood around the current AOI — buildings, roads, vegetation, and remote-sensing character of the surroundings.',
    },
    ar: {
      label: 'تحليل المحيط',
      prompt: 'صف المحيط حول منطقة الاهتمام الحالية — المباني والطرق والنبات والخصائص من الاستشعار عن بعد.',
    },
  },
  {
    id: 'fu-aoi',
    packId: 'analyze-aoi',
    en: {
      label: 'Deeper AOI analysis',
      prompt:
        'Analyze this AOI in more depth using the drawn AOI remote-sensing classes (NDVI / active index), AOI metrics, and weather — not loaded GIS layers from the Layers panel.',
    },
    ar: {
      label: 'تحليل أعمق للمنطقة',
      prompt:
        'حلّل منطقة الاهتمام المرسومة بعمق باستخدام فئات الاستشعار عن بعد (NDVI / المؤشر النشط) ومقاييس الـ AOI والطقس — وليس طبقات GIS من لوحة Layers.',
    },
  },
  {
    id: 'fu-veg',
    packId: 'vegetation',
    en: {
      label: 'Vegetation health',
      prompt: 'Summarize vegetation health for the current AOI using NDVI / Layer Live indices if available.',
    },
    ar: {
      label: 'صحة الغطاء النباتي',
      prompt: 'لخّص صحة الغطاء النباتي لمنطقة الاهتمام باستخدام NDVI أو مؤشرات Layer Live إن توفرت.',
    },
  },
  {
    id: 'fu-buildings',
    packId: 'count-buildings',
    en: {
      label: 'Building & road density',
      prompt: 'Count buildings and roads in or near the AOI and summarize density.',
    },
    ar: {
      label: 'كثافة المباني والطرق',
      prompt: 'احسب المباني والطرق داخل أو قرب منطقة الاهتمام ولخّص الكثافة.',
    },
  },
  {
    id: 'fu-weather',
    packId: 'weather',
    en: {
      label: 'Weather here',
      prompt: 'Give the current weather and short forecast for the map focus / AOI.',
    },
    ar: {
      label: 'الطقس هنا',
      prompt: 'أعطني الطقس الحالي وتوقعاً قصيراً لنقطة التركيز أو منطقة الاهتمام على الخريطة.',
    },
  },
  {
    id: 'fu-flood',
    packId: 'flood-slope',
    en: {
      label: 'Flood / slope / heat',
      prompt: 'Assess flood, slope, and heat-related risk context for this AOI using terrain and live analysis.',
    },
    ar: {
      label: 'فيضان / ميل / حرارة',
      prompt: 'قيّم سياق مخاطر الفيضان والميل والحرارة لهذه المنطقة باستخدام التضاريس والتحليل الحي.',
    },
  },
  {
    id: 'fu-layers',
    packId: 'layer-summary',
    en: {
      label: 'Summarize layers',
      prompt: 'Summarize the loaded GIS layers and what each contributes to this view.',
    },
    ar: {
      label: 'ملخص الطبقات',
      prompt: 'لخّص الطبقات المحمّلة وما تقدمه كل طبقة لهذا العرض.',
    },
  },
  {
    id: 'fu-buffer',
    packId: 'spatial-buffer',
    en: {
      label: 'Buffer 500 m',
      prompt: 'Create a 500 m buffer around the current AOI or selected farms layer.',
    },
    ar: {
      label: 'حاجز 500 م',
      prompt: 'أنشئ حاجزاً بمسافة 500 متر حول منطقة الاهتمام أو طبقة المزارع المحددة.',
    },
  },
  {
    id: 'fu-clip',
    packId: 'spatial-clip',
    en: {
      label: 'Clip by AOI',
      prompt: 'Clip the primary loaded vector layer using the current AOI.',
    },
    ar: {
      label: 'قص بالمنطقة',
      prompt: 'اقتص الطبقة المتجهة الرئيسية باستخدام منطقة الاهتمام الحالية.',
    },
  },
  {
    id: 'fu-thematic',
    en: {
      label: 'Thematic map by field',
      prompt: 'Create a thematic map on a visible vector layer by an important attribute field (graduated colors).',
    },
    ar: {
      label: 'خريطة موضوعية حسب حقل',
      prompt: 'أنشئ خريطة موضوعية على طبقة متجهة ظاهرة حسب حقل سمة مهم (ألوان متدرجة).',
    },
  },
  {
    id: 'fu-compare',
    packId: 'vegetation',
    en: {
      label: 'Compare AOI classes',
      prompt:
        'Compare the main NDVI / AOI index classes from the last remote-sensing breakdown in a short table and highlight the dominant share.',
    },
    ar: {
      label: 'قارن فئات المنطقة',
      prompt:
        'قارن الفئات الرئيسية لمؤشر NDVI / تحليل منطقة الاهتمام من آخر تفصيل استشعار عن بعد في جدول مختصر وسلّط الضوء على الحصة الأكبر.',
    },
  },
  {
    id: 'fu-map-focus',
    en: {
      label: 'What is around here?',
      prompt: 'What places, POIs, and basemap features are around the current map focus?',
    },
    ar: {
      label: 'ما الذي حولي؟',
      prompt: 'ما الأماكن ونقاط الاهتمام ومعالم الخريطة الأساسية حول نقطة التركيز الحالية؟',
    },
  },
]

function pickLocale(ar: boolean, entry: CatalogEntry): NeighborhoodAgentFollowUp {
  const loc = ar ? entry.ar : entry.en
  return { id: entry.id, label: loc.label, prompt: loc.prompt }
}

const MAX_FOLLOW_UPS = 2

/** Light keyword boost so chips closest to the user's question rank first. */
function relevanceScore(userText: string, entry: CatalogEntry): number {
  const q = userText.toLowerCase()
  if (!q) return 0
  let score = 0
  const hay = `${entry.en.label} ${entry.en.prompt} ${entry.ar.label} ${entry.ar.prompt} ${entry.id}`.toLowerCase()
  const tokens = q
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.trim())
    .filter(t => t.length >= 3)
  for (const t of tokens) {
    if (hay.includes(t)) score += 3
  }
  if (/\b(around|nearby|surround|حول|قريب|محيط)\b/i.test(q) && entry.id === 'fu-map-focus') score += 8
  if (/\b(weather|طقس|حرارة|forecast)\b/i.test(q) && entry.id === 'fu-weather') score += 8
  if (/\b(ndvi|vegetation|نبات|crop)\b/i.test(q) && entry.id === 'fu-veg') score += 8
  if (/\b(building|road|كثافة|مبان)\b/i.test(q) && entry.id === 'fu-buildings') score += 8
  if (/\b(flood|slope|heat|فيضان|ميل)\b/i.test(q) && entry.id === 'fu-flood') score += 8
  if (/\b(thematic|map|خريطة|symbolog)\b/i.test(q) && entry.id === 'fu-thematic') score += 8
  if (/\b(population|%|share|سكان|نسبة|حصة)\b/i.test(q) && entry.id === 'fu-compare') score += 8
  if (/\b(aoi|analyze|تحليل|منطقة)\b/i.test(q) && entry.id === 'fu-aoi') score += 5
  if (/\b(neighborhood|محيط)\b/i.test(q) && entry.id === 'fu-neighborhood') score += 5
  if (/\b(buffer|حاجز)\b/i.test(q) && entry.id === 'fu-buffer') score += 10
  if (/\b(clip|قص)\b/i.test(q) && entry.id === 'fu-clip') score += 10
  return score
}

export type BuildNeighborhoodAgentFollowUpsArgs = {
  evidence?: NeighborhoodAgentFollowUpEvidence | null
  lastUserText?: string
  lastAssistantText?: string
  hasTableOrChartCue?: boolean
}

/**
 * Build the top 2 contextual follow-up chips from the latest turn (priority + user relevance).
 * Returns [] when there is nothing useful to suggest.
 */
export function buildNeighborhoodAgentFollowUps(
  args: BuildNeighborhoodAgentFollowUpsArgs,
): NeighborhoodAgentFollowUp[] {
  const user = (args.lastUserText || '').trim()
  const assistant = (args.lastAssistantText || '').trim()
  if (!user && !assistant && !args.evidence?.tools?.length) return []

  const ar = isArabic(user) || isArabic(assistant)
  const byId = (id: string) => CATALOG.find(c => c.id === id)!
  const ranked: Array<{ chip: NeighborhoodAgentFollowUp; score: number; order: number }> = []
  const packId = args.evidence?.packId ?? null
  const toolNames = new Set((args.evidence?.tools || []).map(t => t.name))
  const blob = `${user}\n${assistant}`.toLowerCase()

  const excludePack = new Set<string>()
  if (packId) excludePack.add(packId)

  const addPackFollowUps = (ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      const entry = byId(ids[i]!)
      // Allow “compare AOI classes” even right after a vegetation pack turn.
      if (entry.packId && excludePack.has(entry.packId) && entry.id !== 'fu-compare') continue
      if (ranked.some(r => r.chip.id === entry.id)) continue
      const chip = pickLocale(ar, entry)
      // Base priority: earlier in the pack list wins; user-question relevance boosts further.
      const score = 100 - i * 8 + relevanceScore(user, entry)
      ranked.push({ chip, score, order: ranked.length })
    }
  }

  if (packId === 'vegetation') {
    addPackFollowUps(['fu-compare', 'fu-weather', 'fu-neighborhood', 'fu-aoi'])
  } else if (packId === 'neighborhood') {
    addPackFollowUps(['fu-veg', 'fu-buildings', 'fu-weather', 'fu-thematic'])
  } else if (packId === 'weather') {
    addPackFollowUps(['fu-veg', 'fu-flood', 'fu-aoi', 'fu-neighborhood'])
  } else if (packId === 'count-buildings') {
    addPackFollowUps(['fu-neighborhood', 'fu-thematic', 'fu-layers', 'fu-aoi'])
  } else if (packId === 'flood-slope') {
    addPackFollowUps(['fu-weather', 'fu-veg', 'fu-aoi', 'fu-neighborhood'])
  } else if (packId === 'analyze-aoi') {
    addPackFollowUps(['fu-veg', 'fu-buildings', 'fu-weather', 'fu-thematic'])
  } else if (packId === 'layer-summary') {
    addPackFollowUps(['fu-thematic', 'fu-aoi', 'fu-neighborhood', 'fu-veg'])
  } else if (packId === 'spatial-buffer' || packId === 'spatial-intersect' || packId === 'spatial-clip') {
    addPackFollowUps(['fu-clip', 'fu-buffer', 'fu-layers', 'fu-aoi'])
  } else if (toolNames.has('search_place') || toolNames.has('fly_to') || /\bflew to\b|تم الانتقال/i.test(assistant)) {
    addPackFollowUps(['fu-map-focus', 'fu-weather', 'fu-neighborhood', 'fu-aoi'])
  } else if (
    /\b(ndvi|ndwi|ndmi|active analysis|per-class|early watch|vegetation)\b/i.test(blob) ||
    toolNames.has('read_rs_analysis') ||
    toolNames.has('run_rs_index')
  ) {
    addPackFollowUps(['fu-compare', 'fu-veg', 'fu-weather', 'fu-aoi'])
  } else if (
    args.hasTableOrChartCue ||
    /\b(population|share|٪|%|nationalit|حصة|سكان|نسبة)/i.test(blob)
  ) {
    // Generic chart/table cue without RS → still prefer AOI class compare over layer dump
    addPackFollowUps(['fu-compare', 'fu-thematic', 'fu-map-focus', 'fu-aoi'])
  } else if (/\b(ndvi|vegetation|نبات)/i.test(blob)) {
    addPackFollowUps(['fu-veg', 'fu-weather', 'fu-aoi'])
  } else if (/\b(weather|طقس|حرارة)/i.test(blob)) {
    addPackFollowUps(['fu-weather', 'fu-flood', 'fu-veg'])
  } else {
    addPackFollowUps(['fu-aoi', 'fu-neighborhood', 'fu-veg', 'fu-weather'])
  }

  ranked.sort((a, b) => b.score - a.score || a.order - b.order)
  const top = ranked.slice(0, MAX_FOLLOW_UPS).map((r, i) => ({
    ...r.chip,
    primary: i === 0,
  }))
  return top
}
