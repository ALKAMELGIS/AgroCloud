import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Box, Paper } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined'
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import { useLanguage } from '@/core/localization/i18n'
import { KpiCard, PageContainer, PageHeader, SectionHeader } from '@/components'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const overviewText = {
  en: {
    title: 'Dashboard',
    subtitle: 'Operational pulse — crops, water, and compliance at a glance.',
    chartTitle: 'Production trend',
    chartSubtitle: 'Indexed yield vs last season',
    kpi1: 'Active farms',
    kpi2: 'Water savings',
    kpi3: 'Compliance score',
    kpi4: 'Open tasks',
    vsLastMonth: 'vs last month',
    kpiAria: 'Key metrics',
    chartAria: 'Line chart: indexed yield this season compared with last season, January to June',
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  },
  ar: {
    title: 'لوحة التحكم',
    subtitle: 'نبض العمليات — المحاصيل والمياه والامتثال في لمحة.',
    chartTitle: 'اتجاه الإنتاج',
    chartSubtitle: 'غلة مؤشرة مقارنة بالموسم السابق',
    kpi1: 'مزارع نشطة',
    kpi2: 'توفير المياه',
    kpi3: 'درجة الامتثال',
    kpi4: 'مهام مفتوحة',
    vsLastMonth: 'مقارنة بالشهر الماضي',
    kpiAria: 'المؤشرات الرئيسية',
    chartAria: 'مخطط خطي: الغلة المؤشرة لهذا الموسم مقارنة بالموسم السابق من يناير إلى يونيو',
    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
  },
} as const

export default function Overview() {
  const { language } = useLanguage()
  const t = overviewText[language === 'ar' ? 'ar' : 'en']
  const theme = useTheme()

  // Theme palette follows <html data-theme> and the custom accent, so the chart re-colors with the app.
  const palette = useMemo(
    () => ({
      primary: theme.palette.primary.main,
      muted: theme.palette.text.secondary,
      grid: theme.palette.divider,
      surface: theme.palette.background.paper,
      text: theme.palette.text.primary,
      font: String(theme.typography.fontFamily ?? 'Inter, system-ui, sans-serif'),
    }),
    [theme],
  )

  const chartData = useMemo(
    () => ({
      labels: [...t.labels],
      datasets: [
        {
          label: language === 'ar' ? 'الموسم الحالي' : 'This season',
          data: [62, 68, 72, 70, 78, 84],
          borderColor: palette.primary,
          backgroundColor: alpha(palette.primary, 0.12),
          pointBackgroundColor: palette.primary,
          fill: true,
          tension: 0.38,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: language === 'ar' ? 'الموسم السابق' : 'Last season',
          data: [58, 61, 64, 65, 69, 71],
          borderColor: palette.muted,
          backgroundColor: 'transparent',
          pointBackgroundColor: palette.muted,
          pointStyle: 'rectRot' as const,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          borderWidth: 1.5,
          borderDash: [6, 4],
        },
      ],
    }),
    [t.labels, language, palette],
  )

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      layout: { padding: { left: 12, right: 12 } },
      plugins: {
        legend: {
          position: 'bottom' as const,
          rtl: language === 'ar',
          labels: {
            color: palette.muted,
            font: { size: 12, family: palette.font },
            usePointStyle: true,
            padding: 16,
          },
        },
        tooltip: {
          rtl: language === 'ar',
          backgroundColor: palette.surface,
          titleColor: palette.text,
          bodyColor: palette.muted,
          borderColor: palette.grid,
          borderWidth: 1,
          titleFont: { size: 12, family: palette.font },
          bodyFont: { size: 12, family: palette.font },
          padding: 12,
          cornerRadius: 10,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          reverse: language === 'ar',
          grid: { display: false },
          border: { color: palette.grid },
          ticks: { color: palette.muted, maxRotation: 0 },
        },
        y: {
          min: 40,
          max: 100,
          position: (language === 'ar' ? 'right' : 'left') as 'right' | 'left',
          grid: { color: palette.grid },
          border: { display: false },
          ticks: { color: palette.muted },
        },
      },
    }),
    [palette, language],
  )

  const kpis = [
    { title: t.kpi1, value: '128', trend: `+4.2% ${t.vsLastMonth}`, icon: <AgricultureOutlinedIcon /> },
    { title: t.kpi2, value: '18', unit: '%', trend: `+2.1% ${t.vsLastMonth}`, icon: <WaterDropOutlinedIcon /> },
    { title: t.kpi3, value: '96', unit: '/ 100', trend: `+0.8 ${t.vsLastMonth}`, icon: <VerifiedUserOutlinedIcon /> },
    // Fewer open tasks is an improvement, so the trend keeps the positive tone.
    { title: t.kpi4, value: '14', trend: `\u22123 ${t.vsLastMonth}`, icon: <AssignmentOutlinedIcon /> },
  ]

  return (
    <PageContainer width="wide">
      <PageHeader title={t.title} description={t.subtitle} icon={<SpaceDashboardOutlinedIcon />} />

      <Box
        component="section"
        aria-label={t.kpiAria}
        sx={{
          display: 'grid',
          gap: { xs: 2, sm: 3 },
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        {kpis.map((k) => (
          <KpiCard key={k.title} title={k.title} value={k.value} unit={k.unit} trend={k.trend} icon={k.icon} />
        ))}
      </Box>

      <Paper variant="outlined" component="section" aria-label={t.chartTitle} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3.5 }}>
        <SectionHeader title={t.chartTitle} description={t.chartSubtitle} />
        <Box sx={{ position: 'relative', height: { xs: 260, sm: 320 } }}>
          <Line data={chartData} options={chartOptions} aria-label={t.chartAria} role="img" />
        </Box>
      </Paper>
    </PageContainer>
  )
}
