import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ref = process.argv[2]
const xml = fs.readFileSync(ref, 'utf8')
const re = /<w:t[^>]*>([^<]*)<\/w:t>/g
const texts = []
let m
while ((m = re.exec(xml))) {
  const t = m[1].trim()
  if (t) texts.push(t)
}
const headings = []
for (let i = 0; i < texts.length; i++) {
  const t = texts[i]
  if (/^(Executive|Statistical|Current|Climate|Forecast|Weather|AI |Key |Agricultural|Extreme|WEATHER|Decision|Growing|Reference|Vapor|Soil|Drought|Frost|Heat|Consecutive|Daily|Monthly|Summary|Indicator|Parameter|Trend|Wind|Solar|Sunlight)/i.test(t) && t.length < 80) {
    headings.push(t)
  }
}
console.log('--- sample headings ---')
console.log([...new Set(headings)].slice(0, 60).join('\n'))
console.log('--- wind/solar mentions ---')
console.log(texts.filter(t => /wind|solar|sunlight|direction/i.test(t)).slice(0, 40).join('\n'))
