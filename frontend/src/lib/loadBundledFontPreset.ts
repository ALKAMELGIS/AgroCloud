import { findPresetByCss } from '../pages/admin/system-settings/headerFontCatalog'

type FontLoader = () => Promise<unknown>

/** Presets whose @fontsource files are NOT in fonts-core.css — loaded on demand. */
const OPTIONAL_PRESET_LOADERS: Record<string, FontLoader> = {
  roboto: () =>
    Promise.all([
      import('@fontsource/roboto/400.css'),
      import('@fontsource/roboto/500.css'),
      import('@fontsource/roboto/700.css'),
    ]),
  'open-sans': () =>
    Promise.all([
      import('@fontsource/open-sans/400.css'),
      import('@fontsource/open-sans/600.css'),
      import('@fontsource/open-sans/700.css'),
      import('@fontsource/open-sans/800.css'),
    ]),
  poppins: () =>
    Promise.all([
      import('@fontsource/poppins/400.css'),
      import('@fontsource/poppins/600.css'),
      import('@fontsource/poppins/700.css'),
      import('@fontsource/poppins/800.css'),
    ]),
  montserrat: () =>
    Promise.all([
      import('@fontsource/montserrat/400.css'),
      import('@fontsource/montserrat/600.css'),
      import('@fontsource/montserrat/700.css'),
      import('@fontsource/montserrat/800.css'),
    ]),
  nunito: () =>
    Promise.all([
      import('@fontsource/nunito/400.css'),
      import('@fontsource/nunito/600.css'),
      import('@fontsource/nunito/700.css'),
      import('@fontsource/nunito/800.css'),
    ]),
  playfair: () =>
    Promise.all([
      import('@fontsource/playfair-display/400.css'),
      import('@fontsource/playfair-display/600.css'),
      import('@fontsource/playfair-display/700.css'),
    ]),
  lora: () =>
    Promise.all([
      import('@fontsource/lora/400.css'),
      import('@fontsource/lora/600.css'),
      import('@fontsource/lora/700.css'),
    ]),
  merriweather: () =>
    Promise.all([import('@fontsource/merriweather/400.css'), import('@fontsource/merriweather/700.css')]),
  cormorant: () =>
    Promise.all([
      import('@fontsource/cormorant-garamond/400.css'),
      import('@fontsource/cormorant-garamond/600.css'),
      import('@fontsource/cormorant-garamond/700.css'),
    ]),
  'fira-code': () =>
    Promise.all([import('@fontsource/fira-code/400.css'), import('@fontsource/fira-code/600.css')]),
  'jetbrains-mono': () =>
    Promise.all([
      import('@fontsource/jetbrains-mono/400.css'),
      import('@fontsource/jetbrains-mono/600.css'),
    ]),
  'source-code-pro': () =>
    Promise.all([
      import('@fontsource/source-code-pro/400.css'),
      import('@fontsource/source-code-pro/600.css'),
    ]),
  cairo: () =>
    Promise.all([
      import('@fontsource/cairo/400.css'),
      import('@fontsource/cairo/500.css'),
      import('@fontsource/cairo/600.css'),
      import('@fontsource/cairo/700.css'),
    ]),
  'noto-kufi': () =>
    Promise.all([
      import('@fontsource/noto-kufi-arabic/400.css'),
      import('@fontsource/noto-kufi-arabic/600.css'),
      import('@fontsource/noto-kufi-arabic/700.css'),
    ]),
  'noto-naskh': () =>
    Promise.all([
      import('@fontsource/noto-naskh-arabic/400.css'),
      import('@fontsource/noto-naskh-arabic/600.css'),
      import('@fontsource/noto-naskh-arabic/700.css'),
    ]),
}

const loadedPresetIds = new Set<string>()

/** Load @fontsource files for a header font preset (no-op for system / core-bundled fonts). */
export async function ensureBundledFontPreset(presetId: string): Promise<void> {
  if (loadedPresetIds.has(presetId)) return
  const loader = OPTIONAL_PRESET_LOADERS[presetId]
  if (!loader) return
  await loader()
  loadedPresetIds.add(presetId)
}

/** Resolve saved CSS `font-family` to a preset and load its files if needed. */
export async function ensureBundledFontsForCssFamily(cssFamily: string): Promise<void> {
  const preset = findPresetByCss(cssFamily)
  if (preset) await ensureBundledFontPreset(preset.id)
}

/** Preload all optional picker fonts (e.g. when the font dropdown opens). */
export async function preloadOptionalPickerFonts(): Promise<void> {
  await Promise.all(Object.keys(OPTIONAL_PRESET_LOADERS).map(id => ensureBundledFontPreset(id)))
}
