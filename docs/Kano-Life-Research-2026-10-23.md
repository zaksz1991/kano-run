# Kano Life — Life-Simulation Research Brief

**Prepared:** 23 October 2026  
**Scope:** Kano, Nigeria; Adaidaita Sahu operators; daily work and household life; seasonal context; local markets; game-simulation architecture; data and privacy requirements.

## Executive finding

The strongest life-simulation design is not a stack of disconnected meters. It is one linked day in which a driver's decisions move between transport work, household obligations, vehicle care, public-space conditions, relationships, and longer-term financial goals. Kano-specific sources support treating Adaidaita Sahu work as a livelihood embedded in an everyday urban environment, with strong social and identity dimensions—not only as an arcade driving challenge. Research on Kano markets also supports differentiated districts and time-dependent commercial pressure rather than repeating generic roadside scenery.

This brief separates documented source findings from proposed game mechanics. It does not claim live weather, current local prices, official prayer times, current road closures, or representative player-safety measurements.

## 1. What the research supports

### 1.1 Transport work should feel like a livelihood

An IFRA Nigeria field study describes the everyday lives, socio-economic backgrounds, ownership arrangements, and expectations of Adaidaita Sahu riders in Kano. Its qualitative method included group discussion, informal interviews while riders worked, in-depth interviews, and observation around places where riders gather. A separate Kano tricycle patronage/revenue study surveyed 653 respondents (399 riders and 254 passengers/users) during its study period. These sources justify modeling different work arrangements—owner-driver, hired vehicle, daily remittance, maintenance responsibility, and route/customer knowledge—as distinct game situations. Survey counts or demographic composition should not be treated as current 2026 population estimates.

**Design consequence:** introduce clear ownership contracts and daily settlement rules. A hired driver should see the remittance obligation separately from fuel, food, repairs, and take-home cash. Do not create separate wallets in feature modules; all confirmed payments must pass through the game's existing economy.

### 1.2 Kano's commercial geography should affect route choice

A 2025 paper in the *Zaria Journal of Liberal Arts* examines how urbanisation and growth in Kano generated more specialised markets. It identifies historic Kurmi Market and the Sabon Gari and Kantin Kwari markets as established commercial nodes that became congested as the metropolis grew. That supports route-specific differences in loading pressure, pedestrian density, short trips, waiting time, delivery/haul opportunities, and traffic disruption. It does not imply those districts always have the same density or that every local road is congested.

**Design consequence:** build a small route graph of named districts and landmarks rather than a single endless interchangeable road. Market types can tune passenger demand, trip distance, delivery fares, curbside obstruction, and walkable foot traffic. A zone must own its own environmental state; environmental decoration should not move in lockstep with the player's keke unless it is actually a road-relative prop.

### 1.3 Vehicle identity and social context are part of Kano's visual language

IFRA's ethnographic report on Adaidaita Sahu decoration documents tricycle decoration as a form of creativity and social identity. The game's keke fleet should therefore support tasteful custom paint, inscriptions, accessories, operator preference, and local variation, while avoiding a single stereotyped look for all drivers. Vehicle decoration can be an earned identity system and optional cosmetic content; it should not be presented as a factual statement about any named person or group.

**Design consequence:** use the current vehicle model as the canonical player keke, fit driver seating to measured model bounds, and keep cosmetics separate from collision geometry and paid-gameplay balance.

### 1.4 Climate and heat should change planning—not become a medical simulator

Kano has a dry/hot season and a rainy period, with dust/harmattan conditions also relevant to road visibility. The 2025 Kano State Climate Change Policy and NiMet's 2026 Seasonal Climate Prediction are appropriate sources for a future data-backed calendar. NiMet publishes state-relevant seasonal outlooks with rainfall onset/cessation, temperature, dry spells, and other climate variables; future game releases should ingest current official outlooks rather than assume every year's weather follows a fixed script.

Outdoor drivers are exposed to heat while doing physical/manual work. WHO/WMO and occupational-safety guidance recommends planning hydration, cool rest/shade, and work/rest adjustments as conditions warrant. This supports gentle fictional mechanics such as choosing a shaded break, carrying water, or shifting a work window. It does **not** support presenting an arbitrary in-game percentage as a real health score or giving medical advice to players.

**Design consequence:** Step 71 uses a transparent, approximate 365-day calendar. Its risk values are game-design indices from 0 to 1, not measured temperature, weather probability, clinical risk, or official forecasts. Automatic seasonal visual changes and the sampled rainy-road hazard are opt-in. The next step should let operators play with automatic seasons off and manual atmosphere control unchanged.

### 1.5 Household economics should use dated assumptions

Nigeria's National Bureau of Statistics publishes monthly Consumer Price Index data and a separate PMS/petrol price-watch series. This makes it inappropriate to hard-code a supposedly current food, fuel, repair, or rent price indefinitely. Historical fuel-price releases can demonstrate change, but they are not a live quote. Any future data import must store source, observation period, geography, collection date, unit, and confidence; gameplay prices should be labelled as simulation values until verified.

