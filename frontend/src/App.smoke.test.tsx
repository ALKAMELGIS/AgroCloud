import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(
    'currentUser',
    JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com', role: 'Admin' }),
  )
  sessionStorage.setItem('agroSplashShown', '1')
  window.location.hash = '#/'
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? false : query.includes('max-width') ? window.innerWidth <= 768 : false,
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
  vi.restoreAllMocks()
})

describe('App smoke', () => {
  it('renders home shell without the global error boundary', async () => {
    const pageErrors: string[] = []
    const onError = (event: ErrorEvent) => {
      pageErrors.push(String(event.error?.message ?? event.message))
    }
    window.addEventListener('error', onError)

    render(<App />)

    await waitFor(
      () => {
        expect(screen.queryByText(/Something went wrong while loading the page/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Cannot convert object to primitive value/i)).not.toBeInTheDocument()
      },
      { timeout: 8000 },
    )

    window.removeEventListener('error', onError)
    expect(pageErrors).toEqual([])
  })


  it('tolerates corrupted system settings in localStorage', async () => {
    localStorage.setItem(
      'agri_system_settings_v1',
      JSON.stringify({
        version: 1,
        themeMode: { bad: true },
        navGroupOrder: [{ id: 'dashboard' }],
        navItemOrders: { dashboard: [{ id: 'x' }] },
        navOverrides: { home: { labelEn: { x: 1 }, iconClass: { y: 2 } } },
        customPages: [{ id: 1, name: 'Bad', path: { to: '/oops' }, visible: true, bindTarget: 'placeholder' }],
        headerSettings: { fontFamily: { bad: true }, logoAlign: { bad: true } },
      }),
    )
    render(<App />)
    await waitFor(
      () => {
        expect(screen.queryByText(/Something went wrong while loading the page/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Cannot convert object to primitive value/i)).not.toBeInTheDocument()
        expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument()
      },
      { timeout: 8000 },
    )
  })
})
