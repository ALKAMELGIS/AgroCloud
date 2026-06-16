import { describe, expect, it } from 'vitest'
import {
  applyBodyLayoutDrop,
  buildDefaultBodyLayout,
  collectLayoutElementIds,
  elementLayoutNode,
  hitTestLayoutDropZone,
  removeElementFromBodyLayout,
  resolveBodyLayout,
  resolveLayoutDropIntent,
} from './agroCloudDashboardBodyLayout'
import { appendDashboardElement, createGenericDashboardElement } from './agroCloudDashboardElements'
import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'

describe('agroCloudDashboardBodyLayout', () => {
  it('builds a vertical split for multiple body elements', () => {
    const layout = buildDefaultBodyLayout(['a', 'b'])
    expect(layout?.kind).toBe('split')
    if (layout?.kind === 'split') {
      expect(layout.direction).toBe('row')
      expect(collectLayoutElementIds(layout)).toEqual(['a', 'b'])
    }
  })

  it('resolves dock intents from edge zones', () => {
    expect(resolveLayoutDropIntent('left', false)).toEqual({ type: 'dock', zone: 'left' })
    expect(resolveLayoutDropIntent('center', false)).toEqual({ type: 'stack' })
    expect(resolveLayoutDropIntent('center', true)).toEqual({ type: 'group', direction: 'row' })
  })

  it('hit-tests center and edge zones', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect
    expect(hitTestLayoutDropZone(50, 50, rect)).toBe('center')
    expect(hitTestLayoutDropZone(10, 50, rect)).toBe('left')
    expect(hitTestLayoutDropZone(90, 50, rect)).toBe('right')
    expect(hitTestLayoutDropZone(50, 10, rect)).toBe('top')
    expect(hitTestLayoutDropZone(50, 90, rect)).toBe('bottom')
  })

  it('docks dragged element to the right of target', () => {
    const layout = buildDefaultBodyLayout(['map', 'chart'])!
    const next = applyBodyLayoutDrop(layout, 'map', 'chart', { type: 'dock', zone: 'right' })
    expect(next?.kind).toBe('split')
    if (next?.kind === 'split' && next.direction === 'row') {
      const bottom = next.children[1]
      expect(bottom?.kind).toBe('split')
      if (bottom?.kind === 'split' && bottom.direction === 'column') {
        expect(collectLayoutElementIds(bottom)).toEqual(['chart', 'map'])
      }
    }
  })

  it('stacks dragged element on target', () => {
    const layout = elementLayoutNode('a')
    const next = applyBodyLayoutDrop(layout, 'b', 'a', { type: 'stack' })
    expect(next?.kind).toBe('stack')
    if (next?.kind === 'stack') {
      expect(collectLayoutElementIds(next)).toEqual(['a', 'b'])
    }
  })

  it('groups dragged element with shift intent', () => {
    const layout = elementLayoutNode('a')
    const next = applyBodyLayoutDrop(layout, 'b', 'a', { type: 'group', direction: 'row' })
    expect(next?.kind).toBe('group')
    if (next?.kind === 'group') {
      expect(collectLayoutElementIds(next)).toEqual(['a', 'b'])
    }
  })

  it('removes stale element nodes and collapses split', () => {
    const layout = buildDefaultBodyLayout(['a', 'b'])!
    const next = removeElementFromBodyLayout(layout, 'a')
    expect(next).toEqual(elementLayoutNode('b'))
  })

  it('does not duplicate a widget when appending the first body element', () => {
    const config = appendDashboardElement(
      { ...({ theme: 'light', timeZone: 'device' as const, elements: [] } satisfies AgroCloudDashboardConfig) },
      createGenericDashboardElement('serial-chart', 'Serial chart'),
    )
    expect(config.elements).toHaveLength(1)
    expect(collectLayoutElementIds(config.bodyLayout ?? null)).toEqual([config.elements[0]!.id])
  })
})
