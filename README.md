# Kano Run — Adaidaita Sahu

A browser-based endless runner set in **Kano State, Nigeria**.  
Drive a yellow Adaidaita Sahu (keke), pick up passengers, drop them for fares, dodge traffic, and survive the streets of Kano.

Inspired by the viral *Lagos Run* browser game, fully adapted for Northern Nigeria.

---

## Live Demo

Once deployed: `https://your-project.vercel.app`

## Features

- Realistic tricycle (Adaidaita Sahu) with spinning wheels & suspension
- Passenger pick-up / drop-off system
- Day → Night lighting cycle
- Harmattan dust & haze weather system
- Garage with paint jobs + upgrades (capacity, engine, horn)
- Missions with rewards
- Sound design (engine, horn, pickups, etc.)
- Fully mobile-friendly (swipe + on-screen controls)
- Persistent high score and garage progress

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Run locally
```bash
npm run dev
```
Open the URL shown (usually `http://localhost:3000`)

### 3. Build for production
```bash
npm run build
```
Output goes to the `dist/` folder.

### 4. Preview production build
```bash
npm run preview
```

---

## Deploy to Vercel

### Method A — Vercel CLI (fastest)
```bash
npm i -g vercel
npm run build
vercel --prod
```

### Method B — GitHub + Vercel Dashboard (recommended)
1. Create a new repository on GitHub
2. Push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Kano Run"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/kano-run.git
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com) → **New Project**
4. Import the GitHub repo
5. Vercel will auto-detect Vite. Click **Deploy**

Your game will be live in under a minute.

---

## Project Structure

```
kano-run/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── css/
│   └── styles.css
├── js/
│   ├── main.js         # Entry point & game loop
│   ├── game.js         # Core game logic
│   ├── renderer.js     # All Canvas drawing
│   ├── ui.js           # Screens, HUD, controls
│   ├── audio.js        # Web Audio system
│   ├── storage.js      # localStorage helpers
│   └── config.js       # Constants, paints, missions
├── assets/             # Future sprites & audio files
└── README.md
```

---

## Tech Stack

| Layer          | Technology              |
|----------------|-------------------------|
| Language       | Vanilla JavaScript (ES Modules) |
| Bundler        | Vite 5                  |
| Rendering      | HTML5 Canvas            |
| Audio          | Web Audio API           |
| Styling        | CSS3                    |
| Hosting        | Vercel (static)         |
| State          | localStorage            |

No React, no frameworks — keeps the bundle tiny and the game fast.

---

## Future Roadmap (Commercial Grade)

- [ ] Real sprite sheets & polished art
- [ ] Real Kano radio station streams
- [ ] Online leaderboards + accounts
- [ ] Full PWA (installable + offline)
- [ ] Capacitor → iOS & Android apps
- [ ] Brand partnerships / virtual billboards
- [ ] Multiple cities / vehicles
- [ ] Analytics (PostHog / Plausible)

---

## License

MIT

---

**Centre of Commerce** 🇳🇬  
Built with love for Kano State.
A browser-based endless runne
