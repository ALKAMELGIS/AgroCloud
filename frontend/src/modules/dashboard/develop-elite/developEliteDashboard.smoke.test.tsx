import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(
    'currentUser',
    JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com', role: 'Admin' }),
  )
  sessionStorage.setItem('agroSplashShown', '1')
  window.location.hash = '#/dashboard/develop'
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark')
        ? false
        : query.includes('max-width')
          ? window.innerWidth <= 768
          : false,
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

describe('Develop Elite dashboard smoke', () => {
  it('loads without global error boundary', async () => {
    const pageErrors: string[] = []
    const onError = (event: ErrorEvent) => {
      pageErrors.push(String(event.error?.message ?? event.message))
    }
    window.addEventListener('error', onError)

    render(<App />)

    await waitFor(
      () => {
        expect(screen.queryByText(/Something went wrong while loading the page/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Cannot read properties of undefined/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/is not defined/i)).not.toBeInTheDocument()
      },
      { timeout: 15_000 },
    )

    window.removeEventListener('error', onError)
    expect(pageErrors).toEqual([])
  }, 25_000)
})
