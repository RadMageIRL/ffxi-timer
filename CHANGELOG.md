# Changelog

Every version of ffxi-timer and what changed in it, newest first. Dates are the day I released each one.

## v1.0 (2026-10-23)

Added
- Section links under the header. Ships, trips, guilds, weather, weather finder, magic, calendars, converter, planner, fishing, NMs, timers and alarms each jump to their panel. In the Simple view, ships and guilds go to its own departures and guilds; the others open the full view first.
- Open tabs share their settings. Starred routes and zones, NM kill times, timers, saved searches, alarms, 12/24h, sound, guild holidays, the alarm warning, the walk between docks and the Discord webhook change in every open tab as soon as one changes them, without a reload. What each tab is looking at (the zone, the tab picked, the planner search being built) stays its own.
- A server pill next to Full and Simple: Retail, HorizonXI or LSB (another LandSandBoat server). It is Retail unless you pick another, it is remembered, and every open tab follows it. It changes what is confirmed to differ between them:
  - Retail has no guild holidays, so the Guild holidays switch only shows for the other two, where it stays off until you turn it on.
  - On HorizonXI the Dynamis timer waits for the conquest tally, since HorizonXI allows two entries a week, and the Fields and Grounds of Valor, Hunt Registry and ACP, AMK and ASA key timers aren't offered.
  - Hachirin-no-Obi isn't named in the Elemental magic panel on HorizonXI.
  - With Retail or HorizonXI picked, the NM and Fishing panels say their conditions, levels, drops and fishing rules are LandSandBoat's, and that the server differs.
- A card for each NM. Point at, tap or focus an NM's name to see its level, the monster it rolls off if it has one, where BG Wiki places it on the map with a link to the page version checked, what it needs, how it pops, and its drops at LandSandBoat's base rates. Grids BG Wiki hedges are left out, and a quest NM's card places the ??? that pops it.
- `nm-cards.js`, built by `tools/build-nm-cards.mjs` from LandSandBoat's mob data and the BG Wiki citations in `tools/nm-maps.json` and `tools/item-names.json`. `tools/check-nms.mjs` checks the cards' LandSandBoat lines too.
- With several tabs open, one of them delivers each alarm, so it shows, chimes, notifies and posts to Discord once. The tab you last clicked or typed in delivers them, the others say so in their alarm panel, and when that tab closes another open tab takes over.
- A browser smoke test, `tests/smoke.mjs`, and a GitHub Actions workflow that runs it and the unit tests on every push and pull request.
- `COPYING`, the GNU GPL version 3. The four data files that come from LandSandBoat (`weather-data.js`, `fishing-data.js`, `nm-cards.js` and `nm-data.js`) now say at the top that they are derived from LandSandBoat and licensed under GPL-3.0, and when I modified them.
- `third_party/landsandboat/`: the 255 LandSandBoat files the data files are built from, at commit `ed34371`, with LandSandBoat's license and a `COMMIT` file naming the commit. The build tools rebuild the shipped files from them byte for byte, and `tools/build-nm-cards.mjs` reads the commit from `COMMIT` when the folder isn't a git checkout.

Changed
- The weather forecast shows 8 days unless you pick more. It was 16.
- Guilds and shops are open every day unless **Guild holidays** is on. Retail dropped guild holidays in the June 2014 version update, and LandSandBoat servers close guilds on their holidays only when the server turns that on. With it on, each one closes all day on its holiday as before, and the Holiday column shows.
- Discord posts no longer ping anyone. An @everyone, @here, role or user mention in a timer note posts as plain text.
- A custom timer takes from 0.1 to 8,760 hours (a year).
- The weather panel says the forecast uses a 2,160-day weather table for each zone.
- The About dialog and the README say the times come from your device's clock.
- All text in the light and Vana'diel themes now has at least WCAG AA contrast (4.5:1), as the dark theme had.
  - Light theme: the element, gold, green, red, gray and accent colors are a shade darker.
  - Vana'diel theme: the gray text and the fire, water, dark and red colors are a shade lighter, and the highlight on rows that are happening now is fainter.
  - Vana'diel theme: each window's bright top band ends within 160px, so a tall panel's rows sit on the darker blue. A picked element chip sits in the same dark well as the text boxes.
