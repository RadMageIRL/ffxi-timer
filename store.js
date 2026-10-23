// Saved settings and alarms, checked before the page uses them. Every field is checked against what the
// page can show: a value it can't use is repaired or put back to its default on its own, and from a list
// only the bad entries go, so one damaged timer or alarm never costs the rest. Valid data comes back as it
// went in. Pure functions, shared by the page and the Node tests like vana.js.
(function (root) {
  'use strict';

  const EMPTY_QUERY = {
    weekdays: [], phases: [], from: null, to: null, minPercent: null, maxPercent: null,
    zone: null, weatherElements: [], weatherDouble: false, weatherChance: 'any',
  };
  const DEFAULTS = {
    hour12: null, sound: true, starred: [], routeTab: 'airship', guildCraft: 'all', guildOpenOnly: false, guildHolidays: false,
    calTab: 'days', calCount: 10, calWeekday: -1, calPhase: 'fullnew', calRace: -1, planner: EMPTY_QUERY, lead: 3,
    wxZone: 103, wxCount: 8, discord: '', wxFind: [], wxFindDays: 16, starredZones: [], savedPlans: [],
    view: 'full', tripFrom: 'Port Bastok', tripTo: 'Kazham', tripTransfer: 1, fishId: 4401, // Moat Carp
    nmKills: {}, magicElement: 'fire', magicZone: 103, timers: [], timerKind: 'dynamis', server: 'retail',
  };
  const LEADS = [1, 2, 3, 5, 10];
  const DISCORD_URL = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;
  const ELEMENT_KEYS = ['fire', 'ice', 'wind', 'earth', 'lightning', 'water', 'light', 'dark'];
  const ALARM_KINDS = ['route', 'guild', 'jp', 'conquest', 'moon', 'planner', 'nm', 'timer'];
  // Kill times and timer starts have to fall between 2000 and 2200, so every time worked out from them
  // is a date the browser can show.
  const TIME_MIN = Date.UTC(2000, 0, 1), TIME_MAX = Date.UTC(2200, 0, 1), HOUR_MS = 3600000;
  // What a key holds when it was saved but can't be parsed.
  const UNREADABLE = Object.freeze({ unreadable: true });
  // Names for the repair notes; other settings are named by their key.
  const LABELS = {
    starred: 'Starred routes', starredZones: 'Starred zones', savedPlans: 'Saved searches', timers: 'Timers', nmKills: 'NM kill times',
    planner: 'The planner search', discord: 'The Discord webhook', wxFind: 'The weather finder search',
  };

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const validTime = (t) => typeof t === 'number' && Number.isFinite(t) && t >= TIME_MIN && t <= TIME_MAX;
  const guildKey = (g) => g.npc.split(',')[0]; // NPC names are unique, craft and place are not
  const nmKey = (nm) => `${nm.name}|${nm.zoneId}`; // two NMs can share a name in different zones
  // A search with no condition, as the planner treats it.
  const isEmptyQuery = (q) => !q.weekdays.length && !q.phases.length && q.from == null && q.minPercent == null && q.maxPercent == null
    && !(q.zone != null && q.weatherElements.length);

  // Stored text as a value: undefined when nothing is saved, UNREADABLE when it isn't JSON.
  function parse(text) {
    if (text == null) return undefined;
    try { return JSON.parse(text); } catch (e) { return UNREADABLE; }
  }

  // The ids the page knows, from vana.js and its data files.
  function context(V) {
    return {
      routes: new Set(V.ROUTES.map((r) => r.id)), guilds: new Set(V.SHOPS.map(guildKey)), crafts: new Set(V.SHOPS.map((g) => g.craft)),
      ports: new Set(V.PORTS), zones: new Set(V.weatherZones().map((z) => z.id)), fish: new Set(V.fishList().map((f) => f.id)),
      nms: new Set(V.nmList().map(nmKey)), timerKinds: new Set(V.TIMER_KINDS.map((k) => k.id)), weathers: V.WEATHERS.length,
    };
  }

  // A check gives { value, notes } for something it can use, notes saying what it had to repair, or
  // null when nothing in it can be used.
  const ok = (value, notes = []) => ({ value, notes });
  const accept = (test) => (v) => (test(v) ? ok(v) : null);
  const oneOf = (list) => accept((v) => list.includes(v));
  const bool = accept((v) => typeof v === 'boolean');
  const intIn = (lo, hi) => accept((v) => Number.isInteger(v) && v >= lo && v <= hi);
  const inSet = (set) => accept((v) => set.has(v));
  const nullable = (check) => (v) => (v === null ? ok(v) : check(v));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // A list keeps the entries it can use, in order, without repeats.
  const listOf = (check, keyOf = (v) => JSON.stringify(v)) => (v) => {
    if (!Array.isArray(v)) return null;
    const value = [], seen = new Set(), notes = [];
    for (const x of v) {
      const r = check(x);
      if (!r || seen.has(keyOf(r.value))) continue;
      seen.add(keyOf(r.value));
      value.push(r.value);
      notes.push(...r.notes);
    }
    if (value.length < v.length) notes.push(`left out ${plural(v.length - value.length, 'entry', 'entries')} that could not be used`);
    return ok(value, notes);
  };

  // A planner search. Only the fields the planner makes are kept: findWindows also reads `hours` and
  // `weatherIds`, which a stored search never has.
  function checkQuery(q, ctx) {
    if (!isObject(q)) return null;
    const out = {}, notes = [];
    const take = (field, check) => {
      if (!own(q, field)) { out[field] = copy(EMPTY_QUERY[field]); return; }
      const r = check(q[field]);
      if (r) { out[field] = r.value; notes.push(...r.notes); } else { out[field] = copy(EMPTY_QUERY[field]); notes.push(`its ${field} was reset`); }
    };
    take('weekdays', listOf(intIn(0, 7)));
    take('phases', listOf(intIn(0, 7)));
    take('from', nullable(intIn(0, 23)));
    take('to', nullable(intIn(1, 24)));
    take('minPercent', nullable(intIn(0, 100)));
    take('maxPercent', nullable(intIn(0, 100)));
    take('zone', nullable(inSet(ctx.zones)));
    take('weatherElements', listOf(oneOf(ELEMENT_KEYS)));
    take('weatherDouble', bool);
    take('weatherChance', oneOf(['any', 'usual']));
    // The planner sets an end hour whenever it sets a start; without one the range would mean all day.
    if (out.from !== null && out.to === null) { out.to = 24; notes.push('its hour range was given an end'); }
    if (Object.keys(q).some((k) => !own(EMPTY_QUERY, k))) notes.push('fields it does not use were removed');
    return ok(out, notes);
  }

  function checkTimer(x, ctx) {
    if (!isObject(x) || typeof x.id !== 'string' || !x.id || !ctx.timerKinds.has(x.kind) || !validTime(x.start)) return null;
    if (x.kind === 'custom' && !(typeof x.hours === 'number' && x.hours > 0 && validTime(x.start + x.hours * HOUR_MS))) return null;
    const t = { ...x }, notes = [];
    if (typeof x.label !== 'string') { t.label = ''; if (own(x, 'label')) notes.push('a note that was not text was cleared'); }
    return ok(t, notes);
  }

  function checkKills(v, ctx) {
    if (!isObject(v)) return null;
    const value = {};
    let left = 0;
    for (const [key, t] of Object.entries(v)) { if (ctx.nms.has(key) && validTime(t)) value[key] = t; else left++; }
    return ok(value, left ? [`left out ${plural(left, 'entry', 'entries')} that could not be used`] : []);
  }

  // The settings object. Fields this version doesn't know are kept as they are, for the version that
  // wrote them; a missing field takes its default without counting as a repair.
  function checkSettings(raw, ctx) {
    const notes = [];
    if (raw === UNREADABLE) { notes.push('Settings could not be read, so the defaults are in use'); raw = {}; }
    else if (raw === undefined) raw = {};
    else if (!isObject(raw)) { notes.push('Settings were not a settings object, so the defaults are in use'); raw = {}; }
    const out = { ...raw };
    const take = (field, check) => {
      if (!own(raw, field)) { out[field] = copy(DEFAULTS[field]); return; }
      const r = check(raw[field]), label = LABELS[field] || `The ${field} setting`;
      if (!r) { out[field] = copy(DEFAULTS[field]); notes.push(`${label} could not be used and was reset`); return; }
      out[field] = r.value;
      for (const n of r.notes) notes.push(`${label}: ${n}`);
    };
    take('hour12', nullable(bool));
    take('sound', bool);
    take('starred', listOf(inSet(ctx.routes)));
    take('routeTab', oneOf(['airship', 'ferry', 'manaclipper', 'barge', 'starred']));
    take('guildCraft', accept((v) => v === 'all' || ctx.crafts.has(v)));
    take('guildOpenOnly', bool);
    take('guildHolidays', bool);
    take('calTab', oneOf(['days', 'moon', 'rse']));
    take('calCount', oneOf([5, 10, 20, 40]));
    take('calWeekday', intIn(-1, 7));
    take('calPhase', accept((v) => v === 'fullnew' || (Number.isInteger(v) && v >= 0 && v <= 7)));
    take('calRace', intIn(-1, 7));
    take('planner', (v) => checkQuery(v, ctx));
    take('lead', oneOf(LEADS));
    take('wxZone', inSet(ctx.zones));
    take('wxCount', oneOf([8, 16, 32, 64]));
    take('discord', accept((v) => v === '' || (typeof v === 'string' && DISCORD_URL.test(v))));
    take('wxFind', listOf(intIn(1, ctx.weathers - 1)));
    take('wxFindDays', oneOf([8, 16, 32, 64]));
    take('starredZones', listOf(inSet(ctx.zones)));
    take('savedPlans', listOf((q) => { const r = checkQuery(q, ctx); return r && !isEmptyQuery(r.value) ? r : null; }));
    take('view', oneOf(['full', 'simple']));
    take('tripFrom', inSet(ctx.ports));
    take('tripTo', inSet(ctx.ports));
    take('tripTransfer', oneOf([0, 1, 2, 3, 5]));
    take('fishId', inSet(ctx.fish));
    take('nmKills', (v) => checkKills(v, ctx));
    take('magicElement', oneOf(ELEMENT_KEYS));
    take('magicZone', inSet(ctx.zones));
    take('timers', listOf((x) => checkTimer(x, ctx), (x) => x.id));
    take('timerKind', inSet(ctx.timerKinds));
    take('server', oneOf(['retail', 'horizon', 'lsb']));
    return ok(out, notes);
  }

  // Each alarm needs a kind the page has and a ref that still points at something; a bad warning, on
  // switch or Discord switch is repaired rather than losing the alarm. `settings` is the checked
  // settings, for the timers alarms point at and the default warning.
  const alarmKey = (a) => `${a.kind}:${a.kind === 'planner' ? JSON.stringify(a.ref) : a.ref}`;
  function checkAlarm(a, ctx, timers, lead) {
    if (!isObject(a) || typeof a.kind !== 'string' || !ALARM_KINDS.includes(a.kind)) return null;
    const out = { ...a };
    let fixed = false;
    if (a.kind === 'route' && !ctx.routes.has(a.ref)) return null;
    if (a.kind === 'guild' && !ctx.guilds.has(a.ref)) return null;
    if (a.kind === 'nm' && !ctx.nms.has(a.ref)) return null;
    if (a.kind === 'timer' && !timers.has(a.ref)) return null;
    if ((a.kind === 'jp' || a.kind === 'conquest') && a.ref !== '') { out.ref = ''; fixed = true; }
    if (a.kind === 'moon') {
      if (a.ref !== '0' && a.ref !== '4' && a.ref !== 0 && a.ref !== 4) return null;
      if (typeof a.ref === 'number') { out.ref = String(a.ref); fixed = true; }
    }
    if (a.kind === 'planner') {
      const q = checkQuery(a.ref, ctx);
      if (!q || isEmptyQuery(q.value)) return null;
      out.ref = q.value;
      if (q.notes.length) fixed = true;
    }
    if (!LEADS.includes(a.lead)) { out.lead = lead; fixed = true; }
    if (typeof a.on !== 'boolean') { out.on = true; fixed = true; }
    // Alarms saved before the per-alarm Discord switch have no `discord` field, which means on.
    if (own(a, 'discord') && typeof a.discord !== 'boolean') { delete out.discord; fixed = true; }
    return { value: out, fixed };
  }
  function checkAlarms(raw, ctx, settings) {
    const notes = [];
    if (raw === undefined) return ok([], notes);
    if (raw === UNREADABLE || !Array.isArray(raw)) {
      notes.push(raw === UNREADABLE ? 'Alarms could not be read' : 'Alarms were not a list, so none could be kept');
      return ok([], notes);
    }
    const timers = new Set(settings.timers.map((x) => x.id)), value = [], seen = new Set();
    let fixed = 0;
    for (const a of raw) {
      const r = checkAlarm(a, ctx, timers, settings.lead);
      if (!r || seen.has(alarmKey(r.value))) continue;
      seen.add(alarmKey(r.value));
      value.push(r.value);
      if (r.fixed) fixed++;
    }
    if (value.length < raw.length) notes.push(`Alarms: left out ${plural(raw.length - value.length, 'alarm', 'alarms')} that could not be used`);
    if (fixed) notes.push(`Alarms: repaired ${plural(fixed, 'alarm', 'alarms')}`);
    return ok(value, notes);
  }

  // ---- Several tabs ----
  // Settings every open tab shares: another tab's change to one of these shows in this tab at once.
  // The rest is what a tab is looking at (the zone, the tab picked, the planner search being built):
  // each open tab keeps its own, and a new tab opens on whichever was changed last.
  const SHARED = ['hour12', 'sound', 'starred', 'guildHolidays', 'lead', 'discord', 'starredZones', 'savedPlans', 'nmKills', 'timers', 'tripTransfer', 'server'];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // A three-way merge of keyed lists, for a save that finds another tab saved first: start from what is
  // stored now (theirs), take out what this tab removed, and put in what it added or changed since
  // `base`, what it had before. An entry another tab removed stays removed.
  function mergeKeyed(base, mine, theirs, keyOf) {
    const b = new Map(base.map((x) => [keyOf(x), x])), m = new Map(mine.map((x) => [keyOf(x), x])), out = [], seen = new Set();
    for (const t of theirs) {
      const k = keyOf(t);
      if (seen.has(k) || (b.has(k) && !m.has(k))) continue;
      out.push(m.has(k) && !same(m.get(k), b.get(k)) ? m.get(k) : t);
      seen.add(k);
    }
    for (const x of mine) { const k = keyOf(x); if (!seen.has(k) && !b.has(k)) { out.push(x); seen.add(k); } }
    return out;
  }
  const mergeObject = (b, m, t) => Object.fromEntries(mergeKeyed(Object.entries(b), Object.entries(m), Object.entries(t), (e) => e[0]));
  const MERGES = {
    starred: (b, m, t) => mergeKeyed(b, m, t, (x) => x), starredZones: (b, m, t) => mergeKeyed(b, m, t, (x) => x),
    savedPlans: (b, m, t) => mergeKeyed(b, m, t, (q) => JSON.stringify(q)), timers: (b, m, t) => mergeKeyed(b, m, t, (x) => x.id), nmKills: mergeObject,
  };
  // Settings to save: the stored settings with every field this tab changed since `base`. Lists and
  // kill times merge entry by entry; any other field this tab changed is this tab's value.
  function mergeSettings(base, mine, theirs) {
    const out = { ...theirs };
    for (const k of Object.keys(mine)) {
      if (same(mine[k], base[k])) continue;
      out[k] = MERGES[k] ? MERGES[k](base[k] || copy(DEFAULTS[k]), mine[k], theirs[k] || copy(DEFAULTS[k])) : mine[k];
    }
    return out;
  }
  const mergeAlarms = (base, mine, theirs) => mergeKeyed(base, mine, theirs, alarmKey);

  // The theme is saved as plain text, with nothing saved meaning follow the system.
  const THEMES = ['system', 'light', 'dark', 'vana'];
  const checkTheme = (text) => (THEMES.includes(text) ? text : 'system');

  const VanaStore = {
    EMPTY_QUERY, DEFAULTS, LEADS, DISCORD_URL, ELEMENT_KEYS, ALARM_KINDS, THEMES, TIME_MIN, TIME_MAX, UNREADABLE,
    guildKey, nmKey, validTime, isEmptyQuery, parse, context, checkQuery, checkSettings, checkAlarms, checkTheme,
    SHARED, alarmKey, mergeKeyed, mergeSettings, mergeAlarms,
  };
  if (typeof module === 'object' && module.exports) module.exports = VanaStore;
  else root.VanaStore = VanaStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
