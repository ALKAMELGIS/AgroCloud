import { NAV_DEFAULT_GROUPS, NAV_GROUP_IDS } from '../../../nav/navManifest'
import { isExternalPageLink } from '../../../lib/defaultPageLinks'
import { normalizeAppPath } from '../../../services/settingsStorage'
import type { CustomPageRecord } from '../../../types/systemSettings'

type LinkManagementSectionProps = {
  language: 'en' | 'ar'
  pages: CustomPageRecord[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<CustomPageRecord>) => void
  onRemove: (id: string) => void
}

export function LinkManagementSection({
  language,
  pages,
  onAdd,
  onUpdate,
  onRemove,
}: LinkManagementSectionProps) {
  const pageLinks = pages.filter(isExternalPageLink)
  const isAr = language === 'ar'

  return (
    <section className="sys-link-mgmt" aria-labelledby="sys-link-mgmt-heading">
      <div className="sys-link-mgmt__head">
        <div>
          <span className="sys-nav-data__badge">Link Management</span>
          <h3 id="sys-link-mgmt-heading" className="sys-nav-data__h">
            {isAr ? 'إدارة روابط الصفحات' : 'Page link management'}
          </h3>
          <p className="sys-nav-data__p">
            {isAr
              ? 'اربط مسارًا داخل التطبيق برابط خارجي. يظهر الرابط في القائمة الجانبية ويفتح داخل الإطار.'
              : 'Bind an in-app route to an external URL. Links appear in the sidebar and open inside the app shell.'}
          </p>
        </div>
        <button type="button" className="gis-btn gis-btn-primary sys-link-mgmt__add" onClick={onAdd}>
          <i className="fa-solid fa-plus" aria-hidden />
          {isAr ? 'إضافة رابط صفحة' : 'Add Page Link'}
        </button>
      </div>

      {pageLinks.length === 0 ? (
        <div className="sys-empty-state sys-link-mgmt__empty">
          <i className="fa-solid fa-link" aria-hidden />
          {isAr ? (
            <>
              لا توجد روابط بعد. استخدم <strong>إضافة رابط صفحة</strong> لربط صفحة جديدة.
            </>
          ) : (
            <>
              No page links yet. Use <strong>Add Page Link</strong> to register a route and external URL.
            </>
          )}
        </div>
      ) : (
        <div className="sys-link-mgmt__list">
          {pageLinks.map(link => (
            <article key={link.id} className="sys-link-mgmt__card">
              <div className="sys-link-mgmt__card-head">
                <span className="sys-link-mgmt__icon" aria-hidden>
                  <i className={link.iconClass || 'fa-solid fa-link'} />
                </span>
                <div className="sys-link-mgmt__card-titles">
                  <strong>{link.name}</strong>
                  <code dir="ltr">{link.path}</code>
                </div>
                <button
                  type="button"
                  className="gis-btn gis-btn-outline sys-link-mgmt__remove"
                  onClick={() => onRemove(link.id)}
                >
                  <i className="fa-solid fa-trash" aria-hidden />
                  {isAr ? 'حذف' : 'Remove'}
                </button>
              </div>

              <div className="sys-link-mgmt__grid">
                <div className="sys-page-field">
                  <label htmlFor={`link-name-${link.id}`}>{isAr ? 'الاسم (EN)' : 'Display name (EN)'}</label>
                  <input
                    id={`link-name-${link.id}`}
                    className="gis-input"
                    value={link.name}
                    onChange={e => onUpdate(link.id, { name: e.target.value })}
                  />
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`link-name-ar-${link.id}`}>{isAr ? 'الاسم (AR)' : 'Display name (AR)'}</label>
                  <input
                    id={`link-name-ar-${link.id}`}
                    className="gis-input"
                    dir="rtl"
                    placeholder={link.name}
                    value={link.nameAr ?? ''}
                    onChange={e => onUpdate(link.id, { nameAr: e.target.value })}
                  />
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`link-path-${link.id}`}>{isAr ? 'مسار الصفحة' : 'In-app route path'}</label>
                  <input
                    id={`link-path-${link.id}`}
                    className="gis-input"
                    dir="ltr"
                    value={link.path}
                    onChange={e => onUpdate(link.id, { path: e.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="sys-page-field sys-page-field--wide">
                  <label htmlFor={`link-url-${link.id}`}>{isAr ? 'الرابط الخارجي' : 'External URL'}</label>
                  <input
                    id={`link-url-${link.id}`}
                    className="gis-input"
                    dir="ltr"
                    type="url"
                    placeholder="https://"
                    value={link.externalUrl ?? ''}
                    onChange={e => onUpdate(link.id, { externalUrl: e.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`link-navgrp-${link.id}`}>{isAr ? 'مجموعة القائمة' : 'Sidebar group'}</label>
                  <select
                    id={`link-navgrp-${link.id}`}
                    className="gis-input"
                    value={link.navGroupId || 'application'}
                    onChange={e => onUpdate(link.id, { navGroupId: e.target.value })}
                  >
                    {NAV_GROUP_IDS.map(gid => (
                      <option key={gid} value={gid}>
                        {gid === 'data'
                          ? 'Operations / Data (nav-group-data)'
                          : gid.charAt(0).toUpperCase() + gid.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`link-icon-${link.id}`}>{isAr ? 'أيقونة' : 'Icon class'}</label>
                  <input
                    id={`link-icon-${link.id}`}
                    className="gis-input"
                    dir="ltr"
                    value={link.iconClass}
                    onChange={e => onUpdate(link.id, { iconClass: e.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`link-subcls-${link.id}`}>Sublist CSS</label>
                  <input
                    id={`link-subcls-${link.id}`}
                    className="gis-input"
                    dir="ltr"
                    placeholder="nav-item-agrocloud-management"
                    value={link.subitemClass ?? ''}
                    onChange={e => onUpdate(link.id, { subitemClass: e.target.value })}
                    spellCheck={false}
                    list={`link-subcls-datalist-${link.id}`}
                  />
                  <datalist id={`link-subcls-datalist-${link.id}`}>
                    {(NAV_DEFAULT_GROUPS.find(g => g.id === (link.navGroupId || 'application'))?.children ?? []).map(
                      leaf => (
                        <option key={leaf.id} value={leaf.subitemClass} />
                      ),
                    )}
                  </datalist>
                </div>
                <div className="sys-page-field sys-page-field--checkbox">
                  <label className="sys-checkbox-row">
                    <input
                      type="checkbox"
                      checked={link.visible}
                      onChange={e => onUpdate(link.id, { visible: e.target.checked })}
                    />
                    {isAr ? 'ظاهر في القائمة' : 'Visible in navigation'}
                  </label>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function createPageLinkRecord(path?: string): CustomPageRecord {
  const id = `link-${Date.now()}`
  const routePath = normalizeAppPath(path ?? `/pages/${id.slice(-8)}`)
  return {
    id,
    name: 'New page link',
    path: routePath,
    iconClass: 'fa-solid fa-link',
    visible: true,
    bindTarget: 'external',
    externalUrl: 'https://',
    navGroupId: 'application',
    subitemClass: '',
  }
}
