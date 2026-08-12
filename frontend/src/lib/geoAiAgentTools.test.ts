import { describe, expect, it, vi } from 'vitest'
import {
  collectMapActionSummaries,
  executeGeoAiAgentTool,
  formatToolResultsForModel,
  getClaudeToolDefinitions,
  getGeminiFunctionDeclarations,
  getOpenAiCompatibleTools,
  listGeoAiAgentTools,
  type GeoAiAgentToolHost,
} from './geoAiAgentTools'
import {
  formatGeoAiAgentEvidenceReply,
  runGeoAiAgentTurn,
  type GeoAiAgentModelAdapter,
} from './geoAiAgentTurn'
import type { GeoAiLiveMapState } from './geoAiLiveMapContext'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'

const buildingsLayer: GeoAiMapLayer = {
  name: 'Buildings',
  clientLayerId: 'lyr-bldg',
  data: {
    type: 'FeatureCollection',
    features: [
      {
        properties: { type: 'residential', floors: 2 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 0.01], [0.01, 0.01], [0, 0]]] },
      },
      {
        properties: { type: 'commercial', floors: 5 },
        geometry: { type: 'Polygon', coordinates: [[[1, 1], [1, 1.01], [1.01, 1.01], [1, 1]]] },
      },
    ],
  },
}

const liveState: GeoAiLiveMapState = {
  camera: { longitude: 55.27, latitude: 25.2, zoom: 12 },
  basemapLabel: 'Satellite',
  activeAnalysis: {
    label: 'NDVI',
    acquisitionDate: '2026-07-01',
    meanValue: 0.42,
    classes: [
      { name: 'Healthy', areaHa: 12.5, pct: 40 },
      { name: 'Stressed', areaHa: 18.75, pct: 60 },
    ],
  },
  layers: [{ name: 'Buildings', visible: true, featureCount: 2, kind: 'Vector' }],
}

function mockHost(overrides?: Partial<GeoAiAgentToolHost>): GeoAiAgentToolHost {
  return {
    mapHandlers: {
      flyTo: c => `Centered on ${c.lat},${c.lng}`,
      zoomToAoi: () => 'Zoomed to the AOI.',
      setLayerVisibility: (layer, visible) => `Turned ${layer} ${visible ? 'on' : 'off'}.`,
      switchBasemap: b => `Switched basemap to ${b}.`,
      searchPlace: q => `Searching the map for "${q}"...`,
      identifyBasemap: () => 'Nearby: Test Park',
    },
    liveMapState: liveState,
    vectorLayers: [buildingsLayer],
    ...overrides,
  }
}

describe('geoAiAgentTools registry', () => {
  it('exposes Gemini / Claude / OpenAI-compatible schemas for all tools', () => {
    const listed = listGeoAiAgentTools()
    expect(listed.length).toBeGreaterThanOrEqual(10)
    expect(getGeminiFunctionDeclarations()).toHaveLength(listed.length)
    expect(getClaudeToolDefinitions()[0]).toHaveProperty('input_schema')
    expect(getOpenAiCompatibleTools()[0]?.type).toBe('function')
  })

  it('executes map tools via command handlers', async () => {
    const host = mockHost()
    const fly = await executeGeoAiAgentTool('fly_to', { lng: 55.3, lat: 25.1, zoom: 14 }, host)
    expect(fly.ok).toBe(true)
    expect(fly.content).toMatch(/Centered/)
    expect(fly.mapResults?.[0]?.command).toMatchObject({ op: 'flyTo', lng: 55.3, lat: 25.1 })

    const hide = await executeGeoAiAgentTool('set_layer_visibility', { layer: 'NDVI', visible: false }, host)
    expect(hide.ok).toBe(true)
    expect(hide.content).toMatch(/off/)
  })

  it('executes detect_field_boundaries via map handler', async () => {
    const detectFieldBoundaries = vi.fn(
      (source: string, year?: number) =>
        `Started field boundary detection (${source}${year != null ? `, year ${year}` : ''}) for the current AOI.`,
    )
    const host = mockHost({
      mapHandlers: { ...mockHost().mapHandlers, detectFieldBoundaries },
    })
    const r = await executeGeoAiAgentTool(
      'detect_field_boundaries',
      { source: 'ftw-live', year: 2024 },
      host,
    )
    expect(r.ok).toBe(true)
    expect(r.content).toMatch(/ftw-live/)
    expect(detectFieldBoundaries).toHaveBeenCalledWith('ftw-live', 2024)
    expect(collectMapActionSummaries([r])).toEqual([
      expect.stringMatching(/field boundary detection/i),
    ])
  })

  it('reads RS analysis and live map state from the snapshot', async () => {
    const host = mockHost()
    const rs = await executeGeoAiAgentTool('read_rs_analysis', {}, host)
    expect(rs.ok).toBe(true)
    expect(rs.content).toMatch(/NDVI/)
    expect(rs.content).toMatch(/Healthy/)

    const live = await executeGeoAiAgentTool('read_live_map_state', {}, host)
    expect(live.ok).toBe(true)
    expect(live.content).toMatch(/LIVE MAP STATE/)
  })

  it('runs vector stats against loaded layers', async () => {
    const host = mockHost()
    const stats = await executeGeoAiAgentTool('run_vector_stats', { query: 'count buildings' }, host)
    expect(stats.ok).toBe(true)
    expect(stats.content.toLowerCase()).toMatch(/building|2|count/)
  })

  it('formats tool results for a follow-up model turn', () => {
    const text = formatToolResultsForModel([
      { name: 'read_rs_analysis', ok: true, content: 'NDVI mean 0.42' },
      { name: 'fly_to', ok: false, content: 'bad coords' },
    ])
    expect(text).toMatch(/read_rs_analysis \[ok\]/)
    expect(text).toMatch(/fly_to \[error\]/)
  })

  it('collects map action summaries', () => {
    const lines = collectMapActionSummaries([
      {
        name: 'fly_to',
        ok: true,
        content: 'Centered',
        mapResults: [
          {
            command: { op: 'flyTo', lng: 1, lat: 2 },
            ok: true,
            message: 'Centered on pin.',
          },
        ],
      },
    ])
    expect(lines).toEqual(['Centered on pin.'])
  })
})

