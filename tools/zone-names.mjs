// Zone display names from LandSandBoat's data/enums/zone.yaml, shared by the build tools.
import { readFileSync } from 'node:fs';

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
export function displayName(key) {
  if (NAMES[key]) return NAMES[key];
  if (key.startsWith('dynamis_')) return `Dynamis - ${displayName(key.slice(8)).replace(/ D$/, ' [D]')}`;
  const s = key.endsWith('_s') ? ' [S]' : '';
  const words = (s ? key.slice(0, -2) : key).split('_');
  return words.map((w, i) => (i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ').replace(/San Doria/, "San d'Oria") + s;
}

// Zone id to enum key, from lines like `  valkurm_dunes: 103`.
export function zoneKeys(enumPath) {
  const keys = {};
  for (const line of readFileSync(enumPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s+([a-z0-9_]+):\s+(\d+)/);
    if (m) keys[+m[2]] = m[1];
  }
  return keys;
}
