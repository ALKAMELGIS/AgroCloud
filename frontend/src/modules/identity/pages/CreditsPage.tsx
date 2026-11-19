import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import TollOutlinedIcon from '@mui/icons-material/TollOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import { KpiCard, PageContainer, PageHeader, SectionHeader } from '@/components'
import { ResponsiveDataTable, type ResponsiveColumn } from '@/components/data-display/ResponsiveDataTable'
import { useAppSnackbar } from '@/components/feedback/AppSnackbarProvider'
import { IdentityGate } from '@/modules/identity/components/IdentityGate'
import { useAuthorization } from '@/modules/identity/hooks/useAuthorization'
import {
  adjustUserCredits,
  fetchCreditTransactions,
  fetchCreditWallet,
  listIdentityUsers,
  type CreditTransaction,
  type IdentityUser,
} from '../api/identityApi'

const TYPE_LABELS: Record<string, string> = {
  welcome_bonus: 'Welcome bonus',
  purchase: 'Purchase',
  subscription: 'Subscription',
  usage: 'Usage',
  refund: 'Refund',
  admin_adjustment: 'Admin adjustment',
  promotional: 'Promotional',
  expiration: 'Expiration',
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function formatSigned(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${numberFormat.format(Math.abs(n))}`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d)
}

/** The identity UUID: the API resolves it directly (the numeric `id` only exists for directory-era users). */
function userKey(u: IdentityUser) {
  return String(u.uuid ?? u.id)
}

export default function CreditsPage() {
  const { can, identityAvailable, identityChecked, recheckIdentity } = useAuthorization()
  const { showSnack } = useAppSnackbar()
  const allowed = can('credits.read')
  const canAdd = can('credits.add')
  const canRemove = can('credits.remove')
  const canAdjust = canAdd || canRemove

  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [users, setUsers] = useState<IdentityUser[]>([])
  const [target, setTarget] = useState<IdentityUser | null>(null)
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [amountText, setAmountText] = useState('')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([fetchCreditWallet(), fetchCreditTransactions(100)])
      .then(([wallet, txs]) => {
        setBalance(wallet.balance)
        setTransactions(txs)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load credits'))
      .finally(() => setLoading(false))
  }, [])

  const ready = identityAvailable && allowed

  useEffect(() => {
    if (ready) reload()
  }, [ready, reload])

  useEffect(() => {
    if (!ready || !canAdjust) return
    listIdentityUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [ready, canAdjust])

  useEffect(() => {
    // Keep the toggle on an allowed direction.
    if (direction === 'add' && !canAdd && canRemove) setDirection('remove')
    if (direction === 'remove' && !canRemove && canAdd) setDirection('add')
  }, [canAdd, canRemove, direction])

  const totals = useMemo(() => {
    let earned = 0
    let spent = 0
    for (const t of transactions) {
      if (t.amount > 0) earned += t.amount
      else spent += -t.amount
    }
    return { earned, spent }
  }, [transactions])

  const amount = Number(amountText)
  const amountInvalid = amountText.trim() !== '' && (!Number.isInteger(amount) || amount <= 0)
  const canSubmit = Boolean(target) && amountText.trim() !== '' && !amountInvalid && !saving

  const resetForm = () => {
    setAmountText('')
    setReason('')
    setConfirming(false)
  }

  const submit = () => {
    if (!target || !canSubmit) return
    // Removing credits cannot be undone from here — ask once before applying it.
    if (direction === 'remove' && !confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    adjustUserCredits({
      userId: userKey(target),
      amount: direction === 'add' ? amount : -amount,
      reason: reason.trim() || undefined,
    })
      .then((r) => {
        showSnack(
          'success',
          `${direction === 'add' ? 'Added' : 'Removed'} ${numberFormat.format(amount)} credits · ${target.name} now has ${numberFormat.format(r.balance)}`,
        )
        resetForm()
        reload()
      })
      .catch((e) => {
        setConfirming(false)
        setError(e instanceof Error ? e.message : 'Adjustment failed')
      })
      .finally(() => setSaving(false))
  }

  const columns: ResponsiveColumn<CreditTransaction>[] = [
    {
      id: 'when',
      header: 'Date',
      mobilePrimary: true,
      render: (t) => formatDate(t.createdAt),
    },
    {
      id: 'type',
      header: 'Type',
      render: (t) => <Chip size="small" variant="outlined" label={TYPE_LABELS[t.type] ?? t.type} />,
    },
    {
      id: 'amount',
      header: 'Amount',
      render: (t) => (
        <Typography
          component="span"
          variant="body2"
          sx={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            color: t.amount >= 0 ? 'success.main' : 'error.main',
          }}
        >
          {formatSigned(t.amount)}
        </Typography>
      ),
    },
    {
      id: 'balance',
      header: 'Balance after',
      render: (t) => (
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {numberFormat.format(t.balanceAfter)}
        </Box>
      ),
    },
    {
      id: 'reason',
      header: 'Reason',
      render: (t) => t.reason || '—',
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title="Credits"
        description="Your credit balance and every change to it. Administrators can add or remove credits for users they manage."
        icon={<TollOutlinedIcon />}
        actions={
          ready ? (
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reload} disabled={loading}>
              Refresh
            </Button>
          ) : undefined
        }
      />
      <IdentityGate
        checked={identityChecked}
        available={identityAvailable}
        allowed={allowed}
        onRetry={recheckIdentity}
        offlineTitle="Credits need the identity service"
        offlineDescription="Credit balances are stored in the server identity database, which is not reachable. Start the API server with AGROCLOUD_IDENTITY=on, then retry."
      >
        {error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
            // Phones: balance on its own row, received/used side by side.
            '& > :first-of-type': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
          }}
        >
          <KpiCard
            title="Balance"
            value={balance == null ? '—' : numberFormat.format(balance)}
            subtitle="Credits available"
            loading={loading && balance == null}
          />
          <KpiCard
            title="Received"
            value={numberFormat.format(totals.earned)}
            subtitle={
              transactions.length === 1 ? 'From 1 change' : `From the last ${transactions.length} changes`
            }
            loading={loading && balance == null}
          />
          <KpiCard
            title="Used"
            value={numberFormat.format(totals.spent)}
            subtitle="Usage, removals and expiry"
            loading={loading && balance == null}
          />
        </Box>

        {canAdjust ? (
          <Card variant="outlined" component="section">
            <CardContent>
              <SectionHeader
                title="Adjust a user's credits"
                description="Applies immediately and is recorded in the user's history and the audit log."
              />
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
                  <Autocomplete
                    options={users}
                    value={target}
                    onChange={(_e, v) => {
                      setTarget(v)
                      setConfirming(false)
                    }}
                    getOptionLabel={(u) => `${u.name} · ${u.email}`}
                    isOptionEqualToValue={(a, b) => userKey(a) === userKey(b)}
                    sx={{ flex: 2, minWidth: 0 }}
                    renderInput={(params) => (
                      <TextField {...params} label="User" helperText="Users in your organisation and scope" />
                    )}
                  />
                  <ToggleButtonGroup
                    exclusive
                    value={direction}
                    onChange={(_e, v) => {
                      if (v) {
                        setDirection(v)
                        setConfirming(false)
                      }
                    }}
                    aria-label="Add or remove credits"
                    size="small"
                    sx={{ alignSelf: { xs: 'stretch', md: 'flex-start' }, minHeight: 40 }}
                  >
                    <ToggleButton value="add" disabled={!canAdd} sx={{ flex: 1, px: 2.5 }}>
                      Add
                    </ToggleButton>
                    <ToggleButton value="remove" disabled={!canRemove} sx={{ flex: 1, px: 2.5 }}>
                      Remove
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <TextField
                    label="Amount"
                    value={amountText}
                    onChange={(e) => {
                      setAmountText(e.target.value.replace(/[^\d]/g, ''))
                      setConfirming(false)
                    }}
                    inputProps={{ inputMode: 'numeric', 'aria-describedby': 'credits-amount-help' }}
                    error={amountInvalid}
                    helperText={amountInvalid ? 'Enter a whole number above 0' : 'Whole credits'}
                    FormHelperTextProps={{ id: 'credits-amount-help' }}
                    sx={{ flex: 1, minWidth: { md: 140 }, '& input': { fontVariantNumeric: 'tabular-nums' } }}
                  />
                </Stack>
                <TextField
                  label="Reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Season top-up, correction for duplicate charge"
                  helperText="Shown in the user's history (optional)"
                  inputProps={{ maxLength: 500 }}
                />
                {confirming && target ? (
                  <Alert severity="warning">
                    Remove {numberFormat.format(amount)} credits from {target.name}? This cannot be undone here; add them
                    back with a new adjustment if needed.
                  </Alert>
                ) : null}
                <Stack
                  direction={{ xs: 'column-reverse', sm: 'row' }}
                  spacing={1.5}
                  justifyContent="flex-end"
                  sx={{ '& > button': { width: { xs: '100%', sm: 'auto' } } }}
                >
                  {confirming ? (
                    <Button onClick={() => setConfirming(false)} disabled={saving}>
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    variant="contained"
                    color={direction === 'remove' ? 'error' : 'primary'}
                    onClick={submit}
                    disabled={!canSubmit}
                  >
                    {saving
                      ? 'Saving…'
                      : confirming
                        ? 'Confirm removal'
                        : direction === 'add'
                          ? 'Add credits'
                          : 'Remove credits'}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Card variant="outlined" component="section">
          <CardContent>
            <SectionHeader title="History" description="Newest first. Every change is listed with the balance after it." />
            <ResponsiveDataTable
              rows={transactions}
              columns={columns}
              empty={
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  {loading ? 'Loading…' : 'No credit changes yet. Added, used or removed credits will appear here.'}
                </Typography>
              }
            />
          </CardContent>
        </Card>
      </IdentityGate>
    </PageContainer>
  )
}
