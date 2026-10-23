# Kano Life research brief — Step 72: Adashi and neighbourhood support

**Prepared:** 23 October 2026  
**Product:** Kano Life / Kano Run  
**Scope:** Research-informed mechanics for informal rotating savings, social capital, household resilience and stateful non-player characters.  
**Evidence boundary:** This is a game-design synthesis, not a representative survey of Kano residents, a financial product, legal guidance or a recommendation to join a real savings group.

## Executive finding

The next useful life-simulation layer is not another disconnected meter. It is a small, stateful social-and-economic system that makes relationships, household resilience and money consequences interact. Step 72 adds an optional simulated Adashi circle and practical-neighbourhood contacts. The existing game wallet remains authoritative. A contribution uses the existing banked funds; an eligible payout returns the simulated rotating pot to that same wallet. Narrative support interactions change only the simulation's contact/reputation state and do not create free money, passenger spawns or vehicle repairs.

## 1. Evidence reviewed

### Informal savings in Kano

The 2025 article **“Microfinance without Banks: Women's Empowerment through Informal Savings Mechanisms in Kano State”** reports a mixed-methods study of 250 women participating in adashe, ajo and thrift groups across five local government areas, plus six focus-group discussions. Its abstract discusses the potential of informal savings for financial access and decision-making while also identifying financial mismanagement, defaults, exclusion of the poorest participants and inflation exposure. This is unusually location-relevant evidence for a Kano-themed simulation. It is still one study with a specific sample; its reported outcomes must not be generalized to every gender, household, LGA or savings group. Source: https://zenodo.org/records/16980372 (published 28 August 2025; DOI 10.5281/zenodo.16980372).

**Design implication:** represent Adashi as an optional group with explicit contribution size, membership count, payout order, payment history and consequences for missed commitments. Do not imply that groups always succeed, always admit people, or have identical rules. The in-game circle uses deliberately small fictional game values and states this prominently.

### Informal savings and shock resilience across Nigeria

The Cambridge *Data & Policy* study **“Informal savings groups and food security during the COVID-19 pandemic: evidence from Nigeria”** analyses Nigerian household survey and pandemic phone-survey data. Its methods define group participation using the household survey item asking whether a woman in the household belongs to an “Adashi/Esusu/Ajo or other savings group”; the authors note that the survey does not itself reveal the precise structure or services of every group. Source: https://www.cambridge.org/core/journals/data-and-policy/article/informal-savings-groups-and-food-security-during-the-covid-19-pandemic-evidence-from-nigeria/73227B9D9066CB6E5F3CFCAAE1E2C727.

A separate 2024 *Food Policy* article, **“Insuring consumption against Shocks: The role of informal savings in Nigeria,”** uses three waves of Nigeria's General Household Survey Panel (2012–2013, 2015–2016 and 2018–2019) to study whether savings through informal institutions helps households smooth consumption after shocks. Its framing supports treating savings circles as one coping mechanism—not guaranteed insurance and not a substitute for all other safety nets. Source: https://doi.org/10.1016/j.foodpol.2024.102737.

**Design implication:** the system should make both the value and the cost of commitment visible. A circle can help a player receive a lump sum at a particular point in a cycle, but weekly contributions lower liquid wallet cash. Missed contributions can harm eligibility/reputation; they should not create money. A separate savings balance or second wallet would misrepresent the game's existing economy and cause state divergence, so the feature stores its ledger in the existing save object.

### ROSCAs and Nigerian enterprise

Research on rotating savings and credit associations (ROSCAs) in Nigeria describes these groups as mechanisms for mobilizing savings and financing livelihood or small-business activity, while highlighting risks around defaults and administration. One study of 240 ROSCA members in Nigeria reports a positive association between participation and micro/small-enterprise performance; this is evidence of association from a sample, not proof that membership causes success for every person. Source: https://doi.org/10.18488/journal.aefr.2020.102.189.199.

A study of informal Ajo arrangements in Ondo and Lagos further demonstrates that terminology, group organization and participant experience vary within Nigeria. It is contextual support for using a locally meaningful term while keeping configurable group rules, not evidence that Ajo and Adashi are interchangeable in every location. Source: https://doi.org/10.1093/oso/9780198865629.003.0004.

**Design implication:** the UI gives each fictional circle explicit rules rather than presenting a universal cultural custom. Contributions, payout position and missed-payment rules are visible before the player commits. The game uses fixed, named balancing values, not claimed current market prices.

