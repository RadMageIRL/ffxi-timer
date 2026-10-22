// ffxi-timer page logic. The time math lives in vana.js; this file renders it, keeps settings and
// runs the alarms. Live cells are written only when their text changes, so nothing flickers.
(function () {
  'use strict';
  const V = window.Vana;
  const $ = (id) => document.getElementById(id);
  const ROUTE = Object.fromEntries(V.ROUTES.map((r) => [r.id, r]));
  const GROUP = { airship: 'Airship', ferry: 'Ferry', manaclipper: 'Manaclipper', barge: 'Barge' };
  const guildKey = (g) => `${g.craft}|${g.place}`;
  const GUILD = Object.fromEntries(V.GUILDS.map((g) => [guildKey(g), g]));
  const miniMode = document.documentElement.classList.contains('mini-mode');

  // ---- Storage (every access guarded: private windows and blocked storage throw) ----
  const SETTINGS_KEY = 'ffxi_timer_settings', ALARMS_KEY = 'ffxi_timer_alarms', THEME_KEY = 'ffxi_timer_theme';
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
  const EMPTY_QUERY = { weekdays: [], phases: [], from: null, to: null, minPercent: null, maxPercent: null };
  const DEFAULTS = {
    hour12: null, sound: true, starred: [], routeTab: 'airship', guildCraft: 'all', guildOpenOnly: false,
    calTab: 'days', calCount: 10, calWeekday: -1, calPhase: 'fullnew', calRace: -1, planner: EMPTY_QUERY, lead: 3,
  };
  const settings = { ...DEFAULTS, ...load(SETTINGS_KEY, {}) };
  settings.planner = { ...EMPTY_QUERY, ...settings.planner };
  let gen = 0; // bumped on any settings change so every list rebuilds
  const persist = () => { save(SETTINGS_KEY, settings); gen++; };

  // ---- Formatting ----
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  const vanaHM = (t) => hm(V.minuteOfDay(t));
  const ceDate = (t) => { const c = V.clock(t); return `${c.year}-${pad(c.month)}-${pad(c.date)}`; };
  const localHour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
  const hour12 = () => settings.hour12 ?? localHour12;
  const formats = {};
  function earth(t, kind = 'time') {
    const key = kind + hour12();
    if (!formats[key]) {
      const h12 = hour12();
      formats[key] = new Intl.DateTimeFormat(undefined, {
        clock: { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: h12 },
        time: { hour: 'numeric', minute: '2-digit', hour12: h12 },
        day: { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: h12 },
        date: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: h12 },
        jst: { timeZone: 'Asia/Tokyo', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' },
      }[kind]);
    }
    return formats[key].format(t);
  }
  // Earth time with as much date as it needs to be unambiguous from now.
  const earthWhen = (t, now) => earth(t, t - now < 18 * 3600000 ? 'time' : t - now < 6 * V.EARTH_DAY ? 'day' : 'date');
  function countdown(ms) {
    if (ms <= 0) return '0:00';
    const s = Math.ceil(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${pad(h)}:${pad(m)}`;
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  }
  const short = (place) => place.replace(/^Port /, '').replace('Aht Urhgan Whitegate', 'Whitegate');

  // ---- DOM helpers ----
  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
    return e;
  }
  const setText = (e, s) => { if (e && e._t !== s) { e._t = s; e.textContent = s; } };
  const setClass = (e, c) => { if (e && e.className !== c) e.className = c; };
  const dayName = (i) => el('span', { class: `el-${V.DAYS[i].element}` }, el('span', { class: 'dot' }), V.DAYS[i].name);
  const BELL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75a3.9 3.9 0 0 0-3.9 3.9v2.5L2.7 10.6a.6.6 0 0 0 .52.9h9.56a.6.6 0 0 0 .52-.9L11.9 8.15v-2.5A3.9 3.9 0 0 0 8 1.75Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.4 13.1a1.7 1.7 0 0 0 3.2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  function bell(alarm, label) {
    const b = el('button', { class: 'bell', type: 'button', 'data-alarm': alarm, 'aria-label': label, title: label });
    b.insertAdjacentHTML('afterbegin', BELL);
    paintBell(b);
    return b;
  }

  // Rebuild a tbody only when its key changes or its contents expire; rows keep an update(now).
  function liveRows(tbody, key, now, build) {
    if (tbody._key !== key || now >= tbody._expires) {
      const { rows, expires = Infinity } = build();
      tbody._key = key; tbody._expires = expires; tbody._rows = rows;
      tbody.replaceChildren(...rows.map((r) => r.tr));
    }
    for (const r of tbody._rows) r.update?.(now);
  }
  const emptyRow = (cols, text) => ({ tr: el('tr', { class: 'empty' }, el('td', { colspan: cols, text })) });
  // An "In" cell for a span of time: a countdown to its start, or how long is left once it began.
  function spanCell(tr, start, end) {
    const td = el('td'), state = el('span', { class: 'state now', text: 'now' }), text = el('span', { class: 'count' });
    td.append(state, ' ', text);
    return { td, update(now) {
      const live = now >= start;
      state.hidden = !live; tr.classList.toggle('live', live);
      setText(text, live ? `ends in ${countdown(end - now)}` : countdown(start - now));
    } };
  }

  // ---- Alarms ----
  // Each alarm points at an event source by kind and ref. Due time is the event minus the warning.
  const LEADS = [1, 2, 3, 5, 10];
  function phaseStart(phase, after) {
    const w = V.findWindows(after, { phases: [phase] }, 3).find((x) => x.start > after);
    return w ? w.start : null;
  }
  const SOURCES = {
    route: { valid: (r) => !!ROUTE[r], next: (r, t) => V.nextDeparture(ROUTE[r], t), label: (r) => `${GROUP[ROUTE[r].group]} ${short(ROUTE[r].from)} → ${short(ROUTE[r].to)} departs` },
    guild: { valid: (r) => !!GUILD[r], next: (r, t) => V.nextGuildOpening(GUILD[r], t), label: (r) => `${GUILD[r].craft} guild, ${GUILD[r].place} opens` },
    jp: { valid: () => true, next: (r, t) => V.nextJpMidnight(t), label: () => 'JP midnight' },
    conquest: { valid: () => true, next: (r, t) => V.nextConquestTally(t), label: () => 'Conquest tally' },
    moon: { valid: (r) => r === '0' || r === '4', next: (r, t) => phaseStart(Number(r), t), label: (r) => `${V.MOON_PHASES[r]} begins` },
    planner: { valid: (r) => r && typeof r === 'object', next: (q, t) => { const w = V.findWindows(t, q, 3).find((x) => x.start > t); return w ? w.start : null; }, label: () => 'Planner window opens' },
  };
  const alarmId = (a) => (a.kind === 'planner' ? 'planner:' : `${a.kind}:${a.ref}`);
  let alarms = load(ALARMS_KEY, []).filter((a) => a && SOURCES[a.kind] && SOURCES[a.kind].valid(a.ref));
  const runtime = new Map(); // alarm id -> { event, due } or null when the source has no next event
  let alarmGen = 0;
  const saveAlarms = () => { save(ALARMS_KEY, alarms); alarmGen++; };
  const hasAlarm = (id) => alarms.some((a) => alarmId(a) === id);
  function paintBell(b) {
    const on = hasAlarm(b.dataset.alarm);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const refreshBells = () => document.querySelectorAll('.bell[data-alarm]').forEach(paintBell);

  function arm(a, after) {
    const event = SOURCES[a.kind].next(a.ref, after);
    runtime.set(alarmId(a), event == null ? null : { event, due: event - a.lead * 60000 });
  }
  function checkAlarms(now) {
    for (const a of alarms) {
      if (!a.on) continue;
      const id = alarmId(a);
      // A fresh alarm skips an event already inside its warning, rather than firing late on creation.
      if (!runtime.has(id)) arm(a, now + a.lead * 60000);
      const r = runtime.get(id);
      if (!r || now < r.due) continue;
      if (now < r.event) fire(a, r.event, now);
      arm(a, r.event);
    }
  }
  function fire(a, event, now) {
    const title = SOURCES[a.kind].label(a.ref);
    notify(title, `in ${countdown(event - now)} · ${vanaHM(event)} Vana'diel · ${earth(event, 'clock')} local`, alarmId(a));
  }
  function notify(title, body, tag) {
    toast(title, body);
    if (settings.sound) chime();
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, tag }); } catch (e) {}
    }
  }
  function toggleAlarm(kind, ref) {
    const id = kind === 'planner' ? 'planner:' : `${kind}:${ref}`;
    const i = alarms.findIndex((a) => alarmId(a) === id);
    if (i >= 0) { alarms.splice(i, 1); runtime.delete(id); }
    else {
      if (kind === 'planner') {
        if (isEmptyQuery(settings.planner)) { toast('Planner', 'Pick at least one condition first.'); return; }
        ref = JSON.parse(JSON.stringify(settings.planner));
      }
      alarms.push({ kind, ref, lead: settings.lead, on: true });
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(paintNotify, () => {});
    }
    saveAlarms();
    refreshBells();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.bell[data-alarm]');
    if (!b) return;
    const spec = b.dataset.alarm, i = spec.indexOf(':');
    toggleAlarm(spec.slice(0, i), spec.slice(i + 1));
  });

  // A two-note chime. Browsers only allow audio after a click, so the context is made on the first one.
  let audio = null;
  const unlockAudio = () => { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  function chime() {
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const t0 = audio.currentTime;
    [[880, 0], [1318.5, 0.16]].forEach(([freq, at]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.45);
      o.connect(g).connect(audio.destination);
      o.start(t0 + at); o.stop(t0 + at + 0.5);
    });
  }
  function toast(title, body) {
    const t = el('div', { class: 'toast', role: 'status' }, el('strong', { text: title }), body);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 9000);
  }

  // ---- Hero: clock, moon, resets ----
  // Lit part of the moon: a semicircle on the lit side closed by an elliptical terminator.
  function moonPath(percent, direction) {
    const r = 28, cx = 32, cy = 32, f = percent / 100;
    if (f <= 0) return '';
    if (f >= 1) return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;
    const waxing = direction === 'waxing', rx = (Math.abs(1 - 2 * f) * r).toFixed(2);
    return `M${cx} ${cy - r}A${r} ${r} 0 0 ${waxing ? 1 : 0} ${cx} ${cy + r}A${rx} ${r} 0 0 ${(f < 0.5) === waxing ? 0 : 1} ${cx} ${cy - r}Z`;
  }
  // Moon windows and RSE only change at Vana'diel midnight, so they are worked out once a day.
  let dayCache = { day: null };
  function daily(now) {
    const c = V.clock(now);
    if (dayCache.day === c.dayNumber) return dayCache;
    const win = (p) => V.findWindows(now, { phases: [p] }, 2);
    dayCache = { day: c.dayNumber, full: win(V.FULL), fresh: win(V.NEW), change: V.nextPhaseChange(now) };
    return dayCache;
  }
  // A Vana'diel second is 40 ms, so the big clock runs per animation frame; a 250 ms tick would
  // make its seconds jump six at a time.
  function frame() {
    if (!document.hidden) {
      const now = Date.now(), c = V.clock(now);
      setText($('v-time'), `${pad(c.hour)}:${pad(c.minute)}`);
      setText($('v-sec'), `:${pad(c.second)}`);
      $('v-marker').style.left = `${((now - c.dayStart) / V.DAY) * 100}%`;
    }
    requestAnimationFrame(frame);
  }
  let heroWeekday = -1;
  function renderHero(now) {
    const c = V.clock(now), d = V.DAYS[c.weekday];
    if (heroWeekday !== c.weekday) {
      heroWeekday = c.weekday;
      $('v-day').replaceChildren(dayName(c.weekday));
      $('v-elements').replaceChildren(
        el('span', { class: `el-chip el-${d.element}`, title: `${V.ELEMENTS[d.element]} gets the day bonus` }, `▲ ${V.ELEMENTS[d.element]}`, el('span', { class: 'lbl', text: 'day bonus' })),
        el('span', { class: `el-chip el-${d.weak}`, title: `${V.ELEMENTS[d.weak]} gets the day penalty` }, `▼ ${V.ELEMENTS[d.weak]}`, el('span', { class: 'lbl', text: 'day penalty' })),
      );
    }
    setText($('v-date'), `C.E. ${ceDate(now)}`);
    setText($('v-nextday'), `${V.DAYS[(c.weekday + 1) % 8].name} in ${countdown(c.dayStart + V.DAY - now)}`);
    setText($('v-tod'), V.isDaytime(c.hour) ? 'Daytime (06-18)' : 'Nighttime (18-06)');
    setText($('e-local'), earth(now, 'clock'));
    setText($('e-jst'), earth(now, 'jst'));

    const m = V.moon(now), cache = daily(now);
    setText($('moon-pct'), `${m.percent}%`);
    setText($('moon-name'), `${V.MOON_PHASES[m.phase]}${m.direction === 'peak' ? '' : `, ${m.direction}`}`);
    const path = moonPath(m.percent, m.direction);
    if ($('moon-lit')._d !== path) { $('moon-lit')._d = path; $('moon-lit').setAttribute('d', path); }
    if (cache.change) setText($('moon-next'), `${V.MOON_PHASES[cache.change.phase]} in ${countdown(cache.change.at - now)}`);
    const windowText = (w) => (!w ? '-' : now >= w.start ? `now, ends in ${countdown(w.end - now)}` : `in ${countdown(w.start - now)}`);
    setText($('moon-full'), windowText(cache.full[0]));
    setText($('moon-new'), windowText(cache.fresh[0]));

    const jp = V.nextJpMidnight(now), tally = V.nextConquestTally(now), r = V.rse(now), nextRace = V.rseOfWeek(Math.floor((r.end - V.EPOCH) / V.WEEK));
    setText($('r-jp'), `in ${countdown(jp - now)}`);
    setText($('r-conquest'), `in ${countdown(tally - now)} · ${earth(tally, 'day')}`);
    setText($('r-rse'), `${V.RSE_RACES[r.race]} · ${V.RSE_PLACES[r.place]}`);
    setText($('r-rse-next'), `${V.RSE_RACES[nextRace.race]} in ${countdown(r.end - now)}`);
  }

  // ---- Ships ----
  function routeRow(r, showGroup) {
    const starred = settings.starred.includes(r.id);
    const tr = el('tr');
    const chip = el('span', { class: 'state' }), opens = el('span', { class: 'sub' });
    const departs = el('span', { class: 'count' }), local = el('td', { class: 'hide-sm' }), inText = el('span', { class: 'count' });
    const lands = el('span'), landsLocal = el('div', { class: 'sub' });
    tr.append(
      el('td', { class: 'c-star' }, el('button', { class: `icon-btn${starred ? ' on' : ''}`, type: 'button', 'aria-pressed': starred ? 'true' : 'false', 'aria-label': `Star ${r.from} to ${r.to}`, title: 'Star: keep it in Starred and the mini clock', onclick: () => toggleStar(r.id) }, starred ? '★' : '☆')),
      el('td', { class: 'route-name', title: `${r.from} to ${r.to}` }, short(r.from), el('span', { class: 'arrow', text: '→' }), short(r.to), showGroup ? el('div', { class: 'sub', text: GROUP[r.group] }) : null),
      el('td', { class: 'hide-sm' }, chip, opens),
      el('td', {}, departs),
      local,
      el('td', {}, inText),
      el('td', { class: 'hide-sm' }, lands, landsLocal),
      el('td', { class: 'c-bell' }, bell(`route:${r.id}`, `Alarm before ${r.from} to ${r.to} departs`)),
    );
    return { tr, update(now) {
      const s = V.routeStatus(r, now);
      chip.hidden = s.state === 'away';
      setClass(chip, `state ${s.state}`);
      setText(chip, s.state === 'boarding' ? 'Boarding' : 'Arriving');
      opens.hidden = s.state !== 'away';
      setText(opens, `door opens in ${countdown(s.opens - now)}`);
      tr.classList.toggle('live', s.state === 'boarding');
      setText(departs, vanaHM(s.departs));
      setText(local, earth(s.departs, 'clock'));
      setText(inText, countdown(s.departs - now));
      setClass(inText, s.state === 'boarding' ? 'count soon' : 'count');
      setText(lands, vanaHM(s.lands));
      setText(landsLocal, earth(s.lands, 'time'));
    } };
  }
  function toggleStar(id) {
    const i = settings.starred.indexOf(id);
    if (i >= 0) settings.starred.splice(i, 1); else settings.starred.push(id);
    persist();
  }
  function renderRoutes(now) {
    const tab = settings.routeTab;
    liveRows($('routes'), `${tab}|${gen}`, now, () => {
      const list = tab === 'starred' ? V.ROUTES.filter((r) => settings.starred.includes(r.id)) : V.ROUTES.filter((r) => r.group === tab);
      return { rows: list.length ? list.map((r) => routeRow(r, tab === 'starred')) : [emptyRow(8, 'Star a route with ☆ to keep it here and in the mini clock.')] };
    });
  }

  // ---- Guilds ----
  const CRAFTS = [...new Set(V.GUILDS.map((g) => g.craft))];
  function guildRow(g) {
    const chip = el('span', { class: 'state' }), inText = el('span', { class: 'count' }), sub = el('div', { class: 'sub' });
    const tr = el('tr', {},
      el('td', { text: g.craft }), el('td', { class: 'place', text: g.place }),
      el('td', { class: 'hide-sm', text: `${pad(g.open)}:00-${pad(g.close)}:00` }), el('td', { class: 'hide-sm' }, dayName(g.holiday)),
      el('td', {}, chip), el('td', {}, inText, sub),
      el('td', { class: 'c-bell' }, bell(`guild:${guildKey(g)}`, `Alarm before the ${g.craft} guild in ${g.place} opens`)));
    return { tr, update(now) {
      const s = V.guildStatus(g, now);
      setClass(chip, `state ${s.open ? 'open' : s.holiday ? 'holiday' : 'closed'}`);
      setText(chip, s.open ? 'Open' : s.holiday ? 'Holiday' : 'Closed');
      tr.classList.toggle('live', s.open);
      setText(inText, `${s.open ? 'closes' : 'opens'} in ${countdown(s.until - now)}`);
      setText(sub, `${vanaHM(s.until)} · ${earth(s.until, 'time')}`);
    } };
  }
  function renderGuilds(now) {
    const key = `${settings.guildCraft}|${settings.guildOpenOnly}|${gen}`;
    liveRows($('guilds'), key, now, () => {
      let list = V.GUILDS.filter((g) => settings.guildCraft === 'all' || g.craft === settings.guildCraft);
      // With "open now" on, the list itself changes whenever any guild opens or closes.
      const expires = settings.guildOpenOnly ? Math.min(...list.map((g) => V.guildStatus(g, now).until)) : Infinity;
      if (settings.guildOpenOnly) list = list.filter((g) => V.guildStatus(g, now).open);
      return { rows: list.length ? list.map(guildRow) : [emptyRow(7, 'No guild in this filter is open right now.')], expires };
    });
  }
  function buildGuildFilter() {
    const chip = (label, active, onclick) => el('button', { class: `chip${active ? ' active' : ''}`, type: 'button', 'aria-pressed': active ? 'true' : 'false', onclick }, label);
    $('guild-filter').replaceChildren(
      chip('Open now', settings.guildOpenOnly, () => { settings.guildOpenOnly = !settings.guildOpenOnly; persist(); buildGuildFilter(); }),
      chip('All', settings.guildCraft === 'all', () => { settings.guildCraft = 'all'; persist(); buildGuildFilter(); }),
      ...CRAFTS.map((c) => chip(c, settings.guildCraft === c, () => { settings.guildCraft = c; persist(); buildGuildFilter(); })),
    );
  }

  // ---- Calendars ----
  const COUNTS = [5, 10, 20, 40];
  function selectOf(id, label, options, value, onchange) {
    return el('label', { class: 'option-group' }, el('span', { class: 'option-label', text: label }),
      el('select', { class: 'select', id, onchange: (e) => onchange(e.target.value) },
        options.map(([v, text]) => { const o = el('option', { value: String(v), text }); o.selected = String(v) === String(value); return o; })));
  }
  function buildCalendarControls() {
    const tab = settings.calTab, set = (k) => (v) => { settings[k] = isNaN(+v) ? v : +v; persist(); };
    const controls = [selectOf('cal-count', 'Show', COUNTS.map((n) => [n, String(n)]), settings.calCount, set('calCount'))];
    if (tab === 'days') controls.push(selectOf('cal-weekday', 'Day', [[-1, 'Every day'], ...V.DAYS.map((d, i) => [i, d.name])], settings.calWeekday, set('calWeekday')));
    if (tab === 'moon') controls.push(selectOf('cal-phase', 'Phase', [['fullnew', 'Full and new'], ...V.MOON_PHASES.map((p, i) => [i, p])], settings.calPhase, set('calPhase')));
    if (tab === 'rse') controls.push(selectOf('cal-race', 'Race', [[-1, 'Every race'], ...V.RSE_RACES.map((r, i) => [i, r])], settings.calRace, set('calRace')));
    $('cal-controls').replaceChildren(...controls);
    // A trailing "-" marks a column hidden on narrow screens.
    const heads = { days: ["Vana'diel day", 'C.E.-', 'Starts', 'In', 'Moon'], moon: ['Phase', 'Moon', 'Starts', 'Ends-', 'In'], rse: ['Race', 'Dungeon', 'Starts', 'Ends-', 'In'] }[tab];
    $('cal-head').replaceChildren(el('tr', {}, heads.map((h) => el('th', { text: h.replace(/-$/, ''), class: h.endsWith('-') ? 'hide-sm' : null }))));
  }
  function calendarItems(now) {
    const n = settings.calCount;
    if (settings.calTab === 'days') return V.nextDays(now, n, settings.calWeekday < 0 ? null : settings.calWeekday);
    if (settings.calTab === 'rse') return V.rseWeeks(now, n, settings.calRace < 0 ? null : settings.calRace);
    const phases = settings.calPhase === 'fullnew' ? [V.FULL, V.NEW] : [Number(settings.calPhase)];
    return phases.flatMap((p) => V.findWindows(now, { phases: [p] }, n)).sort((a, b) => a.start - b.start).slice(0, n);
  }
  function calendarRow(item, now) {
    const tr = el('tr'), when = spanCell(tr, item.start, item.end);
    const tab = settings.calTab;
    if (tab === 'days') {
      tr.append(el('td', {}, dayName(item.weekday)), el('td', { class: 'hide-sm', text: ceDate(item.start) }), el('td', { text: earthWhen(item.start, now) }), when.td,
        el('td', { text: `${item.moon.percent}% ${V.MOON_PHASES[item.moon.phase]}` }));
    } else if (tab === 'moon') {
      const a = V.moon(item.start), b = V.moon(item.end - 1);
      tr.append(el('td', { text: V.MOON_PHASES[a.phase] }), el('td', { text: `${a.percent}% to ${b.percent}%` }),
        el('td', { text: earthWhen(item.start, now) }), el('td', { class: 'hide-sm', text: earthWhen(item.end, now) }), when.td);
    } else {
      tr.append(el('td', { text: V.RSE_RACES[item.race] }), el('td', { class: 'place', text: V.RSE_PLACES[item.place] }),
        el('td', { text: earthWhen(item.start, now) }), el('td', { class: 'hide-sm', text: earthWhen(item.end, now) }), when.td);
      // Any week can be picked to show its details below the table.
      const pick = () => { rseFocus = item.start; };
      tr.classList.add('pick');
      tr.tabIndex = 0;
      tr.title = 'Show this week\'s details';
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return { tr, update(n) { when.update(n); tr.classList.toggle('picked', item === focusedWeek()); } };
    }
    return { tr, update: when.update };
  }
  function renderCalendar(now) {
    liveRows($('cal-body'), `${settings.calTab}|${gen}`, now, () => {
      const items = calendarItems(now);
      $('cal-body')._items = items;
      return { rows: items.map((it) => calendarRow(it, now)), expires: items.length ? items[0].end : Infinity };
    });
    const detail = $('rse-detail');
    detail.hidden = settings.calTab !== 'rse';
    const week = focusedWeek();
    if (!detail.hidden && week && detail._week !== week) { detail._week = week; detail.replaceChildren(...rseDetail(week, now)); }
  }

  // ---- RSE details ----
  let rseFocus = null; // start of the picked week; the first listed week when none is picked
  function focusedWeek() {
    const items = settings.calTab === 'rse' ? $('cal-body')._items || [] : [];
    return items.find((w) => w.start === rseFocus) || items[0] || null;
  }
  function rseDetail(week, now) {
    const d = V.RSE_DUNGEONS[week.place], g = V.RSE_GEAR[week.race], race = V.RSE_RACES[week.race], place = V.RSE_PLACES[week.place];
    const live = now >= week.start && now < week.end;
    return [
      el('div', { class: 'rse-head' }, el('strong', { text: race }), ` · ${place} · ${g.set} set`,
        el('span', { class: 'sub', text: live ? 'this week' : `from ${earthWhen(week.start, now)} to ${earthWhen(week.end, now)}` })),
      el('ol', { class: 'rse-steps' },
        el('li', {}, 'Start ', el('b', { text: 'The Goblin Tailor' }), ' with Guttrix in Lower Jeuno (level 10 and Jeuno fame 3).'),
        el('li', {}, `During the ${race} week, trade ${/^[AEIOU]/.test(d.key) ? 'an' : 'a'} `, el('b', { text: d.key }), ` to the Treasure Chest in ${place} for a Magical Pattern.`),
        el('li', {}, `Guttrix turns each pattern into one piece of your choice: ${g.pieces.join(', ')}.`)),
      el('div', { class: 'rse-cols' },
        el('div', {}, el('h3', { text: `${d.key} drops from` }),
          el('ul', { class: 'drops' }, d.droppers.map(([name, rarity]) => el('li', {}, name, rarity === 'very rare' ? el('span', { class: 'sub', text: 'very rare' }) : null)))),
        el('div', {}, el('h3', { text: 'Sachet' }),
          el('p', {}, `The same week, a ??? in ${place} pops ${d.nm} for ${race} players. It can drop the `, el('b', { text: g.sachet }), '.'))),
    ];
  }

  // ---- Planner ----
  const PRESETS = [
    ['Full moon nights', { phases: [V.FULL], from: 18, to: 6 }],
    ['New moon Darksday', { weekdays: [7], phases: [V.NEW] }],
    ['Moon at 100%', { minPercent: 100 }],
    ['Lightsday daytime', { weekdays: [6], from: 6, to: 18 }],
  ];
  function describeQuery(q) {
    const parts = [];
    if (q.weekdays?.length) parts.push(q.weekdays.map((d) => V.DAYS[d].name).join('/'));
    if (q.phases?.length) parts.push(q.phases.map((p) => V.MOON_PHASES[p]).join('/'));
    if (q.from != null) parts.push(`${pad(q.from)}:00-${pad(q.to ?? 24)}:00`);
    if (q.minPercent != null || q.maxPercent != null) parts.push(`moon ${q.minPercent ?? 0}-${q.maxPercent ?? 100}%`);
    return parts.join(', ') || 'any time';
  }
  const isEmptyQuery = (q) => describeQuery(q) === 'any time';
  function buildPlanner() {
    const q = settings.planner;
    const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b));
    $('pl-days').replaceChildren(...V.DAYS.map((d, i) => el('button', {
      class: `chip el${q.weekdays.includes(i) ? ' active' : ''}`, type: 'button', style: `--c: var(--${d.element})`, 'aria-pressed': q.weekdays.includes(i) ? 'true' : 'false',
      onclick: () => { q.weekdays = toggle(q.weekdays, i); persist(); buildPlanner(); },
    }, d.name)));
    $('pl-phases').replaceChildren(...V.MOON_PHASES.map((p, i) => el('button', {
      class: `chip${q.phases.includes(i) ? ' active' : ''}`, type: 'button', 'aria-pressed': q.phases.includes(i) ? 'true' : 'false',
      onclick: () => { q.phases = toggle(q.phases, i); persist(); buildPlanner(); },
    }, p)));
    const from = $('pl-from'), to = $('pl-to');
    from.replaceChildren(el('option', { value: '', text: 'any hour' }), ...Array.from({ length: 24 }, (_, h) => el('option', { value: String(h), text: `${pad(h)}:00` })));
    to.replaceChildren(...Array.from({ length: 24 }, (_, h) => el('option', { value: String(h + 1), text: `${pad(h + 1)}:00` })));
    from.value = q.from == null ? '' : String(q.from);
    to.value = String(q.to ?? 24);
    to.disabled = q.from == null;
    $('pl-min').value = q.minPercent ?? '';
    $('pl-max').value = q.maxPercent ?? '';
    $('planner-presets').replaceChildren(...PRESETS.map(([name, preset]) => el('button', {
      class: 'chip', type: 'button', onclick: () => { settings.planner = { ...EMPTY_QUERY, ...preset }; persist(); buildPlanner(); },
    }, name)));
  }
  function wirePlanner() {
    const q = () => settings.planner;
    $('pl-from').addEventListener('change', (e) => { q().from = e.target.value === '' ? null : +e.target.value; if (q().to == null) q().to = 24; persist(); buildPlanner(); });
    $('pl-to').addEventListener('change', (e) => { q().to = +e.target.value; persist(); });
    const percent = (key) => (e) => {
      const v = e.target.value.trim();
      q()[key] = v === '' || isNaN(+v) ? null : Math.max(0, Math.min(100, Math.round(+v)));
      persist();
    };
    $('pl-min').addEventListener('change', percent('minPercent'));
    $('pl-max').addEventListener('change', percent('maxPercent'));
    $('pl-clear').addEventListener('click', () => { settings.planner = { ...EMPTY_QUERY }; persist(); buildPlanner(); });
  }
  function plannerRow(w, now) {
    const tr = el('tr'), when = spanCell(tr, w.start, w.end), c = V.clock(w.start), m = V.moon(w.start);
    const vanaHours = (w.end - w.start) / V.HOUR;
    tr.append(el('td', { text: earthWhen(w.start, now) }), el('td', { class: 'hide-sm', text: earthWhen(w.end, now) }),
      el('td', { class: 'hide-sm' }, countdown(w.end - w.start), el('span', { class: 'sub', text: ` (${vanaHours}h Vana'diel)` })), when.td,
      el('td', {}, dayName(c.weekday), ` ${pad(c.hour)}:00 · ${m.percent}% ${V.MOON_PHASES[m.phase]}`));
    return { tr, update: when.update };
  }
  function renderPlanner(now) {
    const q = settings.planner;
    liveRows($('pl-body'), `${JSON.stringify(q)}|${gen}`, now, () => {
      if (isEmptyQuery(q)) return { rows: [emptyRow(5, 'Pick a day, a moon phase, an hour range or a moon percent, or start from a preset.')] };
      const wins = V.findWindows(now, q, 8);
      return { rows: wins.length ? wins.map((w) => plannerRow(w, now)) : [emptyRow(5, 'These conditions never line up.')], expires: wins.length ? wins[0].end : Infinity };
    });
  }

  // ---- Alarm list ----
  function alarmRow(a) {
    const id = alarmId(a), src = SOURCES[a.kind];
    const next = el('span'), nextVana = el('div', { class: 'sub' }), inText = el('span', { class: 'count' });
    const lead = el('select', { class: 'select', 'aria-label': 'Minutes of warning', onchange: (e) => { a.lead = +e.target.value; runtime.delete(id); saveAlarms(); } },
      LEADS.map((n) => { const o = el('option', { value: String(n), text: `${n} min before` }); o.selected = n === a.lead; return o; }));
    const onOff = el('button', { class: 'button small', type: 'button', onclick: () => { a.on = !a.on; runtime.delete(id); saveAlarms(); } }, a.on ? 'On' : 'Off');
    const remove = el('button', { class: 'button small danger', type: 'button', 'aria-label': 'Remove alarm', onclick: () => { alarms = alarms.filter((x) => x !== a); runtime.delete(id); saveAlarms(); refreshBells(); } }, '×');
    const tr = el('tr', {},
      el('td', { class: 'wrap' }, src.label(a.ref), a.kind === 'planner' ? el('div', { class: 'sub', text: describeQuery(a.ref) }) : null),
      el('td', {}, lead), el('td', {}, next, nextVana), el('td', {}, inText), el('td', {}, onOff, ' ', remove));
    return { tr, update(now) {
      const r = a.on ? runtime.get(id) : null;
      setText(next, r ? earthWhen(r.event, now) : a.on ? '-' : 'off');
      setText(nextVana, r ? `${vanaHM(r.event)} Vana'diel` : '');
      setText(inText, r ? countdown(r.event - now) : '');
    } };
  }
  function renderAlarms(now) {
    liveRows($('alarms'), `${alarmGen}|${gen}`, now, () => ({
      rows: alarms.length ? alarms.map(alarmRow) : [emptyRow(5, 'No alarms yet.')],
    }));
  }
  function paintNotify() {
    const b = $('notify-button');
    if (!('Notification' in window)) { b.textContent = 'No notifications here'; b.disabled = true; return; }
    b.textContent = { granted: 'Notifications on', denied: 'Notifications blocked' }[Notification.permission] || 'Enable notifications';
    b.disabled = Notification.permission !== 'default';
  }

  // ---- Mini clock ----
  // Hours and minutes only: it runs on the 250 ms tick, which keeps going while the tab is hidden.
  let mini = null;
  function makeMini(root) {
    const refs = { time: el('div', { class: 'mini-time' }), day: el('span'), moon: el('span', { class: 'muted' }), lines: el('div', { class: 'mini-lines' }) };
    root.replaceChildren(refs.time, el('div', { class: 'mini-line' }, refs.day, refs.moon), refs.lines);
    refs.weekday = -1; refs.key = '';
    return refs;
  }
  function renderMini(now) {
    const c = V.clock(now), m = V.moon(now), refs = mini;
    setText(refs.time, `${pad(c.hour)}:${pad(c.minute)}`);
    if (refs.weekday !== c.weekday) { refs.weekday = c.weekday; refs.day.replaceChildren(dayName(c.weekday)); }
    setText(refs.moon, `${m.percent}% ${V.MOON_PHASES[m.phase]}`);
    // Starred routes first; with none starred, the daily and weekly resets.
    const starred = settings.starred.slice(0, 3).map((id) => ROUTE[id]).filter(Boolean);
    const items = starred.length
      ? starred.map((r) => { const s = V.routeStatus(r, now); return [`${short(r.from)} → ${short(r.to)}`, `${s.state === 'boarding' ? 'boarding · ' : ''}${countdown(s.departs - now)}`]; })
      : [['JP midnight', countdown(V.nextJpMidnight(now) - now)], ['Conquest tally', countdown(V.nextConquestTally(now) - now)]];
    const key = items.map((i) => i[0]).join('|');
    if (refs.key !== key) {
      refs.key = key;
      refs.rows = items.map(() => ({ name: el('span', { class: 'muted' }), value: el('span', { class: 'count' }) }));
      refs.lines.replaceChildren(...refs.rows.map((r) => el('div', { class: 'mini-line' }, r.name, r.value)));
    }
    items.forEach(([name, value], i) => { setText(refs.rows[i].name, name); setText(refs.rows[i].value, value); });
  }
  // The picture-in-picture window can't load style.css when the page runs from file://, so it gets
  // a small stylesheet of its own plus the current theme's token values copied across.
  const MINI_CSS = `html, body { margin: 0; }
body { background: var(--pip-bg); color: var(--text); font: 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; }
.mini { padding: 12px 14px; display: grid; gap: 6px; }
.mini-lines { display: grid; gap: 4px; border-top: 1px solid var(--border); padding-top: 6px; }
.mini-time { font-size: 46px; font-weight: 700; letter-spacing: -.06em; line-height: 1; }
.mini-line { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; white-space: nowrap; }
.muted { color: var(--muted); overflow: hidden; text-overflow: ellipsis; } .count { font-weight: 700; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: currentColor; margin-right: 7px; vertical-align: 1px; }
${V.DAYS.map((d) => `.el-${d.element} { color: var(--${d.element}); }`).join('\n')}`;
  const MINI_TOKENS = ['--text', '--muted', '--border', '--accent', ...V.DAYS.map((d) => `--${d.element}`)];
  let pipDoc = null;
  function paintPip() {
    if (!pipDoc) return;
    const css = getComputedStyle(document.documentElement), root = pipDoc.documentElement.style;
    for (const t of MINI_TOKENS) root.setProperty(t, css.getPropertyValue(t));
    root.setProperty('--pip-bg', themeMode === 'vana' ? 'linear-gradient(180deg, #3e4e9c 0%, #1c245c 46%, #10153c 100%)' : css.getPropertyValue('--surface'));
    root.colorScheme = css.colorScheme;
  }
  async function openMini() {
    if ('documentPictureInPicture' in window) {
      try {
        const pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 210 });
        pipDoc = pip.document;
        pipDoc.title = 'ffxi-timer';
        pipDoc.head.append(el('style', { text: MINI_CSS }));
        paintPip();
        const root = el('div', { class: 'mini' });
        pipDoc.body.append(root);
        mini = makeMini(root);
        renderMini(Date.now());
        pip.addEventListener('pagehide', () => { mini = null; pipDoc = null; });
        return;
      } catch (e) { /* fall through to a popup window */ }
    }
    window.open(`${location.pathname}?mini`, 'ffxi-timer-mini', 'popup,width=340,height=230');
  }

  // ---- Theme ----
  // Same scheme as Kard and Delta: no attribute means follow the system setting.
  const THEMES = ['system', 'light', 'dark', 'vana'];
  let themeMode = 'system';
  try { const t = localStorage.getItem(THEME_KEY); if (THEMES.includes(t)) themeMode = t; } catch (e) {}
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintPip);
  function applyTheme(mode) {
    themeMode = THEMES.includes(mode) ? mode : 'system';
    if (themeMode === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = themeMode;
    paintPip();
    const b = $('theme-toggle');
    b.textContent = `Theme: ${themeMode === 'system' ? 'sys' : themeMode}`;
    b.setAttribute('aria-label', `Color theme: ${themeMode}. Click to cycle system, light, dark, vana.`);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = el('meta', { name: 'theme-color' }); document.head.append(meta); }
    meta.content = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0c1018';
  }
  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(themeMode) + 1) % THEMES.length];
    try { if (next === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  }
  window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) applyTheme(e.newValue || 'system'); });

  // ---- Wiring ----
  function paintToolbar() {
    setText($('hour-toggle'), hour12() ? '12h' : '24h');
    setText($('sound-toggle'), `Sound: ${settings.sound ? 'on' : 'off'}`);
    document.querySelectorAll('#route-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === settings.routeTab));
    document.querySelectorAll('#cal-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === settings.calTab));
  }
  function wire() {
    document.querySelectorAll('.bell[data-alarm]').forEach((b) => { if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', BELL); });
    $('hour-toggle').addEventListener('click', () => { settings.hour12 = !hour12(); persist(); paintToolbar(); });
    $('sound-toggle').addEventListener('click', () => { settings.sound = !settings.sound; persist(); paintToolbar(); unlockAudio(); if (settings.sound) chime(); });
    $('mini-button').addEventListener('click', openMini);
    $('rse-details').addEventListener('click', () => {
      settings.calTab = 'rse'; rseFocus = null; persist(); paintToolbar(); buildCalendarControls();
      $('calendar-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('theme-toggle').addEventListener('click', cycleTheme);
    $('about-button').addEventListener('click', () => $('about-dialog').showModal());
    $('route-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { settings.routeTab = b.dataset.tab; persist(); paintToolbar(); } });
    $('cal-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { settings.calTab = b.dataset.tab; persist(); paintToolbar(); buildCalendarControls(); } });
    const lead = $('lead-default');
    lead.replaceChildren(...LEADS.map((n) => { const o = el('option', { value: String(n), text: `${n} min before` }); o.selected = n === settings.lead; return o; }));
    lead.addEventListener('change', (e) => { settings.lead = +e.target.value; persist(); });
    $('notify-button').addEventListener('click', () => { if ('Notification' in window) Notification.requestPermission().then(paintNotify, () => {}); });
    $('test-alarm').addEventListener('click', () => { unlockAudio(); notify('Test alarm', 'This is how an alarm looks and sounds.', 'test'); });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input, select, textarea, dialog[open]'))) return;
      if (e.key === 't' || e.key === 'T') cycleTheme();
      else if (e.key === 'm' || e.key === 'M') openMini();
      else if (e.key === '?') $('about-dialog').showModal();
    });
    document.addEventListener('visibilitychange', tick);
    wirePlanner();
  }

  function tick() {
    const now = Date.now();
    if (miniMode) { renderMini(now); return; }
    checkAlarms(now);
    if (!document.hidden) {
      renderHero(now); renderRoutes(now); renderGuilds(now); renderCalendar(now); renderPlanner(now); renderAlarms(now);
    }
    if (mini) renderMini(now);
  }
  // A worker's timer keeps ticking at full rate in a background tab, where page timers get slowed
  // to once a minute, so alarms stay on time. Fall back to a plain interval if workers are refused.
  function startClock() {
    let fallback = false;
    const useInterval = () => { if (!fallback) { fallback = true; setInterval(tick, 250); } };
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function () { postMessage(0); }, 250);'], { type: 'text/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = tick;
      worker.onerror = () => { worker.terminate(); useInterval(); };
    } catch (e) { useInterval(); }
  }

  applyTheme(themeMode);
  if (miniMode) {
    document.title = 'ffxi-timer mini';
    $('mini-root').hidden = false;
    mini = makeMini($('mini-root'));
  } else {
    wire();
    paintToolbar();
    paintNotify();
    buildGuildFilter();
    buildCalendarControls();
    buildPlanner();
  }
  tick();
  startClock();
  if (!miniMode) requestAnimationFrame(frame);
})();
