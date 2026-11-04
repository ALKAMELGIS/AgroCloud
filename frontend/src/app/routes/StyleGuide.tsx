import { useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import type { TypographyProps } from '@mui/material'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  KpiCard,
  PageContainer,
  PageHeader,
  ResponsiveDataTable,
  SectionHeader,
  StatePanel,
} from '@/components'
import { agroColors, agroRadius, type AgroColorMode, type AgroSemanticColors } from '@/theme'

/** Token key -> CSS custom property exposed by agro-premium.css (where one exists). */
const swatches: Array<{ key: keyof AgroSemanticColors; label: string; cssVar?: string }> = [
  { key: 'bg', label: 'Background', cssVar: '--ds-color-bg' },
  { key: 'surface', label: 'Surface', cssVar: '--ds-color-surface' },
  { key: 'surfaceSunken', label: 'Surface 2', cssVar: '--ds-color-surface-2' },
  { key: 'text', label: 'Text', cssVar: '--ds-color-text' },
  { key: 'textSecondary', label: 'Text secondary', cssVar: '--ds-color-text-secondary' },
  { key: 'textMuted', label: 'Text muted', cssVar: '--ds-color-text-muted' },
  { key: 'border', label: 'Border', cssVar: '--ds-color-border' },
  { key: 'borderStrong', label: 'Border strong', cssVar: '--ds-color-border-strong' },
  { key: 'primary', label: 'Primary', cssVar: '--ds-color-primary' },
  { key: 'primaryHover', label: 'Primary hover', cssVar: '--ds-color-primary-hover' },
  { key: 'primarySoft', label: 'Primary soft', cssVar: '--ds-color-primary-soft' },
  { key: 'onPrimary', label: 'On primary', cssVar: '--ds-color-on-primary' },
  { key: 'secondary', label: 'Secondary', cssVar: '--ds-color-secondary' },
  { key: 'accent', label: 'Accent', cssVar: '--ds-color-accent' },
  { key: 'success', label: 'Success', cssVar: '--ds-color-success' },
  { key: 'warning', label: 'Warning', cssVar: '--ds-color-warning' },
  { key: 'danger', label: 'Danger', cssVar: '--ds-color-danger' },
  { key: 'info', label: 'Info', cssVar: '--ds-color-info' },
]

const typeScale: Array<{ variant: NonNullable<TypographyProps['variant']>; sample: string }> = [
  { variant: 'h1', sample: 'Farm operations' },
  { variant: 'h2', sample: 'Irrigation schedule' },
  { variant: 'h3', sample: 'Page title (PageHeader)' },
  { variant: 'h4', sample: 'Panel heading' },
  { variant: 'h5', sample: 'Card title' },
  { variant: 'h6', sample: 'Section title (SectionHeader)' },
  { variant: 'subtitle1', sample: 'Subtitle for summaries' },
  { variant: 'body1', sample: 'Body text for reading content and descriptions.' },
  { variant: 'body2', sample: 'Default UI text: tables, forms and dense panels.' },
  { variant: 'caption', sample: 'Caption: helper text and metadata' },
  { variant: 'overline', sample: 'Overline label' },
]

type FieldRow = { id: string; field: string; crop: string; area: string; status: string }
const sampleRows: FieldRow[] = [
  { id: 'f1', field: 'North Block A', crop: 'Date palm', area: '12.4 ha', status: 'Irrigating' },
  { id: 'f2', field: 'East Orchard', crop: 'Citrus', area: '8.1 ha', status: 'Healthy' },
  { id: 'f3', field: 'Greenhouse 3', crop: 'Tomato', area: '0.6 ha', status: 'Needs check' },
]

function statusColor(s: string): 'success' | 'warning' | 'info' {
  if (s === 'Healthy') return 'success'
  if (s === 'Needs check') return 'warning'
  return 'info'
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" component="section" aria-label={title} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3.5 }}>
      <SectionHeader title={title} description={description} />
      {children}
    </Paper>
  )
}

