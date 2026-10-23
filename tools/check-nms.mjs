// Checks nm-data.js and nm-cards.js against LandSandBoat: every line an NM or its hover card cites must
// still be there, as its fingerprint (tools/lsb-lines.mjs) says.
//
//   node tools/check-nms.mjs <server dir>
//
// The server dir is a checkout of https://github.com/LandSandBoat/server, best at the commit the files
// name. A line found elsewhere in its file is reported as moved; a line found nowhere in its file fails
// the check.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fingerprint, checkoutCommit, citedCommit } from './lsb-lines.mjs';

const [root] = process.argv.slice(2);
if (!root) { console.error('usage: node tools/check-nms.mjs <server dir>'); process.exit(2); }
const require = createRequire(import.meta.url);
const nms = require('../nm-data.js'), cards = require('../nm-cards.js');
const head = checkoutCommit(root);
for (const file of ['nm-data.js', 'nm-cards.js']) {
  const cited = citedCommit(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  if (!cited) console.warn(`${file} names no LandSandBoat commit`);
  else if (head && head !== cited) console.warn(`${file} cites commit ${cited.slice(0, 7)} and the checkout is at ${head.slice(0, 7)}, so some lines may have moved`);
}
// Each file's lines as fingerprints, read once.
const prints = new Map();
const printsOf = (file) => {
  if (!prints.has(file)) prints.set(file, readFileSync(join(root, file), 'utf8').split(/\r?\n/).map(fingerprint));
  return prints.get(file);
};
let checked = 0, moved = 0, bad = 0;
function checkSources(name, sources) {
  for (const s of sources) {
    if (!existsSync(join(root, s.file))) { console.error(`${name}: ${s.file} is missing`); bad++; continue; }
    const lines = printsOf(s.file);
    checked++;
    if (lines[s.line - 1] === s.sha) continue;
    const at = lines.indexOf(s.sha);
    if (at >= 0) { console.warn(`${name}: line ${s.line} of ${s.file} moved to ${at + 1}`); moved++; }
    else { console.error(`${name}: line ${s.line} of ${s.file} (${s.sha}) is no longer in the file`); bad++; }
  }
}
for (const nm of nms) {
  if (!nm.sources.length) { console.error(`${nm.name}: cites nothing`); bad++; }
  checkSources(nm.name, nm.sources);
}
for (const [key, card] of Object.entries(cards)) checkSources(`${key} card`, card.sources);
console.log(`${nms.length} NMs and ${Object.keys(cards).length} cards, ${checked} cited lines: ${checked - moved - bad} in place, ${moved} moved, ${bad} missing`);
process.exit(bad ? 1 : 0);
