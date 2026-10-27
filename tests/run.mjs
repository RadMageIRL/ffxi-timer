// Tests for vana.js. Run with `node tests/run.mjs`; no dependencies.
// Reference values come from sources independent of this code: the server's epoch, the anchors
// in Pyogenes' timer, BG Wiki's moon table and the in-game ferry timekeeper schedules.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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

// ---- Trips ----
const TRIP_T = Date.UTC(2026, 9, 22, 11, 35, 34);
const legIds = (trip) => trip.legs.map((l) => l.route.id);
test('Port Bastok to Kazham changes airships in Port Jeuno, with time to change docks', () => {
  const [trip] = V.findTrips('Port Bastok', 'Kazham', TRIP_T, 1, 60000);
  assert.deepEqual(legIds(trip), ['bastok-jeuno', 'jeuno-kazham']);
  const [a, b] = trip.legs;
  assert.ok(b.departs >= a.lands + 60000, 'the second airship leaves at least a minute after the first lands');
  assert.equal(b.departs, V.nextDeparture(ROUTE['jeuno-kazham'], a.lands + 60000), 'and it is the first one that does');
  assert.deepEqual([trip.departs, trip.lands], [a.departs, b.lands]);
});
test('Selbina to Nashmau takes three boats through Mhaura and Whitegate', () => {
  const [trip] = V.findTrips('Selbina', 'Nashmau', TRIP_T, 1);
  assert.deepEqual(legIds(trip), ['selbina-mhaura', 'mhaura-whitegate', 'whitegate-nashmau']);
});
test('North Landing to South Landing goes by way of Central Landing', () => {
  const [trip] = V.findTrips('North Landing', 'South Landing', TRIP_T, 1);
  assert.deepEqual(legIds(trip), ['barge-north-central', 'barge-central-south-night']);
});
test('a direct run is one leg, and trips come in departure order', () => {
  const trips = V.findTrips('Port Jeuno', "Port San d'Oria", TRIP_T, 4);
  assert.equal(trips.length, 4);
  assert.ok(trips.every((t) => legIds(t).join() === 'jeuno-sandoria'));
  for (let i = 1; i < trips.length; i++) assert.equal(trips[i].departs - trips[i - 1].departs, ROUTE['jeuno-sandoria'].everyMs);
});
test('a boarding run counts: the trip leaves when its door shuts', () => {
  const r = ROUTE['jeuno-kazham'], open = V.EPOCH + 1000 * V.DAY + r.openAt;
  const [trip] = V.findTrips('Port Jeuno', 'Kazham', open + 1000, 1);
  assert.equal(trip.departs, open + r.dockedMs);
});
test('no trip leaves earlier than another yet lands no sooner', () => {
  for (const [from, to] of [['Port Bastok', 'Kazham'], ['Selbina', 'Nashmau'], ['Kazham', "Port San d'Oria"], ['Central Landing', 'North Landing']]) {
    const trips = V.findTrips(from, to, TRIP_T, 6);
    assert.equal(trips.length, 6, `${from} to ${to}`);
    for (let i = 1; i < trips.length; i++) assert.ok(trips[i].departs > trips[i - 1].departs && trips[i].lands > trips[i - 1].lands, `${from} to ${to} #${i}`);
  }
});
test('ports with no boat between them have no trip, and each network reaches only itself', () => {
  assert.deepEqual(V.findTrips('Selbina', 'Port Jeuno', TRIP_T, 3), []);
  assert.deepEqual(V.portsFrom('Selbina'), ['Mhaura', 'Aht Urhgan Whitegate', 'Nashmau']);
  assert.deepEqual(V.portsFrom('Port Bastok'), ['Port Jeuno', "Port San d'Oria", 'Port Windurst', 'Kazham']);
  assert.deepEqual(V.portsFrom('Bibiki Bay'), ['Purgonorgo Isle']);
  assert.equal(V.PORTS.length, 14);
  assert.ok(!V.PORTS.some((p) => p.includes('tour')));
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
test('with guild holidays on, the Bastok alchemy guild is closed all Lightsday and reopens Darksday at 08:00', () => {
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 6, 12), true), { open: false, holiday: true, until: at(FIRESDAY + 7, 8) });
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 5, 23), true), { open: false, holiday: false, until: at(FIRESDAY + 7, 8) });
});
// Retail dropped guild holidays in the June 2014 version update, and LandSandBoat's GUILD_SHOP_HOLIDAYS is off by default.
test('without guild holidays, the Bastok alchemy guild opens on Lightsday like any other day', () => {
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 6, 12)), { open: true, holiday: false, until: at(FIRESDAY + 6, 23) });
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 5, 23)), { open: false, holiday: false, until: at(FIRESDAY + 6, 8) });
  assert.deepEqual(V.guildStatus(ALCHEMY, at(FIRESDAY + 6, 7), false), { open: false, holiday: false, until: at(FIRESDAY + 6, 8) });
});
test('the next opening of an open guild is the following morning, skipping the holiday only when holidays are on', () => {
  assert.equal(V.nextGuildOpening(ALCHEMY, at(FIRESDAY, 9)), at(FIRESDAY + 1, 8));
  assert.equal(V.nextGuildOpening(ALCHEMY, at(FIRESDAY + 5, 9)), at(FIRESDAY + 6, 8));
  assert.equal(V.nextGuildOpening(ALCHEMY, at(FIRESDAY + 5, 9), true), at(FIRESDAY + 7, 8));
});
test('every shop has hours inside one day, a real holiday and a named NPC', () => {
  for (const g of V.SHOPS) assert.ok(g.open < g.close && g.close <= 24 && g.holiday >= 0 && g.holiday < 8 && g.npc, `${g.craft} ${g.place}`);
});
test('no NPC is listed for two shops, so each can key its own alarm', () => {
  const names = V.SHOPS.flatMap((g) => g.npc.split(', '));
  assert.equal(new Set(names).size, names.length);
});
test('the Norg Tenshodo opens at 09:00, and closes on Darksday only with holidays on', () => {
  const g = V.SHOPS.find((s) => s.craft === 'Tenshodo' && s.place === 'Norg');
  assert.deepEqual(V.guildStatus(g, at(FIRESDAY, 8)), { open: false, holiday: false, until: at(FIRESDAY, 9) });
  assert.equal(V.guildStatus(g, at(FIRESDAY + 7, 12), true).holiday, true);
  assert.equal(V.guildStatus(g, at(FIRESDAY + 7, 12)).open, true);
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
test('a list of hour spans finds each span, and spans that meet across midnight merge', () => {
  const wins = V.findWindows(at(FIRESDAY, 2, 30), { hours: [[9, 10], [3, 4], [21, 22], [15, 16]] }, 4);
  assert.deepEqual(wins.map((w) => [V.clock(w.start).hour, (w.end - w.start) / V.HOUR]), [[3, 1], [9, 1], [15, 1], [21, 1]]);
  const [night] = V.findWindows(at(FIRESDAY, 12), { hours: [[0, 5], [17, 24]] }, 1);
  assert.deepEqual([night.start, night.end], [at(FIRESDAY, 17), at(FIRESDAY + 1, 5)]);
});
test('exact weathers match only those weathers: Sand Storm without Dust Storm', () => {
  const ids = (w) => [w.normal, w.common, w.rare];
  const sand = V.findWindows(at(CYCLE_START), { zone: VALKURM, weatherIds: [9] }, 3), dust = V.findWindows(at(CYCLE_START), { zone: VALKURM, weatherIds: [8] }, 1);
  for (const w of sand) assert.ok(ids(V.weatherOf(VALKURM, V.clock(w.start).dayNumber)).includes(9));
  assert.equal(dust[0].start, V.dayStartOf(CYCLE_START), 'Valkurm has dust storms on cycle day 0');
  assert.ok(!sand.length || sand[0].start > dust[0].start);
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
test('Jugner Forest [S] has the weather of La Vaule [S], not Vunkerl Inlet [S]', () => {
  const groupOf = (id) => V.weatherGroups().find((g) => g.zones.some((z) => z.id === id));
  assert.equal(groupOf(82), groupOf(85));
  assert.notEqual(groupOf(82), groupOf(83));
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

// ---- Fishing ----
V.useFishingData(createRequire(import.meta.url)('../fishing-data.js'));
const fishNamed = (name) => V.fishList().find((f) => f.name === name);
test("the fishing moon index follows LandSandBoat's GetMoonPhase ranges", () => {
  assert.deepEqual([[0, 'peak'], [5, 'waxing'], [10, 'waning'], [7, 'waxing'], [38, 'waxing'], [40, 'waxing'], [55, 'waxing'], [57, 'waxing'],
    [88, 'waxing'], [90, 'waxing'], [100, 'peak'], [95, 'waning'], [93, 'waning'], [62, 'waning'], [60, 'waning'], [45, 'waning'], [42, 'waning'], [12, 'waning']]
    .map(([p, d]) => V.fishingMoon(p, d)), [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7]);
});
test('the fishing moon index for every percent, waxing, waning and at a peak', () => {
  // One digit per percent from 0 to 100.
  const scale = {
    waxing: '00000001111111111111111111111111111111102222222222222222033333333333333333333333333333333044444444444',
    waning: '00000000000077777777777777777777777777777770066666666666666660555555555555555555555555555555550444444',
    peak: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000444444',
  };
  for (const [direction, digits] of Object.entries(scale)) {
    assert.equal(Array.from({ length: 101 }, (_, p) => V.fishingMoon(p, direction)).join(''), digits, direction);
  }
});
test('43% waning falls in a gap of those ranges and counts as New Moon, the only gap the moon reaches', () => {
  assert.equal(V.fishingMoon(43, 'waning'), 0);
  const gaps = [];
  for (let d = 0; d < 84; d++) {
    const m = moonAfter(d), i = V.fishingMoon(m.percent, m.direction);
    if (i === 0 && m.phase !== V.NEW) gaps.push(`${m.percent}% ${m.direction}`);
  }
  assert.deepEqual(gaps, ['43% waning']);
});
test('the best fishing moon days are exactly the Waxing Gibbous and Full Moon days, so the planner can search them', () => {
  for (let d = 0; d < 84; d++) {
    const m = moonAfter(d);
    assert.equal(V.FISH_MOON[V.fishingMoonOfDay(anchorDay + d)] === V.FISH_MOON_BEST, m.phase === 3 || m.phase === V.FULL, `cycle day ${d}`);
  }
});
test("the moon weights are LandSandBoat's floor(25 or 15 * MOONPATTERN_4)", () => {
  const pattern = (x) => Math.min(1, Math.max(0, 0.5 * Math.cos(0.9 * x + 3.14) + 0.5));
  assert.deepEqual(V.FISH_MOON, [0, 1, 2, 3, 4, 5, 6, 7].map((x) => Math.floor(25 * pattern(x))));
  assert.deepEqual(V.FISH_MOON_CITY, [0, 1, 2, 3, 4, 5, 6, 7].map((x) => Math.floor(15 * pattern(x))));
  assert.deepEqual(V.FISH_WEATHER, { 6: 1.1, 7: 1.2 });
  assert.deepEqual([V.WEATHERS[6], V.WEATHERS[7]], ['Rain', 'Squall']);
});
test('the best fishing moons from the full moon peak run from 90% waxing to 95% waning, then Waxing Gibbous next cycle', () => {
  const [now, next] = V.bestFishingMoons(V.dayStartOf(anchorDay) + 5 * V.HOUR, 2);
  // Waxing Gibbous starts at 57% (cycle day 66 from the new moon side), Full Moon ends after 95% waning.
  assert.deepEqual([V.moon(now.start).percent, V.moon(now.start).direction, V.moon(now.end - 1).percent, V.moon(now.end - 1).direction], [57, 'waxing', 95, 'waning']);
  assert.equal(next.start - now.start, 84 * V.DAY);
  const after = V.bestFishingMoons(V.dayStartOf(anchorDay + 3), 1)[0];
  assert.equal(after.start, next.start, 'the day after a stretch ends, the next one is reported, not the old one');
});
// Reference values read from LandSandBoat's fishing SQL with grep, apart from the build tool.
test('Moat Carp bites in 44 fishing spots, best on Ball of Insect Paste', () => {
  const carp = fishNamed('Moat Carp');
  assert.deepEqual([carp.skill, carp.large, carp.rarity, carp.legendary, carp.keyItem], [11, false, 1000, false, '']);
  assert.deepEqual(carp.baits.map((b) => [b.name, b.power, b.type]), [['Ball of Insect Paste', 3, 0], ['Little Worm', 2, 0], ['Robber Rig', 1, 1]]);
  assert.equal(V.fishSpots(carp.id).length, 44);
});
test('Gugrusaurus is a skill 140 legendary that needs the Serpent Rumors key item', () => {
  const g = fishNamed('Gugrusaurus');
  assert.deepEqual([g.id, g.skill, g.large, g.rarity, g.legendary, g.keyItem], [5127, 140, true, 350, true, 'Serpent Rumors']);
});
test('the fish list has only catchable fish: no debris, nothing disabled, nothing without a bait', () => {
  const fish = V.fishList();
  assert.equal(fish.length, 100);
  assert.ok(!fish.some((f) => ['Rusty Bucket', 'Abaia', 'Bibiki Urchin'].includes(f.name)));
  assert.ok(fish.every((f) => f.baits.length && V.fishSpots(f.id).length));
});
test('the nine harder fishing zones carry their difficulty', () => {
  const zones = new Map(V.fishList().flatMap((f) => V.fishSpots(f.id)).filter((s) => s.difficulty).map((s) => [s.zone, s.difficulty]));
  assert.deepEqual(Object.fromEntries([...zones].sort()), { 'Cape Teriggan': 5, Davoi: 2, "Dragon's Aery": 2, 'Kuftal Tunnel': 5, 'Oldton Movalpolos': 2,
    'Quicksand Caves': 2, 'Talacca Cove': 3, 'The Boyahda Tree': 5, 'Zeruhn Mines': 3 });
});

// ---- Notorious monsters ----
V.useNmData(createRequire(import.meta.url)('../nm-data.js'));
const nmNamed = (name) => V.nmList().find((n) => n.name === name);
// A citation is a file, a line and a fingerprint of that line; the line itself is not copied.
const citation = (s) => Object.keys(s).join() === 'file,line,sha' && s.file && s.line > 0 && /^[0-9a-f]{12}$/.test(s.sha);
test('every NM cites its source and names only moons and weathers the page knows', () => {
  for (const nm of V.nmList()) {
    assert.ok(nm.sources.length && nm.sources.every(citation), nm.name);
    for (const m of nm.moon || []) assert.ok(m in V.MOON_CYCLE_PHASE, `${nm.name}: ${m}`);
    for (const id of nm.weather || []) assert.ok(V.WEATHERS[id], `${nm.name}: weather ${id}`);
    for (const [a, b] of nm.hours || []) assert.ok(a >= 0 && b <= 24 && a < b, `${nm.name}: hours ${a}-${b}`);
  }
});
test('an NM that names half a crescent or gibbous names the other half too, so whole phases are right', () => {
  const pairs = [['LESSER_WAXING_CRESCENT', 'GREATER_WAXING_CRESCENT'], ['LESSER_WAXING_GIBBOUS', 'GREATER_WAXING_GIBBOUS'], ['GREATER_WANING_GIBBOUS', 'LESSER_WANING_GIBBOUS'], ['GREATER_WANING_CRESCENT', 'LESSER_WANING_CRESCENT']];
  for (const nm of V.nmList()) for (const [a, b] of pairs) assert.equal((nm.moon || []).includes(a), (nm.moon || []).includes(b), nm.name);
});
test('every NM with a weather condition is in a zone the forecast covers', () => {
  const zones = new Set(V.weatherZones().map((z) => z.id));
  for (const nm of V.nmList().filter((n) => n.weather)) assert.ok(zones.has(nm.zoneId), `${nm.name} in ${nm.zone}`);
});
test('fog NMs live outside cities in zones that never roll Fog themselves, so only the morning fog counts', () => {
  const fogNms = V.nmList().filter(V.isFogOnly);
  assert.deepEqual(fogNms.map((n) => n.name).sort(), ['Baumesel', 'Odqan']);
  for (const nm of fogNms) {
    assert.ok(!V.isCity(nm.zoneId) && !nm.hours, nm.name);
    for (let d = 0; d < 2160; d++) { const w = V.weatherOf(nm.zoneId, d); assert.ok(![w.normal, w.common, w.rare].includes(V.FOG), `${nm.name} day ${d}`); }
    for (const w of V.findWindows(at(CYCLE_START), V.nmQuery(nm), 5)) assert.ok(V.clock(w.start).hour >= 2 && V.clock(w.end - 1).hour < 7, nm.name);
  }
});
test('Haty can only appear under a full moon between 17:00 and 05:00', () => {
  const wins = V.findWindows(at(FIRESDAY), V.nmQuery(nmNamed('Haty')), 6);
  assert.ok(wins.length === 6);
  for (const w of wins) {
    for (let t = w.start; t < w.end; t += V.HOUR) {
      const c = V.clock(t);
      assert.ok((c.hour >= 17 || c.hour < 5) && V.moon(t).phase === V.FULL, `${c.hour}:00 ${V.moon(t).percent}%`);
    }
  }
});
test('Silk Caterpillar gets four one-hour chances a day, at 03:00, 09:00, 15:00 and 21:00', () => {
  const wins = V.findWindows(at(FIRESDAY), V.nmQuery(nmNamed('Silk Caterpillar')), 4);
  assert.deepEqual(wins.map((w) => [V.clock(w.start).hour, (w.end - w.start) / V.HOUR]), [[3, 1], [9, 1], [15, 1], [21, 1]]);
});
test('King Vinegarroon waits for Dust Storm or Sand Storm in Western Altepa Desert', () => {
  const nm = nmNamed('King Vinegarroon'), q = V.nmQuery(nm);
  assert.deepEqual([nm.zone, q.weatherIds, q.hours], ['Western Altepa Desert', [8, 9], null]);
  for (const w of V.findWindows(at(CYCLE_START), q, 5)) assert.ok(V.weatherTier(V.weatherOf(nm.zoneId, V.clock(w.start).dayNumber), [8, 9]) >= 0);
});
test("Agas's moon list is every moon but New Moon", () => {
  assert.deepEqual(V.nmQuery(nmNamed('Agas')).phases, [1, 2, 3, 4, 5, 6, 7]);
});

// ---- Personal timers ----
const kind = (id) => V.TIMER_KINDS.find((k) => k.id === id);
test("timer waits are LandSandBoat's defaults: ENM key items 120 hours, an Assault tag 24", () => {
  // settings/default/main.lua ENM_COOLDOWN = 120; assault/npc_handler.lua 86400 seconds a tag.
  assert.deepEqual([kind('enm').hours, kind('assault').hours], [120, 24]);
  assert.equal(V.timerReady('hours', Date.UTC(2026, 9, 22, 12), 120), Date.UTC(2026, 9, 27, 12));
});
test('Dynamis entered at any time on a JST day opens again at the next JP midnight', () => {
  // 2026-10-22 14:59 UTC is 23:59 JST; one minute later is the next JST day.
  assert.equal(V.timerReady(kind('dynamis').rule, Date.UTC(2026, 9, 22, 14, 59)), Date.UTC(2026, 9, 22, 15));
  assert.equal(V.timerReady(kind('dynamis').rule, Date.UTC(2026, 9, 22, 15)), Date.UTC(2026, 9, 23, 15));
});
test('Vana\'diel day timers end at the next Vana\'diel midnight, tally timers at the next conquest tally', () => {
  assert.equal(V.timerReady('vana', at(FIRESDAY, 23, 59)), V.dayStartOf(FIRESDAY + 1));
  assert.equal(V.timerReady('vana', at(FIRESDAY)), V.dayStartOf(FIRESDAY + 1));
  assert.equal(V.timerReady('tally', Date.UTC(2026, 9, 21, 12)), Date.UTC(2026, 9, 25, 15));
  for (const k of V.TIMER_KINDS) assert.ok(['hours', 'jp', 'vana', 'tally'].includes(k.rule) && (k.rule !== 'hours' || k.id === 'custom' || k.hours > 0), k.id);
});

// ---- Elemental magic ----
test('each element is opposed by the element whose day the clock calls its day penalty', () => {
  for (const e of Object.keys(V.OPPOSED)) {
    const penaltyDay = V.DAYS.findIndex((d) => V.dayEffect(e, V.DAYS.indexOf(d)) === -10);
    assert.equal(V.DAYS[penaltyDay].weak, e, e);
    assert.equal(V.DAYS[V.DAYS.findIndex((d) => d.element === e)].element, e);
  }
  assert.deepEqual(V.OPPOSED, { fire: 'water', ice: 'fire', wind: 'ice', earth: 'wind', lightning: 'earth', water: 'lightning', light: 'dark', dark: 'light' });
});
test('weather adds 10% single and 25% double for its element, and takes the same off the opposed element', () => {
  assert.deepEqual([4, 5, 6, 7, 0, 3, 10].map((id) => V.weatherEffect('fire', id)), [10, 25, -10, -25, 0, 0, 0]);
  assert.deepEqual([16, 17, 18, 19].map((id) => V.weatherEffect('dark', id)), [-10, -25, 10, 25]);
});
test('a day in a zone sums the day and the best and worst weather slot, capped at +40%', () => {
  // Valkurm Dunes cycle day 17: Dust Storm usual, Sunshine common and rare. Day number CYCLE_START + 17 is weekday 1, Earthsday.
  const n = CYCLE_START + 17;
  assert.equal(V.mod(n, 8), 1);
  const d = V.magicDay('earth', VALKURM, n);
  assert.deepEqual([d.day, d.slots.map((s) => s.effect), d.best, d.worst], [10, [10, 0, 0], 20, 10]);
  // Earth is lightning's opposed element: Earthsday and Dust Storm both count against lightning.
  assert.deepEqual([V.magicDay('lightning', VALKURM, n).best, V.magicDay('lightning', VALKURM, n).worst], [-10, -20]);
  assert.deepEqual([V.magicDay('wind', VALKURM, n).best, V.magicDay('wind', VALKURM, n).worst], [0, 0]);
  assert.equal(V.MAGIC_CAP, 40);
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

// ---- Saved data ----
// store.js checks saved settings and alarms before the page uses them. Valid data must come back as it
// went in; damage is repaired or dropped one field or record at a time; a repaired copy checks clean.
const S = createRequire(import.meta.url)('../store.js');
const CTX = S.context(V);
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v0.8-storage.json', import.meta.url), 'utf8'));
const checkS = (raw) => S.checkSettings(raw, CTX);
const checkA = (raw, settings = checkS(undefined).value) => S.checkAlarms(raw, CTX, settings);
const fromText = (text) => checkS(S.parse(text));
const T0 = Date.UTC(2026, 9, 22, 12);
const timer = (over = {}) => ({ id: 'a1', kind: 'enm', label: 'Monarch Linn', start: T0, ...over });
// Checking what a check returned finds nothing more to repair, so a reload doesn't repair it again.
function assertStable(result, alarms) {
  const again = alarms ? checkA(result.value, alarms) : checkS(result.value);
  assert.deepEqual(again.notes, []);
  assert.deepEqual(again.value, result.value);
}

test('saved settings from v0.8 come back unchanged, with guild holidays off, Retail picked and the news bar closed', () => {
  const r = checkS(FIXTURE.settings);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.value, { ...FIXTURE.settings, guildHolidays: false, server: 'retail', newsOpen: false });
  assert.equal(Object.keys(FIXTURE.settings).length, 30);
});
test('saved alarms from v0.8, one of every kind, come back unchanged', () => {
  const settings = checkS(FIXTURE.settings).value, r = checkA(FIXTURE.alarms, settings);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.value, FIXTURE.alarms);
  assert.deepEqual([...new Set(r.value.map((a) => a.kind))].sort(), [...S.ALARM_KINDS].sort());
});
test('an alarm saved before the per-alarm Discord switch keeps having no switch, which means on', () => {
  const r = checkA([{ kind: 'jp', ref: '', lead: 3, on: true }]);
  assert.deepEqual(r.notes, []);
  assert.equal('discord' in r.value[0], false);
});
test('nothing saved gives the defaults with nothing to report, and the defaults are not shared', () => {
  const r = checkS(undefined);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.value, S.DEFAULTS);
  r.value.starred.push('jeuno-sandoria');
  r.value.planner.weekdays.push(1);
  assert.deepEqual(S.DEFAULTS.starred, []);
  assert.deepEqual(S.DEFAULTS.planner.weekdays, []);
  assert.deepEqual(checkA(undefined), { value: [], notes: [] });
});
test('a missing field takes its default without counting as a repair', () => {
  const r = checkS({ sound: false, starred: ['jeuno-kazham'] });
  assert.deepEqual(r.notes, []);
  assert.equal(r.value.sound, false);
  assert.deepEqual(r.value.starred, ['jeuno-kazham']);
  assert.equal(r.value.wxZone, S.DEFAULTS.wxZone);
});

// The 15 corrupted-storage cases the v1.0 audit's browser run found (10 of them blanked the page).
const CORRUPT = [
  ['settings that are not JSON', () => fromText('{not json'), (v) => assert.deepEqual(v, S.DEFAULTS)],
  ['settings saved as null', () => fromText('null'), (v) => assert.deepEqual(v, S.DEFAULTS)],
  ['settings saved as an array', () => fromText('[1,2]'), (v) => assert.deepEqual(v, S.DEFAULTS)],
  ['starred routes set to null', () => checkS({ starred: null, sound: false }), (v) => { assert.deepEqual(v.starred, []); assert.equal(v.sound, false); }],
  ['timers saved as a string', () => checkS({ timers: 'x' }), (v) => assert.deepEqual(v.timers, [])],
  ['NM kill times set to null', () => checkS({ nmKills: null }), (v) => assert.deepEqual(v.nmKills, {})],
  ['a saved search that is null', () => checkS({ savedPlans: [null, { ...S.EMPTY_QUERY, phases: [4] }] }), (v) => assert.deepEqual(v.savedPlans, [{ ...S.EMPTY_QUERY, phases: [4] }])],
  ['planner weekdays set to null', () => checkS({ planner: { ...S.EMPTY_QUERY, weekdays: null, phases: [0] } }), (v) => { assert.deepEqual(v.planner.weekdays, []); assert.deepEqual(v.planner.phases, [0]); }],
  ['zone, fish and port ids that do not exist', () => checkS({ wxZone: 'abc', magicZone: -1, fishId: 'x', tripFrom: 'Nowhere' }),
    (v) => assert.deepEqual([v.wxZone, v.magicZone, v.fishId, v.tripFrom], [S.DEFAULTS.wxZone, S.DEFAULTS.magicZone, S.DEFAULTS.fishId, S.DEFAULTS.tripFrom])],
  ['starred zones saved as a number', () => checkS({ starredZones: 5 }), (v) => assert.deepEqual(v.starredZones, [])],
  ['alarms saved as an object', () => checkA({}), (v) => assert.deepEqual(v, []), true],
  ['an alarm of kind constructor', () => checkA([{ kind: 'constructor', ref: '' }, { kind: 'jp', ref: '', lead: 3, on: true }]), (v) => assert.deepEqual(v.map((a) => a.kind), ['jp']), true],
  ['an alarm with no warning time', () => checkA([{ kind: 'route', ref: 'jeuno-sandoria', on: true }]), (v) => assert.equal(v[0].lead, S.DEFAULTS.lead), true],
  ['a timer of a kind this version does not have', () => checkS({ timers: [timer({ id: 'z', kind: 'zzz' }), timer()] }), (v) => assert.deepEqual(v.timers, [timer()])],
  ['a theme that is not one of the four', () => ({ value: S.checkTheme('"><script>'), notes: ['theme'] }), (v) => assert.equal(v, 'system'), 'theme'],
];
for (const [name, run, expect, kind] of CORRUPT) {
  test(`corrupted storage, ${name}: repaired, reported, and clean when checked again`, () => {
    const r = run();
    expect(r.value);
    assert.ok(r.notes.length > 0, 'the repair is reported');
    if (kind !== 'theme') assertStable(r, kind ? checkS(undefined).value : undefined);
  });
}

test('one bad timer is dropped and the good ones are kept as they were', () => {
  const good = [timer(), timer({ id: 'c', kind: 'custom', hours: 30, label: '' }), timer({ id: 'd', kind: 'dynamis', label: '' })];
  const r = checkS({ timers: [good[0], { id: 'x', kind: 'zzz', start: T0 }, good[1], timer({ id: 'a1', label: 'repeat of a1' }), timer({ id: 'h', kind: 'custom', hours: 1e12 }),
    timer({ id: 's', start: 'yesterday' }), good[2], timer({ id: 'n', label: 5 }), 7, null] });
  assert.deepEqual(r.value.timers, [...good, timer({ id: 'n', label: '' })]);
  assert.match(r.notes.join(' '), /Timers: a note that was not text was cleared/);
  assert.match(r.notes.join(' '), /Timers: left out 6 entries that could not be used/);
  assertStable(r);
});
test('a custom timer saved by v0.8 with more than a year of hours is kept; one that ends past 2200 is not', () => {
  const long = timer({ id: 'l', kind: 'custom', hours: 20000 }), far = timer({ id: 'f', kind: 'custom', hours: 2e6 });
  assert.deepEqual(checkS({ timers: [long, far] }).value.timers, [long]);
});
test('kill times and timer starts have to be real dates between 2000 and 2200', () => {
  const kills = { 'Haty|108': T0, 'Haty|108 ': T0, 'Ankou|159': 'yesterday', 'Kreutzet|113': 1e20, 'Shii|167': Date.UTC(1999, 11, 31), 'Xolotl|7': NaN, 'Citipati|7': -5, 'Leshonki|153': Date.UTC(2150, 0, 1) };
  const r = checkS({ nmKills: kills });
  assert.deepEqual(r.value.nmKills, { 'Haty|108': T0, 'Leshonki|153': Date.UTC(2150, 0, 1) });
  assert.ok(S.validTime(S.TIME_MIN) && S.validTime(S.TIME_MAX) && !S.validTime(S.TIME_MAX + 1) && !S.validTime(Infinity) && !S.validTime('1'));
  assert.deepEqual(checkS({ timers: [timer({ start: 8.64e16 })] }).value.timers, []);
});
test('a timer with no note is kept with an empty one, without counting as a repair', () => {
  const { label, ...noLabel } = timer();
  const r = checkS({ timers: [noLabel] });
  assert.deepEqual(r.value.timers, [{ ...noLabel, label: '' }]);
  assert.deepEqual(r.notes, []);
});
test('nested values in a search are put right field by field, and fields the planner never saves are removed', () => {
  const r = checkS({ planner: { weekdays: [[1], 2, '3', 2, 9], phases: [4], from: {}, to: [], minPercent: 101, maxPercent: 90, zone: 99999,
    weatherElements: ['fire', 'plasma', 'fire'], weatherDouble: 'yes', weatherChance: 'sometimes', hours: [[0, 24]], weatherIds: [1] } });
  assert.deepEqual(r.value.planner, { ...S.EMPTY_QUERY, weekdays: [2], phases: [4], maxPercent: 90, weatherElements: ['fire'] });
  assert.match(r.notes.join(' '), /fields it does not use were removed/);
  assertStable(r);
});
test('a search with a start hour and no end gets the end the planner would give it; no start and an end is left as v0.8 saves it', () => {
  assert.deepEqual(S.checkQuery({ ...S.EMPTY_QUERY, from: 20, to: null }, CTX).value.to, 24);
  const kept = S.checkQuery({ ...S.EMPTY_QUERY, from: null, to: 24 }, CTX);
  assert.deepEqual([kept.value.to, kept.notes], [24, []]);
});
test('saved searches keep the good ones, drop ones left with no condition, and drop repeats', () => {
  const full = { ...S.EMPTY_QUERY, phases: [4], from: 18, to: 6 };
  const r = checkS({ savedPlans: [full, { phases: 'x', weekdays: [7] }, {}, { ...S.EMPTY_QUERY, zone: 103 }, full, 'Darksday'] });
  assert.deepEqual(r.value.savedPlans, [full, { ...S.EMPTY_QUERY, weekdays: [7] }]);
  assertStable(r);
});
test('lists of routes, zones and weathers keep known ids once each, in their order', () => {
  const r = checkS({ starred: ['jeuno-kazham', 'nowhere', 'jeuno-kazham', 3, 'bastok-jeuno'], starredZones: [126, '126', 103, 126, 1e9], wxFind: [9, 0, 20, 11, 9, 1.5] });
  assert.deepEqual([r.value.starred, r.value.starredZones, r.value.wxFind], [['jeuno-kazham', 'bastok-jeuno'], [126, 103], [9, 11]]);
});
test('every alarm field is repaired where it can be, and an alarm is dropped only when it points at nothing', () => {
  const settings = checkS({ timers: [timer()], lead: 5 }).value;
  const r = checkA([
    { kind: 'moon', ref: 4, lead: 3, on: true }, { kind: 'jp', ref: 'x', lead: 7, on: 'yes', discord: 'sometimes' },
    { kind: 'planner', ref: { weekdays: [1], extra: {} }, lead: 3, on: true }, { kind: 'planner', ref: { weekdays: 'none' }, lead: 3, on: true },
    { kind: 'route', ref: {}, lead: 3, on: true }, { kind: 'guild', ref: 'Babubu', lead: 3, on: false, discord: false },
    { kind: 'timer', ref: 'a1', lead: 3, on: true }, { kind: 'timer', ref: 'gone', lead: 3, on: true }, { kind: 'nm', ref: 'Haty|108', lead: 1, on: true },
    { kind: 'nm', ref: 'Haty|999', lead: 1, on: true }, { kind: 'guild', ref: 'Babubu', lead: 10, on: true }, { kind: '__proto__', ref: '' }, 'jp', null,
  ], settings);
  assert.deepEqual(r.value, [
    { kind: 'moon', ref: '4', lead: 3, on: true }, { kind: 'jp', ref: '', lead: 5, on: true },
    { kind: 'planner', ref: { ...S.EMPTY_QUERY, weekdays: [1] }, lead: 3, on: true }, { kind: 'guild', ref: 'Babubu', lead: 3, on: false, discord: false },
    { kind: 'timer', ref: 'a1', lead: 3, on: true }, { kind: 'nm', ref: 'Haty|108', lead: 1, on: true },
  ]);
  assert.deepEqual(r.notes, ['Alarms: left out 8 alarms that could not be used', 'Alarms: repaired 3 alarms']);
  assertStable(r, settings);
});
test('a timer alarm goes with a timer that was dropped', () => {
  const settings = checkS({ timers: [timer({ kind: 'zzz' })] }).value;
  assert.deepEqual(checkA([{ kind: 'timer', ref: 'a1', lead: 3, on: true }], settings).value, []);
});
test('a field this version does not know is kept for the version that saved it', () => {
  const r = checkS({ ...FIXTURE.settings, serverRules: 'retail', futureList: [1, 2] });
  assert.deepEqual(r.notes, []);
  assert.equal(r.value.serverRules, 'retail');
  assert.deepEqual(r.value.futureList, [1, 2]);
});
test('a __proto__ key in saved data stays an ordinary key and changes no prototype', () => {
  const r = fromText('{"__proto__": {"polluted": true}, "nmKills": {"__proto__": 5, "Haty|108": 1792668947360}}');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(r.value), Object.prototype);
  assert.deepEqual(r.value.nmKills, { 'Haty|108': 1792668947360 });
});
test('the Discord webhook is kept only when it is a Discord webhook URL', () => {
  assert.equal(checkS({ discord: FIXTURE.settings.discord }).value.discord, FIXTURE.settings.discord);
  for (const bad of ['https://example.com/api/webhooks/1/x', 'javascript:alert(1)', 5, null]) assert.equal(checkS({ discord: bad }).value.discord, '');
});
test('the four themes are kept and anything else follows the system', () => {
  for (const t of S.THEMES) assert.equal(S.checkTheme(t), t);
  for (const t of [null, '', 'Dark', 'vana ', '{}']) assert.equal(S.checkTheme(t), 'system');
});
test('every setting in the defaults has a check, so none passes through unchecked', () => {
  const junk = Object.fromEntries(Object.keys(S.DEFAULTS).map((k) => [k, { junk: true }]));
  const r = checkS(junk);
  assert.deepEqual(r.value, S.DEFAULTS);
  assert.equal(r.notes.length, Object.keys(S.DEFAULTS).length);
});

// ---- NM cards ----
const CARDS = createRequire(import.meta.url)('../nm-cards.js');
const RATES = [1, 5, 10, 50, 100, 150, 240, 1000]; // LandSandBoat's drop tiers, data/enums/drop_rate.yaml
const ITEM_NAMES = new Set(Object.values(JSON.parse(readFileSync(new URL('../tools/item-names.json', import.meta.url), 'utf8')).items).map((i) => i.name));
test('every NM on the page has a card, and every card is for an NM on the page', () => {
  assert.deepEqual(Object.keys(CARDS).sort(), V.nmList().map(S.nmKey).sort());
});
test("card drops use LandSandBoat's rate tiers and names checked against BG Wiki", () => {
  for (const [key, c] of Object.entries(CARDS)) for (const [name, rate] of c.drops) {
    assert.ok(RATES.includes(rate), `${key} ${name} ${rate}`);
    assert.ok(ITEM_NAMES.has(name) && !name.includes('_'), `${key} ${name}`);
  }
});
test('every map grid on a card cites a BG Wiki page and revision', () => {
  for (const [key, c] of Object.entries(CARDS)) if (c.map) assert.ok(c.map.grid.length && c.map.page && Number.isInteger(c.map.revid) && ['spawn', 'qm'].includes(c.map.at), key);
});
test('both NM files name the LandSandBoat commit they cite and copy none of its lines', () => {
  for (const file of ['nm-data.js', 'nm-cards.js']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(text, /^\/\/ LandSandBoat commit: [0-9a-f]{40}$/m, file);
    assert.ok(!text.includes('"text":'), file);
  }
});
test('every card cites the LandSandBoat lines it comes from, and has a level', () => {
  for (const [key, c] of Object.entries(CARDS)) {
    assert.ok(c.sources.length > 0 && c.sources.every((s) => citation(s) && s.file.startsWith('data/zones/')), key);
    assert.ok(Array.isArray(c.level) && c.level[0] <= c.level[1], key);
  }
});
test("King Vinegarroon's card: level 80, (G-11), Ace's Helm 15% and two 10% drops", () => {
  const c = CARDS['King Vinegarroon|125'];
  assert.deepEqual([c.level, c.map.grid, c.drops], [[80, 80], ['(G-11)'], [["Ace's Helm", 150], ['Venomous Claw', 100], ['Heavy Shell', 100]]]);
});
test('lottery NMs name their placeholders, and never themselves', () => {
  assert.deepEqual(CARDS['Citipati|7'].placeholders, ['Corse']);
  assert.deepEqual(CARDS['Black Triple Stars|110'].placeholders, ['Midnight Wings']);
  for (const nm of V.nmList()) assert.ok(!CARDS[S.nmKey(nm)].placeholders.includes(nm.name), nm.name);
  for (const nm of V.nmList().filter((n) => n.lottery)) assert.ok(CARDS[S.nmKey(nm)].placeholders.length > 0, nm.name);
});
test('a drop rolled more than once keeps one entry per roll (Manes: four rolls of Taffeta Cloth)', () => {
  assert.deepEqual(CARDS['Manes|167'].drops.map((d) => d[1]), [1000, 240, 150, 150]);
});
test('quest NMs place the ??? that pops them; grids BG Wiki hedges are left out', () => {
  for (const key of ['Marchelute|103', 'Baumesel|24', 'Doman|103', 'Onryo|103']) assert.equal(CARDS[key].map.at, 'qm', key);
  assert.equal(CARDS['Bendigeit Vran|108'].map, null);
  assert.equal(CARDS['Vodyanoi|1'].map, null);
});

// ---- Servers ----
test('retail has no guild holidays; HorizonXI and other LandSandBoat servers can have them', () => {
  assert.deepEqual(Object.keys(V.SERVERS), ['retail', 'horizon', 'lsb']);
  assert.deepEqual(Object.values(V.SERVERS).map((x) => x.holidays), [false, true, true]);
});
test('on HorizonXI a Dynamis timer waits for the conquest tally; on retail and other LandSandBoat servers, for JP midnight', () => {
  const dyna = V.TIMER_KINDS.find((k) => k.id === 'dynamis'), start = Date.UTC(2026, 9, 21, 12); // a Wednesday
  assert.equal(V.timerRule(dyna, 'retail').rule, 'jp');
  assert.equal(V.timerRule(dyna, 'lsb').rule, 'jp');
  assert.equal(V.timerRule(dyna, 'horizon').rule, 'tally');
  assert.equal(V.timerReady(V.timerRule(dyna, 'horizon').rule, start), Date.UTC(2026, 9, 25, 15));
  assert.equal(V.timerReady(V.timerRule(dyna, 'retail').rule, start), Date.UTC(2026, 9, 21, 15));
  assert.equal(V.timerRule(dyna, 'nowhere').rule, 'jp');
});
test('HorizonXI offers no Fields or Grounds of Valor, Hunt Registry or ACP, AMK and ASA key timers, and no Hachirin-no-Obi', () => {
  assert.deepEqual([...V.SERVERS.horizon.hidden].sort(), ['hunt', 'keys', 'regime']);
  for (const id of V.SERVERS.horizon.hidden) assert.ok(V.TIMER_KINDS.some((k) => k.id === id), id);
  assert.deepEqual([V.SERVERS.retail.hidden, V.SERVERS.lsb.hidden], [[], []]);
  assert.deepEqual(Object.values(V.SERVERS).map((x) => x.hachirin), [true, false, true]);
});
test('the server choice is saved, checked, shared between tabs, and Retail by default', () => {
  assert.equal(S.DEFAULTS.server, 'retail');
  assert.ok(S.SHARED.includes('server'));
  assert.equal(checkS({ server: 'horizon' }).value.server, 'horizon');
  for (const bad of ['Retail', 'horizonxi', 3, null]) assert.equal(checkS({ server: bad }).value.server, 'retail');
});

// ---- Several tabs ----
// A save that finds another tab saved first merges: base is this tab's settings before its change.
const BASE = checkS(FIXTURE.settings).value;
const edit = (over) => ({ ...clone(BASE), ...over });
function clone(v) { return JSON.parse(JSON.stringify(v)); }
test('changes to different settings in two tabs both survive', () => {
  const merged = S.mergeSettings(BASE, edit({ sound: true }), edit({ hour12: true }));
  assert.deepEqual([merged.sound, merged.hour12], [true, true]);
});
test('the same setting changed in two tabs ends with the later save', () => {
  assert.equal(S.mergeSettings(BASE, edit({ lead: 10 }), edit({ lead: 1 })).lead, 10);
});
test('a setting this tab did not change keeps what the other tab saved, view settings included', () => {
  const merged = S.mergeSettings(BASE, edit({ sound: true }), edit({ wxZone: 103, calTab: 'rse' }));
  assert.deepEqual([merged.wxZone, merged.calTab], [103, 'rse']);
});
test('timers made in two tabs at once are both kept, and a removal in either tab applies', () => {
  const a = timer({ id: 'new-a' }), b = timer({ id: 'new-b', kind: 'dynamis', label: '' }), [first, ...rest] = BASE.timers;
  assert.deepEqual(S.mergeSettings(BASE, edit({ timers: [...BASE.timers, a] }), edit({ timers: [...BASE.timers, b] })).timers.map((x) => x.id), [...BASE.timers.map((x) => x.id), 'new-b', 'new-a']);
  assert.deepEqual(S.mergeSettings(BASE, edit({ timers: rest }), edit({ timers: [...BASE.timers, b] })).timers.map((x) => x.id), [...rest.map((x) => x.id), 'new-b']);
  assert.deepEqual(S.mergeSettings(BASE, edit({ timers: [...BASE.timers, a] }), edit({ timers: rest })).timers.map((x) => x.id), [...rest.map((x) => x.id), 'new-a']);
  // Editing a timer's start in one tab while the other adds one keeps both.
  const moved = { ...first, start: first.start - 3600000 };
  const m = S.mergeSettings(BASE, edit({ timers: [moved, ...rest] }), edit({ timers: [...BASE.timers, b] }));
  assert.deepEqual(m.timers, [moved, ...rest, b]);
});
test('kill times, stars and saved searches merge entry by entry', () => {
  const kills = S.mergeSettings(BASE, edit({ nmKills: { ...BASE.nmKills, 'Haty|108': T0 } }), edit({ nmKills: { 'Leshonki|153': BASE.nmKills['Leshonki|153'], 'Kreutzet|113': T0 } }));
  assert.deepEqual(kills.nmKills, { 'Leshonki|153': BASE.nmKills['Leshonki|153'], 'Kreutzet|113': T0, 'Haty|108': T0 });
  const stars = S.mergeSettings(BASE, edit({ starred: ['jeuno-windurst', 'bastok-jeuno'], starredZones: [126] }), edit({ starred: [...BASE.starred, 'kazham-jeuno'], starredZones: [...BASE.starredZones, 112] }));
  assert.deepEqual([stars.starred, stars.starredZones], [['jeuno-windurst', 'kazham-jeuno', 'bastok-jeuno'], [126, 112]]);
  const plan = { ...S.EMPTY_QUERY, weekdays: [7] };
  assert.deepEqual(S.mergeSettings(BASE, edit({ savedPlans: [...BASE.savedPlans, plan] }), edit({ savedPlans: [BASE.savedPlans[1]] })).savedPlans, [BASE.savedPlans[1], plan]);
});
test('alarms merge by alarm: an alarm turned off in one tab and one added in the other both stick', () => {
  const settings = checkS(FIXTURE.settings).value, base = checkA(FIXTURE.alarms, settings).value;
  const off = clone(base); off[0].on = false;
  const added = [...clone(base), { kind: 'route', ref: 'bastok-jeuno', lead: 3, on: true, discord: true }];
  const m = S.mergeAlarms(base, off, added);
  assert.equal(m.length, base.length + 1);
  assert.equal(m[0].on, false);
  // An alarm removed in this tab stays removed even though the other tab still had it.
  assert.equal(S.mergeAlarms(base, base.slice(1), added).some((a) => a.ref === base[0].ref && a.kind === base[0].kind), false);
  // An alarm the other tab removed stays removed.
  assert.equal(S.mergeAlarms(base, base, base.slice(1)).length, base.length - 1);
});
test('every shared setting is one the settings have, and the view stays per tab', () => {
  for (const k of S.SHARED) assert.ok(k in S.DEFAULTS, k);
  for (const k of ['view', 'wxZone', 'routeTab', 'planner', 'calTab', 'fishId', 'magicZone', 'timerKind', 'newsOpen']) assert.ok(!S.SHARED.includes(k), k);
});

// ---- User-facing copy agrees with the data ----
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const count = (group) => V.ROUTES.filter((r) => r.group === group).length;
test('the About dialog counts match the route and guild data', () => {
  assert.match(html, new RegExp(`All ${count('airship')} airships`));
  assert.match(html, new RegExp(`the ${count('ferry')} Selbina, Mhaura, Whitegate and Nashmau boats`));
  assert.match(html, new RegExp(`${V.GUILDS.length} guild shops and ${V.SHOPS.length - V.GUILDS.length} other shops`));
  assert.match(html, new RegExp(`weather forecast for ${V.weatherZones().length} zones`));
  assert.match(html, new RegExp(`Fishing for ${V.fishList().length} fish`));
  assert.match(html, new RegExp(`${new Set(V.nmList().map((n) => n.name)).size} notorious monsters that only appear`));
});
test('the About dialog example departure is what the data gives', () => {
  const [first] = V.departureMinutes(ROUTE['jeuno-sandoria']);
  assert.equal(`${String(Math.floor(first / 60)).padStart(2, '0')}:${String(first % 60).padStart(2, '0')}`, '01:14');
  assert.match(html, /shows 01:14 rather than 01:10/);
});
test('the About dialog says the one thing that can leave the browser and the one thing that is fetched', () => {
  assert.match(html, /Nothing is sent anywhere except alarm posts to a Discord webhook if you set one\. The only thing fetched is the news bar's headlines, from this same site, and only while the bar is open\./);
  assert.doesNotMatch(html, /nothing leaves the browser|Nothing is fetched/);
});
test('the header, footer and About have Share and link to the Issues page and Buy Me a Coffee in a new tab, and the footer and About to the source', () => {
  const links = (href) => html.split(`<a href="${href}" target="_blank" rel="noopener"`).length - 1;
  assert.equal(links('https://github.com/RadMageIRL/ffxi-timer'), 2);
  assert.equal(links('https://github.com/RadMageIRL/ffxi-timer/issues'), 3);
  assert.equal(links('https://buymeacoffee.com/radmageirl'), 3);
  assert.equal(html.split(' data-share').length - 1, 3);
  // Share passes the canonical address, and the tagline keeps its RadMage Labs link.
  assert.ok(html.includes('<link rel="canonical" href="https://radmagelabs.com/ffxi/">'));
  assert.match(html, /<span class="tagline">v[\d.]+ · vana'diel clock · <a href="https:\/\/radmagelabs\.com\/">RadMage Labs<\/a><\/span>/);
});

const repoFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---- Latest news ----
// news.js reads the official site's RSS feeds for tools/fetch-news.mjs and checks news.json for the page.
const N =createRequire(import.meta.url)('../news.js');
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://www.playonline.com/pcd2/topics/ff11us/topics.xml"><title>FINAL FANTASY XI Official Web Site: Topics</title>
  <link>https://www.playonline.com/ff11us/index.html</link>
  <items><rdf:Seq><rdf:li resource="https://www.playonline.com/pcd2/topics/ff11us/detail/1/detail.html" /></rdf:Seq></items></channel>
<item rdf:about="https://www.playonline.com/pcd2/topics/ff11us/detail/1/detail.html">
  <title>Shami&apos;s Trove Returns &amp; the Alter Ego Expo</title>
  <link>https://www.playonline.com/pcd2/topics/ff11us/detail/1/detail.html</link>
  <description><![CDATA[<strong>Read on</strong> <script>x()</script>]]></description>
  <dc:date>Fri, 23 Oct 2026 17:00:00 JST</dc:date>
</item>
<item><title>Forum &#8212; Maintenance <b>(Oct. 21)</b></title><link>http://www.playonline.com/ff11us/polnews/news1.shtml#top</link><dc:date>Thu, 22 Oct 2026 18:12:33 JST</dc:date></item>
<item><title>The October Version Update</title><link>https://sqex.to/BXGTh</link><dc:date>Sat, 24 Oct 2026 09:00:00 JST</dc:date></item>
<item><title>Somewhere else</title><link>https://example.com/news</link><dc:date>Sun, 25 Oct 2026 09:00:00 JST</dc:date></item>
<item><title>A script</title><link>javascript:alert(1)</link></item>
<item><title>   </title><link>https://www.playonline.com/untitled.html</link></item>
<item><title>The same link again</title><link>https://sqex.to/BXGTh</link></item>
<item><title>No date</title><link>https://www.playonline.com/nodate.html</link></item>
</rdf:RDF>`;
test('a feed gives its items newest first, as text, with only https links to Square Enix sites', () => {
  assert.deepEqual(N.parseFeed(FEED), [
    { title: 'The October Version Update', link: 'https://sqex.to/BXGTh', date: '2026-10-24T00:00:00.000Z' },
    { title: "Shami's Trove Returns & the Alter Ego Expo", link: 'https://www.playonline.com/pcd2/topics/ff11us/detail/1/detail.html', date: '2026-10-23T08:00:00.000Z' },
    { title: 'Forum - Maintenance (Oct. 21)', link: 'https://www.playonline.com/ff11us/polnews/news1.shtml', date: '2026-10-22T09:12:33.000Z' },
    { title: 'No date', link: 'https://www.playonline.com/nodate.html', date: null },
  ]);
  assert.equal(N.parseFeed(FEED, 2).length, 2);
  assert.deepEqual(N.parseFeed('<html>not a feed</html>'), []);
});
test("feed dates in Japan time come out as the right moment, and a date that can't be read as null", () => {
  assert.equal(N.cleanDate('Fri, 23 Oct 2026 17:00:00 JST'), '2026-10-23T08:00:00.000Z');
  assert.equal(N.cleanDate('2026-10-23T08:00:00Z'), '2026-10-23T08:00:00.000Z');
  assert.equal(N.cleanDate('soon'), null);
});
test('a link is kept only as https to the official site, its link shortener or the forum', () => {
  assert.equal(N.cleanLink('http://www.playonline.com/ff11us/polnews/news27806.shtml'), 'https://www.playonline.com/ff11us/polnews/news27806.shtml');
  assert.equal(N.cleanLink('https://forum.square-enix.com/ffxi/threads/64777?p=1#post1'), 'https://forum.square-enix.com/ffxi/threads/64777?p=1');
  for (const bad of ['https://playonline.com.example.com/x', 'https://evil.example/playonline.com', 'ftp://www.playonline.com/x', 'https://user@www.playonline.com/x', 'https://www.playonline.com:8443/x', 'javascript:alert(1)', '']) {
    assert.equal(N.cleanLink(bad), null, bad);
  }
});
test('news.json as the page reads it keeps only entries that look like what the fetcher writes', () => {
  const good = { title: 'Harvest Festival', link: 'https://www.playonline.com/pcd2/topics/ff11us/detail/40455/detail.html', date: '2026-10-09T08:01:00.000Z' };
  const r = N.sanitize({ topics: [good, { title: 'x', link: 'https://example.com/' }, { title: 5, link: good.link }, null, { ...good, title: '<b>Bold</b>' }] });
  assert.deepEqual(r, { topics: [good, { ...good, title: 'Bold' }], information: [] });
  assert.equal(N.sanitize({ topics: Array(20).fill(good) }).topics.length, N.PER_FEED);
  for (const bad of [null, [], 'news', { topics: [] }, { topics: [{ title: 'x', link: 'javascript:alert(1)' }] }]) assert.equal(N.sanitize(bad), null, JSON.stringify(bad));
});
test("the saved news.json is the fetcher's own output, with headlines from both feeds", () => {
  const saved = JSON.parse(repoFile('news.json'));
  assert.deepEqual(Object.keys(saved), N.FEEDS.map((f) => f.key));
  assert.deepEqual(N.sanitize(saved), saved);
  for (const f of N.FEEDS) assert.ok(saved[f.key].length > 0 && saved[f.key].length <= N.PER_FEED, f.key);
  assert.equal(repoFile('news.json'), `${JSON.stringify(saved, null, 2)}\n`);
});
test('the News workflow fetches every hour and commits only news.json, only when it changed', () => {
  const yml = repoFile('.github/workflows/news.yml');
  assert.match(yml, /- cron: '\d{1,2} \* \* \* \*'/);
  assert.match(yml, /run: node tools\/fetch-news\.mjs/);
  assert.match(yml, /if git diff --quiet -- news\.json; then .*exit 0; fi/);
  assert.match(yml, /git add news\.json\n/);
  assert.doesNotMatch(yml, /git add (-A|\.|--all)/);
  assert.match(yml, /permissions:\n  contents: write\n/);
});
test('the news bar starts closed and its setting is per tab', () => {
  assert.equal(S.DEFAULTS.newsOpen, false);
  assert.match(html, /<details class="card news" id="news">/);
  assert.doesNotMatch(html, /<details class="card news" id="news" open/);
});

// ---- Release ----
// The newest version heading in the changelog is the version everywhere else.
const VERSION = /^## v(\d+\.\d+(?:\.\d+)?) /m.exec(repoFile('CHANGELOG.md'))[1];
test(`the page, the About dialog and the README all say v${VERSION}, the newest version in the changelog`, () => {
  assert.ok(html.includes(`<title>FFXI Timer v${VERSION} - `));
  assert.ok(html.includes(`<span class="tagline">v${VERSION} · `));
  assert.ok(html.includes(`<h2 id="about-title">ffxi-timer v${VERSION}</h2>`));
  assert.match(repoFile('README.md'), new RegExp(`^# ffxi-timer v${VERSION.replace(/\./g, '\\.')}\\r?\\n`));
});
test('every script and the stylesheet exist and carry the version in their address, so a new release is fetched fresh', () => {
  const assets = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(assets.length, 9);
  for (const a of assets) {
    assert.ok(a.endsWith(`?v=${VERSION}`), a);
    assert.ok(existsSync(new URL(`../${a.split('?')[0]}`, import.meta.url)), a);
  }
});
test('every link to a part of the page has somewhere to go', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g), ...html.matchAll(/data-simple="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 15);
  for (const id of targets) assert.ok(ids.has(id), id);
});
test("the README's links to files in the repo point at files that exist", () => {
  const local = [...repoFile('README.md').matchAll(/\]\(([^)#]+)\)/g)].map((m) => m[1]).filter((p) => !/^https?:/.test(p));
  assert.ok(local.length >= 3);
  for (const p of local) assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), p);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
