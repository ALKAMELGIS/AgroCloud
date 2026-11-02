import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined'
import { PageContainer, PageHeader, StatePanel } from '@/components'
import { useLanguage } from '@/core/localization/i18n'

const copy = {
  en: {
    title: 'Multidimensional Analysis',
    description: 'Temporal and volumetric analysis of satellite imagery.',
    soonTitle: 'Multidimensional tools are coming soon',
    soonBody:
      'Explore imagery stacks across time and depth: index time series per field, change detection between dates and per-pixel trend charts.',
  },
  ar: {
    title: 'التحليل متعدد الأبعاد',
    description: 'تحليل زمني وحجمي لصور الأقمار الصناعية.',
    soonTitle: 'أدوات التحليل متعدد الأبعاد قادمة قريباً',
    soonBody:
      'استكشف حزم الصور عبر الزمن والعمق: سلاسل زمنية للمؤشرات لكل حقل، وكشف التغيّر بين التواريخ، ومخططات الاتجاه لكل بكسل.',
  },
} as const

export default function Multidimensional() {
  const { language } = useLanguage()
  const t = copy[language === 'ar' ? 'ar' : 'en']
  return (
    <PageContainer>
      <PageHeader title={t.title} description={t.description} icon={<ViewInArOutlinedIcon />} />
      {/* Integration point for backend /timeseries endpoint */}
      <StatePanel tone="soon" title={t.soonTitle} description={t.soonBody} />
    </PageContainer>
  )
}
