import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import { PageContainer, PageHeader, StatePanel } from '@/components'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/core/localization/i18n'

const copy = {
  en: {
    title: 'AI Chatbot',
    description: 'Conversational assistant for field operations and farm records.',
    soonTitle: 'Chatbot workspace is coming soon',
    soonBody:
      'A guided assistant that answers questions about your farms, tasks and sensors, with saved conversations and shareable answers. Until then, use AI Agro-Chat for questions about your GIS layers.',
    action: 'Open AI Agro-Chat',
  },
  ar: {
    title: 'روبوت المحادثة الذكي',
    description: 'مساعد محادثة لعمليات الحقول وسجلات المزارع.',
    soonTitle: 'مساحة روبوت المحادثة قادمة قريباً',
    soonBody:
      'مساعد موجّه يجيب عن أسئلتك حول المزارع والمهام والمستشعرات، مع حفظ المحادثات ومشاركة الإجابات. حتى ذلك الحين، استخدم محادثة Agro الذكية لأسئلة طبقات GIS.',
    action: 'فتح محادثة Agro الذكية',
  },
} as const

export default function AiChatbot() {
  const { language } = useLanguage()
  const t = copy[language === 'ar' ? 'ar' : 'en']
  const navigate = useNavigate()
  return (
    <PageContainer>
      <PageHeader title={t.title} description={t.description} icon={<SmartToyOutlinedIcon />} />
      <StatePanel
        tone="soon"
        title={t.soonTitle}
        description={t.soonBody}
        actionLabel={t.action}
        onAction={() => navigate('/dashboards/ai-agro-chat')}
      />
    </PageContainer>
  )
}