- Bells, stars, weather chips, zone names, the section links, the RSE details link and a saved search's × are at least 24px tall and wide.
- On phones the toolbar fits on two rows from 375px wide (three at 320px), so the header is about 50px shorter (30px at 320px).
- The keyboard focus ring is 2px wide. In the Full and Simple pill and the server pill it is drawn inside the button, where it used to be cut off. A control focused at the edge of a table that scrolls sideways is scrolled fully into view.
- Weathers not picked in the weather finder show without their tint instead of faded, so their names stay readable.
- Tab from an NM's name with its card open goes into the card, to its BG Wiki link and weather chips. Tab past the card's last control goes on along the row, and Shift+Tab goes back to the name.
- A tab back from being frozen, from the back-forward cache or from the background reads the shared settings, alarms and theme again, so it shows other tabs' changes before anything is edited in it. It only reads, and an idle tab still reads nothing.
- The NM panel says its lottery chances, timers, levels and drop rates are LandSandBoat's. The Fishing panel says its fish, spots, bait strengths, rarity and harder zones come from LandSandBoat's fishing tables, and a bait's tooltip calls its strength LandSandBoat's.
- `nm-data.js` and `nm-cards.js` no longer quote LandSandBoat's lines. Each citation gives the file, the line and a fingerprint of the line at a pinned LandSandBoat commit, and `tools/check-nms.mjs` compares the fingerprints with a checkout (`tools/lsb-lines.mjs`).
- The fishing moon is worked out from a table of my own, with the same result for every percent and direction. `tools/build-fishing.mjs` describes the columns it reads in its own words, and builds the same `fishing-data.js`.
- Every script and the stylesheet carry the version in their address (`?v=1.0`), so after a release a browser fetches the new files instead of pairing the new page with scripts it had cached.
- The About dialog lists every Copy link, the section links, the 12 or 24 hour clock, the themes and how several tabs share alarms, and says the planner takes weather too.
- The README says which browsers the page needs and where v1.0 was tested, and which LandSandBoat commit the data comes from.
- A `.gitattributes` keeps every text file's line endings LF.
- The README's License section says which files are mine under MIT and which are derived from LandSandBoat under GPL-3.0, and that the site as a whole is offered under GPL-3.0. Each MIT file can still be used under MIT on its own.
- The README screenshot shows v1.0.

Fixed
- Two open tabs no longer overwrite each other's changes. Before, a change in one tab could undo a timer or setting saved in the other.
- One alarm open in two tabs no longer fires twice, and an alarm turned off or removed in one tab no longer fires from another.
- Saved settings, timers and alarms are checked when the page loads. A damaged or unexpected value is repaired or put back to its default on its own, and a list keeps every entry it can use, so one bad timer or alarm no longer costs the rest. Before, ten kinds of damaged data left the page blank on every load. When something is repaired, a note says what, the repaired copy is saved, and the data as it was stays in the browser's storage under the same name with `_backup` after it.
- A panel that fails no longer stops the clock, the alarms or the other panels.
- A kill time or timer start outside 2000 to 2200 is marked invalid instead of saved.
- After picking a fish or a zone, clicking the box again or pressing Down showed only that name. It now empties the box and shows the whole list, as the first click does.
- A custom timer of billions of hours made the Timers and Alarms panels stop updating, even after a reload.
- The About dialog said nothing leaves the browser. It now says alarm posts go to a Discord webhook if you set one, as the README did.
- In a 320px window with a scrollbar, the page scrolled sideways by 10px.
- Escape inside an NM card closed it and opened it again at once.
- The converter's Earth date and time box showed no focus ring.
- A Vana'diel year far out of range in the converter, such as 99,999,999, made it fail every second until it was changed. Both sides of the converter now take moments from 2000 to 2200 and mark anything else invalid, as the page's other date boxes do.
- Jugner Forest [S] showed Vunkerl Inlet [S]'s weather. In retail it has the same weather as La Vaule [S], and it now shows that.

