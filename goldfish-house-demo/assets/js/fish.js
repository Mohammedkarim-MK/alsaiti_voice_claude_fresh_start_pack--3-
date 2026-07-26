/* ==========================================================================
   fish.js — procedural goldfish renderer (no images, all canvas paths)
   Every fish on this site is drawn by this file: the swimming background,
   the product-card portraits, the cart thumbnails, the blog artwork.
   ========================================================================== */
(function (global) {
  'use strict';

  /* -------- tiny seeded RNG so each fish keeps the same markings -------- */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* -------- the varieties Goldfish House actually stocks -------- */
  var VARIETIES = {
    oranda: {
      label: 'Oranda',
      body: ['#ff8b1a', '#ffc257'], fin: 'rgba(255,178,89,.62)', edge: 'rgba(168,64,4,.5)',
      depth: 0.60, hump: 0.16, wen: 0.9, wenColor: '#f0530f', dorsal: true,
      tail: 1.25, eye: 'normal', marks: 'none'
    },
    redcap: {
      label: 'Red Cap Oranda',
      body: ['#fdfbf7', '#ffffff'], fin: 'rgba(255,255,255,.6)', edge: 'rgba(150,170,180,.45)',
      depth: 0.60, hump: 0.16, wen: 1.0, wenColor: '#e0330f', dorsal: true,
      tail: 1.3, eye: 'normal', marks: 'none'
    },
    ryukin: {
      label: 'Ryukin',
      body: ['#f4530d', '#ffb066'], fin: 'rgba(255,160,90,.6)', edge: 'rgba(150,50,0,.45)',
      depth: 0.76, hump: 0.42, wen: 0, dorsal: true,
      tail: 1.45, eye: 'normal', marks: 'patch'
    },
    ranchu: {
      label: 'Ranchu',
      body: ['#ff7a12', '#ffcf87'], fin: 'rgba(255,180,110,.6)', edge: 'rgba(160,58,2,.45)',
      depth: 0.70, hump: 0.30, wen: 1.1, wenColor: '#e8480d', dorsal: false,
      tail: 0.78, eye: 'normal', marks: 'none'
    },
    lionhead: {
      label: 'Lionhead',
      body: ['#e8430a', '#ff9a4d'], fin: 'rgba(240,130,70,.58)', edge: 'rgba(140,44,0,.45)',
      depth: 0.68, hump: 0.26, wen: 1.25, wenColor: '#c93408', dorsal: false,
      tail: 0.8, eye: 'normal', marks: 'none'
    },
    blackmoor: {
      label: 'Black Moor',
      body: ['#14141c', '#3b3b4d'], fin: 'rgba(40,40,58,.6)', edge: 'rgba(0,0,0,.5)',
      depth: 0.70, hump: 0.20, wen: 0, dorsal: true,
      tail: 1.5, eye: 'telescope', marks: 'none'
    },
    telescope: {
      label: 'Telescope',
      body: ['#e63b2e', '#ff8a6a'], fin: 'rgba(255,140,110,.58)', edge: 'rgba(130,26,16,.45)',
      depth: 0.66, hump: 0.18, wen: 0, dorsal: true,
      tail: 1.45, eye: 'telescope', marks: 'patch'
    },
    calico: {
      label: 'Calico Shubunkin',
      body: ['#cfe6f2', '#f2fbff'], fin: 'rgba(190,224,240,.6)', edge: 'rgba(90,130,155,.4)',
      depth: 0.48, hump: 0.06, wen: 0, dorsal: true,
      tail: 1.2, eye: 'normal', marks: 'calico'
    },
    panda: {
      label: 'Panda Oranda',
      body: ['#fbfdfe', '#ffffff'], fin: 'rgba(230,238,244,.62)', edge: 'rgba(110,130,145,.45)',
      depth: 0.62, hump: 0.18, wen: 0.85, wenColor: '#1c1c26', dorsal: true,
      tail: 1.3, eye: 'telescope', marks: 'panda'
    },
    pearlscale: {
      label: 'Pearlscale',
      body: ['#ff9b2f', '#ffe0b0'], fin: 'rgba(255,200,140,.6)', edge: 'rgba(170,80,10,.4)',
      depth: 0.88, hump: 0.30, wen: 0, dorsal: true,
      tail: 0.85, eye: 'normal', marks: 'pearl'
    },
    bubbleeye: {
      label: 'Bubble Eye',
      body: ['#ff8f3d', '#ffd7a8'], fin: 'rgba(255,190,140,.55)', edge: 'rgba(160,70,10,.4)',
      depth: 0.58, hump: 0.10, wen: 0, dorsal: false,
      tail: 0.95, eye: 'bubble', marks: 'patch'
    },
    comet: {
      label: 'Sarasa Comet',
      body: ['#ffffff', '#fff4ea'], fin: 'rgba(255,120,60,.55)', edge: 'rgba(150,60,20,.35)',
      depth: 0.40, hump: 0.04, wen: 0, dorsal: true,
      tail: 1.7, eye: 'normal', marks: 'sarasa'
    }
  };

  /* -------- pre-computed markings, so a fish never "flickers" -------- */
  function buildMarks(kind, seed) {
    var r = rng(seed), out = [], i, n;
    if (kind === 'calico') {
      n = 11;
      for (i = 0; i < n; i++) {
        out.push({
          x: -0.5 + r() * 1.35,
          y: -0.45 + r() * 0.9,
          rx: 0.07 + r() * 0.15,
          ry: 0.06 + r() * 0.13,
          rot: r() * Math.PI,
          c: r() < 0.42 ? 'rgba(24,24,34,.62)' : (r() < 0.55 ? 'rgba(255,110,40,.72)' : 'rgba(120,180,215,.5)')
        });
      }
    } else if (kind === 'panda') {
      out.push({ x: 0.28, y: -0.16, rx: 0.34, ry: 0.34, rot: 0, c: 'rgba(20,20,28,.9)' });
      out.push({ x: -0.34, y: 0.12, rx: 0.28, ry: 0.3, rot: 0, c: 'rgba(20,20,28,.9)' });
    } else if (kind === 'sarasa') {
      out.push({ x: 0.42, y: -0.1, rx: 0.3, ry: 0.26, rot: 0.2, c: 'rgba(232,60,12,.85)' });
      out.push({ x: -0.28, y: 0.06, rx: 0.26, ry: 0.22, rot: -0.3, c: 'rgba(232,60,12,.8)' });
      out.push({ x: 0.02, y: 0.24, rx: 0.16, ry: 0.13, rot: 0, c: 'rgba(232,60,12,.7)' });
    } else if (kind === 'patch') {
      n = 3;
      for (i = 0; i < n; i++) {
        out.push({
          x: -0.35 + r() * 1.1, y: -0.3 + r() * 0.6,
          rx: 0.14 + r() * 0.16, ry: 0.12 + r() * 0.14,
          rot: r() * Math.PI, c: 'rgba(255,255,255,.55)'
        });
      }
    }
    return out;
  }

  /**
   * Create a fish "spec": variety colours + stable random markings.
   * @param {string} varietyKey  key from VARIETIES
   * @param {number} seed        any integer — same seed, same markings
   */
  function createSpec(varietyKey, seed) {
    var v = VARIETIES[varietyKey] || VARIETIES.oranda;
    var spec = Object.create(v);
    spec.key = VARIETIES[varietyKey] ? varietyKey : 'oranda';
    spec.marksData = buildMarks(v.marks, seed || 7);
    return spec;
  }

  /* ---------------- drawing helpers ---------------- */

  // One flowing veil ribbon, swept back from the caudal peduncle.
  function veil(ctx, x0, y0, len, spread, sway, thick) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(
      x0 - len * 0.35, y0 + spread * 0.25 + sway * 0.35,
      x0 - len * 0.72, y0 + spread * 0.7 + sway * 0.9,
      x0 - len, y0 + spread + sway * 1.4
    );
    ctx.bezierCurveTo(
      x0 - len * 0.78, y0 + spread * 0.55 + sway * 1.15,
      x0 - len * 0.5, y0 + spread * 0.2 + sway * 0.7,
      x0 - len * 0.36, y0 + thick + sway * 0.4
    );
    ctx.bezierCurveTo(
      x0 - len * 0.24, y0 + thick * 0.8 + sway * 0.25,
      x0 - len * 0.1, y0 + thick * 0.4 + sway * 0.1,
      x0, y0
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawTail(ctx, s, t, sway) {
    var x0 = -0.60, len = 0.62 * s.tail;
    ctx.fillStyle = s.fin;
    // upper lobe, lower lobe, and a shorter middle veil between them
    veil(ctx, x0, -0.06, len, -0.42 * s.tail, sway, -0.16);
    veil(ctx, x0, 0.06, len, 0.42 * s.tail, sway * 1.12, 0.16);
    ctx.globalAlpha *= 0.75;
    veil(ctx, x0, 0, len * 0.82, -0.1 * s.tail, sway * 0.85, -0.06);
    veil(ctx, x0, 0, len * 0.82, 0.12 * s.tail, sway * 0.95, 0.06);
    ctx.globalAlpha /= 0.75;
  }

  function drawBody(ctx, s) {
    var d = s.depth;
    var peak = -0.05 - s.hump * 0.55;      // where the back is highest
    var back = -d * (1 + s.hump * 0.55);

    ctx.beginPath();
    ctx.moveTo(0.95, 0);
    ctx.bezierCurveTo(0.82, -d * 0.62, peak + 0.42, back * 0.92, peak, back);
    ctx.bezierCurveTo(peak - 0.24, back * 0.96, -0.44, -d * 0.62, -0.60, -0.12);
    ctx.lineTo(-0.60, 0.12);
    ctx.bezierCurveTo(-0.44, d * 0.6, -0.16, d * 0.92, 0.1, d * 0.95);
    ctx.bezierCurveTo(0.46, d * 0.94, 0.84, d * 0.56, 0.95, 0);
    ctx.closePath();
  }

  function drawWen(ctx, s, t) {
    if (!s.wen) return;
    var d = s.depth, w = s.wen;
    ctx.save();
    ctx.fillStyle = s.wenColor;
    var blobs = [
      [0.74, -d * 0.44, 0.20 * w, 0.17 * w],
      [0.60, -d * 0.62, 0.22 * w, 0.19 * w],
      [0.42, -d * 0.66, 0.20 * w, 0.17 * w],
      [0.80, -d * 0.12, 0.15 * w, 0.15 * w],
      [0.58, -d * 0.30, 0.19 * w, 0.16 * w]
    ];
    for (var i = 0; i < blobs.length; i++) {
      ctx.beginPath();
      ctx.ellipse(blobs[i][0], blobs[i][1], blobs[i][2], blobs[i][3], 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // soft highlight so the wen reads as raspberry-textured, not flat
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = '#fff';
    for (var j = 0; j < blobs.length; j++) {
      ctx.beginPath();
      ctx.ellipse(blobs[j][0] + 0.03, blobs[j][1] - 0.04, blobs[j][2] * 0.4, blobs[j][3] * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEye(ctx, s, t) {
    var d = s.depth;
    var ex = 0.70 - s.wen * 0.04, ey = -d * 0.30;
    ctx.save();
    if (s.eye === 'telescope') {
      ctx.fillStyle = s.body[0];
      ctx.beginPath(); ctx.ellipse(ex + 0.02, ey - 0.05, 0.135, 0.135, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.ellipse(ex + 0.03, ey - 0.06, 0.088, 0.088, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.ellipse(ex + 0.06, ey - 0.095, 0.03, 0.026, 0, 0, Math.PI * 2); ctx.fill();
    } else if (s.eye === 'bubble') {
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.ellipse(ex, ey, 0.055, 0.055, 0, 0, Math.PI * 2); ctx.fill();
      var g = ctx.createRadialGradient(ex - 0.02, ey + 0.14, 0.02, ex, ey + 0.18, 0.20);
      g.addColorStop(0, 'rgba(255,255,255,.75)');
      g.addColorStop(1, 'rgba(255,214,170,.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ex - 0.04, ey + 0.20 + Math.sin(t * 1.6) * 0.012, 0.19, 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.012; ctx.stroke();
    } else {
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath(); ctx.ellipse(ex, ey, 0.082, 0.082, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101018';
      ctx.beginPath(); ctx.ellipse(ex + 0.012, ey, 0.052, 0.055, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.ellipse(ex + 0.032, ey - 0.028, 0.02, 0.018, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draw one goldfish at the origin, nose pointing along +X, unit length ≈ 1.6.
   * Caller handles translate/rotate/scale.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} spec  from createSpec()
   * @param {number} t     seconds — drives tail sway, fin flutter, gill breathing
   */
  function drawFish(ctx, spec, t) {
    var s = spec, d = s.depth;
    var sway = Math.sin(t * 2.6) * 0.20;
    var flutter = Math.sin(t * 4.1) * 0.10;

    ctx.save();

    /* ---- tail first, so it sits behind the body ---- */
    drawTail(ctx, s, t, sway);

    /* ---- anal + pelvic fins (behind body) ---- */
    ctx.fillStyle = s.fin;
    ctx.beginPath();
    ctx.moveTo(-0.30, d * 0.72);
    ctx.quadraticCurveTo(-0.46, d * 1.05 + flutter * 0.5, -0.62, d * 1.28 + flutter);
    ctx.quadraticCurveTo(-0.44, d * 0.92 + flutter * 0.4, -0.16, d * 0.78);
    ctx.closePath();
    ctx.fill();

    /* ---- dorsal fin ---- */
    if (s.dorsal) {
      ctx.beginPath();
      ctx.moveTo(0.16, -d * 0.92 - s.hump * 0.3);
      ctx.bezierCurveTo(
        0.06, -d * 1.42 - s.hump * 0.5 + flutter * 0.4,
        -0.24, -d * 1.34 - s.hump * 0.4 + flutter * 0.5,
        -0.46, -d * 0.86 + flutter * 0.3
      );
      ctx.bezierCurveTo(-0.30, -d * 0.86, -0.06, -d * 0.96, 0.16, -d * 0.92 - s.hump * 0.3);
      ctx.closePath();
      ctx.fill();
    }

    /* ---- body ---- */
    drawBody(ctx, s);
    var grad = ctx.createLinearGradient(0, -d * 1.3, 0, d * 1.1);
    grad.addColorStop(0, s.body[0]);
    grad.addColorStop(0.55, s.body[1]);
    grad.addColorStop(1, s.body[0]);
    ctx.fillStyle = grad;
    ctx.fill();

    /* ---- markings, clipped to the body ---- */
    if (s.marksData && s.marksData.length) {
      ctx.save();
      drawBody(ctx, s);
      ctx.clip();
      for (var i = 0; i < s.marksData.length; i++) {
        var m = s.marksData[i];
        ctx.fillStyle = m.c;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y * d * 1.5, m.rx, m.ry, m.rot, 0, Math.PI * 2);
        ctx.fill();
      }
      if (s.marks === 'pearl') {
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        for (var gx = -0.5; gx < 0.85; gx += 0.15) {
          for (var gy = -0.85; gy < 0.85; gy += 0.15) {
            ctx.beginPath();
            ctx.ellipse(gx, gy * d * 1.1, 0.048, 0.045, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    /* ---- sheen down the back + belly light ---- */
    ctx.save();
    drawBody(ctx, s);
    ctx.clip();
    var sheen = ctx.createLinearGradient(0, -d * 1.2, 0, d * 0.4);
    sheen.addColorStop(0, 'rgba(255,255,255,.42)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-0.8, -d * 1.4, 2, d * 1.9);
    // gill plate
    ctx.strokeStyle = 'rgba(0,0,0,.13)';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(0.52, -d * 0.52);
    ctx.quadraticCurveTo(0.40 + Math.sin(t * 1.9) * 0.012, 0, 0.54, d * 0.52);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = s.edge;
    ctx.lineWidth = 0.018;
    drawBody(ctx, s);
    ctx.stroke();

    drawWen(ctx, s, t);

    /* ---- pectoral fin (in front of the body) ---- */
    ctx.fillStyle = s.fin;
    ctx.save();
    ctx.translate(0.40, d * 0.30);
    ctx.rotate(Math.sin(t * 5.2) * 0.30 + 0.35);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-0.16, 0.20, -0.34, 0.30);
    ctx.quadraticCurveTo(-0.20, 0.08, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* ---- mouth ---- */
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 0.026;
    ctx.beginPath();
    var gape = 0.03 + Math.abs(Math.sin(t * 1.9)) * 0.035;
    ctx.moveTo(0.96, -0.01);
    ctx.quadraticCurveTo(0.90, gape, 0.86, 0.03);
    ctx.stroke();

    drawEye(ctx, s, t);

    ctx.restore();
  }

  /* ---------------- shared bits used by scenes ---------------- */

  function drawBubble(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(0.65, 'rgba(255,255,255,.16)');
    g.addColorStop(1, 'rgba(255,255,255,.42)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = Math.max(0.6, r * 0.09);
    ctx.stroke();
    ctx.restore();
  }

  // A swaying aquarium plant rooted at (x, baseY).
  function drawPlant(ctx, x, baseY, h, t, hue, phase) {
    var blades = 5;
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < blades; i++) {
      var off = (i - blades / 2) * (h * 0.055);
      var lean = Math.sin(t * 0.6 + phase + i * 0.7) * h * 0.14;
      var len = h * (0.62 + (i % 3) * 0.19);
      ctx.beginPath();
      ctx.moveTo(x + off - h * 0.02, baseY);
      ctx.quadraticCurveTo(x + off + lean * 0.4, baseY - len * 0.55, x + off + lean, baseY - len);
      ctx.quadraticCurveTo(x + off + lean * 0.45 + h * 0.02, baseY - len * 0.5, x + off + h * 0.02, baseY);
      ctx.closePath();
      ctx.fillStyle = hue;
      ctx.fill();
    }
    ctx.restore();
  }

  global.GoldfishArt = {
    VARIETIES: VARIETIES,
    keys: Object.keys(VARIETIES),
    createSpec: createSpec,
    drawFish: drawFish,
    drawBubble: drawBubble,
    drawPlant: drawPlant,
    rng: rng
  };
})(window);
