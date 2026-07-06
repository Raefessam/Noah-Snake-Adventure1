# 🐍 Noah Snake Adventure

*Made with ❤️ by Dad Raef*

A complete, colorful, offline Snake game built for a 5-year-old — no frameworks, no CDNs, no build step. Just open `index.html` and play.

---

## 1. How to run it

**Easiest way:** double-click `index.html` and it opens in your browser. That's it — everything (sound, graphics, saving) works with zero internet connection.

**Recommended way (for smoothest experience):** serve the folder with a tiny local server, since some browsers restrict certain features (like `localStorage`) when opening files directly with `file://`:

```bash
# Option A — Python (already on most computers)
cd Noah-Snake-Adventure
python3 -m http.server 8080
# then open http://localhost:8080 in your browser

# Option B — Node.js
npx serve .
```

Works on desktop, tablet, and mobile browsers, in both portrait and landscape.

---

## 2. Project structure

```
Noah-Snake-Adventure/
├── index.html              → page structure: menu, level select, settings,
│                              credits, the game screen, pause & game-over overlays
├── style.css                → all visual design: colors, animations, layout,
│                              responsive rules
├── game.js                  → all game logic (see section 8 below for a tour)
├── README.md                 → this file
├── LEARN_WITH_NOAH.md        → a kid-friendly guide that teaches programming
│                              concepts using this game as the example
└── assets/
    ├── images/               → reserved for future custom artwork
    ├── sounds/                → reserved for future custom audio files
    ├── fonts/                 → reserved for future custom fonts
    └── icons/                 → reserved for future custom icons
```

**Why are the `assets/` folders empty?** To guarantee the game works 100% offline
with zero dependencies, all art is drawn live with the HTML5 Canvas API (the
snake, fruit, background) and all sound is *synthesized* live with the Web
Audio API (oscillators, not audio files). This means there is nothing to
download, nothing that can go missing, and nothing that can break across
browsers or operating systems. The folders are kept in place so you can drop
in your own PNGs, MP3s, or fonts later and wire them in — see section 7.

---

## 3. How movement works

The snake does **not** move pixel-by-pixel. It moves on an invisible grid of
`18 × 18` cells (see `GRID_SIZE` in `game.js`). Every game "tick":

1. The snake's current direction (`Game.dir`) is applied to make a `newHead`
   cell — one grid step ahead of the current head.
2. That new head is added to the **front** of the snake's body array.
3. If the snake did **not** eat food this tick, the **last** segment of the
   body array is removed — this is what makes the snake appear to "slide"
   forward instead of just growing forever.
4. If it **did** eat food, step 3 is skipped, so the snake becomes one
   segment longer.

Ticks don't happen every animation frame (which would be too fast) — they
happen every `stepMs` milliseconds, controlled by the chosen difficulty
(Easy = 180ms, Normal = 130ms, Hard = 90ms). This is handled by an
accumulator pattern inside `Game.loop()`, which is the standard way to
decouple "how often the screen redraws" from "how often the game state
updates" — see the **Game Loop** section of `LEARN_WITH_NOAH.md` for a plain
explanation of why that matters.

Direction changes are queued in `Game.nextDir` and only applied at the start
of the *next* tick, and a same-tick 180° reversal (turning directly back
into your own neck) is blocked in `Game.setDirection()`.

---

## 4. How collision works

Two kinds of collisions are checked every tick, right after the new head
position is calculated, inside `Game.tick()`:

- **Wall collision** — if the new head's `x` or `y` falls outside
  `0 … GRID_SIZE - 1`, the game ends.
- **Self collision** — if the new head's coordinates match *any* existing
  body segment, the game ends.
- **Food collision** — if the new head's coordinates match the food's
  coordinates, `Game.eatFood()` runs (score +1, particle burst, sound,
  and a new food is placed in a cell that isn't currently occupied by the
  snake).

All three checks are simple coordinate comparisons on the grid — no pixel
math needed, which keeps collision detection fast and 100% reliable even at
Hard difficulty.

---

## 5. How scoring works

- Each fruit eaten = **+1** point (`Game.score++` in `eatFood()`).
- Every **5 points**, a mini level-up celebration fires (confetti + a happy
  chime) via `Audio.levelUp()` and `FX.confetti()`.
- The **high score** lives in `Storage.data.highScore` and is updated the
  moment the live score passes it — not just at game over — so the HUD
  always reflects the true best score.
