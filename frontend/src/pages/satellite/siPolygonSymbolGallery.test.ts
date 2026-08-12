import { describe, expect, it } from 'vitest'
import {
  SI_POLYGON_SYMBOL_GALLERY,
  applySiPolygonGalleryItem,
} from './siPolygonSymbolGallery'

describe('siPolygonSymbolGallery', () => {
  it('includes ArcGIS-style black outline presets as hollow', () => {
    const black = SI_POLYGON_SYMBOL_GALLERY.find(i => i.id === 'poly-black-outline')
    expect(black).toBeTruthy()
    expect(black?.polygonFillAlpha).toBe(0)
    expect(black?.strokeColor).toBe('#000000')
  })

  it('includes land-use fills from the ArcGIS 2D set', () => {
    const labels = SI_POLYGON_SYMBOL_GALLERY.map(i => i.label)
    expect(labels).toEqual(
      expect.arrayContaining([
        'Airport',
        'Building Footprint',
        'Park',
        'Water (area)',
        'Dashed Black Outline',
      ]),
    )
  })

  it('maps gallery items to appearance patches', () => {
    const park = SI_POLYGON_SYMBOL_GALLERY.find(i => i.id === 'poly-park')!
    const patch = applySiPolygonGalleryItem(park)
    expect(patch.fillColor).toBe(park.fillColor)
    expect(patch.color).toBe(park.strokeColor)
    expect(patch.polygonFillAlpha).toBe(park.polygonFillAlpha)
    expect(patch.strokeStyle).toBe('solid')
  })
})
