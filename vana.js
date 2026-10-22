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
  let weatherData = null, weatherIndex = null;
  function useWeatherData(data) {
    weatherData = data;
    weatherIndex = new Map(data.zones.map((z) => [z[0], z]));
  }
  function weatherOf(zoneId, dayNumber) {
    if (!weatherIndex && root.VanaWeatherData) useWeatherData(root.VanaWeatherData);
    const z = weatherIndex && weatherIndex.get(zoneId);
    if (!z) return null;
    const [palette, days] = weatherData.patterns[z[2]];
    const v = palette[weatherData.alphabet.indexOf(days[mod(dayNumber, weatherData.cycle)])];
    return { normal: v >> 10, common: (v >> 5) & 31, rare: v & 31 };
  }
  function weatherZones() {
    if (!weatherIndex && root.VanaWeatherData) useWeatherData(root.VanaWeatherData);
    return weatherData ? weatherData.zones.map(([id, name]) => ({ id, name })) : [];
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
  // Weekdays repeat every 8 days, the moon every 84 and weather every 2,160, so every combination
  // recurs within their least common multiple, 15,120 days: a search that long that finds nothing
  // means never.
  const FULL_CYCLE = 15120;
  function findWindows(t, query, count = 8, horizonDays = FULL_CYCLE) {
    const q = query || {}, segs = hourSegments(q.from, q.to);
    const minP = q.minPercent ?? 0, maxP = q.maxPercent ?? 100;
    const wxIds = q.zone != null && q.weatherElements && q.weatherElements.length ? weatherIdsFor(q.weatherElements, q.weatherDouble) : null;
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

  const Vana = {
    SEC, MIN, HOUR, DAY, WEEK, MONTH, YEAR, EPOCH, BASE_YEAR, EARTH_DAY, JST,
    ELEMENTS, DAYS, MOON_PHASES, FULL, NEW, RSE_RACES, RSE_PLACES, RSE_DUNGEONS, RSE_GEAR, RUNS, ROUTES, SHOPS, GUILDS,
    mod, clock, dayStartOf, minuteOfDay, isDaytime, phaseOf, moonOfDay, moon, nextPhaseChange,
    rse, rseOfWeek, rseWeeks, nextJpMidnight, nextConquestTally,
    routeStatus, nextDeparture, departureMinutes, guildStatus, nextGuildOpening,
    WEATHERS, WEATHER_ELEMENT, isDoubleWeather, weatherIdsFor, useWeatherData, weatherOf, weatherZones,
    nextDays, hourSegments, findWindows,
  };
  if (typeof module === 'object' && module.exports) module.exports = Vana;
  else root.Vana = Vana;
})(typeof globalThis !== 'undefined' ? globalThis : this);
