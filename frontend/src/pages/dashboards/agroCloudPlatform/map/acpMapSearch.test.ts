import { describe, expect, it } from 'vitest'
import { searchAcpPortalLayers, searchAcpStructureFields } from './acpMapSearch'

describe('acpMapSearch', () => {
  it('matches Agro_Structures fields by name and object id', () => {
    const mask: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [31.2, 30.1] },
          properties: {
            OBJECTID: 42,
            Field_Name: 'North Greenhouse',
            Farm_Code: 'EG-01',
            Structure_Type: 1007,
            Country: '3',
            City: 'Cairo',
          },
        },
      ],
    }

    const byName = searchAcpStructureFields('north green', mask)
    expect(byName).toHaveLength(1)
    expect(byName[0]?.kind).toBe('field')
    expect(byName[0]?.label).toContain('North')

    const byObjectId = searchAcpStructureFields('42', mask)
    expect(byObjectId.some(hit => hit.kind === 'field')).toBe(true)
  })

  it('matches hosted GIS layer titles', () => {
    const hits = searchAcpPortalLayers('agro_structures', [
      { id: 'layer-1', title: 'Agro_Structures' },
      { id: 'layer-2', title: 'Roads' },
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.layerTitle).toBe('Agro_Structures')
  })
})
