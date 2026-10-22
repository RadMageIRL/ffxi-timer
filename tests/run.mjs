// Tests for vana.js. Run with `node tests/run.mjs`; no dependencies.
// Reference values come from sources independent of this code: the server's epoch, the anchors
// in Pyogenes' timer, BG Wiki's moon table and the in-game ferry timekeeper schedules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const V = createRequire(import.meta.url)('../vana.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message.split('\n').join('\n  ')}`); }
}

// Earth time of a Vana'diel day number (days since the epoch) at an hour and minute.
const at = (dayNumber, hour = 0, minute = 0) => V.dayStartOf(dayNumber) + hour * V.HOUR + minute * V.MIN;
const FIRESDAY = 240000; // a day number divisible by 8
const ROUTE = Object.fromEntries(V.ROUTES.map((r) => [r.id, r]));

// ---- Clock ----
test('the epoch is 886-01-01 00:00:00, a Firesday', () => {
  const c = V.clock(V.EPOCH);
  assert.deepEqual([c.year, c.month, c.date, c.hour, c.minute, c.second, c.weekday], [886, 1, 1, 0, 0, 0, 0]);
});
test("Pyogenes' basis date 2002-06-23 15:00 UTC is 898-02-01 00:00", () => {
  const c = V.clock(Date.UTC(2002, 5, 23, 15));
  assert.deepEqual([c.year, c.month, c.date, c.hour, c.minute], [898, 2, 1, 0, 0]);
});
test('one Vana\'diel day is 57 minutes 36 seconds of Earth time', () => {
  assert.equal(V.DAY, (57 * 60 + 36) * 1000);
  assert.equal(V.clock(V.EPOCH + V.DAY).date, 2);
  assert.equal(V.clock(V.EPOCH + V.DAY - 1).hour, 23);
});
test('a month is 30 days and a year 360', () => {
  const c = V.clock(V.EPOCH + 30 * V.DAY), y = V.clock(V.EPOCH + 360 * V.DAY);
  assert.deepEqual([c.month, c.date], [2, 1]);
  assert.deepEqual([y.year, y.month, y.date], [887, 1, 1]);
});
test('the week runs Firesday through Darksday and wraps', () => {
  assert.deepEqual([0, 1, 7, 8].map((d) => V.clock(at(FIRESDAY + d, 12)).weekday), [0, 1, 7, 0]);
  assert.equal(V.DAYS[4].name, 'Iceday');
});
test('Watersday weakens Fire (the BG Wiki example)', () => {
  assert.equal(V.DAYS[2].name, 'Watersday');
  assert.equal(V.DAYS[2].weak, 'fire');
});
test('each day weakens a different element and never its own', () => {
  assert.equal(new Set(V.DAYS.map((d) => d.weak)).size, 8);
  for (const d of V.DAYS) assert.notEqual(d.weak, d.element, d.name);
});
test('daytime is 06:00 up to 18:00', () => {
  assert.deepEqual([5, 6, 17, 18].map(V.isDaytime), [false, true, true, false]);
});

