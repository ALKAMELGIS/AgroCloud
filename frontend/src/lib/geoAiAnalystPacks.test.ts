import { describe, expect, it } from 'vitest'
import {
  buildGeoAiAnalystPackToolCalls,
  classifyGeoAiAnalystIntent,
  geoAiAnalystPackLabel,
} from './geoAiAnalystPacks'

describe('classifyGeoAiAnalystIntent', () => {
  it('prefers chip id over free-text heuristics', () => {
    expect(classifyGeoAiAnalystIntent('weather here', 'vegetation')).toBe('vegetation')
    expect(classifyGeoAiAnalystIntent('anything', 'count-buildings')).toBe('count-buildings')
    expect(classifyGeoAiAnalystIntent('anything', 'analyze-aoi')).toBe('analyze-aoi')
    expect(classifyGeoAiAnalystIntent('anything', 'flood-slope')).toBe('flood-slope')
    expect(classifyGeoAiAnalystIntent('weather here', 'neighborhood')).toBe('neighborhood')
  })

  it('classifies free-text AOI / density / neighborhood / vegetation / heat intents', () => {
    expect(classifyGeoAiAnalystIntent('Analyze this AOI using current layers')).toBe('analyze-aoi')
    expect(classifyGeoAiAnalystIntent('count buildings in the AOI')).toBe('count-buildings')
    expect(classifyGeoAiAnalystIntent('What is the building density here?')).toBe('count-buildings')
    expect(classifyGeoAiAnalystIntent('Describe the neighborhood around the current AOI')).toBe(
      'neighborhood',
    )
    expect(classifyGeoAiAnalystIntent("What's around this area?")).toBe('neighborhood')
    expect(classifyGeoAiAnalystIntent('Characterize the surroundings near the AOI')).toBe(
      'neighborhood',
    )
    expect(classifyGeoAiAnalystIntent('What is the area character here?')).toBe('neighborhood')
    expect(
      classifyGeoAiAnalystIntent(
        'Describe buildings, roads, and vegetation near the AOI',
      ),
    ).toBe('neighborhood')
    expect(classifyGeoAiAnalystIntent('Summarize vegetation health with NDVI')).toBe('vegetation')
    expect(classifyGeoAiAnalystIntent('Why is it hot near this AOI?')).toBe('flood-slope')
    expect(classifyGeoAiAnalystIntent('Give flood and slope context')).toBe('flood-slope')
    expect(classifyGeoAiAnalystIntent('What is the weather near the AOI?')).toBe('weather')
    expect(classifyGeoAiAnalystIntent('Summarize the loaded GIS layers')).toBe('layer-summary')
    expect(classifyGeoAiAnalystIntent('How many population on it')).toBe('layer-attribute')
    expect(classifyGeoAiAnalystIntent('What is the population field on this layer?')).toBe('layer-attribute')
    expect(classifyGeoAiAnalystIntent('Hello there')).toBe(null)
  })
})

describe('buildGeoAiAnalystPackToolCalls', () => {
  it('composes multi-tool packs for AOI / vegetation / density / neighborhood / heat', () => {
    const aoi = buildGeoAiAnalystPackToolCalls('analyze-aoi', 'Analyze this AOI')
    expect(aoi.map(t => t.name)).toEqual([
      'zoom_to_aoi',
      'read_live_map_state',
      'read_rs_analysis',
      'run_vector_stats',
      'get_weather_context',
    ])

    const veg = buildGeoAiAnalystPackToolCalls('vegetation', 'veg health')
    expect(veg.map(t => t.name)).toEqual(['zoom_to_aoi', 'read_rs_analysis', 'read_live_map_state'])

    const density = buildGeoAiAnalystPackToolCalls('count-buildings', 'count buildings')
    expect(density.some(t => t.name === 'run_vector_stats' && t.args.query === 'count buildings')).toBe(true)
    expect(density.some(t => t.name === 'run_vector_stats' && t.args.query === 'count roads')).toBe(true)

    const neighborhood = buildGeoAiAnalystPackToolCalls(
      'neighborhood',
      'Describe the neighborhood around the AOI',
    )
    expect(neighborhood.map(t => t.name)).toEqual([
      'zoom_to_aoi',
      'read_live_map_state',
      'run_vector_stats',
      'run_vector_stats',
      'read_rs_analysis',
      'get_weather_context',
    ])
    expect(
      neighborhood.some(t => t.name === 'run_vector_stats' && t.args.query === 'count buildings'),
    ).toBe(true)
    expect(
      neighborhood.some(t => t.name === 'run_vector_stats' && t.args.query === 'count roads'),
    ).toBe(true)

    const heat = buildGeoAiAnalystPackToolCalls('flood-slope', 'why is it hot')
    expect(heat.map(t => t.name)).toEqual([
      'zoom_to_aoi',
      'read_live_map_state',
      'read_rs_analysis',
      'get_weather_context',
    ])
  })

  it('exposes human labels', () => {
    expect(geoAiAnalystPackLabel('vegetation')).toMatch(/Vegetation/i)
    expect(geoAiAnalystPackLabel('neighborhood')).toMatch(/Neighborhood/i)
  })

  it('keeps weather pack to a single weather tool for fast replies', () => {
    const weather = buildGeoAiAnalystPackToolCalls('weather', 'Weather here')
    expect(weather.map(t => t.name)).toEqual(['get_weather_context'])
    expect(weather[0]?.args.query).toMatch(/Weather here/i)
  })
})
