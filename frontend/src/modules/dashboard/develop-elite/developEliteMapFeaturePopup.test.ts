import { describe, expect, it } from 'vitest'
import {
  buildDevelopEliteArcgisFeaturePopupHtml,
  escapeDevelopEliteMapPopupHtml,
} from './developEliteMapFeaturePopup'

describe('developEliteMapFeaturePopup', () => {
  it('escapes HTML in popup text', () => {
    expect(escapeDevelopEliteMapPopupHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('renders layer title and attribute rows', () => {
    const html = buildDevelopEliteArcgisFeaturePopupHtml('Tree', {
      OBJECTID: 1,
      Name: 'Date Tree',
      ZONE_ID: 'MH',
      Shape__Area: 999,
    })
    expect(html).toContain('Date Tree')
    expect(html).toContain('Tree')
    expect(html).toContain('data-develop-elite-popup-zoom')
    expect(html).not.toContain('Shape__Area')
  })

  it('omits ArcGIS editor audit fields from popup rows', () => {
    const html = buildDevelopEliteArcgisFeaturePopupHtml('AgroLocation', {
      Name: 'Liwa 32',
      created_user: 'subscriptions@eliteprojects.ae',
      last_edited_user: 'subscriptions@eliteprojects.ae',
      created_date: 1785399700373,
      last_edited_date: 1785399700373,
    })
    expect(html).toContain('Liwa 32')
    expect(html).not.toContain('subscriptions@eliteprojects.ae')
    expect(html).not.toContain('last edited user')
  })

  it('resolves unique-value labels from drawingInfo', () => {
    const html = buildDevelopEliteArcgisFeaturePopupHtml(
      'AgroLocation',
      { Subtype: 2, Name: 'Plot A' },
      {
        layerKey: 'agri-location',
        drawingInfo: {
          renderer: {
            type: 'uniqueValue',
            field1: 'Subtype',
            uniqueValueInfos: [{ value: 2, label: 'Wildlife Project', symbol: { type: 'esriSMS' } }],
          },
        },
      },
    )
    expect(html).toContain('Wildlife Project')
  })
})
