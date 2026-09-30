/** Shared titles/icons for Data Entry + Recipes shells (per workflow slug). */

export function getWorkflowShellMeta(
  formSlug: string,
  lang: 'en' | 'ar',
): { iconClass: string; title: string; tagline: string } {
  const ar = lang === 'ar'
  const shells: Record<
    string,
    { iconClass: string; en: { title: string; tagline: string }; ar: { title: string; tagline: string } }
  > = {
    irrigation: {
      iconClass: 'fa-solid fa-water',
      en: { title: 'Irrigation Scheduling', tagline: 'Configurable, layer-driven irrigation data entry' },
      ar: { title: 'جدولة الري', tagline: 'إدخال بيانات الري المرتبطة بالطبقات حسب الإعدادات' },
    },
    'ec-ph': {
      iconClass: 'fa-solid fa-droplet',
      en: { title: 'EC / pH', tagline: 'Daily EC / pH and water tracking' },
      ar: { title: 'EC / الأس الهيدروجيني', tagline: 'متابعة يومية للتوصيل الكهربائي والأس الهيدروجيني والماء' },
    },
    harvest: {
      iconClass: 'fa-solid fa-seedling',
      en: { title: 'Harvest Logging', tagline: 'Configurable, layer-driven harvest data entry' },
      ar: { title: 'تسجيل الحصاد', tagline: 'إدخال بيانات الحصاد المرتبطة بالطبقات' },
    },
    production: {
      iconClass: 'fa-solid fa-boxes-stacked',
      en: { title: 'Product & Selas Tracking', tagline: 'Configurable, layer-driven production data entry' },
      ar: { title: 'تتبع الإنتاج والمبيعات', tagline: 'إدخال بيانات الإنتاج المرتبطة بالطبقات' },
    },
    qhis: {
      iconClass: 'fa-solid fa-shield-halved',
      en: { title: 'QHIS', tagline: 'Configurable, layer-driven QHIS data entry' },
      ar: { title: 'QHIS', tagline: 'إدخال بيانات الجودة والصحة والسلامة المرتبطة بالطبقات' },
    },
    fertigation: {
      iconClass: 'fa-solid fa-droplet',
      en: { title: 'Fertigation Management', tagline: 'Irrigation and nutrient scheduling' },
      ar: { title: 'إدارة التسميد بالري', tagline: 'جدولة الري والمغذيات' },
    },
  }
  const s = shells[formSlug]
  if (!s) {
    return {
      iconClass: 'fa-solid fa-table-list',
      title: ar ? 'الوصفات' : 'Recipes',
      tagline: ar ? 'خطوة مراجعة البيانات' : 'Recipe review step',
    }
  }
  return { iconClass: s.iconClass, title: ar ? s.ar.title : s.en.title, tagline: ar ? s.ar.tagline : s.en.tagline }
}

export function stepLabels(lang: 'en' | 'ar'): { dataEntry: string; recipes: string } {
  if (lang === 'ar') return { dataEntry: 'إدخال البيانات', recipes: 'الوصفات' }
  return { dataEntry: 'Data Entry', recipes: 'Recipes' }
}
