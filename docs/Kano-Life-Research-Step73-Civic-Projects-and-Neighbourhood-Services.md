# Kano Life — Step 73 Research Dossier
## Civic projects, neighbourhood services and local climate resilience

**Prepared:** 23 October 2026  
**Project:** Kano Life / Kano Run  
**Scope:** evidence-informed design for a browser-based life simulation set in Kano, Nigeria.  
**Important boundary:** all in-game budgets, project values, response intervals, trust points and service indicators are design assumptions. They are not municipal budgets, verified current local prices, official service records or forecasts.

## Executive summary

The most defensible direction after the existing life systems (driver earnings, seasonal resilience, Adashi and neighbourhood support) is a small civic layer linking local conditions to collective action. This adds choices with consequences beyond the player’s vehicle without turning the game into an unsupported city-scale predictive model.

Step 73 introduces six fictional community initiatives: drainage clearing and flood preparation; road-edge/pothole response; street lighting; shared water-point maintenance; market/street clean-up; and a shaded driver/pedestrian rest stop. Players can open one initiative at a time, contribute from the existing game wallet, volunteer once per in-game day, record a fictional local issue, follow the status of that issue and export their own in-game activity report.

A crucial accounting boundary is preserved: player contributions reduce the existing saved wallet only after the save operation is verified. Neighbour contributions are simulated project-progress units and never become player cash. Volunteer effort is also non-cash progress. Recording an issue does not submit it to a government agency or imply a real-world service request. A report remains open, is acknowledged by the simulated neighbourhood group, then either matches an actually completed fictional project in the same district or is referred for external follow-up; the game does not claim an unbuilt repair is complete.

## Evidence reviewed

### 1. Kano-specific flood exposure and drainage

A 2024 study assessed flood risk across Kano metropolis using the Challawa and Jakara hydrological basins. It combined return-period flood analysis, inundation mapping and a social-vulnerability lens. Its results underscore that urban flood exposure varies spatially and that flood risk is not equivalent to rainfall alone. The simulation implication is to model drainage condition, road-edge exposure, settlement vulnerability and readiness as separate factors, rather than treating a rain event as an identical hazard everywhere.

Source: *Water* (2024), “Frequency-Based Flood Risk Assessment and Mapping of a Densely Populated Kano City in Sub-Saharan Africa Using MOVE Framework.” https://www.mdpi.com/2073-4441/16/7/1013

**Limit:** the paper’s basin-level maps and quantitative estimates should not be converted into exact street-level risk values without geospatial data and validation. Step 73 therefore uses abstract scenario metrics, not live predictions or an accurate hazard map.

### 2. Neighbourhood-level adaptation is useful but not a substitute for public services

Barau and Wada’s 2021 chapter on DIY flood-risk adaptation in Kano describes local responses including sandbags, drain de-silting, fences and drainage diversions. It also argues that communities need institutional support, capacity building and urban planning rather than being left to manage flooding alone.

Source: Barau, A. & Wada, A. S. (2021), “Do-It-Yourself Flood Risk Adaptation Strategies in the Neighborhoods of Kano City, Nigeria,” in *African Handbook of Climate Change Adaptation*. https://link.springer.com/rwe/10.1007/978-3-030-42091-8_190-1

**Design implication:** civic volunteer actions should help with awareness, safe clean-up and project progress, but must not suggest that residents can safely solve every drainage or structural engineering problem by themselves. The current feature records collective effort and referrals; it does not instruct the player to enter dangerous floodwater, alter river channels or construct real infrastructure.

### 3. Markets are both livelihood infrastructure and flood-exposure locations

A study published in October 2025 examines flood-management and mitigation strategies at Kantin Kwari Market in Kano. Its focus connects market vulnerability, drainage infrastructure and sustainability of commercial activity.

Source: Musa, M. et al. (31 October 2025), “Evaluating Flood Management and Mitigation Strategies in Reducing Market Vulnerability in Kantin Kwari Market, Kano, Nigeria,” *Journal of Occupational Health, Risk Management, and Safety*. https://johrms-unical.com.ng/index.php/home/article/view/17

**Design implication:** a market clean-up, drainage project and road-access project can affect the same neighbourhood’s travel and commerce indicators, while remaining separate project types. This creates systems interaction without pretending that a small in-game fund can fully prevent market flooding.

### 4. Basic-service priorities are shared, but household experiences vary

