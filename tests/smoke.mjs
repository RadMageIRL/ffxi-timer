// A browser smoke test: the page in headless Chrome over the DevTools protocol, served from this repo on
// 127.0.0.1, with no packages. It starts the page with empty storage, reloads it, and starts it again with
// saved data from v0.8, and checks that it loads every file without errors and that the main controls work.
//
//   node tests/smoke.mjs        (CHROME=<path> picks the browser; otherwise the usual install paths are tried)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const FIXTURE = JSON.parse(readFileSync(join(root, 'tests/fixtures/v0.8-storage.json'), 'utf8'));

// The checks run inside the page. Each returns a list of [name, passed, detail].
const PRELUDE = `const out = [], ok = (name, pass, detail = '') => out.push([name, !!pass, String(detail)]);
  const $ = (id) => document.getElementById(id), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = (id) => $(id).querySelectorAll('tr:not(.empty)').length;
  const repaired = () => [...document.querySelectorAll('.toast strong')].some((x) => /repaired/i.test(x.textContent));`;
export const CHECKS = {
  fresh: `${PRELUDE}
  ok("the clock shows a Vana'diel time", /^\\d\\d:\\d\\d$/.test($('v-time').textContent), $('v-time').textContent);
  const counts = ['routes', 'guilds', 'wx-body', 'magic-body', 'cal-body', 'nm-body'].map((id) => rows(id));
  ok('the ships, guilds, weather, magic, calendar and NM tables are filled', counts.every((n) => n > 0) && counts[5] >= 40, counts.join(','));
  ok('nothing was saved yet, so nothing was repaired', !repaired());
  document.querySelector('#view-tabs [data-view="simple"]').click(); await sleep(200);
  const simple = document.documentElement.classList.contains('simple-view') && rows('s-routes') > 0;
  document.querySelector('#view-tabs [data-view="full"]').click(); await sleep(200);
  ok('Simple shows the simple board and Full goes back', simple && !document.documentElement.classList.contains('simple-view'));
  document.querySelector('#server-tabs [data-server="horizon"]').click(); await sleep(400);
  const server = JSON.parse(localStorage.getItem('ffxi_timer_settings') || '{}').server;
  const pressed = document.querySelector('#server-tabs [data-server="horizon"]').getAttribute('aria-pressed');
  ok('the server pill picks HorizonXI and saves it', server === 'horizon' && pressed === 'true', server + ' ' + pressed);
  const name = document.querySelector('#nm-body .nm-name');
  name.click(); await sleep(200);
  const card = $('nm-card'), opened = !card.hidden && /Drops in LandSandBoat data/.test(card.textContent);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100);
  ok("an NM's card opens on a click and closes on Escape", opened && card.hidden, name.textContent);
  const set = (id, v) => { const e = $(id); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); };
  set('cv-year', 99999999); await sleep(1200);
  const refused = $('cv-year').classList.contains('invalid');
  [['cv-year', 1000], ['cv-month', 1], ['cv-date', 1], ['cv-hour', 0], ['cv-minute', 0]].forEach(([id, v]) => set(id, v)); await sleep(1200);
  const want = Math.floor(Vana.fromVana(1000, 1, 1, 0, 0) / 1000), got = Math.floor(new Date($('cv-earth').value).getTime() / 1000);
  ok('the converter refuses a year out of range and still converts C.E. 1000-01-01', refused && !$('cv-year').classList.contains('invalid') && got === want, $('cv-earth').value + ' / ' + new Date(want * 1000).toISOString());
  $('cv-now').click();
  $('theme-toggle').click(); await sleep(100);
  const theme = localStorage.getItem('ffxi_timer_theme');
  ok('the Theme button switches the theme and saves it', theme === 'light' && document.documentElement.dataset.theme === 'light', theme);
  return out;`,
  reload: `${PRELUDE}
  ok('after a reload the theme is set before the page draws, and the server is still HorizonXI', document.documentElement.dataset.theme === 'light'
    && document.querySelector('#server-tabs [data-server="horizon"]').getAttribute('aria-pressed') === 'true');
  ok('a reload repairs nothing', !repaired());
  // The news bar asked for nothing while closed (the request check after the first load); open, it
  // reads news.json and shows each headline as a link to the official site.
  const bar = $('news'), closed = !bar.open;
  bar.open = true; await sleep(1200);
  const links = [...bar.querySelectorAll('.news-list a')];
  const official = links.every((a) => a.protocol === 'https:' && VanaNews.HOSTS.includes(a.hostname) && a.target === '_blank' && /noopener/.test(a.rel));
  ok('the news bar starts closed, and opened it shows headlines from both feeds linking to the official site',
    closed && links.length > 0 && official && bar.querySelectorAll('.news-col .news-list').length === VanaNews.FEEDS.length, links.length);
  bar.open = false; await sleep(100);
  ok('closing the news bar keeps it closed for this tab', JSON.parse(localStorage.getItem('ffxi_timer_settings') || '{}').newsOpen === false);
  return out;`,
  fixture: (f) => `${PRELUDE}
  const f = ${JSON.stringify(f)}, st = f.settings;
  ok('saved data from v0.8 loads with no repair note', !repaired());
  ok('its settings and alarms are left exactly as v0.8 saved them', localStorage.getItem('ffxi_timer_settings') === JSON.stringify(st) && localStorage.getItem('ffxi_timer_alarms') === JSON.stringify(f.alarms));
  const kills = [...document.querySelectorAll('#nm-body .kill-time')].filter((x) => x.value).length;
  const shown = [rows('timer-body'), rows('alarms'), rows('zones-body'), document.querySelectorAll('.saved-plan').length, kills];
  const want = [st.timers.length, f.alarms.length, st.starredZones.length, st.savedPlans.length, Object.keys(st.nmKills).length];
  ok('its timers, alarms, starred zones, saved searches and NM kill times all show', shown.join() === want.join(), shown.join() + ' / ' + want.join());
  const tab = document.querySelector('#route-tabs .active');
  document.querySelector('#route-tabs [data-tab="starred"]').click(); await sleep(1200); // the table is rebuilt on the next tick
  const starred = rows('routes');
  ok('its starred routes, ships tab, theme, 24-hour clock and forecast length apply', starred === st.starred.length && tab.dataset.tab === st.routeTab
    && document.documentElement.dataset.theme === f.theme && $('hour-toggle').textContent === '24h' && $('wx-count').value === String(st.wxCount),
    [starred, tab.dataset.tab, document.documentElement.dataset.theme, $('hour-toggle').textContent, $('wx-count').value].join(','));
  return out;`,
};
// What to put in storage before the v0.8 load.
export const fixtureStorage = (f) => ({ ffxi_timer_settings: JSON.stringify(f.settings), ffxi_timer_alarms: JSON.stringify(f.alarms), ffxi_timer_theme: f.theme });
// Messages browsers log that say nothing about the page: audio blocked until a click.
export const harmless = (text) => /AudioContext|autoplay/i.test(text);