**Design consequence:** a future price configuration could have `effectiveFrom`, `sourceUrl`, `reportedAt`, `geography`, `unit`, and `isSimulationEstimate`. If no fresh data is available, fall back to authored fictional balance values and visibly mark them “game estimate”; never quietly convert an old national average into a current Kano price.

### 1.6 Stable simulation needs deterministic time and explicit data ownership

Fixed-timestep simulation is a standard way to prevent simulation behaviour from depending directly on render frame rate. The current Kano Life stack has many independent upgrade modules, so long-term work needs one authoritative owner for clock/day, wallet, fuel, vehicle condition, and durable progression. A module may publish an advisory forecast or UI view, but it should not introduce a second wallet or silently overwrite core game state. Reproducible seeded randomness and scenario logs will make traffic, weather, and economy tuning comparable across builds.

## 2. How Step 71 applies this evidence

Step 71 adds a **Seasonal Living · Work Resilience** panel attached to the existing career/life panel, plus an early-loaded adapter for the existing game and weather/atmosphere classes.

- **Seasonal calendar:** approximate 365-day season bands, visible labels, and a clear non-live-forecast warning.
- **Work/vehicle planning:** tyre and brake checks, visibility checks, wet-route planning, and a safer work-window plan.
- **Heat/household planning:** water and shade breaks plus household water/power contingency planning.
- **Budget planning:** a planning action only; it does not debit the wallet or claim that a transaction occurred.
- **Calendar-to-world adapter:** off by default. When enabled, the existing `KanoAtmosphere` season setting follows the simulated date; a sampled fraction of otherwise-clear zone generations can use the game's existing `rainPuddles` hazard path. The original environment value is restored immediately after zone generation.
- **Existing application preservation:** the page retains the current startup modules, base canvas/HUD, and PWA links. Step 69 and Step 70 relationship/family modules are included and registered in the merged page because their previous delivery archives carried separate entrypoint edits.
- **Local export:** the user can export the seasonal plan. Export contains readiness categories and action history, not partner names, medical data, addresses, or external account information.

### Deliberate boundaries

This milestone does not fetch weather, call third-party APIs, buy food/fuel, deduct money, create health diagnoses, or make claims about a person's relationship. It does not claim to represent every household in Kano. Its planning scores can only affect the new planning display until separately reviewed gameplay hooks are tested. The seasonal road effect uses the existing game hazard generator, not a parallel traffic or physics system.

## 3. Simulation pacing proposal for future playtests

The seasonal model is intentionally daily, with no leap day. The suggested test route is a 7–10 minute shift and a 12-minute full in-game day if that matches the existing game clock; the exact pacing should be measured against the current build before being standardised. A good first balance pass should compare:

1. dry morning / busy market;
2. hot midday with an optional shade stop;
3. rainy market-road route with a pothole hazard;
4. harmattan visibility scenario;
5. evening return trip and settlement.

Record median fare per trip, time spent waiting, successful drop-off rate, fuel cost, repair expense, interruption count, player-reported clarity, and frame time. Use the same saved seed and route on each pass. Do not tune only for maximum income; each choice should have a readable trade-off, including the option to finish a shift early.

All rates should live in a named configuration block with a version and comments. Do not embed economy values in UI text or use render-frame count as in-game time.

## 4. Advanced application roadmap

### P0 — correctness and single source of truth

- Keep the existing game wallet/fuel/condition authoritative.
- Ensure simulation-day advancement comes from the existing persistent daily schedule, not a second date counter.
- Use deterministic seeded scenarios for tests; log the seed and scenario ID.
- Add event contracts for `seasonChanged`, `shiftStarted`, `shiftSettled`, `routeHazard`, and `householdPlanRecorded`.
- Validate save input and use a versioned, migrated schema for new persistent fields.
- Test both Canvas 2D and WebGL 3D. If WebGL is unavailable, the new planning panel must still work without crashing the game.

### P1 — data-backed environment and local economy

- Import annual NiMet Seasonal Climate Prediction summaries only after verifying the publication year and relevant Kano location.
- Add a curated landmark/market dataset with route IDs, hours/event windows, and source notes.
- Add a dated, geography-tagged petrol/food/repair price configuration from official or trusted sources; show update age and label estimates.
- Simulate market-day traffic and pedestrian density within actor caps; do not just duplicate sprites or move the whole background.
- Make rainfall/hazards deterministic per world seed and sample density by route and season.

### P2 — fuller household life

- Link morning routines and shift start/end to the existing day schedule.
- Add household responsibilities and optional family events with explicit player choice and age-appropriate writing.
- Treat engagement/marriage/parenthood as culturally specific, player-directed narrative—not as universal requirements or automated assumptions.
- Allow players to decline a social event without punitive hidden mechanics.
- Use pseudonymous identifiers for NPC profiles; keep player-entered names out of diagnostic telemetry and exported public reports.

### P3 — language, learning, and accessibility

