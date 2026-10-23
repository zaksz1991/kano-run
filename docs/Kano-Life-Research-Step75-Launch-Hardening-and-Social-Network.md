# Kano Life — Step 75 Research Dossier

**Research date:** 23 October 2026  
**Scope:** start-page resilience; persistent social relationships; northern Nigerian urban culture; football, music, Kannywood and Islamic digital media; consent-centred response to harassment; advanced game-simulation design.

## Executive summary

Step 75 treats the driver as a person living in a persistent social network, not only an avatar that completes routes. The new social-memory layer gives recurring people identities, relationship measures and memory of prior choices. The same person may be a supportive friend in one scene and a frustrated neighbour in another; outcomes depend on prior trust, tension and context.

The start-page work addresses the visible symptom in the supplied screenshots: route and driver selectors render empty and the Start Driving control does not progress. Static starter options, configuration-aware population and a post-click progress/error check are included. The exact original runtime failure was not reproduced in a browser, so the root cause remains unconfirmed.

## 1. Evidence from Kano and northern Nigerian contexts

### 1.1 The Keke is a social object

An IFRA-Nigeria ethnographic working paper on tricycle decoration in Kano draws on interviews, rides with drivers and field visits. It describes decoration as a form of personal and social identity rather than merely vehicle styling. A companion paper on Adaidaita Sahu riders examines daily work and expectations and explicitly challenges broad negative stereotypes of riders.

**Design implications:** Keke identity, chosen vehicle decoration, relationships, music and street conversations belong in the simulation together. Driver, passenger and neighbourhood characters should have individual motivations; the game should not equate occupation, income or district with a moral trait.

Sources:
- IFRA-Nigeria, *Creativity and Social Identity in Urban Transport: Tricycle Decoration in Kano Metropolis* (2018): https://www.ifra-nigeria.org/publications/e-papers/275-kofar-na-isa-abdullahi-usman-lawan-idris-popoola-oluronke-dorcas-williams-oluwaseun-2018-creativity-and-social-identity-in-urban-transport-tricycle-decoration-in-kano-metropolis
- IFRA-Nigeria, *Debunking Popular Narratives about Adaidaita-Sahu Riders: The Kano Experience* (2018): https://www.ifra-nigeria.org/publications/e-papers/276-isyaku-mustapha-kabir-hannatu-ogunsemoyin-olubusayo-2018-debunking-popular-narratives-about-adaidaita-sahu-riders-the-kano-experience

### 1.2 Islamic learning, movements and digital social life

A study published in July 2026 examines social-media use for Islamic preaching in metropolitan Kano, including content associated with Izala, Tijaniyya, Qadiriyya and independent clerics. It describes digital platforms as channels for scriptural teaching and family/youth issues, audience interaction and sometimes contestation between movements. Research on Islamic cyber practices in northern Nigeria separately analyses how social media reshapes religious authority and online communities.

**Design implications:** religious listening and discussion should be optional preferences and conversation topics. The game can let a character follow a named speaker, attend a lesson, share a lecture link within a fictional dialogue, ask for sources, disagree respectfully or leave a heated conversation. A preference must not automatically imply a character's sect, political view, virtue, hostility or family values. The simulation should not declare one movement universally correct or make generated dialogue appear to be a real scholar's quotation.

Sources:
- Nasidi & Ismail, *Digital Preaching: An Examination of Social Media Utilisation by Islamic Religious Movements in Metropolitan Kano, Northern Nigeria*, Journal of Contemporary Issues in Media & Communication (published 30 July 2026): https://ejournal.usm.my/jcimc/article/view/6034
- *Islam in the digital infrastructure: the rise of Islamic cyber practices in Northern Nigeria* (2024): https://www.tandfonline.com/doi/full/10.1080/09637494.2024.2353956
- Fahm & Ibrahim, *How Islamic Thought Shapes Socio-Political Dynamics... in Northern Nigeria* (published online 27 May 2026; research includes Kano, Sokoto, Kaduna and Borno): https://journals.sagepub.com/doi/10.1177/00020397261452691

### 1.3 Language, transport identity, film and music

Research into tricycle inscriptions in Nigeria describes the vehicles as mobile sites for identity and social expression. The study is based on Uyo rather than Kano, so it is useful as a comparative reference, not direct evidence for all Kano riders. Recent research on digital Kannywood further indicates that Hausa-language cinema and online distribution are relevant parts of changing cultural and media life.

**Design implications:** allow individual selections and context switching: Hausa-language music, Arewa hip-hop, nasheeds, Afrobeats, Kannywood films, documentaries or quiet. Do not assume that a person's language or region determines their taste. Music and movie preferences are labels used in fictional dialogue; Step 75 does not play or redistribute audio/video assets.

Sources:
- Mensah et al., *When Tricycles Speak: Language Practices and Ideology in Tricycle Texts in Nigeria*, Journal of Asian and African Studies: https://journals.sagepub.com/doi/10.1177/00219096231197779
- Nasidi & Ismail (2026), digital preaching research above, for platforms and mediated listening.
- A 2026 study of digital transformation in Kannywood is discoverable through the African Journal of Islamic Studies search archive; treat claims as preliminary until full text and methods are checked: https://www.richtmann.org/journal/index.php/ajis/article/view/14868

### 1.4 Football fandom and friendship

