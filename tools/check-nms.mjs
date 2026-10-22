// Checks nm-data.js against LandSandBoat: every line an NM cites must still say what it quotes.
//
//   node tools/check-nms.mjs <server dir>
//
// The server dir is a checkout of https://github.com/LandSandBoat/server. A quote found on another
// line is reported as moved; a quote found nowhere in its file fails the check.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const [root] = process.argv.slice(2);
if (!root) { console.error('usage: node tools/check-nms.mjs <server dir>'); process.exit(2); }
const nms = createRequire(import.meta.url)('../nm-data.js');
let checked = 0, moved = 0, bad = 0;
for (const nm of nms) {
  if (!nm.sources.length) { console.error(`${nm.name}: cites nothing`); bad++; }
  for (const s of nm.sources) {
    const path = join(root, s.file);
    if (!existsSync(path)) { console.error(`${nm.name}: ${s.file} is missing`); bad++; continue; }
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    checked++;
    if (lines[s.line - 1] && lines[s.line - 1].includes(s.text)) continue;
    const at = lines.findIndex((l) => l.includes(s.text));
    if (at >= 0) { console.warn(`${nm.name}: "${s.text}" moved from line ${s.line} to ${at + 1} of ${s.file}`); moved++; }
    else { console.error(`${nm.name}: "${s.text}" is no longer in ${s.file}`); bad++; }
  }
}
console.log(`${nms.length} NMs, ${checked} cited lines: ${checked - moved - bad} in place, ${moved} moved, ${bad} missing`);
process.exit(bad ? 1 : 0);
