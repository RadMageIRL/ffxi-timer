# ffxi-timer v0.1

A Vana'diel clock and schedule board for Final Fantasy XI, in the spirit of Pyogenes' [FFXI Time Information](https://www.pyogenes.com/ffxi/timer/v2.html) page, rebuilt with current schedule data, alarms and a planner.

It is a plain HTML page with no build step and no server. I open `index.html` in a browser and it works out everything from the Earth clock. Nothing is fetched and nothing leaves the browser; settings, starred routes and alarms stay in that browser's local storage.

## What it shows

- Vana'diel time and date, the weekday's day bonus and day penalty elements, daytime or nighttime, and a countdown to the next day
- Moon percent and phase with a drawn moon, the next phase change, and when the next full and new moons begin
- JP midnight, the weekly conquest tally (Monday 00:00 JST), and this week's RSE race and dungeon
- Every airship (including Kazham), the Selbina, Mhaura, Aht Urhgan Whitegate and Nashmau boats, the Manaclipper and the Phanauet barge: boarding status, the departure in Vana'diel and local time, a countdown, and the landing time
- 22 guild shops, including the Mhaura, Selbina, Al Zahbi, Whitegate, Bibiki Bay and Carpenters' Landing ones, with hours, holidays and open, closed or holiday status
- Day, moon and RSE calendars, filterable by weekday, phase or race
- RSE details for any week: the chest key to trade, every monster that drops it, your race's set pieces, and the ??? that pops the sachet NM
- A planner that finds when a weekday, an hour range and a moon phase or percent next line up, with presets
- Alarms on any departure, guild opening, reset, moon phase or planner window, with a toast, a chime and a browser notification
- A mini clock that stays on top of the game window (Chrome and Edge), showing starred routes
- System, light, dark and Vana'diel themes on the **Theme** button, following the system setting by default

## Accuracy

The time math matches the LandSandBoat server: its epoch (886-01-01 00:00 is 2001-12-31 15:00 UTC), its moon cycle and its RSE rotation. The tests check them against Pyogenes' own reference dates, BG Wiki's moon table and the in-game ferry timekeeper schedules.

Departure times are when the boarding door shuts, from the retail packet captures LandSandBoat records for each run. They sit a few Vana'diel minutes after the round numbers older timers list: the Jeuno to San d'Oria airship leaves at 01:14, not 01:10.

Fixed compared with the old timer:

- 38% waxing is a Waxing Crescent everywhere; the old page's moon display calls that day a First Quarter while its day calendar calls it a Waxing Crescent
- The old page rebuilds every panel's HTML 20 times a second, and lists flickering in Mozilla as a known issue; this one rewrites only the text that changed
- Schedules cover the Aht Urhgan boats, the Manaclipper, the barge and the outlying guild shops, which the old page predates

## Run it

Download or clone this repository, then open `index.html` in a modern browser. There is no install step.

Alarms only fire while the page is open. The mini clock uses Document Picture-in-Picture where the browser has it and a small popup window everywhere else.

## Shortcuts

| Key | Action |
| --- | --- |
| `T` | Cycle the theme |
| `M` | Open the mini clock |
| `?` | About |

## Tests

```
node tests/run.mjs
```

No dependencies. The tests cover the clock, moon, RSE, resets, every ship schedule, guild hours, the planner, and the counts the About dialog states.

## Data

Ship schedules, guild hours, chest key drops and the RSE quest steps come from [LandSandBoat](https://github.com/LandSandBoat/server)'s data and scripts. The code here is my own.

FINAL FANTASY is a registered trademark of Square Enix. This project is not affiliated with Square Enix.

## License

MIT. See [`LICENSE`](LICENSE).
