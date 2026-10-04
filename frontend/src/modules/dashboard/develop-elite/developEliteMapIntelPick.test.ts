import { describe, expect, it } from 'vitest'
import { shouldIgnoreDevelopEliteMapIntelPickClick } from './developEliteMapIntelPick'

describe('developEliteMapIntelPick', () => {
  it('ignores clicks on insight panel and draw chrome', () => {
    const panel = document.createElement('aside')
    panel.className = 'develop-elite-map__insight-panel'
    const btn = document.createElement('button')
    panel.appendChild(btn)
    document.body.appendChild(panel)

    expect(shouldIgnoreDevelopEliteMapIntelPickClick(btn)).toBe(true)

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    expect(shouldIgnoreDevelopEliteMapIntelPickClick(path)).toBe(false)

    panel.remove()
  })
})