// ---- Moon ----
const MOON_ANCHOR = Date.UTC(2004, 0, 25, 2, 31, 12); // Pyogenes' full moon reference
const anchorDay = V.clock(MOON_ANCHOR).dayNumber;
const moonAfter = (days) => V.moonOfDay(anchorDay + days);
test("Pyogenes' moon reference day is the 100% full moon peak", () => {
  assert.equal(V.clock(MOON_ANCHOR).hour, 0);
  assert.deepEqual([moonAfter(0).percent, moonAfter(0).direction, moonAfter(0).phase], [100, 'peak', V.FULL]);
});
test('the moon reaches 0% (new moon peak) 42 days after the full peak and 100% again after 84', () => {
  assert.deepEqual([moonAfter(42).percent, moonAfter(42).direction], [0, 'peak']);
  assert.deepEqual([moonAfter(84).percent, moonAfter(84).direction], [100, 'peak']);
});
test('waning percentages match the BG Wiki ranges at their edges', () => {
  // 93%-79% Waning Gibbous, 76%-62% Waning Gibbous, 60%-43% Last Quarter, 40%-26%, 24%-12% Waning Crescent, then 10% New
  assert.deepEqual([3, 9, 10, 16, 17, 24, 25, 31, 32, 37, 38].map((d) => moonAfter(d).percent), [93, 79, 76, 62, 60, 43, 40, 26, 24, 12, 10]);
});
test('waxing percentages match the BG Wiki ranges at their edges', () => {
  // 5% New, 7%-21%, 24%-38% Waxing Crescent, 40%-55% First Quarter, 57%-71%, 74%-88% Waxing Gibbous, 90% Full
  assert.deepEqual([44, 45, 51, 52, 58, 59, 65, 66, 72, 73, 79, 80].map((d) => moonAfter(d).percent), [5, 7, 21, 24, 38, 40, 55, 57, 71, 74, 88, 90]);
});
test("the integer percent formula matches the server's floating point one on every day of the cycle", () => {
  const server = (d) => Math.trunc(d >= 42 ? 100 * ((d - 42) / 42) + 0.5 : 100 * (1 - d / 42) + 0.5);
  for (let d = 0; d < 84; d++) assert.equal(moonAfter(d).percent, server(d), `cycle day ${d}`);
});
test('43% waning is Last Quarter and 40% waning is a Waning Crescent', () => {
  assert.equal(V.MOON_PHASES[moonAfter(24).phase], 'Last Quarter');
  assert.equal(V.MOON_PHASES[moonAfter(25).phase], 'Waning Crescent');
});
test("38% waxing is still a Waxing Crescent (Pyogenes' moon display calls it First Quarter)", () => {
  assert.equal(moonAfter(58).percent, 38);
  assert.equal(V.MOON_PHASES[moonAfter(58).phase], 'Waxing Crescent');
  assert.equal(V.MOON_PHASES[moonAfter(59).phase], 'First Quarter');
});
test('every phase name lasts as many days as the BG Wiki percentages give it', () => {
  const days = {};
  for (let d = 0; d < 84; d++) { const n = V.MOON_PHASES[moonAfter(d).phase]; days[n] = (days[n] || 0) + 1; }
  assert.deepEqual(days, {
    'Full Moon': 7, 'Waning Gibbous': 14, 'Last Quarter': 8, 'Waning Crescent': 13,
    'New Moon': 7, 'Waxing Crescent': 14, 'First Quarter': 7, 'Waxing Gibbous': 14,
  });
});
test('the full moon runs from 90% waxing to 95% waning', () => {
  assert.deepEqual([79, 80, 83, 86, 87].map((d) => V.MOON_PHASES[moonAfter(d).phase]), ['Waxing Gibbous', 'Full Moon', 'Full Moon', 'Full Moon', 'Waning Gibbous']);
});
test('the new moon runs from 10% waning to 5% waxing', () => {
  assert.deepEqual([37, 38, 44, 45].map((d) => V.MOON_PHASES[moonAfter(d).phase]), ['Waning Crescent', 'New Moon', 'New Moon', 'Waxing Crescent']);
});
test('the next phase change from the full peak is the Waning Gibbous, three days on', () => {
  const next = V.nextPhaseChange(V.dayStartOf(anchorDay) + 5 * V.HOUR);
  assert.equal(next.at, V.dayStartOf(anchorDay + 3));
  assert.equal(V.MOON_PHASES[next.phase], 'Waning Gibbous');
});

// ---- RSE ----
const RSE_ANCHOR = Date.UTC(2004, 0, 28, 9, 14, 24); // Pyogenes' RSE reference week start
test("Pyogenes' RSE reference is a week start with Male Hume in Gusgen Mines", () => {
  const r = V.rse(RSE_ANCHOR);
  assert.equal(r.start, RSE_ANCHOR);
  assert.equal(V.RSE_RACES[r.race], 'Male Hume');
  assert.equal(V.RSE_PLACES[r.place], 'Gusgen Mines');
});
test('the week after is Female Hume in the Maze of Shakhrami, then Male Elvaan in Ordelle\'s Caves', () => {
  const [, a, b] = V.rseWeeks(RSE_ANCHOR, 3);
  assert.deepEqual([V.RSE_RACES[a.race], V.RSE_PLACES[a.place]], ['Female Hume', 'Maze of Shakhrami']);
  assert.deepEqual([V.RSE_RACES[b.race], V.RSE_PLACES[b.place]], ['Male Elvaan', "Ordelle's Caves"]);
});
test('filtering RSE weeks by race returns that race every 8 weeks', () => {
  const weeks = V.rseWeeks(RSE_ANCHOR, 3, 7);
  assert.ok(weeks.every((w) => w.race === 7));
  assert.deepEqual([weeks[1].start - weeks[0].start, weeks[2].start - weeks[1].start], [8 * V.WEEK, 8 * V.WEEK]);
});

