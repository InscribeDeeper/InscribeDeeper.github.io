(function () {
  var button = document.querySelector("[data-qr-action]");
  var dialog = document.getElementById("qr-dialog");
  if (!button || !dialog) {
    return;
  }

  var canvas = dialog.querySelector("[data-qr-canvas]");
  var urlLabel = dialog.querySelector("[data-qr-url]");
  var hintFlat = dialog.querySelectorAll("[data-qr-hint-flat]");
  var hint3d = dialog.querySelectorAll("[data-qr-hint-3d]");
  var ctx = canvas.getContext("2d");

  var SIZE = 300; /* css px — keep in sync with .qr-dialog-code */
  var QUIET = 4; /* quiet-zone modules scanners expect around the symbol */
  /* "quick head-turn" blink: grey-in 0–150ms, camera cut at 170ms, fast
     150ms camera sweep, refocus done by 460ms. The scene itself is rigid —
     the two layouts swap behind the blink, never on screen. */
  var FX_GREY_MS = 150;
  var FX_CUT_MS = 170;
  var FX_TOTAL_MS = 460;
  var CAM_MS = 150;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ONE centred object: the tree's CANOPY is the QR code. The code lives
     on a vertical plane — every dark module is a dense little cluster of
     low-poly leaf blocks whose front projection exactly fills its cell;
     light modules are see-through gaps in the foliage. Scanning view =
     camera level, straight at the canopy (trunk peeking out below).
     Dragging rotates the very same canopy body, revealing its depth,
     branches and the full tree. No second model, no flat picture. */
  var SIDE_SIN = 0.53; /* showcase view: ~45° isometric */
  var SIDE_COS = 0.848;
  var THETA_HOME = Math.PI / 4;
  var SPIN_SPEED = 0.00009;

  var CREAM = [251, 246, 234];
  var CODE_TILE = [244, 238, 221]; /* light modules: pale floor tiles */
  var PLATE_A = [240, 231, 211];
  var PLATE_B = [233, 223, 202];
  var TRUNK_BROWNS = [[146, 106, 76], [128, 91, 64], [110, 77, 54]];
  var GRASS_GREENS = [[124, 179, 66], [139, 195, 74], [104, 159, 56]];
  var FLOWER_COLORS = [[244, 143, 177], [255, 224, 130], [248, 187, 208]];

  var month = new Date().getMonth() + 1;
  var SEASON =
    month >= 3 && month <= 5 ? "spring" :
    month >= 6 && month <= 8 ? "summer" :
    month >= 9 && month <= 11 ? "autumn" : "winter";
  var THEMES = {
    spring: {
      tree: [[168, 210, 109], [139, 195, 74], [124, 179, 66], [174, 213, 129], [244, 143, 177]],
      qr: [[35, 87, 44], [46, 100, 51], [27, 77, 42], [56, 106, 47]],
      finder: [24, 61, 33],
      petals: ["#f8bbd0", "#f48fb1", "#ffe082"],
      snow: false
    },
    summer: {
      tree: [[168, 210, 109], [139, 195, 74], [124, 179, 66], [156, 204, 101], [85, 139, 47]],
      qr: [[27, 77, 42], [40, 90, 45], [51, 105, 30], [33, 84, 36]],
      finder: [21, 61, 31],
      petals: ["#f8bbd0", "#ffe082", "#f48fb1"],
      snow: false
    },
    autumn: {
      tree: [[217, 164, 65], [199, 123, 59], [168, 91, 50], [138, 154, 91], [180, 130, 60]],
      qr: [[105, 60, 30], [88, 51, 27], [120, 68, 30], [96, 58, 32]],
      finder: [74, 42, 22],
      petals: ["#ffb74d", "#ff8a65", "#ffd54f"],
      snow: false
    },
    winter: {
      tree: [[156, 175, 136], [126, 147, 122], [181, 196, 168], [142, 158, 134], [206, 216, 199]],
      qr: [[54, 68, 55], [44, 58, 48], [63, 78, 62], [50, 66, 54]],
      finder: [38, 50, 41],
      petals: ["#f4f7f2", "#e3ebe0", "#dde7ea"],
      snow: true
    }
  };
  var theme = THEMES[SEASON];

  var modCount = 0;
  var g = 0;
  var cells = []; /* dark modules, for the scanning view */
  var nodes = []; /* everything with depth: lawn, veg, tree, grass, flowers */
  var order = [];
  var treePos = null; /* {discR} ground base */
  var treeFit = null;
  var flatFit = null;
  var currentUrl = null;

  var mode = 0;
  var t = 0; /* camera tilt parameter */
  var layoutMode = 0; /* which of the two layouts is on stage (0 scan · 1 tree) */
  var fxActive = false;
  var fxStart = 0;
  var fxCut = false;
  var fxAlpha = 0;
  var theta = 0;
  var spinSettled = false;
  var flattenTheta = 0;
  var flattenT0 = 1;
  var dragging = false;
  var dragMoved = false;
  var dragX0 = 0;
  var dragTheta0 = 0;
  var introAt = 0;
  var introDone = false;
  var rafId = null;
  var lastNow = 0;
  var petals = [];
  var petalSeed = 1;
  var sceneSeed = 7;

  function cellHash(r, c) {
    var h = ((r + 1) * 73856093) ^ ((c + 1) * 19349663);
    return (h >>> 0) % 1024;
  }

  function hashUnit(r, c, salt) {
    var h = ((r + 1) * 73856093) ^ ((c + 1) * 19349663) ^ ((salt + 1) * 83492791);
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    return (h % 100000) / 100000;
  }

  function srand() {
    /* deterministic scene: identical layout every frame and every open */
    sceneSeed = (sceneSeed * 48271) % 2147483647;
    return sceneSeed / 2147483647;
  }

  function prand() {
    petalSeed = (petalSeed * 48271) % 2147483647;
    return petalSeed / 2147483647;
  }

  function lerp(a, b, x) {
    return a + (b - a) * x;
  }

  function easeInOut(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function normAngle(a) {
    a = a % 6.28318;
    if (a > 3.14159) {
      a -= 6.28318;
    }
    if (a < -3.14159) {
      a += 6.28318;
    }
    return a;
  }

  function rgb(col, mul) {
    return "rgb(" + Math.round(col[0] * mul) + "," + Math.round(col[1] * mul) + "," + Math.round(col[2] * mul) + ")";
  }

  function mix(a, b, x) {
    return [lerp(a[0], b[0], x), lerp(a[1], b[1], x), lerp(a[2], b[2], x)];
  }

  function inFinder(r, c, n) {
    return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  }

  function buildMatrix(url) {
    var qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    modCount = qr.getModuleCount();
    g = modCount + QUIET * 2;
    cells = [];
    nodes = [];
    sceneSeed = 7;
    var half = g / 2;
    var mid = (modCount - 1) / 2;
    var GROUND_R = 0.72;
    var H = g * 0.78; /* total tree height */
    var Rmax = g * 0.3; /* crown max radius, reached at 40–65% height */
    var r, c, i, k;

    /* crown radius profile: bare below 25%, widest in the 40–65% band,
       tapering to an irregular top */
    function shape(hbar) {
      return hbar < 0.2 ? 0.55 + 2.25 * hbar
        : hbar < 0.55 ? 1
        : Math.max(0.12, 1 - 0.85 * (hbar - 0.55) / 0.45);
    }
    function asym(a) {
      /* natural left/right imbalance of the branches */
      return 1 + 0.22 * Math.sin(a * 3 + 1.7) + 0.14 * Math.sin(a * 5 + 0.6);
    }

    /* branch anchor directions for the visible forks */
    var clusters = [];
    for (k = 0; k < 3; k++) {
      var angK = k * 2.09 + 0.6;
      clusters.push([Math.cos(angK) * Rmax * 0.55, Math.sin(angK) * Rmax * 0.55, H * (0.45 + k * 0.1)]);
    }

    /* ---- every dark module gets TWO homes: its QR grid cell (as turf)
       and a spot on the tree (crown leaf, or the same turf for the outer
       ring and all corner patterns, which stay lawn forever) ---- */
    for (r = 0; r < modCount; r++) {
      for (c = 0; c < modCount; c++) {
        if (!qr.isDark(r, c)) {
          continue;
        }
        var finder = inFinder(r, c, modCount);
        var solid = r === 6 || c === 6 ||
          (r >= modCount - 9 && r <= modCount - 5 && c >= modCount - 9 && c <= modCount - 5);
        var cx = c + QUIET + 0.5 - half;
        var cy = r + QUIET + 0.5 - half;
        var u = (c - mid) / mid;
        var v = (r - mid) / mid;
        var rN = Math.max(Math.abs(u), Math.abs(v));
        var grounded = rN >= GROUND_R || finder || solid;
        var col0 = finder || solid ? theme.finder : theme.qr[cellHash(r, c) % theme.qr.length];
        var cell = {
          cx: cx,
          cy: cy,
          finder: finder,
          solid: solid,
          col: col0,
          delay: Math.min(430, Math.sqrt((r - mid) * (r - mid) + (c - mid) * (c - mid)) * 13)
        };
        cells.push(cell);
        var dF = 10 + rN * 240; /* to the tree: centre lifts first */
        var dR = 10 + Math.max(0, 1 - rN / GROUND_R) * 240; /* back: rim first */
        var turfH = 0.3 + hashUnit(r, c, 15) * 0.15;

        if (grounded) {
          nodes.push({
            kind: "turf",
            wx: cx,
            wy: cy,
            z: 0,
            h: turfH,
            size: 1,
            col: col0,
            tcol: finder || solid ? mix(theme.finder, theme.tree[1], 0.45) : theme.tree[cellHash(r, c) % 3],
            delay: cell.delay
          });
          if (!solid && hashUnit(r, c, 16) < 0.35) {
            nodes.push({
              kind: "blade",
              wx: cx,
              wy: cy,
              z: turfH,
              h: 0.9 + hashUnit(r, c, 17) * 0.8,
              col: theme.tree[cellHash(r, c) % 3],
              delay: cell.delay
            });
          }
          continue;
        }

        /* crown home: sample the crown volume directly — mid-band biased
           height (widest at 40–65% of the tree), angular asymmetry, and a
           sqrt radial fill give one continuous, lumpy mass of foliage */
        var hbar = Math.max(0.04, Math.min(0.96, (hashUnit(r, c, 41) + hashUnit(r, c, 44)) / 2 * 0.92 + 0.04));
        var angM = hashUnit(r, c, 45) * 6.28318;
        var rrM = Rmax * shape(hbar) * asym(angM) * Math.sqrt(hashUnit(r, c, 46));
        var tx = Math.cos(angM) * rrM;
        var ty = Math.sin(angM) * rrM;
        var tz = Math.max(H * 0.25 + 0.4, H * (0.25 + 0.72 * hbar));
        /* two blocks per module: cover + accent, both teleporting */
        nodes.push({
          kind: "leafm",
          sx: cx, sy: cy, sz: 0, ssize: 1, sh: turfH,
          tx: tx, ty: ty, tz: tz, tsize: 0.95, th: 0.95,
          dF: dF, dR: dR,
          col: col0,
          tcol: theme.tree[cellHash(r, c) % theme.tree.length],
          light: 0.8 + 0.28 * (tz / H),
          delay: cell.delay
        });
        var s2 = 0.45 + hashUnit(r, c, 31) * 0.2;
        nodes.push({
          kind: "leafm",
          sx: cx + (hashUnit(r, c, 32) * 2 - 1) * (1 - s2) / 2,
          sy: cy + (hashUnit(r, c, 33) * 2 - 1) * (1 - s2) / 2,
          sz: turfH, ssize: s2, sh: 0.26,
          tx: tx + (hashUnit(r, c, 34) * 2 - 1) * 1.3,
          ty: ty + (hashUnit(r, c, 35) * 2 - 1) * 1.3,
          tz: Math.max(H * 0.25 + 0.4, tz - 0.5 - hashUnit(r, c, 36) * 0.9),
          tsize: 0.6 + hashUnit(r, c, 37) * 0.25, th: 0.7,
          dF: dF + 40, dR: dR + 40,
          col: theme.qr[(cellHash(r, c) + 1) % theme.qr.length],
          tcol: theme.tree[(cellHash(r, c) + 1) % theme.tree.length],
          light: 0.76 + 0.26 * (tz / H),
          delay: cell.delay
        });
      }
    }

    /* ---- decorative trunk, roots and forks: the bottom quarter of the
       tree is bare wood. Fades with the morph so the overhead scan never
       sees it. ---- */
    var trunkTop = H * 0.62;
    for (var lv = 0; lv < trunkTop; lv++) {
      var wide = lv < H * 0.45;
      var n2 = wide ? 4 : 1;
      for (k = 0; k < n2; k++) {
        nodes.push({
          kind: "wood",
          wx: wide ? (k % 2) - 0.5 : 0,
          wy: wide ? Math.floor(k / 2) - 0.5 : 0,
          z: lv,
          h: 1,
          size: wide ? (lv < H * 0.12 ? 1.08 : 0.95) : 0.85,
          col: TRUNK_BROWNS[(lv + k) % TRUNK_BROWNS.length]
        });
      }
    }
    for (k = 0; k < 4; k++) {
      var ra = k * 1.5708 + 0.4;
      nodes.push({
        kind: "wood",
        wx: Math.cos(ra) * 1.6,
        wy: Math.sin(ra) * 1.6,
        z: 0,
        h: 0.6,
        size: 0.75,
        col: TRUNK_BROWNS[k % TRUNK_BROWNS.length]
      });
    }
    for (k = 0; k < 3; k++) {
      var cl2 = clusters[k * 3 % clusters.length];
      var len = Math.sqrt(cl2[0] * cl2[0] + cl2[1] * cl2[1]) || 1;
      for (var bs = 1; bs <= 3; bs++) {
        nodes.push({
          kind: "wood",
          wx: (cl2[0] / len) * bs * 1.3,
          wy: (cl2[1] / len) * bs * 1.3,
          z: H * 0.32 + k * H * 0.09 + bs * 0.9,
          h: 0.7,
          size: 0.6,
          col: TRUNK_BROWNS[(k + bs) % TRUNK_BROWNS.length]
        });
      }
    }

    /* sparse life just outside the code square */
    treePos = { baseHalf: half + 2 };
    for (i = 0; i < 8; i++) {
      var side = Math.floor(srand() * 4);
      var along = (srand() * 2 - 1) * (half + 0.8);
      var out = half + 0.7 + srand() * 1.0;
      nodes.push({
        kind: "grass",
        wx: side === 0 ? along : side === 1 ? along : out * (side === 2 ? 1 : -1),
        wy: side === 0 ? -out : side === 1 ? out : along,
        z: 0,
        h: 1 + srand() * 1.1,
        col: GRASS_GREENS[Math.floor(srand() * GRASS_GREENS.length)]
      });
    }
    for (i = 0; i < 5; i++) {
      var side2 = Math.floor(srand() * 4);
      var along2 = (srand() * 2 - 1) * (half + 0.6);
      var out2 = half + 0.7 + srand() * 1.0;
      nodes.push({
        kind: "flower",
        wx: side2 === 0 ? along2 : side2 === 1 ? along2 : out2 * (side2 === 2 ? 1 : -1),
        wy: side2 === 0 ? -out2 : side2 === 1 ? out2 : along2,
        z: 0.3,
        col: FLOWER_COLORS[Math.floor(srand() * FLOWER_COLORS.length)]
      });
    }

    flatFit = {
      minX: -(half + 1.5),
      maxX: half + 1.5,
      minY: -(half + 1.5),
      maxY: half + 1.5
    };
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    var baseRad = treePos.baseHalf * 1.4143;
    minX = -baseRad;
    maxX = baseRad;
    maxY = baseRad * SIDE_SIN + 0.6;
    minY = -baseRad * SIDE_SIN;
    for (i = 0; i < nodes.length; i++) {
      var q = nodes[i];
      var qx = q.tx !== undefined ? q.tx : q.wx;
      var qy = q.ty !== undefined ? q.ty : q.wy;
      var qz = q.tz !== undefined ? q.tz : q.z;
      var rad2 = Math.sqrt(qx * qx + qy * qy) + 1;
      minX = Math.min(minX, -rad2);
      maxX = Math.max(maxX, rad2);
      minY = Math.min(minY, -rad2 * SIDE_SIN - (qz + (q.h || 1) + 0.6) * SIDE_COS);
      maxY = Math.max(maxY, rad2 * SIDE_SIN - qz * SIDE_COS);
    }
    treeFit = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };

    order = [];
    for (i = 0; i < nodes.length; i++) {
      order.push(i);
    }
  }

  function introAlpha(cell, now) {
    if (introDone || cell.delay === undefined) {
      return 1;
    }
    var x = (now - introAt - cell.delay) / 260;
    return x <= 0 ? 0 : x >= 1 ? 1 : x;
  }

  function updatePetals(dt, e) {
    if (mode === 1 && !reduceMotion && e > 0.6 && petals.length < 12 && prand() < 0.1) {
      petals.push({
        x: prand() * SIZE,
        y: -8,
        vy: (theme.snow ? 14 : 20) + prand() * (theme.snow ? 14 : 24),
        sway: (theme.snow ? 5 : 8) + prand() * (theme.snow ? 8 : 13),
        phase: prand() * 6.28,
        rot: prand() * 6.28,
        color: theme.petals[Math.floor(prand() * theme.petals.length)]
      });
    }
    for (var i = petals.length - 1; i >= 0; i--) {
      var p = petals[i];
      p.y += p.vy * dt / 1000;
      p.phase += dt / 700;
      p.rot += dt / 900;
      if (p.y > SIZE + 10 || e < 0.4) {
        petals.splice(i, 1);
      }
    }
  }

  function drawPetals(e) {
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      ctx.save();
      ctx.globalAlpha = 0.9 * e;
      ctx.translate(p.x + Math.sin(p.phase) * p.sway, p.y);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (theme.snow) {
        ctx.arc(0, 0, 2.4, 0, 6.29);
      } else {
        ctx.rotate(p.rot);
        ctx.roundRect(-3.2, -2.1, 6.4, 4.2, 2.1);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  function draw(now) {
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== SIZE * dpr) {
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgb(CREAM, 1);
    ctx.fillRect(0, 0, SIZE, SIZE);

    var e = easeInOut(t);
    var half = g / 2;

    var cosT = Math.cos(theta);
    var sinT = Math.sin(theta);
    var sa = lerp(1, SIDE_SIN, e);
    var ca = lerp(0, SIDE_COS, e);
    var PK = 0.0045 * e;

    var minX = lerp(flatFit.minX, treeFit.minX, e);
    var maxX = lerp(flatFit.maxX, treeFit.maxX, e);
    var minY = lerp(flatFit.minY, treeFit.minY, e);
    var maxY = lerp(flatFit.maxY, treeFit.maxY, e);
    var pad = lerp(1, 0.95, e);
    var s = (SIZE * pad) / Math.max(maxX - minX, maxY - minY);
    s *= 1 + 0.025 * fxAlpha; /* whisper of an FOV pulse during the blink */
    var ox = (SIZE - s * (maxX + minX)) / 2;
    var oy = (SIZE - s * (maxY + minY)) / 2;

    function drawFx() {
      /* tunnel-vision vignette closing toward the centre, scene-area only */
      if (fxAlpha <= 0.01) {
        return;
      }
      var inner = lerp(0.55, 0.12, fxAlpha) * SIZE;
      var gradFx = ctx.createRadialGradient(SIZE / 2, SIZE / 2, inner, SIZE / 2, SIZE / 2, SIZE * 0.78);
      gradFx.addColorStop(0, "rgba(126, 120, 108, 0)");
      gradFx.addColorStop(0.55, "rgba(126, 120, 108, " + (0.35 * fxAlpha).toFixed(3) + ")");
      gradFx.addColorStop(1, "rgba(126, 120, 108, " + (0.88 * fxAlpha).toFixed(3) + ")");
      ctx.fillStyle = gradFx;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }

    function px_(wx, wy) {
      var ry = wx * sinT + wy * cosT;
      return ox + s * (wx * cosT - wy * sinT) * (1 + ry * PK);
    }
    function py_(wx, wy, z) {
      var ry = wx * sinT + wy * cosT;
      return oy + s * (ry * sa - z * ca) * (1 + ry * PK);
    }

    var i, node;
    var bh = treePos.baseHalf;

    /* soil base */
    ctx.fillStyle = rgb(PLATE_A, 1);
    ctx.beginPath();
    ctx.moveTo(px_(-bh, -bh), py_(-bh, -bh, 0));
    ctx.lineTo(px_(bh, -bh), py_(bh, -bh, 0));
    ctx.lineTo(px_(bh, bh), py_(bh, bh, 0));
    ctx.lineTo(px_(-bh, bh), py_(-bh, bh, 0));
    ctx.closePath();
    ctx.fill();

    if (t <= 0.0001) {
      /* fully settled scan state: exact overhead grid, pixel-snapped */
      var fcorners = [[0, 0], [0, modCount - 7], [modCount - 7, 0]];
      var u = Math.round(s * dpr) / dpr;
      for (i = 0; i < fcorners.length; i++) {
        var fx = fcorners[i][1] + QUIET - half;
        var fy = fcorners[i][0] + QUIET - half;
        var fpx = Math.round(px_(fx, fy) * dpr) / dpr;
        var fpy = Math.round(py_(fx, fy, 0) * dpr) / dpr;
        ctx.fillStyle = rgb(theme.finder, 1);
        ctx.fillRect(fpx, fpy, 7 * u, 7 * u);
        ctx.fillStyle = rgb(PLATE_A, 1);
        ctx.fillRect(fpx + u, fpy + u, 5 * u, 5 * u);
        ctx.fillStyle = rgb(theme.finder, 1);
        ctx.fillRect(fpx + 2 * u, fpy + 2 * u, 3 * u, 3 * u);
      }
      for (i = 0; i < cells.length; i++) {
        node = cells[i];
        if (node.finder) {
          continue;
        }
        var a0 = introAlpha(node, now);
        if (a0 <= 0) {
          continue;
        }
        var w = node.solid ? 1 : 0.95;
        var x0 = px_(node.cx - w / 2, node.cy - w / 2);
        var y0 = py_(node.cx - w / 2, node.cy - w / 2, 0);
        var pw = w * s;
        if (introDone) {
          x0 = Math.round(x0 * dpr) / dpr;
          y0 = Math.round(y0 * dpr) / dpr;
          pw = Math.round(pw * dpr) / dpr;
        }
        ctx.globalAlpha = a0;
        ctx.fillStyle = rgb(node.col, 1);
        ctx.fillRect(x0, y0, pw, pw);
      }
      ctx.globalAlpha = 1;
      drawPetals(e);
      drawFx();
      return;
    }

    ctx.globalAlpha = e * 0.6;
    ctx.fillStyle = "rgba(94, 84, 60, 0.16)";
    ctx.beginPath();
    ctx.ellipse(px_(0, 0), py_(0, 0, 0) + 1, half * 0.55 * s, half * 0.55 * s * sa, 0, 0, 6.29);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* ---- rigid staging: whichever layout is on stage stands perfectly
       still; the camera (and the blink) do all the moving ---- */
    for (i = 0; i < nodes.length; i++) {
      node = nodes[i];
      if (node.kind === "leafm") {
        node._q = layoutMode;
        node._x = layoutMode ? node.tx : node.sx;
        node._y = layoutMode ? node.ty : node.sy;
        node._z = layoutMode ? node.tz : node.sz;
        node._size = layoutMode ? node.tsize : node.ssize;
        node._h = layoutMode ? node.th : node.sh;
      } else {
        node._q = node.kind === "wood" ? e : easeInOut(t);
        node._x = node.wx;
        node._y = node.wy;
        node._z = node.z;
        node._size = node.size || 1;
        node._h = node.h || 1;
      }
      node.depth = node._x * sinT + node._y * cosT + node._z * 0.01;
    }
    order.sort(function (a, b) {
      return nodes[a].depth - nodes[b].depth;
    });

    var wob = reduceMotion ? 0 : 0.1 * e;
    for (var oi = 0; oi < order.length; oi++) {
      node = nodes[order[oi]];
      var alpha = introAlpha(node, now);
      if (node.kind === "wood") {
        /* the trunk leads the reassembly and is gone from overhead scans */
        alpha *= Math.max(0, Math.min(1, t * 2.2));
      }
      if (alpha <= 0.01) {
        continue;
      }
      ctx.globalAlpha = alpha;

      if (node.kind === "grass" || node.kind === "blade") {
        ctx.globalAlpha = alpha * (node.kind === "blade" ? Math.max(0.25, e) : 1);
        ctx.fillStyle = rgb(node.col, 1);
        for (var b2 = -1; b2 <= 1; b2++) {
          var bx2 = node._x + b2 * (node.kind === "blade" ? 0.24 : 0.55);
          var bhh = node._h * (b2 === 0 ? 1 : 0.72);
          ctx.beginPath();
          ctx.moveTo(px_(bx2 - 0.22, node._y), py_(bx2 - 0.22, node._y, node._z));
          ctx.lineTo(px_(bx2 + 0.22, node._y), py_(bx2 + 0.22, node._y, node._z));
          ctx.lineTo(px_(bx2 + b2 * 0.14, node._y), py_(bx2 + b2 * 0.14, node._y, node._z + bhh));
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }
      if (node.kind === "flower") {
        ctx.fillStyle = rgb(node.col, 1);
        ctx.beginPath();
        ctx.arc(px_(node._x, node._y), py_(node._x, node._y, node._z), Math.max(1.6, 0.2 * s), 0, 6.29);
        ctx.fill();
        continue;
      }

      var hf = node._size / 2;
      var z0 = node._z;
      var z1 = node._z + node._h;
      if (node.kind === "leafm" && node._q > 0.99 && node._z > 2 && wob) {
        z0 += Math.sin(now * 0.002 + (node._x + node._y) * 0.6) * wob;
        z1 += Math.sin(now * 0.002 + (node._x + node._y) * 0.6) * wob;
      }
      var light = node.light || 1;
      var bcol = node.tcol ? mix(node.col, node.tcol, node._q) : node.col;

      for (var side = 0; side < 4; side++) {
        var dxs = side === 0 ? 1 : side === 1 ? -1 : 0;
        var dys = side === 2 ? 1 : side === 3 ? -1 : 0;
        var ny = dxs * sinT + dys * cosT;
        if (ny <= 0.02) {
          continue;
        }
        var nx = dxs * cosT - dys * sinT;
        var mul = Math.min(1, 0.55 + 0.3 * ny + 0.15 * Math.max(nx, 0));
        var pax = node._x + (dxs !== 0 ? dxs * hf : -hf);
        var pay = node._y + (dys !== 0 ? dys * hf : -hf);
        var pbx = node._x + (dxs !== 0 ? dxs * hf : hf);
        var pby = node._y + (dys !== 0 ? dys * hf : hf);
        ctx.fillStyle = rgb(bcol, mul * light);
        ctx.beginPath();
        ctx.moveTo(px_(pax, pay), py_(pax, pay, z1));
        ctx.lineTo(px_(pbx, pby), py_(pbx, pby, z1));
        ctx.lineTo(px_(pbx, pby), py_(pbx, pby, z0));
        ctx.lineTo(px_(pax, pay), py_(pax, pay, z0));
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = rgb(bcol, Math.min(1.08, light * 1.05));
      ctx.beginPath();
      ctx.moveTo(px_(node._x - hf, node._y - hf), py_(node._x - hf, node._y - hf, z1));
      ctx.lineTo(px_(node._x + hf, node._y - hf), py_(node._x + hf, node._y - hf, z1));
      ctx.lineTo(px_(node._x + hf, node._y + hf), py_(node._x + hf, node._y + hf, z1));
      ctx.lineTo(px_(node._x - hf, node._y + hf), py_(node._x - hf, node._y + hf, z1));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawPetals(e);
    drawFx();
  }

  function setHints() {
    var i;
    for (i = 0; i < hintFlat.length; i++) {
      hintFlat[i].hidden = mode === 1;
    }
    for (i = 0; i < hint3d.length; i++) {
      hint3d[i].hidden = mode !== 1;
    }
  }

  function needsFrames() {
    return fxActive || !introDone || t !== mode || mode === 1;
  }

  function tick(now) {
    var dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;
    if (!introDone && now - introAt > 430 + 300) {
      introDone = true;
    }
    if (fxActive) {
      var fa = now - fxStart;
      if (!fxCut && fa >= FX_CUT_MS) {
        fxCut = true;
        layoutMode = mode; /* the swap happens at peak grey — never visible */
        if (mode === 1) {
          spinSettled = false;
        } else {
          flattenTheta = normAngle(theta);
          flattenT0 = 1;
        }
      }
      fxAlpha = fa < FX_GREY_MS ? fa / FX_GREY_MS : fa < 250 ? 1 : Math.max(0, 1 - (fa - 250) / (FX_TOTAL_MS - 250));
      if (fa >= FX_TOTAL_MS) {
        fxActive = false;
        fxAlpha = 0;
      }
      canvas.style.filter = fxAlpha > 0.01
        ? "saturate(" + (1 - 0.55 * fxAlpha).toFixed(3) + ") blur(" + (1.6 * fxAlpha).toFixed(2) + "px)"
        : "";
    }
    if (t !== mode && layoutMode === mode) {
      var step = dt / CAM_MS; /* brisk camera sweep once the cut has landed */
      t = mode === 1 ? Math.min(1, t + step) : Math.max(0, t - step);
    }

    if (mode === 1) {
      if (!dragging) {
        if (!spinSettled) {
          theta += (THETA_HOME - theta) * Math.min(1, dt / 220);
          if (Math.abs(THETA_HOME - theta) < 0.01) {
            theta = THETA_HOME;
            spinSettled = true;
          }
        } else if (!reduceMotion) {
          theta += dt * SPIN_SPEED;
        }
      }
    } else {
      theta = t > 0 ? flattenTheta * (t / flattenT0) : 0;
    }

    updatePetals(dt, easeInOut(t));
    draw(now);
    if (needsFrames()) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function kick() {
    if (!rafId) {
      lastNow = 0;
      rafId = requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function pageUrl() {
    /* Drop the hash: section-nav rewrites it while scrolling, the phone should
       land on the page top anyway, and fewer bytes keep the code coarse enough
       to scan off a laptop screen. */
    return window.location.href.split("#")[0];
  }

  function open() {
    var url = pageUrl();
    if (url !== currentUrl) {
      buildMatrix(url);
      currentUrl = url;
      urlLabel.textContent = url;
    }
    mode = 0;
    t = 0;
    layoutMode = 0;
    fxActive = false;
    fxAlpha = 0;
    canvas.style.filter = "";
    theta = 0;
    petals.length = 0;
    introAt = performance.now();
    introDone = reduceMotion;
    setHints();
    dialog.showModal();
    kick();
  }

  button.addEventListener("click", open);

  canvas.addEventListener("pointerdown", function (ev) {
    if (mode !== 1) {
      return;
    }
    dragging = true;
    dragMoved = false;
    dragX0 = ev.clientX;
    dragTheta0 = theta;
    canvas.setPointerCapture(ev.pointerId);
  });

  canvas.addEventListener("pointermove", function (ev) {
    if (!dragging) {
      return;
    }
    var dx = ev.clientX - dragX0;
    if (Math.abs(dx) > 4) {
      dragMoved = true;
    }
    theta = dragTheta0 + dx * 0.012;
    spinSettled = true;
    kick();
  });

  function endDrag() {
    dragging = false;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("click", function () {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    if (fxActive) {
      return; /* mid-blink */
    }
    mode = mode === 1 ? 0 : 1;
    setHints();
    if (reduceMotion) {
      layoutMode = mode;
      t = mode;
      theta = mode === 1 ? THETA_HOME : 0;
      spinSettled = true;
      kick();
      return;
    }
    fxActive = true;
    fxStart = performance.now();
    fxCut = false;
    kick();
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.closest("[data-qr-close]")) {
      dialog.close();
    }
  });

  dialog.addEventListener("close", function () {
    stop();
    petals.length = 0;
    button.blur();
  });
})();
