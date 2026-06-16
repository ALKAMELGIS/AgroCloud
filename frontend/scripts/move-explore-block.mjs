import fs from 'node:fs';

const p = new URL('../src/pages/satellite/SatelliteIntelligence.tsx', import.meta.url);
let s = fs.readFileSync(p, 'utf8');

const open = "{expandedEnvSection === 'explore-stac' ? (";
const closeNeedle =
  ') : null}\n                    <div className="si-env-section-tabs" role="tablist" aria-label="Environmental Index sections">';

const i = s.indexOf(open);
if (i < 0) {
  console.error('open not found');
  process.exit(1);
}
const j = s.indexOf(closeNeedle, i);
if (j < 0) {
  console.error('close not found');
  process.exit(1);
}

const block = s.slice(i, j);
const afterClose = j + ') : null}'.length;
const rest = s.slice(0, i) + s.slice(afterClose);

const insertNeedle =
  '                      ))}\n                    </div>\n                    {expandedEnvSection === \'source\' && (';
const k = rest.indexOf(insertNeedle);
if (k < 0) {
  console.error('insert needle not found');
  process.exit(1);
}

const insertPoint = k + '                      ))}\n                    </div>\n'.length;
const out = rest.slice(0, insertPoint) + block + '\n                    ) : null}\n                    ' + rest.slice(insertPoint);

fs.writeFileSync(p, out);
console.log('ok, block len', block.length);