test('each RSE dungeon has its own chest key and the sachet NM its ??? pops', () => {
  assert.equal(V.RSE_DUNGEONS.length, V.RSE_PLACES.length);
  assert.deepEqual(V.RSE_DUNGEONS.map((d) => d.key), ['Ordelle Chest Key', 'Gusgen Chest Key', 'Shakhrami Chest Key']);
  assert.deepEqual(V.RSE_DUNGEONS.map((d) => d.nm), ['Aroma Leech', 'Aroma Fly', 'Aroma Crawler']);
  for (const d of V.RSE_DUNGEONS) {
    assert.ok(d.droppers.length >= 10, d.key);
    assert.equal(new Set(d.droppers.map(([n]) => n)).size, d.droppers.length, `${d.key} lists a monster twice`);
    assert.ok(d.droppers.every(([, r]) => r === 'rare' || r === 'very rare'), d.key);
  }
});
test('every race has a four-piece set and a sachet, and both Tarutaru share theirs', () => {
  assert.equal(V.RSE_GEAR.length, V.RSE_RACES.length);
  for (const g of V.RSE_GEAR) assert.ok(g.pieces.length === 4 && g.pieces.every((p) => p.startsWith(g.set)) && g.sachet.endsWith('Sachet'), g.set);
  assert.deepEqual(V.RSE_GEAR[4], V.RSE_GEAR[5]);
  assert.equal(new Set(V.RSE_GEAR.map((g) => g.sachet)).size, 7);
});

// ---- Earth resets ----
test('JP midnight from 12:00 UTC is 15:00 UTC the same day', () => {
  assert.equal(V.nextJpMidnight(Date.UTC(2026, 9, 21, 12)), Date.UTC(2026, 9, 21, 15));
});
test('JP midnight at exactly 15:00 UTC is the next day', () => {
  assert.equal(V.nextJpMidnight(Date.UTC(2026, 9, 21, 15)), Date.UTC(2026, 9, 22, 15));
});
test('the conquest tally after Wednesday 2026-10-21 is Monday 00:00 JST, Sunday 15:00 UTC', () => {
  const next = V.nextConquestTally(Date.UTC(2026, 9, 21, 12));
  assert.equal(next, Date.UTC(2026, 9, 25, 15));
  assert.equal(new Date(next + V.JST).getUTCDay(), 1);
});
test('the conquest tally one millisecond early is still that tally, and at it the next week', () => {
  assert.equal(V.nextConquestTally(Date.UTC(2026, 9, 25, 15) - 1), Date.UTC(2026, 9, 25, 15));
  assert.equal(V.nextConquestTally(Date.UTC(2026, 9, 25, 15)), Date.UTC(2026, 10, 1, 15));
});

