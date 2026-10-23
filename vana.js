// Vana'diel time math and schedule data. Every function is a pure function of an Earth timestamp in
// milliseconds, so the page and the Node tests share this file unchanged.
(function (root) {
  'use strict';

  // Earth milliseconds per Vana'diel unit. A Vana'diel day is exactly 1/25 of an Earth day.
  const SEC = 40, MIN = 2400, HOUR = 144000, DAY = 3456000, WEEK = 8 * DAY, MONTH = 30 * DAY, YEAR = 360 * DAY;
  // 886-01-01 00:00 C.E. is 2001-12-31 15:00 UTC (Unix 1009810800), the epoch the server uses.
  const EPOCH = 1009810800000, BASE_YEAR = 886;
  const EARTH_DAY = 86400000, JST = 9 * 3600000;

  const mod = (a, n) => ((a % n) + n) % n;

  const ELEMENTS = { fire: 'Fire', ice: 'Ice', wind: 'Wind', earth: 'Earth', lightning: 'Lightning', water: 'Water', light: 'Light', dark: 'Dark' };
  // A day strengthens its own element and weakens the one its element beats (Watersday weakens Fire).
  const DAYS = [
    { name: 'Firesday', element: 'fire', weak: 'ice' },
    { name: 'Earthsday', element: 'earth', weak: 'lightning' },
    { name: 'Watersday', element: 'water', weak: 'fire' },
    { name: 'Windsday', element: 'wind', weak: 'earth' },
    { name: 'Iceday', element: 'ice', weak: 'wind' },
    { name: 'Lightningday', element: 'lightning', weak: 'water' },
    { name: 'Lightsday', element: 'light', weak: 'dark' },
    { name: 'Darksday', element: 'dark', weak: 'light' },
  ];

  function clock(t) {
    const v = t - EPOCH, dayNumber = Math.floor(v / DAY);
    return {
      year: BASE_YEAR + Math.floor(v / YEAR),
      month: Math.floor(mod(v, YEAR) / MONTH) + 1,
      date: Math.floor(mod(v, MONTH) / DAY) + 1,
      hour: Math.floor(mod(v, DAY) / HOUR),
      minute: Math.floor(mod(v, HOUR) / MIN),
      second: Math.floor(mod(v, MIN) / SEC),
      weekday: mod(dayNumber, 8),
      dayNumber,
      dayStart: EPOCH + dayNumber * DAY,
    };
  }
  const dayStartOf = (dayNumber) => EPOCH + dayNumber * DAY;
  // The Earth time of a Vana'diel date and time; the inverse of clock().
  const fromVana = (year, month, date, hour = 0, minute = 0, second = 0) =>
    EPOCH + (year - BASE_YEAR) * YEAR + (month - 1) * MONTH + (date - 1) * DAY + hour * HOUR + minute * MIN + second * SEC;
  // Vana'diel clock time of an Earth timestamp as minutes past midnight.
  const minuteOfDay = (t) => Math.floor(mod(t - EPOCH, DAY) / MIN);

  // Day time spans as BG Wiki gives them, in Vana'diel hours.
  const isDaytime = (hour) => hour >= 6 && hour < 18;

  // ---- Moon ----
  // The cycle is 84 days: 42 waning from 100% to 0%, 42 waxing back. The server counts days from
  // 0 C.E. plus 26; 886 years is 12 more days mod 84, so from our epoch that is days + 38.
  const MOON_PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const FULL = 4, NEW = 0;

  // Phase name boundaries by percent and direction, matching both BG Wiki and the server. They are
  // not symmetric: waning, 43% is still Last Quarter; waxing, 38% is still a Waxing Crescent.
  function phaseOf(percent, direction) {
    if (direction === 'peak') return percent === 100 ? FULL : NEW;
    if (direction === 'waning') return percent >= 94 ? FULL : percent >= 61 ? 5 : percent >= 41 ? 6 : percent >= 11 ? 7 : NEW;
    return percent >= 90 ? FULL : percent >= 56 ? 3 : percent >= 39 ? 2 : percent >= 6 ? 1 : NEW;
  }

  function moonOfDay(dayNumber) {
    const i = mod(dayNumber + 38, 84);
    // Integer form of rounding 100 * i / 42 half up, identical to the server's floating point math.
    const percent = i >= 42 ? Math.floor((100 * (i - 42) + 21) / 42) : Math.floor((100 * (42 - i) + 21) / 42);
    const direction = i === 0 || i === 42 ? 'peak' : i < 42 ? 'waning' : 'waxing';
    return { percent, direction, phase: phaseOf(percent, direction), cycleDay: i };
  }
  const moon = (t) => moonOfDay(clock(t).dayNumber);

  // The next Vana'diel midnight at which the moon's phase name changes.
  function nextPhaseChange(t) {
    const today = clock(t).dayNumber, phase = moonOfDay(today).phase;
    for (let n = today + 1; n <= today + 84; n++) {
      const m = moonOfDay(n);
      if (m.phase !== phase) return { at: dayStartOf(n), phase: m.phase };
    }
    return null;
  }

  // ---- Race-specific equipment ----
  // One race per Vana'diel week, in race order, while the dungeon rotates through three.
  const RSE_RACES = ['Male Hume', 'Female Hume', 'Male Elvaan', 'Female Elvaan', 'Male Tarutaru', 'Female Tarutaru', 'Mithra', 'Galka'];
  const RSE_PLACES = ["Ordelle's Caves", 'Gusgen Mines', 'Maze of Shakhrami'];
  function rseOfWeek(week) {
    return { race: mod(week, 8), place: mod(week, 3), start: EPOCH + week * WEEK, end: EPOCH + (week + 1) * WEEK };
  }
  // The Goblin Tailor (Guttrix, Lower Jeuno): during your race's week, a chest key traded to that
  // week's dungeon Treasure Chest gives a Magical Pattern, and each pattern buys one piece of your
  // race's set. A ??? in the same dungeon pops an NM that can drop your race's sachet. Indexed like
  // RSE_PLACES and RSE_RACES. Monsters and rarity are LandSandBoat's drop data for each chest key.
  const RSE_DUNGEONS = [
    { key: 'Ordelle Chest Key', nm: 'Aroma Leech', droppers: [
      ['Air Elemental', 'rare'], ['Goblin Furrier', 'rare'], ['Goblin Pathfinder', 'rare'], ['Goblin Shaman', 'rare'], ['Goblin Smithy', 'rare'],
      ['Goliath Beetle', 'very rare'], ['Napalm', 'rare'], ['Stroper', 'rare'], ['Stroper Chyme', 'rare'], ['Water Elemental', 'rare'],
    ] },
    { key: 'Gusgen Chest Key', nm: 'Aroma Fly', droppers: [
      ['Amphisbaena', 'very rare'], ['Banshee', 'rare'], ['Earth Elemental', 'rare'], ['Feu Follet', 'very rare'], ['Gallinipper', 'rare'],
      ['Ghast', 'rare'], ['Greater Pugil', 'rare'], ['Mauthe Doog', 'rare'], ['Myconid', 'rare'], ['Rancid Ooze', 'rare'], ['Sadfly', 'rare'],
      ['Spunkie', 'very rare'], ['Thunder Elemental', 'rare'], ['Wendigo', 'very rare'], ['Wight', 'rare'],
    ] },
    { key: 'Shakhrami Chest Key', nm: 'Aroma Crawler', droppers: [
      ['Abyss Worm', 'very rare'], ['Air Elemental', 'rare'], ['Caterchipillar', 'rare'], ['Earth Elemental', 'rare'], ['Goblin Furrier', 'rare'],
      ['Goblin Pathfinder', 'rare'], ['Goblin Shaman', 'rare'], ['Goblin Smithy', 'rare'], ['Labyrinth Scorpion', 'rare'], ['Protozoan', 'rare'], ['Wight', 'rare'],
    ] },
  ];
  const RSE_GEAR = [
    { set: 'Custom', pieces: ['Custom Tunic', 'Custom M Gloves', 'Custom Slacks', 'Custom M Boots'], sachet: 'Balm Sachet' },
    { set: 'Custom', pieces: ['Custom Vest', 'Custom F Gloves', 'Custom Pants', 'Custom F Boots'], sachet: 'Millefleurs Sachet' },
    { set: 'Magna', pieces: ['Magna Jerkin', 'Magna Gauntlets', 'Magna M Chausses', 'Magna M Ledelsens'], sachet: 'Olibanum Sachet' },
    { set: 'Magna', pieces: ['Magna Bodice', 'Magna Gloves', 'Magna F Chausses', 'Magna F Ledelsens'], sachet: 'Attar Sachet' },
    { set: 'Wonder', pieces: ['Wonder Kaftan', 'Wonder Mitts', 'Wonder Braccae', 'Wonder Clomps'], sachet: 'Sweet Sachet' },
    { set: 'Wonder', pieces: ['Wonder Kaftan', 'Wonder Mitts', 'Wonder Braccae', 'Wonder Clomps'], sachet: 'Sweet Sachet' },
    { set: 'Savage', pieces: ['Savage Separates', 'Savage Gauntlets', 'Savage Loincloth', 'Savage Gaiters'], sachet: 'Civet Sachet' },
    { set: "Elder's", pieces: ["Elder's Surcoat", "Elder's Bracers", "Elder's Braguette", "Elder's Sandals"], sachet: 'Musk Sachet' },
  ];
  const rse = (t) => rseOfWeek(Math.floor((t - EPOCH) / WEEK));
  function rseWeeks(t, count, race = null) {
    const out = [];
    for (let w = Math.floor((t - EPOCH) / WEEK); out.length < count; w++) {
      const r = rseOfWeek(w);
      if (race === null || r.race === race) out.push(r);
    }
    return out;
  }

  // ---- Earth resets ----
  // JST has no daylight saving, so Japanese midnight is always 15:00 UTC.
  const nextJpMidnight = (t) => (Math.floor((t + JST) / EARTH_DAY) + 1) * EARTH_DAY - JST;
  // Conquest tallies every Monday at 00:00 JST.
  function nextConquestTally(t) {
    const jstDay = Math.floor((t + JST) / EARTH_DAY);
    const weekday = mod(jstDay + 4, 7); // 1970-01-01 was a Thursday; 0 is Sunday
    let next = (jstDay + mod(1 - weekday, 7)) * EARTH_DAY - JST;
    if (next <= t) next += 7 * EARTH_DAY;
    return next;
  }

  // ---- Ships, airships, the Manaclipper and the barge ----
  // Each run as LandSandBoat records it from retail packet captures, in Earth seconds: `every` is the
  // cycle, `offset` where the cycle starts counted from the epoch, `arriving` and `docked` the length
  // of those phases (the door is open for the whole docked phase), and `disembark` when the riders who
  // boarded here are put ashore at the far end, counted from the offset.
  const RUNS = [
    { id: 'jeuno-sandoria', group: 'airship', from: 'Port Jeuno', to: "Port San d'Oria", every: 864, offset: 2, arriving: 26, docked: 151, disembark: 440 },
    { id: 'jeuno-windurst', group: 'airship', from: 'Port Jeuno', to: 'Port Windurst', every: 864, offset: 218, arriving: 26, docked: 152, disembark: 457 },
    { id: 'jeuno-bastok', group: 'airship', from: 'Port Jeuno', to: 'Port Bastok', every: 864, offset: 434, arriving: 26, docked: 152, disembark: 446 },
    { id: 'jeuno-kazham', group: 'airship', from: 'Port Jeuno', to: 'Kazham', every: 864, offset: 650, arriving: 45, docked: 118, disembark: 456 },
    { id: 'sandoria-jeuno', group: 'airship', from: "Port San d'Oria", to: 'Port Jeuno', every: 864, offset: 434, arriving: 23, docked: 151, disembark: 442 },
    { id: 'windurst-jeuno', group: 'airship', from: 'Port Windurst', to: 'Port Jeuno', every: 864, offset: 650, arriving: 40, docked: 139, disembark: 442 },
    { id: 'bastok-jeuno', group: 'airship', from: 'Port Bastok', to: 'Port Jeuno', every: 864, offset: 2, arriving: 29, docked: 143, disembark: 441 },
    { id: 'kazham-jeuno', group: 'airship', from: 'Kazham', to: 'Port Jeuno', every: 864, offset: 218, arriving: 40, docked: 131, disembark: 460 },
    { id: 'selbina-mhaura', group: 'ferry', from: 'Selbina', to: 'Mhaura', every: 1152, offset: 920, arriving: 41, docked: 192, disembark: 25 },
    { id: 'mhaura-selbina', group: 'ferry', from: 'Mhaura', to: 'Selbina', every: 1152, offset: 920, arriving: 41, docked: 192, disembark: 26 },
    { id: 'mhaura-whitegate', group: 'ferry', from: 'Mhaura', to: 'Aht Urhgan Whitegate', every: 1152, offset: 344, arriving: 41, docked: 192, disembark: 26 },
    { id: 'whitegate-mhaura', group: 'ferry', from: 'Aht Urhgan Whitegate', to: 'Mhaura', every: 1152, offset: 344, arriving: 42, docked: 191, disembark: 26 },
    { id: 'whitegate-nashmau', group: 'ferry', from: 'Aht Urhgan Whitegate', to: 'Nashmau', every: 1152, offset: 680, arriving: 42, docked: 431, disembark: 25 },
    { id: 'nashmau-whitegate', group: 'ferry', from: 'Nashmau', to: 'Aht Urhgan Whitegate', every: 1152, offset: 680, arriving: 40, docked: 432, disembark: 26 },
    { id: 'bibiki-tour', group: 'manaclipper', from: 'Bibiki Bay', to: 'Bibiki Bay (tour)', every: 1728, offset: 2, arriving: 41, docked: 72, disembark: 701 },
    { id: 'bibiki-purgonorgo', group: 'manaclipper', from: 'Bibiki Bay', to: 'Purgonorgo Isle', every: 1728, offset: 675, arriving: 40, docked: 78, disembark: 556 },
    { id: 'purgonorgo-bibiki', group: 'manaclipper', from: 'Purgonorgo Isle', to: 'Bibiki Bay', every: 1728, offset: 1203, arriving: 51, docked: 79, disembark: 556 },
    { id: 'barge-south-central', group: 'barge', from: 'South Landing', to: 'Central Landing', every: 3456, offset: 7, arriving: 31, docked: 84, disembark: 654 },
    { id: 'barge-central-south-day', group: 'barge', from: 'Central Landing', to: 'South Landing', every: 3456, offset: 647, arriving: 31, docked: 69, disembark: 638 },
    { id: 'barge-south-north', group: 'barge', from: 'South Landing', to: 'North Landing', every: 3456, offset: 1351, arriving: 31, docked: 84, disembark: 955 },
    { id: 'barge-north-central', group: 'barge', from: 'North Landing', to: 'Central Landing', every: 3456, offset: 2375, arriving: 40, docked: 93, disembark: 399 },
    { id: 'barge-central-south-night', group: 'barge', from: 'Central Landing', to: 'South Landing', every: 3456, offset: 2759, arriving: 31, docked: 69, disembark: 638 },
  ];
  // Cycle positions in Earth ms from the epoch: door opens, door shuts (the departure), riders land.
  const ROUTES = RUNS.map((r) => {
    const every = r.every * 1000, arrive = r.offset * 1000, open = arrive + r.arriving * 1000, shut = open + r.docked * 1000;
    return Object.freeze({
      ...r, everyMs: every, arriveAt: mod(arrive, every), openAt: mod(open, every), shutAt: mod(shut, every),
      arrivingMs: r.arriving * 1000, dockedMs: r.docked * 1000, rideMs: mod(r.disembark - r.arriving - r.docked, r.every) * 1000,
    });
  });

  // First time strictly after t that sits at `pos` in a cycle of `every` ms.
  const nextAt = (t, pos, every) => t + every - mod(t - EPOCH - pos, every);

  function routeStatus(route, t) {
    const sinceOpen = mod(t - EPOCH - route.openAt, route.everyMs);
    const boarding = sinceOpen < route.dockedMs;
    const departs = boarding ? t + route.dockedMs - sinceOpen : nextAt(t, route.shutAt, route.everyMs);
    const opens = boarding ? t - sinceOpen : departs - route.dockedMs;
    const arriving = !boarding && mod(t - EPOCH - route.arriveAt, route.everyMs) < route.arrivingMs;
    return { state: boarding ? 'boarding' : arriving ? 'arriving' : 'away', opens, departs, lands: departs + route.rideMs };
  }
  const nextDeparture = (route, t) => nextAt(t, route.shutAt, route.everyMs);
  // Every departure in one Vana'diel day, as minutes past midnight.
  function departureMinutes(route) {
    const out = [];
    for (let p = route.shutAt; p < DAY; p += route.everyMs) out.push(Math.floor(p / MIN));
    return out;
  }

  // ---- Trips ----
  // Runs chained port to port: each leg leaves the port the last one landed at, at least `transfer` ms
  // after landing, for the walk between docks. Walking between towns and teleports are not part of
  // it, and the Bibiki Bay tour comes back where it started, so it is left out.
  const TRIP_ROUTES = ROUTES.filter((r) => !r.to.endsWith('(tour)'));
  const PORTS = [...new Set(TRIP_ROUTES.flatMap((r) => [r.from, r.to]))];
  // Ports a trip from `from` can reach, in PORTS order.
  function portsFrom(from) {
    const seen = new Set([from]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of TRIP_ROUTES) if (seen.has(r.from) && !seen.has(r.to)) { seen.add(r.to); grew = true; }
    }
    return PORTS.filter((p) => p !== from && seen.has(p));
  }
  // The trip that lands at `to` soonest for someone at `from` at time t. Every run keeps a timetable and
  // none overtakes another, so the earliest landing at each port is also the best one to go on from;
  // landings are improved port by port until nothing changes.
  function earliestTrip(from, to, t, transfer = 60000) {
    const best = new Map([[from, { lands: t, legs: [] }]]);
    for (let changed = true; changed; ) {
      changed = false;
      for (const r of TRIP_ROUTES) {
        const here = best.get(r.from);
        if (!here || r.to === from) continue;
        const departs = nextDeparture(r, here.legs.length ? here.lands + transfer : t), lands = departs + r.rideMs;
        const there = best.get(r.to);
        if (!there || lands < there.lands) { best.set(r.to, { lands, legs: [...here.legs, { route: r, departs, lands }] }); changed = true; }
      }
    }
    const end = to === from ? null : best.get(to);
    return end ? { departs: end.legs[0].departs, lands: end.lands, legs: end.legs } : null;
  }
  // The next `count` trips by departure. One that leaves earlier but lands no sooner than the next is
  // dropped, since waiting for the later boat costs nothing.
  function findTrips(from, to, t, count = 5, transfer = 60000) {
    const out = [];
    for (let start = t, guard = 0; out.length <= count && guard < count * 8; guard++) {
      const trip = earliestTrip(from, to, start, transfer);
      if (!trip) break;
      while (out.length && out[out.length - 1].lands >= trip.lands) out.pop();
      out.push(trip);
      start = trip.departs;
    }
    return out.slice(0, count);
  }

  // ---- Guild shops and other shops with hours ----
  // Hours are Vana'diel hours, open from `open` up to but not including `close`, and closed all day
  // on the holiday (a DAYS index). From LandSandBoat's guild shop data, which also gives hours to the
  // Tenshodo, linkshell, chip and ferry fishing merchants. Merchants that share a place, hours and
  // holiday share a row; `npc` lists them all.
  const SHOPS = [
    { kind: 'guild', craft: 'Alchemy', place: 'Bastok Mines', npc: 'Maymunah', open: 8, close: 23, holiday: 6 },
    { kind: 'guild', craft: 'Alchemy', place: 'Aht Urhgan Whitegate', npc: 'Wahraga, Gathweeda', open: 8, close: 23, holiday: 5 },
    { kind: 'guild', craft: 'Bonecraft', place: 'Windurst Woods', npc: 'Shih Tayuun', open: 8, close: 23, holiday: 3 },
    { kind: 'guild', craft: 'Clothcraft', place: 'Windurst Woods', npc: 'Kuzah Hpirohpon', open: 6, close: 21, holiday: 0 },
    { kind: 'guild', craft: 'Clothcraft', place: 'Selbina', npc: 'Tilala', open: 6, close: 21, holiday: 0 },
    { kind: 'guild', craft: 'Clothcraft', place: 'Al Zahbi', npc: 'Taten-Bilten', open: 6, close: 21, holiday: 0 },
    { kind: 'guild', craft: 'Cooking', place: 'Windurst Waters', npc: 'Kopopo', open: 5, close: 20, holiday: 7 },
    { kind: 'guild', craft: 'Fishing', place: 'Port Windurst', npc: 'Babubu', open: 3, close: 18, holiday: 5 },
    { kind: 'guild', craft: 'Fishing', place: 'Selbina', npc: 'Graegham, Mendoline', open: 3, close: 18, holiday: 5 },
    { kind: 'guild', craft: 'Fishing', place: 'Bibiki Bay', npc: 'Mep Nhapopoluko', open: 1, close: 18, holiday: 5 },
    { kind: 'guild', craft: 'Fishing', place: 'Aht Urhgan Whitegate', npc: 'Wahnid', open: 1, close: 18, holiday: 6 },
    { kind: 'guild', craft: 'Goldsmithing', place: 'Bastok Markets', npc: 'Visala', open: 8, close: 23, holiday: 4 },
    { kind: 'guild', craft: 'Goldsmithing', place: 'Mhaura', npc: 'Yabby Tanmikey', open: 8, close: 23, holiday: 4 },
    { kind: 'guild', craft: 'Goldsmithing', place: 'Al Zahbi', npc: 'Bornahn', open: 8, close: 23, holiday: 4 },
    { kind: 'guild', craft: 'Leathercraft', place: "Southern San d'Oria", npc: 'Kueh Igunahmori', open: 3, close: 18, holiday: 4 },
    { kind: 'guild', craft: 'Smithing', place: 'Bastok Metalworks', npc: 'Amulya', open: 8, close: 23, holiday: 2 },
    { kind: 'guild', craft: 'Smithing', place: "Northern San d'Oria", npc: 'Doggomehr', open: 8, close: 23, holiday: 2 },
    { kind: 'guild', craft: 'Smithing', place: 'Mhaura', npc: 'Kamilah', open: 8, close: 23, holiday: 2 },
    { kind: 'guild', craft: 'Smithing', place: 'Al Zahbi', npc: 'Ndego', open: 8, close: 23, holiday: 2 },
    { kind: 'guild', craft: 'Woodworking', place: "Northern San d'Oria", npc: 'Chaupire', open: 6, close: 21, holiday: 0 },
    { kind: 'guild', craft: 'Woodworking', place: 'Al Zahbi', npc: 'Dehbi Moshal', open: 6, close: 21, holiday: 0 },
    { kind: 'guild', craft: 'Woodworking', place: "Carpenters' Landing", npc: 'Beugungel', open: 5, close: 22, holiday: 0 },
    { kind: 'shop', craft: 'Tenshodo', place: 'Norg', npc: 'Achika, Chiyo, Jirokichi, Vuliaie', open: 9, close: 23, holiday: 7 },
    { kind: 'shop', craft: 'Tenshodo', place: 'Port Bastok', npc: 'Jabbar, Silver Owl', open: 1, close: 23, holiday: 4 },
    { kind: 'shop', craft: 'Tenshodo', place: 'Nashmau', npc: 'Tsutsuroon', open: 1, close: 23, holiday: 7 },
    { kind: 'shop', craft: 'Linkshells', place: 'Port Bastok', npc: 'Ilita', open: 12, close: 20, holiday: 7 },
    { kind: 'shop', craft: 'Linkshells', place: 'Port Windurst', npc: 'Khel Pahlhama', open: 12, close: 20, holiday: 7 },
    { kind: 'shop', craft: 'Linkshells', place: "Southern San d'Oria", npc: 'Paunelie', open: 12, close: 20, holiday: 7 },
    { kind: 'shop', craft: 'Chips', place: 'Port Bastok', npc: 'Blabbivix', open: 11, close: 22, holiday: 7 },
    { kind: 'shop', craft: 'Chips', place: "Northern San d'Oria", npc: 'Gaudylox', open: 11, close: 22, holiday: 0 },
    { kind: 'shop', craft: 'Chips', place: 'Windurst Walls', npc: 'Scavnix', open: 11, close: 22, holiday: 6 },
    { kind: 'shop', craft: 'Fishing', place: 'Aboard the ferries', npc: 'Lokhong, Rajmonda, Pashi Maccaleh, Cehn Teyohngo, Jidwahn, Yahliq', open: 1, close: 23, holiday: 5 },
  ].map((g) => Object.freeze(g));
  const GUILDS = SHOPS.filter((s) => s.kind === 'guild');

  function guildStatus(g, t) {
    const c = clock(t), holidayToday = c.weekday === g.holiday;
    if (!holidayToday && c.hour >= g.open && c.hour < g.close) return { open: true, holiday: false, until: c.dayStart + g.close * HOUR };
    for (let d = 0; d < 3; d++) {
      const opens = c.dayStart + d * DAY + g.open * HOUR;
      if (opens > t && mod(c.weekday + d, 8) !== g.holiday) return { open: false, holiday: holidayToday, until: opens };
    }
    return null; // unreachable: a guild has one holiday a week
  }
  function nextGuildOpening(g, t) {
    const s = guildStatus(g, t);
    return s.open ? guildStatus(g, s.until).until : s.until;
  }

  // ---- Weather ----
  // Ids as the server numbers them. Each element has a single weather and a double one after it.
  const WEATHERS = ['Clear', 'Sunshine', 'Clouds', 'Fog', 'Hot Spell', 'Heat Wave', 'Rain', 'Squall', 'Dust Storm', 'Sand Storm',
    'Wind', 'Gales', 'Snow', 'Blizzards', 'Thunder', 'Thunderstorms', 'Auroras', 'Stellar Glare', 'Gloom', 'Darkness'];
  const WEATHER_ELEMENT = [null, null, null, null, 'fire', 'fire', 'water', 'water', 'earth', 'earth', 'wind', 'wind',
    'ice', 'ice', 'lightning', 'lightning', 'light', 'light', 'dark', 'dark'];
  const isDoubleWeather = (w) => w >= 4 && w % 2 === 1;
  const weatherIdsFor = (elements, doubleOnly) => WEATHERS.map((_, id) => id)
    .filter((id) => elements.includes(WEATHER_ELEMENT[id]) && (!doubleOnly || isDoubleWeather(id)));

  // Each zone follows a fixed 2,160-day cycle counted from the epoch. A day names three weathers;
  // the server rolls among them every few minutes (normal most often, rare least), so a day can
  // be forecast as likely and possible weathers, never as one certain weather. The tables come
  // from weather-data.js, which the page loads beside this file and the tests pass in.
  // Zones whose weather never changes (Dynamis, Temenos, the cloisters) come as `fixed`.
  let weatherData = null, weatherIndex = null, weatherGroupList = null;
  function useWeatherData(data) {
    weatherData = data;
    weatherIndex = new Map([
      ...data.zones.map(([id, name, pattern]) => [id, { id, name, pattern }]),
      ...(data.fixed || []).map(([id, name, packed]) => [id, { id, name, packed, fixed: true }]),
    ]);
    weatherGroupList = null;
  }
  const loadWeather = () => { if (!weatherIndex && root.VanaWeatherData) useWeatherData(root.VanaWeatherData); return !!weatherIndex; };
  const unpack = (v) => ({ normal: v >> 10, common: (v >> 5) & 31, rare: v & 31 });
  function weatherOf(zoneId, dayNumber) {
    const z = loadWeather() && weatherIndex.get(zoneId);
    if (!z) return null;
    if (z.fixed) return unpack(z.packed);
    const [palette, days] = weatherData.patterns[z.pattern];
    return unpack(palette[weatherData.alphabet.indexOf(days[mod(dayNumber, weatherData.cycle)])]);
  }
  function weatherZones() {
    return loadWeather() ? [...weatherIndex.values()].map(({ id, name, fixed }) => ({ id, name, fixed: !!fixed })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  }
  // Outside cities the server turns any roll below Hot Spell (Clear, Sunshine, Clouds) into Fog from
  // 02:00 to 07:00. LandSandBoat's own comment says retail fog is not simply a time of day; this is
  // what its servers do. A zone fixed on an elemental weather never rolls anything else.
  const FOG = 3, FOG_FROM = 2, FOG_TO = 7;
  const isCity = (zoneId) => loadWeather() && (weatherData.cities || []).includes(zoneId);
  function hasMorningFog(zoneId) {
    const z = loadWeather() && weatherIndex.get(zoneId);
    return !!z && !isCity(zoneId) && (!z.fixed || unpack(z.packed).normal < 4);
  }
  // Zones that share a pattern, or the same fixed weather, always have the same weather: one group.
  function weatherGroups() {
    if (!loadWeather()) return [];
    if (!weatherGroupList) {
      const groups = new Map();
      for (const z of weatherZones()) {
        const full = weatherIndex.get(z.id), key = full.fixed ? `f${full.packed}` : `p${full.pattern}`;
        if (!groups.has(key)) groups.set(key, { key, fixed: z.fixed, zones: [] });
        groups.get(key).zones.push({ id: z.id, name: z.name });
      }
      weatherGroupList = [...groups.values()];
    }
    return weatherGroupList;
  }

  // The best slot any of `ids` takes on a day: 0 usual, 1 common, 2 rare, -1 not that day.
  const weatherTier = (w, ids) => (ids.includes(w.normal) ? 0 : ids.includes(w.common) ? 1 : ids.includes(w.rare) ? 2 : -1);
  // How often the server shows each slot, by LandSandBoat's estimate. Used only to rank zones.
  const TIER_SHARE = [0.5, 0.35, 0.15];

  // Every stretch in the next `days` Vana'diel days when one of the weathers can happen, per zone
  // group, best slot first and soonest first within it. A fixed zone is one entry marked `always`.
  function findWeather(t, ids, days = 16) {
    const today = clock(t).dayNumber, out = [];
    for (const g of weatherGroups()) {
      if (g.fixed) {
        const w = weatherOf(g.zones[0].id, today);
        if (weatherTier(w, ids) >= 0) out.push({ group: g, tier: 0, weather: w.normal, always: true, start: t, end: Infinity });
        continue;
      }
      let run = null;
      for (let n = today; n <= today + days; n++) {
        const w = n < today + days ? weatherOf(g.zones[0].id, n) : null, tier = w ? weatherTier(w, ids) : -1;
        if (run && run.tier === tier) { run.end = dayStartOf(n + 1); continue; }
        if (run) out.push(run);
        run = tier >= 0 ? { group: g, tier, weather: [w.normal, w.common, w.rare][tier], always: false, start: dayStartOf(n), end: dayStartOf(n + 1) } : null;
      }
    }
    return out.sort((a, b) => a.tier - b.tier || b.always - a.always || a.start - b.start);
  }
  // For each zone group, how many days of the 2,160-day cycle the weathers are usual, common or rare,
  // ranked by how much of the cycle they are likely to cover.
  function weatherOdds(ids) {
    const out = [];
    for (const g of weatherGroups()) {
      const counts = [0, 0, 0];
      for (let d = 0; d < weatherData.cycle; d++) {
        const tier = weatherTier(weatherOf(g.zones[0].id, d), ids);
        if (tier >= 0) counts[tier]++;
      }
      if (counts[0] + counts[1] + counts[2]) out.push({ group: g, counts, share: counts.reduce((s, c, i) => s + c * TIER_SHARE[i], 0) / weatherData.cycle });
    }
    return out.sort((a, b) => b.share - a.share || b.counts[0] - a.counts[0]);
  }

  // ---- Fishing ----
  // LandSandBoat's fishing applies the same timing to every fish (fishingutils.cpp). Its fish table
  // also lists hour, moon and month patterns for each fish, but the server never loads them.
  // The moon index it uses comes from its own GetMoonPhase, whose ranges differ a little from the moon
  // names elsewhere; percents that fall in a gap count as New Moon, and of the percents the moon
  // reaches, only 43% waning does.
  function fishingMoon(percent, direction) {
    const waxing = direction === 'waxing', waning = direction === 'waning';
    if (percent <= 5 || (percent <= 10 && waning)) return 0;
    if (percent >= 7 && percent <= 38 && waxing) return 1;
    if (percent >= 40 && percent <= 55 && waxing) return 2;
    if (percent >= 57 && percent <= 88 && waxing) return 3;
    if (percent >= 95 || (percent >= 90 && waxing)) return 4;
    if (percent >= 62 && percent <= 93 && waning) return 5;
    if (percent >= 45 && percent <= 60 && waning) return 6;
    if (percent >= 12 && percent < 43 && waning) return 7;
    return 0;
  }
  // What the moon adds to the weight of hooking a fish rather than an item, a monster or nothing, by
  // that index: floor(25 * MOONPATTERN_4) outdoors and floor(15 * MOONPATTERN_4) in cities.
  const FISH_MOON = [0, 4, 15, 23, 23, 15, 4, 0], FISH_MOON_CITY = [0, 2, 9, 14, 14, 9, 2, 0];
  const FISH_MOON_BEST = 23;
  // Rain multiplies the fish weight by 1.1 and a squall by 1.2; nothing else about weather counts.
  const FISH_WEATHER = { 6: 1.1, 7: 1.2 };
  // The wait for a bite: 13, less 4 at New or Full Moon and less 1 at 05:00 or 17:00 (GetHookTime).
  const BITE_WAIT = 13, BITE_HOURS = [5, 17];
  const fishingMoonOfDay = (dayNumber) => { const m = moonOfDay(dayNumber); return fishingMoon(m.percent, m.direction); };

  // Stretches of whole days from t on when the moon gives fish its best weight (Waxing Gibbous and Full
  // Moon by the index above). A stretch already under way keeps its real start.
  function bestFishingMoons(t, count = 4) {
    const best = (n) => FISH_MOON[fishingMoonOfDay(n)] === FISH_MOON_BEST, today = clock(t).dayNumber, out = [];
    let n = today;
    if (best(today)) while (n > today - 84 && best(n - 1)) n--;
    for (let cur = null; out.length < count && n < today + 84 * (count + 1); n++) {
      if (best(n)) { if (cur) cur.end = dayStartOf(n + 1); else cur = { start: dayStartOf(n), end: dayStartOf(n + 1) }; }
      else if (cur) { out.push(cur); cur = null; }
    }
    return out;
  }

  // Fish, baits and fishing spots from fishing-data.js, which the page loads and the tests pass in.
  let fishingData = null, fishById = null;
  function useFishingData(data) {
    fishingData = data;
    const baits = new Map(data.baits.map(([id, name, type]) => [id, { id, name, type }]));
    fishById = new Map(data.fish.map(([id, name, skill, size, rarity, legendary, keyItem, bites]) => [id, {
      id, name, skill, large: size === 1, rarity, legendary: !!legendary, keyItem,
      baits: bites.map(([b, power]) => ({ ...baits.get(b), power })),
    }]));
  }
  const loadFishing = () => { if (!fishById && root.VanaFishingData) useFishingData(root.VanaFishingData); return !!fishById; };
  const fishList = () => (loadFishing() ? [...fishById.values()] : []);
  const fishOf = (id) => (loadFishing() && fishById.get(id)) || null;
  // Where a fish can bite: each fishing area whose catch list has it.
  function fishSpots(id) {
    if (!loadFishing()) return [];
    return fishingData.spots.filter((s) => s[4].includes(id)).map(([zoneId, zone, area, difficulty]) => ({ zoneId, zone, area, difficulty }));
  }

  // ---- Personal timers ----
  // Lockouts as LandSandBoat's default settings set them. A rule says when one that started at
  // `start` ends: a number of Earth hours later, or at the next JP midnight, Vana'diel midnight or
  // conquest tally. Dynamis counts JP midnights (DYNA_MIDNIGHT_RESET), so it opens after the next one.
  const TIMER_KINDS = [
    { id: 'dynamis', name: 'Dynamis', rule: 'jp' },
    { id: 'enm', name: 'ENM key item', rule: 'hours', hours: 120 },
    { id: 'assault', name: 'Assault ID tag', rule: 'hours', hours: 24 },
    { id: 'hunt', name: 'Hunt Registry', rule: 'vana' },
    { id: 'regime', name: 'Fields or Grounds of Valor page', rule: 'vana' },
    { id: 'isnm', name: 'ISNM order', rule: 'jp' },
    { id: 'keys', name: 'ACP, AMK or ASA key', rule: 'jp' },
    { id: 'garrison', name: 'Garrison', rule: 'tally' },
    { id: 'ring', name: 'Conquest EXP ring', rule: 'tally' },
    { id: 'weekly', name: 'Weekly quest', rule: 'tally' },
    { id: 'custom', name: 'Custom', rule: 'hours' },
  ];
  function timerReady(rule, start, hours = 0) {
    if (rule === 'hours') return start + hours * 3600000;
    if (rule === 'jp') return nextJpMidnight(start);
    if (rule === 'vana') return clock(start).dayStart + DAY;
    if (rule === 'tally') return nextConquestTally(start);
    return null;
  }

  // ---- Elemental magic ----
  // Day and weather change elemental magic damage (damage_spell.lua calculateDayAndWeather): the
  // element's single weather adds 10% and its double weather 25%, its day adds 10%; the opposed
  // element's weathers take off 10% and 25% and its day 10%; the total is capped at +40%. Each is
  // checked on a third of casts, on every cast with the element's obi (bonuses only), and on every
  // cast with Hachirin-no-Obi (bonuses and penalties).
  const OPPOSED = { fire: 'water', ice: 'fire', wind: 'ice', earth: 'wind', lightning: 'earth', water: 'lightning', light: 'dark', dark: 'light' };
  const MAGIC_CAP = 40, MAGIC_ROLL = 33;
  function weatherEffect(element, weatherId) {
    const e = WEATHER_ELEMENT[weatherId], double = isDoubleWeather(weatherId);
    return e === element ? (double ? 25 : 10) : e && e === OPPOSED[element] ? (double ? -25 : -10) : 0;
  }
  function dayEffect(element, weekday) {
    const day = DAYS[weekday].element;
    return day === element ? 10 : day === OPPOSED[element] ? -10 : 0;
  }
  // A day's effect in a zone: the day's part, each weather slot's part, and the best and worst totals.
  function magicDay(element, zoneId, dayNumber) {
    const day = dayEffect(element, mod(dayNumber, 8)), w = weatherOf(zoneId, dayNumber);
    const slots = w ? [w.normal, w.common, w.rare].map((id) => ({ id, effect: weatherEffect(element, id) })) : [];
    const effects = slots.length ? slots.map((s) => s.effect) : [0];
    return { day, slots, best: Math.min(MAGIC_CAP, day + Math.max(...effects)), worst: day + Math.min(...effects) };
  }

  // ---- Notorious monsters ----
  // NMs that can only appear at certain hours, under a certain moon or in certain weather, from
  // nm-data.js. The moons the server checks (xi.moonCycle, scripts/utils/common.lua) use the same
  // percent ranges as the phases here; it splits each crescent and gibbous into a lesser and a greater
  // half, and an NM that names both halves gets the whole phase.
  const MOON_CYCLE_PHASE = {
    NEW_MOON: NEW, LESSER_WAXING_CRESCENT: 1, GREATER_WAXING_CRESCENT: 1, FIRST_QUARTER: 2, LESSER_WAXING_GIBBOUS: 3, GREATER_WAXING_GIBBOUS: 3,
    FULL_MOON: FULL, GREATER_WANING_GIBBOUS: 5, LESSER_WANING_GIBBOUS: 5, THIRD_QUARTER: 6, GREATER_WANING_CRESCENT: 7, LESSER_WANING_CRESCENT: 7,
  };
  let nmData = null;
  const useNmData = (data) => { nmData = data; };
  const nmList = () => { if (!nmData && root.VanaNmData) nmData = root.VanaNmData; return nmData || []; };
  // Fog in these NMs' zones only ever comes from the morning fog: the zones never roll Fog itself (a
  // test checks it), and outside cities a Clear, Sunshine or Clouds roll shows as Fog from 02:00 to 07:00.
  const isFogOnly = (nm) => !!nm.weather && nm.weather.length === 1 && nm.weather[0] === FOG;
  // An NM's conditions as a search for findWindows.
  function nmQuery(nm) {
    const fog = isFogOnly(nm);
    return {
      hours: fog ? [[FOG_FROM, FOG_TO]] : nm.hours, weekdays: nm.weekday == null ? [] : [nm.weekday],
      phases: [...new Set((nm.moon || []).map((m) => MOON_CYCLE_PHASE[m]))].sort((a, b) => a - b),
      zone: nm.weather ? nm.zoneId : null, weatherIds: fog ? [0, 1, 2, FOG] : nm.weather || [],
    };
  }

  // ---- Calendars and the planner ----
  function nextDays(t, count, weekday = null) {
    const out = [];
    for (let n = clock(t).dayNumber; out.length < count; n++) {
      if (weekday !== null && mod(n, 8) !== weekday) continue;
      out.push({ start: dayStartOf(n), end: dayStartOf(n + 1), weekday: mod(n, 8), moon: moonOfDay(n), dayNumber: n });
    }
    return out;
  }

  // Hour spans of one day for a from/to pair; to < from wraps past midnight, equal means all day.
  function hourSegments(from, to) {
    if (from == null || to == null || from === to) return [[0, 24]];
    return from < to ? [[from, to]] : [[0, to], [from, 24]];
  }

  // Windows from t on when every condition holds, merged across midnights. Weekday, moon and weather
  // are per-day conditions; hours narrow each matching day. A window already open at t is included.
  // Weather needs a zone and elements; weatherChance 'usual' accepts only the day's normal weather.
  // Two forms the planner's own controls don't make: `hours`, a list of [from, to) hour spans in place
  // of from/to, and `weatherIds`, exact weathers in place of elements.
  // Weekdays repeat every 8 days, the moon every 84 and weather every 2,160, so every combination
  // recurs within their least common multiple, 15,120 days: a search that long that finds nothing
  // means never.
  const FULL_CYCLE = 15120;
  function findWindows(t, query, count = 8, horizonDays = FULL_CYCLE) {
    const q = query || {}, segs = q.hours && q.hours.length ? [...q.hours].sort((a, b) => a[0] - b[0]) : hourSegments(q.from, q.to);
    const minP = q.minPercent ?? 0, maxP = q.maxPercent ?? 100;
    const wxIds = q.zone == null ? null
      : q.weatherIds && q.weatherIds.length ? q.weatherIds
      : q.weatherElements && q.weatherElements.length ? weatherIdsFor(q.weatherElements, q.weatherDouble) : null;
    const weatherMatches = (n) => {
      const w = weatherOf(q.zone, n);
      return !!w && (wxIds.includes(w.normal) || (q.weatherChance !== 'usual' && (wxIds.includes(w.common) || wxIds.includes(w.rare))));
    };
    const dayMatches = (n) => {
      const m = moonOfDay(n);
      return (!q.weekdays || !q.weekdays.length || q.weekdays.includes(mod(n, 8)))
        && (!q.phases || !q.phases.length || q.phases.includes(m.phase))
        && m.percent >= minP && m.percent <= maxP
        && (!wxIds || weatherMatches(n));
    };
    const out = [];
    let cur = null;
    // Walk back over matching days so a window already open at t (a full moon is 7 days long)
    // keeps its real start. One moon cycle back is as far as any condition can run unbroken.
    const today = clock(t).dayNumber;
    let first = today;
    while (first > today - 84 && dayMatches(first - 1)) first--;
    for (let n = first; n < today + horizonDays && out.length < count; n++) {
      if (!dayMatches(n)) continue;
      for (const [a, b] of segs) {
        const start = dayStartOf(n) + a * HOUR, end = dayStartOf(n) + b * HOUR;
        if (cur && cur.end === start) { cur.end = end; continue; }
        if (cur && cur.end > t) out.push(cur);
        cur = { start, end };
        if (out.length >= count) break;
      }
    }
    if (cur && cur.end > t && out.length < count) out.push(cur);
    return out.slice(0, count);
  }

  // ---- Calendar files ----
  // An iCalendar file (RFC 5545) of timed events for a calendar app to import. Times are UTC; text is
  // escaped, and lines are folded at 75 octets with continuation lines starting with a space.
  const icsTime = (t) => new Date(t).toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '');
  const icsText = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  function icsFold(line) {
    const out = [];
    let cur = '', octets = 0;
    for (const ch of line) {
      const cp = ch.codePointAt(0), n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (octets + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; octets = 0; }
      cur += ch; octets += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  // events: { uid, start, end, summary, description?, alarmMinutes? }. `stamp` is when it was made.
  function icsCalendar(events, stamp) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ffxi-timer//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${icsTime(stamp)}`, `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`, `SUMMARY:${icsText(e.summary)}`);
      if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
      if (e.alarmMinutes != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.summary)}`, `TRIGGER:-PT${e.alarmMinutes}M`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
  }

  const Vana = {
    SEC, MIN, HOUR, DAY, WEEK, MONTH, YEAR, EPOCH, BASE_YEAR, EARTH_DAY, JST,
    ELEMENTS, DAYS, MOON_PHASES, FULL, NEW, RSE_RACES, RSE_PLACES, RSE_DUNGEONS, RSE_GEAR, RUNS, ROUTES, SHOPS, GUILDS,
    mod, clock, dayStartOf, fromVana, minuteOfDay, isDaytime, phaseOf, moonOfDay, moon, nextPhaseChange,
    rse, rseOfWeek, rseWeeks, nextJpMidnight, nextConquestTally,
    routeStatus, nextDeparture, departureMinutes, PORTS, portsFrom, earliestTrip, findTrips, guildStatus, nextGuildOpening,
    WEATHERS, WEATHER_ELEMENT, isDoubleWeather, weatherIdsFor, useWeatherData, weatherOf, weatherZones,
    FOG, FOG_FROM, FOG_TO, isCity, hasMorningFog, weatherGroups, weatherTier, findWeather, weatherOdds,
    fishingMoon, fishingMoonOfDay, FISH_MOON, FISH_MOON_CITY, FISH_MOON_BEST, FISH_WEATHER, BITE_WAIT, BITE_HOURS,
    bestFishingMoons, useFishingData, fishList, fishOf, fishSpots, MOON_CYCLE_PHASE, useNmData, nmList, nmQuery, isFogOnly,
    OPPOSED, MAGIC_CAP, MAGIC_ROLL, weatherEffect, dayEffect, magicDay, TIMER_KINDS, timerReady,
    nextDays, hourSegments, findWindows, icsCalendar,
  };
  if (typeof module === 'object' && module.exports) module.exports = Vana;
  else root.Vana = Vana;
})(typeof globalThis !== 'undefined' ? globalThis : this);