// The repo over http on 127.0.0.1, recording every request and its status.
export async function serve(dir = root) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
  const requests = [];
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
    let status = 404, body = 'not found';
    if (path === 'favicon.ico') status = 204;
    else if (!path.startsWith('..')) { try { body = readFileSync(join(dir, path)); status = 200; } catch (e) {} }
    requests.push({ path: req.url, status });
    res.writeHead(status, status === 200 ? { 'content-type': types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'no-store' } : {});
    res.end(status === 204 ? undefined : body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, requests, close: () => server.close() };
}
// Every file index.html loads came back, and nothing else was asked for apart from the favicon.
export function requestCheck(requests) {
  const index = readFileSync(join(root, 'index.html'), 'utf8');
  const assets = [...index.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map((m) => `/${m[1]}`);
  const missing = assets.filter((a) => !requests.some((r) => r.path === a && r.status === 200));
  const extra = requests.filter((r) => r.path !== '/' && !r.path.startsWith('/?') && r.path !== '/favicon.ico' && !assets.includes(r.path));
  return ['every script and the stylesheet load, and nothing else is requested', missing.length === 0 && extra.length === 0, JSON.stringify({ missing, extra })];
}

async function chrome() {
  const paths = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const bin = paths.find((p) => existsSync(p));
  if (!bin) throw new Error('no Chrome found; set CHROME to its path');
  const profile = mkdtempSync(join(tmpdir(), 'ffxi-smoke-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1366,900'];
  if (process.env.CI) args.push('--no-sandbox'); // Linux runners don't allow Chrome's sandbox
  const proc = spawn(bin, [...args, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 150 && !port; i++) { await sleep(200); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) {} }
  if (!port) throw new Error('Chrome did not start');
  let page;
  for (let i = 0; i < 50 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) {} if (!page) await sleep(200); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) errors.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) errors.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return {
    name: 'Chrome',
    errors,
    async load(url, wait = 1800) { await send('Page.navigate', { url }); await sleep(wait); },
    async evaluate(body) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result.result.value;
    },
    async close() { try { await send('Browser.close'); } catch (e) {} await sleep(300); proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch (e) {} },
  };
}

// The whole run against one browser driver: { load, evaluate, errors, close }.
export async function run(browser, site) {
  const results = [];
  const record = (list) => { for (const r of list) results.push(r); };
  await browser.load(site.url, 600);
  await browser.evaluate(`localStorage.clear(); return 1`);
  site.requests.length = 0; browser.errors.length = 0;
  await browser.load(site.url);
  record(await browser.evaluate(CHECKS.fresh));
  results.push(requestCheck(site.requests));
  await browser.load(site.url);
  record(await browser.evaluate(CHECKS.reload));
  const setup = fixtureStorage(FIXTURE);
  await browser.evaluate(`localStorage.clear(); ${Object.entries(setup).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} return 1`);
  await browser.load(site.url);
  record(await browser.evaluate(CHECKS.fixture(FIXTURE)));
  const errors = browser.errors.filter((e) => !harmless(e));
  results.push(['no errors or warnings in the console', errors.length === 0, errors.slice(0, 3).join(' | ')]);
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const site = await serve();
  let browser, failed = 0;
  try {
    browser = await chrome();
    for (const [name, pass, detail] of await run(browser, site)) {
      if (!pass) failed++;
      console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass || !detail ? '' : `: ${detail}`}`);
    }
  } catch (e) { failed++; console.log(`FAIL ${e.message}`); }
  if (browser) await browser.close();
  site.close();
  console.log(failed ? `${failed} failed` : 'smoke test passed');
  process.exit(failed ? 1 : 0);
}
