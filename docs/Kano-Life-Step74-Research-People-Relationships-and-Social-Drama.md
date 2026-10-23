# Kano Life Step 74 — Research Notes: People, Relationships and Social Drama

**Research date:** 23 October 2026  
**Product:** Kano Life / Kano Run, a browser-based Adaidaita Sahu driver-life simulation  
**Scope:** Start-page recovery, the start-screen Keke hero image, relationship storytelling, neighbourhood interactions, emotional progression, harassment response, football/media preferences, and religious listening/discussion.

## Executive summary

Kano Life should treat its driver as a full person embedded in a changing network of partners, relatives, friends, neighbours, passengers, park colleagues and community contacts. The research supports making these relationships specific and persistent while avoiding claims that all Kano residents share one family structure, football team, music preference or religious affiliation.

Step 74 adds a conditional narrative engine with 13 social situations and 11 repeatable social activities. Choices affect love/affection, trust, patience, compassion, respect, friendship, neighbourhood trust, joy, sadness, stress, anger, resentment, grief and autonomy. The current Aure Journey module remains responsible for the player's relationship stage; Step 74 adapts its stories to single, dating, engaged, married, separated or divorced status rather than keeping a duplicate relationship-stage record.

A new transparent-background, realistic 3D-style Keke render replaces the small flat illustration on the start page. The new launch recovery and explicit `/js/main.js` entry are intended to address the reported blank route/driver selectors and start-page dead end. The exact live failure was not captured in browser developer tools, so the original root cause is not asserted as proven. This update adds recovery and error visibility; a real browser session is still required to confirm the deployed result.

## 1. Evidence and design implications

### 1.1 The Keke and the driver's public identity

The IFRA-Nigeria working paper *Creativity and Social Identity in Urban Transport: Tricycle Decoration in Kano Metropolis* is based on ethnographic fieldwork, interviews, rides with tricycle drivers and visits to relevant sites. It describes the Adaidaita Sahu as a vehicle that provides a distinct surface for personal and social expression. This supports presenting the Keke as a recognisable vehicle and making driver identity, music, interpersonal choices and vehicle appearance part of the same game world—not treating the driver as an anonymous avatar.

A companion IFRA paper, *Debunking Popular Narratives about Adaidaita-Sahu Riders: The Kano Experience*, examines riders' daily work and expectations and challenges blanket stereotypes about drivers. The social systems therefore include family obligations, friendship, income stress, embarrassment, humour, kindness, leisure and public respect—not only crime, penalties or failure.

