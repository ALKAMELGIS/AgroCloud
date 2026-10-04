/**
 * PWA / iOS icons from public/agrocloud-app-icon.svg (requires sharp).
 * Develop Elite brand: dark green canvas + accent leaf (matches header fa-leaf).
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const logoPath = path.join(pub, 'agrocloud-app-icon.svg')

/** Matches --de-bg in develop-elite-dashboard.css */
const APP_ICON_BG = { r: 5, g: 26, b: 16, alpha: 1 }

if (!fs.existsSync(logoPath)) {
  console.error('Missing', logoPath, '— run: node scripts/process-brand-logo.mjs')
  process.exit(1)
}

async function makeAppIcon(size, outputName, innerRatio = 0.52, maskable = false) {
  const safe = maskable ? 0.72 : innerRatio
  const inner = Math.max(1, Math.round(size * safe))
  const margin = Math.floor((size - inner) / 2)
  await sharp(logoPath)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: margin,
      bottom: size - inner - margin,
      left: margin,
      right: size - inner - margin,
      background: APP_ICON_BG,
    })
    .flatten({ background: APP_ICON_BG })
    .png()
    .toFile(path.join(pub, outputName))
}

for (const size of [192, 512]) {
  await makeAppIcon(size, `pwa-${size}x${size}.png`, 0.54)
}

await makeAppIcon(180, 'apple-touch-icon.png', 0.54)

for (const size of [152, 167]) {
  await makeAppIcon(size, `apple-touch-icon-${size}.png`, 0.54)
}

await makeAppIcon(512, 'maskable-512x512.png', 0.52, true)
await makeAppIcon(192, 'maskable-192x192.png', 0.52, true)

console.log(
  'Wrote PWA icons: pwa-192x192.png, pwa-512x512.png, maskable-192x192.png, maskable-512x512.png, apple-touch-icon*.png',
)