- At Game Over, if the final score matches or exceeds the saved high score,
  a "🌟 New Record! 🌟" message and a bigger confetti burst play.

---

## 6. How LocalStorage works

All persistent data is stored under one single `localStorage` key,
`noahSnakeAdventure.save.v1`, as a JSON object — see the `Storage` object in
`game.js`. This is deliberate: storing one JSON blob instead of many
separate keys means:

- Loading is one `JSON.parse()` call, merged over sensible defaults (so if a
  future version adds a new field, older save data still works).
- Saving is one `JSON.stringify()` + `setItem()` call, wrapped in a
  `try/catch` in case storage is unavailable (e.g. private browsing mode) —
  the game still works perfectly in that case, it just won't remember your
  score between visits.

What's saved:
| Key | Meaning |
|---|---|
| `highScore` | Best score ever achieved |
| `lastDifficulty` | The last level chosen, so Play remembers your preference |
| `sfxOn` / `musicOn` | Sound preferences |
| `reducedMotion` | Accessibility setting that shortens all CSS animations |
| `unlockedRewards` | Currently tracks whether the Secret Golden Snake has been found |

---

## 7. How to modify the game

- **Change colors / fonts / spacing** → edit the CSS custom properties at
  the top of `style.css` (the `:root { --sky-top: ...}` block). Everything
  else references those variables, so one edit ripples through the whole
  game.
- **Change the fruits** → edit the `FOODS` array near the top of the
  gameplay section in `game.js`. Add `{ emoji: '🍉', color: '#FF5C7A' }` and
  it's immediately in the random rotation — no other code changes needed.
- **Add real audio files** → drop `.mp3`/`.ogg` files into
  `assets/sounds/` and replace the relevant method in the `Audio` object
  (e.g. `Audio.eat()`) with an `HTMLAudioElement` (`new Audio('assets/sounds/eat.mp3').play()`)
  instead of the synthesized tone. Everything else keeps working.
- **Add real sprite art** → drop images into `assets/images/`, load them
  with `new Image()` once at startup, and swap the `ctx.fillText(emoji...)` /
  `ctx.arc(...)` calls in `Game.drawSnake()` / `Game.drawFood()` for
  `ctx.drawImage(...)` calls.
- **Change the secret code** → edit the `'NOAH'` string checked in
  `Input.onKey()`.

---

## 8. Adding a new difficulty level

Levels live in one place — the `LEVELS` object in `game.js`:

```js
const LEVELS = {
  easy:   { stepMs: 180, label: 'Easy' },
  normal: { stepMs: 130, label: 'Normal' },
  hard:   { stepMs: 90,  label: 'Hard' }
};
```

To add a new one (say, "Turbo"):

1. Add an entry: `turbo: { stepMs: 60, label: 'Turbo' }`.
2. Add a matching button in `index.html` inside `.level-grid`:
   ```html
   <button class="level-card" data-level="turbo">
     <span class="level-emoji">🔥</span>
     <span class="level-name">Turbo</span>
     <span class="level-desc">Blazing fast</span>
   </button>
   ```
   The existing JavaScript (`document.querySelectorAll('.level-card')`) will
   automatically wire up the new button — no JS changes required, because
   the code reads `data-level` generically.

---

## 9. How to publish on GitHub Pages

1. Create a new GitHub repository (e.g. `noah-snake-adventure`).
2. Push this folder's contents to the repository's `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Noah Snake Adventure — initial release"
   git branch -M main
   git remote add origin https://github.com/<your-username>/noah-snake-adventure.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**.
4. Under **Source**, choose the `main` branch and the `/ (root)` folder,
   then click **Save**.
5. After a minute, GitHub will show a live URL like:
   `https://<your-username>.github.io/noah-snake-adventure/`
6. Open that link on any device — desktop, tablet, or phone — and the game
   is instantly playable, no installation needed.

---

## 10. Browser support notes

- Built entirely on standard HTML5 Canvas, CSS3, and vanilla ES6+
  JavaScript — works in any modern browser (Chrome, Edge, Safari, Firefox).
- Audio requires one user interaction first (tapping Play, or any
  key/tap) — this is a standard browser security rule, and the game already
  handles it automatically in the bootstrap code at the bottom of
  `game.js`.
- Touch controls (on-screen arrows + swipe gestures) automatically appear
  on touch devices via a CSS media query (`(hover: none) and
  (pointer: coarse)`), while keyboard (Arrow keys / WASD) works on desktop.

Enjoy the adventure, Noah! 🐍💛