// ---- Ships ----
const doorMinute = (r) => Math.floor(r.openAt / V.MIN) % (r.everyMs / V.MIN);
test('the Selbina and Mhaura boats dock at 06:40 and leave at 00:00, 08:00 and 16:00 (timekeeper schedule)', () => {
  for (const id of ['selbina-mhaura', 'mhaura-selbina']) {
    assert.equal(doorMinute(ROUTE[id]), 6 * 60 + 40, id);
    assert.deepEqual(V.departureMinutes(ROUTE[id]), [0, 480, 960], id);
  }
});
test('the Mhaura and Whitegate boats dock at 02:40 and leave at 04:00, 12:00 and 20:00', () => {
  for (const id of ['mhaura-whitegate', 'whitegate-mhaura']) {
    assert.equal(doorMinute(ROUTE[id]), 2 * 60 + 40, id);
    assert.deepEqual(V.departureMinutes(ROUTE[id]), [240, 720, 1200], id);
  }
});
test('the Whitegate and Nashmau boats dock at 05:00 and leave at 00:00, 08:00 and 16:00', () => {
  for (const id of ['whitegate-nashmau', 'nashmau-whitegate']) {
    assert.equal(doorMinute(ROUTE[id]), 5 * 60, id);
    assert.deepEqual(V.departureMinutes(ROUTE[id]), [0, 480, 960], id);
  }
});
test('airships leave four times a Vana\'diel day, within six minutes after the times older timers list', () => {
  const listed = { 'jeuno-sandoria': 70, 'jeuno-windurst': 160, 'jeuno-bastok': 250, 'jeuno-kazham': 335, 'bastok-jeuno': 70, 'kazham-jeuno': 160, 'sandoria-jeuno': 250, 'windurst-jeuno': 345 };
  for (const [id, minute] of Object.entries(listed)) {
    const deps = V.departureMinutes(ROUTE[id]);
    assert.equal(deps.length, 4, id);
    assert.ok(deps[0] >= minute && deps[0] <= minute + 6, `${id} leaves at minute ${deps[0]}, listed ${minute}`);
  }
});
test('every ship, airship and Manaclipper lands while a vessel is arriving at its destination berth', () => {
  for (const r of V.ROUTES.filter((x) => x.group !== 'barge')) {
    const dest = r.to.replace(' (tour)', ''), land = V.mod(r.offset * 1000 + r.disembark * 1000, r.everyMs);
    const berths = V.ROUTES.filter((x) => x.from === dest && x.everyMs === r.everyMs);
    assert.ok(berths.some((b) => V.mod(land - b.arriveAt, r.everyMs) < b.arrivingMs), `${r.id} lands at ${land / 1000}s with no arrival under way`);
  }
});
test('each barge leg lands before the next leg leaves that landing', () => {
  for (const r of V.ROUTES.filter((x) => x.group === 'barge')) {
    const lands = V.routeStatus(r, V.EPOCH).lands;
    const after = V.ROUTES.filter((x) => x.group === 'barge' && x.from === r.to).map((x) => V.nextDeparture(x, lands));
    assert.ok(after.length && Math.min(...after) - lands < V.DAY / 2, r.id);
  }
});
test('a route is boarding from the moment its door opens until it shuts', () => {
  const r = ROUTE['jeuno-kazham'], open = V.EPOCH + 1000 * V.DAY + r.openAt, shut = open + r.dockedMs;
  assert.equal(V.routeStatus(r, open - 1).state, 'arriving');
  assert.deepEqual([V.routeStatus(r, open).state, V.routeStatus(r, open).departs], ['boarding', shut]);
  assert.deepEqual([V.routeStatus(r, shut - 1).state, V.routeStatus(r, shut - 1).departs], ['boarding', shut]);
  assert.deepEqual([V.routeStatus(r, shut).state, V.routeStatus(r, shut).departs], ['away', shut + r.everyMs]);
});
test('a departure lands one ride later', () => {
  const r = ROUTE['selbina-mhaura'], s = V.routeStatus(r, V.EPOCH + 5 * V.HOUR);
  assert.equal(s.lands - s.departs, r.rideMs);
  assert.equal(r.rideMs, 944000);
});

// ---- Guilds ----
const ALCHEMY = V.GUILDS.find((g) => g.craft === 'Alchemy' && g.place === 'Bastok Mines');
test('the Bastok alchemy guild opens at 08:00 and is open until 23:00', () => {
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY, 7, 59)), { open: false, holiday: false, until: at(FIRESDAY, 8) });
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY, 8)), { open: true, holiday: false, until: at(FIRESDAY, 23) });
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY, 22, 59)), { open: true, holiday: false, until: at(FIRESDAY, 23) });
});
test('the Bastok alchemy guild closed at 23:00 reopens the next morning', () => {
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY, 23)), { open: false, holiday: false, until: at(FIRESDAY + 1, 8) });
});
test('the Bastok alchemy guild is closed all Lightsday and reopens Darksday at 08:00', () => {
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 6, 12)), { open: false, holiday: true, until: at(FIRESDAY + 7, 8) });
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 5, 23)), { open: false, holiday: false, until: at(FIRESDAY + 7, 8) });
});
test('the next opening of an open guild is the following morning', () => {
  assert.equal(V.nextGuildOpening(ALCHEMY, at(FIRESDAY, 9)), at(FIRESDAY + 1, 8));
});
test('every shop has hours inside one day, a real holiday and a named NPC', () => {
  for (const g of V.SHOPS) assert.ok(g.open < g.close && g.close <= 24 && g.holiday >= 0 && g.holiday < 8 && g.npc, `${g.craft} ${g.place}`);
});
test('no NPC is listed for two shops, so each can key its own alarm', () => {
  const names = V.SHOPS.flatMap((g) => g.npc.split(', '));
  assert.equal(new Set(names).size, names.length);
});
test('the Norg Tenshodo opens at 09:00 and closes on Darksday', () => {
  const g = V.SHOPS.find((s) => s.craft === 'Tenshodo' && s.place === 'Norg');
  assert.deepEqual(V.guildStatus(g, at(FIRESDAY, 8)), { open: false, holiday: false, until: at(FIRESDAY, 9) });
  assert.equal(V.guildStatus(g, at(FIRESDAY + 7, 12)).holiday, true);
});

