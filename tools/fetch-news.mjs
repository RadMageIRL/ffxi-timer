// Saves the newest headlines from the official FINAL FANTASY XI site as news.json, for the news bar.
//
//   node tools/fetch-news.mjs [--from <dir>]
//
// It reads the site's two feeds, Topics and Information (see FEEDS in news.js), and keeps each one's
// newest titles, links and dates. The News workflow (.github/workflows/news.yml) runs it every hour and
// commits news.json only when the headlines changed, so the file holds no time of its own. A feed that
// can't be read or has no items keeps the headlines it had, so a bad hour never empties the bar; it is
// reported as a warning, not a failure. --from reads <dir>/<key>.xml instead of fetching, for testing.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const News = createRequire(import.meta.url)('../news.js');
const OUT = new URL('../news.json', import.meta.url);
const TIMEOUT_MS = 20000;
const at = process.argv.indexOf('--from'), fromDir = at > 0 ? process.argv[at + 1] : null;
const warn = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warning: ${msg}`);

async function read(feed) {
  if (fromDir) return readFileSync(join(fromDir, `${feed.key}.xml`), 'utf8');
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'ffxi-timer news (+https://github.com/RadMageIRL/ffxi-timer)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

let old = null;
try { old = existsSync(OUT) ? News.sanitize(JSON.parse(readFileSync(OUT, 'utf8'))) : null; } catch (e) { warn(`news.json could not be read, so it starts empty: ${e.message}`); }
const out = {};
for (const feed of News.FEEDS) {
  const kept = old ? old[feed.key] : [];
  try {
    const items = News.parseFeed(await read(feed));
    if (items.length) out[feed.key] = items;
    else { out[feed.key] = kept; warn(`${feed.title}: the feed had no items, so its ${kept.length} headlines were kept`); }
  } catch (e) {
    out[feed.key] = kept;
    warn(`${feed.title}: ${e.message}, so its ${kept.length} headlines were kept`);
  }
}
const text = `${JSON.stringify(out, null, 2)}\n`;
const before = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
if (text === before) console.log('news.json: no new headlines');
else { writeFileSync(OUT, text); console.log(`news.json: ${News.FEEDS.map((f) => `${out[f.key].length} ${f.title}`).join(', ')}`); }
