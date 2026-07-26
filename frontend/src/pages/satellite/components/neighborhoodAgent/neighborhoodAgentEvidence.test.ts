import { describe, expect, it } from 'vitest'
import type { GeoAiAgentTurnResult } from '../../../../lib/geoAiAgentTurn'
import {
  buildNeighborhoodAgentEvidenceFromTurn,
  geoAiAgentToolChipLabel,
  geoAiPackResultToExplorerMessage,
} from './neighborhoodAgentEvidence'

describe('neighborhoodAgentEvidence', () => {
  it('labels vector-stats chips from content', () => {
    expect(geoAiAgentToolChipLabel('run_vector_stats', 'Building count: 12')).toBe('Buildings')
    expect(geoAiAgentToolChipLabel('run_vector_stats', 'Road length 3.2 km')).toBe('Roads')
    expect(geoAiAgentToolChipLabel('read_live_map_state', 'AOI ready')).toBe('Live map')
  })

  it('builds thought title and Viewed chips from pack turn', () => {
    const evidence = buildNeighborhoodAgentEvidenceFromTurn({
      usedAnalystPack: 'neighborhood',
      toolResults: [
        { name: 'zoom_to_aoi', ok: true, content: 'Zoomed to the AOI.' },
        { name: 'read_live_map_state', ok: true, content: 'AOI: yes\nLayers: 3' },
        { name: 'run_vector_stats', ok: true, content: 'Building count: 42' },
        { name: 'run_vector_stats', ok: true, content: 'Road segments: 18' },
        { name: 'read_rs_analysis', ok: false, content: 'No RS overlay' },
      ],
    })
    expect(evidence).not.toBeNull()
    expect(evidence!.packId).toBe('neighborhood')
    expect(evidence!.thoughtTitle).toContain('Neighborhood')
    expect(evidence!.tools.map(t => t.label)).toEqual([
      'Zoom to AOI',
      'Live map',
      'Buildings',
      'Roads',
      'RS analysis',
    ])
    expect(evidence!.tools.filter(t => t.ok)).toHaveLength(4)
    expect(evidence!.tools.find(t => t.label === 'RS analysis')?.ok).toBe(false)
  })

  it('returns null when no tools ran', () => {
    expect(buildNeighborhoodAgentEvidenceFromTurn({ toolResults: [], usedAnalystPack: null })).toBeNull()
  })

  it('attaches cleaned reply text without agentEvidence dumps', () => {
    const turn = {
      replyText: 'Neighborhood looks residential.\n\n**References**\n- AgroCloud live map',
      rawModelText: 'Neighborhood looks residential.',
      toolResults: [
        { name: 'read_live_map_state', ok: true, content: 'Layers: 2' },
        { name: 'get_weather_context', ok: true, content: '28°C clear' },
      ],
      mapCommandResults: [],
      usedNativeTools: false,
      usedMapActionFallback: false,
      usedAnalystPack: 'neighborhood' as const,
    } satisfies GeoAiAgentTurnResult

    const msg = geoAiPackResultToExplorerMessage(turn, 'm1')
    expect(msg.id).toBe('m1')
    expect(msg.role).toBe('model')
    expect(msg.parts[0]?.type).toBe('text')
    if (msg.parts[0]?.type === 'text') {
      expect(msg.parts[0].text).toMatch(/residential/i)
      expect(msg.parts[0].text).not.toMatch(/read_live_map_state|LIVE MAP STATE/i)
    }
    expect(msg.agentEvidence).toBeUndefined()
  })
})
