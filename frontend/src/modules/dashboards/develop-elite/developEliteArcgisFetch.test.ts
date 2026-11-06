import { describe, expect, it } from 'vitest'

import {
  developElitePrimaryStructuresLayerUrl,
  developEliteStructuresQueryLayerUrls,
  resolveDevelopEliteFeatureLayerUrl,
} from './developEliteArcgisFetch'



const SERVICE =

  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer'



describe('developEliteStructuresQueryLayerUrls', () => {

  it('maps portal layer 27 to queryable polygon layers (0 then 21)', () => {

    const urls = developEliteStructuresQueryLayerUrls(`${SERVICE}/27`)

    expect(urls[0]).toBe(`${SERVICE}/0`)

    expect(urls[1]).toBe(`${SERVICE}/21`)

  })



  it('keeps layer 0 as the only candidate', () => {

    expect(developEliteStructuresQueryLayerUrls(`${SERVICE}/0`)).toEqual([`${SERVICE}/0`])

  })

})



describe('developElitePrimaryStructuresLayerUrl', () => {
  it('maps portal layer 27 to FeatureServer/21 for zone Name list', () => {
    expect(developElitePrimaryStructuresLayerUrl(`${SERVICE}/27`)).toBe(`${SERVICE}/21`)
    expect(developElitePrimaryStructuresLayerUrl(`${SERVICE}/0`)).toBe(`${SERVICE}/21`)
  })
})

describe('resolveDevelopEliteFeatureLayerUrl', () => {

  it('uses layer 0 for queries when settings reference layer 27', () => {

    expect(resolveDevelopEliteFeatureLayerUrl(`${SERVICE}/27`)).toBe(`${SERVICE}/0`)

  })



  it('maps mistaken crops layer 1 on structures URL to polygon layer 0', () => {

    expect(resolveDevelopEliteFeatureLayerUrl(`${SERVICE}/1`)).toBe(`${SERVICE}/0`)

  })

})