// ---- Calendars and planner ----
test('nextDays filtered to Darksday returns consecutive Darksdays a week apart', () => {
  const days = V.nextDays(at(FIRESDAY, 3), 3, 7);
  assert.deepEqual(days.map((d) => d.dayNumber), [FIRESDAY + 7, FIRESDAY + 15, FIRESDAY + 23]);
});
test('Darksday under a new moon finds whole-day windows that satisfy both', () => {
  const wins = V.findWindows(at(FIRESDAY, 3), { weekdays: [7], phases: [V.NEW] }, 3);
  assert.equal(wins.length, 3);
  for (const w of wins) {
    const c = V.clock(w.start), m = V.moon(w.start);
    assert.deepEqual([c.weekday, c.hour, m.phase, w.end - w.start], [7, 0, V.NEW, V.DAY]);
  }
  assert.ok(wins[0].start < wins[1].start && wins[1].start < wins[2].start);
});
test('an hour range that wraps midnight gives one window from 20:00 to 04:00', () => {
  const [w] = V.findWindows(at(FIRESDAY, 22), { from: 20, to: 4 }, 1);
  assert.deepEqual([w.start, w.end], [at(FIRESDAY, 20), at(FIRESDAY + 1, 4)]);
});
test('a window that began yesterday and is still open is reported from its real start', () => {
  const [w] = V.findWindows(at(FIRESDAY, 2), { from: 20, to: 4 }, 1);
  assert.deepEqual([w.start, w.end], [at(FIRESDAY - 1, 20), at(FIRESDAY, 4)]);
});
test('a full moon already under way is reported from its first day at 90% waxing', () => {
  const [w] = V.findWindows(V.dayStartOf(anchorDay + 1) + 5 * V.HOUR, { phases: [V.FULL] }, 1);
  assert.deepEqual([w.start, w.end], [V.dayStartOf(anchorDay - 4), V.dayStartOf(anchorDay + 3)]);
  assert.deepEqual([V.moon(w.start).percent, V.moon(w.start).direction], [90, 'waxing']);
});
test('weekday, moon and weather cycles all repeat within the planner search span', () => {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a), lcm = (a, b) => (a * b) / gcd(a, b);
  const span = [8, 84, 2160].reduce(lcm);
  assert.equal(span, 15120);
  const [w] = V.findWindows(at(FIRESDAY), { weekdays: [3] }, 1, span);
  assert.ok(w, 'a plain condition is found inside the span');
});
test('conditions that cannot coincide return no windows', () => {
  assert.deepEqual(V.findWindows(at(FIRESDAY), { phases: [V.NEW], minPercent: 50 }, 3), []);
});
test('a moon percent range keeps only days inside it', () => {
  const wins = V.findWindows(at(FIRESDAY), { minPercent: 95 }, 4);
  for (const w of wins) for (let t = w.start; t < w.end; t += V.DAY) assert.ok(V.moon(t).percent >= 95);
});

