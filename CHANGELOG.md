# Changelog

Every version of ffxi-timer and what changed in it, newest first. Dates are the day I released each one.

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
