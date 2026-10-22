// Builds weather-data.js from LandSandBoat's weather table.
//
//   node tools/build-weather.mjs <zone_weather.sql> <zone.yaml>
//
// Inputs are sql/zone_weather.sql and data/enums/zone.yaml from https://github.com/LandSandBoat/server.
// Each zone's weather is a 2,160-day cycle; every day holds a normal, a common and a rare weather
// packed as three 5-bit fields (normal << 10 | common << 5 | rare), and a day stored as 0 keeps the
// day before it. Zones sharing one pattern share one entry. A zone with a single entry never changes:
// those with a fixed elemental weather (Dynamis, Temenos, the cloisters) are kept as `fixed`, and
// the fixed-sunshine ones are left out, since many of them (Abyssea, for one) look like missing data.
// The output is checked against the input day by day before it is written.
import { readFileSync, writeFileSync } from 'node:fs';

const [sqlPath, enumPath] = process.argv.slice(2);
if (!sqlPath || !enumPath) { console.error('usage: node tools/build-weather.mjs <zone_weather.sql> <zone.yaml>'); process.exit(2); }
const CYCLE = 2160;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Display names the enum keys can't spell: apostrophes, hyphens, # and the game's own casing.
const NAMES = {
  carpenters_landing: "Carpenters' Landing", psoxja: "Pso'Xja", mine_shaft_2716: 'Mine Shaft #2716',
  riverne_site_b01: 'Riverne - Site #B01', riverne_site_a01: 'Riverne - Site #A01', sealions_den: "Sealion's Den",
  altaieu: "Al'Taieu", grand_palace_of_huxzoi: "Grand Palace of Hu'Xzoi", the_garden_of_ruhmet: "The Garden of Ru'Hmet",
  open_sea_route_to_al_zahbi: 'Open sea route to Al Zahbi', open_sea_route_to_mhaura: 'Open sea route to Mhaura',
  silver_sea_route_to_nashmau: 'Silver Sea route to Nashmau', silver_sea_route_to_al_zahbi: 'Silver Sea route to Al Zahbi',
  ship_bound_for_selbina: 'Ship bound for Selbina', ship_bound_for_mhaura: 'Ship bound for Mhaura',
  ship_bound_for_selbina_pirates: 'Ship bound for Selbina (pirates)', ship_bound_for_mhaura_pirates: 'Ship bound for Mhaura (pirates)',
  mamool_ja_training_grounds: 'Mamool Ja Training Grounds', fort_karugo_narugo_s: 'Fort Karugo-Narugo [S]',
  the_sanctuary_of_zitah: "The Sanctuary of Zi'Tah", romaeve: "Ro'Maeve", behemoths_dominion: "Behemoth's Dominion",
  ghoyus_reverie: "Ghoyu's Reverie", ruaun_gardens: "Ru'Aun Gardens", balgas_dais: "Balga's Dais", dragons_aery: "Dragon's Aery",
  middle_delkfutts_tower: "Middle Delkfutt's Tower", upper_delkfutts_tower: "Upper Delkfutt's Tower", lower_delkfutts_tower: "Lower Delkfutt's Tower",
  crawlers_nest: "Crawlers' Nest", crawlers_nest_s: "Crawlers' Nest [S]", velugannon_palace: "Ve'Lugannon Palace",
  the_shrine_of_ruavitau: "The Shrine of Ru'Avitau", laloff_amphitheater: 'LaLoff Amphitheater', king_ranperres_tomb: "King Ranperre's Tomb",
  ordelles_caves: "Ordelle's Caves", feiyin: "Fei'Yin", ifrits_cauldron: "Ifrit's Cauldron", qubia_arena: "Qu'Bia Arena",
  chateau_doraguille: "Chateau d'Oraguille", rulude_gardens: "Ru'Lude Gardens",
};
const SMALL = new Set(['of', 'the', 'to', 'for', 'and']);
function displayName(key) {
  if (NAMES[key]) return NAMES[key];
  if (key.startsWith('dynamis_')) return `Dynamis - ${displayName(key.slice(8)).replace(/ D$/, ' [D]')}`;
  const s = key.endsWith('_s') ? ' [S]' : '';
  const words = (s ? key.slice(0, -2) : key).split('_');
  return words.map((w, i) => (i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ').replace(/San Doria/, "San d'Oria") + s;
}

const keys = {};
for (const line of readFileSync(enumPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s+([a-z0-9_]+):\s+(\d+)/);
  if (m) keys[+m[2]] = m[1];
}

// Expand every zone to 2,160 explicit days, carrying a 0 forward as the server does.
const zones = [];
const re = /\((\d+),0x([0-9A-Fa-f]*)\)/g;
for (let m; (m = re.exec(readFileSync(sqlPath, 'utf8'))); ) {
  const blob = Buffer.from(m[2], 'hex'), days = [];
  if (blob.length !== CYCLE * 2) throw new Error(`zone ${m[1]}: ${blob.length} bytes, expected ${CYCLE * 2}`);
  let last = 0;
  for (let i = 0; i < CYCLE; i++) { last = blob.readUInt16LE(i * 2) || last; days.push(last); }
  zones.push({ id: +m[1], days });
}

const SUNSHINE = (1 << 10) | (1 << 5) | 1;
const patterns = [], byKey = new Map(), out = [], fixed = [];
for (const z of zones) {
  const palette = [...new Set(z.days)];
  if (palette.length < 2) {
    if (palette[0] && palette[0] !== SUNSHINE) fixed.push([z.id, displayName(keys[z.id]), palette[0]]);
    continue;
  }
  if (palette.length > ALPHABET.length) throw new Error(`zone ${z.id}: palette of ${palette.length}`);
  const key = z.days.join(',');
  if (!byKey.has(key)) { byKey.set(key, patterns.length); patterns.push([palette, z.days.map((d) => ALPHABET[palette.indexOf(d)]).join('')]); }
  if (!keys[z.id]) throw new Error(`zone ${z.id} has no name in the enum`);
  out.push([z.id, displayName(keys[z.id]), byKey.get(key)]);
}
out.sort((a, b) => a[1].localeCompare(b[1]));
fixed.sort((a, b) => a[1].localeCompare(b[1]));

// Round trip: decode what will be written and compare it with the expanded source, every day.
for (const [id, , p] of out) {
  const [palette, days] = patterns[p], src = zones.find((z) => z.id === id).days;
  for (let d = 0; d < CYCLE; d++) if (palette[ALPHABET.indexOf(days[d])] !== src[d]) throw new Error(`round trip failed: zone ${id} day ${d}`);
}
for (const [id, , v] of fixed) if (zones.find((z) => z.id === id).days.some((d) => d !== v)) throw new Error(`zone ${id} is not fixed`);

const js = `// Generated by tools/build-weather.mjs from LandSandBoat's sql/zone_weather.sql. Do not edit by hand.
// zones: [zone id, name, pattern]; patterns: [palette of packed normal/common/rare weathers, one
// character per day of the 2,160-day cycle indexing that palette]; fixed: [zone id, name, packed
// weather] for zones whose weather never changes.
(function (root) {
  var data = {
    cycle: ${CYCLE},
    alphabet: '${ALPHABET}',
    zones: ${JSON.stringify(out)},
    fixed: ${JSON.stringify(fixed)},
    patterns: [
${patterns.map(([pal, days]) => `      [${JSON.stringify(pal)}, '${days}']`).join(',\n')}
    ]
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.VanaWeatherData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
writeFileSync(new URL('../weather-data.js', import.meta.url), js);
console.log(`${out.length} changing zones in ${patterns.length} patterns, ${fixed.length} fixed zones, ${js.length} bytes`);