A study published in June 2026 examines how men and women understand and prioritise urban basic services in informal settlements of Lagos and Kano. The reported priorities include health, water, sanitation, roads, markets and education. The paper also reports differences in some dimensions, including access to water, indicating that city-wide averages can obscure differences in household experience.

Source: “Analysis of Urban Basic Services of Importance to Men and Women in Informal Settlements of Lagos and Kano, Nigeria,” *Ibadan Planning Journal*, Vol. 12 No. 1 (2026). https://journals.ibadanedu.com/index.php/ipj/article/view/2235

**Design implication:** the game should offer multiple needs rather than one universal measure of community wellbeing. Water access, sanitation/cleanliness, travel safety, shade and market access are tracked independently. A future iteration can introduce NPC household profiles and disaggregated outcomes, but must avoid stereotypes and should not assume a person’s need from gender alone.

### 5. Infrastructure needs lifecycle maintenance, not a one-off completion animation

A World Bank announcement of 13 December 2024 on Nigeria’s Rural Access and Agricultural Marketing Project describes support for state road institutions, climate-resilient construction, planned maintenance and connections to markets, services and jobs. The program is rural-focused; its evidence is used here for the general design principle of lifecycle maintenance, not to make claims about the delivery status of a specific Kano urban road.

Source: World Bank (13 December 2024), “Nigeria to Enhance Road Infrastructure to Benefit Four Million in Rural Communities.” https://www.worldbank.org/en/news/press-release/2024/12/13/nigeria-to-enhance-road-infrastructure-to-benefit-four-million-in-rural-communities

**Design implication:** future upgrades should give completed projects a condition and a maintenance cycle. Step 73 deliberately stops at an initial project/issue model; it does not yet implement wear, maintenance contracts or claims about who is responsible for real services.

### 6. Climate-resilient service delivery is broader than a single neighbourhood fundraiser

The World Bank’s 2025 appraisal document for Nigeria’s Solutions for Internally Displaced and Host Communities Project describes investments in climate-resilient infrastructure and basic services in target northern Nigerian local government areas. The document demonstrates the use of multi-component service planning rather than treating each infrastructure problem as an isolated one-off.

Source: World Bank, Project Appraisal Document (document date 17 July 2025; disclosed 7 August 2025), *Nigeria — Solutions for the Internally Displaced and Host Communities Project*, P181248. https://documents.worldbank.org/en/publication/documents-reports/documentdetail/099072125125539995

**Limit:** the existence of this national project does not establish that any given in-game district receives funding or that a current player action corresponds to a real funded program. The feature contains no institutional logos, claims of official affiliation or real-world request submission.

## Design decisions translated into mechanics

| Research signal | Step 73 mechanic | What it deliberately does not claim |
|---|---|---|
| Flood risk differs by basin and vulnerability | Separate flood resilience, road safety, water and access indicators | It is not a validated GIS map or live flood warning |
| Community adaptation can help but has limits | Voluntary neighbourhood initiatives and issue referral | Volunteer effort is not a substitute for structural works or emergency services |
| Markets face environmental and mobility risks | Market clean-up, drainage and road-edge initiatives | Project completion does not guarantee that a real market is safe or flood-proof |
| Service priorities differ by household and context | Multiple independent community-service indicators | It does not infer an NPC’s needs from gender or identity alone |
| Infrastructure requires ongoing planning and maintenance | Progress history and completed-project records | Maintenance decay and public budgets are not yet simulated |
| Formal services include institutions beyond the community | Unmatched issues become “referred,” not falsely “fixed” | The game never sends a report to authorities |

## System specification

### Project types

The module defines six projects: drainage/flood preparation (₦18,000 game target), road-edge/pothole response (₦26,000), street-lighting initiative (₦22,000), shared water-point maintenance (₦24,000), market/street clean-up (₦12,000), and shaded rest stop (₦21,000). These round figures are balancing targets only. They are not cost surveys or real quotations.

Each project adds bounded points to a subset of eight indicators: flood resilience, road safety, night safety, water access, heat resilience, cleanliness, market access and rest/shade access. Values are clamped to 0–100 so repeated projects cannot create unbounded values. They are abstract gameplay indicators, not engineering measurements.

### Funding and effort