describe('geoAiAgentTurn', () => {
  it('formats short prose + References (never dumps tool transcripts)', () => {
    const reply = formatGeoAiAgentEvidenceReply({
      modelText: 'Looks healthy overall.',
      toolResults: [
        {
          name: 'read_rs_analysis',
          ok: true,
          content: '### LIVE MAP STATE\nTreat these as facts; never ask...\nNDVI · Healthy 40%',
        },
        {
          name: 'get_weather_context',
          ok: true,
          content: '### OPENWEATHER FACTS\nTemp 34',
        },
      ],
      mapActionLines: ['Zoomed to the AOI.'],
    })
    expect(reply).toMatch(/Looks healthy overall/)
    expect(reply).toMatch(/\*\*References\*\*/)
    expect(reply).toMatch(/OpenWeatherMap|remote-sensing/i)
    expect(reply).not.toMatch(/\*\*Evidence\*\*/)
    expect(reply).not.toMatch(/read_live_map_state|LIVE MAP STATE|Treat these as facts/i)
    expect(reply).not.toMatch(/\*\*Map actions\*\*/)
  })

  it('runs a native tool loop then returns an evidence-formatted reply', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: '1', name: 'read_rs_analysis', args: {} }],
      })
      .mockResolvedValueOnce({
        text: 'Vegetation looks moderately healthy.',
        toolCalls: [],
      })

    const adapter: GeoAiAgentModelAdapter = {
      provider: 'gemini',
      supportsNativeTools: true,
      complete,
    }

    const result = await runGeoAiAgentTurn({
      provider: 'gemini',
      adapter,
      systemInstruction: 'You are a GIS agent.',
      history: [],
      userMessage: 'How is vegetation health?',
      liveMapState: liveState,
      vectorLayers: [buildingsLayer],
      mapHandlers: mockHost().mapHandlers,
      analystPackId: null,
    })

    expect(result.usedNativeTools).toBe(true)
    expect(result.toolResults[0]?.name).toBe('read_rs_analysis')
    expect(result.replyText).toMatch(/Summary|Vegetation|NDVI/i)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('falls back to MAP_ACTION text protocol when native tools are unsupported', async () => {
    const flyTo = vi.fn(() => 'Centered on 25.2000, 55.2700')
    const adapter: GeoAiAgentModelAdapter = {
      provider: 'ollama',
      supportsNativeTools: false,
      complete: async () => ({
        text: 'Here is Dubai.\nMAP_ACTION:{"op":"flyTo","lng":55.27,"lat":25.2,"zoom":11}\n',
        toolCalls: [],
      }),
    }

    const result = await runGeoAiAgentTurn({
      provider: 'ollama',
      adapter,
      systemInstruction: 'You are a GIS agent.',
      history: [],
      userMessage: 'Show Dubai',
      liveMapState: liveState,
      vectorLayers: [],
      mapHandlers: { flyTo },
      analystPackId: null,
    })

    expect(result.usedNativeTools).toBe(false)
    expect(result.usedMapActionFallback).toBe(true)
    expect(flyTo).toHaveBeenCalled()
    expect(result.mapCommandResults[0]?.ok).toBe(true)
    expect(result.replyText).toMatch(/Dubai/i)
    expect(result.replyText).not.toMatch(/LIVE MAP STATE|read_live_map_state/i)
  })

  it('auto-runs an analyst pack for vegetation chip / intent with evidence reply', async () => {
    const zoomToAoi = vi.fn(() => 'Zoomed to the AOI.')
    const runRsIndex = vi.fn((index: string) => `Showing ${index} on the map for the current AOI.`)
    const complete = vi.fn().mockResolvedValue({
      text: 'should not be used',
      toolCalls: [],
    })
    const adapter: GeoAiAgentModelAdapter = {
      provider: 'gemini',
      supportsNativeTools: true,
      complete,
    }

    const result = await runGeoAiAgentTurn({
      provider: 'gemini',
      adapter,
      systemInstruction: 'You are a GIS agent.',
      history: [],
      userMessage: 'Summarize vegetation health for the current AOI using NDVI / Layer Live indices if available.',
      chipId: 'vegetation',
      liveMapState: liveState,
      vectorLayers: [buildingsLayer],
      mapHandlers: { ...mockHost().mapHandlers, zoomToAoi, runRsIndex },
    })

    expect(result.usedAnalystPack).toBe('vegetation')
    expect(result.toolResults.some(r => r.name === 'run_rs_index' && r.ok)).toBe(true)
    expect(result.toolResults.some(r => r.name === 'read_rs_analysis')).toBe(true)
    expect(result.toolResults.some(r => r.name === 'read_live_map_state')).toBe(true)
    expect(zoomToAoi).toHaveBeenCalled()
    expect(runRsIndex).toHaveBeenCalledWith('NDVI')
    expect(result.replyText).toMatch(/Showing NDVI|NDVI|Healthy|References/i)
    expect(result.replyText).not.toMatch(/LIVE MAP STATE|read_live_map_state/i)
    // Pack tools already produce the answer — skip LLM synthesis for speed.
    expect(complete).not.toHaveBeenCalled()
  })

  it('auto-runs density pack for count-buildings chip against loaded layers', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: 'Two building features are loaded on the map.',
      toolCalls: [],
    })
    const adapter: GeoAiAgentModelAdapter = {
      provider: 'claude',
      supportsNativeTools: true,
      complete,
    }

    const result = await runGeoAiAgentTurn({
      provider: 'claude',
      adapter,
      systemInstruction: 'You are a GIS agent.',
      history: [],
      userMessage: 'Count buildings in the current AOI or visible map extent from loaded vector layers.',
      chipId: 'count-buildings',
      liveMapState: liveState,
      vectorLayers: [buildingsLayer],
      mapHandlers: mockHost().mapHandlers,
    })

    expect(result.usedAnalystPack).toBe('count-buildings')
    expect(result.toolResults.some(r => r.name === 'run_vector_stats' && r.ok)).toBe(true)
    expect(result.replyText).toMatch(/building|2|References/i)
    expect(result.replyText).not.toMatch(/\*\*Evidence\*\*|LIVE MAP STATE/i)
    // Stats tools already produce the answer — skip LLM synthesis for speed.
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns weather pack reply from facts without calling the LLM', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: 'should not be used',
      toolCalls: [],
    })
    const adapter: GeoAiAgentModelAdapter = {
      provider: 'gemini',
      supportsNativeTools: true,
      complete,
    }
    const weatherFacts = `Location: Dubai (coordinates: latitude 25.20480, longitude 55.27080)
Current (Dubai): clear sky — temp 34.7°C, feels 41.7°C, humidity 59%, pressure 998 hPa, wind 5.07 m/s @ 180°.
Next intervals (3 h steps, first rows):
  - 2026-07-26 12:00:00: few clouds, temp 34.6°C, feels 41.5°C, precip prob 10%
  - 2026-07-26 15:00:00: broken clouds, temp 33.1°C, feels 39.2°C, precip prob 20%`

    const result = await runGeoAiAgentTurn({
      provider: 'gemini',
      adapter,
      systemInstruction: 'You are a GIS agent.',
      history: [],
      userMessage: 'Give the current weather and short forecast for the map focus / AOI.',
      chipId: 'weather',
      liveMapState: liveState,
      vectorLayers: [],
      mapHandlers: mockHost().mapHandlers,
      weatherFetcher: async () => weatherFacts,
    })

    expect(result.usedAnalystPack).toBe('weather')
    expect(complete).not.toHaveBeenCalled()
    expect(result.replyText).toMatch(/### Now|Temp|34\.7/i)
    expect(result.replyText).toMatch(/References|OpenWeather/i)
    expect(result.replyText).not.toMatch(/OPENWEATHER FACTS|LIVE MAP STATE/i)
  })
})
