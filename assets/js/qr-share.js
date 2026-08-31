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
  var MORPH_MS = 700;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ONE centred object: the tree's CANOPY is the QR code. The code lives
     on a vertical plane — every dark module is a dense little cluster of
     low-poly leaf blocks whose front projection exactly fills its cell;
     light modules are see-through gaps in the foliage. Scanning view =
     camera level, straight at the canopy (trunk peeking out below).
     Dragging rotates the very same canopy body, revealing its depth,
     branches and the full tree. No second model, no flat picture. */
  var SIDE_SIN = 0.47; /* tree view tilts down just a little */
  var SIDE_COS = 0.88;
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
      tree: [[168, 210, 109], [124, 179, 66], [138, 154, 91], [85, 139, 47], [51, 105, 30]],
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
  var t = 0;
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
    var zBase = Math.round(g * 0.3); /* trunk height under the canopy */
    var D = 5; /* canopy thickness */
    var r, c, i, j;

    /* ---- the anamorphic canopy: every dark module is a leaf cluster at
       its OWN depth inside a tree-shaped volume. The orthographic head-on
       camera projects each cluster exactly onto its cell no matter how
       deep it sits, so ONLY that viewpoint assembles the code. There is
       no board: a few degrees of rotation and the flat pattern is gone. */
    var zBase = Math.round(g * 0.3); /* trunk height under the crown */
    var Dmax = g * 0.34; /* crown half-thickness at its heart */
    var cellDepth = {}; /* "c,r" -> cluster depth, for the branch routing */
    for (r = 0; r < modCount; r++) {
      for (c = 0; c < modCount; c++) {
        if (!qr.isDark(r, c)) {
          continue; /* light module = open air in the crown */
        }
        var finder = inFinder(r, c, modCount);
        var solid = r === 6 || c === 6 ||
          (r >= modCount - 9 && r <= modCount - 5 && c >= modCount - 9 && c <= modCount - 5);
        var cx = c + QUIET + 0.5 - half;
        var cz = zBase + g - (r + QUIET + 0.5); /* row 0 at the top */
        /* local depth budget: deep in the heart of the crown, shallow at
           the rim — the side silhouette becomes a rounded irregular blob,
           never the edge of a slab */
        var exn = cx / (half * 1.05);
        var ezn = (cz - (zBase + g * 0.42)) / (g * 0.62);
        var m0 = 1 - exn * exn - ezn * ezn;
        var Dloc = m0 > 0 ? Dmax * Math.sqrt(m0) : 0.5;
        var yc = (hashUnit(r, c, 21) * 2 - 1) * Dloc;
        cellDepth[c + "," + r] = yc;
        var col0 = finder || solid ? theme.finder : theme.qr[cellHash(r, c) % theme.qr.length];
        var tcol0 = finder || solid
          ? mix(theme.finder, theme.tree[1], 0.35)
          : theme.tree[cellHash(r, c) % theme.tree.length];
        var cell = {
          cx: cx,
          cz: cz,
          finder: finder,
          solid: solid,
          col: col0,
          delay: Math.min(430, Math.sqrt((r - mid) * (r - mid) + (c - mid) * (c - mid)) * 13)
        };
        cells.push(cell);
        /* one cover block fills the cell footprint at the cluster's own
           depth (keeps the module solid for scanners), two accents hug it
           so the cluster reads as a dense leaf tuft, not a particle */
        for (j = 0; j < 3; j++) {
          var size, dx, dz, dy;
          if (j === 0) {
            size = finder || solid ? 1 : 0.94;
            dx = 0;
            dz = 0;
            dy = yc;
          } else {
            size = 0.55 + hashUnit(r, c, 11 + j * 3) * 0.3;
            var maxOff = (0.96 - size) / 2;
            dx = (hashUnit(r, c, 12 + j * 3) * 2 - 1) * maxOff;
            dz = (hashUnit(r, c, 13 + j * 3) * 2 - 1) * maxOff;
            dy = yc + (hashUnit(r, c, 14 + j * 3) * 2 - 1) * 1.1;
          }
          nodes.push({
            kind: "leaf",
            wx: cx + dx,
            wy: dy,
            z: cz + dz - size / 2,
            h: size,
            size: size,
            col: finder || solid ? theme.finder : theme.qr[(cellHash(r, c) + j) % theme.qr.length],
            tcol: tcol0,
            light: 0.86 + 0.24 * ((cz - zBase) / g),
            delay: cell.delay
          });
        }
      }
    }

    /* ---- slender trunk + forks below the crown ---- */
    for (var lv = 0; lv < zBase; lv++) {
      var tier = lv < zBase * 0.55 ? 2 : 1;
      for (var kx = 0; kx < tier; kx++) {
        for (var ky = 0; ky < tier; ky++) {
          nodes.push({
            kind: "wood",
            wx: kx - (tier - 1) / 2,
            wy: ky - (tier - 1) / 2,
            z: lv,
            h: 1,
            size: 0.95,
            col: TRUNK_BROWNS[(lv + kx + ky) % TRUNK_BROWNS.length]
          });
        }
      }
    }
    var forks = [[1, 0.3], [-1, -0.3], [0.2, 0.9]];
    for (i = 0; i < forks.length; i++) {
      for (var bs = 1; bs <= 3; bs++) {
        nodes.push({
          kind: "wood",
          wx: forks[i][0] * bs * 1.3,
          wy: forks[i][1] * bs,
          z: zBase - 3.2 + bs * 1.0,
          h: 0.8,
          size: 0.62,
          col: TRUNK_BROWNS[(i + bs) % TRUNK_BROWNS.length]
        });
      }
    }

    /* ---- branches climbing THROUGH the crown: wood tucked just behind
       dark cells along drifting paths. Head-on they hide inside dark
       modules (the leaf cover sits in front), from the side they link the
       clusters so nothing floats. ---- */
    var bdirs = [0.62, -0.7, 0.18, -0.28];
    for (i = 0; i < bdirs.length; i++) {
      var drift = 0;
      for (var rr = modCount - 2; rr > modCount * 0.25; rr -= 2) {
        drift += bdirs[i] * 1.2;
        var cc = Math.round((modCount - 1) / 2 + drift);
        var hit = null;
        for (var probe = 0; probe <= 2 && !hit; probe++) {
          if (cellDepth[(cc + probe) + "," + rr] !== undefined) {
            hit = cc + probe;
          } else if (cellDepth[(cc - probe) + "," + rr] !== undefined) {
            hit = cc - probe;
          }
        }
        if (hit === null) {
          continue;
        }
        nodes.push({
          kind: "wood",
          wx: hit + QUIET + 0.5 - half,
          wy: cellDepth[hit + "," + rr] - 1.2,
          z: zBase + g - (rr + QUIET + 0.5) - 0.31,
          h: 0.62,
          size: 0.62,
          col: TRUNK_BROWNS[(i + rr) % TRUNK_BROWNS.length]
        });
      }
    }

    /* a modest spill of leaves between crown and trunk, nothing floating
       far afield */
    for (i = 0; i < Math.round(modCount * 0.9); i++) {
      var fxr = (srand() * 2 - 1) * (half * 0.55);
      var fsz = 0.5 + srand() * 0.4;
      nodes.push({
        kind: "leaf",
        fringe: true,
        wx: fxr,
        wy: (srand() * 2 - 1) * 2.5,
        z: zBase - 0.4 - srand() * 2.0 - fsz / 2,
        h: fsz,
        size: fsz,
        col: theme.qr[Math.floor(srand() * theme.qr.length)],
        tcol: theme.tree[Math.floor(srand() * theme.tree.length)],
        light: 0.85
      });
    }

    /* ---- modest ground base: a beige disc, grass, a few flowers ---- */
    treePos = { discR: g * 0.34 };
    for (i = 0; i < 10; i++) {
      var ga = srand() * 6.28318;
      var gr = 2.5 + srand() * (g * 0.28);
      nodes.push({
        kind: "grass",
        wx: Math.cos(ga) * gr,
        wy: Math.sin(ga) * gr,
        z: 0,
        h: 1 + srand() * 1.2,
        col: GRASS_GREENS[Math.floor(srand() * GRASS_GREENS.length)]
      });
    }
    for (i = 0; i < 5; i++) {
      var fa = srand() * 6.28318;
      var fr2 = 3 + srand() * (g * 0.26);
      nodes.push({
        kind: "flower",
        wx: Math.cos(fa) * fr2,
        wy: Math.sin(fa) * fr2,
        z: 0.3,
        col: FLOWER_COLORS[Math.floor(srand() * FLOWER_COLORS.length)]
      });
    }

    /* scanning frame: the canopy square face-on, centred, with a sliver of
       trunk peeking below the quiet zone */
    flatFit = {
      minX: -(half + 1.2),
      maxX: half + 1.2,
      minY: -(zBase + g + 1.2),
      maxY: -(zBase - 4.4)
    };
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (i = 0; i < nodes.length; i++) {
      var q = nodes[i];
      var rad = Math.sqrt(q.wx * q.wx + q.wy * q.wy) + (q.size || 1);
      minX = Math.min(minX, -rad);
      maxX = Math.max(maxX, rad);
      minY = Math.min(minY, -rad * SIDE_SIN - (q.z + (q.h || 1) + 0.5) * SIDE_COS);
      maxY = Math.max(maxY, rad * SIDE_SIN - q.z * SIDE_COS);
    }
    maxY = Math.max(maxY, treePos.discR * SIDE_SIN + 0.8);
    minX = Math.min(minX, -treePos.discR - 1);
    maxX = Math.max(maxX, treePos.discR + 1);
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

    /* camera: level and head-on while scanning, gently tilted for the tree */
    var cosT = Math.cos(theta);
    var sinT = Math.sin(theta);
    var sa = lerp(0, SIDE_SIN, e);
    var ca = lerp(1, SIDE_COS, e);

    var minX = lerp(flatFit.minX, treeFit.minX, e);
    var maxX = lerp(flatFit.maxX, treeFit.maxX, e);
    var minY = lerp(flatFit.minY, treeFit.minY, e);
    var maxY = lerp(flatFit.maxY, treeFit.maxY, e);
    var pad = lerp(1, 0.95, e);
    var s = (SIZE * pad) / Math.max(maxX - minX, maxY - minY);
    var ox = (SIZE - s * (maxX + minX)) / 2;
    var oy = (SIZE - s * (maxY + minY)) / 2;

    /* scanning view is orthographic (grid stays true); the tree view adds
       a whisper of perspective so the crown's depth actually reads */
    var PK = 0.0045 * e;
    function px_(wx, wy) {
      var ry = wx * sinT + wy * cosT;
      return ox + s * (wx * cosT - wy * sinT) * (1 + ry * PK);
    }
    function py_(wx, wy, z) {
      var ry = wx * sinT + wy * cosT;
      return oy + s * (ry * sa - z * ca) * (1 + ry * PK);
    }

    var voxel = e >= 0.02;
    var i, node;

    if (!voxel) {
      /* the canopy face-on: hard square modules, pixel-snapped; gaps show
         the cream background straight through the foliage */
      var u = Math.round(s * dpr) / dpr;
      /* trunk tip peeking below the quiet zone */
      for (i = 0; i < nodes.length; i++) {
        node = nodes[i];
        if (node.kind !== "wood" && !node.fringe) {
          continue;
        }
        var hfw = node.size / 2;
        ctx.fillStyle = rgb(node.col, node.kind === "wood" ? 0.94 : 1);
        ctx.fillRect(px_(node.wx - hfw, 0), py_(node.wx - hfw, 0, node.z + node.h), node.size * s, node.h * s);
      }
      /* finders: three seamless square patches (per-cell seams would cut
         the 1:1:3:1:1 runs scanners lock onto) */
      var fcorners = [[0, 0], [0, modCount - 7], [modCount - 7, 0]];
      for (i = 0; i < fcorners.length; i++) {
        var fx = fcorners[i][1] + QUIET - half;
        var fz = Math.round(g * 0.3) + g - (fcorners[i][0] + QUIET);
        var fpx = Math.round(px_(fx, 0) * dpr) / dpr;
        var fpy = Math.round(py_(fx, 0, fz) * dpr) / dpr;
        ctx.fillStyle = rgb(theme.finder, 1);
        ctx.fillRect(fpx, fpy, 7 * u, 7 * u);
        ctx.fillStyle = rgb(CREAM, 1);
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
        var w = node.solid ? 1 : 0.96;
        var x0 = px_(node.cx - w / 2, 0);
        var y0 = py_(node.cx - w / 2, 0, node.cz + w / 2);
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
      return;
    }

    /* ground base: beige disc that flattens away in the scanning view */
    ctx.fillStyle = rgb(PLATE_A, 1);
    ctx.beginPath();
    ctx.ellipse(px_(0, 0), py_(0, 0, 0), treePos.discR * s, Math.max(0.5, treePos.discR * s * sa), 0, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = "rgba(94, 84, 60, 0.13)";
    ctx.beginPath();
    ctx.ellipse(px_(0, 0), py_(0, 0, 0), treePos.discR * 0.55 * s, Math.max(0.4, treePos.discR * 0.55 * s * sa), 0, 0, 6.29);
    ctx.fill();

    for (i = 0; i < nodes.length; i++) {
      node = nodes[i];
      node.depth = node.wx * sinT + node.wy * cosT + node.z * 0.01;
    }
    order.sort(function (a, b) {
      return nodes[a].depth - nodes[b].depth;
    });

    var wob = reduceMotion ? 0 : 0.1 * e;
    for (var oi = 0; oi < order.length; oi++) {
      node = nodes[order[oi]];
      var alpha = introAlpha(node, now);
      if (alpha <= 0.01) {
        continue;
      }
      ctx.globalAlpha = alpha;

      if (node.kind === "grass") {
        ctx.fillStyle = rgb(node.col, 1);
        for (var b2 = -1; b2 <= 1; b2++) {
          var bx2 = node.wx + b2 * 0.55;
          var bh = node.h * (b2 === 0 ? 1 : 0.72);
          ctx.beginPath();
          ctx.moveTo(px_(bx2 - 0.3, node.wy), py_(bx2 - 0.3, node.wy, 0));
          ctx.lineTo(px_(bx2 + 0.3, node.wy), py_(bx2 + 0.3, node.wy, 0));
          ctx.lineTo(px_(bx2 + b2 * 0.18, node.wy), py_(bx2 + b2 * 0.18, node.wy, bh));
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }
      if (node.kind === "flower") {
        ctx.fillStyle = rgb(node.col, 1);
        ctx.beginPath();
        ctx.arc(px_(node.wx, node.wy), py_(node.wx, node.wy, node.z), Math.max(1.6, 0.2 * s), 0, 6.29);
        ctx.fill();
        continue;
      }

      var hf = node.size / 2;
      var z0 = node.z;
      var z1 = node.z + node.h;
      if (node.kind === "leaf" && wob) {
        z0 += Math.sin(now * 0.002 + (node.wx + node.z) * 0.6) * wob;
        z1 += Math.sin(now * 0.002 + (node.wx + node.z) * 0.6) * wob;
      }
      var light = node.light || 1;
      var bcol = node.tcol ? mix(node.col, node.tcol, e) : node.col;

      for (var side = 0; side < 4; side++) {
        var dxs = side === 0 ? 1 : side === 1 ? -1 : 0;
        var dys = side === 2 ? 1 : side === 3 ? -1 : 0;
        var ny = dxs * sinT + dys * cosT;
        if (ny <= 0.02) {
          continue;
        }
        var nx = dxs * cosT - dys * sinT;
        var mul = Math.min(1, 0.55 + 0.3 * ny + 0.15 * Math.max(nx, 0));
        var pax = node.wx + (dxs !== 0 ? dxs * hf : -hf);
        var pay = node.wy + (dys !== 0 ? dys * hf : -hf);
        var pbx = node.wx + (dxs !== 0 ? dxs * hf : hf);
        var pby = node.wy + (dys !== 0 ? dys * hf : hf);
        ctx.fillStyle = rgb(bcol, mul * light);
        ctx.beginPath();
        ctx.moveTo(px_(pax, pay), py_(pax, pay, z1));
        ctx.lineTo(px_(pbx, pby), py_(pbx, pby, z1));
        ctx.lineTo(px_(pbx, pby), py_(pbx, pby, z0));
        ctx.lineTo(px_(pax, pay), py_(pax, pay, z0));
        ctx.closePath();
        ctx.fill();
      }

      if (ca < 0.999) { /* top faces only exist once the camera tilts */
        ctx.fillStyle = rgb(bcol, Math.min(1.08, light * 1.06));
        ctx.beginPath();
        ctx.moveTo(px_(node.wx - hf, node.wy - hf), py_(node.wx - hf, node.wy - hf, z1));
        ctx.lineTo(px_(node.wx + hf, node.wy - hf), py_(node.wx + hf, node.wy - hf, z1));
        ctx.lineTo(px_(node.wx + hf, node.wy + hf), py_(node.wx + hf, node.wy + hf, z1));
        ctx.lineTo(px_(node.wx - hf, node.wy + hf), py_(node.wx - hf, node.wy + hf, z1));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    drawPetals(e);
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
    return !introDone || t !== mode || mode === 1;
  }

  function tick(now) {
    var dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;
    if (!introDone && now - introAt > 430 + 300) {
      introDone = true;
    }
    if (t !== mode) {
      var step = dt / MORPH_MS;
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
    mode = mode === 1 ? 0 : 1;
    if (mode === 0) {
      flattenTheta = normAngle(theta);
      flattenT0 = Math.max(t, 0.001);
    } else {
      spinSettled = false;
    }
    if (reduceMotion) {
      t = mode;
      theta = mode === 1 ? THETA_HOME : 0;
      spinSettled = true;
    }
    setHints();
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
