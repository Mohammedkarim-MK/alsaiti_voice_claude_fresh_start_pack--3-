/* ==========================================================================
   aquarium.js — the living background + every small fish scene on the page
   One shared requestAnimationFrame loop drives all of it.
   ========================================================================== */
(function (global) {
  'use strict';

  var Art = global.GoldfishArt;
  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ *
   * Ticker: one rAF for the whole site
   * ------------------------------------------------------------------ */
  var scenes = [];
  var running = false;
  var last = 0;
  var clock = 0;
  var sweep = 0;
  var gen = 0;                                       // kills any stale loop

  function loop(id) {
    return function frame(now) {
      if (!running || id !== gen) return;
      var dt = Math.min((now - last) / 1000, 0.05);  // clamp after tab-switches
      last = now;
      clock += dt;
      for (var i = 0; i < scenes.length; i++) {
        if (scenes[i].active) scenes[i].step(dt, clock);
      }
      // Filtering the shop swaps out cards; drop scenes whose canvas is gone.
      if (++sweep > 150) {
        sweep = 0;
        scenes = scenes.filter(function (s) {
          return !s.canvas || s.canvas.isConnected !== false;
        });
      }
      requestAnimationFrame(frame);
    };
  }
  function start() {
    if (REDUCED) return;
    running = true;
    last = performance.now();
    gen++;
    requestAnimationFrame(loop(gen));
  }
  function stop() { running = false; }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  /* ------------------------------------------------------------------ *
   * Canvas sizing helper (handles HiDPI without melting laptops)
   * ------------------------------------------------------------------ */
  function fit(canvas) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width));
    var h = Math.max(1, Math.round(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /* ------------------------------------------------------------------ *
   * The big one: full-page background aquarium
   * ------------------------------------------------------------------ */
  function Aquarium(canvas) {
    this.canvas = canvas;
    this.active = true;
    this.w = 0; this.h = 0;
    this.fish = [];
    this.bubbles = [];
    this.motes = [];
    this.plants = [];
    this.pointer = { x: -9999, y: -9999, on: false };
    this.resize();

    var self = this;
    var raf = null;
    var refit = function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { self.resize(); });
    };
    global.addEventListener('resize', refit);
    // The canvas can be measured before layout settles (or while the tab is
    // hidden), which would leave it stuck at 1×1. Watch the element itself.
    if ('ResizeObserver' in global) new ResizeObserver(refit).observe(canvas);
    global.addEventListener('pointermove', function (e) {
      self.pointer.x = e.clientX; self.pointer.y = e.clientY; self.pointer.on = true;
    }, { passive: true });
    global.addEventListener('pointerleave', function () { self.pointer.on = false; });

    // a click sends up a little burst of bubbles — cheap delight
    global.addEventListener('pointerdown', function (e) {
      for (var i = 0; i < 7; i++) {
        self.bubbles.push({
          x: e.clientX + (Math.random() - 0.5) * 34,
          y: e.clientY + (Math.random() - 0.5) * 18,
          r: 2 + Math.random() * 6,
          v: 26 + Math.random() * 46,
          w: Math.random() * 6.28,
          a: 0.55 + Math.random() * 0.35
        });
      }
    }, { passive: true });
  }

  Aquarium.prototype.resize = function () {
    var f = fit(this.canvas);
    this.ctx = f.ctx; this.w = f.w; this.h = f.h;
    this.build();
    this.step(0, clock);   // paint one frame immediately, even while paused
  };

  Aquarium.prototype.build = function () {
    var keys = Art.keys;
    var area = this.w * this.h;
    var target = Math.round(Math.max(5, Math.min(15, area / 92000)));
    var i;

    // keep existing fish where possible so a resize doesn't reshuffle the tank
    while (this.fish.length > target) this.fish.pop();
    for (i = this.fish.length; i < target; i++) {
      var z = Math.random();
      this.fish.push({
        x: Math.random() * this.w,
        y: this.h * (0.08 + Math.random() * 0.84),
        z: z,
        size: 22 + z * 52,
        angle: Math.random() * Math.PI * 2,
        speed: (14 + z * 26) * (0.75 + Math.random() * 0.6),
        wander: Math.random() * 100,
        dart: 0,
        nextDart: 3 + Math.random() * 9,
        phase: Math.random() * 20,
        spec: Art.createSpec(keys[i % keys.length], (i + 1) * 9176 + Math.floor(Math.random() * 999))
      });
    }
    this.fish.sort(function (a, b) { return a.z - b.z; });

    this.bubbles.length = 0;
    var bcount = Math.round(Math.max(10, Math.min(26, area / 58000)));
    for (i = 0; i < bcount; i++) {
      this.bubbles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 1.5 + Math.random() * 5.5,
        v: 14 + Math.random() * 34,
        w: Math.random() * 6.28,
        a: 0.25 + Math.random() * 0.45
      });
    }

    this.motes.length = 0;
    var mcount = Math.round(Math.max(14, Math.min(46, area / 30000)));
    for (i = 0; i < mcount; i++) {
      this.motes.push({
        x: Math.random() * this.w, y: Math.random() * this.h,
        r: 0.6 + Math.random() * 1.5,
        vx: -6 + Math.random() * 12, vy: -4 + Math.random() * 8,
        a: 0.08 + Math.random() * 0.22
      });
    }

    this.plants.length = 0;
    var pcount = this.w < 700 ? 3 : 6;
    for (i = 0; i < pcount; i++) {
      this.plants.push({
        x: (i + 0.5) * (this.w / pcount) + (Math.random() - 0.5) * 90,
        h: 90 + Math.random() * 170,
        phase: Math.random() * 6.28,
        hue: i % 2 ? 'rgba(24,120,110,.5)' : 'rgba(16,96,120,.45)'
      });
    }
  };

  Aquarium.prototype.step = function (dt, t) {
    var ctx = this.ctx, w = this.w, h = this.h, i;
    ctx.clearRect(0, 0, w, h);

    /* --- water depth wash --- */
    var wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, 'rgba(255,255,255,.34)');
    wash.addColorStop(0.45, 'rgba(140,214,236,.06)');
    wash.addColorStop(1, 'rgba(6,58,84,.16)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    /* --- light shafts falling from the surface --- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 4; i++) {
      var sx = (i + 0.5) * (w / 4) + Math.sin(t * 0.22 + i * 1.7) * 70;
      var sw = 60 + i * 26;
      var g = ctx.createLinearGradient(sx, 0, sx + 40, h);
      g.addColorStop(0, 'rgba(255,255,255,.30)');
      g.addColorStop(0.55, 'rgba(214,246,255,.09)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - sw * 0.28, 0);
      ctx.lineTo(sx + sw * 0.28, 0);
      ctx.lineTo(sx + sw * 1.05 + 60, h);
      ctx.lineTo(sx + sw * 0.2 + 60, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    /* --- caustic shimmer just under the surface --- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,.20)';
    ctx.lineWidth = 2.5;
    for (i = 0; i < 3; i++) {
      ctx.beginPath();
      var yBase = 22 + i * 26;
      for (var x = -20; x <= w + 20; x += 18) {
        var y = yBase + Math.sin(x * 0.018 + t * (0.9 + i * 0.25) + i) * (7 + i * 3);
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    /* --- drifting motes --- */
    ctx.save();
    for (i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < -5) m.x = w + 5; if (m.x > w + 5) m.x = -5;
      if (m.y < -5) m.y = h + 5; if (m.y > h + 5) m.y = -5;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    /* --- the fish --- */
    for (i = 0; i < this.fish.length; i++) this.swim(this.fish[i], dt, t);

    /* --- plants along the tank floor --- */
    for (i = 0; i < this.plants.length; i++) {
      var p = this.plants[i];
      Art.drawPlant(ctx, p.x, h + 6, p.h, t, p.hue, p.phase);
    }

    /* --- bubbles --- */
    for (i = this.bubbles.length - 1; i >= 0; i--) {
      var b = this.bubbles[i];
      b.y -= b.v * dt;
      b.w += dt * 2.1;
      var bx = b.x + Math.sin(b.w) * 9;
      if (b.y < -14) { b.y = h + 10; b.x = Math.random() * w; }
      Art.drawBubble(ctx, bx, b.y, b.r, b.a * 0.75);
    }
  };

  Aquarium.prototype.swim = function (f, dt, t) {
    var ctx = this.ctx, w = this.w, h = this.h;

    /* --- wander: a slow, smooth heading drift --- */
    f.wander += dt;
    var desired = Math.sin(f.wander * 0.28 + f.phase) * 0.9 +
                  Math.sin(f.wander * 0.11 + f.phase * 2) * 0.6;
    var target = f.angle + desired * dt * 1.4;

    /* --- steer away from the glass --- */
    var pad = 80 + f.size;
    var ex = 0, ey = 0;
    if (f.x < pad) ex += (pad - f.x) / pad;
    if (f.x > w - pad) ex -= (f.x - (w - pad)) / pad;
    if (f.y < pad) ey += (pad - f.y) / pad;
    if (f.y > h - pad) ey -= (f.y - (h - pad)) / pad;
    if (ex !== 0 || ey !== 0) {
      var escape = Math.atan2(ey, ex);
      target = angleLerp(target, escape, Math.min(1, Math.hypot(ex, ey)) * 0.7);
    }

    /* --- curiosity: fish drift toward the cursor like it's tapping the glass --- */
    if (this.pointer.on) {
      var dx = this.pointer.x - f.x, dy = this.pointer.y - f.y;
      var dist = Math.hypot(dx, dy);
      if (dist < 300 && dist > 24) {
        var toPointer = Math.atan2(dy, dx);
        var pull = (1 - dist / 300) * 0.55 * (0.4 + f.z * 0.6);
        target = angleLerp(target, toPointer, pull);
      }
    }

    f.angle = angleLerp(f.angle, target, Math.min(1, dt * 1.9));

    /* --- the occasional dart, the way real goldfish move --- */
    f.nextDart -= dt;
    if (f.nextDart <= 0) { f.dart = 0.55; f.nextDart = 4 + Math.random() * 11; }
    if (f.dart > 0) f.dart -= dt;
    var speed = f.speed * (f.dart > 0 ? 3.1 : 1);

    f.x += Math.cos(f.angle) * speed * dt;
    f.y += Math.sin(f.angle) * speed * dt;

    // hard wrap as a safety net
    if (f.x < -f.size * 3) f.x = w + f.size * 2;
    if (f.x > w + f.size * 3) f.x = -f.size * 2;
    f.y = Math.max(-f.size, Math.min(h + f.size, f.y));

    /* --- draw --- */
    var bob = Math.sin(t * 1.5 + f.phase) * 0.05;
    ctx.save();
    ctx.globalAlpha = 0.30 + f.z * 0.58;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle + bob);
    // never swim upside-down: mirror instead of rolling over
    if (Math.cos(f.angle) < 0) ctx.scale(1, -1);
    ctx.scale(f.size, f.size);
    Art.drawFish(ctx, f.spec, t * (f.dart > 0 ? 2.2 : 1) + f.phase);
    ctx.restore();
  };

  function angleLerp(a, b, k) {
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * k;
  }

  /* ------------------------------------------------------------------ *
   * Portrait: one showcase fish idling in a small tank (cards, tiles)
   * ------------------------------------------------------------------ */
  function Portrait(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.active = false;
    this.spec = Art.createSpec(opts.variety, opts.seed || 42);
    this.phase = (opts.seed || 42) % 17;
    this.bubbles = [];
    this.scale = opts.scale || 1;
    this.resize();
  }

  Portrait.prototype.resize = function () {
    var f = fit(this.canvas);
    this.ctx = f.ctx; this.w = f.w; this.h = f.h;
    this.bubbles.length = 0;
    var n = Math.max(4, Math.round(this.w / 34));
    for (var i = 0; i < n; i++) {
      this.bubbles.push({
        x: Math.random() * this.w, y: Math.random() * this.h,
        r: 1 + Math.random() * 3.4, v: 10 + Math.random() * 26,
        w: Math.random() * 6.28, a: 0.2 + Math.random() * 0.4
      });
    }
    this.draw(0);
  };

  Portrait.prototype.step = function (dt, t) { this.draw(t + this.phase, dt); };

  Portrait.prototype.draw = function (t, dt) {
    var ctx = this.ctx, w = this.w, h = this.h, i;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // shafts of light in the little tank
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 2; i++) {
      var sx = w * (0.25 + i * 0.45) + Math.sin(t * 0.4 + i) * 14;
      var g = ctx.createLinearGradient(sx, 0, sx + 18, h);
      g.addColorStop(0, 'rgba(255,255,255,.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 12, 0); ctx.lineTo(sx + 12, 0);
      ctx.lineTo(sx + 46, h); ctx.lineTo(sx + 6, h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // gentle floor planting
    Art.drawPlant(ctx, w * 0.14, h + 4, h * 0.42, t, 'rgba(20,110,112,.4)', 1.2);
    Art.drawPlant(ctx, w * 0.9, h + 4, h * 0.32, t, 'rgba(16,96,120,.34)', 3.4);

    // the fish itself, idling in the middle
    var s = Math.min(w, h) * 0.30 * this.scale;
    var cx = w * 0.5 + Math.sin(t * 0.42) * w * 0.09;
    var cy = h * 0.52 + Math.sin(t * 0.75 + 1.2) * h * 0.06;
    var lean = Math.sin(t * 0.42 + Math.PI / 2) * 0.12;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(lean);
    ctx.scale(s, s);
    Art.drawFish(ctx, this.spec, t);
    ctx.restore();

    // bubbles
    if (dt) {
      for (i = 0; i < this.bubbles.length; i++) {
        var b = this.bubbles[i];
        b.y -= b.v * dt; b.w += dt * 2.4;
        if (b.y < -8) { b.y = h + 6; b.x = Math.random() * w; }
      }
    }
    for (i = 0; i < this.bubbles.length; i++) {
      var bb = this.bubbles[i];
      Art.drawBubble(ctx, bb.x + Math.sin(bb.w) * 5, bb.y, bb.r, bb.a * 0.7);
    }
  };

  /* ------------------------------------------------------------------ *
   * Abstract water art for blog cards — caustics, bubbles, no fish
   * ------------------------------------------------------------------ */
  function WaterArt(canvas, seed) {
    this.canvas = canvas;
    this.active = false;
    this.seed = seed || 3;
    this.resize();
  }
  WaterArt.prototype.resize = function () {
    var f = fit(this.canvas);
    this.ctx = f.ctx; this.w = f.w; this.h = f.h;
    var r = Art.rng(this.seed * 7919);
    this.bubbles = [];
    for (var i = 0; i < 16; i++) {
      this.bubbles.push({
        x: r() * this.w, y: r() * this.h,
        r: 2 + r() * 12, v: 6 + r() * 20,
        w: r() * 6.28, a: 0.12 + r() * 0.3
      });
    }
    this.draw(0);
  };
  WaterArt.prototype.step = function (dt, t) { this.draw(t + this.seed, dt); };
  WaterArt.prototype.draw = function (t, dt) {
    var ctx = this.ctx, w = this.w, h = this.h, i;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,.24)';
    ctx.lineWidth = 2;
    for (i = 0; i < 6; i++) {
      ctx.beginPath();
      var base = (i + 0.6) * (h / 6.5);
      for (var x = -10; x <= w + 10; x += 14) {
        var y = base + Math.sin(x * 0.03 + t * (0.6 + i * 0.14) + i * 1.3) * (6 + i * 2.2);
        if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    for (i = 0; i < this.bubbles.length; i++) {
      var b = this.bubbles[i];
      if (dt) { b.y -= b.v * dt; b.w += dt * 1.7; if (b.y < -16) { b.y = h + 12; } }
      Art.drawBubble(ctx, b.x + Math.sin(b.w) * 7, b.y, b.r, b.a);
    }
  };

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */
  function register(scene, el) {
    scenes.push(scene);
    if (REDUCED) { scene.active = false; return scene; }
    if (!el || !('IntersectionObserver' in global)) { scene.active = true; return scene; }
    var io = new IntersectionObserver(function (entries) {
      scene.active = entries[0].isIntersecting;
    }, { rootMargin: '120px' });
    io.observe(el);
    return scene;
  }

  function init() {
    var bg = document.getElementById('aquarium');
    if (bg) {
      var tank = new Aquarium(bg);
      scenes.push(tank);
      if (REDUCED) { tank.active = false; tank.step(0, 0); }
    }

    // portraits: <canvas data-fish="oranda" data-seed="12">
    var portraits = document.querySelectorAll('[data-fish]:not([data-mounted])');
    Array.prototype.forEach.call(portraits, function (c, i) {
      c.setAttribute('data-mounted', '1');
      var p = new Portrait(c, {
        variety: c.getAttribute('data-fish'),
        seed: parseInt(c.getAttribute('data-seed'), 10) || (i + 3) * 31,
        scale: parseFloat(c.getAttribute('data-scale')) || 1
      });
      register(p, c.parentElement || c);
    });

    // abstract water art: <canvas data-water="4">
    var waters = document.querySelectorAll('[data-water]');
    Array.prototype.forEach.call(waters, function (c, i) {
      var a = new WaterArt(c, parseInt(c.getAttribute('data-water'), 10) || i + 1);
      register(a, c.parentElement || c);
    });

    var ro = ('ResizeObserver' in global) ? new ResizeObserver(function (entries) {
      entries.forEach(function (e) {
        var s = e.target.__scene;
        if (s && s.resize) s.resize();
      });
    }) : null;
    scenes.forEach(function (s) {
      if (s.canvas && s.canvas.id !== 'aquarium' && ro) {
        s.canvas.__scene = s;
        ro.observe(s.canvas);
      }
    });

    start();
  }

  global.Aquarium = {
    init: init,
    Portrait: Portrait,
    register: register,
    fit: fit,
    reduced: REDUCED,
    // used by the cart drawer, which creates thumbnails on the fly
    mountPortrait: function (canvas, variety, seed) {
      var p = new Portrait(canvas, { variety: variety, seed: seed, scale: 1.15 });
      return register(p, canvas);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