// ---- Weather ----
// Reference days read straight from LandSandBoat's zone_weather.sql with a separate parser.
V.useWeatherData(createRequire(import.meta.url)('../weather-data.js'));
const VALKURM = 103, QUFIM = 126, CYCLE_START = 2160 * 111; // a day number at the start of a weather cycle
const wx = (zone, day) => { const w = V.weatherOf(zone, day); return [w.normal, w.common, w.rare].map((id) => V.WEATHERS[id]); };
test('Valkurm Dunes starts its cycle with sunshine, dust storms common and rare', () => {
  assert.deepEqual(wx(VALKURM, 0), ['Sunshine', 'Dust Storm', 'Dust Storm']);
  assert.deepEqual(wx(VALKURM, 2), ['Sunshine', 'Sunshine', 'Sunshine']);
});
test('Valkurm Dunes cycle day 17 is usually a dust storm', () => {
  assert.deepEqual(wx(VALKURM, 17), ['Dust Storm', 'Sunshine', 'Sunshine']);
});
test('Qufim Island cycle day 11 brings Stellar Glare only as its rare weather', () => {
  assert.deepEqual(wx(QUFIM, 11), ['Clouds', 'Sunshine', 'Stellar Glare']);
});
test('weather repeats every 2,160 days counted from the epoch', () => {
  for (const d of [0, 17, 2159]) assert.deepEqual(V.weatherOf(VALKURM, d + CYCLE_START), V.weatherOf(VALKURM, d));
  assert.equal(V.weatherOf(9999, 0), null);
});
test('each element has a single weather and a double one', () => {
  assert.deepEqual(V.weatherIdsFor(['earth'], false).map((id) => V.WEATHERS[id]), ['Dust Storm', 'Sand Storm']);
  assert.deepEqual(V.weatherIdsFor(['light', 'dark'], true).map((id) => V.WEATHERS[id]), ['Stellar Glare', 'Darkness']);
  assert.equal(V.weatherIdsFor(['fire', 'ice', 'wind', 'earth', 'lightning', 'water', 'light', 'dark'], false).length, 16);
});
test('the planner finds Valkurm days whose usual weather is a dust storm', () => {
  const wins = V.findWindows(at(CYCLE_START, 3), { zone: VALKURM, weatherElements: ['earth'], weatherChance: 'usual' }, 3);
  assert.deepEqual(wins.map((w) => (w.start - V.dayStartOf(CYCLE_START)) / V.DAY), [17, 24, 60]);
  assert.ok(wins.every((w) => w.end - w.start === V.DAY));
});
test('with any chance, a day where dust storms are only common counts too', () => {
  const [w] = V.findWindows(at(CYCLE_START, 3), { zone: VALKURM, weatherElements: ['earth'] }, 1);
  assert.equal(w.start, V.dayStartOf(CYCLE_START));
});
test('a weather condition without a zone is ignored rather than matching nothing', () => {
  const [w] = V.findWindows(at(FIRESDAY, 3), { weekdays: [7], weatherElements: ['earth'] }, 1);
  assert.equal(V.clock(w.start).weekday, 7);
});

