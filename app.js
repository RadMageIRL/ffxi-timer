// ffxi-timer page logic. The time math lives in vana.js; this file renders it, keeps settings and
// runs the alarms. Live cells are written only when their text changes, so nothing flickers.
(function () {
  'use strict';
  const V = window.Vana, S = window.VanaStore;
  const $ = (id) => document.getElementById(id);
  const ROUTE = Object.fromEntries(V.ROUTES.map((r) => [r.id, r]));
  const GROUP = { airship: 'Airship', ferry: 'Ferry', manaclipper: 'Manaclipper', barge: 'Barge' };
  const { guildKey, nmKey } = S; // the keys saved settings and alarms use for guilds and NMs
  const GUILD = Object.fromEntries(V.SHOPS.map((g) => [guildKey(g), g]));
  const NM = new Map(V.nmList().map((nm) => [nmKey(nm), nm]));
  // How long an NM waits after it dies, in seconds: its respawn timer or lockout, or for a lottery NM
  // its cooldown. Null when nothing times it.
  function nmWait(nm) {
    if (nm.respawn) return nm.respawn;
    return nm.lottery && nm.lottery.cooldown ? { min: nm.lottery.cooldown, max: nm.lottery.cooldown } : null;
  }
  // When an NM marked killed can next appear, at the earliest; null when no kill time is set.
  function nmReady(nm) {
    const kill = settings.nmKills[nmKey(nm)], wait = nmWait(nm);
    return kill != null && wait ? kill + wait.min * 1000 : null;
  }
  // The next chance after t: the first time its conditions hold once its timer is done.
  function nmNext(nm, t) {
    const ready = nmReady(nm), from = ready && ready > t ? ready : t;
    const [w] = V.findWindows(from, V.nmQuery(nm), 1);
    return w ? { start: Math.max(w.start, from), end: w.end } : null;
  }
  const shopName = (g) => (g.kind === 'guild' ? `${g.craft} guild` : `${g.craft} shop`);
  const miniMode = document.documentElement.classList.contains('mini-mode');

  // ---- Storage (every access guarded: private windows and blocked storage throw) ----
  const SETTINGS_KEY = 'ffxi_timer_settings', ALARMS_KEY = 'ffxi_timer_alarms', THEME_KEY = 'ffxi_timer_theme';
  const read = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
  const { EMPTY_QUERY, DEFAULTS } = S, STORE = S.context(V);
  // Saved data goes through store.js before anything uses it. When something had to be repaired, the
  // text as it was is kept under a _backup key and the repaired copy is saved, so the next load starts
  // from good data instead of repairing the same damage again.
  const repairs = [];
  function loadChecked(key, check) {
    const text = read(key), { value, notes } = check(S.parse(text));
    if (notes.length) {
      repairs.push(...notes);
      try { localStorage.setItem(`${key}_backup`, text); } catch (e) {}
      save(key, value);
    }
    return value;
  }
  const settings = loadChecked(SETTINGS_KEY, (v) => S.checkSettings(v, STORE));
  let gen = 0; // bumped on any settings change so every list rebuilds

  // ---- Several tabs ----
  // Each tab remembers the stored text it last read or wrote, and its own settings as they were then
  // (its base). A save puts this tab's changes since its base on top of whatever is stored now, so a
  // change another tab saved first is kept, and a storage event brings another tab's changes in without
  // a reload. Saves take a Web Lock where the browser has one, so two tabs saving at the same moment
  // take turns and each merges into what the other wrote; changes made while a save waits for the lock
  // go into that save.
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sync = { settingsText: read(SETTINGS_KEY), settings: clone(settings), alarmsText: null, alarms: [] };
  // A page opened from a file has no origin of its own, and Web Locks need one, so it saves at once.
  // A tab keeps the save lock a moment after writing: storage reaches other tabs a few milliseconds
  // after a write, and the next tab to save should read it.
  const SAVE_LOCK = 'ffxi-timer-save', SAVE_HOLD = 50, saving = new Set(), lockable = 'locks' in navigator && location.protocol !== 'file:';
  let saveLocks = lockable;
  function queueSave(name, commit) {
    if (saving.has(name)) return; // the save already waiting takes this change too
    if (!saveLocks) { commit(); return; }
    saving.add(name);
    navigator.locks.request(SAVE_LOCK, () => { saving.delete(name); commit(); return new Promise((done) => setTimeout(done, SAVE_HOLD)); })
      .catch(() => { saving.delete(name); saveLocks = false; commit(); }); // Web Locks refused after all
  }
  // Takes the shared fields of `next` into this tab; true when any changed.
  function adoptShared(next) {
    let changed = false;
    for (const k of S.SHARED) if (!same(settings[k], next[k])) { settings[k] = next[k]; changed = true; }
    return changed;
  }
  // Brings in a stored copy: this tab's changes since its base stay on top. True when anything changed.
  function takeSettings(theirs) {
    const before = clone(settings);
    if (!adoptShared(S.mergeSettings(sync.settings, settings, theirs))) return false;
    rearmFor(before);
    gen++;
    refreshControls();
    return true;
  }
  function persist() { gen++; queueSave('settings', commitSettings); }
  function commitSettings() {
    const text = read(SETTINGS_KEY);
    let next = settings;
    if (text != null && text !== sync.settingsText) {
      next = S.mergeSettings(sync.settings, settings, S.checkSettings(S.parse(text), STORE).value);
      takeSettings(next);
    }
    const out = JSON.stringify(next);
    try { localStorage.setItem(SETTINGS_KEY, out); } catch (e) {}
    sync.settingsText = out;
    sync.settings = clone(settings);
  }
  // Another tab saved settings. With a save of this tab's still waiting, the base stays as it was, so
  // that save still sees this tab's change as a change.
  function pullSettings() {
    const text = read(SETTINGS_KEY);
    if (text === sync.settingsText) return;
    sync.settingsText = text;
    takeSettings(S.checkSettings(S.parse(text), STORE).value);
    if (!saving.has('settings')) sync.settings = clone(settings);
  }

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
        full: { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: h12 },
        clock: { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: h12 },
        time: { hour: 'numeric', minute: '2-digit', hour12: h12 },
        day: { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: h12 },
        date: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: h12 },
        news: { month: 'short', day: 'numeric' },
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
  const { LEADS } = S;
  function phaseStart(phase, after) {
    const w = V.findWindows(after, { phases: [phase] }, 3).find((x) => x.start > after);
    return w ? w.start : null;
  }
  const SOURCES = {
    route: { valid: (r) => !!ROUTE[r], next: (r, t) => V.nextDeparture(ROUTE[r], t), label: (r) => `${GROUP[ROUTE[r].group]} ${short(ROUTE[r].from)} → ${short(ROUTE[r].to)} departs` },
    guild: { valid: (r) => !!GUILD[r], next: (r, t) => V.nextGuildOpening(GUILD[r], t, holidaysOn()), label: (r) => `${shopName(GUILD[r])} in ${GUILD[r].place} opens` },
    jp: { valid: () => true, next: (r, t) => V.nextJpMidnight(t), label: () => 'JP midnight' },
    conquest: { valid: () => true, next: (r, t) => V.nextConquestTally(t), label: () => 'Conquest tally' },
    moon: { valid: (r) => r === '0' || r === '4', next: (r, t) => phaseStart(Number(r), t), label: (r) => `${V.MOON_PHASES[r]} begins` },
    planner: { valid: (r) => r && typeof r === 'object', next: (q, t) => { const w = V.findWindows(t, q, 3).find((x) => x.start > t); return w ? w.start : null; }, label: (q) => `Planner: ${describeQuery(q)}` },
    nm: {
      valid: (r) => NM.has(r),
      next: (r, t) => { let n = nmNext(NM.get(r), t); if (n && n.start <= t) n = nmNext(NM.get(r), n.end); return n ? n.start : null; },
      label: (r) => `${NM.get(r).name} can appear`,
    },
    timer: {
      valid: (r) => !!timerOf(r),
      next: (r, t) => { const x = timerOf(r), ready = x && timerReadyAt(x); return ready > t ? ready : null; },
      label: (r) => `${timerName(timerOf(r))} is ready`,
    },
  };
  // A planner alarm is keyed by its search, so each saved search can have its own.
  const planKey = (q) => planHash({ ...EMPTY_QUERY, ...q }).slice(1);
  const alarmId = (a) => (a.kind === 'planner' ? `planner:${planKey(a.ref)}` : `${a.kind}:${a.ref}`);
  const usable = (list) => list.filter((a) => SOURCES[a.kind].valid(a.ref));
  let alarms = usable(loadChecked(ALARMS_KEY, (v) => S.checkAlarms(v, STORE, settings)));
  const runtime = new Map(); // alarm id -> { event, due } or null when the source has no next event
  let alarmGen = 0;
  sync.alarmsText = read(ALARMS_KEY);
  sync.alarms = clone(alarms);
  // A new alarm list from storage or a merge: alarms that didn't change keep this tab's objects and
  // their armed events; new or changed ones re-arm; ones that are gone are forgotten.
  function takeAlarms(next) {
    const mine = new Map(alarms.map((a) => [alarmId(a), a]));
    alarms = usable(next).map((a) => { const old = mine.get(alarmId(a)); if (old && same(old, a)) return old; runtime.delete(alarmId(a)); return a; });
    const ids = new Set(alarms.map(alarmId));
    for (const id of [...runtime.keys()]) if (!ids.has(id)) runtime.delete(id);
  }
  function saveAlarms() { alarmGen++; queueSave('alarms', commitAlarms); }
  function commitAlarms() {
    const text = read(ALARMS_KEY);
    if (text != null && text !== sync.alarmsText) { takeAlarms(S.mergeAlarms(sync.alarms, alarms, S.checkAlarms(S.parse(text), STORE, settings).value)); alarmGen++; refreshBells(); }
    const out = JSON.stringify(alarms);
    try { localStorage.setItem(ALARMS_KEY, out); } catch (e) {}
    sync.alarmsText = out;
    sync.alarms = clone(alarms);
  }
  function pullAlarms() {
    const text = read(ALARMS_KEY);
    if (text === sync.alarmsText) return;
    sync.alarmsText = text;
    takeAlarms(S.mergeAlarms(sync.alarms, alarms, S.checkAlarms(S.parse(text), STORE, settings).value));
    if (!saving.has('alarms')) sync.alarms = clone(alarms);
    alarmGen++;
    refreshBells();
  }
  // Alarms whose next event comes from a shared setting that changed re-arm: NM alarms on a new kill
  // time, timer alarms on a new start or another server's waits, guild alarms when guild holidays
  // come or go.
  function rearmFor(before) {
    const kinds = new Set();
    if (!same(before.nmKills, settings.nmKills)) kinds.add('nm');
    if (!same(before.timers, settings.timers) || before.server !== settings.server) kinds.add('timer');
    if (holidaysOn(before) !== holidaysOn()) kinds.add('guild');
    for (const a of alarms) if (kinds.has(a.kind)) runtime.delete(alarmId(a));
  }
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
    // Each alarm on its own, so one that throws can't keep the others from firing. Every tab arms its
    // alarms and shows when they are next; only the alarm tab (below) delivers them.
    for (const a of alarms) safely('alarms', () => {
      if (!a.on) return;
      const id = alarmId(a);
      // A fresh alarm skips an event already inside its warning, rather than firing late on creation.
      if (!runtime.has(id)) arm(a, now + a.lead * 60000);
      const r = runtime.get(id);
      if (!r || now < r.due) return;
      if (now < r.event && alarmTab) deliver(a, r.event);
      if (alarms.includes(a)) arm(a, r.event); // unless reading storage just replaced it
    });
  }

  // ---- Delivering alarms with several tabs open ----
  // One tab delivers alarms: the toast, the chime, the notification and the Discord post. A Web Lock
  // picks it: the first tab holds the lock until it closes, then the next tab waiting gets it, and a tab
  // the player clicks or types in takes it over, since browsers only let a tab play sound after a click
  // there. Every delivery is also claimed in IndexedDB, whose read-write transactions on one store run
  // one after another across tabs, so it happens once even during a hand-over, and in browsers without
  // Web Locks, where every tab tries. With neither, a localStorage record is the best effort left.
  const ALARM_LOCK = 'ffxi-timer-alarms', DELIVERED_KEY = 'ffxi_timer_delivered';
  let locks = !miniMode && lockable, alarmTab = !locks, waiting = null, letGo = null;
  function leadAlarms(steal) {
    if (waiting) { const w = waiting; waiting = null; w.abort(); }
    const line = steal ? null : new AbortController();
    waiting = line;
    navigator.locks.request(ALARM_LOCK, steal ? { steal: true } : { signal: line.signal }, () => {
      if (waiting === line) waiting = null;
      alarmTab = true;
      paintAlarmTab();
      return new Promise((done) => { letGo = done; }); // held until this tab closes, freezes or another tab takes over
    }).catch((e) => {
      if (line && line.signal.aborted) return; // this tab left the line to take over, or to freeze
      letGo = null;
      if (e && e.name === 'AbortError') { alarmTab = false; paintAlarmTab(); leadAlarms(false); return; } // taken over: back in line
      locks = false; alarmTab = true; paintAlarmTab(); // Web Locks refused here after all
    });
  }
  // A tab the browser is about to freeze (Chrome's Energy Saver and the like fire 'freeze' first) or
  // put in its back-forward cache lets go of the lock and leaves the line, so a tab that is still running
  // delivers; it gets back in line when it runs again. The delivery claims keep the hand-over to one
  // delivery. A browser that suspends a tab without either event can't be told apart from a slow one
  // without polling, so the waiting tabs keep waiting until it runs again or the player clicks one.
  function standDown() {
    if (!locks) return;
    if (waiting) { const w = waiting; waiting = null; w.abort(); }
    if (letGo) { const done = letGo; letGo = null; done(); }
    alarmTab = false;
    paintAlarmTab();
  }
  const standUp = () => { if (locks && !alarmTab && !waiting) leadAlarms(false); };
  const takeOver = () => { if (locks && !alarmTab) leadAlarms(true); };
  function paintAlarmTab() { const hint = $('alarm-tab'); if (hint) hint.hidden = !locks || alarmTab; }
  // Before delivering, storage is read again, so an alarm another tab just turned off, removed or moved
  // doesn't fire from this tab's older copy; then the delivery is claimed.
  async function deliver(a, event) {
    pullSettings();
    pullAlarms();
    const id = alarmId(a), live = alarms.find((x) => alarmId(x) === id);
    if (!live || !live.on) return;
    if (SOURCES[live.kind].next(live.ref, Date.now()) !== event) { runtime.delete(id); return; }
    if (await claim(`${id}@${event}`)) fire(live, event, Date.now());
  }
  let ledger = null;
  function openLedger() {
    if (!ledger) ledger = new Promise((resolve) => {
      try {
        const req = indexedDB.open('ffxi-timer', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('delivered');
        req.onsuccess = () => { resolve(req.result); pruneLedger(req.result); };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return ledger;
  }
  // Deliveries are kept two days, long enough for any tab still waiting on one.
  function pruneLedger(db) {
    try {
      const store = db.transaction('delivered', 'readwrite').objectStore('delivered'), cutoff = Date.now() - 2 * V.EARTH_DAY;
      store.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { if (!(c.value > cutoff)) c.delete(); c.continue(); } };
    } catch (e) {}
  }
  async function claim(key) {
    const db = await openLedger();
    if (!db) return claimInStorage(key);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('delivered', 'readwrite');
        let mine = false;
        const add = tx.objectStore('delivered').add(Date.now(), key); // fails when the key is there
        add.onsuccess = () => { mine = true; };
        add.onerror = (e) => e.preventDefault();
        tx.oncomplete = () => resolve(mine);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(claimInStorage(key)); }
    });
  }
  function claimInStorage(key) {
    const now = Date.now(), stored = S.parse(read(DELIVERED_KEY)), done = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    if (done[key]) return false;
    for (const k of Object.keys(done)) if (!(done[k] > now - 2 * V.EARTH_DAY)) delete done[k];
    done[key] = now;
    save(DELIVERED_KEY, done);
    return true;
  }
  function fire(a, event, now) {
    const title = SOURCES[a.kind].label(a.ref);
    notify(title, `in ${countdown(event - now)} · ${vanaHM(event)} Vana'diel · ${earth(event, 'clock')} local`, alarmId(a));
    // Discord gets the Earth time as a timestamp tag, which each reader sees in their own time zone.
    // Alarms saved before the per-alarm switch have no `discord` field and keep posting. The title can
    // hold a timer note, so the post turns mentions off (see postDiscord).
    if (a.discord !== false) postDiscord(`**${title}** in ${countdown(event - now)} (${vanaHM(event)} Vana'diel, <t:${Math.round(event / 1000)}:T>)`);
  }

  // ---- Discord ----
  // A webhook takes a plain form post. The page cannot read Discord's reply from file:// or another
  // origin, so the post is fire-and-forget; "Send test" is how to check the URL works. allowed_mentions
  // with an empty parse list keeps @everyone, @here, roles and users in the text from pinging anyone.
  const { DISCORD_URL } = S;
  function postDiscord(text, url = settings.discord) {
    if (!url || !DISCORD_URL.test(url)) return false;
    const body = new FormData();
    body.append('payload_json', JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }));
    fetch(url, { method: 'POST', body, mode: 'no-cors' }).catch(() => {});
    return true;
  }
  const paintDiscord = () => setText($('discord-status'), settings.discord ? 'Saved. Alarms with Discord on post here.' : 'Not set.');
  function wireDiscord() {
    const input = $('discord-url'), status = $('discord-status'), paint = paintDiscord;
    input.value = settings.discord;
    paint();
    $('discord-save').addEventListener('click', () => {
      const url = input.value.trim();
      if (url && !DISCORD_URL.test(url)) { setText(status, 'That is not a Discord webhook URL.'); return; }
      settings.discord = url; persist(); paint();
    });
    $('discord-test').addEventListener('click', () => {
      const url = input.value.trim();
      setText(status, postDiscord("**ffxi-timer test** Alarms from this page will post here.", url) ? 'Test sent. Check the channel.' : 'Enter a Discord webhook URL first.');
    });
  }
  function notify(title, body, tag) {
    toast(title, body);
    if (settings.sound) chime();
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, tag }); } catch (e) {}
    }
  }
  function toggleAlarm(kind, ref) {
    // The planner bell always means the search on screen.
    if (kind === 'planner') {
      if (isEmptyQuery(settings.planner)) { toast('Planner', 'Pick at least one condition first.'); return; }
      ref = JSON.parse(JSON.stringify(settings.planner));
    }
    const id = alarmId({ kind, ref });
    const i = alarms.findIndex((a) => alarmId(a) === id);
    if (i >= 0) { alarms.splice(i, 1); runtime.delete(id); }
    else {
      alarms.push({ kind, ref, lead: settings.lead, on: true, discord: true });
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
  window.addEventListener('keydown', unlockAudio, { once: true });
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

  // ---- Trips ----
  // Ports are listed under the kind of run that leaves them; To only offers ports a trip can reach.
  const PORT_GROUP = Object.fromEntries(V.PORTS.map((p) => [p, V.ROUTES.find((r) => r.from === p).group]));
  const PORT_GROUPS = [['airship', 'Airships'], ['ferry', 'Ferries'], ['manaclipper', 'Manaclipper'], ['barge', 'Phanauet barge']];
  const TRANSFERS = [0, 1, 2, 3, 5];
  function portOptions(select, ports, value) {
    select.replaceChildren(...PORT_GROUPS.map(([group, label]) => {
      const list = ports.filter((p) => PORT_GROUP[p] === group);
      return list.length ? el('optgroup', { label }, list.map((p) => { const o = el('option', { value: p, text: p }); o.selected = p === value; return o; })) : null;
    }));
  }
  function buildTripControls() {
    if (!V.PORTS.includes(settings.tripFrom)) settings.tripFrom = DEFAULTS.tripFrom;
    const reach = V.portsFrom(settings.tripFrom);
    if (!reach.includes(settings.tripTo)) settings.tripTo = reach[0];
    portOptions($('trip-from'), V.PORTS, settings.tripFrom);
    portOptions($('trip-to'), reach, settings.tripTo);
  }
  function wireTrips() {
    $('trip-from').addEventListener('change', (e) => { settings.tripFrom = e.target.value; buildTripControls(); persist(); });
    $('trip-to').addEventListener('change', (e) => { settings.tripTo = e.target.value; persist(); });
    $('trip-swap').addEventListener('click', () => { [settings.tripFrom, settings.tripTo] = [settings.tripTo, settings.tripFrom]; buildTripControls(); persist(); });
    const transfer = $('trip-transfer');
    transfer.replaceChildren(...TRANSFERS.map((n) => { const o = el('option', { value: String(n), text: n ? `${n} min` : 'none' }); o.selected = n === settings.tripTransfer; return o; }));
    transfer.addEventListener('change', (e) => { settings.tripTransfer = +e.target.value; persist(); });
    buildTripControls();
  }
  function tripRow(trip, now) {
    const first = trip.legs[0], tr = el('tr'), chip = el('span', { class: 'state boarding', text: 'Boarding' }), inText = el('span', { class: 'count' });
    // One line per leg; between legs, where to change and how long the wait is.
    const legs = trip.legs.flatMap((l, i) => [
      i ? el('div', { class: 'sub', text: `change at ${short(l.route.from)}, wait ${countdown(l.departs - trip.legs[i - 1].lands)}, leaves ${earth(l.departs, 'time')}` }) : null,
      el('div', {}, `${vanaHM(l.departs)} ${GROUP[l.route.group]} ${short(l.route.from)}`, el('span', { class: 'arrow', text: '→' }), short(l.route.to)),
    ]);
    tr.append(
      el('td', { class: 'hide-sm' }, vanaHM(trip.departs), el('div', { class: 'sub', text: earthWhen(trip.departs, now) })),
      el('td', { class: 'wrap route-name' }, ...legs),
      el('td', {}, vanaHM(trip.lands), el('div', { class: 'sub', text: earthWhen(trip.lands, now) })),
      el('td', { class: 'hide-sm', text: countdown(trip.lands - trip.departs) }),
      el('td', {}, chip, ' ', inText),
      el('td', { class: 'c-bell' }, bell(`route:${first.route.id}`, `Alarm before ${first.route.from} to ${first.route.to} departs`)));
    return { tr, update(n) {
      const s = V.routeStatus(first.route, n), boarding = s.state === 'boarding' && s.departs === first.departs;
      chip.hidden = !boarding;
      tr.classList.toggle('live', boarding);
      setText(inText, countdown(first.departs - n));
    } };
  }
  const TRIP_ROWS = 5;
  function renderTrips(now) {
    const { tripFrom: from, tripTo: to, tripTransfer: transfer } = settings;
    liveRows($('trips'), `${from}|${to}|${transfer}|${gen}`, now, () => {
      const trips = V.findTrips(from, to, now, TRIP_ROWS, transfer * 60000);
      return { rows: trips.length ? trips.map((t) => tripRow(t, now)) : [emptyRow(6, 'No boat or airship links these ports.')], expires: trips.length ? trips[0].departs : Infinity };
    });
  }

  // ---- Server rules ----
  // The pill picks whose rules apply where servers are known to differ: guild holidays, the Dynamis
  // wait, the timers offered and the obi note. NM and fishing details are LandSandBoat's whichever is
  // picked, and those panels say so when another server is.
  const server = (s = settings) => V.SERVERS[s.server] || V.SERVERS.retail;
  // Retail has no guild holidays; elsewhere they are a server setting, so Guild holidays turns them on.
  const holidaysOn = (s = settings) => server(s).holidays && s.guildHolidays;
  const SERVER_NOTES = {
    nm: {
      retail: "These conditions, timers, levels and drops are LandSandBoat's. Retail differs for some of these NMs.",
      horizon: "These conditions, timers, levels and drops are LandSandBoat's. HorizonXI has changed some NMs, so they can differ there.",
    },
    fish: {
      retail: "This panel follows LandSandBoat's fishing. On retail, New Moon and Full Moon are best for fishing, and some fish bite only at certain hours.",
      horizon: "This panel follows LandSandBoat's fishing, which HorizonXI has changed, so it can differ there.",
    },
    timer: {
      retail: 'These are retail\'s waits where they could be checked; for anything else, pick Custom and enter the hours.',
      horizon: "Dynamis follows HorizonXI's two entries a week, reset at the conquest tally; the other waits are LandSandBoat's. Fields and Grounds of Valor, the Hunt Registry and ACP, AMK and ASA keys aren't on HorizonXI, so they aren't offered. For anything else, pick Custom and enter the hours.",
      lsb: "These are LandSandBoat's default waits; if your server uses others, pick Custom and enter the hours.",
    },
  };
  function paintServer() {
    const s = server();
    document.querySelectorAll('#server-tabs button').forEach((b) => { const on = b.dataset.server === s.id; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    for (const [id, notes] of [['nm-server-note', SERVER_NOTES.nm], ['fish-server-note', SERVER_NOTES.fish]]) { $(id).hidden = !notes[s.id]; setText($(id), notes[s.id] || ''); }
    setText($('timer-server-note'), SERVER_NOTES.timer[s.id]);
    $('magic-hachirin').hidden = !s.hachirin;
  }
  function setServer(id) {
    if (!V.SERVERS[id] || id === settings.server) return;
    const before = clone(settings);
    settings.server = id;
    rearmFor(before);
    persist();
    paintServer();
    buildGuildFilter();
    buildTimerKinds();
  }

  // ---- Guilds ----
  const CRAFTS = [...new Set(V.SHOPS.map((g) => g.craft))];
  function paintGuildChip(chip, s) {
    setClass(chip, `state ${s.open ? 'open' : s.holiday ? 'holiday' : 'closed'}`);
    setText(chip, s.open ? 'Open' : s.holiday ? 'Holiday' : 'Closed');
  }
  function guildRow(g) {
    const chip = el('span', { class: 'state' }), inText = el('span', { class: 'count' }), sub = el('div', { class: 'sub' });
    const tr = el('tr', {},
      el('td', {}, g.craft, g.kind === 'guild' ? null : el('div', { class: 'sub', text: 'shop' })),
      el('td', { class: 'hide-sm wrap npc', text: g.npc }), el('td', { class: 'place', text: g.place }),
      el('td', { class: 'hide-sm', text: `${pad(g.open)}:00-${pad(g.close)}:00` }), holidaysOn() ? el('td', { class: 'hide-sm' }, dayName(g.holiday)) : null,
      el('td', {}, chip), el('td', {}, inText, sub),
      el('td', { class: 'c-bell' }, bell(`guild:${guildKey(g)}`, `Alarm before the ${shopName(g)} in ${g.place} opens`)));
    return { tr, update(now) {
      const s = V.guildStatus(g, now, holidaysOn());
      paintGuildChip(chip, s);
      tr.classList.toggle('live', s.open);
      setText(inText, `${s.open ? 'closes' : 'opens'} in ${countdown(s.until - now)}`);
      // The open stretch in local time: the rest of today's when open, the next one when closed.
      const closes = s.open ? s.until : s.until + (g.close - g.open) * V.HOUR;
      setText(sub, s.open ? `open until ${earth(closes, 'time')}` : `open ${earthWhen(s.until, now)} to ${earth(closes, 'time')}`);
    } };
  }
  function renderGuilds(now) {
    const key = `${settings.guildCraft}|${settings.guildOpenOnly}|${gen}`, holidays = holidaysOn();
    $('guild-holiday-head').hidden = !holidays;
    liveRows($('guilds'), key, now, () => {
      let list = V.SHOPS.filter((g) => settings.guildCraft === 'all' || g.craft === settings.guildCraft);
      // With "open now" on, the list itself changes whenever any guild opens or closes.
      const expires = settings.guildOpenOnly ? Math.min(...list.map((g) => V.guildStatus(g, now, holidays).until)) : Infinity;
      if (settings.guildOpenOnly) list = list.filter((g) => V.guildStatus(g, now, holidays).open);
      return { rows: list.length ? list.map(guildRow) : [emptyRow(8, 'Nothing in this filter is open right now.')], expires };
    });
  }
  function buildGuildFilter() {
    const chip = (label, active, onclick, title) => el('button', { class: `chip${active ? ' active' : ''}`, type: 'button', 'aria-pressed': active ? 'true' : 'false', title, onclick }, label);
    // Retail has no guild holidays, so the switch is only offered for the other two.
    const holidays = server().holidays ? [chip('Guild holidays', settings.guildHolidays, () => {
      settings.guildHolidays = !settings.guildHolidays;
      for (const a of alarms) if (a.kind === 'guild') runtime.delete(alarmId(a)); // re-arm for the new openings
      persist(); buildGuildFilter();
    }, 'Close each guild and shop all day on its weekly holiday, for servers that keep guild holidays')] : [];
    $('guild-filter').replaceChildren(
      chip('Open now', settings.guildOpenOnly, () => { settings.guildOpenOnly = !settings.guildOpenOnly; persist(); buildGuildFilter(); }),
      ...holidays,
      chip('All', settings.guildCraft === 'all', () => { settings.guildCraft = 'all'; persist(); buildGuildFilter(); }),
      ...CRAFTS.map((c) => chip(c, settings.guildCraft === c, () => { settings.guildCraft = c; persist(); buildGuildFilter(); })),
    );
  }

  // ---- Weather ----
  const ZONES = V.weatherZones();
  const ZONE_NAME = new Map(ZONES.map((z) => [z.id, z.name]));
  const ZONE_ID = new Map(ZONES.map((z) => [z.name.toLowerCase(), z.id]));
  const ELEMENT_KEYS = ['fire', 'ice', 'wind', 'earth', 'lightning', 'water', 'light', 'dark'];
  // Every weather chip is a button that opens the weather finder on that weather.
  function weatherChip(id) {
    const key = V.WEATHER_ELEMENT[id], double = V.isDoubleWeather(id);
    return el('button', {
      class: `wx${key ? ` el-${key}` : ' plain'}${double ? ' double' : ''}`, type: 'button', 'data-wx': String(id),
      title: `${key ? `${V.ELEMENTS[key]} weather${double ? ', double' : ''}. ` : ''}Find where and when ${V.WEATHERS[id]} is likely`,
    }, V.WEATHERS[id]);
  }
  // A zone or fish box takes any spelling of a name; an unknown name is flagged and leaves the setting
  // alone. The browser only suggests names that match what is in the box, so focusing it empties the box
  // (the name stays visible as the placeholder) to show the whole list; leaving without typing puts it back.
  // Picking a name leaves the box focused, so a second click or the Down arrow brings no focus event;
  // while the box still shows the current pick, those empty it the same way.
  const wireZoneInput = (input, get, set, allowEmpty) => wirePickInput(input, ZONE_NAME, ZONE_ID, get, set, allowEmpty);
  function wirePickInput(input, NAME, ID, get, set, allowEmpty) {
    const placeholder = input.placeholder, current = () => NAME.get(get()) || '', restore = () => { input.value = current(); };
    let typed = false;
    const open = () => { typed = false; input.placeholder = current() || placeholder; input.value = ''; };
    const reopen = () => { if (document.activeElement === input && input.value && input.value === current()) open(); };
    restore();
    input.addEventListener('focus', open);
    input.addEventListener('pointerdown', reopen);
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') reopen(); });
    input.addEventListener('input', () => { typed = true; });
    input.addEventListener('blur', () => { input.placeholder = placeholder; if (!typed && !input.value) restore(); });
    input.addEventListener('change', () => {
      if (!typed && !input.value) return; // emptied by focusing, not by the user
      const text = input.value.trim(), id = ID.get(text.toLowerCase());
      if (id != null) { input.value = NAME.get(id); input.classList.remove('invalid'); typed = false; set(id); persist(); }
      else if (!text && allowEmpty) { input.classList.remove('invalid'); set(null); persist(); }
      else input.classList.add('invalid');
    });
  }
  function renderWeather(now) {
    const zone = settings.wxZone, starred = settings.starredZones.includes(zone), star = $('wx-star');
    star.hidden = !ZONE_NAME.has(zone);
    setText(star, starred ? '★ Starred' : '☆ Star zone');
    setClass(star, `button small star-btn${starred ? ' on' : ''}`);
    star.setAttribute('aria-pressed', starred ? 'true' : 'false');
    $('wx-fog').hidden = !V.hasMorningFog(zone);
    liveRows($('wx-body'), `${zone}|${settings.wxCount}|${gen}`, now, () => {
      if (!ZONE_NAME.has(zone)) return { rows: [emptyRow(6, 'Pick a zone to see its weather.')] };
      const days = V.nextDays(now, settings.wxCount);
      return { expires: days[0].end, rows: days.map((d) => {
        const w = V.weatherOf(zone, d.dayNumber), tr = el('tr'), when = spanCell(tr, d.start, d.end);
        tr.append(el('td', {}, dayName(d.weekday)), el('td', { class: 'hide-sm', text: earthWhen(d.start, now) }), when.td,
          el('td', {}, weatherChip(w.normal)), el('td', {}, weatherChip(w.common)), el('td', {}, weatherChip(w.rare)));
        return { tr, update: when.update };
      }) };
    });
  }
  function wireWeather() {
    $('zone-list').replaceChildren(...ZONES.map((z) => el('option', { value: z.name })));
    wireZoneInput($('wx-zone'), () => settings.wxZone, (id) => { settings.wxZone = id; });
    const count = $('wx-count');
    count.replaceChildren(...[8, 16, 32, 64].map((n) => { const o = el('option', { value: String(n), text: `${n} days` }); o.selected = n === settings.wxCount; return o; }));
    count.addEventListener('change', (e) => { settings.wxCount = +e.target.value; persist(); });
    $('wx-share').addEventListener('click', () => copyLink(`#weather&zone=${settings.wxZone}`));
    $('wx-star').addEventListener('click', () => toggleZoneStar(settings.wxZone));
  }

  // ---- Starred zones ----
  // Today's and tomorrow's weather for each starred zone, on the hero row and in the mini clock.
  function toggleZoneStar(id) {
    if (!ZONE_NAME.has(id)) return;
    const list = settings.starredZones;
    settings.starredZones = list.includes(id) ? list.filter((z) => z !== id) : [...list, id];
    persist();
  }
  const weatherChips = (w) => [weatherChip(w.normal), ' ', weatherChip(w.common), ' ', weatherChip(w.rare)];
  function renderStarredZones(now) {
    const ids = settings.starredZones.filter((id) => ZONE_NAME.has(id));
    $('zones-card').hidden = !ids.length;
    if (!ids.length) return;
    const today = V.clock(now).dayNumber;
    liveRows($('zones-body'), `${ids.join(',')}|${today}|${gen}`, now, () => ({
      expires: V.dayStartOf(today + 1),
      rows: ids.map((id) => ({ tr: el('tr', {},
        el('td', { class: 'c-star' }, el('button', { class: 'icon-btn on', type: 'button', 'aria-pressed': 'true', 'aria-label': `Unstar ${ZONE_NAME.get(id)}`, title: 'Unstar', onclick: () => toggleZoneStar(id) }, '★')),
        el('td', { class: 'wrap' }, el('button', { class: 'link-btn zone-link', type: 'button', onclick: () => openForecast(id) }, ZONE_NAME.get(id))),
        el('td', { class: 'wx-line' }, ...weatherChips(V.weatherOf(id, today))),
        el('td', { class: 'wx-line hide-sm' }, ...weatherChips(V.weatherOf(id, today + 1)))) })),
    }));
  }

  // ---- Weather finder ----
  const FIND_WEATHERS = V.WEATHERS.map((_, id) => id).filter((id) => id > 0);
  const TIERS = ['Usual', 'Common', 'Rare'];
  function openForecast(zoneId) {
    showFull();
    settings.wxZone = zoneId; persist();
    $('wx-zone').value = ZONE_NAME.get(zoneId) || '';
    $('weather-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // A group's zones as forecast links; a long group shows six and says how many more.
  function zoneLinks(group) {
    const shown = group.zones.slice(0, 6), more = group.zones.length - shown.length;
    const links = shown.flatMap((z, i) => [i ? ', ' : null, el('button', { class: 'link-btn zone-link', type: 'button', onclick: () => openForecast(z.id) }, z.name)]);
    return el('td', { class: 'wrap zones', title: more ? group.zones.map((z) => z.name).join(', ') : null }, ...links, more ? ` and ${more} more` : null);
  }
  function findFor(ids) {
    showFull();
    settings.wxFind = ids; persist(); buildFinderChips();
    $('finder-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // The finder's own chips toggle instead; they are checked by class because their click rebuilds
  // the row, so by the time the click reaches here the chip is no longer inside #wf-chips.
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.wx[data-wx]');
    if (chip && !chip.classList.contains('pickable')) findFor([Number(chip.dataset.wx)]);
  });
  function buildFinderChips() {
    $('wf-chips').replaceChildren(...FIND_WEATHERS.map((id) => {
      const on = settings.wxFind.includes(id), chip = weatherChip(id);
      chip.classList.add('pickable');
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      chip.title = on ? `Stop searching for ${V.WEATHERS[id]}` : `Search for ${V.WEATHERS[id]}`;
      chip.addEventListener('click', () => {
        settings.wxFind = on ? settings.wxFind.filter((x) => x !== id) : [...settings.wxFind, id].sort((a, b) => a - b);
        persist(); buildFinderChips();
      });
      return chip;
    }));
  }
  function finderRow(f, now) {
    const tr = el('tr'), chance = el('span', { class: `state ${f.always ? 'always' : TIERS[f.tier].toLowerCase()}`, text: f.always ? 'Always' : TIERS[f.tier] });
    const first = V.clock(f.start), lastDay = f.always ? null : V.clock(f.end - 1), days = f.always ? 0 : lastDay.dayNumber - first.dayNumber + 1;
    const when = f.always ? 'every day' : days === 1 ? V.DAYS[first.weekday].name : `${V.DAYS[first.weekday].name} to ${V.DAYS[lastDay.weekday].name} (${days} days)`;
    const span = f.always ? null : spanCell(tr, f.start, f.end);
    tr.append(zoneLinks(f.group), el('td', {}, chance, ' ', weatherChip(f.weather)), el('td', { text: when }),
      el('td', { class: 'hide-sm', text: f.always ? '-' : earthWhen(f.start, now) }), span ? span.td : el('td', {}, el('span', { class: 'state now', text: 'now' })));
    return { tr, update: span ? span.update : null };
  }
  function oddsRow(r) {
    const pct = (n) => (n * 100 < 2160 ? '<1' : String(Math.round((n / 2160) * 100)));
    const cell = (n) => el('td', {}, n ? `${n} days` : '-', n ? el('span', { class: 'sub', text: ` (${pct(n)}%)` }) : null);
    return { tr: el('tr', {}, zoneLinks(r.group), ...(r.group.fixed ? [el('td', { colspan: 3, text: 'every day, always' })] : r.counts.map(cell))) };
  }
  const FINDER_SOON_ROWS = 30, FINDER_ODDS_ROWS = 15;
  function renderFinder(now) {
    const ids = settings.wxFind, key = `${ids.join(',')}|${settings.wxFindDays}|${gen}`;
    $('wf-fog').hidden = !ids.includes(V.FOG);
    liveRows($('wf-soon'), key, now, () => {
      if (!ids.length) return { rows: [emptyRow(5, 'Click a weather anywhere on the page, or pick one above.')] };
      const found = V.findWeather(now, ids, settings.wxFindDays);
      const rows = found.slice(0, FINDER_SOON_ROWS).map((f) => finderRow(f, now));
      if (found.length > FINDER_SOON_ROWS) rows.push(emptyRow(5, `${found.length - FINDER_SOON_ROWS} more later or less likely. Narrow the search or pick fewer weathers.`));
      const ends = found.filter((f) => !f.always).map((f) => f.end);
      return { rows: rows.length ? rows : [emptyRow(5, `Not in the next ${settings.wxFindDays} Vana'diel days. The table below shows where it does happen.`)], expires: ends.length ? Math.min(...ends) : V.clock(now).dayStart + V.DAY };
    });
    liveRows($('wf-odds'), key, now, () => {
      if (!ids.length) return { rows: [emptyRow(4, 'Pick a weather to rank the zones.')] };
      const odds = V.weatherOdds(ids);
      return { rows: odds.length ? odds.slice(0, FINDER_ODDS_ROWS).map(oddsRow) : [emptyRow(4, 'No zone in the data has this weather.')] };
    });
  }
  function wireFinder() {
    const days = $('wf-days');
    days.replaceChildren(...[8, 16, 32, 64].map((n) => { const o = el('option', { value: String(n), text: `${n} days` }); o.selected = n === settings.wxFindDays; return o; }));
    days.addEventListener('change', (e) => { settings.wxFindDays = +e.target.value; persist(); });
    $('wf-share').addEventListener('click', () => copyLink(`#find&w=${settings.wxFind.join(',')}&days=${settings.wxFindDays}`));
    buildFinderChips();
  }

  // ---- Elemental magic ----
  // An element's day and weather effects in one zone: today, the next day its day and its double
  // weather can line up (+35%), and the next 16 days.
  const ELEMENT_DAY = Object.fromEntries(V.DAYS.map((d, i) => [d.element, i]));
  const fx = (n) => el('span', { class: `fx${n > 0 ? ' up' : n < 0 ? ' down' : ''}`, text: n ? `${n > 0 ? '+' : ''}${n}%` : '' });
  const doubleWeatherOf = (element) => V.WEATHERS.findIndex((_, id) => V.WEATHER_ELEMENT[id] === element && V.isDoubleWeather(id));
  function buildMagicElements() {
    $('magic-elements').replaceChildren(...ELEMENT_KEYS.map((k) => {
      const on = settings.magicElement === k;
      return el('button', { class: `chip el${on ? ' active' : ''}`, type: 'button', style: `--c: var(--${k})`, 'aria-pressed': on ? 'true' : 'false',
        onclick: () => { settings.magicElement = k; persist(); buildMagicElements(); } }, V.ELEMENTS[k]);
    }));
  }
  function magicRow(element, zoneId, d) {
    const tr = el('tr'), when = spanCell(tr, d.start, d.end), m = V.magicDay(element, zoneId, d.dayNumber);
    tr.append(el('td', {}, dayName(d.weekday)), el('td', { class: 'hide-sm', text: earthWhen(d.start, Date.now()) }), when.td, el('td', {}, fx(m.day)),
      ...m.slots.map((s) => el('td', { class: 'wx-line' }, weatherChip(s.id), ' ', fx(s.effect))), el('td', { class: 'best' }, fx(m.best)));
    return { tr, update: when.update };
  }
  function renderMagic(now) {
    const element = settings.magicElement, zone = settings.magicZone, today = V.clock(now).dayNumber;
    if (!ZONE_NAME.has(zone)) {
      setText($('magic-now'), '-'); setText($('magic-best'), '-');
      liveRows($('magic-body'), `none|${gen}`, now, () => ({ rows: [emptyRow(8, 'Pick a zone.')] }));
      return;
    }
    const m = V.magicDay(element, zone, today), signed = (n) => `${n > 0 ? '+' : ''}${n}%`;
    const range = m.best === m.worst ? (m.best ? signed(m.best) : 'no change') : `${signed(m.worst)} to ${signed(m.best)}`;
    setText($('magic-now'), `${V.DAYS[V.mod(today, 8)].name}: ${m.day ? `${signed(m.day)} from the day` : 'no effect from the day'}; ${range} with today's weathers`);
    const body = $('magic-body');
    liveRows(body, `${element}|${zone}|${today}|${gen}`, now, () => {
      const double = doubleWeatherOf(element), [best] = V.findWindows(now, { weekdays: [ELEMENT_DAY[element]], zone, weatherIds: [double] }, 1);
      if (best) body._best = { ...best, text: `${V.WEATHERS[double]} is ${TIERS[V.weatherTier(V.weatherOf(zone, V.clock(best.start).dayNumber), [double])].toLowerCase()} that day` };
      else {
        // No +35% here. One 2,160-day weather cycle holds every weekday and weather pairing this zone
        // has (2,160 is a multiple of 8), so the best day in it is the best this zone can do.
        let top = -Infinity, at = null;
        for (let n = today; n < today + 2160; n++) { const b = V.magicDay(element, zone, n).best; if (b > top) { top = b; at = n; } }
        body._best = { start: V.dayStartOf(at), end: V.dayStartOf(at + 1), label: top, text: `the best here; never +35% in ${ZONE_NAME.get(zone)}` };
      }
      return { expires: V.dayStartOf(today + 1), rows: V.nextDays(now, 16).map((d) => magicRow(element, zone, d)) };
    });
    const b = body._best;
    $('magic-best-label').textContent = b.label == null ? 'Next +35%' : `Next ${signed(b.label)}`;
    setText($('magic-best'), `${V.DAYS[V.clock(b.start).weekday].name} ${earthWhen(b.start, now)}, ${now >= b.start ? `now, ends in ${countdown(b.end - now)}` : `in ${countdown(b.start - now)}`} (${b.text})`);
  }
  function wireMagic() {
    wireZoneInput($('magic-zone'), () => settings.magicZone, (id) => { settings.magicZone = id; });
    $('magic-share').addEventListener('click', () => copyLink(`#magic&e=${settings.magicElement}&zone=${settings.magicZone}`));
    buildMagicElements();
  }

  // ---- Calendar files ----
  // Events go out as an .ics download that any calendar app can import, each with a reminder at the
  // default alarm warning. UIDs are stable, so importing the same events again updates them.
  function downloadIcs(name, events) {
    if (!events.length) { toast('Nothing to add', 'There are no events in this list.'); return; }
    const url = URL.createObjectURL(new Blob([V.icsCalendar(events.map((e) => ({ ...e, uid: `${e.uid}@ffxi-timer`, alarmMinutes: settings.lead })), Date.now())], { type: 'text/calendar' }));
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Calendar file saved', `${name} has ${events.length} event${events.length === 1 ? '' : 's'}. Open it to add them to your calendar.`);
  }
  // A short stable tag for a planner search, for UIDs.
  const tagOf = (s) => { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };
  const vanaSpan = (start, end) => `${V.DAYS[V.clock(start).weekday].name} ${vanaHM(start)} to ${V.DAYS[V.clock(end - 1).weekday].name} ${vanaHM(end)} Vana'diel`;
  function calendarEvents(now) {
    return calendarItems(now).map((item) => {
      if (settings.calTab === 'days') {
        const d = V.DAYS[item.weekday];
        return { uid: `day-${item.dayNumber}`, start: item.start, end: item.end, summary: `FFXI ${d.name}`,
          description: `C.E. ${ceDate(item.start)}, ${item.moon.percent}% ${V.MOON_PHASES[item.moon.phase]}. ${V.ELEMENTS[d.element]} gets the day bonus, ${V.ELEMENTS[d.weak]} the penalty.` };
      }
      if (settings.calTab === 'moon') {
        const a = V.moon(item.start), b = V.moon(item.end - 1);
        return { uid: `moon-${a.phase}-${item.start}`, start: item.start, end: item.end, summary: `FFXI ${V.MOON_PHASES[a.phase]}`, description: `${a.percent}% to ${b.percent}%, ${vanaSpan(item.start, item.end)}.` };
      }
      const d = V.RSE_DUNGEONS[item.place], race = V.RSE_RACES[item.race], place = V.RSE_PLACES[item.place];
      return { uid: `rse-${item.start}`, start: item.start, end: item.end, summary: `FFXI RSE: ${race} in ${place}`,
        description: `Trade ${/^[AEIOU]/.test(d.key) ? 'an' : 'a'} ${d.key} to the Treasure Chest in ${place} for a Magical Pattern. A ??? there pops ${d.nm}, which can drop the ${V.RSE_GEAR[item.race].sachet}.` };
    });
  }
  function plannerEvents(now, q) {
    const what = describeQuery(q), tag = tagOf(planKey(q));
    return V.findWindows(now, q, 8).map((w) => ({ uid: `plan-${tag}-${w.start}`, start: w.start, end: w.end, summary: `FFXI: ${what}`, description: `${vanaSpan(w.start, w.end)}.` }));
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

  // ---- Converter ----
  // One moment shown as Earth and as Vana'diel time; change either side and the other follows. Until
  // something is typed it follows the clock, and "Now" goes back to that.
  let convertAt = null;
  const CV_FIELDS = ['cv-year', 'cv-month', 'cv-date', 'cv-hour', 'cv-minute'];
  const localInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  // Either side takes a moment from 2000 to 2200, as the page's other date boxes do; one outside that is
  // marked invalid and the converter keeps the last good moment.
  function wireConverter() {
    $('cv-earth').addEventListener('change', (e) => {
      const t = new Date(e.target.value).getTime(), ok = S.validTime(t); // a date and time with no offset parses as local time
      e.target.classList.toggle('invalid', !ok);
      if (ok) convertAt = t;
    });
    CV_FIELDS.forEach((id) => $(id).addEventListener('change', () => {
      const [year, month, date, hour, minute] = CV_FIELDS.map((f) => Number($(f).value));
      const ok = [year, month, date, hour, minute].every(Number.isInteger) && month >= 1 && month <= 12 && date >= 1 && date <= 30 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
        && S.validTime(V.fromVana(year, month, date, hour, minute));
      CV_FIELDS.forEach((f) => $(f).classList.toggle('invalid', !ok));
      if (ok) convertAt = V.fromVana(year, month, date, hour, minute);
    }));
    $('cv-now').addEventListener('click', () => { convertAt = null; ['cv-earth', ...CV_FIELDS].forEach((f) => $(f).classList.remove('invalid')); });
  }
  function renderConverter(now) {
    const t = convertAt ?? now, c = V.clock(t), m = V.moon(t);
    // A field being typed in is left alone.
    const put = (id, v) => { const e = $(id); if (e !== document.activeElement && e._v !== v) { e._v = v; e.value = v; } };
    put('cv-earth', localInput(t));
    [c.year, c.month, c.date, c.hour, c.minute].forEach((v, i) => put(CV_FIELDS[i], String(v)));
    const out = $('cv-out'), zones = settings.starredZones.filter((id) => ZONE_NAME.has(id));
    const key = `${Math.floor((t - V.EPOCH) / V.MIN)}|${zones.join(',')}|${gen}`;
    if (out._key !== key) {
      out._key = key;
      out._rel = el('span', { class: 'count' });
      out.replaceChildren(
        el('div', { class: 'cv-line' }, dayName(c.weekday), ` · C.E. ${ceDate(t)} ${pad(c.hour)}:${pad(c.minute)} · ${m.percent}% ${V.MOON_PHASES[m.phase]}`),
        el('div', { class: 'cv-line' }, `${earth(t, 'full')} local · ${earth(t, 'jst')} JST · `, out._rel),
        zones.length
          ? el('div', { class: 'cv-zones' }, zones.map((id) => el('div', { class: 'cv-line' }, el('span', { class: 'muted', text: `${ZONE_NAME.get(id)} ` }), ...weatherChips(V.weatherOf(id, c.dayNumber)))))
          : el('p', { class: 'hint', text: 'Pick a zone in the Weather panel and press ☆ Star zone to see its weather for this day here too.' }),
      );
    }
    setText(out._rel, convertAt == null ? 'now' : t >= now ? `in ${countdown(t - now)}` : `${countdown(now - t)} ago`);
  }

  // ---- Planner ----
  const PRESETS = [
    ['Full moon nights', { phases: [V.FULL], from: 18, to: 6 }],
    ['New moon Darksday', { weekdays: [7], phases: [V.NEW] }],
    ['Moon at 100%', { minPercent: 100 }],
    ['Lightsday daytime', { weekdays: [6], from: 6, to: 18 }],
  ];
  const hasWeather = (q) => q.zone != null && q.weatherElements?.length > 0;
  function describeQuery(q) {
    const parts = [];
    if (q.weekdays?.length) parts.push(q.weekdays.map((d) => V.DAYS[d].name).join('/'));
    if (q.phases?.length) parts.push(q.phases.map((p) => V.MOON_PHASES[p]).join('/'));
    if (q.from != null) parts.push(`${pad(q.from)}:00-${pad(q.to ?? 24)}:00`);
    if (q.minPercent != null || q.maxPercent != null) parts.push(`moon ${q.minPercent ?? 0}-${q.maxPercent ?? 100}%`);
    if (hasWeather(q)) {
      parts.push(`${q.weatherDouble ? 'double ' : ''}${q.weatherElements.map((e) => V.ELEMENTS[e]).join('/')} weather in ${ZONE_NAME.get(q.zone)}${q.weatherChance === 'usual' ? ' (usual)' : ''}`);
    }
    return parts.join(', ') || 'any time';
  }

  // ---- Share links ----
  // #plan&day=7&moon=0&hours=20-4&pct=90-100&zone=103&wx=earth&double=1&chance=usual opens the
  // planner with those conditions; #weather&zone=103 opens that zone's forecast.
  function planHash(q) {
    const p = new URLSearchParams();
    if (q.weekdays.length) p.set('day', q.weekdays.join(','));
    if (q.phases.length) p.set('moon', q.phases.join(','));
    if (q.from != null) p.set('hours', `${q.from}-${q.to ?? 24}`);
    if (q.minPercent != null || q.maxPercent != null) p.set('pct', `${q.minPercent ?? 0}-${q.maxPercent ?? 100}`);
    if (q.zone != null) p.set('zone', String(q.zone));
    if (q.weatherElements.length) p.set('wx', q.weatherElements.join(','));
    if (q.weatherDouble) p.set('double', '1');
    if (q.weatherChance === 'usual') p.set('chance', 'usual');
    const s = p.toString();
    return `#plan${s ? `&${s}` : ''}`;
  }
  function applyHash(hash) {
    const p = new URLSearchParams((hash || '').replace(/^#/, ''));
    const ints = (v, lo, hi) => (v || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n >= lo && n <= hi);
    const pair = (v, lo, hi) => { const m = /^(\d+)-(\d+)$/.exec(v || ''); return m && +m[1] >= lo && +m[1] <= hi && +m[2] >= lo && +m[2] <= hi ? [+m[1], +m[2]] : null; };
    if (p.has('plan')) {
      const hours = pair(p.get('hours'), 0, 24), pct = pair(p.get('pct'), 0, 100), zone = Number(p.get('zone'));
      settings.planner = {
        ...EMPTY_QUERY,
        weekdays: [...new Set(ints(p.get('day'), 0, 7))].sort((a, b) => a - b),
        phases: [...new Set(ints(p.get('moon'), 0, 7))].sort((a, b) => a - b),
        from: hours && hours[0] < 24 ? hours[0] : null, to: hours && hours[0] < 24 ? hours[1] || 24 : null,
        minPercent: pct ? pct[0] : null, maxPercent: pct ? pct[1] : null,
        zone: ZONE_NAME.has(zone) ? zone : null,
        weatherElements: (p.get('wx') || '').split(',').filter((e) => ELEMENT_KEYS.includes(e)),
        weatherDouble: p.get('double') === '1', weatherChance: p.get('chance') === 'usual' ? 'usual' : 'any',
      };
      persist();
      return 'planner-panel';
    }
    if (p.has('find')) {
      settings.wxFind = [...new Set(ints(p.get('w'), 1, V.WEATHERS.length - 1))].sort((a, b) => a - b);
      if ([8, 16, 32, 64].includes(Number(p.get('days')))) settings.wxFindDays = Number(p.get('days'));
      persist();
      return 'finder-panel';
    }
    if (p.has('magic') && ELEMENT_KEYS.includes(p.get('e'))) {
      settings.magicElement = p.get('e');
      if (ZONE_NAME.has(Number(p.get('zone')))) settings.magicZone = Number(p.get('zone'));
      persist();
      return 'magic-panel';
    }
    if (p.has('fish') && FISH_NAME.has(Number(p.get('f')))) {
      settings.fishId = Number(p.get('f'));
      persist();
      return 'fishing-panel';
    }
    if (p.has('weather') && ZONE_NAME.has(Number(p.get('zone')))) {
      settings.wxZone = Number(p.get('zone'));
      persist();
      return 'weather-panel';
    }
    return null;
  }
  async function copyLink(hash) {
    const url = location.href.split('#')[0] + hash;
    try { history.replaceState(null, '', hash); } catch (e) {}
    try { await navigator.clipboard.writeText(url); toast('Link copied', url); } catch (e) { toast('Copy this link', url); }
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
    $('pl-zone').value = ZONE_NAME.get(q.zone) || '';
    $('pl-zone').classList.remove('invalid');
    $('pl-chance').value = q.weatherChance;
    $('pl-wx').replaceChildren(
      ...ELEMENT_KEYS.map((k) => el('button', {
        class: `chip el${q.weatherElements.includes(k) ? ' active' : ''}`, type: 'button', style: `--c: var(--${k})`, 'aria-pressed': q.weatherElements.includes(k) ? 'true' : 'false',
        onclick: () => { q.weatherElements = q.weatherElements.includes(k) ? q.weatherElements.filter((x) => x !== k) : [...q.weatherElements, k]; persist(); buildPlanner(); },
      }, V.ELEMENTS[k])),
      el('button', {
        class: `chip${q.weatherDouble ? ' active' : ''}`, type: 'button', 'aria-pressed': q.weatherDouble ? 'true' : 'false', title: 'Only double weather (Heat Wave, Sand Storm and so on)',
        onclick: () => { q.weatherDouble = !q.weatherDouble; persist(); buildPlanner(); },
      }, 'Double only'));
  }
  // Built-in presets, then the searches you saved, each named by what it asks for. The one on screen
  // is highlighted.
  function buildPlannerPresets() {
    const current = planKey(settings.planner);
    const use = (q) => () => { settings.planner = { ...EMPTY_QUERY, ...JSON.parse(JSON.stringify(q)) }; persist(); buildPlanner(); };
    const chip = (name, q, extra = {}) => {
      const on = planKey(q) === current;
      return el('button', { class: `chip${on ? ' active' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: use(q), ...extra }, name);
    };
    $('planner-presets').replaceChildren(
      ...PRESETS.map(([name, preset]) => chip(name, preset)),
      ...settings.savedPlans.map((q) => {
        const name = describeQuery(q), label = name.length > 44 ? `${name.slice(0, 43)}…` : name;
        return el('span', { class: 'saved-plan' }, chip(label, q, { title: name }),
          el('button', { class: 'chip-x', type: 'button', 'aria-label': `Forget the saved search ${name}`, title: 'Forget this search',
            onclick: () => { settings.savedPlans = settings.savedPlans.filter((s) => planKey(s) !== planKey(q)); persist(); } }, '×'));
      }),
    );
  }
  function savePlan() {
    const q = settings.planner;
    if (isEmptyQuery(q)) { toast('Planner', 'Pick at least one condition first.'); return; }
    if (settings.savedPlans.some((s) => planKey(s) === planKey(q))) { toast('Already saved', describeQuery(q)); return; }
    settings.savedPlans = [...settings.savedPlans, JSON.parse(JSON.stringify(q))];
    persist();
    toast('Search saved', `${describeQuery(q)}. It is with the presets above the planner.`);
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
    wireZoneInput($('pl-zone'), () => q().zone, (id) => { q().zone = id; }, true);
    $('pl-chance').addEventListener('change', (e) => { q().weatherChance = e.target.value === 'usual' ? 'usual' : 'any'; persist(); });
    $('pl-share').addEventListener('click', () => copyLink(planHash(q())));
    $('pl-save').addEventListener('click', savePlan);
    $('pl-ics').addEventListener('click', () => {
      if (isEmptyQuery(q())) { toast('Planner', 'Pick at least one condition first.'); return; }
      downloadIcs('ffxi-planner.ics', plannerEvents(Date.now(), q()));
    });
  }
  function plannerRow(w, now, q) {
    const tr = el('tr'), when = spanCell(tr, w.start, w.end), c = V.clock(w.start), m = V.moon(w.start);
    const vanaHours = (w.end - w.start) / V.HOUR;
    const weather = hasWeather(q) ? V.weatherOf(q.zone, c.dayNumber) : null;
    tr.append(el('td', { text: earthWhen(w.start, now) }), el('td', { class: 'hide-sm', text: earthWhen(w.end, now) }),
      el('td', { class: 'hide-sm' }, countdown(w.end - w.start), el('span', { class: 'sub', text: ` (${vanaHours}h Vana'diel)` })), when.td,
      el('td', { class: 'wrap' }, dayName(c.weekday), ` ${pad(c.hour)}:00 · ${m.percent}% ${V.MOON_PHASES[m.phase]}`,
        weather ? el('span', { class: 'wx-line' }, ' · ', weatherChip(weather.normal), ' ', weatherChip(weather.common), ' ', weatherChip(weather.rare)) : null));
    return { tr, update: when.update };
  }
  function renderPlanner(now) {
    const q = settings.planner, bellSpec = `planner:${planKey(q)}`, presets = $('planner-presets');
    if ($('pl-alarm').dataset.alarm !== bellSpec) { $('pl-alarm').dataset.alarm = bellSpec; paintBell($('pl-alarm')); }
    const presetKey = `${bellSpec}|${JSON.stringify(settings.savedPlans)}`;
    if (presets._key !== presetKey) { presets._key = presetKey; buildPlannerPresets(); }
    liveRows($('pl-body'), `${JSON.stringify(q)}|${gen}`, now, () => {
      if (q.weatherElements.length && q.zone == null) return { rows: [emptyRow(5, 'Pick a zone for the weather condition.')] };
      if (isEmptyQuery(q)) return { rows: [emptyRow(5, 'Pick a day, a moon phase, an hour range, a moon percent or a zone\'s weather, or start from a preset.')] };
      const wins = V.findWindows(now, q, 8);
      return { rows: wins.length ? wins.map((w) => plannerRow(w, now, q)) : [emptyRow(5, 'These conditions never line up.')], expires: wins.length ? wins[0].end : Infinity };
    });
  }

  // ---- Fishing ----
  // A fish's spots, sorted by when the best fishing moon next comes with rain or a squall there. The
  // best moon days are the Waxing Gibbous and Full Moon days (a test checks it), so each spot's search
  // is an ordinary planner search, and Plan opens it in the planner for an alarm.
  const FISH = V.fishList().sort((a, b) => a.name.localeCompare(b.name));
  const FISH_NAME = new Map(FISH.map((f) => [f.id, f.name]));
  const FISH_ID = new Map(FISH.map((f) => [f.name.toLowerCase(), f.id]));
  const BAIT_POWER = ['', 'weak', 'good', 'strong'], BAIT_BONUS = [0, 35, 65, 80];
  const WATER = [6, 7];
  const BEST_MOON = { ...EMPTY_QUERY, phases: [3, V.FULL] };
  const fishQuery = (zoneId, rain) => (rain ? { ...BEST_MOON, zone: zoneId, weatherElements: ['water'] } : { ...BEST_MOON });
  function planFishing(zoneId, rain) {
    settings.planner = fishQuery(zoneId, rain);
    persist();
    buildPlanner();
    $('planner-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function fishInfo(f) {
    const facts = [`skill ${f.skill}`, f.large ? 'large fish' : 'small fish'];
    if (f.rarity < 1000) facts.push(`rare: ${f.rarity / 10}% of the usual hook chance`);
    if (f.legendary) facts.push('legendary');
    if (f.keyItem) facts.push(`needs the ${f.keyItem} key item`);
    return [
      el('div', { class: 'fish-facts' }, el('strong', { text: f.name }), ` · ${facts.join(' · ')}`),
      el('div', { class: 'fish-baits' }, el('span', { class: 'option-label', text: 'Bites on' }), ...f.baits.map((b) => {
        const lure = b.type === 1;
        return el('span', { class: `bait p${b.power}`, title: `LandSandBoat power ${b.power}: adds ${BAIT_BONUS[b.power] - (lure ? 5 : 0)} to the hook chance` },
          `${b.name}${lure ? ' (lure)' : ''}`, el('span', { class: 'sub', text: ` ${BAIT_POWER[b.power]}` }));
      })),
    ];
  }
  // Where it never rains or squalls, or the zone has no weather data, the best moon alone still counts.
  function fishSpotRow(s, now) {
    const hasWeather = ZONE_NAME.has(s.zoneId);
    let [w] = hasWeather ? V.findWindows(now, fishQuery(s.zoneId, true), 1) : [];
    const rain = !!w;
    if (!rain) [w] = V.findWindows(now, BEST_MOON, 1);
    const tr = el('tr'), when = spanCell(tr, w.start, w.end), c = V.clock(w.start);
    let detail;
    if (rain) {
      const wx = V.weatherOf(s.zoneId, c.dayNumber), tier = V.weatherTier(wx, WATER);
      detail = el('span', {}, dayName(c.weekday), ` ${earthWhen(w.start, now)} `, el('span', { class: `state ${TIERS[tier].toLowerCase()}`, text: TIERS[tier] }), ' ', weatherChip([wx.normal, wx.common, wx.rare][tier]));
    } else detail = el('span', {}, dayName(c.weekday), ` ${earthWhen(w.start, now)}`, el('div', { class: 'sub', text: hasWeather ? 'best moon only: no rain or squall here' : 'best moon only: no weather data' }));
    const notes = [V.isCity(s.zoneId) ? 'city: the moon adds at most 14 and no monsters bite' : '', s.difficulty ? 'harder: more casts catch nothing' : ''].filter(Boolean).join('; ');
    tr.append(
      el('td', { class: 'wrap' }, hasWeather ? el('button', { class: 'link-btn zone-link', type: 'button', onclick: () => openForecast(s.zoneId) }, s.zone) : s.zone),
      el('td', { class: 'wrap', text: s.area || 'whole zone' }),
      el('td', { class: 'wrap' }, detail), when.td,
      el('td', { class: 'hide-sm wrap sub', text: notes }),
      el('td', {}, el('button', { class: 'button small', type: 'button', title: 'Open this search in the planner, where it can have an alarm', onclick: () => planFishing(s.zoneId, rain) }, 'Plan')));
    return { tr, update: when.update, rain, start: w.start, end: w.end };
  }
  function renderFishing(now) {
    const f = FISH.find((x) => x.id === settings.fishId) || null, info = $('fish-info');
    if (info._fish !== f) { info._fish = f; info.replaceChildren(...(f ? fishInfo(f) : [el('p', { class: 'hint', text: 'Pick a fish.' })])); }
    // The moon and the bite hours, live.
    const m = V.moon(now), index = V.fishingMoon(m.percent, m.direction), [best] = V.bestFishingMoons(now, 1);
    const weight = V.FISH_MOON[index], rating = weight === V.FISH_MOON_BEST ? 'best' : weight >= 15 ? 'good' : weight ? 'poor' : 'no help';
    setText($('fish-moon'), `${V.MOON_PHASES[index]}, ${rating} for fishing`);
    $('fish-moon').title = `Adds ${weight} of a possible ${V.FISH_MOON_BEST} to the chance of hooking a fish`;
    setText($('fish-best'), !best ? '-' : now >= best.start ? `now, ends in ${countdown(best.end - now)}` : `${earthWhen(best.start, now)}, in ${countdown(best.start - now)}`);
    const c = V.clock(now), hours = V.BITE_HOURS.flatMap((h) => [c.dayStart + h * V.HOUR, c.dayStart + V.DAY + h * V.HOUR]).filter((t) => t + V.HOUR > now).sort((a, b) => a - b);
    setText($('fish-hour'), now >= hours[0] ? `now (${vanaHM(hours[0])}), ends in ${countdown(hours[0] + V.HOUR - now)}` : `${vanaHM(hours[0])}, in ${countdown(hours[0] - now)}`);
    liveRows($('fish-spots'), `${settings.fishId}|${gen}`, now, () => {
      if (!f) return { rows: [emptyRow(6, 'Pick a fish to see where and when it bites best.')] };
      // Spots that can have rain or a squall first, each group soonest first.
      const rows = V.fishSpots(f.id).map((s) => fishSpotRow(s, now)).sort((a, b) => b.rain - a.rain || a.start - b.start);
      return { rows, expires: Math.min(...rows.map((r) => r.end)) };
    });
  }
  function wireFishing() {
    $('fish-list').replaceChildren(...FISH.map((f) => el('option', { value: f.name })));
    wirePickInput($('fish-pick'), FISH_NAME, FISH_ID, () => settings.fishId, (id) => { settings.fishId = id; });
    $('fish-share').addEventListener('click', () => copyLink(`#fish&f=${settings.fishId}`));
  }

  // ---- Notorious monsters ----
  // Each NM's conditions, how it pops, and when its conditions next hold, soonest first. A weather
  // condition is a day that weather can come up, with the slot it takes that day.
  function hoursText(hours) {
    if (!hours) return '';
    const spans = [...hours].sort((a, b) => a[0] - b[0]).map((s) => [...s]);
    // A span to 24:00 and one from 00:00 are one span across midnight.
    if (spans.length > 1 && spans[0][0] === 0 && spans[spans.length - 1][1] === 24) spans[spans.length - 1][1] = spans.shift()[1];
    const length = ([a, b]) => (b - a + 24) % 24 || 24;
    if (spans.length > 1 && spans.every((s) => length(s) === 1)) return `${spans.map(([a]) => `${pad(a)}:00`).join(', ')} (an hour each)`;
    return spans.map(([a, b]) => `${pad(a)}:00-${pad(b % 24)}:00`).join(', ');
  }
  const duration = (s) => (s >= 3600 ? `${+(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)} min`);
  function popsText(nm) {
    const parts = [];
    if (nm.lottery) parts.push(`${nm.lottery.chance}% when its placeholder respawns after a kill${nm.lottery.cooldown ? `; can't return for ${duration(nm.lottery.cooldown)} after it dies` : ''}`);
    // Some of these are respawn timers and some are lockouts; either way it can't come back sooner.
    if (nm.respawn) parts.push(`can't appear again for ${nm.respawn.min === nm.respawn.max ? duration(nm.respawn.min) : `${duration(nm.respawn.min)} to ${duration(nm.respawn.max)}`} after it dies`);
    return parts.join('; ') || nm.pop || '';
  }
  function moonText(q) {
    if (!q.phases.length) return '';
    if (q.phases.length < 5) return q.phases.map((p) => V.MOON_PHASES[p]).join(' or ');
    return `any moon but ${V.MOON_PHASES.filter((_, p) => !q.phases.includes(p)).join(' or ')}`;
  }
  function setKill(nm, t) {
    const key = nmKey(nm);
    if (t == null) delete settings.nmKills[key]; else settings.nmKills[key] = t;
    runtime.delete(`nm:${key}`); // its alarm re-arms from the new time
    persist();
  }
  // Kill time controls: Killed marks it now; once set, the time can be edited or cleared.
  function killCell(nm, kill, wait) {
    const td = el('td', { class: 'nm-kill' }), status = el('div', { class: 'sub' });
    if (!wait) return { td: el('td', { class: 'muted', text: '-' }) };
    if (kill == null) {
      td.append(el('button', { class: 'button small', type: 'button', title: 'Mark it killed now; its next chance then waits for its timer', onclick: () => setKill(nm, Date.now()) }, 'Killed'));
      return { td };
    }
    td.append(
      el('input', { class: 'select kill-time', type: 'datetime-local', step: '60', value: localInput(kill), 'aria-label': `When ${nm.name} was killed`,
        onchange: (e) => { const t = new Date(e.target.value).getTime(), good = S.validTime(t); e.target.classList.toggle('invalid', !good); if (good) setKill(nm, t); } }),
      ' ', el('button', { class: 'button small danger', type: 'button', 'aria-label': `Clear ${nm.name}'s kill time`, title: 'Clear the kill time', onclick: () => setKill(nm, null) }, '×'), status);
    const first = kill + wait.min * 1000, last = kill + wait.max * 1000;
    return { td, update(now) {
      setText(status, now >= last ? 'timer done' : now >= first ? `timer may be done; at the latest in ${countdown(last - now)}`
        : wait.max > wait.min ? `timer done in ${countdown(first - now)} to ${countdown(last - now)}` : `timer done in ${countdown(first - now)}`);
    } };
  }
  function nmRow(nm, now) {
    const q = V.nmQuery(nm), fog = V.isFogOnly(nm), w = nmNext(nm, now), wait = nmWait(nm), kill = settings.nmKills[nmKey(nm)];
    const tr = el('tr'), when = w ? spanCell(tr, w.start, w.end) : null, c = w ? V.clock(w.start) : null, k = killCell(nm, kill, wait);
    const needs = [hoursText(fog ? q.hours : nm.hours), moonText(q), nm.weekday == null ? '' : V.DAYS[nm.weekday].name].filter(Boolean).join(' · ');
    let next = el('span', { class: 'muted', text: 'never' });
    if (w) {
      next = el('span', {}, dayName(c.weekday), ` ${earthWhen(w.start, now)}`);
      if (nm.weather) {
        // The slot the weather takes that day; for the morning fog, the slot of the roll that turns to Fog.
        const wx = V.weatherOf(nm.zoneId, c.dayNumber), tier = V.weatherTier(wx, q.weatherIds);
        next.append(' ', el('span', { class: `state ${TIERS[tier].toLowerCase()}`, text: TIERS[tier] }), ' ', weatherChip(fog ? V.FOG : [wx.normal, wx.common, wx.rare][tier]));
      }
    }
    tr.append(
      el('td', { class: 'wrap' }, el('button', { class: 'nm-name', type: 'button', 'data-nm': nmKey(nm), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'nm-card' }, nm.name),
        nm.extra ? el('div', { class: 'sub', text: nm.extra }) : null),
      el('td', { class: 'wrap' }, ZONE_NAME.has(nm.zoneId) ? el('button', { class: 'link-btn zone-link', type: 'button', onclick: () => openForecast(nm.zoneId) }, nm.zone) : nm.zone),
      el('td', { class: 'wrap' }, needs || null, needs && nm.weather ? ' · ' : null, ...(nm.weather || []).flatMap((id, i) => [i ? ' ' : null, weatherChip(id)])),
      el('td', { class: 'wrap sub hide-sm', text: popsText(nm) }),
      el('td', { class: 'wrap' }, next), when ? when.td : el('td', { text: '-' }), k.td,
      el('td', { class: 'c-bell' }, bell(`nm:${nmKey(nm)}`, `Alarm when ${nm.name} can next appear`)));
    return { tr, update(n) { when?.update(n); k.update?.(n); }, start: w ? w.start : Infinity, end: w ? w.end : Infinity };
  }
  function renderNms(now) {
    $('nm-clear').hidden = !Object.keys(settings.nmKills).length;
    liveRows($('nm-body'), `${gen}`, now, () => {
      const rows = [...NM.values()].map((nm) => nmRow(nm, now)).sort((a, b) => a.start - b.start);
      return { rows: rows.length ? rows : [emptyRow(8, 'No NMs loaded.')], expires: Math.min(...rows.map((r) => r.end)) };
    });
    followCard();
  }
  function wireNms() {
    $('nm-clear').addEventListener('click', () => {
      for (const key of Object.keys(settings.nmKills)) runtime.delete(`nm:${key}`);
      settings.nmKills = {};
      persist();
    });
    wireCard();
  }

  // ---- NM cards ----
  // Pointing at an NM's name, focusing it or tapping it opens a card: the NM's level, the monsters it
  // rolls off, where BG Wiki places it on the map, what it needs, how it pops and its drops. The card
  // stays while the pointer is over the name or the card, so its link can be used. A click or tap pins
  // it open until Escape, another click on the name or a click anywhere else.
  const CARDS = window.VanaNmCards || {};
  const card = { trigger: null, key: null, pinned: false, timer: 0 };
  const rateText = (rate) => `${+(rate / 10).toFixed(1)}%`;
  function cardBody(nm) {
    const c = CARDS[nmKey(nm)] || { level: null, placeholders: [], drops: [], map: null };
    const q = V.nmQuery(nm), fog = V.isFogOnly(nm);
    const needs = [hoursText(fog ? q.hours : nm.hours), moonText(q), nm.weekday == null ? '' : V.DAYS[nm.weekday].name].filter(Boolean).join(' · ');
    const level = c.level && `level ${c.level[0] === c.level[1] ? c.level[0] : `${c.level[0]}-${c.level[1]}`} in LandSandBoat`;
    // A drop the NM rolls for more than once is one line, with each roll's rate.
    const drops = [];
    for (const [name, rate] of c.drops) { const d = drops.find((x) => x.name === name); if (d) d.rates.push(rate); else drops.push({ name, rates: [rate] }); }
    const fact = (label, ...value) => el('div', {}, el('dt', { text: label }), el('dd', {}, ...value));
    return [
      el('div', { class: 'nm-card-head' }, el('strong', { text: nm.name }), el('span', { class: 'sub', text: [nm.zone, level].filter(Boolean).join(' · ') })),
      el('dl', { class: 'facts one-col' },
        c.map ? fact(c.map.at === 'qm' ? 'The ??? is at' : 'Where', `${c.map.grid.join(', ')} `,
          el('a', { href: `https://www.bg-wiki.com/index.php?oldid=${c.map.revid}`, target: '_blank', rel: 'noopener noreferrer', title: `BG Wiki: ${c.map.page}` }, 'BG Wiki')) : null,
        c.placeholders.length ? fact(c.placeholders.length > 1 ? 'Placeholders' : 'Placeholder', c.placeholders.join(', ')) : null,
        needs || nm.weather ? fact('Needs', needs || null, needs && nm.weather ? ' · ' : null, ...(nm.weather || []).flatMap((id, i) => [i ? ' ' : null, weatherChip(id)])) : null,
        fact('Pops', popsText(nm) || '-')),
      el('h4', { text: 'Drops in LandSandBoat data' }),
      drops.length
        ? el('ul', { class: 'nm-drops' }, drops.map((d) => el('li', {}, el('span', { text: d.name }),
          el('span', { class: 'rate', title: d.rates.length > 1 ? `${d.rates.length} separate rolls` : null, text: d.rates.map(rateText).join(', ') }))))
        : el('p', { class: 'muted', text: 'No drops listed in LandSandBoat data.' }),
      el('p', { class: 'hint', text: "The level and drop rates are LandSandBoat's base values, not retail's or HorizonXI's. Treasure Hunter raises the drop rates." }),
    ];
  }
  function openCard(trigger, pin) {
    clearTimeout(card.timer);
    const nm = NM.get(trigger.dataset.nm), box = $('nm-card');
    if (!nm) return;
    if (card.trigger && card.trigger !== trigger) card.trigger.setAttribute('aria-expanded', 'false');
    if (card.key !== trigger.dataset.nm || box.hidden) { box.replaceChildren(...cardBody(nm)); box.setAttribute('aria-label', `${nm.name}: level, map, needs and drops`); }
    Object.assign(card, { trigger, key: trigger.dataset.nm, pinned: pin });
    trigger.setAttribute('aria-expanded', 'true');
    box.hidden = false;
    placeCard();
  }
  function closeCard(refocus) {
    clearTimeout(card.timer);
    const box = $('nm-card');
    if (box.hidden) return;
    box.hidden = true;
    card.pinned = false;
    if (card.trigger) {
      card.trigger.setAttribute('aria-expanded', 'false');
      if (refocus && card.trigger.isConnected && document.activeElement !== card.trigger) { card.refocusing = true; card.trigger.focus(); card.refocusing = false; }
    }
  }
  const closeSoon = () => { clearTimeout(card.timer); if (!card.pinned) card.timer = setTimeout(() => closeCard(false), 300); };
  // Below the name, or above it when there is no room below, and inside the window's width.
  function placeCard() {
    const box = $('nm-card'), r = card.trigger.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    const left = Math.max(8, Math.min(r.left, document.documentElement.clientWidth - w - 8));
    const top = r.bottom + 6 + h <= innerHeight || r.top < h + 6 ? r.bottom + 6 : r.top - 6 - h;
    box.style.left = `${left + scrollX}px`;
    box.style.top = `${top + scrollY}px`;
  }
  // When the NM list is built again, an open card moves to the new row for its NM.
  function followCard() {
    if ($('nm-card').hidden || !card.trigger || card.trigger.isConnected) return;
    const next = [...document.querySelectorAll('#nm-body .nm-name')].find((b) => b.dataset.nm === card.key);
    if (!next) { closeCard(false); return; }
    card.trigger = next;
    next.setAttribute('aria-expanded', 'true');
    placeCard();
  }
  function wireCard() {
    const body = $('nm-body'), box = $('nm-card'), nameIn = (e) => e.target instanceof Element && e.target.closest('.nm-name');
    body.addEventListener('pointerover', (e) => {
      const t = nameIn(e);
      if (!t || e.pointerType !== 'mouse' || card.pinned) return;
      clearTimeout(card.timer);
      card.timer = setTimeout(() => openCard(t, false), 150);
    });
    body.addEventListener('pointerout', (e) => { const t = nameIn(e); if (t && e.pointerType === 'mouse' && !t.contains(e.relatedTarget)) closeSoon(); });
    box.addEventListener('pointerenter', () => clearTimeout(card.timer));
    box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });
    body.addEventListener('focusin', (e) => {
      const t = nameIn(e);
      if (card.refocusing) { card.refocusing = false; return; } // focus coming back after the card closed
      if (t && !card.pinned) openCard(t, false);
    });
    document.addEventListener('focusout', (e) => {
      if (box.hidden || card.pinned || !(e.target === card.trigger || box.contains(e.target))) return;
      if (e.relatedTarget && (box.contains(e.relatedTarget) || e.relatedTarget === card.trigger)) return;
      closeSoon();
    });
    body.addEventListener('click', (e) => {
      const t = nameIn(e);
      if (!t) return;
      if (card.trigger === t && card.pinned && !box.hidden) closeCard(false); else openCard(t, true);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!box.hidden && !box.contains(e.target) && !(card.trigger && card.trigger.contains(e.target))) closeCard(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !box.hidden) closeCard(box.contains(document.activeElement) || document.activeElement === card.trigger);
    });
    // The card sits at the end of the page, so Tab from a name with its card open goes into the card,
    // where its link and weather chips are; Tab past the card's last control goes on to what follows the
    // name, and Shift+Tab from its first goes back to the name.
    const tabbable = (root) => [...root.querySelectorAll('a[href], button, input, select')].filter((x) => !x.disabled && x.tabIndex >= 0 && x.getClientRects().length);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || box.hidden || !card.trigger) return;
      const inCard = tabbable(box), at = inCard.indexOf(document.activeElement);
      if (!inCard.length) return;
      if (document.activeElement === card.trigger && !e.shiftKey) { e.preventDefault(); inCard[0].focus(); }
      else if (at === 0 && e.shiftKey) { e.preventDefault(); card.trigger.focus(); }
      else if (at === inCard.length - 1 && !e.shiftKey) {
        e.preventDefault();
        const page = tabbable(document).filter((x) => !box.contains(x)), next = page[page.indexOf(card.trigger) + 1];
        closeCard(false);
        if (next) next.focus();
      }
    });
    window.addEventListener('resize', () => { if (!box.hidden) placeCard(); });
    body.closest('.table-wrap').addEventListener('scroll', () => { if (!box.hidden) placeCard(); }, { passive: true });
  }

  // ---- Personal timers ----
  // Each timer the player started: its kind, an optional note, when it started and when it ends.
  // A kind's rule is the picked server's: on HorizonXI, Dynamis waits for the conquest tally.
  const TIMER_KIND = Object.fromEntries(V.TIMER_KINDS.map((k) => [k.id, k]));
  const kindOf = (id) => V.timerRule(TIMER_KIND[id], settings.server);
  const RULE_TEXT = { jp: 'after the next JP midnight', vana: "after the next Vana'diel midnight", tally: 'after the conquest tally' };
  const ruleText = (k) => (k.rule === 'hours' ? (k.hours ? `${k.hours} hours` : 'hours you choose') : RULE_TEXT[k.rule]);
  const ruleDetail = (k) => (k.note ? `${ruleText(k)}, ${k.note}` : ruleText(k));
  function timerOf(id) { return settings.timers.find((x) => x.id === id) || null; }
  function timerReadyAt(x) { const k = kindOf(x.kind); return V.timerReady(k.rule, x.start, k.id === 'custom' ? x.hours : k.hours); }
  function timerName(x) { return x ? `${TIMER_KIND[x.kind].name}${x.label ? ` (${x.label})` : ''}` : 'Timer'; }
  // Removing a timer removes its alarm too.
  function removeTimers(ids) {
    settings.timers = settings.timers.filter((x) => !ids.includes(x.id));
    alarms = alarms.filter((a) => !(a.kind === 'timer' && ids.includes(a.ref)));
    for (const id of ids) runtime.delete(`timer:${id}`);
    saveAlarms();
    persist();
    refreshBells();
  }
  function timerRow(x, now) {
    const k = kindOf(x.kind), ready = timerReadyAt(x), tr = el('tr'), inText = el('span', { class: 'count' }), chip = el('span', { class: 'state open', text: 'Ready' });
    tr.append(
      el('td', { class: 'wrap' }, el('strong', { text: k.name }), x.label ? el('div', { class: 'sub', text: x.label }) : null, el('div', { class: 'sub', text: ruleDetail(k.id === 'custom' ? { ...k, hours: x.hours } : k) })),
      el('td', {}, el('input', { class: 'select kill-time', type: 'datetime-local', step: '60', value: localInput(x.start), 'aria-label': `When ${timerName(x)} started`,
        onchange: (e) => { const t = new Date(e.target.value).getTime(), good = S.validTime(t); e.target.classList.toggle('invalid', !good); if (good) { x.start = t; runtime.delete(`timer:${x.id}`); persist(); } } })),
      el('td', {}, earthWhen(ready, now), el('div', { class: 'sub', text: `${vanaHM(ready)} Vana'diel` })),
      el('td', {}, chip, inText),
      el('td', { class: 'c-bell' }, bell(`timer:${x.id}`, `Alarm when ${timerName(x)} is ready`)),
      el('td', {}, el('button', { class: 'button small danger', type: 'button', 'aria-label': `Remove ${timerName(x)}`, title: 'Remove this timer', onclick: () => removeTimers([x.id]) }, '×')));
    return { tr, ready, update(n) {
      const done = n >= ready;
      chip.hidden = !done;
      tr.classList.toggle('live', done);
      setText(inText, done ? '' : countdown(ready - n));
    } };
  }
  function renderTimers(now) {
    $('timer-clear').hidden = !settings.timers.length;
    $('timer-hours').hidden = settings.timerKind !== 'custom';
    liveRows($('timer-body'), `${gen}`, now, () => {
      const rows = settings.timers.map((x) => timerRow(x, now)).sort((a, b) => a.ready - b.ready);
      return { rows: rows.length ? rows : [emptyRow(6, 'No timers. Pick one above and press Start now when you do it.')] };
    });
  }
  // The kinds the picked server has, each with its wait. Timers already started for a kind it hides
  // stay in the list.
  function buildTimerKinds() {
    const hidden = server().hidden, kinds = V.TIMER_KINDS.filter((k) => !hidden.includes(k.id));
    if (!kinds.some((k) => k.id === settings.timerKind)) settings.timerKind = kinds[0].id;
    $('timer-kind').replaceChildren(...kinds.map((k) => { const o = el('option', { value: k.id, text: `${k.name} (${ruleText(kindOf(k.id))})` }); o.selected = k.id === settings.timerKind; return o; }));
  }
  function wireTimers() {
    const kindSelect = $('timer-kind');
    buildTimerKinds();
    kindSelect.addEventListener('change', (e) => { settings.timerKind = e.target.value; persist(); });
    $('timer-add').addEventListener('click', () => {
      const kind = settings.timerKind, hours = Number($('timer-hours').value);
      if (kind === 'custom' && !(hours >= 0.1 && hours <= 8760)) { $('timer-hours').classList.add('invalid'); toast('Custom timer', 'Enter how many hours it lasts, from 0.1 to 8,760 (a year).'); return; }
      $('timer-hours').classList.remove('invalid');
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      settings.timers = [...settings.timers, { id, kind, label: $('timer-label').value.trim(), start: Date.now(), ...(kind === 'custom' ? { hours } : {}) }];
      $('timer-label').value = '';
      persist();
    });
    $('timer-clear').addEventListener('click', () => removeTimers(settings.timers.map((x) => x.id)));
  }

  // ---- Alarm list ----
  function alarmRow(a) {
    const id = alarmId(a), src = SOURCES[a.kind];
    const next = el('span'), nextVana = el('div', { class: 'sub' }), inText = el('span', { class: 'count' });
    const lead = el('select', { class: 'select', 'aria-label': 'Minutes of warning', onchange: (e) => { a.lead = +e.target.value; runtime.delete(id); saveAlarms(); } },
      LEADS.map((n) => { const o = el('option', { value: String(n), text: `${n} min before` }); o.selected = n === a.lead; return o; }));
    const onOff = el('button', { class: 'button small', type: 'button', onclick: () => { a.on = !a.on; runtime.delete(id); saveAlarms(); } }, a.on ? 'On' : 'Off');
    // Only offered once a webhook is saved; the list rebuilds when that setting changes.
    const toDiscord = a.discord !== false;
    const discord = settings.discord ? el('button', { class: 'button small', type: 'button', 'aria-pressed': toDiscord ? 'true' : 'false', title: 'Also post this alarm to the Discord webhook',
      onclick: () => { a.discord = !toDiscord; saveAlarms(); } }, `Discord: ${toDiscord ? 'on' : 'off'}`) : null;
    const remove = el('button', { class: 'button small danger', type: 'button', 'aria-label': 'Remove alarm', onclick: () => { alarms = alarms.filter((x) => x !== a); runtime.delete(id); saveAlarms(); refreshBells(); } }, '×');
    const tr = el('tr', {},
      el('td', { class: 'wrap' }, src.label(a.ref)),
      el('td', {}, lead), el('td', {}, next, nextVana), el('td', {}, inText), el('td', { class: 'actions' }, onOff, discord ? ' ' : null, discord, ' ', remove));
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

  // ---- Simple view ----
  // The clock, moon and resets cards stay; below them every departure in the order they leave, the
  // guilds, and the next eight days with your starred zones' usual weather. The other panels hide.
  const VIEWS = ['full', 'simple'];
  function applyView() {
    document.documentElement.classList.toggle('simple-view', settings.view === 'simple');
    document.querySelectorAll('#view-tabs button').forEach((b) => {
      const on = b.dataset.view === settings.view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function setView(view) {
    if (!VIEWS.includes(view) || view === settings.view) return;
    settings.view = view;
    persist();
    applyView();
    tick();
  }
  // Links into a panel that simple view hides switch back to the full view first.
  const showFull = () => setView('full');
  function simpleRouteRow(r) {
    const tr = el('tr'), chip = el('span', { class: 'state boarding', text: 'Boarding' }), departs = el('td'), local = el('td', { class: 'hide-sm' }), inText = el('span', { class: 'count' });
    tr.append(
      el('td', { class: 'route-name', title: `${GROUP[r.group]}, ${r.from} to ${r.to}` }, settings.starred.includes(r.id) ? el('span', { class: 'star-mark', text: '★ ' }) : null,
        short(r.from), el('span', { class: 'arrow', text: '→' }), short(r.to), el('span', { class: 'sub', text: ` ${GROUP[r.group]}` })),
      departs, local, el('td', {}, chip, ' ', inText),
      el('td', { class: 'c-bell' }, bell(`route:${r.id}`, `Alarm before ${r.from} to ${r.to} departs`)));
    return { tr, update(now) {
      const s = V.routeStatus(r, now), boarding = s.state === 'boarding';
      chip.hidden = !boarding;
      tr.classList.toggle('live', boarding);
      setText(departs, vanaHM(s.departs));
      setText(local, earth(s.departs, 'time'));
      setText(inText, countdown(s.departs - now));
    } };
  }
  function simpleGuildRow(g) {
    const chip = el('span', { class: 'state' }), inText = el('span', { class: 'count' });
    const tr = el('tr', {}, el('td', { text: g.craft }), el('td', { class: 'place', text: g.place }), el('td', { class: 'hide-sm' }, chip), el('td', {}, inText),
      el('td', { class: 'c-bell' }, bell(`guild:${guildKey(g)}`, `Alarm before the ${shopName(g)} in ${g.place} opens`)));
    return { tr, update(now) {
      const s = V.guildStatus(g, now, holidaysOn());
      paintGuildChip(chip, s);
      tr.classList.toggle('live', s.open);
      // Phones hide the status column, so a holiday is named here too.
      setText(inText, `${s.open ? 'closes' : s.holiday ? 'holiday, opens' : 'opens'} in ${countdown(s.until - now)}`);
    } };
  }
  function renderSimple(now) {
    // Soonest departure first; the order changes whenever one leaves.
    liveRows($('s-routes'), `${gen}`, now, () => {
      const list = V.ROUTES.map((r) => ({ r, departs: V.routeStatus(r, now).departs })).sort((a, b) => a.departs - b.departs);
      return { rows: list.map(({ r }) => simpleRouteRow(r)), expires: list[0].departs + 1 };
    });
    liveRows($('s-guilds'), `${gen}`, now, () => ({ rows: V.GUILDS.map(simpleGuildRow) }));
    const zones = settings.starredZones.filter((id) => ZONE_NAME.has(id)), today = V.clock(now).dayNumber;
    liveRows($('s-days'), `${today}|${zones.join(',')}|${gen}`, now, () => {
      $('s-days-head').replaceChildren(el('tr', {}, el('th', { text: "Vana'diel day" }), el('th', { class: 'hide-sm', text: 'Starts' }), el('th', { text: 'In' }),
        el('th', { text: 'Moon' }), zones.map((id) => el('th', { text: ZONE_NAME.get(id) }))));
      return { expires: V.dayStartOf(today + 1), rows: V.nextDays(now, 8).map((d) => {
        const tr = el('tr'), when = spanCell(tr, d.start, d.end);
        tr.append(el('td', {}, dayName(d.weekday)), el('td', { class: 'hide-sm', text: earthWhen(d.start, now) }), when.td,
          el('td', { text: `${d.moon.percent}% ${V.MOON_PHASES[d.moon.phase]}` }),
          ...zones.map((id) => { const w = V.weatherOf(id, d.dayNumber); return el('td', { title: `Usual ${V.WEATHERS[w.normal]}, common ${V.WEATHERS[w.common]}, rare ${V.WEATHERS[w.rare]}` }, weatherChip(w.normal)); }));
        return { tr, update: when.update };
      }) };
    });
    $('s-days-hint').hidden = zones.length > 0;
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
    // Starred routes, then starred zones with today's usual weather, four lines at most; with nothing
    // starred, the daily and weekly resets.
    const routes = settings.starred.map((id) => ROUTE[id]).filter(Boolean)
      .map((r) => { const s = V.routeStatus(r, now); return [`${short(r.from)} → ${short(r.to)}`, `${s.state === 'boarding' ? 'boarding · ' : ''}${countdown(s.departs - now)}`]; });
    const zones = settings.starredZones.filter((id) => ZONE_NAME.has(id))
      .map((id) => [ZONE_NAME.get(id), V.WEATHERS[V.weatherOf(id, c.dayNumber).normal]]);
    const starred = [...routes, ...zones].slice(0, 4);
    const items = starred.length ? starred
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
        const pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 230 });
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
    window.open(`${location.pathname}?mini`, 'ffxi-timer-mini', 'popup,width=340,height=250');
  }

  // ---- Latest news ----
  // The bar starts closed and asks for nothing until it is opened. news.json sits next to the page and the
  // News workflow refreshes it every hour; while the bar is open it is read again every 15 minutes, and a
  // read that fails keeps the headlines already shown. Nothing here can stop the clock or the alarms.
  const News = window.VanaNews;
  const NEWS_REFRESH = 15 * 60000, NEWS_TIMEOUT = 8000;
  const news = { feeds: null, status: 'idle', loading: false, checkedAt: -Infinity };
  const siteLink = (label) => el('a', { href: News.SITE, target: '_blank', rel: 'noopener noreferrer', text: label });
  function renderNews() {
    const note = {
      idle: ['Opening this loads the newest headlines.'],
      loading: ['Loading the newest headlines.'],
      ok: ['The newest headlines from the official site, which this site checks every hour. ', siteLink('Open the official site'), '.'],
      stale: ['The headlines could not be updated just now; these are the last ones loaded. ', siteLink('Open the official site'), '.'],
      failed: ['The news could not load right now. The clock and alarms are not affected. ', siteLink('Read the news on the official site'), '.'],
      unavailable: ['Headlines load when this page is opened from a website, such as ', el('a', { href: 'https://radmagelabs.com/ffxi/', text: 'radmagelabs.com/ffxi/' }),
        '. Here, ', siteLink('read the news on the official site'), '.'],
    }[news.loading && !news.feeds ? 'loading' : news.status];
    $('news-note').replaceChildren(...note);
    $('news-cols').replaceChildren(...(news.feeds ? News.FEEDS.map((f) => el('section', { class: 'news-col', 'data-feed': f.key },
      el('h3', { text: f.title }),
      news.feeds[f.key].length
        ? el('ul', { class: 'news-list' }, news.feeds[f.key].map((i) => el('li', {},
          el('a', { href: i.link, target: '_blank', rel: 'noopener noreferrer', text: i.title }),
          i.date ? el('time', { datetime: i.date, text: earth(Date.parse(i.date), 'news') }) : null)))
        : el('p', { class: 'muted', text: 'No headlines.' }))) : []));
  }
  async function loadNews() {
    if (news.loading) return;
    // A page opened from disk can't read files next to it.
    if (location.protocol === 'file:') { news.status = 'unavailable'; renderNews(); return; }
    news.loading = true;
    news.checkedAt = Date.now();
    renderNews();
    let feeds = null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), NEWS_TIMEOUT);
    try {
      const res = await fetch('news.json', { cache: 'no-cache', credentials: 'omit', signal: ctl.signal });
      if (res.ok) feeds = News.sanitize(await res.json());
    } catch (e) { /* shown as could not load */ } finally { clearTimeout(timer); }
    news.loading = false;
    if (feeds) Object.assign(news, { feeds, status: 'ok' });
    else news.status = news.feeds ? 'stale' : 'failed';
    safely('news', renderNews);
  }
  function refreshNews(now) {
    if ($('news').open && news.status !== 'unavailable' && now - news.checkedAt >= NEWS_REFRESH) loadNews();
  }
  // Whether the bar is open is kept for this tab; opening it the first time loads the headlines.
  function wireNews() {
    const bar = $('news');
    bar.addEventListener('toggle', () => {
      if (settings.newsOpen !== bar.open) { settings.newsOpen = bar.open; persist(); }
      if (bar.open) refreshNews(Date.now());
    });
    renderNews();
    if (settings.newsOpen) bar.open = true; // fires toggle, which loads the headlines
  }

  // ---- Theme ----
  // Same scheme as Kard and Delta: no attribute means follow the system setting.
  const { THEMES } = S;
  let themeMode = S.checkTheme(read(THEME_KEY));
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
  // Another tab saved something. A null key means storage was cleared.
  window.addEventListener('storage', (e) => {
    if (e.storageArea !== localStorage) return;
    if (e.key === THEME_KEY || e.key === null) applyTheme(S.checkTheme(e.newValue));
    if (e.key === SETTINGS_KEY || e.key === null) safely('settings from another tab', pullSettings);
    if (e.key === ALARMS_KEY || e.key === null) safely('alarms from another tab', pullAlarms);
  });
  // After another tab's change, the controls built from the shared settings are built again. A box
  // being typed in is left alone.
  function refreshControls() {
    if (miniMode) return;
    const put = (id, v) => { const e = $(id); if (e && e !== document.activeElement) e.value = v; };
    safely('toolbar', paintToolbar);
    safely('server rules', paintServer);
    safely('guild filter', buildGuildFilter);
    safely('timer kinds', buildTimerKinds);
    safely('planner controls', buildPlannerPresets);
    put('lead-default', String(settings.lead));
    put('trip-transfer', String(settings.tripTransfer));
    put('discord-url', settings.discord);
    safely('Discord', paintDiscord);
    refreshBells();
  }

  // ---- Wiring ----
  function paintToolbar() {
    setText($('hour-toggle'), hour12() ? '12h' : '24h');
    setText($('sound-toggle'), `Sound: ${settings.sound ? 'on' : 'off'}`);
    document.querySelectorAll('#route-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === settings.routeTab));
    document.querySelectorAll('#cal-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === settings.calTab));
  }
  function wire() {
    document.querySelectorAll('.bell[data-alarm]').forEach((b) => { if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', BELL); paintBell(b); });
    $('hour-toggle').addEventListener('click', () => { settings.hour12 = !hour12(); persist(); paintToolbar(); });
    $('sound-toggle').addEventListener('click', () => { settings.sound = !settings.sound; persist(); paintToolbar(); unlockAudio(); if (settings.sound) chime(); });
    $('mini-button').addEventListener('click', openMini);
    $('view-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
    $('server-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-server]'); if (b) setServer(b.dataset.server); });
    $('rse-details').addEventListener('click', () => {
      showFull();
      settings.calTab = 'rse'; rseFocus = null; persist(); paintToolbar(); buildCalendarControls();
      $('calendar-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('theme-toggle').addEventListener('click', cycleTheme);
    $('about-button').addEventListener('click', () => $('about-dialog').showModal());
    // The tagline's section links. The simple view has its own departures and guilds; a section it
    // hides opens the full view first. Focus moves along so the keyboard carries on from there.
    document.querySelectorAll('.tagline a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = settings.view === 'simple' && a.dataset.simple ? a.dataset.simple : a.getAttribute('href').slice(1);
      if (id === a.getAttribute('href').slice(1)) showFull();
      const target = $(id);
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    $('route-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { settings.routeTab = b.dataset.tab; persist(); paintToolbar(); } });
    $('cal-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { settings.calTab = b.dataset.tab; persist(); paintToolbar(); buildCalendarControls(); } });
    $('cal-ics').addEventListener('click', () => downloadIcs(`ffxi-${settings.calTab}.ics`, calendarEvents(Date.now())));
    const lead = $('lead-default');
    lead.replaceChildren(...LEADS.map((n) => { const o = el('option', { value: String(n), text: `${n} min before` }); o.selected = n === settings.lead; return o; }));
    lead.addEventListener('change', (e) => { settings.lead = +e.target.value; persist(); });
    $('notify-button').addEventListener('click', () => { if ('Notification' in window) Notification.requestPermission().then(paintNotify, () => {}); });
    $('test-alarm').addEventListener('click', () => { unlockAudio(); notify('Test alarm', 'This is how an alarm looks and sounds.', 'test'); });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input, select, textarea, dialog[open], .nm-card'))) return;
      if (e.key === 't' || e.key === 'T') cycleTheme();
      else if (e.key === 'm' || e.key === 'M') openMini();
      else if (e.key === 's' || e.key === 'S') setView(settings.view === 'simple' ? 'full' : 'simple');
      else if (e.key === '?') $('about-dialog').showModal();
    });
    document.addEventListener('visibilitychange', tick);
    wirePlanner();
    wireWeather();
    wireFinder();
    wireTrips();
    wireConverter();
    wireFishing();
    wireNms();
    wireMagic();
    wireTimers();
    wireDiscord();
    window.addEventListener('hashchange', () => openTarget(applyHash(location.hash)));
  }
  // After a shared link is applied: refresh the controls it touched and bring its panel into view.
  function openTarget(id) {
    if (!id) return;
    showFull();
    buildPlanner();
    buildFinderChips();
    $('wx-zone').value = ZONE_NAME.get(settings.wxZone) || '';
    $('fish-pick').value = FISH_NAME.get(settings.fishId) || '';
    $('magic-zone').value = ZONE_NAME.get(settings.magicZone) || '';
    buildMagicElements();
    $('wf-days').value = String(settings.wxFindDays);
    tick();
    requestAnimationFrame(() => $(id).scrollIntoView({ block: 'start' }));
  }

  // A panel that throws is skipped and logged once, so one broken panel can't stop the clock, the
  // alarms or the other panels. It tries again on every tick.
  const failed = new Set();
  function safely(name, f) {
    try { f(); } catch (e) { if (!failed.has(name)) { failed.add(name); console.error(`ffxi-timer: ${name} failed`, e); } }
  }
  const PANELS = [['ships', renderRoutes], ['trips', renderTrips], ['guilds', renderGuilds], ['weather', renderWeather], ['weather finder', renderFinder],
    ['elemental magic', renderMagic], ['calendars', renderCalendar], ['converter', renderConverter], ['planner', renderPlanner], ['fishing', renderFishing],
    ['notorious monsters', renderNms], ['timers', renderTimers], ['alarm list', renderAlarms]];
  function tick() {
    const now = Date.now();
    if (miniMode) { safely('mini clock', () => renderMini(now)); return; }
    checkAlarms(now);
    if (!document.hidden) {
      safely('clock, moon and resets', () => renderHero(now));
      safely('starred zones', () => renderStarredZones(now));
      safely('news', () => refreshNews(now));
      if (settings.view === 'simple') safely('simple view', () => renderSimple(now));
      else for (const [name, render] of PANELS) safely(name, () => render(now));
    }
    if (mini) safely('mini clock', () => renderMini(now));
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

  // Each start-up step on its own too, so the clock starts whatever happens to one of them.
  safely('theme', () => applyTheme(themeMode));
  if (miniMode) {
    document.title = 'ffxi-timer mini';
    $('mini-root').hidden = false;
    mini = makeMini($('mini-root'));
  } else {
    // ?simple opens the simple view and keeps it as the choice.
    if (/[?&]simple\b/.test(location.search) && settings.view !== 'simple') { settings.view = 'simple'; persist(); }
    let target = null;
    safely('view', applyView);
    safely('shared link', () => { target = applyHash(location.hash); });
    for (const [name, step] of [['controls', wire], ['toolbar', paintToolbar], ['server rules', paintServer], ['notifications', paintNotify], ['guild filter', buildGuildFilter],
      ['calendar controls', buildCalendarControls], ['planner controls', buildPlanner], ['news', wireNews]]) safely(name, step);
    safely('shared link', () => openTarget(target));
    if (repairs.length) toast('Saved data repaired', `${repairs.join('. ')}. The data as it was is kept in this browser's storage with _backup after its name.`);
    // The alarm tab: wait in line for the lock, and take it over on a click or key press here.
    if (locks) safely('alarm tab', () => leadAlarms(false));
    window.addEventListener('pointerdown', takeOver);
    // A control focused at the edge of a table that scrolls sideways is scrolled fully into view, with
    // room for its focus ring; the browser leaves one that is partly showing where it is.
    document.addEventListener('focusin', (e) => {
      const wrap = e.target instanceof Element && e.target.closest('.table-wrap');
      if (!wrap || wrap.scrollWidth <= wrap.clientWidth) return;
      const r = e.target.getBoundingClientRect(), left = wrap.getBoundingClientRect().left + wrap.clientLeft, room = 6;
      if (r.right > left + wrap.clientWidth - room) wrap.scrollLeft += r.right - (left + wrap.clientWidth - room);
      else if (r.left < left + room) wrap.scrollLeft -= left + room - r.left;
    });
    window.addEventListener('keydown', takeOver);
    paintAlarmTab();
    // A save still waiting for the lock when the tab goes away is written straight away.
    window.addEventListener('pagehide', (e) => { if (saving.has('settings')) commitSettings(); if (saving.has('alarms')) commitAlarms(); if (e.persisted) standDown(); });
    // A tab back from being frozen, from the back-forward cache or from the background reads the shared
    // settings, alarms and theme again before anything is changed in it, in case storage events from
    // other tabs didn't reach it while it was away. It only reads; nothing is written.
    const catchUp = () => {
      safely('settings from another tab', pullSettings);
      safely('alarms from another tab', pullAlarms);
      const theme = S.checkTheme(read(THEME_KEY));
      if (theme !== themeMode) applyTheme(theme);
    };
    window.addEventListener('pageshow', (e) => { if (e.persisted) { catchUp(); standUp(); } });
    document.addEventListener('freeze', standDown);
    document.addEventListener('resume', () => { catchUp(); standUp(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUp(); });
  }
  tick();
  startClock();
  if (!miniMode) requestAnimationFrame(frame);
})();