- Commission native Hausa review for spelling, register, idiom, and culturally specific terms; create reviewed Yoruba/Igbo translations rather than literal substitutions.
- Keep UI strings in translation resources with stable keys; do not hardcode new language lines inside simulation classes.
- Support reduced motion, strong contrast, clear keyboard/touch operations, 44 px minimum touch targets, and a usable 2D fallback.
- Explain game-planning indices in context and never use labels that resemble clinical or official weather metrics.

### P4 — tuning and operations

- Build a fixed route-and-seed test matrix and browser tests for 2D, 3D, desktop, and phone.
- Collect opt-in anonymized performance and playtest statistics only after consent, with clear retention limits.
- Separate diagnostics from public UI and hide performance overlays unless explicitly enabled.
- Track first-load bytes, GLB sizes, draw calls, median frame time, storage-write frequency, and active actor counts.
- Maintain an asset attribution ledger; unclear asset licences remain flagged until resolved.

## 5. Data safety and responsible framing

- Seasonal scores represent game readiness, not personal medical fitness, household solvency, or a forecast.
- Export is user initiated; do not auto-upload relationship or family data.
- No player's real name, location, phone, health profile, or partner identity is needed to use the seasonal plan.
- Budget planning never constitutes a payment. Money moves only through the existing authoritative transaction path.
- Religious time references are narrative/approximate unless they are fed by a verified, appropriately attributed source. The seasonal bridge does not calculate prayer times.
- Weather-facing decisions should use fresh official guidance and provide safe alternatives; avoid asking a player to drive into floodwater or to ignore a dangerous road closure.

## 6. Sources reviewed

1. IFRA Nigeria. *Debunking popular narratives about Adaidaita-Sahu riders: The experience* (2018 field report). Focuses on everyday livelihoods, ownership, and expectations among Kano tricycle riders. https://www.ifra-nigeria.org/publications/e-papers/276-isyaku-mustapha-kabir-hannatu-ogunsemoyin-olubasayo-2018-debunking-popular-narratives-about-adaidaita-sahu-riders-the-experience
2. Agbabiaka, Maina & Oladeji. *Towards poverty reduction and economic development of Kano city: An assessment of the tricycles transportation patronage and its revenue generation capacity*. FUOYE Planning Journal; survey of 653 respondents during the study period. https://fpj.fuoye.edu.ng/index.php/fpj/article/view/9
3. Zubairu, N. I. *Urbanization and the Emergence of New (Specialized) Markets in Kano Metropolis, 1973–2001*. Zaria Journal of Liberal Arts, published 6 December 2025. https://journals.abu.edu.ng/index.php/zajola/article/view/89
4. Kofar-Na'isa et al. *Creativity and Social identity in urban transport: tricycle decoration in Kano Metropolis* (2018 ethnographic field report). https://www.ifra-nigeria.org/publications/e-papers/275-kofar-na-isa-abdullahi-usman-lawan-idris-popoola-olurunke-dorcas-williams-oluwaseun-2018-creativity-and-social-identity-in-urban-transport-tricycle-decoration-in-kano-metropolis
5. Kano State Government. *Kano State Climate Change Policy* (January 2025 approved copy). Use as a broad seasonal baseline, not a per-day forecast. https://www.africannewspage.net/wp-content/uploads/2025/07/Kano-State-Climate-Change-Policy_Jan-2025_approved-final-copy.pdf
6. Nigerian Meteorological Agency (NiMet). *Seasonal Climate Prediction 2026*. Annual outlook includes rainfall onset/cessation, temperature, dry spells, and related variables; use the current official release when updating a game data pack. https://nimet.gov.ng/scp
7. WHO/WMO. *Climate change and workplace heat stress: technical guidance* (2025). https://www.who.int/publications/i/item/9789240099814
8. US National Institute for Occupational Safety and Health (NIOSH). *Heat Stress Recommendations* (updated 2026). Rest/water/shade guidance is used here only as general design inspiration, not as Nigeria-specific regulation. https://www.cdc.gov/niosh/heat-stress/recommendations/
9. US Occupational Safety and Health Administration (OSHA). *Heat: Water. Rest. Shade*. General occupational guidance; not a substitute for Nigerian rules or professional assessment. https://www.osha.gov/heat-exposure/water-rest-shade/
10. National Bureau of Statistics (Nigeria). CPI catalogue and reports. https://microdata.nigerianstat.gov.ng/index.php/catalog/154
11. National Bureau of Statistics (Nigeria). PMS / petrol price-watch catalogue. The listed February 2026 release is historical and must not be treated as the current October 2026 pump price. https://microdata.nigerianstat.gov.ng/index.php/catalog/157/related-materials
12. Unity documentation. *Fixed updates*; a reference for fixed-interval physics/simulation architecture, not a requirement to migrate Kano Life to Unity. https://docs.unity.com/en-us/engine/6000.3/manual/scripting/managing-time-and-frame-rate/fixed-updates

## Confidence and limitations

The transport, market, climate, heat, and software-architecture sources offer practical qualitative or methodological support. They do not supply verified current micro-prices for every Kano district, real-time weather or road conditions, citywide hour-by-hour traffic counts, universal household customs, or player-specific safety thresholds. Those require more direct local research, native-speaker review, and playtests before being represented as realistic numerical behaviour.