// ---- Weather finder ----
const DUST_STORM = 8, GALES = 11;
const names = (g) => g.zones.map((z) => z.name);
test('a weather in the usual slot ranks above common, and common above rare', () => {
  const w = { normal: 8, common: 10, rare: 11 };
  assert.deepEqual([[8], [10], [11], [6], [11, 10]].map((ids) => V.weatherTier(w, ids)), [0, 1, 2, -1, 1]);
});
test('zone groups cover every weather zone exactly once', () => {
  const ids = V.weatherGroups().flatMap((g) => g.zones.map((z) => z.id));
  assert.equal(ids.length, V.weatherZones().length);
  assert.equal(new Set(ids).size, ids.length);
});
test('Valkurm Dunes has dust storms usual on 120 days of the cycle and common on 638 (counted from the SQL)', () => {
  const row = V.weatherOdds([DUST_STORM]).find((r) => r.group.zones.some((z) => z.id === VALKURM));
  assert.deepEqual(row.counts, [120, 638, 0]);
});
test('Gales ranks the Cloister of Gales first, always on, then both Riverne sites', () => {
  const [first, second, ...rest] = V.weatherOdds([GALES]);
  assert.deepEqual([names(first.group), first.counts, first.group.fixed], [['Cloister of Gales'], [2160, 0, 0], true]);
  assert.deepEqual([names(second.group).sort(), second.counts], [['Riverne - Site #A01', 'Riverne - Site #B01'], [214, 0, 119]]);
  assert.equal([first, second, ...rest].reduce((n, r) => n + r.group.zones.length, 0), 7);
});
test('the finder lists a fixed zone once, as always, ahead of everything else', () => {
  const found = V.findWeather(at(CYCLE_START, 3), [GALES], 16);
  assert.equal(found.filter((f) => f.always).length, 1);
  assert.deepEqual([found[0].always, names(found[0].group)], [true, ['Cloister of Gales']]);
});
test('the finder puts Valkurm dust storms in the usual slot on cycle day 17, after the common ones from day 0', () => {
  const found = V.findWeather(at(CYCLE_START, 3), [DUST_STORM], 32).filter((f) => f.group.zones[0].id === VALKURM);
  const usual = found.find((f) => f.tier === 0), common = found.find((f) => f.tier === 1);
  assert.equal(usual.start, V.dayStartOf(CYCLE_START + 17));
  assert.equal(common.start, V.dayStartOf(CYCLE_START));
});
test('Blizzards ranks Uleguerand and Bearclaw (more usual days) above Ranguemont Pass (more rare days)', () => {
  // Counted from the SQL: Uleguerand Range and Bearclaw Pinnacle 1065 usual / 916 rare, Ranguemont Pass 789 / 1239.
  const rows = V.weatherOdds([13]).filter((r) => !r.group.fixed);
  const upper = rows.findIndex((r) => names(r.group).includes('Uleguerand Range')), pass = rows.findIndex((r) => names(r.group).includes('Ranguemont Pass'));
  assert.deepEqual([rows[upper].counts, rows[pass].counts], [[1065, 0, 916], [789, 0, 1239]]);
  assert.ok(upper < pass, `Uleguerand at ${upper}, Ranguemont at ${pass}`);
});
test('always-on zones come before a usual stretch that began earlier the same day', () => {
  const found = V.findWeather(at(CYCLE_START + 15, 12), [19], 8);
  const lastAlways = found.map((f) => f.always).lastIndexOf(true), firstOther = found.findIndex((f) => !f.always);
  assert.ok(found[firstOther].tier === 0 && found[firstOther].start < at(CYCLE_START + 15, 12), 'a usual stretch is already under way');
  assert.ok(lastAlways < firstOther);
});
test('finder results are sorted by slot, then soonest first', () => {
  const found = V.findWeather(at(CYCLE_START, 3), [DUST_STORM, 9], 32).filter((f) => !f.always);
  for (let i = 1; i < found.length; i++) {
    const a = found[i - 1], b = found[i];
    assert.ok(a.tier < b.tier || (a.tier === b.tier && a.start <= b.start), `row ${i} out of order`);
  }
});
test('consecutive days in the same slot merge into one stretch', () => {
  const found = V.findWeather(at(CYCLE_START, 3), [DUST_STORM], 64).filter((f) => f.group.zones[0].id === VALKURM);
  for (const f of found) for (let n = V.clock(f.start).dayNumber; n < V.clock(f.end - 1).dayNumber + 1; n++) {
    assert.equal(V.weatherTier(V.weatherOf(VALKURM, n), [DUST_STORM]), f.tier);
  }
  const sorted = [...found].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].end < sorted[i].start || sorted[i - 1].tier !== sorted[i].tier);
});

// ---- Morning fog ----
// City types read from each zone's data/zones/<name>/zone.yaml in LandSandBoat (commit ed34371).
const CITIES = ['Aht Urhgan Whitegate', 'Al Zahbi', 'Bastok Markets', 'Bastok Markets [S]', 'Bastok Mines', "Chateau d'Oraguille",
  'Heavens Tower', 'Kazham', 'Lower Jeuno', 'Metalworks', 'Mhaura', 'Norg', "Northern San d'Oria", 'Port Bastok', 'Port Jeuno',
  "Port San d'Oria", 'Port Windurst', 'Rabao', "Ru'Lude Gardens", "Sealion's Den", 'Selbina', "Southern San d'Oria",
  "Southern San d'Oria [S]", 'Tavnazian Safehold', 'The Colosseum', 'Upper Jeuno', 'Windurst Walls', 'Windurst Waters',
  'Windurst Waters [S]', 'Windurst Woods'];
