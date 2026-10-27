# ffxi-timer v1.0.2

A Vana'diel clock and schedule board for Final Fantasy XI: the time, the moon, every airship and ferry, guild and shop hours, RSE, weather and where to find it, a planner for lining conditions up, and alarms. It follows in the footsteps of Pyogenes' [FFXI Time Information](https://www.pyogenes.com/ffxi/timer/v2.html) page, rebuilt with current schedule data.

**Use it: [radmagelabs.com/ffxi](https://radmagelabs.com/ffxi/)** (also at [radmageirl.github.io/ffxi-timer](https://radmageirl.github.io/ffxi-timer/))

![ffxi-timer in the Vana'diel theme: the clock on Earthsday 10:50 with a 74% waning moon, and the airship board with Jeuno to Kazham and Windurst to Jeuno boarding](screenshots/ffxi-timer-vana.png)

It is a plain HTML page with no build step and no server. Everything is worked out in the browser from the Earth clock. Nothing is sent anywhere except alarm posts to a Discord webhook if you set one, and the only thing fetched is the news bar's headlines, from the same site, while the bar is open. Settings, starred routes and alarms stay in that browser's local storage.

## What it shows

**Latest news**
- A bar at the top, closed until you open it, with the newest headlines from the official FINAL FANTASY XI site: Topics (updates, events and campaigns) and Notices and maintenance
- Each headline has its date and links to the official page; the site checks for new ones every hour

**Vana'diel now**
- The time and C.E. date, the weekday's day bonus and day penalty elements, daytime or nighttime, and a countdown to the next day
- The moon's percent and phase, drawn, with the next phase change and when the next full and new moons begin
- JP midnight, the weekly conquest tally (Monday 00:00 JST), and this week's RSE race and dungeon

**Ships and airships**
- All 8 airships (Kazham included), the Selbina, Mhaura, Aht Urhgan Whitegate and Nashmau ferries, the Manaclipper and the Phanauet barge
- Boarding status, the departure in Vana'diel and local time with a countdown, and when you land
- Star the routes you use to keep them on their own tab and in the mini clock

**Trips**
- Pick two ports and it lists the next five trips between them by boat and airship, changing where one lands and the next leaves: Port Bastok to Kazham changes airships in Port Jeuno, and Selbina to Nashmau takes three ferries
- Each leg's departure, where to change and how long the wait is, when you land, and how long it all takes, with a setting for how long you need to walk between docks
- Walking between towns and teleports aren't counted, so To only lists ports a boat or airship can reach

**Guilds and shops**
- 22 guild shops, including the ones in Mhaura, Selbina, Al Zahbi, Whitegate, Bibiki Bay and Carpenters' Landing, plus the Tenshodo, linkshell, chip and ferry fishing merchants that keep hours
- Each NPC's name and hours, open or closed right now, and the next open stretch in your local time
- Retail dropped guild holidays in June 2014, and LandSandBoat servers keep them only when the server turns them on, so guilds are open every day unless you press **Guild holidays**; then each one closes all day on its weekly holiday

**Weather**
- A forecast for 218 zones: for each Vana'diel day, the usual, common and rare weather, with double weather in bold
- The forecast uses a 2,160-day weather table for each zone, and the game switches among a day's three weathers, so this is a forecast of odds, not a promise
- Outside cities, LandSandBoat servers turn Clear, Sunshine and Clouds into Fog from 02:00 to 07:00; the forecast says so for each zone it applies to
- Press **Star zone** in the Weather panel to keep a zone's weather for today and tomorrow at the top of the page, in the converter and in the mini clock

**Weather finder**
- Click any weather anywhere on the page, or pick several, to see which zones are most likely to have it and when
- Soonest chances first: zones where it is always on (the cloisters, Dynamis, Temenos), then days where it is the usual weather, then common, then rare, with runs of days merged
- Where it is most common: zones ranked by how much of the 2,160-day cycle they are likely to have it, with each zone a link to its forecast

**Calendars and RSE**
- Day, moon and RSE calendars, filterable by weekday, phase or race
- RSE details for any week: the chest key to trade, every monster that drops it, your race's set pieces, and the ??? that pops the sachet NM
- **Add to calendar** downloads the listed days, moon phases or RSE weeks as an .ics file for Google Calendar, Outlook or Apple Calendar, each with a reminder

**Converter**
- One moment in Earth and Vana'diel time: change either side and the other follows
- Shows that moment's weekday, moon and your starred zones' weather, and how long until or since it

**Planner**
- Pick weekdays, an hour range, moon phases or a moon percent, and a zone's weather; it lists when they next line up in Earth time
- Weekdays, the moon and weather all repeat within 15,120 Vana'diel days and the planner searches all of them, so "never" means never
- **Save** keeps a search beside the presets, and each saved search can have its own alarm
- **Add to calendar** downloads the next eight windows as an .ics file
- **Copy link** shares a planner search, a zone's forecast or a weather finder search as a URL

**Elemental magic**
- Pick an element and a zone to see what the day and weather do to that element's magic today and for the next 16 days, and when the element's day and its double weather next line up for +35%
- The element's weather adds 10%, or 25% if it is double weather, and its day adds 10%; the opposing element's weather and day take the same off, and the total stops at +40%. Without an obi this happens on about a third of casts; the element's obi makes every cast get the bonuses, and Hachirin-no-Obi makes every cast get the bonuses and the penalties

**Timers**
- Start a timer when you do something you can only do again later: Dynamis, an ENM key item, an Assault ID tag, the Hunt Registry, a Fields or Grounds of Valor page, an ISNM order, an ACP, AMK or ASA key, Garrison, the conquest EXP ring, a weekly quest, or a custom number of hours
- Each shows when it is ready and can have an alarm; its start time can be edited, × removes it, and **Clear all** removes them all
- With Retail or LSB picked, Dynamis opens after the next JP midnight; with HorizonXI picked it waits for the conquest tally, since HorizonXI allows two entries a week, and the Fields and Grounds of Valor, Hunt Registry and ACP, AMK and ASA key timers aren't offered. The other waits are LandSandBoat's defaults; for a server with other waits, use Custom

**Fishing**
- Pick any of the 100 fish you can catch on a LandSandBoat server to see its skill level, size, rarity and key item, and the baits and lures that hook it, strongest first. The fish, spots, bait strengths, rarity and harder zones come from LandSandBoat's fishing tables
- Every spot where it bites, soonest first: the next best fishing moon (Waxing Gibbous and Full Moon) together with rain or a squall in that zone, or the best moon alone where it never rains
- **Plan** opens that search in the planner, where it can have an alarm
- You hook fish most often from Waxing Gibbous through Full Moon and least at New Moon and Waning Crescent; rain helps a little and a squall a little more; bites come sooner at New Moon and Full Moon, and at 05:00 and 17:00

**Notorious monsters**
- 41 NMs that can only appear at certain hours, under a certain moon or in certain weather, such as Haty (Full Moon, 17:00 to 05:00), King Vinegarroon (Dust Storm or Sand Storm) and the Gusgen Mines ghosts (00:00 to 06:00)
- What each one needs, how it pops (a lottery off its placeholder, a timer, a ??? or a weather change), and when its conditions next line up, soonest first
- A weather condition is a day that weather can come up, with how likely it is; the game moves among a day's three weathers, so it may not
- A bell on each NM sets an alarm for when it can next appear
- Point at, tap or focus an NM's name for its card: its level, the monster it rolls off if it has one, where BG Wiki places it on the map (linked to the page version I checked), what it needs, how it pops, and its drops. Drop rates are LandSandBoat's base rates; Treasure Hunter raises them, and retail and HorizonXI can differ
- **Killed** marks an NM's time of death; its next chance then waits for its respawn timer or lockout. The time can be edited, × clears it, and **Clear kill times** clears them all

**Alarms**
- A bell on any departure, shop opening, reset, moon phase or planner window
- A toast, a chime and a browser notification, plus an optional post to a Discord channel through a webhook, switchable per alarm
- With several tabs open, they all show the same alarms and settings, and one tab delivers each alarm: the one you last clicked or typed in. When that tab closes, another open tab takes over
- A **Mini clock** that stays on top of the game window (Chrome and Edge) and shows your starred routes and zones

**Server rules**
- The **Retail**, **HorizonXI** and **LSB** pill next to Full and Simple picks whose rules apply where they are known to differ: guild holidays (retail has none; on the other two **Guild holidays** turns them on), the Dynamis wait, which timers are offered, and the Hachirin-no-Obi note. It is Retail unless you pick another, and every open tab follows it
- The clock, the moon, ships, guild hours, weather and RSE are the same on all three. The NM conditions, levels and drops and the fishing rules are LandSandBoat's whichever you pick, and with Retail or HorizonXI picked those panels say so

**Simple view**
- The **Simple** pill in the toolbar keeps the clock, moon and resets, and puts every departure in the order they leave, the 22 guilds and the next eight days with your starred zones' weather on one screen
- It is remembered in that browser; `?simple` at the end of the address opens it directly

**Themes**: system, light, dark and Vana'diel (the game's blue menu windows) on the **Theme** button. Text in every theme has at least WCAG AA contrast.

## Accuracy

Every time on the page is worked out from your device's clock, so keep it set to update automatically. One Earth second is 25 Vana'diel seconds: a clock two minutes off puts every Vana'diel time 50 minutes off.

The time math matches the LandSandBoat server: its epoch (886-01-01 00:00 is 2001-12-31 15:00 UTC), its moon cycle and its RSE rotation. The tests check them against Pyogenes' own reference dates, BG Wiki's moon table and the in-game ferry timekeeper schedules.

Departure times are when the boarding door shuts, from the retail packet captures LandSandBoat records for each run. They sit a few Vana'diel minutes after the round numbers older timers list: the Jeuno to San d'Oria airship leaves at 01:14, not 01:10.

Fixed compared with the old timer:

- 38% waxing is a Waxing Crescent everywhere; the old page's moon display calls that day a First Quarter while its day calendar calls it a Waxing Crescent
- The old page rebuilds every panel's HTML 20 times a second, and lists flickering in Mozilla as a known issue; this one rewrites only the text that changed
- The Aht Urhgan ferries, the Manaclipper, the barge, the outlying guild shops, weather and the weather finder are all new

## Changes

What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## Feedback

To report a problem or suggest something, open an issue on [GitHub Issues](https://github.com/RadMageIRL/ffxi-timer/issues). If you'd like to support future projects, you can [buy me a coffee](https://buymeacoffee.com/radmageirl).

## Run it locally

Download or clone this repository and open `index.html` in a modern browser. There is no install step.

Opened straight from the file, the page works the same, except that with several tabs open their saves don't take turns, each alarm is delivered by whichever tab gets to it first, and the news bar links to the official site instead of showing headlines, since a page opened from disk can't read the file next to it. Served from any local web server, it behaves as the published site does.

It needs Chrome or Edge 86, Firefox 98 or Safari 15.4, or newer. In browsers older than Chrome 111, Firefox 113 and Safari 16.2 it still works, but some highlights and borders don't show. I tested v1.0 in Chrome, Edge, Firefox and WebKit (the engine Safari uses) on Windows; it hasn't been tried in Safari itself or on a phone.

Alarms and Discord posts only fire while the page is open. The mini clock uses Document Picture-in-Picture where the browser has it and a small popup window everywhere else.

## Shortcuts

| Key | Action |
| --- | --- |
| `S` | Switch between the simple and full view |
| `T` | Cycle the theme |
| `M` | Open the mini clock |
| `?` | About |

## Tests

```
node tests/run.mjs
node tests/smoke.mjs
```

No dependencies. The tests cover the clock, moon, RSE, resets, every ship schedule, shop hours, weather, the weather finder, morning fog, trips, fishing, NM conditions, elemental magic, timers, the planner, the converter, calendar files, saved data, and the counts the About dialog states, and that the version and every file the page loads match.

`tests/smoke.mjs` opens the page in headless Chrome over its DevTools protocol (`CHROME=<path>` picks the browser) with empty storage, after a reload, and with saved data from v0.8. It checks that every file loads, nothing comes from another site, nothing logs an error, and the main controls work. GitHub Actions runs both on every push and pull request (`.github/workflows/test.yml`).

`store.js` checks saved settings and alarms before the page uses them. Anything it can't use is repaired or reset on its own, and from a list only the bad entries go. The tests run it on damaged data of many kinds and on `tests/fixtures/v0.8-storage.json`, saved data from v0.8, which has to come back unchanged.

`news.json` holds the newest headlines from the official site's Topics and Information feeds. `tools/fetch-news.mjs` writes it, and the News workflow (`.github/workflows/news.yml`) runs it every hour and commits the file only when the headlines changed; a feed that can't be read keeps its last headlines. `news.js` reads the feeds for it and checks the file again in the page: only titles, dates and links, as plain text, and only https links to Square Enix's sites.

`weather-data.js` is generated by `tools/build-weather.mjs` from LandSandBoat's `sql/zone_weather.sql`, `data/enums/zone.yaml` and the `data/zones` folder (for which zones are cities); the script checks every zone and day against its source before it writes.

`fishing-data.js` is generated by `tools/build-fishing.mjs` from LandSandBoat's fishing tables in `sql/` and the zone and key item names in `data/enums/`; it keeps only fish the server can hook, and checks its output against the tables.

`nm-data.js` lists each NM's conditions and cites the LandSandBoat lines they come from. `nm-cards.js` is generated by `tools/build-nm-cards.mjs` from LandSandBoat's `mobs.yaml` files (levels, placeholders and drops, with `data/enums/drop_rate.yaml` for the rates) and two files of BG Wiki citations: `tools/nm-maps.json` (map grids, each with the page and revision I checked it against) and `tools/item-names.json` (drop names). Neither file copies those lines: each citation is a file, a line number and a fingerprint of the line at a pinned LandSandBoat commit (`tools/lsb-lines.mjs`), and `node tools/check-nms.mjs <server checkout>` checks that every cited line is still there.

The LandSandBoat files these three are built from are in `third_party/landsandboat/`, with the commit they come from in its `COMMIT` file. The tools rebuild the shipped files from them byte for byte:

```
node tools/build-weather.mjs third_party/landsandboat/sql/zone_weather.sql third_party/landsandboat/data/enums/zone.yaml third_party/landsandboat/data/zones
node tools/build-fishing.mjs third_party/landsandboat/sql third_party/landsandboat/data/enums
node tools/build-nm-cards.mjs third_party/landsandboat
```

## Data

Ship schedules, shop hours, chest key drops, the RSE quest steps, the weather cycles, the fishing tables, and the NM conditions, levels, placeholders and drops come from [LandSandBoat](https://github.com/LandSandBoat/server)'s data and scripts, at commit `ed34371`. The NM map grids and drop names were checked on BG Wiki; only those facts and the page revisions checked are kept. The code here is my own.

The news bar's headlines come from the official FINAL FANTASY XI site (playonline.com). Only each title, date and link is kept, and every headline links to its page there.

FINAL FANTASY is a registered trademark of Square Enix. This project is not affiliated with Square Enix.

## License

My own code is under the MIT License ([`LICENSE`](LICENSE)): the page (`index.html` and `style.css`), its scripts (`app.js`, `vana.js`, `store.js` and `news.js`), the build tools and their records in `tools/`, and the tests.

Four data files are derived from LandSandBoat, which is licensed under the GNU General Public License version 3, and are licensed under GPL-3.0 as well ([`COPYING`](COPYING)): `weather-data.js`, `fishing-data.js` and `nm-cards.js`, which the build tools generate, and `nm-data.js`, which I wrote from LandSandBoat's scripts and data. Each says so at the top. `third_party/landsandboat/` holds the LandSandBoat files they are built from, under LandSandBoat's own license.

The page loads those data files, so the site as a whole is offered under the terms of GPL-3.0. Each MIT file can still be used under MIT on its own.

`news.json` holds headlines from Square Enix's official site; they are Square Enix's, not mine, and neither license covers them.