## v0.8 (2026-10-22)

Added
- Kill times for NMs. **Killed** on an NM with a timer records its time of death, and its next chance then waits for its respawn timer or lockout before its conditions count. The time can be edited, × clears it, and **Clear kill times** clears them all. NM alarms follow the timer too.
- An Elemental magic panel. Pick an element and a zone to see what the day and the weather do to that element's magic today and for the next 16 days, with each weather's effect, and when the element's day and its double weather next line up for +35%. Where that can't happen, it shows the best the zone can do and when.
- A Timers panel for lockouts, with LandSandBoat's default waits: Dynamis, ENM key items, Assault ID tags, the Hunt Registry, Fields and Grounds of Valor pages, ISNM orders, ACP, AMK and ASA keys, Garrison, the conquest EXP ring, weekly quests, and custom timers in hours. Each can have an alarm; its start time can be edited, × removes one, and **Clear all** removes them all.

## v0.7 (2026-10-22)

Added
- A Notorious monsters panel with 41 NMs that can only appear at certain hours, under a certain moon or in certain weather. Each row shows what the NM needs, how it pops (a lottery off its placeholder, a timer, a ??? or a weather change) and when its conditions next line up, soonest first. Weather conditions show how likely that weather is that day.
- A bell on each NM, which sets an alarm for when it can next appear.
- `nm-data.js`, where every NM cites the LandSandBoat lines its conditions come from, and `tools/check-nms.mjs`, which checks those lines against a LandSandBoat checkout.
- Planner searches can now use several hour spans and exact weathers, which some NMs need (Silk Caterpillar's four one-hour chances a day, King Vinegarroon's Dust Storm or Sand Storm).

## v0.6 (2026-10-22)

Added
- A Fishing panel for the 100 fish a LandSandBoat server lets you hook. Picking a fish shows its skill level, size, rarity and any key item it needs, and the baits and lures that hook it, strongest first.
- Every spot where that fish bites, soonest first, with the next time the best fishing moon (Waxing Gibbous and Full Moon) comes together with rain or a squall in that zone. Where it never rains, the row shows the best moon alone. Zones that are cities, or that LandSandBoat makes harder, say so.
- The fishing moon now, when the best moon next starts, and the next 05:00 or 17:00.
- **Plan** on each spot, which opens that search in the planner, where it can have an alarm.
- **Copy link** for a fish.
- `tools/build-fishing.mjs`, which builds `fishing-data.js` from LandSandBoat's fishing tables.

Changed
- The zone name code moved from `tools/build-weather.mjs` to `tools/zone-names.mjs`, which both build tools use. `weather-data.js` comes out the same.

## v0.5 (2026-10-22)

Added
- Trips. Pick two ports and the page lists the next five trips between them by boat and airship, changing where one lands and the next leaves. Each trip shows every leg, where to change, how long the wait is, when you land and how long it all takes. A setting covers the walk between docks (1 minute unless you change it). Walking between towns and teleports aren't counted, so To only offers ports a boat or airship can reach.
- A bell on each trip, which sets an alarm on its first leg.
- A Simple view. The **Simple** pill in the toolbar keeps the clock, moon and resets cards, and shows every departure soonest first, the 22 guilds, and the next eight days with your starred zones' usual weather. The other panels hide. `S` switches between the views, and `?simple` at the end of the address opens it directly.
- This changelog, going back to v0.1.

