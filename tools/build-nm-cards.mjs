// Builds nm-cards.js, the data behind each NM's hover card, from LandSandBoat's mob data and the BG Wiki
// citations in tools/nm-maps.json and tools/item-names.json.
//
//   node tools/build-nm-cards.mjs <server dir>
//
// The server dir is a checkout of https://github.com/LandSandBoat/server, or third_party/landsandboat/,
// which has the files nm-cards.js is built from and names their commit. For each NM in nm-data.js it
// reads the zone's data/zones/<zone>/mobs.yaml: the drops in the NM's template (each chance tier turned
// into a rate with data/enums/drop_rate.yaml), the level range of its spawn entries, and for an NM that
// rolls off a placeholder, the other members of its spawn slot. Every value cites the line it comes from by
// file, line and fingerprint (tools/lsb-lines.mjs), so the lines themselves are not copied, and
// tools/check-nms.mjs checks them as it checks nm-data.js. The server dir has to name its commit, as a git
// checkout or a COMMIT file does, so the cards can name it. The map grids come from BG Wiki,
// as tools/nm-maps.json records them, and drop names from tools/item-names.json.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fingerprint, checkoutCommit } from './lsb-lines.mjs';

const [root] = process.argv.slice(2);
if (!root) { console.error('usage: node tools/build-nm-cards.mjs <server dir>'); process.exit(2); }
const commit = checkoutCommit(root);
if (!commit) { console.error(`${root} is neither a git checkout nor has a COMMIT file, so the cards can't name its commit`); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '..');
const nms = createRequire(import.meta.url)('../nm-data.js');
const maps = JSON.parse(readFileSync(join(here, 'nm-maps.json'), 'utf8')).maps;
const names = JSON.parse(readFileSync(join(here, 'item-names.json'), 'utf8')).items;
const lines = (file) => readFileSync(join(root, file), 'utf8').split(/\r?\n/);
const rateFile = 'data/enums/drop_rate.yaml';
const rates = Object.fromEntries(lines(rateFile).map((l) => /^ {2}(\w+):\s+(\d+)/.exec(l)).filter(Boolean).map((m) => [m[1], +m[2]]));
const zoneDirs = readdirSync(join(root, 'data/zones')).filter((d) => existsSync(join(root, 'data/zones', d, 'mobs.yaml')));
const pretty = (template) => template.replace(/_/g, ' ');

