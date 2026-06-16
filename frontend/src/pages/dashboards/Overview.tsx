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
import { useSystemSettings } from '../../store/SystemSettingsContext'
import { useLanguage } from '../../lib/i18n'

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
    trendUp: 'vs last month',
    trendDown: 'vs last month',
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  },
  ar: {
    title: 'لوحة التحكم',
    subtitle: 'نبض العمليات — المحاصيل والمياه والامتثال في لمحة.',
    chartTitle: 'اتجاه الإنتاج',
    chartSubtitle: 'غلة لمتجهة مقارنة بالموسم السابق',
    kpi1: 'مزارع نشطة',
    kpi2: 'توفير المياه',
    kpi3: 'درجة الامتثال',
    kpi4: 'مهام مفتوحة',
    trendUp: 'مقارنة بالشهر الماضي',
    trendDown: 'مقارنة بالشهر الماضي',
    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
  },
} as const

export default function Overview() {
  const { settings } = useSystemSettings()
  const { language } = useLanguage()
  const t = overviewText[language]

  const palette = useMemo(() => {
    if (typeof window === 'undefined') {
      return { primary: '#047857', muted: '#64748b', grid: 'rgba(100,116,139,0.12)', surface: 'rgba(255,255,255,0.65)' }
    }
    const cs = getComputedStyle(document.documentElement)
    const primary = (cs.getPropertyValue('--ds-color-primary').trim() || '#047857').trim()
    const muted = (cs.getPropertyValue('--ds-color-text-muted').trim() || '#64748b').trim()
    const border = (cs.getPropertyValue('--ds-color-border').trim() || 'rgba(148,163,184,0.2)').trim()
    return { primary, muted, grid: border, surface: 'rgba(148,163,184,0.08)' }
  }, [settings.themeMode, settings.customPrimaryHex])

  const chartData = useMemo(
    () => ({
      labels: [...t.labels],
      datasets: [
        {
          label: language === 'ar' ? 'الموسم الحالي' : 'This season',
          data: [62, 68, 72, 70, 78, 84],
          borderColor: palette.primary,
          backgroundColor: `${palette.primary}22`,
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
          fill: false,
          tension: 0.35,
          pointRadius: 2,
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
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: palette.muted,
            font: { size: 12, family: 'Inter, system-ui, sans-serif' },
            usePointStyle: true,
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.92)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 10,
        },
      },
      scales: {
        x: {
          grid: { color: palette.grid },
          ticks: { color: palette.muted, maxRotation: 0 },
        },
        y: {
          min: 40,
          max: 100,
          grid: { color: palette.grid },
          ticks: { color: palette.muted },
        },
      },
    }),
    [palette],
  )

  return (
    <div className="page">
      <header style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.35rem, 2.5vw, 1.75rem)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ds-color-text)' }}>
          {t.title}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ds-color-text-muted)', maxWidth: 560, lineHeight: 1.5 }}>{t.subtitle}</p>
      </header>

      <section className="ds-kpi-grid" aria-label="Key metrics">
        <article className="ds-kpi-card">
          <div className="ds-kpi-label">{t.kpi1}</div>
          <div className="ds-kpi-value">128</div>
          <div className="ds-kpi-meta">
            <span className="ds-kpi-trend-up">
              <i className="fa-solid fa-arrow-trend-up" aria-hidden /> +4.2%
            </span>
            <span>{t.trendUp}</span>
          </div>
        </article>
        <article className="ds-kpi-card">
          <div className="ds-kpi-label">{t.kpi2}</div>
          <div className="ds-kpi-value">18%</div>
          <div className="ds-kpi-meta">
            <span className="ds-kpi-trend-up">
              <i className="fa-solid fa-droplet" aria-hidden /> +2.1%
            </span>
            <span>{t.trendUp}</span>
          </div>
        </article>
        <article className="ds-kpi-card">
          <div className="ds-kpi-label">{t.kpi3}</div>
          <div className="ds-kpi-value">96</div>
          <div className="ds-kpi-meta">
            <span className="ds-kpi-trend-up">
              <i className="fa-solid fa-shield-halved" aria-hidden /> +0.8
            </span>
            <span>{t.trendUp}</span>
          </div>
        </article>
        <article className="ds-kpi-card">
          <div className="ds-kpi-label">{t.kpi4}</div>
          <div className="ds-kpi-value">14</div>
          <div className="ds-kpi-meta">
            <span className="ds-kpi-trend-down">
              <i className="fa-solid fa-arrow-trend-down" aria-hidden /> −3
            </span>
            <span>{t.trendDown}</span>
          </div>
        </article>
      </section>

      <section className="ds-chart-shell ds-surface">
        <h2>{t.chartTitle}</h2>
        <p style={{ margin: '-8px 0 12px', fontSize: 13, color: 'var(--ds-color-text-muted)' }}>{t.chartSubtitle}</p>
        <div className="ds-chart-inner">
          <Line data={chartData} options={chartOptions} />
        </div>
      </section>
    </div>
  )
}