Sources:
- [IFRA-Nigeria — Creativity and Social Identity in Urban Transport: Tricycle Decoration in Kano Metropolis (2018)](https://ifra-nigeria.org/files/92/Public-Transport-in-Kano-masterclass/146/KOFAR-NA-ISA-A-LAWAN-Im-POPOOLA-O-WILLIAMS-O-2018-Creativity-and-social-identity-in-urban-transport-tricycle-decoration-in-Kano)
- [IFRA-Nigeria — Debunking Popular Narratives about Adaidaita-Sahu Riders: The Kano Experience (2018)](https://ifra-nigeria.org/files/92/Public-Transport-in-Kano-masterclass/144/ISYAKU-M-KABIR-H-OGUNSEMOYIN-O-2018-Debunking-popular-narratives-about-Adaidaita-Sahu-riders)

**Implementation:** the start-page vehicle is bright yellow, and the narrative layer treats the driver as a person with a chosen name, friends, relationship history, community ties and leisure preferences.

### 1.2 Courtship, marriage, separation and household life

Research on courtship and marriage in Kano documents change over time, including individual preference and different roles for parents, relatives and marriage brokers. More recent qualitative research on polygynous relationships in northern Nigeria reports complex differences in communication, resource sharing, household authority and cooperation. One 2026 study is based on interviews with 24 women in polygynous unions in Sokoto State; it is valuable for the themes it surfaces but is not a statistically representative description of all Hausa or northern Nigerian families. A separate 2019 experimental study examined intrahousehold allocation among couples in Kano.

The game therefore offers different paths for dating, engagement, marriage, separation and divorce, and makes household fairness an optional married-life situation. The story does not assume that every player has children, that every married household is polygynous, or that reconciliation is always the right outcome. Family-care scenes do not create a child record or change real health data.

Sources:
- [Kurfi — Changing Patterns of Marriage Courtship among the Hausas: The Case of Emerging Role of Marriage Brokerage in Contemporary Kano Metropolis (2012)](https://www.macrothink.org/journal/index.php/jsr/article/view/1946)
- [Amzat et al. — Sharing a Husband: Women's Lived Experiences of Sexual Health and Rights in Polygynous Unions of Northern Nigeria (2026)](https://doi.org/10.1002/rfc2.70073)
- [Munro et al. — The Lion's Share: An Experimental Analysis of Polygamy in Northern Nigeria (2019)](https://doi.org/10.1086/700102)

**Implementation:** relationship stage remains sourced from the existing Aure Journey layer. Conflicts can raise or lower affection, trust, patience, anger, resentment, sadness and grief. Safe boundaries are valid outcomes; divorce is not scored as automatic moral failure. Mediation is a voluntary choice only when safe.

### 1.3 Islamic preaching, social media and group preferences

A July 2026 study of digital preaching in metropolitan Kano analyses how Islamic movements use Facebook, YouTube and WhatsApp for religious communication and community engagement. Its abstract covers Salafi/Izala, Sufi traditions such as Tijaniyya and Qadiriyya, and independent clerics; it also describes online participation and increased contestation between movements. A 2024 study of Islamic digital infrastructure in northern Nigeria discusses the roles of digital preachers, social media groups and online religious communities.

This evidence supports letting players choose lecture topics, a named public speaker of interest, a gathering tradition, or no named speaker at all. It does **not** support assuming a player belongs to a movement, assigning one movement to every person, or giving the game authority to score doctrinal correctness. Step 74 does not download, stream or redistribute sermon audio; the optional name list is drawn from research discussing public digital preaching, the names are preference labels only, and the activity mechanics reward patient listening and respectful discussion rather than a sectarian outcome. The selectable names are Sheikh Nuru Khalid, Sheikh Jabar Sani Mai Hula, Dr Bashir Aliyu, Sheikh Aminu Daurawa and Dr Isa Ali Pantami, alongside a topic-only option and a generic women-scholars/local-teachers option.

Sources:
- [Nasidi & Ismail — Digital Preaching: An Examination of Social Media Utilisation by Islamic Religious Movements in Metropolitan Kano, Northern Nigeria (published 30 July 2026)](https://ejournal.usm.my/jcimc/article/view/6034)
- [Islam in the Digital Infrastructure: The Rise of Islamic Cyber Practices in Northern Nigeria (2024)](https://doi.org/10.1080/09637494.2024.2353956)
- [Mustapha & Bunza — Contemporary Islamic Sects & Groups in Northern Nigeria (Cambridge University Press, online 2023)](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/52615C925867F1A6A91F1670AB3E8C6F/stamped-9781782044734c3_p54-97_CBO.pdf/contemporary-islamic-sects-and-groups-in-northern-nigeria.pdf)

**Implementation:** players can select topics such as tafsir, hadith and character, family responsibilities, youth issues or community service, and may select named speakers discussed in research on public digital preaching. The panel does not record which religious group a real person belongs to; preferences are fictional local save data only.

### 1.4 Football supporters, banter and friendship

A 2023 study of Nigerian fans of English Premier League clubs examines the language of football fandom and banter. It found that joking and mockery can help create camaraderie, while the same language can become personal or insulting. NOI Polls has also published Nigerian football-followership findings in which Kano Pillars appeared as a leading supported club. These findings justify football as an optional social subject, but they do not justify assuming every northern player supports Kano Pillars or follows football.

Sources:
- [Ajayi, Akinrinlola & Ajayi — Fandom Language and Banter-Throwing in Football-Related Interactions among Nigerian Fans of English Premier League Clubs (2023)](https://arushalinguistics.org/publications/Ajayi_Akinrinlola_Ajayi_AWPAL_2023.pdf)
- [NOI Polls — Football League Followership Report (2024)](https://www.noi-polls.com/post/6in10nigeriansfollowtheenglishpremierleague)
- [NOI Polls — Football Poll Report (2019)](https://www.noi-polls.com/post/football-poll-report)

**Implementation:** the profile has an optional favourite-club selector including Kano Pillars, Nigerian clubs and international teams. The football story branches into respectful banter, personal attacks or changing the topic; it measures friendship and respect, not whether a team is objectively superior.

### 1.5 Harassment, consent and the response to a person in distress

The United Nations' victim-centred approach to sexual harassment places the affected person's safety, dignity, wishes, confidentiality and informed consent at the centre. The WHO Psychological First Aid guidance advises listening without pressure, avoiding judgement and not forcing people to tell their story. These principles are relevant to an in-game public interaction because a well-intended response can still become controlling or unsafe if it ignores the person's wishes.

Sources:
- [United Nations — Victims' Rights First: Victim-Centred Approach](https://www.un.org/en/victims-rights-first)
- [UN system — A Victim-Centred Approach to Sexual Harassment](https://unsceb.org/products/victim-centred-approach-sexual-harassment-united-nations/)
- [WHO — Psychological First Aid: Facilitator's Manual for Orienting Field Workers](https://iris.who.int/bitstream/handle/10665/102380/9789241548618_eng.pdf?sequence=1)

**Implementation:** in the park harassment scene, there is no option to harass, stalk, coerce or turn harassment into a reward. Choices are to ask the woman what support she wants, alert trusted park/security personnel if safe, or avoid physical escalation while seeking safer help. The game tracks the driver's choices, not the woman's private details.

## 2. Step 74 feature scope

### Start-page recovery

- Adds a dedicated recovery module before existing bootstrap scripts.
- Records references to the canonical `UI` and `Game` when the normal UI binds.
- Populates route and driver dropdowns from existing configuration/save data if the UI did not fill them.
- Imports `main.js` directly if the optional bootstrap chain has not completed.
- Adds a visible retry/error panel if initialisation still fails.
- Includes an explicit direct `/js/main.js` entry after existing patches, relying on ES-module caching to avoid a duplicate game instance.

The blank route/driver selectors in the supplied screenshots are symptoms consistent with the normal `UI` initialisation not completing. Browser error output was not available, so the specific live failure remains unconfirmed. This is a repair strategy with diagnostics, not a claim that the live site was tested.

### Hero image

A generated transparent-background WebP render replaces the flat vehicle illustration. It is 1200 × 804 and about 203 KB. The responsive stylesheet adjusts the image for phone and desktop sizes. The vehicle image is a start-page visual, not a replacement GLB for the in-game player model.

### Social story system

- **Relationship stages:** single, dating, engaged, married, separated and divorced, synchronised from Aure Journey.
- **Conditional story situations:** misunderstandings, forgotten promises, gossip, embarrassment, football rivalry, sermon discussion, harassment response, music/movie disagreement, neighbour help, sadness and setbacks, separation boundaries, household fairness and shared-care planning.
- **Repeatable interactions:** listen/check in, apologise, set a boundary, help a neighbour, give a small kindness gift, talk football, listen to a lesson, share music/film, coordinate household care, support a sad friend and contribute to neighbourhood help.
- **Emotional state:** love/affection, trust, patience, compassion, joy, sadness, stress, respect, neighbour trust, friendship, autonomy, anger, resentment and grief.
- **Preferences:** driver/partner/neighbour/friend names, football club, music/radio taste, movie choice, religious topic, gathering/teacher tradition and optional speaker interest.
- **Privacy:** profile names are kept in local storage for game use and are omitted from the exported report. No real messages, harassment reports or religious audio are sent or downloaded.
- **Economy:** spending actions use the existing game wallet only and are locked during an active driving shift.

## 3. Verification boundaries

The merged offline snapshot ran 214 automated tests successfully at the time of the test report. Syntax checks and static HTML checks also passed. Vite dependencies were not installed in that offline working copy, so a production build was not run. No Playwright/browser console trace, WebGL visual inspection or mobile performance sample is claimed here.

## 4. Next-stage research priorities

1. Add real 3D locations for home compound, park, tea/food stalls, wedding/social gathering and neighbourhood visits; connect story actions to physical scenes rather than only an overlay panel.
2. Add NPC memory with separate private trust and public reputation; ensure rumours, harassment and religious disagreement do not collapse into one generic popularity score.
3. Introduce player-driven conversations with opt-in, culturally reviewed Hausa and English dialogue first, then Yoruba/Igbo where appropriate. Keep translations reviewed by fluent speakers.
4. Tie radio and film interactions to the existing audio controls while streaming only authorised or user-supplied audio; do not embed third-party preacher or music recordings without rights checks.
5. Add football fixtures as a data-backed optional event after checking a current fixture source, rather than presenting static clubs as current match schedules.
6. Connect existing family/parenthood data to shared-care choices only when the save already contains the relevant family state.
7. Run browser tests at desktop and phone viewport sizes, inspect network/console failures, verify route and driver selects are populated, start and complete a run, and test both 2D and WebGL before claiming production recovery.

## Research caveats

- The Kano transport studies cited above date from 2018/2019; they give contextual background, not live transport statistics for 2026.
- The 2026 polygynous-household study is qualitative and localised to 24 participants in Sokoto State. It was used for optional story themes, not generalisations about all families.
- Football polls depend on sample and survey period. Support is a player-selected preference, not a demographic assumption.
- Religious group labels and preacher names are optional listening interests, not a declaration about a player's beliefs and not an endorsement or ranking.
- All relationship events, names and changes to emotional meters are fictional game mechanics; they are not a clinical assessment or a model of every real relationship.
