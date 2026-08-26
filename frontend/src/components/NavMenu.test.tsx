import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SystemSettingsProvider } from '../store/SystemSettingsContext'
import NavMenu from './NavMenu'

const routerFuture = { v7_relativeSplatPath: true, v7_startTransition: true } as const

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('currentUser', JSON.stringify({ role: 'Admin' }))
  localStorage.setItem('appNotifications', JSON.stringify([]))
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? window.innerWidth <= 768 : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NavMenu vertical responsive', () => {
  it('renders vertical nav semantics and ARIA in desktop viewport', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveClass('navmenu')
    expect(nav).toHaveAttribute('data-viewport', 'desktop')
    expect(screen.getByRole('button', { name: /collapse navigation/i })).toBeInTheDocument()
  })

  it('opens and closes group with keyboard and keeps aria-expanded updated', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const dashboard = screen.getByRole('button', { name: /^dashboard$/i })
    expect(dashboard).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(dashboard, { key: 'Enter' })
    expect(dashboard).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(dashboard, { key: 'Escape' })
    expect(dashboard).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps primary navigation expanded on mobile (no hamburger toggle)', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu mobileNavOpen />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toHaveClass('navmenu-open')
    expect(screen.queryByRole('button', { name: /open navigation menu/i })).not.toBeInTheDocument()
    const list = document.getElementById('primary-nav')
    expect(list).toBeTruthy()
    expect(list).toHaveAttribute('aria-hidden', 'false')
  })

  it('closes flyout groups when tapping outside on mobile', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <div data-testid="outside">outside</div>
        <SystemSettingsProvider>
          <NavMenu mobileNavOpen />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const dashboard = screen.getByRole('button', { name: /^dashboard$/i })
    fireEvent.click(dashboard)
    expect(dashboard).toHaveAttribute('aria-expanded', 'true')
    fireEvent.touchStart(document.body)
    expect(dashboard).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles theme from ghost icon switch', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const themeBtn = screen.getByRole('switch')
    expect(themeBtn).toHaveClass('btn-text', 'btn-icon', 'text-neutral')
    const before = document.documentElement.getAttribute('data-theme')
    fireEvent.click(themeBtn)
    const after = document.documentElement.getAttribute('data-theme')
    expect(after).not.toBe(before)
  })

  it('renders AI AgroCloud group with chat link only', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture} initialEntries={['/dashboard/develop']}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const groupHeader = screen.getByRole('button', { name: /^ai agrocloud$/i })
    expect(groupHeader).toBeInTheDocument()
    fireEvent.click(groupHeader)
    expect(screen.getByRole('link', { name: /ai agro-chat/i })).toHaveAttribute('href', '/dashboards/ai-agro-chat')
  })
})