const cards = {}, problems = [];
for (const nm of nms) {
  const key = `${nm.name}|${nm.zoneId}`, template = nm.name.replace(/'/g, '').replace(/ /g, '_');
  // The zone folder the NM's citations point at, or else the one whose mobs.yaml has its template.
  const cited = nm.sources.map((s) => s.file).find((f) => /zones\/[^/]+\//i.test(f));
  const hasTemplate = (d) => d && lines(`data/zones/${d}/mobs.yaml`).includes(`  ${template}:`);
  let dir = cited && zoneDirs.find((d) => d.toLowerCase() === cited.split('/')[2].toLowerCase());
  if (!hasTemplate(dir)) dir = zoneDirs.find(hasTemplate);
  if (!dir) { problems.push(`${key}: no template ${template} in any mobs.yaml`); continue; }
  const file = `data/zones/${dir}/mobs.yaml`, text = lines(file), sources = [];
  const cite = (i) => { sources.push({ file, line: i + 1, sha: fingerprint(text[i]) }); };
  // Drops: the template's loot, a chance line followed by its item line.
  const at = text.indexOf(`  ${template}:`), end = text.findIndex((l, i) => i > at && /^ {2}\S/.test(l));
  const drops = [];
  for (let i = at + 1; i < (end < 0 ? text.length : end); i++) {
    const chance = /^\s+- chance:\s*(\w+)\s*$/.exec(text[i]), item = /^\s+item:\s*(\w+)\s*$/.exec(text[i + 1] || '');
    if (!chance || !item) continue;
    if (!(chance[1] in rates)) problems.push(`${key}: unknown drop chance ${chance[1]}`);
    if (!names[item[1]]) problems.push(`${key}: no checked name for ${item[1]}`);
    drops.push([names[item[1]]?.name || item[1], rates[chance[1]]]);
    cite(i); cite(i + 1);
  }
  // Spawn entries: "  <id>:" then "    template: <NM>", with an optional region and a level range.
  const spawns = [];
  text.forEach((l, i) => {
    if (l !== `    template: ${template}` || !/^ {2}\d+:$/.test(text[i - 1])) return;
    const id = +text[i - 1].trim().slice(0, -1);
    const lv = [i + 1, i + 2].find((j) => /^ {4}level:\s*\[\d+, \d+\]/.test(text[j] || ''));
    spawns.push({ id, level: lv == null ? null : /\[(\d+), (\d+)\]/.exec(text[lv]).slice(1).map(Number) });
    cite(i);
    if (lv != null) cite(lv);
  });
  const levels = spawns.map((s) => s.level).filter(Boolean);
  const level = levels.length ? [Math.min(...levels.map((l) => l[0])), Math.max(...levels.map((l) => l[1]))] : null;
  // Placeholders: the other members of a lottery slot ("- members:" then "<id>: {...} # <template>").
  const placeholders = [];
  for (const sp of spawns) {
    const i = text.findIndex((l) => new RegExp(`^\\s+${sp.id}: \\{`).test(l));
    if (i < 0) continue;
    let s = i;
    while (/^\s+\d+: \{/.test(text[s - 1])) s--;
    if (!/^\s+- members:$/.test(text[s - 1] || '')) continue;
    for (let k = s; /^\s+\d+: \{/.test(text[k] || ''); k++) {
      const m = /^\s+(\d+): \{[^}]*\}\s*# (\w+)/.exec(text[k]);
      if (m && m[2] !== template && !placeholders.includes(pretty(m[2]))) { placeholders.push(pretty(m[2])); cite(k); }
    }
  }
  const map = maps[key] || null;
  if (map && !(map.grid.length && map.page && map.revid && ['spawn', 'qm'].includes(map.at))) problems.push(`${key}: incomplete map citation`);
  cards[key] = { level, placeholders, drops, map, sources };
}
for (const key of Object.keys(maps)) if (!cards[key]) problems.push(`${key}: a map citation for an NM the page doesn't have`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const out = `// Generated by tools/build-nm-cards.mjs from LandSandBoat's mob data and the BG Wiki citations in tools/.
// Do not edit by hand. Keyed by "name|zone id": level [min, max]; placeholders, the monsters a lottery NM
// rolls off; drops [[name, rate out of 1000], ...] at LandSandBoat's base rates, one entry per roll; map
// { grid, at ('spawn' where it appears, 'qm' the ??? that pops it), page, revid } from BG Wiki, or null;
// sources, the LandSandBoat lines it all comes from, by file, line and fingerprint at this commit:
// LandSandBoat commit: ${commit}
// Derived from LandSandBoat (https://github.com/LandSandBoat/server), Copyright (c) Darkstar Dev Teams and
// LandSandBoat Dev Teams, under the GNU General Public License version 3 (see COPYING). Modified by
// RadMageIRL on 2026-10-23: selected and re-encoded, with names and map grids checked on BG Wiki. The
// LandSandBoat files it is built from are in third_party/landsandboat/.
(function (root) {
  var data = ${JSON.stringify(cards)};
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.VanaNmCards = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
writeFileSync(join(repo, 'nm-cards.js'), out);
const n = Object.values(cards);
console.log(`${n.length} cards: ${n.filter((c) => c.drops.length).length} with drops, ${n.filter((c) => c.placeholders.length).length} with placeholders, ${n.filter((c) => c.map).length} with a map grid, ${n.reduce((t, c) => t + c.sources.length, 0)} cited lines`);
