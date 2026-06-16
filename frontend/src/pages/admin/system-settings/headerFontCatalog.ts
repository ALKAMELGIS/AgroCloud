import type { ThemeMode } from '../../../types/systemSettings'

export type FontCategoryId = 'system' | 'modern' | 'elegant' | 'mono' | 'arabic' | 'design'

export type FontPreset = {
  id: string
  label: string
  /** Full CSS `font-family` value stored in settings */
  cssFamily: string
  category: FontCategoryId
  /** Stack used only for in-app preview when family name differs */
  previewFamily?: string
  googleSpec?: string
}

export const FONT_CATEGORY_LABEL: Record<FontCategoryId, string> = {
  design: 'Design system',
  system: 'System fonts',
  modern: 'Modern UI fonts',
  elegant: 'Elegant / premium',
  mono: 'Monospace (GIS / code)',
  arabic: 'Arabic support',
}

/** Single stylesheet — injected once when font picker mounts */
export const HEADER_FONT_GOOGLE_STYLESHEET_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=IBM+Plex+Sans+Arabic:wght@400;500;600;700',
    'family=Inter:wght@400;500;600;700;800',
    'family=Cairo:wght@400;500;600;700',
    'family=Cormorant+Garamond:wght@400;600;700',
    'family=Fira+Code:wght@400;600',
    'family=JetBrains+Mono:wght@400;600',
    'family=Lora:wght@400;600;700',
    'family=Merriweather:wght@400;700',
    'family=Montserrat:wght@400;600;700;800',
    'family=Noto+Kufi+Arabic:wght@400;600;700',
    'family=Noto+Naskh+Arabic:wght@400;600;700',
    'family=Nunito:wght@400;600;700;800',
    'family=Open+Sans:wght@400;600;700;800',
    'family=Playfair+Display:wght@400;600;700',
    'family=Poppins:wght@400;600;700;800',
    'family=Roboto:wght@400;500;700',
    'family=Source+Code+Pro:wght@400;600',
    'family=Tajawal:wght@400;500;700',
  ].join('&') +
  '&display=swap'