Football talk is a plausible recurring leisure activity, but the social system should allow local, national and international clubs and permit changing or multiple affiliations. Rivalry is a prompt for friendly banter, watch parties, disappointment and conflict management, not a basis for ranking people or provoking real-world hostility. Team choices are player-configured rather than inferred from geography, gender, age or religion.

This is a game-design assumption consistent with the intended setting, not a claim that every northern Nigerian resident watches football.

### 1.5 Harassment and distress: victim-centred interaction

The UN Victims' Rights First framework calls for putting dignity, wellbeing and safety first, treating people individually, keeping interactions non-judgmental and obtaining consent before acting on a person's behalf.

**Design implications:** the harassment-related scenario must never make harassment a selectable reward action. Response options should prioritise the affected woman's stated wishes, safe distance, seeking trusted assistance when appropriate, and avoiding public exposure or escalation. The game should not auto-contact police, family or authorities on the character's behalf. The new story remains fictional and does not provide a real-world reporting service.

Source:
- United Nations, *Victims' Rights First — What is the victim-centred approach?*: https://www.un.org/en/victims-rights-first

## 2. Social simulation architecture

Anthology, an agent-based social-simulation framework presented at the AAAI Conference on AIIDE, combines character motives, a representation of social relationships, and actions with explicit preconditions and effects. That is a useful architectural reference for richer games because it makes actions inspectable and makes relationships more than isolated dialogue choices.

Step 75 implements a small, bounded version:

- Eight recurring contact profiles, each with trust, bond/closeness, respect, tension and support.
- Typed events and actions with explicit preconditions, including relationship-stage eligibility and a rule locking choices during an active driving shift.
- Persistent story position and history to reduce immediate scene repetition.
- Bounded metrics and normalised saved state.
- A single existing source of wellbeing metrics and relationship stage.
- Export that excludes contact names.

It does not yet provide autonomous multi-agent planning, natural-language generation, a full memory-retrieval model, or live AI dialogue. Those should be researched and built separately rather than advertised as already present.

Source:
- Azad, Wellnitz, Garcia & Martens, *Anthology: A Social Simulation Framework*, AIIDE 18(1), 2022: https://ojs.aaai.org/index.php/AIIDE/article/view/21967

## 3. Assumptions, limits and safeguards

- All contacts and stories in the upgrade are fictional. A real person's name should not be stored as a proxy for a real relationship without the player's choice.
- Relationship, grief, anger and family-care scores are game indicators, not clinical assessments.
- Marriage, separation and divorce can be sensitive. A story about reconciliation must never assume it is safe; boundaries and safety are valid outcomes.
- The player may ignore optional media, religious or social scenes without penalty.
- A speaker or group preference is a topic preference, not evidence of membership or beliefs.
- The update does not play music, films, lectures or sermons, and it does not upload relationship histories.
- Local storage may be visible to anyone with access to the same browser profile. Export is anonymised by contact name, but users should still avoid entering real private details.
- The start-page correction has static and source-level checks only. Browser verification is needed to prove the live button works after the entire page's earlier modules and the game runtime load.

## 4. Follow-on roadmap for advanced applications

1. **3D social anchors:** locate household, Keke park, market, mosque vicinity and community gathering actors using existing GLB assets and current renderer adapters; do not create competing animation loops.
2. **Context triggers:** surface an interaction only when a character is near, the game is stopped, and the social cooldown/precondition allows it.
3. **Memory retrieval:** store compact event summaries and relationship changes rather than unbounded dialogue transcripts. Add seeded randomness to make tests reproducible.
4. **Accessibility and safety:** add opt-out controls, reduced motion, language options, text-size checks, and a clear erase/export story-data control.
5. **Browser tests:** automate start-screen selection/launch, failed-bootstrap messaging, network-panel reveal, local persistence, safe export, 390px mobile layout and desktop layout. Test 2D and 3D separately.
6. **Responsible live data:** if later adding fixtures, weather or public schedules, use an explicitly sourced endpoint with timestamps and offline fallback. Avoid embedding unlicensed radio, films or sermon recordings.
7. **Build and deployment integrity:** install locked dependencies, run the whole supported test glob, verify built output, then test a preview. No production deployment is included in Step 75.

## 5. Evidence and confidence ledger

| Claim | Evidence | Confidence / limitation |
|---|---|---|
| Keke decoration can express driver identity | Kano ethnographic working paper | Direct, but published in 2018 |
| Riders' daily lives should not be flattened into a negative stereotype | Kano rider ethnography | Direct, but only one study context |
| Islamic digital preaching involves diverse groups and audience interaction | Metropolitan Kano study published July 2026 | Direct, qualitative study; not a census of every listener |
| Online Islamic authority is shaped by community and platform dynamics | 2024 northern Nigeria study | Direct academic analysis; conclusions are scoped to study participants/practices |
| Victim-centred responses prioritise dignity, safety and consent | United Nations guidance | Authoritative guidance for the safety design |
| Agent relationship models benefit from explicit actions and effects | Anthology framework paper | Architectural guidance; not evidence about Kano residents |
| Football/music tastes vary by person | Simulation design principle | Explicit design assumption; player-choice system supports variation |

Research should inform a respectful range of scenes, not rigid rules about how a northern Nigerian person must behave.
