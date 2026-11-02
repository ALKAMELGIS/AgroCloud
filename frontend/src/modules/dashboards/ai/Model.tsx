import ModelTrainingOutlinedIcon from '@mui/icons-material/ModelTrainingOutlined'
import { PageContainer, PageHeader, StatePanel } from '@/components'
import { useLanguage } from '@/core/localization/i18n'

const copy = {
  en: {
    title: 'Model',
    description: 'Configure AI models and review their results.',
    soonTitle: 'Model configuration is coming soon',
    soonBody:
      'Choose and tune the models behind yield, irrigation and crop-health predictions, compare runs and review accuracy against field observations.',
  },
  ar: {
    title: 'النموذج',
    description: 'إعداد نماذج الذكاء الاصطناعي ومراجعة نتائجها.',
    soonTitle: 'إعداد النماذج قادم قريباً',
    soonBody:
      'اختر النماذج المستخدمة في توقعات الإنتاج والري وصحة المحاصيل واضبطها، وقارن بين التشغيلات وراجع الدقة مقابل الملاحظات الميدانية.',
  },
} as const

export default function Model() {
  const { language } = useLanguage()
  const t = copy[language === 'ar' ? 'ar' : 'en']
  return (
    <PageContainer>
      <PageHeader title={t.title} description={t.description} icon={<ModelTrainingOutlinedIcon />} />
      <StatePanel tone="soon" title={t.soonTitle} description={t.soonBody} />
    </PageContainer>
  )
}
