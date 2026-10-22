// Builds fishing-data.js from LandSandBoat's fishing tables.
//
//   node tools/build-fishing.mjs <sql dir> <enums dir>
//
// Inputs are the sql folder (fishing_fish, fishing_area, fishing_catch, fishing_group,
// fishing_bait_affinity, fishing_bait and fishing_zone) and the data/enums folder (zone.yaml and
// key_item.yaml) from https://github.com/LandSandBoat/server. It keeps what the server keeps: fish
// that are enabled with a ranking under 99 (LoadFishItems), not debris items, in the catch list of a
// fishing area that exists, and with at least one bait or lure that can hook them (GetFishPool needs
// a bait affinity). The output is checked against the tables before it is written.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayName, zoneKeys } from './zone-names.mjs';

const [sqlDir, enumsDir] = process.argv.slice(2);
if (!sqlDir || !enumsDir) { console.error('usage: node tools/build-fishing.mjs <sql dir> <enums dir>'); process.exit(2); }

// The value lists of every INSERT in a table dump: numbers, quoted strings ('' and \' escapes) and NULL.
function rows(table) {
  const text = readFileSync(join(sqlDir, `${table}.sql`), 'utf8'), out = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf('VALUES (');
    if (!line.startsWith('INSERT INTO') || at < 0) continue;
    const row = [];
    let i = at + 8, cur = '', quoted = false;
    for (; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '\\') { cur += line[++i]; continue; }
        if (ch === "'" && line[i + 1] === "'") { cur += "'"; i++; continue; }
        if (ch === "'") { quoted = false; continue; }
        cur += ch;
      } else if (ch === "'") quoted = true;
      else if (ch === ',' || ch === ')') {
        row.push(/^-?\d+(\.\d+)?$/.test(cur.trim()) ? Number(cur) : cur.trim() === 'NULL' ? null : cur);
        cur = '';
        if (ch === ')') break;
      } else cur += ch;
    }
    out.push(row);
  }
  return out;
}

const zones = zoneKeys(join(enumsDir, 'zone.yaml'));
const keyItems = zoneKeys(join(enumsDir, 'key_item.yaml')); // same `name: id` layout
const title = (key) => key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// fishing_fish: fishid, name, skill_level, difficulty, base_delay, base_move, min_length, max_length,
// ranking, size_type, water_type, log, quest, quest_status, flags, hour_pattern, moon_pattern,
// month_pattern, legendary, legendary_flags, item, max_hook, rarity, required_keyitem, required_catches,
// family, quest_only, contest, disabled
const fishRows = new Map(rows('fishing_fish').filter((r) => r[28] === 0 && r[8] < 99 && r[20] === 0).map((r) => [r[0], r]));
const affinity = new Map();
for (const [bait, fish, power] of rows('fishing_bait_affinity')) {
  if (!affinity.has(fish)) affinity.set(fish, []);
  affinity.get(fish).push([bait, power]);
}
const baitRows = new Map(rows('fishing_bait').map((r) => [r[0], r]));
const groups = new Map();
for (const [group, fish] of rows('fishing_group')) {
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(fish);
}
const difficulty = new Map(rows('fishing_zone').map(([zone, , d]) => [zone, d]));
const areas = new Map(rows('fishing_area').map(([zone, area, name]) => [`${zone}:${area}`, name]));
const catchable = (id) => fishRows.has(id) && affinity.has(id);

// Spots: each fishing area with a catch list, and the fish that can bite there.
const spots = [];
for (const [zone, area, group] of rows('fishing_catch')) {
  const name = areas.get(`${zone}:${area}`), fish = (groups.get(group) || []).filter(catchable);
  if (name == null || !fish.length) continue;
  if (!zones[zone]) throw new Error(`zone ${zone} has no name in the enum`);
  spots.push([zone, displayName(zones[zone]), name === 'Whole Zone' ? '' : name, difficulty.get(zone) || 0, [...new Set(fish)].sort((a, b) => a - b)]);
}
spots.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));

const used = new Set(spots.flatMap((s) => s[4]));
const fish = [...used].map((id) => {
  const r = fishRows.get(id), ki = r[23] ? keyItems[r[23]] : null;
  if (r[23] && !ki) throw new Error(`fish ${id} needs key item ${r[23]}, which has no name`);
  const baits = affinity.get(id).filter(([b]) => baitRows.has(b)).sort((a, b) => b[1] - a[1] || baitRows.get(a[0])[1].localeCompare(baitRows.get(b[0])[1]));
  // [id, name, skill, size (0 small, 1 large), rarity (1000 = full chance), legendary, key item, [[bait id, power]]]
  return [id, r[1], r[2], r[9], r[22], r[18] ? 1 : 0, ki ? title(ki) : '', baits];
}).sort((a, b) => a[1].localeCompare(b[1]));
const baits = [...new Set(fish.flatMap((f) => f[7].map(([b]) => b)))].sort((a, b) => a - b).map((b) => [b, baitRows.get(b)[1], baitRows.get(b)[2]]);

// Check the output against the tables it came from.
for (const s of spots) for (const id of s[4]) {
  if (!fish.some((f) => f[0] === id)) throw new Error(`spot ${s[1]} lists fish ${id} with no entry`);
}
for (const f of fish) {
  const r = fishRows.get(f[0]);
  if (r[1] !== f[1] || r[2] !== f[2] || r[22] !== f[4]) throw new Error(`fish ${f[0]} does not match its row`);
  if (!f[7].length) throw new Error(`fish ${f[1]} has no bait`);
  const inSql = rows('fishing_catch').some(([z, a, g]) => areas.has(`${z}:${a}`) && (groups.get(g) || []).includes(f[0]));
  if (!inSql) throw new Error(`fish ${f[1]} is in no catch list`);
}

const js = `// Generated by tools/build-fishing.mjs from LandSandBoat's fishing tables. Do not edit by hand.
// fish: [id, name, skill, size (0 small, 1 large), rarity (out of 1000), legendary, key item needed,
// [[bait id, power 1-3], ...]]; baits: [id, name, type (0 bait, 1 lure, 2 special)]; spots: [zone id,
// zone name, area name ('' for the whole zone), zone difficulty, [fish ids]].
(function (root) {
  var data = {
    fish: ${JSON.stringify(fish)},
    baits: ${JSON.stringify(baits)},
    spots: ${JSON.stringify(spots)}
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.VanaFishingData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
writeFileSync(new URL('../fishing-data.js', import.meta.url), js);
console.log(`${fish.length} fish, ${baits.length} baits and lures, ${spots.length} spots in ${new Set(spots.map((s) => s[0])).size} zones, ${js.length} bytes`);
