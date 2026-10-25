// Headlines from the official FINAL FANTASY XI site (playonline.com). Its feeds can't be read from a
// page on another site, so the News workflow runs tools/fetch-news.mjs every hour and saves the newest
// headlines as news.json next to the page; the page reads that file when the news bar is opened. Only
// titles, dates and links are kept, always as plain text, and only links to Square Enix's own sites.
// Pure functions, shared by the page, the fetcher and the Node tests like vana.js.
(function (root) {
  'use strict';

  const FEEDS = [
    { key: 'topics', url: 'https://www.playonline.com/pcd2/topics/ff11us/topics.xml', title: 'Topics' },
    { key: 'information', url: 'https://www.playonline.com/ff11us/polnews/news.xml', title: 'Notices and maintenance' },
  ];
  const SITE = 'https://www.playonline.com/ff11us/index.shtml';
  const PER_FEED = 6;
  const TITLE_MAX = 200;
  // Square Enix's hosts: the official site, its link shortener (which points at the forum) and the forum.
  const HOSTS = ['www.playonline.com', 'playonline.com', 'sqex.to', 'forum.square-enix.com'];

  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };
  // Dashes become plain hyphens; control characters are dropped.
  function safeChar(code) {
    if (code === 0x2013 || code === 0x2014 || code === 0x2015) return '-';
    if (code < 0x20 || (code >= 0x7f && code < 0xa0) || code > 0x10ffff) return '';
    return String.fromCodePoint(code);
  }
  function decode(s) {
    return s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
      .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
  }
  // Titles are text: decoded, any markup removed, dashes plain, whitespace collapsed.
  const text = (s) => decode(decode(String(s)).replace(/<[^>]*>/g, ''))
    .replace(/\p{Pd}/gu, '-').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  const tag = (block, name) => {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
    return m ? m[1] : '';
  };

  /** An https link to one of Square Enix's hosts, without a fragment, or null for anything else. */
  function cleanLink(raw) {
    let u;
    try { u = new URL(text(raw)); } catch (e) { return null; }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !HOSTS.includes(u.hostname) || u.port || u.username || u.password) return null;
    return `https://${u.hostname}${u.pathname}${u.search}`;
  }

  // The feeds date their items like "Fri, 23 Oct 2026 17:00:00 JST", a zone name Date.parse doesn't
  // know, so it is written as its offset first. Returns an ISO time, or null.
  function cleanDate(raw) {
    const ms = Date.parse(text(raw).replace(/\s+JST$/i, ' +0900'));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  /** The newest items of an RSS feed: [{ title, link, date }], newest first. */
  function parseFeed(xml, max = PER_FEED) {
    const items = [], seen = new Set();
    for (const m of String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
      const block = m[1];
      const title = text(tag(block, 'title')).slice(0, TITLE_MAX), link = cleanLink(tag(block, 'link'));
      if (!title || !link || seen.has(link)) continue;
      seen.add(link);
      items.push({ title, link, date: cleanDate(tag(block, 'dc:date') || tag(block, 'pubDate')) });
    }
    items.sort((a, b) => (b.date ? Date.parse(b.date) : -Infinity) - (a.date ? Date.parse(a.date) : -Infinity));
    return items.slice(0, max);
  }

  /**
   * news.json as the page uses it: each feed's list with only the items that still look like what
   * parseFeed makes, or null when no feed has any. A feed missing from the file comes back as [].
   */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    for (const f of FEEDS) {
      const list = Array.isArray(raw[f.key]) ? raw[f.key] : [];
      out[f.key] = list
        .filter((i) => i && typeof i.title === 'string' && typeof i.link === 'string' && cleanLink(i.link) === i.link && text(i.title))
        .slice(0, PER_FEED)
        .map((i) => ({ title: text(i.title).slice(0, TITLE_MAX), link: i.link, date: typeof i.date === 'string' ? cleanDate(i.date) : null }));
    }
    return FEEDS.some((f) => out[f.key].length) ? out : null;
  }

  const News = { FEEDS, SITE, PER_FEED, HOSTS, cleanLink, cleanDate, parseFeed, sanitize };
  if (typeof module === 'object' && module.exports) module.exports = News;
  else root.VanaNews = News;
})(typeof globalThis !== 'undefined' ? globalThis : this);
