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
      xp: 0, // v1.4 — Adventure Expansion: separate XP pool
      completedMissions: [], // v1.4 — mission ids already claimed (one-time rewards)
      bestCombo: 0, // v1.4 — highest combo streak ever reached
      // v1.5 additions — all new fields, fully backward compatible
      unlockedPets: ['fox'],
      currentPet: 'fox',
      collectibles: { star: 0, crystal: 0, leaf: 0, key: 0, egg: 0 },
      collectibleSetsCompleted: [],
      accessibility: { largeUI: false, colorFriendly: false, highContrast: false, bigButtons: false },
      tutorialSeen: false,
      dailyQuest: { date: 0, progress: 0, claimed: false },
      weeklyQuest: { weekStart: 0, progress: 0, claimed: false },
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
        this.data.collectibles = { ...this.defaults.collectibles, ...(parsed.collectibles || {}) };
        this.data.accessibility = { ...this.defaults.accessibility, ...(parsed.accessibility || {}) };
        this.data.dailyQuest = { ...this.defaults.dailyQuest, ...(parsed.dailyQuest || {}) };
        this.data.weeklyQuest = { ...this.defaults.weeklyQuest, ...(parsed.weeklyQuest || {}) };
        if (!Array.isArray(this.data.unlockedSkins)) this.data.unlockedSkins = ['green'];
        if (!this.data.unlockedSkins.includes('green')) this.data.unlockedSkins.push('green');
        if (!Array.isArray(this.data.completedMissions)) this.data.completedMissions = [];
        if (!Array.isArray(this.data.unlockedPets)) this.data.unlockedPets = ['fox'];
        if (!Array.isArray(this.data.collectibleSetsCompleted)) this.data.collectibleSetsCompleted = [];
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
    },

    // ---------- v1.4 helpers ----------
    addXp(amount) {
      this.data.xp += amount;
      this.save();
    },
    completeMission(id) {
      if (!this.data.completedMissions.includes(id)) {
        this.data.completedMissions.push(id);
        this.save();
        return true; // newly completed
      }
      return false; // already claimed before
    },
    recordCombo(comboCount) {
      if (comboCount > this.data.bestCombo) {
        this.data.bestCombo = comboCount;
        this.save();
      }
    },

    // ---------- v1.5 helpers ----------
    unlockPet(id) {
      if (!this.data.unlockedPets.includes(id)) {
        this.data.unlockedPets.push(id);
        this.save();
      }
    },
    addCollectible(type) {
      if (!(type in this.data.collectibles)) this.data.collectibles[type] = 0;
      this.data.collectibles[type]++;
      this.save();
    },
    completeCollectibleSet(type) {
      if (!this.data.collectibleSetsCompleted.includes(type)) {
        this.data.collectibleSetsCompleted.push(type);
        this.save();
        return true;
      }
      return false;
    },
    setAccessibility(key, value) {
      this.data.accessibility[key] = value;
      this.save();
    },
    // Returns today's date as a simple YYYY-MM-DD-ish integer for day-boundary comparisons
    todayKey() {
      const d = new Date();
      return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    },
    weekKey() {
      // Number of full weeks since epoch — changes once every 7 days
      return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
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

    // Visual Evolution §11 — a bright little fanfare for unlocking an achievement.
    achievement() {
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) =>
        this.tone(f, 0.16, { type: 'triangle', volume: 0.2, delay: i * 0.08 })
      );
    },

    // v1.4 §7 — combo callout, pitch rises a little with each threshold
    combo(comboCount) {
      const base = 700 + Math.min(comboCount, 10) * 40;
      this.tone(base, 0.1, { type: 'square', volume: 0.22 });
      this.tone(base * 1.5, 0.14, { type: 'square', volume: 0.18, delay: 0.06 });
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
    all: ['menu', 'levels', 'settings', 'credits', 'game', 'shop', 'achievements', 'stats', 'missions', 'worldmap'],
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
  // Visual Evolution — a very brief, gentle full-screen flash used for big
  // celebrations (milestones, level-ups). Non-disruptive: short, low-opacity,
  // and skipped automatically under reduced-motion (handled by existing CSS rule).
  const flashScreen = () => {
    const el = $('screen-flash');
    if (!el) return;
    el.classList.remove('flash');
    // force reflow so the animation can restart if triggered again quickly
    void el.offsetWidth;
    el.classList.add('flash');
  };

  /* ===========================================================
     V1.4 §5 — WORLD EVENTS
     Random, purely-decorative background flourishes during gameplay.
     Triggered occasionally from the existing game tick — no extra
     timers/loops are created.
     =========================================================== */
  const WorldEvents = {
    types: ['rainbow', 'shootingStar', 'petals', 'wind'],
    trigger() {
      if (Storage.data.reducedMotion) return; // keep things calm if the player prefers less motion
      const type = this.types[randInt(0, this.types.length - 1)];
      const banner = $('worldevent-banner');
      switch (type) {
        case 'rainbow':
          if (banner) { banner.textContent = '🌈'; banner.classList.add('show'); setTimeout(() => banner.classList.remove('show'), 4000); }
          break;
        case 'shootingStar':
          FX.starBurst(4);
          break;
        case 'petals':
          FX.confetti(8, ['#FFAFCC', '#FFD1F5', '#FFFFFF']);
          break;
        case 'wind':
          FX.confetti(6, ['#E4EFFF', '#FFFFFF']);
          break;
      }
    }
  };

  /* ===========================================================
     V1.5 §2 — Daily/Weekly Quest lifecycle helper
     =========================================================== */
  const Quests = {
    checkReset() {
      const today = Storage.todayKey();
      if (Storage.data.dailyQuest.date !== today) {
        Storage.data.dailyQuest = { date: today, progress: 0, claimed: false };
        Storage.save();
      }
      const week = Storage.weekKey();
      if (Storage.data.weeklyQuest.weekStart !== week) {
        Storage.data.weeklyQuest = { weekStart: week, progress: 0, claimed: false };
        Storage.save();
      }
    },
    addDailyProgress(n) {
      this.checkReset();
      if (Storage.data.dailyQuest.claimed) return;
      Storage.data.dailyQuest.progress += n;
      if (Storage.data.dailyQuest.progress >= DAILY_QUEST.target) this.claimDaily();
      Storage.save();
    },
    claimDaily() {
      if (Storage.data.dailyQuest.claimed) return;
      Storage.data.dailyQuest.claimed = true;
      Storage.addCoins(DAILY_QUEST.reward.coins);
      Storage.addXp(DAILY_QUEST.reward.xp);
      if (typeof Game !== 'undefined' && Game.xpThisGame !== undefined) Game.xpThisGame += DAILY_QUEST.reward.xp;
      Audio.achievement();
      FX.confetti(70, ['#FFD700', '#6FE08A']);
    },
    addWeeklyProgress(n) {
      this.checkReset();
      if (Storage.data.weeklyQuest.claimed) return;
      Storage.data.weeklyQuest.progress += n;
      if (Storage.data.weeklyQuest.progress >= WEEKLY_QUEST.target) this.claimWeekly();
      Storage.save();
    },
    claimWeekly() {
      if (Storage.data.weeklyQuest.claimed) return;
      Storage.data.weeklyQuest.claimed = true;
      Storage.addCoins(WEEKLY_QUEST.reward.coins);
      Storage.addXp(WEEKLY_QUEST.reward.xp);
      Audio.achievement();
      FX.confetti(100, ['#FFD700', '#B983FF']);
    }
  };

  const Milestone = {
    timer: null,
    show() {
      const banner = $('milestone-banner');
      if (!banner) return; // safety: no-op if markup isn't present
      Audio.levelUp();
      FX.confetti(90, ['#FFD700', '#FFF6C9', '#FFC300', '#FFFFFF']);
      FX.starBurst(36);
      flashScreen(); // Visual Evolution §9
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
      banner.innerHTML = `🌟 LEVEL UP! <br> Congratulations Noah! <br> Level ${level}`;
      Audio.levelUp();
      FX.confetti(110, ['#FFD700', '#FFF6C9', '#FFC300', '#FFFFFF']);
      FX.starBurst(26);
      setTimeout(() => FX.starBurst(20), 220); // Visual Evolution — a second burst for a "fireworks" feel
      flashScreen(); // Visual Evolution §9
      banner.classList.add('show');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => banner.classList.remove('show'), 2800);
      if (typeof Game !== 'undefined') Game.petCelebrate = 40; // v1.5 §3 — pet celebration hop
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
     V1.4 §1 — ADVENTURE MISSIONS
     One-time missions (like achievements, but with an explicit
     coin+XP reward paid out the moment they're first completed).
     Progress is computed live from Storage/session data.
     =========================================================== */
  const MISSIONS = [
    { id: 'm_fruits15', icon: '🍎', title: 'Collect 15 Fruits', reward: { coins: 15, xp: 30 },
      target: 15, progress: (d) => d.stats.totalFruits },
    { id: 'm_score3000', icon: '⭐', title: 'Reach 3000 Score', reward: { coins: 25, xp: 50 },
      target: 3000, progress: (d) => d.highScore },
    { id: 'm_coins10', icon: '🪙', title: 'Collect 10 Coins', reward: { coins: 10, xp: 20 },
      target: 10, progress: (d) => d.stats.totalCoinsEarned },
    { id: 'm_games3', icon: '🎮', title: 'Play 3 Games', reward: { coins: 15, xp: 25 },
      target: 3, progress: (d) => d.stats.gamesPlayed },
    { id: 'm_skin1', icon: '🛍️', title: 'Unlock One Skin', reward: { coins: 20, xp: 40 },
      target: 1, progress: (d) => Math.max(0, d.unlockedSkins.length - 1) },
    { id: 'm_world1', icon: '🌟', title: 'Complete a World', reward: { coins: 50, xp: 100 },
      target: 5, progress: (d) => d.stats.highestLevel }
  ];

  /* ===========================================================
     V1.4 §2 — POWER-UPS
     Spawn like a coin, picked up on contact, apply a timed effect.
     Effects are handled directly in the Game tick/render logic.
     =========================================================== */
  const POWERUPS = {
    magnet:   { icon: '🧲', name: 'Magnet',       color: '#B983FF', duration: 8000 },
    shield:   { icon: '🛡️', name: 'Shield',       color: '#7FB8F0', duration: 10000 },
    double:   { icon: '✨', name: 'Double Score', color: '#FFD700', duration: 8000 },
    freeze:   { icon: '❄️', name: 'Freeze Time',  color: '#8ED1FC', duration: 5000 },
    radar:    { icon: '📡', name: 'Fruit Radar',  color: '#6FE08A', duration: 8000 },
    tiny:     { icon: '🔬', name: 'Tiny Snake',   color: '#FF6F91', duration: 8000 }
  };
  const POWERUP_KEYS = Object.keys(POWERUPS);

  /* ===========================================================
     V1.5 §3 — PET SYSTEM
     A companion that follows the snake and reacts to events.
     Never affects gameplay/collision — purely a decorative friend.
     =========================================================== */
  const PETS = {
    fox:    { name: 'Baby Fox',    icon: '🦊', cost: 0 },
    panda:  { name: 'Baby Panda',  icon: '🐼', cost: 60 },
    dragon: { name: 'Baby Dragon', icon: '🐲', cost: 150 },
    bunny:  { name: 'Baby Bunny',  icon: '🐰', cost: 40 },
    owl:    { name: 'Baby Owl',    icon: '🦉', cost: 90 }
  };

  /* ===========================================================
     V1.5 §4 — EMOTES
     Random positive callouts shown after objectives are completed.
     =========================================================== */
  const EMOTES = ['Amazing!', 'Fantastic!', 'Awesome Noah!', 'Great Job!', 'Super Hero!', 'Wonderful!'];
  const showEmote = (px, py) => {
    const text = EMOTES[randInt(0, EMOTES.length - 1)];
    FX.floatText(px, py, text, '#FF6F61');
  };

  /* ===========================================================
     V1.5 §5 — COLLECTIBLES
     Rare hidden items. Collecting 10 of one type completes that
     "set" and grants a one-time cosmetic-flavored coin reward.
     =========================================================== */
  const COLLECTIBLES = {
    star:    { icon: '🌟', name: 'Star',       setSize: 10, reward: 40 },
    crystal: { icon: '💎', name: 'Crystal',     setSize: 10, reward: 40 },
    leaf:    { icon: '🍁', name: 'Magic Leaf',  setSize: 10, reward: 40 },
    key:     { icon: '🗝️', name: 'Ancient Key', setSize: 10, reward: 40 },
    egg:     { icon: '🥚', name: 'Special Egg', setSize: 10, reward: 40 }
  };
  const COLLECTIBLE_KEYS = Object.keys(COLLECTIBLES);

  /* ===========================================================
     V1.5 §6 — SEASONAL EVENTS (architecture)
     Defines date-windows and a theme; the rest of the game only
     ever asks getActiveSeason() for the current theme, so a new
     season can be added here later without touching other systems.
     =========================================================== */
  const SEASONS = [
    { id: 'halloween', name: 'Halloween', icon: '🎃', start: [10, 20], end: [10, 31] },
    { id: 'christmas', name: 'Christmas', icon: '🎄', start: [12, 15], end: [12, 26] }
  ];
  const getActiveSeason = () => {
    const now = new Date();
    const m = now.getMonth() + 1, d = now.getDate();
    return SEASONS.find((s) => {
      const [sm, sd] = s.start, [em, ed] = s.end;
      const val = m * 100 + d, sv = sm * 100 + sd, ev = em * 100 + ed;
      return val >= sv && val <= ev;
    }) || null;
  };

  /* ===========================================================
     V1.5 §1 — STORY MODE (progress map)
     A visual progress path through the current single board,
     built entirely from the existing Level thresholds — no
     separate level layouts, so nothing about core gameplay changes.
     =========================================================== */
  const STAGES = [
    { id: 1, name: 'Stage 1', icon: '🌳', levelRequired: 1 },
    { id: 2, name: 'Stage 2', icon: '🌲', levelRequired: 2 },
    { id: 3, name: 'Stage 3', icon: '🍄', levelRequired: 3 },
    { id: 4, name: 'Boss Stage', icon: '🐉', levelRequired: 4 }
  ];

  /* ===========================================================
     V1.5 §2 — QUEST SYSTEM
     Main Quests reuse the existing Mission Center (MISSIONS).
     Daily/Weekly quests are separate, timeboxed, and reset
     automatically using a simple date/week key comparison.
     =========================================================== */
  const DAILY_QUEST = { title: 'Collect 5 Fruits Today', icon: '📅', target: 5, reward: { coins: 15, xp: 20 } };
  const WEEKLY_QUEST = { title: 'Play 5 Games This Week', icon: '🗓️', target: 5, reward: { coins: 60, xp: 100 } };

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
    prevSnake: [], // Visual Evolution — snapshot before each tick, for smooth interpolated rendering
    food: null,
    score: 0,
    difficulty: 'normal',
    stepMs: 130,
    effectiveStepMs: 130, // v1.4 — tracks Freeze Time adjusted pace for interpolation
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
    lastAchievementCount: 0, // Visual Evolution — for live achievement-sound feedback

    // ---------- v1.4 Adventure Expansion state ----------
    powerup: null,           // { type, x, y, bounce } or null — spawns like a coin
    activePowerups: {},      // { magnet: expiresAtMs, shield: expiresAtMs, ... }
    chest: null,             // { x, y, bounce } or null — mystery chest on the board
    giantFruit: null,        // { x, y, points, expiresAtMs, ...foodProps } or null — mini-boss
    foodsSincePowerup: 0,
    foodsSinceChest: 0,
    foodsSinceGiant: 0,
    combo: 0,                // current combo count
    comboTimer: 0,           // ms remaining before combo resets
    xpThisGame: 0,
    missionsAtStart: 0,      // snapshot for the improved end screen
    worldEventTimer: 0,      // ms until the next lightweight background world event

    // ---------- v1.5 Premium Adventure Update state ----------
    petTrail: [],            // recent head positions the pet follows, most-recent first
    collectible: null,       // { type, x, y, bounce } or null — rare hidden item on the board
    foodsSinceCollectible: 0,
    petCelebrate: 0,         // frames remaining for the pet's level-up celebration hop

    init() {
      this.canvas = $('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    },

    resizeCanvas() {
      // Visual Evolution — board now fills ~82-85% of the available screen
      // (was 78%/94%), same centering/responsiveness logic, larger cap.
      const maxW = window.innerWidth * 0.90;
      const maxH = window.innerHeight * 0.84;
      const size = Math.floor(Math.min(maxW, maxH, 720) / GRID_SIZE) * GRID_SIZE;
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
      this.prevSnake = this.snake.map((s) => ({ x: s.x, y: s.y }));
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.score = 0;
      this.foodsEaten = 0;
      this.level = 1;
      this.coin = null;
      this.sessionSeconds = 0;
      this.coinsThisGame = 0;
      this.achievementsAtStart = ACHIEVEMENTS.filter((a) => a.done(Storage.data)).length;
      this.lastAchievementCount = this.achievementsAtStart;
      // v1.4 resets
      this.powerup = null;
      this.activePowerups = {};
      this.chest = null;
      this.giantFruit = null;
      this.foodsSincePowerup = 0;
      this.foodsSinceChest = 0;
      this.foodsSinceGiant = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.xpThisGame = 0;
      this.missionsAtStart = MISSIONS.filter((m) => Storage.data.completedMissions.includes(m.id)).length;
      this.worldEventTimer = 8000 + Math.random() * 6000;
      // v1.5 resets
      this.petTrail = [];
      this.collectible = null;
      this.foodsSinceCollectible = 0;
      this.petCelebrate = 0;
      Quests.checkReset();
      Quests.addWeeklyProgress(1); // this game session counts toward "Play 5 Games This Week"
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
      this.food = { ...pos, ...kind, bounce: 0, age: 0 };
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

      // v1.4 — Freeze Time power-up: snake moves at half speed while active,
      // without touching the underlying difficulty stepMs.
      const effectiveStepMs = this.activePowerups.freeze ? this.stepMs * 1.8 : this.stepMs;
      this.effectiveStepMs = effectiveStepMs; // used by drawSnake() for accurate interpolation

      this.acc += delta;
      while (this.acc >= effectiveStepMs) {
        this.tick();
        this.acc -= effectiveStepMs;
      }
      this.render();
    },

    tick() {
      this.sessionSeconds += this.stepMs / 1000; // V1.3 §6 — playtime tracking
      this.prevSnake = this.snake.map((s) => ({ x: s.x, y: s.y })); // Visual Evolution

      // v1.4 — tick down combo window, active power-ups, and the giant-fruit timer
      if (this.comboTimer > 0) {
        this.comboTimer -= this.stepMs;
        if (this.comboTimer <= 0) { this.combo = 0; this.updateHud(); }
      }
      const now = Date.now();
      let powerupExpired = false;
      Object.keys(this.activePowerups).forEach((k) => {
        if (this.activePowerups[k] <= now) { delete this.activePowerups[k]; powerupExpired = true; }
      });
      if (powerupExpired) this.updateHud();
      if (this.giantFruit && now > this.giantFruit.expiresAt) this.giantFruit = null;
      this.worldEventTimer -= this.stepMs;
      if (this.worldEventTimer <= 0) {
        WorldEvents.trigger();
        this.worldEventTimer = 10000 + Math.random() * 8000;
      }

      this.dir = this.nextDir;
      const head = this.snake[0];
      const newHead = { x: head.x + this.dir.x, y: head.y + this.dir.y };

      // Screen wrapping: leaving one edge brings the snake back on the
      // opposite edge instead of ending the game.
      // Right -> Left, Left -> Right, Top -> Bottom, Bottom -> Top.
      newHead.x = (newHead.x + GRID_SIZE) % GRID_SIZE;
      newHead.y = (newHead.y + GRID_SIZE) % GRID_SIZE;

      // Self collision — a v1.4 Shield power-up absorbs one hit instead of ending the game
      if (this.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        if (this.activePowerups.shield) {
          delete this.activePowerups.shield;
          this.shakeFrames = 8;
          Audio.click();
          FX.confetti(30, ['#7FB8F0', '#FFFFFF']);
          return; // shield absorbed the hit — skip this move, try again next tick
        }
        return this.endGame();
      }

      this.snake.unshift(newHead);

      // v1.5 §3 — pet trail: remember recent head positions so the pet can follow a few steps behind
      this.petTrail.unshift({ x: head.x, y: head.y });
      if (this.petTrail.length > 6) this.petTrail.length = 6;

      // v1.5 §5 — hidden collectible pickup
      if (this.collectible && newHead.x === this.collectible.x && newHead.y === this.collectible.y) {
        this.collectItem();
      }

      // v1.4 §2/§3/§6 — power-up / mystery chest / giant fruit collisions
      if (this.powerup && newHead.x === this.powerup.x && newHead.y === this.powerup.y) {
        this.collectPowerup();
      }
      if (this.chest && newHead.x === this.chest.x && newHead.y === this.chest.y) {
        this.openChest();
      }
      if (this.giantFruit && newHead.x === this.giantFruit.x && newHead.y === this.giantFruit.y) {
        this.eatGiantFruit();
        return; // eatGiantFruit already handles unshift/pop bookkeeping
      }

      // V1.4 §2 — Magnet gently pulls the current fruit toward the snake's head
      if (this.activePowerups.magnet && this.food) {
        const dxf = this.food.x - newHead.x, dyf = this.food.y - newHead.y;
        if (Math.abs(dxf) + Math.abs(dyf) <= 4 && Math.abs(dxf) + Math.abs(dyf) > 1) {
          this.food.x -= Math.sign(dxf);
          this.food.y -= Math.sign(dyf);
        }
      }

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
      let points = this.food.points || 100;
      const eatenName = this.food.name || 'apple';
      const previousScore = this.score;

      // v1.4 §7 — Combo system: eating fruit within the combo window builds a streak
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.comboTimer = 2500;
      Storage.recordCombo(this.combo);
      let comboBonus = 0;
      if (this.combo >= 2) {
        comboBonus = Math.round(points * 0.1 * Math.min(this.combo, 5));
        points += comboBonus;
      }
      // v1.4 §2 — Double Score power-up
      if (this.activePowerups.double) points *= 2;

      this.score += points;
      this.foodsEaten++;
      this.glowFrames = 10;
      Audio.eatFruit(this.food.pitch || 660);
      Storage.recordFruit(eatenName); // V1.3 §6

      // v1.4 §8 — XP gain (independent of score)
      const xpGain = 5 + Math.round((this.food.points || 100) / 50);
      this.xpThisGame += xpGain;
      Storage.addXp(xpGain);

      this.updateHud();

      // Screen-space position of the food for particle/floater placement
      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.food.x + 0.5) * this.cell;
      const py = rect.top + (this.food.y + 0.5) * this.cell;
      FX.burst(px, py, [this.food.color, '#FFD700', '#FFFFFF']);
      FX.floatText(px, py, `+${points}`, this.food.color);
      FX.starBurst(6); // Visual Evolution — tiny star burst on every fruit
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* unsupported */ } }

      // v1.4 §7 — combo callouts at x2/x3/x5+
      if (this.combo === 2 || this.combo === 3 || this.combo === 5 || (this.combo > 5 && this.combo % 5 === 0)) {
        Audio.combo(this.combo);
        FX.floatText(px, py - 26, `Combo x${this.combo}!`, '#FF6F61');
        FX.starBurst(this.combo * 3);
      }

      this.checkNewAchievements(); // Visual Evolution §11
      this.checkNewMissions(); // v1.4 §1

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
      this.maybeSpawnPowerup(); // v1.4 §2
      this.maybeSpawnChest(); // v1.4 §3
      this.maybeSpawnGiantFruit(); // v1.4 §6
      this.maybeSpawnCollectible(); // v1.5 §5
      Quests.addDailyProgress(1); // v1.5 §2 — "Collect 5 Fruits Today"

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
      this.checkNewAchievements(); // Visual Evolution §11
    },

    // Visual Evolution §11 — plays a distinct little chime the instant an
    // achievement becomes newly true, instead of only finding out later
    // on the Achievements screen.
    checkNewAchievements() {
      const count = ACHIEVEMENTS.filter((a) => a.done(Storage.data)).length;
      if (count > this.lastAchievementCount) {
        Audio.achievement();
        const rect = this.canvas.getBoundingClientRect();
        showEmote(rect.left + rect.width / 2, rect.top + rect.height * 0.3); // v1.5 §4
      }
      this.lastAchievementCount = count;
    },

    // v1.4 §1 — check and auto-claim any newly-completed missions
    checkNewMissions() {
      MISSIONS.forEach((m) => {
        if (Storage.data.completedMissions.includes(m.id)) return;
        if (m.progress(Storage.data) >= m.target) {
          if (Storage.completeMission(m.id)) {
            Storage.addCoins(m.reward.coins);
            Storage.addXp(m.reward.xp);
            this.xpThisGame += m.reward.xp;
            Audio.achievement();
            FX.confetti(70, ['#FFD700', '#6FE08A', '#FFFFFF']);
            const banner = $('mission-banner');
            if (banner) {
              banner.innerHTML = `🎯 Mission Complete! <br> ${m.title} <br> +${m.reward.coins}🪙 +${m.reward.xp}XP`;
              banner.classList.add('show');
              clearTimeout(this._missionTimer);
              this._missionTimer = setTimeout(() => banner.classList.remove('show'), 3200);
            }
            this.updateHud();
          }
        }
      });
    },

    // ---------- v1.4 §2 — POWER-UPS ----------
    maybeSpawnPowerup() {
      this.foodsSincePowerup++;
      if (this.powerup || this.foodsSincePowerup < 4) return;
      if (Math.random() < 0.3) {
        this.foodsSincePowerup = 0;
        let pos, tries = 0;
        do {
          pos = { x: randInt(0, GRID_SIZE - 1), y: randInt(0, GRID_SIZE - 1) };
          tries++;
        } while (tries < 50 && this.occupiedByAnything(pos));
        const type = POWERUP_KEYS[randInt(0, POWERUP_KEYS.length - 1)];
        this.powerup = { type, ...pos, bounce: 0 };
      }
    },

    collectPowerup() {
      const def = POWERUPS[this.powerup.type];
      this.activePowerups[this.powerup.type] = Date.now() + def.duration;
      Audio.levelUp();
      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.powerup.x + 0.5) * this.cell;
      const py = rect.top + (this.powerup.y + 0.5) * this.cell;
      FX.burst(px, py, [def.color, '#FFFFFF']);
      FX.floatText(px, py, def.name, def.color);
      this.powerup = null;

      // Tiny Snake — shrink immediately down to a manageable length
      if (def === POWERUPS.tiny && this.snake.length > 4) {
        this.snake.length = 4;
      }
      this.updateHud();
    },

    // ---------- v1.4 §3 — MYSTERY CHESTS ----------
    maybeSpawnChest() {
      this.foodsSinceChest++;
      if (this.chest || this.foodsSinceChest < 6) return;
      if (Math.random() < 0.22) {
        this.foodsSinceChest = 0;
        let pos, tries = 0;
        do {
          pos = { x: randInt(0, GRID_SIZE - 1), y: randInt(0, GRID_SIZE - 1) };
          tries++;
        } while (tries < 50 && this.occupiedByAnything(pos));
        this.chest = { ...pos, bounce: 0 };
      }
    },

    openChest() {
      this.chest = null;
      const roll = Math.random();
      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.snake[0].x + 0.5) * this.cell;
      const py = rect.top + (this.snake[0].y + 0.5) * this.cell;
      let label;
      if (roll < 0.4) {
        const coins = 10 + randInt(0, 15);
        Storage.addCoins(coins);
        label = `+${coins} 🪙`;
      } else if (roll < 0.7) {
        const xp = 20 + randInt(0, 30);
        Storage.addXp(xp);
        this.xpThisGame += xp;
        label = `+${xp} XP`;
      } else {
        const type = POWERUP_KEYS[randInt(0, POWERUP_KEYS.length - 1)];
        this.activePowerups[type] = Date.now() + POWERUPS[type].duration;
        label = POWERUPS[type].name + '!';
      }
      Audio.achievement();
      FX.confetti(100, ['#FFD700', '#FFF6C9', '#FFC300']);
      FX.starBurst(20);
      FX.floatText(px, py, label, '#FFD700');
      this.updateHud();
    },

    // ---------- v1.4 §6 — MINI BOSS (Giant Fruit) ----------
    maybeSpawnGiantFruit() {
      this.foodsSinceGiant++;
      if (this.giantFruit || this.foodsSinceGiant < 8) return;
      if (Math.random() < 0.25) {
        this.foodsSinceGiant = 0;
        let pos, tries = 0;
        do {
          pos = { x: randInt(0, GRID_SIZE - 1), y: randInt(0, GRID_SIZE - 1) };
          tries++;
        } while (tries < 50 && this.occupiedByAnything(pos));
        const kind = FOODS[randInt(0, FOODS.length - 1)];
        this.giantFruit = { ...pos, ...kind, points: 1000, bounce: 0, expiresAt: Date.now() + 7000 };
      }
    },

    eatGiantFruit() {
      const points = this.activePowerups.double ? this.giantFruit.points * 2 : this.giantFruit.points;
      const previousScore = this.score;
      this.score += points;
      this.foodsEaten++;
      Storage.recordFruit(this.giantFruit.name);
      const xpGain = 50;
      this.xpThisGame += xpGain;
      Storage.addXp(xpGain);

      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.giantFruit.x + 0.5) * this.cell;
      const py = rect.top + (this.giantFruit.y + 0.5) * this.cell;
      FX.confetti(160, ['#FFD700', '#FFF6C9', '#FFC300', '#FFFFFF']);
      FX.starBurst(40);
      FX.floatText(px, py, `+${points}!!`, '#FFD700');
      Audio.victory();
      flashScreen();
      this.glowFrames = 20;
      this.giantFruit = null;
      this.snake.pop(); // eating the giant fruit doesn't grow the snake (balance)
      this.checkNewMissions();

      if (Math.floor(this.score / 1000) > Math.floor(previousScore / 1000)) Milestone.show();
      const newLevel = getLevelForScore(this.score);
      if (newLevel > this.level) { this.level = newLevel; LevelUp.show(newLevel); Storage.recordLevel(newLevel); }

      this.updateHud();
      const best = Math.max(Storage.data.highScore, this.score);
      if (best > Storage.data.highScore) Storage.set('highScore', best);
    },

    // Shared helper — true if a cell is occupied by the snake, food, coin, or any special item
    // ---------- v1.5 §5 — COLLECTIBLES ----------
    maybeSpawnCollectible() {
      this.foodsSinceCollectible++;
      if (this.collectible || this.foodsSinceCollectible < 10) return;
      if (Math.random() < 0.2) {
        this.foodsSinceCollectible = 0;
        let pos, tries = 0;
        do {
          pos = { x: randInt(0, GRID_SIZE - 1), y: randInt(0, GRID_SIZE - 1) };
          tries++;
        } while (tries < 50 && this.occupiedByAnything(pos));
        const type = COLLECTIBLE_KEYS[randInt(0, COLLECTIBLE_KEYS.length - 1)];
        this.collectible = { type, ...pos, bounce: 0 };
      }
    },

    collectItem() {
      const type = this.collectible.type;
      const def = COLLECTIBLES[type];
      this.collectible = null;
      Storage.addCollectible(type);
      Audio.coin();

      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.snake[0].x + 0.5) * this.cell;
      const py = rect.top + (this.snake[0].y + 0.5) * this.cell;
      FX.burst(px, py, ['#FFD700', '#FFFFFF']);
      FX.floatText(px, py, def.icon + ' +1', '#FFD700');

      if (Storage.data.collectibles[type] >= def.setSize) {
        if (Storage.completeCollectibleSet(type)) {
          Storage.addCoins(def.reward);
          Audio.achievement();
          FX.confetti(120, ['#FFD700', '#B983FF', '#FFFFFF']);
          showEmote(px, py - 30);
          const banner = $('mission-banner');
          if (banner) {
            banner.innerHTML = `${def.icon} ${def.name} Set Complete! <br> +${def.reward} 🪙`;
            banner.classList.add('show');
            setTimeout(() => banner.classList.remove('show'), 3200);
          }
        }
      }
      this.updateHud();
    },

    occupiedByAnything(pos) {
      if (this.snake.some((s) => s.x === pos.x && s.y === pos.y)) return true;
      if (this.food && this.food.x === pos.x && this.food.y === pos.y) return true;
      if (this.coin && this.coin.x === pos.x && this.coin.y === pos.y) return true;
      if (this.powerup && this.powerup.x === pos.x && this.powerup.y === pos.y) return true;
      if (this.chest && this.chest.x === pos.x && this.chest.y === pos.y) return true;
      if (this.giantFruit && this.giantFruit.x === pos.x && this.giantFruit.y === pos.y) return true;
      if (this.collectible && this.collectible.x === pos.x && this.collectible.y === pos.y) return true;
      return false;
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
      this.checkNewMissions(); // v1.4 §1 — e.g. score/games-played missions
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
      if (this.powerup) this.drawPowerup(ctx); // v1.4 §2
      if (this.chest) this.drawChest(ctx); // v1.4 §3
      if (this.giantFruit) this.drawGiantFruit(ctx); // v1.4 §6
      if (this.collectible) this.drawCollectible(ctx); // v1.5 §5
      this.drawFood(ctx);
      this.drawPet(ctx); // v1.5 §3 — drawn before the snake so the snake reads on top
      this.drawSnake(ctx);
      if (this.activePowerups.radar) this.drawRadar(ctx); // v1.4 §2

      ctx.restore();
    },

    // v1.4 §2 — Fruit Radar: a small pulsing arrow at the head, pointing toward the fruit
    drawRadar(ctx) {
      const head = this.snake[0];
      const hx = head.x * this.cell + this.cell / 2;
      const hy = head.y * this.cell + this.cell / 2;
      const angle = Math.atan2(this.food.y - head.y, this.food.x - head.x);
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.2;
      ctx.fillStyle = '#6FE08A';
      ctx.beginPath();
      ctx.moveTo(this.cell * 0.75, 0);
      ctx.lineTo(this.cell * 0.55, -this.cell * 0.12);
      ctx.lineTo(this.cell * 0.55, this.cell * 0.12);
      ctx.closePath();
      ctx.fill();
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

    // v1.4 §2 — power-up pickup (glowing icon, colored per type)
    drawPowerup(ctx) {
      const p = this.powerup;
      const def = POWERUPS[p.type];
      p.bounce = (p.bounce + 0.16) % (Math.PI * 2);
      const bounceOffset = Math.sin(p.bounce) * 3;
      const cx = p.x * this.cell + this.cell / 2;
      const cy = p.y * this.cell + this.cell / 2 + bounceOffset;

      ctx.save();
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 20;
      ctx.font = `${this.cell * 0.75}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, cx, cy);
      ctx.restore();
    },

    // v1.4 §3 — mystery chest (gentle golden glow, bigger emoji)
    drawChest(ctx) {
      const c = this.chest;
      c.bounce = (c.bounce + 0.12) % (Math.PI * 2);
      const pulse = 1 + Math.sin(c.bounce * 2) * 0.08;
      const cx = c.x * this.cell + this.cell / 2;
      const cy = c.y * this.cell + this.cell / 2;

      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 22;
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.font = `${this.cell * 0.85}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎁', 0, 0);
      ctx.restore();
    },

    // v1.4 §6 — giant "mini boss" fruit: big, glowing, with a countdown ring
    drawGiantFruit(ctx) {
      const g = this.giantFruit;
      const cx = g.x * this.cell + this.cell / 2;
      const cy = g.y * this.cell + this.cell / 2;
      const timeLeft = clamp((g.expiresAt - Date.now()) / 7000, 0, 1);

      ctx.save();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, this.cell * 0.85, -Math.PI / 2, -Math.PI / 2 + timeLeft * Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = g.color;
      ctx.shadowBlur = 26;
      const pulse = 1 + Math.sin(Date.now() / 150) * 0.08;
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.font = `${this.cell * 1.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.emoji, 0, 0);
      ctx.restore();
    },

    // v1.5 §5 — hidden collectible (gentle glow, distinct per type)
    drawCollectible(ctx) {
      const c = this.collectible;
      const def = COLLECTIBLES[c.type];
      c.bounce = (c.bounce + 0.1) % (Math.PI * 2);
      const pulse = 1 + Math.sin(c.bounce * 2) * 0.1;
      const cx = c.x * this.cell + this.cell / 2;
      const cy = c.y * this.cell + this.cell / 2;
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 18;
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.font = `${this.cell * 0.7}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, 0, 0);
      ctx.restore();
    },

    // v1.5 §3 — companion pet: follows a few steps behind the head, bounces on
    // eat (via glowFrames-style hop), celebrates on level-up, sleeps when paused.
    drawPet(ctx) {
      const petId = Storage.data.currentPet;
      const pet = PETS[petId] || PETS.fox;
      const followPos = this.petTrail[Math.min(3, this.petTrail.length - 1)] || this.snake[this.snake.length - 1];
      if (!followPos) return;
      const cx = followPos.x * this.cell + this.cell / 2;
      let cy = followPos.y * this.cell + this.cell / 2;

      let bob = Math.sin(performance.now() / 400) * 2;
      let scale = 1;
      let label = '';
      if (this.paused) {
        label = '💤';
      } else if (this.petCelebrate > 0) {
        bob = -Math.abs(Math.sin(performance.now() / 90)) * this.cell * 0.3;
        scale = 1.15;
        this.petCelebrate--;
      } else if (this.glowFrames > 0) {
        scale = 1.1; // little bounce right after the snake eats
      }

      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.font = `${this.cell * 0.6 * scale}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pet.icon, cx, cy + bob);
      if (label) ctx.fillText(label, cx + this.cell * 0.4, cy - this.cell * 0.4);
      ctx.restore();
    },

    drawFood(ctx) {
      const f = this.food;
      f.bounce = (f.bounce + 0.15) % (Math.PI * 2);
      f.age = Math.min((f.age || 0) + 1, 18); // Visual Evolution — appear-in progress
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

      // Visual Evolution — appear progress: fresh fruit glows brighter and
      // scales in from small, then settles into its normal gentle pulse.
      const appear = f.age / 18; // 0 (just placed) -> 1 (settled)
      const pulse = (1 + Math.sin(f.bounce * 2) * 0.06) * (0.6 + 0.4 * appear);
      const wobble = Math.sin(f.bounce * 0.6) * 0.12; // tiny rotation

      ctx.save();
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 16 + (1 - appear) * 14; // extra glow while appearing
      ctx.translate(cx, cy);
      ctx.rotate(wobble);
      ctx.scale(pulse, pulse);
      ctx.font = `${this.cell * 1.0}px serif`; // Visual Evolution — ~25% bigger (was 0.8)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.5 + 0.5 * appear;
      ctx.fillText(f.emoji, 0, 0);
      ctx.restore();
    },

    drawSnake(ctx) {
      const rainbow = ['#FF6F61', '#FFD93D', '#6FE08A', '#7FB8F0', '#B983FF'];
      const t = clamp(this.acc / (this.effectiveStepMs || this.stepMs), 0, 1); // interpolation progress
      const now = performance.now();
      const skin = SKINS[Storage.data.currentSkin] || SKINS.green; // V1.3 §3

      this.snake.forEach((seg, i) => {
        // Visual Evolution — interpolate from the pre-tick position for smooth
        // continuous motion instead of a grid-cell "jump" every step.
        // Each rendered slot interpolates from where it was one tick ago
        // to where it is now — this is what produces the smooth "sliding
        // forward" look for the whole body, not just the head.
        const prevPos = this.prevSnake[i];
        let gx = seg.x, gy = seg.y;
        if (prevPos) {
          const dx = seg.x - prevPos.x, dy = seg.y - prevPos.y;
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) { // skip interpolation across a screen-wrap jump
            gx = prevPos.x + dx * t;
            gy = prevPos.y + dy * t;
          }
        }

        let cx = gx * this.cell + this.cell / 2;
        let cy = gy * this.cell + this.cell / 2;
        const isHead = i === 0;
        const isTail = i === this.snake.length - 1;

        // Visual Evolution — gentle idle "breathing" pulse along the body
        const breathe = 1 + Math.sin(now / 500 + i * 0.3) * 0.03;
        // Visual Evolution — a tiny tail wag, perpendicular to travel direction
        if (isTail && this.snake.length > 1) {
          const perpX = this.dir.y !== 0 ? 1 : 0;
          const perpY = this.dir.x !== 0 ? 1 : 0;
          const wag = Math.sin(now / 220) * this.cell * 0.06;
          cx += perpX * wag;
          cy += perpY * wag;
        }

        const radius = (isHead ? this.cell * 0.48 : this.cell * 0.42 * (1 - i / (this.snake.length * 2.2))) * breathe;

        let bodyColor;
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
        } else {
          // Visual Evolution — soft resting shadow under each segment
          ctx.shadowColor = 'rgba(0,0,0,0.18)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
        }
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(radius, 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Visual Evolution — subtle glossy highlight for a soft, alive look
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(cx - radius * 0.32, cy - radius * 0.35, radius * 0.38, radius * 0.24, -0.6, 0, Math.PI * 2);
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
      const eyeSize = this.cell * 0.13; // Visual Evolution — slightly larger eyes (was 0.11)

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

    // Visual Evolution — briefly "pop" a HUD pill when its number changes,
    // giving a lightweight animated-counter feel without a persistent loop.
    popHud(el) {
      if (!el) return;
      const pill = el.closest('.hud-pill');
      if (!pill) return;
      pill.classList.remove('pop');
      void pill.offsetWidth; // restart animation if triggered again quickly
      pill.classList.add('pop');
    },

    updateHud() {
      const scoreEl = $('hud-score');
      if (scoreEl && scoreEl.textContent != this.score) { scoreEl.textContent = this.score; this.popHud(scoreEl); }
      $('hud-best').textContent = Storage.data.highScore;
      $('menu-high-score').textContent = Storage.data.highScore;
      const levelEl = $('hud-level');
      if (levelEl && levelEl.textContent != this.level) { levelEl.textContent = this.level; this.popHud(levelEl); } // V1.3 §1
      const coinsEl = $('hud-coins');
      if (coinsEl && coinsEl.textContent != Storage.data.coins) { coinsEl.textContent = Storage.data.coins; this.popHud(coinsEl); } // V1.3 §2

      // v1.4 — combo pill (only shown while a combo is active)
      const comboPill = $('hud-combo-pill');
      const comboEl = $('hud-combo');
      if (comboPill && comboEl) {
        if (this.combo >= 2) {
          comboPill.classList.add('show');
          if (comboEl.textContent != this.combo) { comboEl.textContent = this.combo; this.popHud(comboEl); }
        } else {
          comboPill.classList.remove('show');
        }
      }

      // v1.4 — active power-up icon strip
      const strip = $('hud-powerups');
      if (strip) {
        const active = Object.keys(this.activePowerups);
        strip.innerHTML = active.map((k) => `<span class="powerup-chip" title="${POWERUPS[k].name}">${POWERUPS[k].icon}</span>`).join('');
      }
    },

    pause() {
      this.paused = true;
      Audio.stopMusic();
      this.render(); // v1.5 §3 — draw one paused frame so the pet's sleep icon shows
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
      // v1.5 §8 — apply saved accessibility options
      const acc = Storage.data.accessibility;
      document.body.classList.toggle('large-ui', acc.largeUI);
      document.body.classList.toggle('color-friendly', acc.colorFriendly);
      document.body.classList.toggle('high-contrast', acc.highContrast);
      document.body.classList.toggle('big-buttons', acc.bigButtons);
      if ($('toggle-large-ui')) $('toggle-large-ui').checked = acc.largeUI;
      if ($('toggle-color-friendly')) $('toggle-color-friendly').checked = acc.colorFriendly;
      if ($('toggle-high-contrast')) $('toggle-high-contrast').checked = acc.highContrast;
      if ($('toggle-big-buttons')) $('toggle-big-buttons').checked = acc.bigButtons;
      this.updateSoundIcon();
      this.refreshProfile(); // Magic Forest Update
      this.applySeasonalBadge(); // v1.5 §6

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

      // v1.4 — Mission Center
      $('btn-missions').addEventListener('click', () => { Audio.click(); this.renderMissions(); Screens.show('missions'); });
      $('btn-missions-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });

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

      // v1.5 §8 — accessibility toggles
      const accToggle = (id, key, cls) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
          Storage.setAccessibility(key, e.target.checked);
          document.body.classList.toggle(cls, e.target.checked);
          Audio.click();
        });
      };
      accToggle('toggle-large-ui', 'largeUI', 'large-ui');
      accToggle('toggle-color-friendly', 'colorFriendly', 'color-friendly');
      accToggle('toggle-high-contrast', 'highContrast', 'high-contrast');
      accToggle('toggle-big-buttons', 'bigButtons', 'big-buttons');

      // v1.5 §1 — World Map (Story Mode)
      $('btn-worldmap').addEventListener('click', () => { Audio.click(); this.renderWorldMap(); Screens.show('worldmap'); });
      $('btn-worldmap-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });

      // v1.5 §7 — Photo Mode (available from the pause menu)
      $('btn-photo-mode').addEventListener('click', () => {
        Audio.click();
        document.body.classList.toggle('photo-mode');
      });

      // v1.5 §9 — Smart Tutorial
      $('btn-tutorial-close').addEventListener('click', () => {
        Audio.click();
        Storage.set('tutorialSeen', true);
        Screens.overlay('tutorial', false);
        this._startGameNow(this.pendingLevel || Storage.data.lastDifficulty);
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

    // v1.5 §6 — Seasonal Events (architecture): shows a small badge if a
    // season window is currently active. No other system needs to know.
    applySeasonalBadge() {
      const badge = $('seasonal-badge');
      if (!badge) return;
      const season = getActiveSeason();
      if (season) {
        badge.textContent = `${season.icon} ${season.name}`;
        badge.classList.add('show');
      } else {
        badge.classList.remove('show');
      }
    },

    startGame(level) {
      if (!Storage.data.tutorialSeen) {
        this.pendingLevel = level; // v1.5 §9 — resume after the player dismisses the tutorial
        Screens.overlay('tutorial', true);
        return;
      }
      this._startGameNow(level);
    },

    _startGameNow(level) {
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

      // v1.4 §9 — XP earned and missions completed this round
      setText('final-xp', Game.xpThisGame);
      const missionsNow = MISSIONS.filter((m) => Storage.data.completedMissions.includes(m.id)).length;
      setText('final-missions', Math.max(0, missionsNow - Game.missionsAtStart));

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

      // v1.5 §3 — Companion Pets
      const petGrid = $('pet-shop-grid');
      if (petGrid) {
        petGrid.innerHTML = '';
        Object.keys(PETS).forEach((id) => {
          const pet = PETS[id];
          const owned = Storage.data.unlockedPets.includes(id);
          const equipped = Storage.data.currentPet === id;
          const card = document.createElement('div');
          card.className = 'shop-card';
          card.innerHTML = `
            <div class="shop-preview pet-preview">${pet.icon}</div>
            <span class="shop-skin-name">${pet.name}</span>
            <span class="shop-skin-cost">${pet.cost === 0 ? 'Free' : `🪙 ${pet.cost}`}</span>
            <button class="btn ${equipped ? 'btn-secondary' : 'btn-primary'} shop-action">
              ${equipped ? '✔️ Following' : (owned ? 'Choose' : 'Adopt')}
            </button>
          `;
          card.querySelector('.shop-action').addEventListener('click', () => {
            Audio.click();
            if (Storage.data.currentPet === id) return;
            if (Storage.data.unlockedPets.includes(id)) {
              Storage.set('currentPet', id);
            } else if (Storage.spendCoins(pet.cost)) {
              Storage.unlockPet(id);
              Storage.set('currentPet', id);
              FX.confetti(60);
            } else {
              return;
            }
            this.renderShop();
          });
          petGrid.appendChild(card);
        });
      }
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
      // v1.4 additions
      setText('stat-xp', Storage.data.xp);
      setText('stat-achievements-done', `${ACHIEVEMENTS.filter((a) => a.done(Storage.data)).length} / ${ACHIEVEMENTS.length}`);

      // v1.5 §5 — collectibles summary
      const collEl = $('stat-collectibles');
      if (collEl) {
        collEl.innerHTML = COLLECTIBLE_KEYS.map((k) => {
          const def = COLLECTIBLES[k];
          const count = Storage.data.collectibles[k] || 0;
          const complete = Storage.data.collectibleSetsCompleted.includes(k);
          return `<span class="collectible-chip${complete ? ' complete' : ''}">${def.icon} ${count}/${def.setSize}</span>`;
        }).join('');
      }
    },

    // ---------- v1.4 §1 — Mission Center ----------
    renderMissions() {
      Quests.checkReset(); // v1.5 §2

      // v1.5 — Daily/Weekly quest cards, rendered above the existing missions
      const questList = $('quests-list');
      if (questList) {
        questList.innerHTML = '';
        const dq = Storage.data.dailyQuest, wq = Storage.data.weeklyQuest;
        const cards = [
          { def: DAILY_QUEST, state: dq, cls: 'daily' },
          { def: WEEKLY_QUEST, state: wq, cls: 'weekly' }
        ];
        cards.forEach(({ def, state, cls }) => {
          const progress = Math.min(state.progress, def.target);
          const pct = Math.round((progress / def.target) * 100);
          const item = document.createElement('div');
          item.className = 'mission-item quest-' + cls + (state.claimed ? ' done' : '');
          item.innerHTML = `
            <div class="mission-row">
              <span class="mission-icon">${state.claimed ? '🏅' : def.icon}</span>
              <span class="mission-text">
                <strong>${def.title}</strong>
                <small>${state.claimed ? 'Reward claimed!' : `+${def.reward.coins} 🪙 · +${def.reward.xp} XP`}</small>
              </span>
              <span class="mission-state">${state.claimed ? '✅' : `${progress}/${def.target}`}</span>
            </div>
            <div class="mission-bar"><div class="mission-bar-fill" style="width:${state.claimed ? 100 : pct}%"></div></div>
          `;
          questList.appendChild(item);
        });
      }

      const list = $('missions-list');
      if (!list) return;
      list.innerHTML = '';
      MISSIONS.forEach((m) => {
        const done = Storage.data.completedMissions.includes(m.id);
        const progress = Math.min(m.progress(Storage.data), m.target);
        const pct = Math.round((progress / m.target) * 100);
        const item = document.createElement('div');
        item.className = 'mission-item' + (done ? ' done' : '');
        item.innerHTML = `
          <div class="mission-row">
            <span class="mission-icon">${done ? '🏅' : m.icon}</span>
            <span class="mission-text">
              <strong>${m.title}</strong>
              <small>${done ? 'Reward claimed!' : `+${m.reward.coins} 🪙 · +${m.reward.xp} XP`}</small>
            </span>
            <span class="mission-state">${done ? '✅' : `${progress}/${m.target}`}</span>
          </div>
          <div class="mission-bar"><div class="mission-bar-fill" style="width:${done ? 100 : pct}%"></div></div>
        `;
        list.appendChild(item);
      });
    },

    // ---------- v1.5 §1 — Story Mode / World Map ----------
    renderWorldMap() {
      const list = $('world-map-list');
      if (!list) return;
      list.innerHTML = '';
      const highestLevel = Storage.data.stats.highestLevel;
      STAGES.forEach((s, i) => {
        const unlocked = highestLevel >= s.levelRequired || i === 0;
        const cleared = highestLevel > s.levelRequired || (i === 0 && highestLevel >= s.levelRequired);
        const item = document.createElement('div');
        item.className = 'mission-item stage-item' + (unlocked ? '' : ' locked');
        item.innerHTML = `
          <div class="mission-row">
            <span class="mission-icon">${unlocked ? s.icon : '🔒'}</span>
            <span class="mission-text">
              <strong>${s.name}</strong>
              <small>${unlocked ? (cleared ? 'Cleared!' : 'Reach Level ' + s.levelRequired + ' to clear') : 'Reach Level ' + s.levelRequired + ' to unlock'}</small>
            </span>
            <span class="mission-state">${cleared ? '✅' : (unlocked ? '▶️' : '')}</span>
          </div>
        `;
        list.appendChild(item);
      });
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
    Quests.checkReset(); // v1.5 §2
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