- Only one community project can be active at a time.
- Player contributions are restricted to enumerated in-game amounts and deducted from `save.money`, the existing game wallet.
- If less than the selected contribution remains to reach the target, only the required remainder is deducted.
- The core model returns a proposed new wallet balance; the UI commits that balance and civic state together through the existing `persist()` function and restores the previous values when storage verification fails.
- Simulated neighbour progress is stored separately inside the project and never credited to the player wallet.
- Volunteer work adds non-cash project value and is limited to one volunteer action per in-game day.

### Civic issue board

Seven issue categories cover blocked drainage, flood-prone road edges, potholes, unlit roads, unsafe crossings, water-point problems and waste hotspots. A player can record one issue per in-game day. Repeated unresolved reports of the same category in the same area are rate-limited. An issue advances from submitted to community review after two simulation days. After the follow-up interval it resolves only if a compatible project has already completed in that same area; otherwise it is referred for external follow-up. All report records explicitly state that they are fictional and not transmitted to any service.

### Persistence and security

The module uses a namespaced field within the existing `save.lifestyle` object. It does not introduce a new `localStorage` key, a second wallet, an external API or any personal information collection. Saved values are normalised: known project and issue IDs are allowlisted, counters are bounded, list sizes are capped, strings are length-limited and unknown metrics are dropped. The module uses DOM `textContent` for dynamic UI text. The JSON export contains game records and a disclaimer; it does not contain credentials or location permission data. The UI adapter publishes its advanced in-memory day state before calling the existing `persist()` function because that function can synchronously emit a wallet-update event; this avoids re-processing the same day during a re-entrant render.

### Determinism and day progression

Neighbour matching uses a named constant (3.5% of target per simulated day, bounded by minimum/maximum daily value), not per-frame randomness. Issue deadlines and project progress are based on the host game’s current day value. The UI reads the same day sources already used by the earlier life add-ons. If that source does not advance in the host build, timelines will not advance; this requires an in-browser regression check before release.

## Automated verification completed

The merged offline source-tree run completed **196 automated tests with 0 failures** on Node.js v22.16.0. The updated GLB-catalog test now covers actual catalog scanning and the current catalog-only Vite plugin; the root-cause repair test now checks whole-model bounds and exact-path calibration instead of an obsolete guessed-axis rotation. This is not a substitute for a Vite build or browser testing. The archived source snapshot predates the currently referenced Step 65/68 runtime modules; their existing entrypoint references have been retained.

## What needs real-browser verification

1. Open the career/life panel on desktop and a narrow phone viewport; confirm the civic panel appears below Adashi and does not cover existing controls.
2. Start an in-game run; verify project, contribution, volunteer and report buttons are disabled during active driving.
3. Create a project, contribute from the game wallet, reload, and verify wallet and progress persist together.
4. Simulate day progression. Confirm neighbour progress increases once per game day rather than on every UI refresh.
5. Complete one project in the same district as a report; ensure only compatible reports are resolved.
6. Complete an unrelated project; confirm the report is referred, not marked resolved.
7. Use export and inspect the JSON. Confirm the fictional-activity notice appears.
8. Check that no new request is sent over the network when the report button is used.
9. Verify desktop 3D, mobile 3D and Canvas 2D rendering remain stable; this patch does not change renderer, road physics or model loading.

## Next research/engineering priorities

1. **Lifecycle maintenance:** model ongoing drain/lighting/rest-stop condition with a documented repair and maintenance cycle, but connect any paid repair to the existing wallet only.
2. **NPC service profiles:** create non-stereotyped resident/merchant needs and measure who benefits from each project. Keep identity attributes separate from need values unless research and a clear design case justify otherwise.
3. **Evidence-linked event tuning:** use published seasonal forecasts and validated local hazard research for scenario design; record source/version/date and label any forecast-derived scenario as illustrative.
4. **Accessibility:** support keyboard operation, screen-reader announcements, sufficient contrast, reduced motion and safe tap-target sizes.
5. **Asset and licensing audit:** keep each model, texture, sound and map layer associated with author, licence, source and required attribution.
6. **Simulation evaluation:** use deterministic seeds and repeatable scenario tests. A successful unit-test run cannot confirm real rendering, model placement, mobile frame rate or genuine player comprehension.

## Source quality notes

This dossier prioritises peer-reviewed research, a scholarly book chapter and World Bank project documentation. Study populations, publication dates and geographic scopes differ. Research about Kano City is directly local; national rural-road programs and northern-host-community programs are used only for general infrastructure-planning principles. No one source is treated as a live source of prices or current local service status.
