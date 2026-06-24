/**
 * PWA / iOS icons from public/agrocloud-app-icon.svg (requires sharp).
 * Generates pure-white app icon canvases to avoid dark/black mask backgrounds on mobile launchers.
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const logoPath = path.join(pub, 'agrocloud-app-icon.svg')

if (!fs.existsSync(logoPath)) {
  console.error('Missing', logoPath, '— run: node scripts/process-brand-logo.mjs')
  process.exit(1)
}

const whiteBg = { r: 255, g: 255, b: 255, alpha: 1 }

async function makeWhiteCanvasIcon(size, outputName, innerRatio = 0.84) {
  const inner = Math.max(1, Math.round(size * innerRatio))
  const margin = Math.floor((size - inner) / 2)
  await sharp(logoPath)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: margin,
      bottom: size - inner - margin,
      left: margin,
      right: size - inner - margin,
      background: whiteBg,
    })
    .flatten({ background: whiteBg })
    .png()
    .toFile(path.join(pub, outputName))
}

for (const size of [192, 512]) {
  await makeWhiteCanvasIcon(size, `pwa-${size}x${size}.png`, size === 192 ? 0.84 : 0.86)
}

await makeWhiteCanvasIcon(180, 'apple-touch-icon.png', 0.84)

for (const size of [152, 167]) {
  await makeWhiteCanvasIcon(size, `apple-touch-icon-${size}.png`, 0.84)
}

await makeWhiteCanvasIcon(512, 'maskable-512x512.png', 0.8)

console.log(
  'Wrote PWA icons: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png, apple-touch-icon-152.png, apple-touch-icon-167.png, maskable-512x512.png',
)