### Agent-based social simulation

The AAAI/AIIDE paper **“Anthology: A Social Simulation Framework”** describes social simulation components including agents with motives, representations of relationships and knowledge, action preconditions/effects, and a real-time inspection interface. Source: https://doi.org/10.1609/aiide.v18i1.21967 (published 11 October 2022).

**Design implication:** NPCs need persistent relationships and consequences across days. Step 72 therefore stores separate contact trust, interaction history, cooldowns and support outcomes. A contact's response is based on that modeled relationship state rather than a one-off random dialogue. The current response threshold is a transparent gameplay heuristic, not a measured social-science probability.

## 2. Implemented in Step 72

- **Optional Adashi circle:** player selects a contribution amount, group size (4–8 simulated members) and payout position.
- **Real wallet integration:** financial changes are proposed by a pure model and committed with the Adashi ledger through the existing `save` object and `persist()` function. The feature does not create another wallet or another cash balance.
- **Weekly timing:** a turn's next due simulation day is seven days after settlement. The current simulated day is read from the game's existing schedule/life systems, with a conservative fallback.
- **Payout accounting:** the model displays an illustrative pot; only the player’s own payout is credited to the player’s existing wallet. NPC recipients are narrative/system records rather than money credited to the player.
- **Missed-payment handling:** an unpaid turn is recorded, community reputation decreases, and player payout eligibility is paused until two consecutive on-time contributions rebuild standing. No payout is granted for a missed player contribution.
- **Cycle exit:** a circle can be closed only between cycles, before the next contribution. A compact history of closed circles stays in the game save.
- **Neighbourhood support:** fictional contacts can build trust through practical actions such as road information, customer referrals, mechanic leads and check-ins. One action per simulated day and a per-contact request cooldown stop repeated spam.
- **Constrained outcomes:** requests may produce narrative guidance, but they do not mint money, repair the keke, or generate real customers. Future integrations must add separately tested, authoritative game actions.
- **Export and disclosure:** a user-triggered JSON report includes circle and contact history. It warns that the report is game data, not a bank statement, and omits the wallet balance and real contact/bank fields.
- **Mobile-first panel:** touch targets are at least 44 px, layouts collapse to one column at narrow widths, actions are disabled during driving, and text is inserted via `textContent`.

## 3. Tuning assumptions

All amounts are fictional game currency, and the release does not claim these are typical or recommended real-world contribution levels.

| Parameter | Step 72 value | Rationale |
|---|---:|---|
| Contribution options | ₦100, ₦250, ₦500, ₦1,000 per simulated week | Gives a small range with different cash-flow pressure; deliberately not presented as current market rates. |
| Circle size | 4–8 simulated members | Small enough for a compact UI and comprehensible cycle. |
| Turn length | 7 simulation days | Makes the weekly commitment legible to the player. |
| Social actions | 1 per simulation day | Prevents farming unlimited trust in one sitting. |
| Repeated support request | 3-day contact cooldown | Creates temporal friction without a permanent rejection state. |
| Missed contribution | Reputation −8; payout eligibility disabled | Visible consequence that can be recovered through two consecutive paid weeks. |
| On-time contribution | Reputation +3 on player's payout; +1 on an NPC payout turn | Lightweight feedback, not a real credit score. |
| Offered support | +4 or +5 contact trust, depending on action | Small bounded simulation increments; these are game-design values. |
| Request response | 70% contact trust + 30% community reputation; threshold 60 | Deterministic and testable; not a measured empirical probability. |

## 4. Technical architecture and verification

The model `js/KanoNorthernDriverAdashiSupport.js` is a pure state-transition layer. It does not import Three.js or access browser storage. `js/KanoNorthernDriverAdashiSupportUpgrade.js` builds the panel and commits both wallet and Adashi state in one save operation through the existing `storage.js` API. Data is nested at `save.lifestyle.adashiSupportV1`; there is no separate money field or second storage key.

The UI attaches to the existing `#kano-life-career-screen .klc-panel`. The new startup module is appended after the Step 69–71 modules in `index.html`; the six original application bootstrap module tags remain present and in order.

The automated suite covers configuration bounds, one-time wallet-gated contribution, payout position, weekly due dates, missed-payment outcomes, cycle rotation and exit, social action limits, trust-based narrative support, safe normalization, export disclosure and entrypoint integration contracts.

