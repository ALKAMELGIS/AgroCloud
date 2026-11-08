import { describe, expect, it } from 'vitest'

import { builderFiltersFor, type BuilderSelection } from './BuilderSelectionContext'
import { createBuilderElement } from './builderTypes'

const sel: BuilderSelection = { sourceId: 'el-src', field: 'Country', values: ['Egypt'], targets: 'all' }

describe('builderFiltersFor', () => {
  it('applies a selection to every other element, never to its source', () => {
    expect(builderFiltersFor('el-a', { 'el-src': sel })).toEqual([{ field: 'Country', values: ['Egypt'] }])
    expect(builderFiltersFor('el-src', { 'el-src': sel })).toEqual([])
  })

  it('reads targets from the source element as it is now', () => {
    const src = { ...createBuilderElement('list', 'el-src'), categoryField: 'Country', actionTargets: ['el-b'] }
    const elements = { 'el-src': src }
    expect(builderFiltersFor('el-a', { 'el-src': sel }, elements)).toEqual([])
    expect(builderFiltersFor('el-b', { 'el-src': sel }, elements)).toHaveLength(1)
    expect(builderFiltersFor('el-b', { 'el-src': sel }, { 'el-src': { ...src, actionTargets: 'none' } })).toEqual([])
  })

  it('drops selections whose source was deleted or now groups by another field', () => {
    expect(builderFiltersFor('el-a', { 'el-src': sel }, {})).toEqual([])
    const src = { ...createBuilderElement('list', 'el-src'), categoryField: 'Type' }
    expect(builderFiltersFor('el-a', { 'el-src': sel }, { 'el-src': src })).toEqual([])
  })
})
