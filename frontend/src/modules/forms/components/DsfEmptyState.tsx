import { useLanguage } from '@/core/localization/i18n'
import { dsfTranslations } from './dsfTranslations'

/**
 * Fill-mode empty state for DataSourceFieldsPanel when the form has no configured
 * layers/fields. Mirrors the shared StatePanel look (tinted icon tile + title + guidance)
 * with plain CSS so it renders inside legacy `.ec-card` shells in both themes.
 */
export function DsfEmptyState({ formKey }: { formKey: string }) {
  const { language } = useLanguage()
  const text = dsfTranslations[language]
  return (
    <div className="dsf-empty-state" role="status">
      <span className="dsf-empty-state__icon" aria-hidden>
        <i className="fa-solid fa-layer-group" />
      </span>
      <p className="dsf-empty-state__title">{text.emptyTitle}</p>
      <p className="dsf-empty-state__body">
        {text.emptyBodyBefore}
        <strong>{formKey}</strong>
        {text.emptyBodyAfter}
      </p>
    </div>
  )
}