**Verification result in this environment:** all 91 packaged tests passed; the two Step 72 modules passed `node --check`. These are real results from Node's test runner. They are not evidence of a full Vite build, browser execution, WebGL rendering or production deployment.

## 5. Limitations and risks

1. **Time source:** weekly dues depend on the existing game exposing a changing simulation-day value. If the active game build has no advancing schedule/life day, the panel can appear not yet due indefinitely. The full runtime needs browser validation against the deployed day counter before treating weekly timing as verified.
2. **NPC pot abstraction:** NPC contributions are simulation-level values, not cash transferred from other user accounts. Only an eligible player payout changes the player's wallet. This is a gameplay abstraction, not a financial ledger or promise of a real payout.
3. **Cultural representation:** group rules vary by gender, community, relationship, religion, location and purpose. The default cast and rules are fictional. The system should be reviewed with participants before adding stronger demographic assumptions or local dialect.
4. **Save schema:** the current storage normalizer preserves unknown fields through its input merge, but the active production branch may have changed. A live integration test must confirm `save.lifestyle.adashiSupportV1` survives reload, save migration and any cloud-save round trip.
5. **Persistence atomicity:** the UI uses one existing local save write for the wallet and this feature's state. Cross-device/cloud synchronization races remain governed by the existing cloud-save module and have not been tested in this package.
6. **Financial framing:** this is game currency only. Do not connect a payment service, collect real account details, imply deposits are protected, or describe this as advice for joining or running a real savings circle.
7. **No live data feed:** all balancing values are local constants and must be labelled as simulation parameters. No real prices, contacts, credit reports, exact addresses or bank details are fetched or collected.

## 6. Recommended advanced roadmap

1. **Step 73 — NPC memory and district-aware support:** let contact knowledge depend on travel district, market familiarity and past player actions; keep rules inspectable and deterministic.
2. **Step 74 — household cash-flow calendar:** link existing family, school, fuel, repairs and savings milestones to one read-only budget forecast. Do not introduce a second wallet; each actual purchase still goes through the existing game economy.
3. **Step 75 — market/job network:** build persistent leads among market traders, mechanics, schools, transport ranks and small businesses, with location-specific activity and expiry. Lead generation should not guarantee income.
4. **Step 76 — stress-test scenarios:** test the same household across rainy-road delays, fuel-price shocks, vehicle breakdown and lost-work days with seeded randomness, comparable reports and a scenario reset that never touches saved player progress by default.
5. **Release gate:** after one module at a time, run the complete existing test suite, Vite build, desktop/mobile browser checks, and reload/cloud-save regression tests before production deployment.

## References

1. Yunusa, A. A., Jafaru, Y., & Yahaya, I. (2025). *Microfinance without Banks: Women's Empowerment through Informal Savings Mechanisms in Kano State*. Zenodo. https://doi.org/10.5281/zenodo.16980372
2. *Informal savings groups and food security during the COVID-19 pandemic: evidence from Nigeria*. Data & Policy, Cambridge Core. https://doi.org/10.1017/dap.2025.10007 (landing page: https://www.cambridge.org/core/journals/data-and-policy/article/informal-savings-groups-and-food-security-during-the-covid-19-pandemic-evidence-from-nigeria/73227B9D9066CB6E5F3CFCAAE1E2C727)
3. *Insuring consumption against Shocks: The role of informal savings in Nigeria*. Food Policy (2024), 129, 102737. https://doi.org/10.1016/j.foodpol.2024.102737
4. Ademola, A. O., Ben-Caleb, E., Eluyela, F. D., Falaye, A. J., & Ajayi, S. A. (2020). *Rotating and savings credit association (ROSCAS): A veritable tool for enhancing the performance of micro and small enterprises in Nigeria*. Asian Economic and Financial Review, 10(2), 189–199. https://doi.org/10.18488/journal.aefr.2020.102.189.199
5. Olawoye-Mann, S. (2022). *Alajo Shomolu: Money, Credit, and Banking the Nigerian Ajo Way*. In *Community Economies in the Global South*. Oxford University Press. https://doi.org/10.1093/oso/9780198865629.003.0004
6. Azad, S., Wellnitz, J., Garcia, L., & Martens, C. (2022). *Anthology: A Social Simulation Framework*. Proceedings of the AAAI Conference on Artificial Intelligence and Interactive Digital Entertainment, 18(1), 224–231. https://doi.org/10.1609/aiide.v18i1.21967
