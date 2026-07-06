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
      unlockedRewards: []
    },
    data: null,
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.data = raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
      } catch (e) {
        this.data = { ...this.defaults };
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

    eat() {
      this.tone(660, 0.12, { type: 'triangle', volume: 0.25 });
      this.tone(880, 0.14, { type: 'triangle', volume: 0.18, delay: 0.06 });
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
    all: ['menu', 'levels', 'settings', 'credits', 'game'],
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
    confetti(amount = 120) {
      const colors = ['#FF6F61', '#FFD93D', '#6FE08A', '#7FB8F0', '#B983FF', '#FFD700'];
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
     6. THE GAME  (Snake + Food + Loop)
     =========================================================== */
  const FOODS = [
    { emoji: '🍎', color: '#FF6F61' },
    { emoji: '🍓', color: '#FF4D6D' },
    { emoji: '🍌', color: '#FFD93D' },
    { emoji: '🍇', color: '#B983FF' },
    { emoji: '🍊', color: '#FFA23E' }
  ];

  const LEVELS = {
    easy:   { stepMs: 180, label: 'Easy' },
    normal: { stepMs: 130, label: 'Normal' },
    hard:   { stepMs: 90,  label: 'Hard' }
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
      this.secretMode = false;
      this.secretBuffer = '';
      $('secret-banner').classList.remove('show');
      this.glowFrames = 0;
      this.shakeFrames = 0;
      this.placeFood();
      this.updateHud();
      this.paused = false;
      this.running = false; // becomes true after countdown
      this.runCountdown();
    },

    runCountdown() {
      const overlay = $('countdown-overlay');
      const numEl = $('countdown-number');
      overlay.classList.add('active');
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
      this.dir = this.nextDir;
      const head = this.snake[0];
      const newHead = { x: head.x + this.dir.x, y: head.y + this.dir.y };

      // Wall collision
      if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
        return this.endGame();
      }
      // Self collision
      if (this.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        return this.endGame();
      }

      this.snake.unshift(newHead);

      if (newHead.x === this.food.x && newHead.y === this.food.y) {
        this.eatFood();
      } else {
        this.snake.pop();
      }
    },

    eatFood() {
      this.score++;
      this.glowFrames = 10;
      Audio.eat();
      this.updateHud();

      // Screen-space position of the food for particle/floater placement
      const rect = this.canvas.getBoundingClientRect();
      const px = rect.left + (this.food.x + 0.5) * this.cell;
      const py = rect.top + (this.food.y + 0.5) * this.cell;
      FX.burst(px, py, [this.food.color, '#FFD700', '#FFFFFF']);
      FX.floatText(px, py, '+1', this.food.color);

      // Level-up celebration every 5 fruits
      if (this.score % 5 === 0) {
        Audio.levelUp();
        FX.confetti(60);
      }

      this.placeFood();

      const best = Math.max(Storage.data.highScore, this.score);
      if (best > Storage.data.highScore) Storage.set('highScore', best);
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

      // Glow
      ctx.save();
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 14;
      ctx.font = `${this.cell * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.emoji, cx, cy);
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
        if (this.secretMode) {
          bodyColor = rainbow[i % rainbow.length];
        } else if (this.glowFrames > 0) {
          bodyColor = '#FFD700';
        } else {
          bodyColor = isHead ? '#4CAF50' : '#5FCB6C';
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

        if (isHead) this.drawFace(ctx, cx, cy);
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
    },

    updateHud() {
      $('hud-score').textContent = this.score;
      $('hud-best').textContent = Storage.data.highScore;
      $('menu-high-score').textContent = Storage.data.highScore;
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

      $('btn-play').addEventListener('click', () => {
        Audio.init(); Audio.resume(); Audio.click();
        Screens.show('levels');
      });
      $('btn-settings').addEventListener('click', () => { Audio.click(); Screens.show('settings'); });
      $('btn-credits').addEventListener('click', () => { Audio.click(); Screens.show('credits'); });
      $('btn-levels-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-settings-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });
      $('btn-credits-back').addEventListener('click', () => { Audio.click(); Screens.show('menu'); });

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
      Screens.overlay('gameover', true);
    },

    goToMenu() {
      Audio.click();
      Game.stop();
      Screens.overlay('pause', false);
      Screens.overlay('gameover', false);
      Game.updateHud();
      Screens.show('menu');
      Audio.startMusic('menu');
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