Changed
- Links into a panel the Simple view hides (a weather chip, a starred zone's name, RSE details, a shared link) switch back to the full view first.

## v0.4 (2026-10-22)

Added
- Starred zones. **Star zone** in the Weather panel keeps a zone's weather for today and tomorrow at the top of the page, in the converter and in the mini clock.
- A converter between Earth and Vana'diel dates and times. Changing either side updates the other, and it shows that moment's weekday, moon and starred zones' weather.
- Saved planner searches. **Save** keeps a search beside the presets, and each saved search can have its own alarm. Before this there could be only one planner alarm.
- **Add to calendar**. The planner's next eight windows, or the days, moon phases or RSE weeks a calendar tab lists, download as an .ics file for Google Calendar, Outlook or Apple Calendar, each with a reminder at the default alarm warning.
- A Discord switch on each alarm once a webhook is saved. Alarms saved before v0.4 keep posting.
- A morning fog note. Outside cities, LandSandBoat servers turn Clear, Sunshine and Clouds into Fog from 02:00 to 07:00. The forecast and the weather finder now say so for the 188 zones it applies to.

Changed
- Clicking into a zone box empties it so the whole zone list shows. Leaving without picking a zone puts the old one back.
- The mini clock shows up to four lines: starred routes first, then starred zones.
- `tools/build-weather.mjs` takes LandSandBoat's `data/zones` folder as a third argument and records which zones are cities.

Fixed
- The bells built into the page (full moon, new moon, JP midnight, conquest tally, planner) show a saved alarm as soon as the page loads. Before, they looked off until something else was clicked.
- The page no longer scrolls sideways on phones. Hidden screen-reader labels in table headers sat outside their tables and widened the page by about 55px.

## v0.3 (2026-10-21)

Added
- A weather finder. Clicking any weather on the page, or picking several, lists where and when it is most likely: soonest chances first, then the zones where it is most common across the 2,160-day cycle.
- 29 zones whose weather never changes: 14 Dynamis areas, Apollyon, Temenos, Nyzul Isle, The Ashu Talif, Hazhalm Testing Grounds, both Walk of Echoes areas, Throne Room [S], Alzadaal Undersea Ruins and the six cloisters. The forecast covers 218 zones. I left out the 82 zones fixed on Sunshine, since many of them (Abyssea, for one) look like missing data.
- Zones that always share their weather are listed together in the finder.
- **Copy link** for a weather finder search.

Changed
- The README screenshot file no longer has a version in its name.

## v0.2 (2026-10-21)

Added
- A weather forecast for 189 zones: the usual, common and rare weather for each Vana'diel day from LandSandBoat's 2,160-day weather cycle, with double weather in bold.
- Weather as a planner condition: a zone, one or more elements, double weather only, and usual weather only or any chance.
- Hours for 10 more shops: the Tenshodo in Norg, Port Bastok and Nashmau, the linkshell and chip vendors, and the ferry fishing merchants. Every shop row names its NPCs and shows the next open stretch in local time.
- **Copy link** for a planner search or a zone's forecast.
- Discord alerts. Alarms can post to a channel through a webhook.
- The site on GitHub Pages at [radmageirl.github.io/ffxi-timer](https://radmageirl.github.io/ffxi-timer/), and a screenshot in the README.

Changed
- The planner searches 15,120 Vana'diel days, the span in which weekdays, the moon and weather all repeat, so "never line up" means never.

## v0.1 (2026-10-21)

First release.
- Vana'diel time and date, the weekday's day bonus and penalty elements, day or night, and a countdown to the next day.
- The moon's percent and phase, drawn, with the next phase change and the next full and new moons.
- JP midnight, the weekly conquest tally (Monday 00:00 JST), and this week's RSE race and dungeon.
- All 8 airships (Kazham included), the Selbina, Mhaura, Aht Urhgan Whitegate and Nashmau boats, the Manaclipper and the Phanauet barge, with boarding status, departure and landing times, and departures timed to when the door shuts, from LandSandBoat's retail captures.
- 22 guild shops with hours, holidays and open, closed or holiday status.
- Day, moon and RSE calendars, and RSE details for any week: the chest key, every monster that drops it, the set pieces and the sachet NM.
- A planner for weekdays, hour ranges and moon phases or percent, with presets.
- Alarms with a toast, a chime and a browser notification, and a mini clock that stays on top of the game window in Chrome and Edge.
- System, light, dark and Vana'diel themes.
- Tests against Pyogenes' reference dates, BG Wiki's moon table and the in-game ferry timekeeper schedules.
