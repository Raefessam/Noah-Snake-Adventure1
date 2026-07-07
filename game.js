/* =============================================================
   NOAH SNAKE ADVENTURE — game.js
   A complete, dependency-free Snake game engine.

   TABLE OF CONTENTS
   1.  Utility helpers
   2.  Storage  (save / load high score & settings)
   3.  Audio Engine (synthesized sound, no files needed)
   4.  Screen Manager (menu / levels / settings / credits / game)
   5.  Particle & Confetti systems
   6.  Snake + Food + Game Loop (the actual gameplay)
   7.  Input handling (keyboard, touch, secret code)
   8.  Wiring it all together
   ============================================================= */

(() => {
  'use strict';

  /* ===========================================================
     1. UTILITY HELPERS
     =========================================================== */
  const $ = (id) => document.getElementById(id);
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ===========================================================
     2. STORAGE
     Everything the game needs to remember lives in one
     localStorage key, stored as JSON, so a corrupted single
     value never crashes the whole save file.
     =========================================================== */
  const STORAGE_KEY = 'noahSnakeAdventure.save.v1';

  const Storage = {
    defaults: {
      highScore: 0,
      lastDifficulty: 'normal',
      sfxOn: true,
      musicOn: true,
      reducedMotion: false,
      unlockedRewards: [],
      // V1.3 additions — all new fields, fully backward compatible with v1.2 saves
      coins: 0,
      unlockedSkins: ['green'],
      currentSkin: 'green',
      lastDailyReward: 0,
      streak: 0, // Magic Forest Update — consecutive daily-reward days
      stats: {
        gamesPlayed: 0,
        totalFruits: 0,
        totalCoinsEarned: 0,
        highestLevel: 1,
        fruitCounts: {},
        timePlayed: 0 // seconds
      }
    },
    data: null,
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        this.data = { ...this.defaults, ...parsed };
        // Merge nested "stats" so an old save missing a new stat field
        // still gets sensible defaults instead of losing the whole object.
        this.data.stats = { ...this.defaults.stats, ...(parsed.stats || {}) };
        if (!Array.isArray(this.data.unlockedSkins)) this.data.unlockedSkins = ['green'];
        if (!this.data.unlockedSkins.includes('green')) this.data.unlockedSkins.push('green');
      } catch (e) {
        this.data = { ...this.defaults, stats: { ...this.defaults.stats } };
      }
      return this.data;
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (e) { /* storage unavailable — game still works, just won't persist */ }
    },
    set(key, value) {
      this.data[key] = value;
      this.save();
    },
    unlockReward(name) {
      if (!this.data.unlockedRewards.includes(name)) {
        this.data.unlockedRewards.push(name);
        this.save();
      }
    },

    // ---------- V1.3 helpers ----------
    addCoins(amount) {
      this.data.coins += amount;
      this.data.stats.totalCoinsEarned += amount;
      this.save();
    },
    spendCoins(amount) {
      if (this.data.coins < amount) return false;
      this.data.coins -= amount;
      this.save();
      return true;
    },
    unlockSkin(id) {
      if (!this.data.unlockedSkins.includes(id)) {
        this.data.unlockedSkins.push(id);
        this.save();
      }
    },
    recordFruit(name) {
      this.data.stats.totalFruits++;
      this.data.stats.fruitCounts[name] = (this.data.stats.fruitCounts[name] || 0) + 1;
      this.save();
    },
    recordGamePlayed() {
      this.data.stats.gamesPlayed++;
      this.save();
    },
    recordLevel(level) {
      if (level > this.data.stats.highestLevel) {
        this.data.stats.highestLevel = level;
        this.save();
      }
    },
    addPlayTime(seconds) {
      this.data.stats.timePlayed += seconds;
      this.save();
    }
  };
  Storage.load();

  /* ===========================================================
     3. AUDIO ENGINE
     No sound files are used (keeps the game 100% offline &
     dependency-free). Every effect is synthesized in real time
     with the Web Audio API oscillators + a noise buffer.
     =========================================================== */
  const Audio = {
    ctx: null,
    musicTimer: null,
    musicStep: 0,
    musicScale: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25],

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    get sfxEnabled() { return Storage.data.sfxOn; },
    get musicEnabled() { return Storage.data.musicOn; },

    // Plays a simple tone. type = oscillator waveform.
    tone(freq, duration, { type = 'sine', volume = 0.2, glideTo = null, delay = 0 } = {}) {
      if (!this.ctx || !this.sfxEnabled) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    },

    click() { this.tone(440, 0.08, { type: 'square', volume: 0.15 }); },

    // V1.3 §2 — bright little "cha-ching" for collecting a coin.
    coin() {
      this.tone(988, 0.08, { type: 'square', volume: 0.2 });
      this.tone(1318.5, 0.12, { type: 'square', volume: 0.18, delay: 0.05 });
    },

    eat() {
      this.tone(660, 0.12, { type: 'triangle', volume: 0.25 });
      this.tone(880, 0.14, { type: 'triangle', volume: 0.18, delay: 0.06 });
    },

    // V1.2 — happy little two-note chime that pitches up/down slightly
    // depending on which fruit was eaten, so each fruit feels a bit different.
    eatFruit(basePitch = 660) {
      this.tone(basePitch, 0.12, { type: 'triangle', volume: 0.25 });
      this.tone(basePitch * 1.33, 0.14, { type: 'triangle', volume: 0.18, delay: 0.06 });
    },

    levelUp() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.tone(f, 0.16, { type: 'triangle', volume: 0.22, delay: i * 0.09 })
      );
    },

    gameOver() {
      this.tone(392, 0.2, { type: 'sawtooth', volume: 0.2 });
      this.tone(294, 0.25, { type: 'sawtooth', volume: 0.2, delay: 0.18 });
      this.tone(220, 0.35, { type: 'sawtooth', volume: 0.2, delay: 0.36 });
    },

    victory() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        this.tone(f, 0.22, { type: 'triangle', volume: 0.25, delay: i * 0.11 })
      );
    },

    secret() {
      const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
      notes.forEach((f, i) => this.tone(f, 0.25, { type: 'sine', volume: 0.2, delay: i * 0.07 }));
    },

    // Very light ambient "music" — a slow arpeggio loop, gentle and non-annoying.
    startMusic(mood = 'menu') {
      this.stopMusic();
      if (!this.ctx || !this.musicEnabled) return;
      const scale = mood === 'game' ? this.musicScale : this.musicScale.slice(0, 4);
      const stepTime = mood === 'game' ? 520 : 700;
      this.musicStep = 0;
      this.musicTimer = setInterval(() => {
        if (!this.musicEnabled) return;
        const freq = scale[this.musicStep % scale.length];
        this.tone(freq, stepTime / 1000 + 0.1, { type: 'sine', volume: 0.05 });
        this.musicStep++;
      }, stepTime);
    },

    stopMusic() {
      if (this.musicTimer) clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  };

  /* ===========================================================
     4. SCREEN MANAGER
     Handles switching between the app's "pages" (menu, level
     select, settings, credits, game) and the two overlays
     (pause, game over).
     =========================================================== */
  const Screens = {
    all: ['menu', 'levels', 'settings', 'credits', 'game', 'shop', 'achievements', 'stats'],
    show(name) {
      this.all.forEach((s) => $(`screen-${s}`).classList.toggle('active', s === name));
    },
    overlay(name, on) {
      $(`overlay-${name}`).classList.toggle('active', on);
    }
  };

  /* ===========================================================
     5. PARTICLE & CONFETTI SYSTEMS
     A single full-screen canvas (#fx-canvas) is reused for both
     small "fruit eaten" bursts and big confetti celebrations, so
     everything renders above the game without extra DOM nodes.
     =========================================================== */
  const FX = {
    canvas: null,
    ctx: null,
    particles: [],
    floaters: [], // floating "+1" style score text

    init() {
      this.canvas = $('fx-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      requestAnimationFrame(() => this.loop());
    },

    resize() {
      this.canvas.width = window.innerWidth * devicePixelRatio;
      this.canvas.height = window.innerHeight * devicePixelRatio;
      this.canvas.style.width = window.innerWidth + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
    },

    // Small joyful burst when a fruit is eaten (screen-space x/y).
    burst(x, y, colors) {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
        const speed = rand(2, 6) * devicePixelRatio;
        this.particles.push({
          x: x * devicePixelRatio, y: y * devicePixelRatio,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: rand(0.02, 0.035),
          size: rand(3, 7) * devicePixelRatio,
          color: colors[randInt(0, colors.length - 1)],
          shape: Math.random() > 0.5 ? 'circle' : 'square'
        });
      }
    },

    // Big confetti rain for level-ups, victories, and secret mode.
    // V1.2: now accepts an optional custom color palette (default palette unchanged).
    confetti(amount = 120, colors = ['#FF6F61', '#FFD93D', '#6FE08A', '#7FB8F0', '#B983FF', '#FFD700']) {
      for (let i = 0; i < amount; i++) {
        this.particles.push({
          x: rand(0, this.canvas.width),
          y: -20 * devicePixelRatio,
          vx: rand(-1.5, 1.5) * devicePixelRatio,
          vy: rand(2, 5) * devicePixelRatio,
          life: 1, decay: rand(0.004, 0.008),
          size: rand(5, 10) * devicePixelRatio,
          color: colors[randInt(0, colors.length - 1)],
          shape: Math.random() > 0.5 ? 'circle' : 'square',
          spin: rand(-0.2, 0.2), angle: rand(0, Math.PI * 2),
          confetti: true
        });
      }
    },

    // V1.2 §5 — a gentle shower of ⭐ glyphs for the 1000-point milestone.
    starBurst(amount = 30) {
      for (let i = 0; i < amount; i++) {
        this.particles.push({
          x: rand(0, this.canvas.width),
          y: -20 * devicePixelRatio,
          vx: rand(-0.6, 0.6) * devicePixelRatio,
          vy: rand(1.5, 3.5) * devicePixelRatio,
          life: 1, decay: rand(0.006, 0.01),
          size: rand(14, 26) * devicePixelRatio,
          color: '#FFD700',
          shape: 'star',
          spin: rand(-0.15, 0.15), angle: rand(0, Math.PI * 2),
          confetti: true
        });
      }
    },

    floatText(x, y, text, color = '#FFD700') {
      this.floaters.push({
        x: x * devicePixelRatio, y: y * devicePixelRatio,
        text, color, life: 1, decay: 0.012
      });
    },

    loop() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.particles = this.particles.filter((p) => p.life > 0);
      this.particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.confetti) { p.vy += 0.03 * devicePixelRatio; p.angle += p.spin; }
        else { p.vx *= 0.96; p.vy *= 0.96; }
        p.life -= p.decay;
        ctx.save();
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.translate(p.x, p.y);
        if (p.angle) ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'star') {
          ctx.font = `${p.size}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⭐', 0, 0);
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        ctx.restore();
      });

      this.floaters = this.floaters.filter((f) => f.life > 0);
      this.floaters.forEach((f) => {
        f.y -= 1.4 * devicePixelRatio;
        f.life -= f.decay;
        ctx.save();
        ctx.globalAlpha = clamp(f.life, 0, 1);
        ctx.fillStyle = f.color;
        ctx.font = `900 ${22 * devicePixelRatio}px Arial Rounded MT Bold, sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      });

      requestAnimationFrame(() => this.loop());
    }
  };

  /* ===========================================================
     V1.2 — MILESTONE CELEBRATION
     Fires once every 1000 points: gold confetti + star shower +
     a golden glowing banner that disappears after 3 seconds.
     Does not touch the existing secret-NOAH banner/system.
     =========================================================== */
  const Milestone = {
    timer: null,
    show() {
      const banner = $('milestone-banner');
      if (!banner) return; // safety: no-op if markup isn't present
      Audio.levelUp();
      FX.confetti(90, ['#FFD700', '#FFF6C9', '#FFC300', '#FFFFFF']);
      FX.starBurst(36);
      banner.classList.add('show');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => banner.classList.remove('show'), 3000);
    }
  };

  /* ===========================================================
     V1.3 §1 — LEVEL SYSTEM
     Score-based progression, purely additive on top of scoring.
     =========================================================== */
  const LEVEL_THRESHOLDS = [0, 1000, 2500, 5000, 8000]; // index 0 -> Level 1, etc.
  const getLevelForScore = (score) => {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (score >= LEVEL_THRESHOLDS[i]) level = i + 1;
    }
    return level;
  };

  const LevelUp = {
    timer: null,
    show(level) {
      const banner = $('levelup-banner');
      if (!banner) return;
      banner.innerHTML = `🌟 LEVEL UP! <br> Level ${level}`;
      Audio.levelUp();
      FX.confetti(110, ['#FFD700', '#FFF6C9', '#FFC300', '#FFFFFF']);
      FX.starBurst(26);
      banner.classList.add('show');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => banner.classList.remove('show'), 2800);
    }
  };

  /* ===========================================================
     V1.3 §4 — DAILY REWARD
     Grants +20 coins once every 24 hours. Checked once at
     bootstrap; entirely additive, doesn't touch the save loader.
     =========================================================== */
  const DAILY_REWARD_COINS = 20;
  const DAILY_REWARD_MS = 24 * 60 * 60 * 1000;
  const DailyReward = {
    checkAndGrant() {
      const now = Date.now();
      const last = Storage.data.lastDailyReward || 0;
      if (now - last < DAILY_REWARD_MS) return;
      // Streak continues if claimed within a 48h grace window, otherwise resets.
      Storage.data.streak = (last > 0 && now - last <= DAILY_REWARD_MS * 2) ? (Storage.data.streak || 0) + 1 : 1;
      Storage.data.lastDailyReward = now;
      Storage.addCoins(DAILY_REWARD_COINS);
      Storage.save();
      const amountEl = $('daily-reward-amount');
      if (amountEl) amountEl.textContent = `+${DAILY_REWARD_COINS} Coins`;
      const streakEl = $('daily-reward-streak');
      if (streakEl) streakEl.textContent = `🔥 ${Storage.data.streak}-day streak!`;
      Screens.overlay('daily-reward', true);
      Audio.levelUp();
      FX.confetti(80, ['#FFD700', '#FFF6C9', '#FFC300', '#FFFFFF']);
    }
  };

  /* ===========================================================
     V1.3 §3 — CHARACTER SHOP (skin definitions)
     'rainbow' cycles the same rainbow palette already used by
     Secret NOAH Mode; that special mode still overrides everything
     while it's active, exactly as it did in v1.2.
     =========================================================== */
  const SKINS = {
    green:  { name: 'Default Green', cost: 0,   bodyColor: '#5FCB6C', headColor: '#4CAF50', rainbow: false },
    blue:   { name: 'Blue Snake',    cost: 20,  bodyColor: '#7FB8F0', headColor: '#2E6FD9', rainbow: false },
    rainbow:{ name: 'Rainbow Snake', cost: 50,  bodyColor: '#B983FF', headColor: '#B983FF', rainbow: true  },
    golden: { name: 'Golden Snake',  cost: 100, bodyColor: '#FFE066', headColor: '#FFD700', rainbow: false },
    pink:   { name: 'Cute Pink Snake', cost: 150, bodyColor: '#FFAFCC', headColor: '#FF6F91', rainbow: false },
    // Magic Forest Update — themed character skins. Each adds a small emoji
    // "topper" above the head so it reads as a distinct character without
    // needing a whole new sprite-drawing system.
    fox:      { name: 'Fox Snake',      cost: 80,  bodyColor: '#FF9E4F', headColor: '#F97C1D', rainbow: false, topper: '🦊' },
    panda:    { name: 'Panda Snake',    cost: 120, bodyColor: '#F5F5F5', headColor: '#2E2E2E', rainbow: false, topper: '🐼' },
    dragon:   { name: 'Dragon Snake',   cost: 250, bodyColor: '#5FCB6C', headColor: '#2E7D32', rainbow: false, topper: '🐉' },
    dinosaur: { name: 'Dinosaur Snake', cost: 300, bodyColor: '#8BC34A', headColor: '#558B2F', rainbow: false, topper: '🦖' },
    unicorn:  { name: 'Unicorn Snake',  cost: 400, bodyColor: '#FFD1F5', headColor: '#E893F5', rainbow: false, topper: '🦄' }
  };

  /* ===========================================================
     V1.3 §5 — ACHIEVEMENTS
     Each achievement's "done" state is computed live from Storage
     stats/data, so there's nothing extra to keep in sync or save.
     =========================================================== */
  const ACHIEVEMENTS = [
    { id: 'first_fruit', icon: '🍎', title: 'First Fruit', desc: 'Eat your very first fruit',
      done: (d) => d.stats.totalFruits >= 1 },
    { id: 'score_1000', icon: '⭐', title: 'Score 1000', desc: 'Reach 1000 points in one game',
      done: (d) => d.highScore >= 1000 },
    { id: 'score_5000', icon: '🌟', title: 'Score 5000', desc: 'Reach 5000 points in one game',
      done: (d) => d.highScore >= 5000 },
    { id: 'fruits_50', icon: '🍇', title: 'Fruit Fan', desc: 'Collect 50 fruits total',
      done: (d) => d.stats.totalFruits >= 50 },
    { id: 'fruits_100', icon: '🍉', title: 'Fruit Master', desc: 'Collect 100 fruits total',
      done: (d) => d.stats.totalFruits >= 100 },
    { id: 'games_10', icon: '🎮', title: 'Dedicated Player', desc: 'Play 10 games',
      done: (d) => d.stats.gamesPlayed >= 10 },
    { id: 'rainbow_unlocked', icon: '🐍', title: 'Unlock Rainbow Snake', desc: 'Unlock the Rainbow Snake skin',
      done: (d) => d.unlockedSkins.includes('rainbow') },
    // Magic Forest Update — new achievements
    { id: 'first_coin', icon: '🪙', title: 'First Coin', desc: 'Collect your very first coin',
      done: (d) => d.stats.totalCoinsEarned >= 1 },
    { id: 'first_skin', icon: '🛍️', title: 'First Skin', desc: 'Unlock any snake skin from the shop',
      done: (d) => d.unlockedSkins.length > 1 },
    { id: 'fruits_500', icon: '🍑', title: 'Fruit Legend', desc: 'Collect 500 fruits total',
      done: (d) => d.stats.totalFruits >= 500 },
    { id: 'games_50', icon: '🏅', title: 'Snake Champion', desc: 'Play 50 games',
      done: (d) => d.stats.gamesPlayed >= 50 }
  ];

  /* ===========================================================
     6. THE GAME  (Snake + Food + Loop)
     =========================================================== */
  // V1.2 — Better Food System: 6 fruits, each with its own point
  // value and a slightly different "happy" pitch for its eat sound.
  const FOODS = [
    { name: 'apple',      emoji: '🍎', color: '#FF6F61', points: 100, pitch: 660 },
    { name: 'banana',     emoji: '🍌', color: '#FFD93D', points: 150, pitch: 600 },
    { name: 'strawberry', emoji: '🍓', color: '#FF4D6D', points: 200, pitch: 700 },
    { name: 'grapes',     emoji: '🍇', color: '#B983FF', points: 250, pitch: 740 },
    { name: 'watermelon', emoji: '🍉', color: '#FF6F91', points: 300, pitch: 620 },
    { name: 'pineapple',  emoji: '🍍', color: '#FFC93C', points: 500, pitch: 820 },
    // Magic Forest Update — 5 new fruits, none of the originals removed
    { name: 'orange',     emoji: '🍊', color: '#FFA23E', points: 200, pitch: 680 },
    { name: 'kiwi',       emoji: '🥝', color: '#8BC34A', points: 350, pitch: 760 },
    { name: 'cherry',     emoji: '🍒', color: '#E0344C', points: 120, pitch: 640 },
    { name: 'blueberry',  emoji: '🫐', color: '#5B7FDB', points: 280, pitch: 700 },
    { name: 'peach',      emoji: '🍑', color: '#FFB199', points: 220, pitch: 660 }
  ];

  // Step timing (ms between grid moves) — higher = slower snake.
  // Speeds reduced ~37.5% from the original values (multiplied by 1.6)
  // so the game feels noticeably easier for a young child while
  // keeping movement perfectly smooth (same interpolation logic).
  const LEVELS = {
    easy:   { stepMs: 288, label: 'Easy' },
    normal: { stepMs: 208, label: 'Normal' },
    hard:   { stepMs: 144, label: 'Hard' }
  };

  const GRID_SIZE = 18; // number of cells per row/column (square grid)

  const Game = {
    canvas: null, ctx: null,
    cell: 20,
    snake: [], dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
    food: null,
    score: 0,
    difficulty: 'normal',
    stepMs: 130,
    acc: 0, lastTime: 0,
    running: false, paused: false,
    rafId: null,
    glowFrames: 0, // brief golden glow after eating
    shakeFrames: 0,
    secretMode: false,
    secretBuffer: '',
    foodsEaten: 0, // raw count of food eaten, independent of score value
    level: 1, // V1.3 §1
    coin: null, // V1.3 §2 — current coin on the board, or null
    sessionSeconds: 0, // V1.3 §6 — playtime accumulated this game, flushed on stop
    coinsThisGame: 0, // Magic Forest Update — for the improved Game Over screen
    achievementsAtStart: 0, // snapshot to detect newly-unlocked achievements

    init() {
      this.canvas = $('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    },

    resizeCanvas() {
      // Keep the play field a responsive square that fits the viewport.
      const maxW = window.innerWidth * 0.94;
      const maxH = window.innerHeight * 0.78;
      const size = Math.floor(Math.min(maxW, maxH, 640) / GRID_SIZE) * GRID_SIZE;
      this.cell = size / GRID_SIZE;
      this.canvas.width = size * devicePixelRatio;
      this.canvas.height = size * devicePixelRatio;
      this.canvas.style.width = size + 'px';
      this.canvas.style.height = size + 'px';
      this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    },

    start(difficulty) {
      this.difficulty = difficulty;
      Storage.set('lastDifficulty', difficulty);
      this.stepMs = LEVELS[difficulty].stepMs;
      const mid = Math.floor(GRID_SIZE / 2);
      this.snake = [{ x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid }];
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.score = 0;
      this.foodsEaten = 0;
      this.level = 1;
      this.coin = null;
      this.sessionSeconds = 0;
      this.coinsThisGame = 0;
      this.achievementsAtStart = ACHIEVEMENTS.filter((a) => a.done(Storage.data)).length;
      this.secretMode = false;
      this.secretBuffer = '';
      $('secret-banner').classList.remove('show');
      this.glowFrames = 0;
      this.shakeFrames = 0;
      this.placeFood();
      this.updateHud();
      Storage.recordGamePlayed(); // V1.3 §6
      this.paused = false;
      this.running = false; // becomes true after countdown
      this.runCountdown();
    },

    runCountdown() {
      const overlay = $('countdown-overlay');
      const numEl = $('countdown-number');
      const wrap = $('game-canvas-wrap');
      overlay.classList.add('active');
      // Magic Forest Update — brief camera zoom-in as the map appears
      if (wrap) {
        wrap.classList.add('map-zoom-in');
        setTimeout(() => wrap.classList.remove('map-zoom-in'), 900);
      }
      let n = 3;
      numEl.textContent = n;
      Audio.click();
      const tick = () => {
        n--;
        if (n > 0) {
          numEl.textContent = n;
          Audio.click();
          setTimeout(tick, 700);
        } else {
          numEl.textContent = 'GO!';
          Audio.levelUp();
          setTimeout(() => {
            overlay.classList.remove('active');
            this.running = true;
            this.lastTime = performance.now();
            this.acc = 0;
            this.loop(this.lastTime);
          }, 500);
        }
      };
      setTimeout(tick, 700);
    },

    placeFood() {
      let pos;
      do {
        pos = { x: randInt(0, GRID_SIZE - 1), y: randInt(0, GRID_SIZE - 1) };
      } while (this.snake.some((s) => s.x === pos.x && s.y === pos.y));
      const kind = FOODS[randInt(0, FOODS.length - 1)];
      this.food = { ...pos, ...kind, bounce: 0 };
    },

    setDirection(x, y) {
      // prevent reversing directly into the snake's own neck
      if (this.snake.length > 1 && x === -this.dir.x && y === -this.dir.y) return;
      this.nextDir = { x, y };
    },

    loop(time) {
      if (!this.running) return;
      this.rafId = requestAnimationFrame((t) => this.loop(t));
      const delta = time - this.lastTime;
      this.lastTime = time;
      if (this.paused) return;

      this.acc += delta;
      while (this.acc >= this.stepMs) {
        this.tick();
        this.acc -= this.stepMs;
      }
      this.render();
    },

    tick() {
      this.sessionSeconds += this.stepMs / 1000; // V1.3 §6 — playtime tracking

      this.dir = this.nextDir;
      const head = this.snake[0];
      const newHead = { x: head.x + this.dir.x, y: head.y + this.dir.y };

      // Screen wrapping: leaving one edge brings the snake back on the
      // opposite edge instead of ending the game.
      // Right -> Left, Left -> Right, Top -> Bottom, Bottom -> Top.
      newHead.x = (newHead.x + GRID_SIZE) % GRID_SIZE;
      newHead.y = (newHead.y + GRID_SIZE) % GRID_SIZE;

      // Self collision
      if (this.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        return this.endGame();
      }

      this.snake.unshift(newHead);

      // V1.3 §2 — coin collision (checked separately from food)
      if (this.coin && newHead.x === this.coin.x && newHead.y === this.coin.y) {
        this.collectCoin();
      }

      if (newHead.x === this.food.x && newHead.y === this.food.y) {
        this.eatFood();
      } else {
        this.snake.pop();
      }
    },

    eatFood() {
      const points = this.food.points || 100;
      const eatenName = this.food.name || 'apple';
      const previousScore = this.score;
      this.score += points; // V1.2 — each fruit is worth its own point value
      this.foodsEaten++;
      this.glowFrames = 10;
      Audio.eatFruit(this.food.pitch || 660);
      Storage.recordFruit(eatenName); // V1.3 §6
      this.updateHud();

      // Screen-space position of the food for particle/floater placement
      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.food.x + 0.5) * this.cell;
      const py = rect.top + (this.food.y + 0.5) * this.cell;
      FX.burst(px, py, [this.food.color, '#FFD700', '#FFFFFF']);
      FX.floatText(px, py, `+${points}`, this.food.color);

      // Level-up celebration every 5 fruits (based on fruit count, not points)
      if (this.foodsEaten % 5 === 0) {
        Audio.levelUp();
        FX.confetti(60);
      }

      // V1.2 §5 — big "AMAZING NOAH" celebration every 1000 points
      if (Math.floor(this.score / 1000) > Math.floor(previousScore / 1000)) {
        Milestone.show();
      }

      // V1.3 §1 — level progression, based on the real-money score thresholds
      const newLevel = getLevelForScore(this.score);
      if (newLevel > this.level) {
        this.level = newLevel;
        LevelUp.show(newLevel);
        Storage.recordLevel(newLevel);
      }

      this.placeFood();
      this.maybeSpawnCoin(); // V1.3 §2

      const best = Math.max(Storage.data.highScore, this.score);
      if (best > Storage.data.highScore) Storage.set('highScore', best);
    },

    // V1.3 §2 — coin spawning & collection
    maybeSpawnCoin() {
      if (this.coin) return; // only one coin on the board at a time
      if (Math.random() < 0.35) this.placeCoin();
    },

    placeCoin() {
      let pos, tries = 0;
      do {
        pos = { x: randInt(0, GRID_SIZE - 1), y: randInt(0, GRID_SIZE - 1) };
        tries++;
      } while (tries < 50 && (
        this.snake.some((s) => s.x === pos.x && s.y === pos.y) ||
        (this.food && this.food.x === pos.x && this.food.y === pos.y)
      ));
      this.coin = { ...pos, bounce: 0 };
    },

    collectCoin() {
      this.coin = null;
      Storage.addCoins(1);
      this.coinsThisGame++;
      Audio.coin();
      this.updateHud();
      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.snake[0].x + 0.5) * this.cell;
      const py = rect.top + (this.snake[0].y + 0.5) * this.cell;
      FX.burst(px, py, ['#FFD700', '#FFF6C9', '#FFFFFF']);
      FX.floatText(px, py, '+1 🪙', '#FFD700');
    },

    triggerSecretMode() {
      if (this.secretMode) return;
      this.secretMode = true;
      Audio.secret();
      FX.confetti(160);
      const banner = $('secret-banner');
      banner.classList.add('show');
      setTimeout(() => banner.classList.remove('show'), 3200);
      Storage.unlockReward('golden-snake');
    },

    endGame() {
      this.running = false;
      cancelAnimationFrame(this.rafId);
      Audio.gameOver();
      this.shakeFrames = 14;
      Storage.set('highScore', Math.max(Storage.data.highScore, this.score));
      Storage.addPlayTime(Math.round(this.sessionSeconds)); // V1.3 §6
      this.sessionSeconds = 0;
      setTimeout(() => UI.showGameOver(), 260);
    },

    /* ---------- Rendering ---------- */
    render() {
      const ctx = this.ctx;
      const size = this.canvas.width / devicePixelRatio;
      ctx.clearRect(0, 0, size, size);

      // Screen shake offset
      let shakeX = 0, shakeY = 0;
      if (this.shakeFrames > 0) {
        shakeX = rand(-4, 4);
        shakeY = rand(-4, 4);
        this.shakeFrames--;
      }
      ctx.save();
      ctx.translate(shakeX, shakeY);

      this.drawBoard(ctx, size);
      if (this.coin) this.drawCoin(ctx); // V1.3 §2
      this.drawFood(ctx);
      this.drawSnake(ctx);

      ctx.restore();
    },

    drawBoard(ctx, size) {
      // Soft two-tone checker pattern like a garden patch
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#A9E38F' : '#9FDB83';
          ctx.fillRect(x * this.cell, y * this.cell, this.cell, this.cell);
        }
      }
    },

    // V1.3 §2 — a small bouncing golden coin, drawn the same lightweight way as food
    drawCoin(ctx) {
      const c = this.coin;
      c.bounce = (c.bounce + 0.18) % (Math.PI * 2);
      const bounceOffset = Math.sin(c.bounce) * 3;
      const cx = c.x * this.cell + this.cell / 2;
      const cy = c.y * this.cell + this.cell / 2 + bounceOffset;

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, c.y * this.cell + this.cell * 0.85, this.cell * 0.24, this.cell * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 16;
      ctx.font = `${this.cell * 0.7}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪙', cx, cy);
      ctx.restore();
    },

    drawFood(ctx) {
      const f = this.food;
      f.bounce = (f.bounce + 0.15) % (Math.PI * 2);
      const bounceOffset = Math.sin(f.bounce) * 3;
      const cx = f.x * this.cell + this.cell / 2;
      const cy = f.y * this.cell + this.cell / 2 + bounceOffset;

      // Shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, f.y * this.cell + this.cell * 0.85, this.cell * 0.28, this.cell * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Glow (V1.2: added a gentle "cute" pulse on top of the existing bounce)
      ctx.save();
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 16;
      const pulse = 1 + Math.sin(f.bounce * 2) * 0.06;
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.font = `${this.cell * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.emoji, 0, 0);
      ctx.restore();
    },

    drawSnake(ctx) {
      const rainbow = ['#FF6F61', '#FFD93D', '#6FE08A', '#7FB8F0', '#B983FF'];
      this.snake.forEach((seg, i) => {
        const cx = seg.x * this.cell + this.cell / 2;
        const cy = seg.y * this.cell + this.cell / 2;
        const isHead = i === 0;
        const radius = isHead ? this.cell * 0.48 : this.cell * 0.42 * (1 - i / (this.snake.length * 2.2));

        let bodyColor;
        const skin = SKINS[Storage.data.currentSkin] || SKINS.green; // V1.3 §3
        if (this.secretMode) {
          bodyColor = rainbow[i % rainbow.length];
        } else if (this.glowFrames > 0) {
          bodyColor = '#FFD700';
        } else if (skin.rainbow) {
          bodyColor = rainbow[i % rainbow.length];
        } else {
          bodyColor = isHead ? skin.headColor : skin.bodyColor;
        }

        ctx.save();
        if (this.glowFrames > 0 || this.secretMode) {
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 16;
        }
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(radius, 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (isHead) {
          this.drawFace(ctx, cx, cy);
          // Magic Forest Update — themed skin topper (fox/panda/dragon/dino/unicorn)
          if (skin.topper && !this.secretMode) {
            ctx.save();
            ctx.font = `${this.cell * 0.55}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(skin.topper, cx, cy - this.cell * 0.55);
            ctx.restore();
          }
        }
      });

      if (this.glowFrames > 0) this.glowFrames--;
    },

    drawFace(ctx, cx, cy) {
      const eyeOffsetX = this.dir.x !== 0 ? this.dir.x * this.cell * 0.16 : this.cell * 0.16;
      const eyeOffsetY = this.dir.y !== 0 ? this.dir.y * this.cell * 0.16 : -this.cell * 0.12;
      const eyeSize = this.cell * 0.11;

      // Blink cycle: eyes close briefly every ~3 seconds
      const blinking = Math.floor(performance.now() / 180) % 26 === 0;

      [-1, 1].forEach((side) => {
        const perpX = this.dir.y !== 0 ? side * this.cell * 0.14 : 0;
        const perpY = this.dir.x !== 0 ? side * this.cell * 0.14 : 0;
        const ex = cx + eyeOffsetX + perpX;
        const ey = cy + eyeOffsetY + perpY;

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        if (blinking) {
          ctx.ellipse(ex, ey, eyeSize, eyeSize * 0.15, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2);
        }
        ctx.fill();

        if (!blinking) {
          ctx.fillStyle = '#233';
          ctx.beginPath();
          ctx.arc(ex + this.dir.x * eyeSize * 0.3, ey + this.dir.y * eyeSize * 0.3, eyeSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // V1.2 §4 — tiny smile, always facing the current direction of travel
      const angle = Math.atan2(this.dir.y, this.dir.x);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(30, 60, 40, 0.55)';
      ctx.lineWidth = Math.max(1, this.cell * 0.045);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(this.cell * 0.06, this.cell * 0.05, this.cell * 0.14, -0.25, 0.85);
      ctx.stroke();
      ctx.restore();
    },

    updateHud() {
      $('hud-score').textContent = this.score;
      $('hud-best').textContent = Storage.data.highScore;
      $('menu-high-score').textContent = Storage.data.highScore;
      const levelEl = $('hud-level');
      if (levelEl) levelEl.textContent = this.level; // V1.3 §1
      const coinsEl = $('hud-coins');
      if (coinsEl) coinsEl.textContent = Storage.data.coins; // V1.3 §2
    },

    pause() {
      this.paused = true;
      Audio.stopMusic();
    },
    resume() {
      this.paused = false;
      this.lastTime = performance.now();
      Audio.startMusic('game');
    },
    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      Audio.stopMusic();
      if (this.sessionSeconds > 0) { // V1.3 §6 — safety flush if quitting via pause/menu
        Storage.addPlayTime(Math.round(this.sessionSeconds));
        this.sessionSeconds = 0;
      }
    }
  };

  /* ===========================================================
     7. INPUT HANDLING
     Keyboard (arrows + WASD), touch buttons, swipe gestures,
     and the secret "N-O-A-H" code detector.
     =========================================================== */
  const Input = {
    init() {
      window.addEventListener('keydown', (e) => this.onKey(e));
      document.querySelectorAll('.touch-btn').forEach((btn) => {
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.dirFromName(btn.dataset.dir);
        }, { passive: false });
        btn.addEventListener('click', () => this.dirFromName(btn.dataset.dir));
      });
      this.initSwipe();
    },

    dirFromName(name) {
      Audio.resume();
      const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const [x, y] = map[name];
      if (Game.running && !Game.paused) Game.setDirection(x, y);
    },

    onKey(e) {
      const key = e.key;

      // Secret code buffer works any time during gameplay
      if (Game.running) {
        const letter = key.length === 1 ? key.toUpperCase() : '';
        if (letter && 'NOAH'.includes(letter)) {
          Game.secretBuffer += letter;
          if (Game.secretBuffer.length > 4) Game.secretBuffer = Game.secretBuffer.slice(-4);
          if (Game.secretBuffer === 'NOAH') Game.triggerSecretMode();
        } else if (letter) {
          Game.secretBuffer = '';
        }
      }

      const moveMap = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0]
      };
      if (moveMap[key] && Game.running && !Game.paused) {
        Audio.resume();
        Game.setDirection(...moveMap[key]);
        e.preventDefault();
      }
      if (key === 'Escape' && Game.running) {
        UI.togglePause();
      }
    },

    initSwipe() {
      let sx = 0, sy = 0;
      const wrap = $('screen-game');
      wrap.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        sx = t.clientX; sy = t.clientY;
      }, { passive: true });
      wrap.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return; // tap, not swipe
        if (!Game.running || Game.paused) return;
        Audio.resume();
        if (Math.abs(dx) > Math.abs(dy)) Game.setDirection(dx > 0 ? 1 : -1, 0);
        else Game.setDirection(0, dy > 0 ? 1 : -1);
      }, { passive: true });
    }
  };

  /* ===========================================================
     8. UI WIRING
     Connects buttons to Screens / Game / Audio / Storage.
     =========================================================== */
  const UI = {
    init() {
      $('menu-high-score').textContent = Storage.data.highScore;
      $('toggle-sfx').checked = Storage.data.sfxOn;
      $('toggle-music').checked = Storage.data.musicOn;
      $('toggle-motion').checked = Storage.data.reducedMotion;
      document.body.classList.toggle('reduced-motion', Storage.data.reducedMotion);
      this.updateSoundIcon();
      this.refreshProfile(); // Magic Forest Update

      $('btn-play').addEventListener('click', () => {
        Audio.init(); Audio.resume(); Audio.click();
        Screens.show('levels');
      });
      $('btn-settings').addEventListener('click', () => { Audio.click(); Screens.show('settings'); });
      $('btn-credits').addEventListener('click', () => { Audio.click(); Screens.show('credits'); });
      $('btn-levels-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-settings-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-credits-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });

      // V1.3 — Shop / Achievements / Stats menu buttons
      $('btn-shop').addEventListener('click', () => { Audio.click(); this.renderShop(); Screens.show('shop'); });
      $('btn-shop-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-achievements').addEventListener('click', () => { Audio.click(); this.renderAchievements(); Screens.show('achievements'); });
      $('btn-achievements-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-stats').addEventListener('click', () => { Audio.click(); this.renderStats(); Screens.show('stats'); });
      $('btn-stats-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-daily-reward-close').addEventListener('click', () => { Audio.click(); Screens.overlay('daily-reward', false); });

      $('btn-sound-toggle').addEventListener('click', () => {
        Audio.init();
        const on = !Storage.data.sfxOn || !Storage.data.musicOn ? true : false;
        Storage.set('sfxOn', on);
        Storage.set('musicOn', on);
        $('toggle-sfx').checked = on;
        $('toggle-music').checked = on;
        this.updateSoundIcon();
        Audio.click();
      });

      document.querySelectorAll('.level-card').forEach((card) => {
        card.addEventListener('click', () => {
          Audio.init(); Audio.resume(); Audio.click();
          this.startGame(card.dataset.level);
        });
      });

      $('toggle-sfx').addEventListener('change', (e) => {
        Storage.set('sfxOn', e.target.checked);
        this.updateSoundIcon();
      });
      $('toggle-music').addEventListener('change', (e) => {
        Storage.set('musicOn', e.target.checked);
        this.updateSoundIcon();
        if (!e.target.checked) Audio.stopMusic();
        else if (Game.running) Audio.startMusic('game');
      });
      $('toggle-motion').addEventListener('change', (e) => {
        Storage.set('reducedMotion', e.target.checked);
        document.body.classList.toggle('reduced-motion', e.target.checked);
      });
      $('btn-reset-score').addEventListener('click', () => {
        Storage.set('highScore', 0);
        Game.updateHud();
        Audio.click();
      });

      $('btn-pause').addEventListener('click', () => this.togglePause());
      $('btn-resume').addEventListener('click', () => { Audio.click(); this.togglePause(); });
      $('btn-restart').addEventListener('click', () => {
        Audio.click();
        Screens.overlay('pause', false);
        this.startGame(Game.difficulty);
      });
      $('btn-pause-menu').addEventListener('click', () => this.goToMenu());

      $('btn-play-again').addEventListener('click', () => {
        Audio.click();
        Screens.overlay('gameover', false);
        this.startGame(Game.difficulty);
      });
      $('btn-gameover-menu').addEventListener('click', () => this.goToMenu());
    },

    updateSoundIcon() {
      const on = Storage.data.sfxOn || Storage.data.musicOn;
      $('sound-icon').textContent = on ? '🔊' : '🔇';
    },

    // Magic Forest Update — Player Profile card (uses lifetime stats, since
    // "current level" outside an active game means the highest level reached).
    refreshProfile() {
      const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      setText('profile-level', Storage.data.stats.highestLevel);
      setText('profile-best', Storage.data.highScore);
      setText('profile-coins', Storage.data.coins);
      setText('profile-streak', Storage.data.streak || 0);
    },

    startGame(level) {
      Screens.show('game');
      Game.start(level);
      if (Storage.data.musicOn) {
        setTimeout(() => Audio.startMusic('game'), 1900);
      }
    },

    togglePause() {
      if (!Game.running) return;
      const willPause = !Game.paused;
      Screens.overlay('pause', willPause);
      if (willPause) Game.pause(); else Game.resume();
    },

    showGameOver() {
      Game.stop();
      $('final-score').textContent = Game.score;
      $('final-best').textContent = Storage.data.highScore;
      const isRecord = Game.score > 0 && Game.score >= Storage.data.highScore;
      $('new-record-msg').classList.toggle('show', isRecord);
      if (isRecord) { FX.confetti(140); Audio.victory(); }

      // Magic Forest Update — richer Game Over summary
      const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      setText('final-coins', Game.coinsThisGame);
      setText('final-fruits', Game.foodsEaten);
      const achievementsNow = ACHIEVEMENTS.filter((a) => a.done(Storage.data)).length;
      const newlyUnlocked = Math.max(0, achievementsNow - Game.achievementsAtStart);
      setText('final-achievements', newlyUnlocked);

      Screens.overlay('gameover', true);
    },

    goToMenu() {
      Audio.click();
      Game.stop();
      Screens.overlay('pause', false);
      Screens.overlay('gameover', false);
      Game.updateHud();
      this.refreshProfile(); // Magic Forest Update
      Screens.show('menu');
      Audio.startMusic('menu');
    },

    // ---------- V1.3 §3 — Character Shop ----------
    renderShop() {
      const grid = $('shop-grid');
      if (!grid) return;
      grid.innerHTML = '';
      Object.keys(SKINS).forEach((id) => {
        const skin = SKINS[id];
        const owned = Storage.data.unlockedSkins.includes(id);
        const equipped = Storage.data.currentSkin === id;
        const card = document.createElement('div');
        card.className = 'shop-card';
        const preview = skin.rainbow
          ? 'linear-gradient(90deg, #FF6F61, #FFD93D, #6FE08A, #7FB8F0, #B983FF)'
          : `linear-gradient(160deg, ${skin.headColor}, ${skin.bodyColor})`;
        card.innerHTML = `
          <div class="shop-preview" style="background:${preview}"></div>
          <span class="shop-skin-name">${skin.name}</span>
          <span class="shop-skin-cost">${skin.cost === 0 ? 'Free' : `🪙 ${skin.cost}`}</span>
          <button class="btn ${equipped ? 'btn-secondary' : 'btn-primary'} shop-action">
            ${equipped ? '✔️ Equipped' : (owned ? 'Equip' : 'Buy')}
          </button>
        `;
        card.querySelector('.shop-action').addEventListener('click', () => {
          Audio.click();
          if (Storage.data.currentSkin === id) return; // already equipped
          if (Storage.data.unlockedSkins.includes(id)) {
            Storage.set('currentSkin', id);
          } else if (Storage.spendCoins(skin.cost)) {
            Storage.unlockSkin(id);
            Storage.set('currentSkin', id);
            FX.confetti(60);
          } else {
            return; // not enough coins — silently no-op, balance shown updates nothing
          }
          this.renderShop();
        });
        grid.appendChild(card);
      });
      const balanceEl = $('shop-coin-balance');
      if (balanceEl) balanceEl.textContent = Storage.data.coins;
    },

    // ---------- V1.3 §5 — Achievements ----------
    renderAchievements() {
      const list = $('achievements-list');
      if (!list) return;
      list.innerHTML = '';
      ACHIEVEMENTS.forEach((a) => {
        const done = a.done(Storage.data);
        const item = document.createElement('div');
        item.className = 'achievement-item' + (done ? ' done' : '');
        item.innerHTML = `
          <span class="achievement-icon">${done ? a.icon : '🔒'}</span>
          <span class="achievement-text">
            <strong>${a.title}</strong>
            <small>${a.desc}</small>
          </span>
          <span class="achievement-state">${done ? '✅' : ''}</span>
        `;
        list.appendChild(item);
      });
    },

    // ---------- V1.3 §6 — Statistics ----------
    renderStats() {
      const s = Storage.data.stats;
      const favorite = Object.keys(s.fruitCounts).length
        ? Object.keys(s.fruitCounts).reduce((a, b) => (s.fruitCounts[a] >= s.fruitCounts[b] ? a : b))
        : '—';
      const minutes = Math.floor(s.timePlayed / 60);
      const seconds = s.timePlayed % 60;
      const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      setText('stat-best-score', Storage.data.highScore);
      setText('stat-games-played', s.gamesPlayed);
      setText('stat-total-fruits', s.totalFruits);
      setText('stat-total-coins', Storage.data.coins);
      setText('stat-highest-level', s.highestLevel);
      setText('stat-favorite-fruit', favorite);
      setText('stat-time-played', `${minutes}m ${seconds}s`);
    }
  };

  /* ===========================================================
     BOOTSTRAP
     =========================================================== */
  window.addEventListener('DOMContentLoaded', () => {
    FX.init();
    Game.init();
    Input.init();
    UI.init();
    Screens.show('menu');
    DailyReward.checkAndGrant(); // V1.3 §4
    UI.refreshProfile(); // Magic Forest Update — pick up any coins/streak just granted

    // Start ambient menu music on first user interaction
    // (browsers block audio until a gesture happens).
    const unlockAudio = () => {
      Audio.init();
      Audio.resume();
      if (Storage.data.musicOn) Audio.startMusic('menu');
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
  });
})();