export const HEADER_FONT_PRESETS: FontPreset[] = [
  {
    id: 'design-system',
    label: 'Design system default',
    cssFamily: 'var(--ds-font-sans)',
    category: 'design',
  },
  {
    id: 'arial',
    label: 'Arial',
    cssFamily: '"Arial", "Helvetica Neue", Helvetica, sans-serif',
    category: 'system',
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    cssFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    category: 'system',
  },
  {
    id: 'segoe-ui',
    label: 'Segoe UI',
    cssFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    category: 'system',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    cssFamily: '"Roboto", "Segoe UI", system-ui, sans-serif',
    category: 'system',
    googleSpec: 'Roboto',
  },
  {
    id: 'sf-pro',
    label: 'San Francisco (SF Pro)',
    cssFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
    category: 'system',
    previewFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    cssFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    category: 'modern',
    googleSpec: 'Inter',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    cssFamily: '"Poppins", system-ui, sans-serif',
    category: 'modern',
    googleSpec: 'Poppins',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    cssFamily: '"Montserrat", system-ui, sans-serif',
    category: 'modern',
    googleSpec: 'Montserrat',
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    cssFamily: '"Open Sans", system-ui, sans-serif',
    category: 'modern',
    googleSpec: 'Open Sans',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    cssFamily: '"Nunito", system-ui, sans-serif',
    category: 'modern',
    googleSpec: 'Nunito',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    cssFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
    category: 'elegant',
    googleSpec: 'Playfair Display',
  },
  {
    id: 'lora',
    label: 'Lora',
    cssFamily: '"Lora", Georgia, "Times New Roman", serif',
    category: 'elegant',
    googleSpec: 'Lora',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    cssFamily: '"Merriweather", Georgia, serif',
    category: 'elegant',
    googleSpec: 'Merriweather',
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    cssFamily: '"Cormorant Garamond", "Times New Roman", serif',
    category: 'elegant',
    googleSpec: 'Cormorant Garamond',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    cssFamily: '"Fira Code", Consolas, "Courier New", monospace',
    category: 'mono',
    googleSpec: 'Fira Code',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    cssFamily: '"JetBrains Mono", Consolas, monospace',
    category: 'mono',
    googleSpec: 'JetBrains Mono',
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    cssFamily: '"Source Code Pro", Consolas, monospace',
    category: 'mono',
    googleSpec: 'Source Code Pro',
  },
  {
    id: 'consolas',
    label: 'Consolas',
    cssFamily: 'Consolas, "Courier New", ui-monospace, monospace',
    category: 'mono',
  },
  {
    id: 'cairo',
    label: 'Cairo',
    cssFamily: '"Cairo", "IBM Plex Sans Arabic", "Segoe UI", sans-serif',
    category: 'arabic',
    googleSpec: 'Cairo',
  },
  {
    id: 'ibm-plex-arabic',
    label: 'IBM Plex Sans Arabic',
    cssFamily: '"IBM Plex Sans Arabic", Cairo, "Segoe UI", sans-serif',
    category: 'arabic',
    googleSpec: 'IBM Plex Sans Arabic',
  },
  {
    id: 'tajawal',
    label: 'Tajawal',
    cssFamily: '"Tajawal", "IBM Plex Sans Arabic", sans-serif',
    category: 'arabic',
    googleSpec: 'Tajawal',
  },
  {
    id: 'noto-kufi',
    label: 'Noto Kufi Arabic',
    cssFamily: '"Noto Kufi Arabic", "IBM Plex Sans Arabic", sans-serif',
    category: 'arabic',
    googleSpec: 'Noto Kufi Arabic',
  },
  {
    id: 'noto-naskh',
    label: 'Noto Naskh Arabic',
    cssFamily: '"Noto Naskh Arabic", Georgia, serif',
    category: 'arabic',
    googleSpec: 'Noto Naskh Arabic',
  },
]

export function normalizeFontFamily(css: string): string {
  return css.trim().replace(/\s+/g, ' ')
}

export function findPresetByCss(cssFamily: string): FontPreset | undefined {
  const n = normalizeFontFamily(cssFamily)
  return HEADER_FONT_PRESETS.find(p => normalizeFontFamily(p.cssFamily) === n)
}

export function previewFontFamily(preset: FontPreset): string {
  return preset.previewFamily ?? preset.cssFamily
}

export type SmartFontAdvice = {
  presetId: string
  hintEn: string
  hintAr: string
}

export function getSmartFontAdvice(themeMode: ThemeMode, prefersDark: boolean, uiLang: 'ar' | 'en'): SmartFontAdvice {
  const dark = themeMode === 'dark' || (themeMode === 'system' && prefersDark)

  if (uiLang === 'ar') {
    return {
      presetId: 'ibm-plex-arabic',
      hintEn: 'Arabic UI: IBM Plex Sans Arabic pairs cleanly with mixed EN/AR chrome.',
      hintAr: 'لوحة عربية: خط IBM Plex Sans Arabic مناسب للعناوين مع الإنجليزية.',
    }
  }

  if (dark) {
    return {
      presetId: 'inter',
      hintEn: 'Dark theme: Inter keeps the header crisp at small sizes.',
      hintAr: 'الوضع الداكن: Inter يحافظ على وضوح الهيدر للأحجام الصغيرة.',
    }
  }

  return {
    presetId: 'open-sans',
    hintEn: 'Light theme: Open Sans reads softly on bright shells.',
    hintAr: 'الوضع الفاتح: Open Sans مريح على الخلفيات الفاتحة.',
  }
}

export function themeDefaultPresetId(themeMode: ThemeMode, prefersDark: boolean): string {
  const dark = themeMode === 'dark' || (themeMode === 'system' && prefersDark)
  return dark ? 'inter' : 'open-sans'
}
