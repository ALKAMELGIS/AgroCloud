/**
 * PWA / iOS icons from public/agrocloud-pwa-logo.png (official leaf + AgroCloud mark).
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const logoPath = path.join(pub, 'agrocloud-pwa-logo.png')

const ICON_BG = { r: 255, g: 255, b: 255, alpha: 1 }

if (!fs.existsSync(logoPath)) {
  console.error('Missing', logoPath)
  process.exit(1)
}

async function makeAppIcon(size, outputName, innerRatio = 0.86, maskable = false) {
  const safe = maskable ? 0.72 : innerRatio
  const inner = Math.max(1, Math.round(size * safe))
  const margin = Math.floor((size - inner) / 2)
  const logo = await sharp(logoPath)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp(logo)
    .extend({
      top: margin,
      bottom: size - inner - margin,
      left: margin,
      right: size - inner - margin,
      background: ICON_BG,
    })
    .flatten({ background: ICON_BG })
    .png()
    .toFile(path.join(pub, outputName))
}

for (const size of [192, 512]) {
  await makeAppIcon(size, `pwa-${size}x${size}.png`, 0.86)
}

await makeAppIcon(180, 'apple-touch-icon.png', 0.86)

for (const size of [152, 167]) {
  await makeAppIcon(size, `apple-touch-icon-${size}.png`, 0.86)
}

await makeAppIcon(512, 'maskable-512x512.png', 0.86, true)
await makeAppIcon(192, 'maskable-192x192.png', 0.86, true)

console.log(
  'Wrote PWA icons: pwa-192x192.png, pwa-512x512.png, maskable-192x192.png, maskable-512x512.png, apple-touch-icon*.png',
)