test('the 30 zones LandSandBoat types as cities are the ones flagged as cities', () => {
  assert.deepEqual(V.weatherZones().filter((z) => V.isCity(z.id)).map((z) => z.name).sort(), [...CITIES].sort());
});
test('morning fog is in every zone outside the cities except those fixed on an elemental weather', () => {
  const zones = V.weatherZones(), fog = zones.filter((z) => V.hasMorningFog(z.id));
  assert.equal(fog.length, zones.length - CITIES.length - zones.filter((z) => z.fixed).length);
  assert.deepEqual([VALKURM, QUFIM].map(V.hasMorningFog), [true, true]);
  const cloister = zones.find((z) => z.name === 'Cloister of Gales'), jeuno = zones.find((z) => z.name === 'Port Jeuno');
  assert.deepEqual([V.hasMorningFog(cloister.id), V.hasMorningFog(jeuno.id), V.hasMorningFog(9999)], [false, false, false]);
  assert.deepEqual([V.WEATHERS[V.FOG], V.FOG_FROM, V.FOG_TO], ['Fog', 2, 7]);
});

// ---- Converter ----
test('fromVana is the inverse of clock', () => {
  assert.equal(V.fromVana(886, 1, 1), V.EPOCH);
  assert.equal(V.fromVana(898, 2, 1), Date.UTC(2002, 5, 23, 15));
  for (const t of [V.EPOCH + 123456789, Date.UTC(2026, 9, 22, 11, 35, 34), at(FIRESDAY, 13, 47)]) {
    const c = V.clock(t), back = V.fromVana(c.year, c.month, c.date, c.hour, c.minute, c.second);
    assert.ok(t - back >= 0 && t - back < V.SEC, `${t} came back as ${back}`);
  }
});

// ---- Calendar files ----
const ICS_EVENT = { uid: 'moon-4-1@ffxi-timer', start: Date.UTC(2026, 9, 22, 11, 35, 34), end: Date.UTC(2026, 9, 22, 12, 33, 10), summary: 'FFXI Full Moon', description: '90% to 95%, Lightsday; then Darksday', alarmMinutes: 3 };
test('a calendar file has CRLF lines, UTC times, escaped text and a reminder', () => {
  const ics = V.icsCalendar([ICS_EVENT], Date.UTC(2026, 9, 22, 0, 0, 0));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line break is CRLF');
  for (const line of ['DTSTAMP:20261022T000000Z', 'DTSTART:20261022T113534Z', 'DTEND:20261022T123310Z', 'UID:moon-4-1@ffxi-timer',
    'DESCRIPTION:90% to 95%\\, Lightsday\\; then Darksday', 'TRIGGER:-PT3M']) assert.ok(ics.includes(`\r\n${line}\r\n`), line);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);
});
test('long calendar lines fold at 75 octets, counting multi-byte characters', () => {
  const ics = V.icsCalendar([{ ...ICS_EVENT, description: `${'x'.repeat(100)} ${'é'.repeat(60)} ${"Vana'diel → ".repeat(10)}` }], 0);
  const lines = ics.split('\r\n');
  assert.ok(lines.every((l) => Buffer.byteLength(l, 'utf8') <= 75), 'no line is over 75 octets');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`DESCRIPTION:${'x'.repeat(100)} ${'é'.repeat(60)} `), 'folding loses nothing');
});

// ---- User-facing copy agrees with the data ----
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const count = (group) => V.ROUTES.filter((r) => r.group === group).length;
test('the About dialog counts match the route and guild data', () => {
  assert.match(html, new RegExp(`All ${count('airship')} airships`));
  assert.match(html, new RegExp(`the ${count('ferry')} Selbina, Mhaura, Whitegate and Nashmau boats`));
  assert.match(html, new RegExp(`${V.GUILDS.length} guild shops and ${V.SHOPS.length - V.GUILDS.length} other shops`));
  assert.match(html, new RegExp(`weather forecast for ${V.weatherZones().length} zones`));
});
test('the About dialog example departure is what the data gives', () => {
  const [first] = V.departureMinutes(ROUTE['jeuno-sandoria']);
  assert.equal(`${String(Math.floor(first / 60)).padStart(2, '0')}:${String(first % 60).padStart(2, '0')}`, '01:14');
  assert.match(html, /shows 01:14 rather than 01:10/);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
