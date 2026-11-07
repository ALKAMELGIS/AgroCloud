import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreditsPage from './CreditsPage'

const api = vi.hoisted(() => ({
  fetchCreditWallet: vi.fn(),
  fetchCreditTransactions: vi.fn(),
  listIdentityUsers: vi.fn(),
  adjustUserCredits: vi.fn(),
}))
const auth = vi.hoisted(() => ({ permissions: [] as string[] }))
const snack = vi.hoisted(() => vi.fn())

vi.mock('../api/identityApi', () => api)
vi.mock('@/modules/identity/hooks/useAuthorization', () => ({
  useAuthorization: () => ({
    can: (p: string) => auth.permissions.includes(p),
    identityAvailable: true,
    identityChecked: true,
    recheckIdentity: vi.fn(),
  }),
}))
vi.mock('@/components/feedback/AppSnackbarProvider', () => ({ useAppSnackbar: () => ({ showSnack: snack }) }))

const field = { id: 7, uuid: 'u-field', name: 'Field Lead', email: 'lead@farm.com', role: 'Staff', status: 'Active' }

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchCreditWallet.mockResolvedValue({ balance: 100 })
  api.fetchCreditTransactions.mockResolvedValue([
    { id: 't2', amount: -20, balanceAfter: 100, type: 'usage', reason: 'NDVI export', referenceId: null, actorUserId: null, createdAt: '2026-11-02T08:00:00.000Z' },
    { id: 't1', amount: 120, balanceAfter: 120, type: 'admin_adjustment', reason: 'Season top-up', referenceId: null, actorUserId: 'a', createdAt: '2026-11-01T08:00:00.000Z' },
  ])
  api.listIdentityUsers.mockResolvedValue([field])
  api.adjustUserCredits.mockResolvedValue({ balance: 150 })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <CreditsPage />
    </MemoryRouter>,
  )
}

async function chooseUser() {
  const input = screen.getByLabelText('User')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value: 'Field' } })
  fireEvent.click(await screen.findByText('Field Lead · lead@farm.com'))
}

describe('CreditsPage', () => {
  it('shows the balance, totals and history; no admin form without credit-admin rights', async () => {
    auth.permissions = ['credits.read']
    renderPage()
    expect(await screen.findByText('Season top-up')).toBeTruthy()
    expect(screen.getByText('NDVI export')).toBeTruthy()
    expect(screen.getByText('+120')).toBeTruthy()
    expect(screen.getByText('−20')).toBeTruthy()
    expect(screen.queryByText("Adjust a user's credits")).toBeNull()
    expect(api.listIdentityUsers).not.toHaveBeenCalled()
  })

  it('adds credits for the chosen user using the identity UUID', async () => {
    auth.permissions = ['credits.read', 'credits.add', 'credits.remove']
    renderPage()
    await screen.findByText("Adjust a user's credits")
    await chooseUser()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Bonus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add credits' }))
    await waitFor(() =>
      expect(api.adjustUserCredits).toHaveBeenCalledWith({ userId: 'u-field', amount: 50, reason: 'Bonus' }),
    )
    await waitFor(() => expect(snack).toHaveBeenCalledWith('success', expect.stringContaining('now has 150')))
  })

  it('asks for confirmation before removing credits', async () => {
    auth.permissions = ['credits.read', 'credits.add', 'credits.remove']
    renderPage()
    await screen.findByText("Adjust a user's credits")
    await chooseUser()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove credits' }))
    expect(api.adjustUserCredits).not.toHaveBeenCalled()
    const warning = screen.getByRole('alert')
    expect(within(warning).getByText(/Remove 30 credits from Field Lead/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await waitFor(() => expect(api.adjustUserCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: -30 })))
  })

  it('rejects non-positive amounts', async () => {
    auth.permissions = ['credits.read', 'credits.add']
    renderPage()
    await screen.findByText("Adjust a user's credits")
    await chooseUser()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    expect(screen.getByText('Enter a whole number above 0')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add credits' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
