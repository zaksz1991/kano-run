# Kano Life — Daily Rhythm Director

Additive simulation module for in-game market-day activity, prayer-time traffic patterns, Friday Jumu’ah rhythm, and optional park prayer-break prompts.

## Integration contract
- Call `evaluate({ weekday, time, location, demand })` using the game's own simulation clock and weekday.
- Apply returned `effects` through existing traffic/passenger/pedestrian systems; do not let this module directly change world objects or money.
- Render `events` in the existing event/UI layer. `park_pause_opportunity` is a choice prompt, not an automatic pause.
- Configure prayer windows and market days against the game's chosen fictionalized calendar. Default windows are gameplay defaults, not live religious timetable data.
- `weekday`: Sunday=0 through Saturday=6. `time`: 24-hour `HH:MM`. `location`: e.g. `road` or `park`.

No device clock, network calls, wallet writes, or global state changes.