function SwatchGrid({ mode }: { mode: AgroColorMode }) {
  const c = agroColors[mode]
  return (
    <Box
      // A fixed mode preview: the frame uses that mode's own tokens, independent of the active theme.
      sx={{
        p: 2,
        borderRadius: `${agroRadius.lg}px`,
        bgcolor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {/* div + role: global `.page h3` color rules would otherwise override this fixed-mode preview. */}
      <Typography variant="overline" component="div" role="heading" aria-level={3} sx={{ color: c.textSecondary, display: 'block', mb: 1.5 }}>
        {mode === 'light' ? 'Light mode' : 'Dark mode'}
      </Typography>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gap: 1,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))',
        }}
      >
        {swatches.map((s) => (
          <Box
            component="li"
            key={s.key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              p: 1,
              borderRadius: `${agroRadius.sm}px`,
              bgcolor: c.surface,
              border: `1px solid ${c.border}`,
              minWidth: 0,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 32,
                height: 32,
                flexShrink: 0,
                borderRadius: `${agroRadius.xs}px`,
                bgcolor: c[s.key] as string,
                boxShadow: `inset 0 0 0 1px ${c.borderStrong}`,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" component="div" sx={{ fontWeight: 600, color: c.text, lineHeight: 1.3 }}>
                {s.label}
              </Typography>
              <Typography
                variant="caption"
                component="div"
                sx={{ fontFamily: 'var(--ds-font-mono)', fontSize: '0.6875rem', color: c.textMuted, overflowWrap: 'anywhere' }}
              >
                {String(c[s.key])}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default function StyleGuide() {
  const [modalOpen, setModalOpen] = useState(false)
  const [notify, setNotify] = useState(true)

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Design System"
        description="Tokens, components and patterns used across AgroCloud. Built on the MUI theme (src/theme) and the --ds-* CSS tokens (agro-premium.css)."
        icon={<PaletteOutlinedIcon />}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Style guide' }]}
        actions={
          <>
            <Chip label="v2" color="primary" variant="outlined" />
            <Button variant="contained" onClick={() => setModalOpen(true)}>
              Open dialog
            </Button>
          </>
        }
      />

      <Section
        title="Color tokens"
        description="agroColors from src/theme/tokens.ts, shown in both modes. In CSS use the matching var(--ds-color-*); in MUI use theme.palette."
      >
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          <SwatchGrid mode="light" />
          <SwatchGrid mode="dark" />
        </Box>
      </Section>

      <Section title="Type scale" description="Inter with IBM Plex Sans Arabic for RTL; 14px base for dense data screens.">
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={1.5}>
          {typeScale.map((t) => (
            <Stack key={t.variant} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 3 }} alignItems={{ sm: 'baseline' }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 96, flexShrink: 0, fontFamily: 'var(--ds-font-mono)' }}>
                {t.variant}
              </Typography>
              <Typography variant={t.variant} component="p" sx={{ m: 0 }}>
                {t.sample}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Section>

      <Section title="Buttons" description="One primary action per area. Minimum 44px touch target on mobile.">
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
          <Button variant="contained" startIcon={<AddRoundedIcon />}>
            Primary
          </Button>
          <Button variant="outlined">Secondary</Button>
          <Button variant="text">Tertiary</Button>
          <Button variant="contained" color="error">
            Destructive
          </Button>
          <Button variant="outlined" color="secondary">
            Info
          </Button>
          <Button variant="contained" disabled>
            Disabled
          </Button>
          <Button variant="contained" size="small">
            Small
          </Button>
        </Stack>
      </Section>

      <Section title="Inputs" description="Visible labels, helper text below, errors stated in words as well as color.">
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <TextField label="Field name" placeholder="e.g. North Block A" helperText="Shown on maps and reports." />
          <TextField select label="Crop" defaultValue="palm">
            <MenuItem value="palm">Date palm</MenuItem>
            <MenuItem value="citrus">Citrus</MenuItem>
            <MenuItem value="tomato">Tomato</MenuItem>
          </TextField>
          <TextField label="Area (ha)" defaultValue="-2" error helperText="Area must be greater than 0." />
          <TextField label="Search" type="search" placeholder="Search fields" />
          <TextField label="Notes" multiline minRows={3} placeholder="Write details…" sx={{ gridColumn: { md: '1 / -1' } }} />
          <FormControlLabel control={<Switch checked={notify} onChange={(e) => setNotify(e.target.checked)} />} label="Send irrigation alerts" />
        </Box>
      </Section>

      <Section title="KPI cards" description="KpiCard: label on top, value left-aligned with tabular numerals, trend in words.">
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
          <KpiCard title="Active farms" value="128" trend="+4.2% vs last month" icon={<AgricultureOutlinedIcon />} />
          <KpiCard title="Water used" value="3,410" unit="m³" subtitle="This week" icon={<WaterDropOutlinedIcon />} />
          <KpiCard title="Sensors online" value="—" error="Service offline" icon={<SensorsOutlinedIcon />} />
          <KpiCard title="Loading" value="0" loading />
        </Box>
      </Section>

      <Section title="Data table" description="ResponsiveDataTable: a table on desktop, stacked cards under 600px. Wrap custom tables in .ds-table-wrap.">
        <ResponsiveDataTable<FieldRow>
          rows={sampleRows}
          columns={[
            { id: 'field', header: 'Field', render: (r) => r.field, mobilePrimary: true },
            { id: 'crop', header: 'Crop', render: (r) => r.crop },
            { id: 'area', header: 'Area', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.area}</span> },
            {
              id: 'status',
              header: 'Status',
              render: (r) => <Chip component="span" size="small" variant="outlined" color={statusColor(r.status)} label={r.status} />,
            },
          ]}
        />
      </Section>

      <Section title="State panels" description="StatePanel: one pattern for empty, error, offline and coming-soon states.">
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <StatePanel tone="empty" title="No fields yet" description="Draw a boundary or import a layer to get started." actionLabel="Add field" onAction={() => undefined} />
          <StatePanel tone="error" title="Could not load data" description="Check your connection and try again." actionLabel="Retry" onAction={() => undefined} />
          <StatePanel tone="offline" title="Sensor service offline" description="Readings will resume when the gateway reconnects." />
          <StatePanel tone="soon" title="Coming soon" description="This module is being built." />
        </Box>
      </Section>

      <Section title="Page header" description="PageHeader: optional breadcrumbs, icon tile, title, description and actions. Use one per page inside PageContainer.">
        <Box sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <PageHeader
            title="Irrigation"
            description="Schedules, valves and water use across all farms."
            icon={<WaterDropOutlinedIcon />}
            breadcrumbs={[{ label: 'Operations', to: '/style-guide' }, { label: 'Irrigation' }]}
            actions={
              <>
                <Button variant="outlined">Export</Button>
                <Button variant="contained" startIcon={<AddRoundedIcon />}>
                  New schedule
                </Button>
              </>
            }
          />
        </Box>
      </Section>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} aria-labelledby="sg-dialog-title">
        <DialogTitle id="sg-dialog-title">Example dialog</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The baseline dialog pattern: closes on Escape and backdrop click, traps focus and returns it to the trigger.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setModalOpen(false)}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  )
}
