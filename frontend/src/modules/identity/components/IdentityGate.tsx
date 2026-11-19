import { Card, CardContent, Skeleton, Stack } from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatePanel } from '@/components'
import { useLanguage } from '@/core/localization/i18n'

const copy = {
  en: {
    offlineTitle: 'Identity service is offline',
    offlineBody:
      'This page reads roles, users and permissions from the server identity service. It did not respond. Check that the API server is running with AGROCLOUD_IDENTITY=on, then retry.',
    retry: 'Retry',
    home: 'Back to home',
    forbiddenTitle: 'You do not have access to this page',
    forbiddenBody: 'Ask an administrator to grant the required permission to your role.',
  },
  ar: {
    offlineTitle: 'خدمة الهوية غير متاحة',
    offlineBody:
      'تقرأ هذه الصفحة الأدوار والمستخدمين والصلاحيات من خدمة الهوية على الخادم ولم تستجب. تأكد من تشغيل خادم API مع إعداد AGROCLOUD_IDENTITY=on ثم أعد المحاولة.',
    retry: 'إعادة المحاولة',
    home: 'العودة للرئيسية',
    forbiddenTitle: 'ليست لديك صلاحية لعرض هذه الصفحة',
    forbiddenBody: 'اطلب من مسؤول النظام منح دورك الصلاحية المطلوبة.',
  },
} as const

export function useIdentityCopy() {
  const { language } = useLanguage()
  return copy[language === 'ar' ? 'ar' : 'en']
}

/** Placeholder card list shown while the identity status probe / first load is in flight. */
export function IdentityLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack spacing={2} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} variant="outlined">
          <CardContent>
            <Skeleton width="35%" height={28} />
            <Skeleton width="55%" />
            <Skeleton width="80%" />
          </CardContent>
        </Card>
      ))}
    </Stack>
  )
}

type IdentityGateProps = {
  /** Identity status probe settled. */
  checked: boolean
  available: boolean
  allowed: boolean
  onRetry: () => void
  offlineTitle?: string
  offlineDescription?: ReactNode
  children: ReactNode
}

/**
 * Shared gate for identity-backed admin pages: loading skeleton → offline StatePanel (with Retry)
 * → forbidden StatePanel → page content. Render inside the page's PageContainer under its PageHeader.
 */
export function IdentityGate({
  checked,
  available,
  allowed,
  onRetry,
  offlineTitle,
  offlineDescription,
  children,
}: IdentityGateProps) {
  const t = useIdentityCopy()
  const navigate = useNavigate()
  if (!checked) return <IdentityLoadingSkeleton />
  if (!available) {
    return (
      <StatePanel
        tone="offline"
        title={offlineTitle ?? t.offlineTitle}
        description={offlineDescription ?? t.offlineBody}
        actionLabel={t.retry}
        onAction={onRetry}
        secondaryLabel={t.home}
        onSecondary={() => navigate('/', { state: { openGroup: 'admin' } })}
      />
    )
  }
  if (!allowed) {
    return (
      <StatePanel
        tone="error"
        icon={<LockOutlinedIcon />}
        title={t.forbiddenTitle}
        description={t.forbiddenBody}
        secondaryLabel={t.home}
        onSecondary={() => navigate('/')}
      />
    )
  }
  return <>{children}</>
}
