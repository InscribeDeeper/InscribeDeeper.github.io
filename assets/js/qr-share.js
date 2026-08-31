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
    var maxH = g * 0.72; /* crown apex */
    var GROUND_R = 0.72; /* beyond this ring every module lies on the soil */
    var r, c, i, j;

    /* ---- radial cone mapping: the QR lies flat on the ground grid, every
       module keeps its x/y cell forever, ONLY its height changes.
       r = max(|u|,|v|) so the four edges and all four corner regions drop
       to the ground as turf, while the middle rises into the crown.
       Straight from above the heights vanish and the code reassembles. */
    var darkMap = {};
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
        /* finder + alignment patches always land on the soil, whatever
           their radius — the corners of the code are lawn, not crown */
        var grounded = rN >= GROUND_R || finder ||
          (r >= modCount - 9 && r <= modCount - 5 && c >= modCount - 9 && c <= modCount - 5);
        var zc = 0;
        if (!grounded) {
          zc = maxH * Math.pow(Math.max(0, 1 - rN / GROUND_R), 0.7) +
            (hashUnit(r, c, 7) - 0.5) * 0.4; /* ≤20% of a module */
          zc = Math.max(0.6, zc);
        }
        darkMap[c + "," + r] = zc;
        var col0 = finder || solid ? theme.finder : theme.qr[cellHash(r, c) % theme.qr.length];
        var tcol0 = grounded
          ? (finder || solid ? mix(theme.finder, theme.tree[1], 0.45) : theme.tree[cellHash(r, c) % 3])
          : theme.tree[cellHash(r, c) % theme.tree.length];
        var cell = {
          cx: cx,
          cy: cy,
          finder: finder,
          solid: solid,
          col: col0,
          delay: Math.min(430, Math.sqrt((r - mid) * (r - mid) + (c - mid) * (c - mid)) * 13)
        };
        cells.push(cell);

        if (grounded) {
          /* turf/moss block: fills its whole cell so the code never breaks,
             with a couple of grass blades sprouting on some */
          nodes.push({
            kind: "leaf",
            wx: cx,
            wy: cy,
            z: 0,
            h: 0.3 + hashUnit(r, c, 15) * 0.18,
            size: 1,
            col: col0,
            tcol: tcol0,
            light: 0.95,
            delay: cell.delay
          });
          if (!solid && hashUnit(r, c, 16) < 0.35) {
            nodes.push({
              kind: "blade",
              wx: cx,
              wy: cy,
              z: 0.35,
              h: 0.9 + hashUnit(r, c, 17) * 0.8,
              col: tcol0,
              delay: cell.delay
            });
          }
          continue;
        }

        /* crown cluster: a full-footprint cover at the cone height plus
           dense accents tucked underneath (outer band gets a hanging tuft) */
        nodes.push({
          kind: "leaf",
          wx: cx,
          wy: cy,
          z: zc,
          h: 0.9,
          size: 0.98,
          col: col0,
          tcol: tcol0,
          light: 0.82 + 0.28 * (zc / maxH),
          delay: cell.delay
        });
        var extras = rN > 0.42 ? 2 : 1 + (cellHash(r, c) % 2);
        for (j = 0; j < extras; j++) {
          var size = 0.5 + hashUnit(r, c, 31 + j * 3) * 0.35;
          var maxOff = (0.98 - size) / 2;
          nodes.push({
            kind: "leaf",
            wx: cx + (hashUnit(r, c, 32 + j * 3) * 2 - 1) * maxOff,
            wy: cy + (hashUnit(r, c, 33 + j * 3) * 2 - 1) * maxOff,
            z: zc - 0.7 - hashUnit(r, c, 34 + j * 3) * (rN > 0.42 ? 1.9 : 1.1),
            h: size,
            size: size,
            col: theme.qr[(cellHash(r, c) + j) % theme.qr.length],
            tcol: theme.tree[(cellHash(r, c) + j) % theme.tree.length],
            light: 0.78 + 0.24 * (zc / maxH),
            delay: cell.delay
          });
        }
      }
    }

    /* ---- crooked trunk + radial branches, always hidden underneath dark
       cells so the top-down code stays pristine ---- */
    function cellZ(cc, rr) {
      return darkMap[cc + "," + rr];
    }
    var tc = null, tr = null, best = 1e9;
    for (r = Math.floor(mid) - 3; r <= Math.floor(mid) + 3; r++) {
      for (c = Math.floor(mid) - 3; c <= Math.floor(mid) + 3; c++) {
        if (cellZ(c, r) !== undefined && cellZ(c, r) > 3) {
          var d0 = (c - mid) * (c - mid) + (r - mid) * (r - mid);
          if (d0 < best) {
            best = d0;
            tc = c;
            tr = r;
          }
        }
      }
    }
    if (tc !== null) {
      var topZ = cellZ(tc, tr) - 0.9;
      for (var lv = 0; lv < topZ; lv++) {
        nodes.push({
          kind: "wood",
          wx: tc + QUIET + 0.5 - half,
          wy: tr + QUIET + 0.5 - half,
          z: lv,
          h: 1,
          size: 0.82,
          col: TRUNK_BROWNS[lv % TRUNK_BROWNS.length]
        });
      }
    }
    for (i = 0; i < 5; i++) {
      var ang = (i / 5) * 6.28318 + 0.5;
      var ux = Math.cos(ang);
      var uy = Math.sin(ang);
      for (var rad = 2; rad < mid * GROUND_R; rad += 1.4) {
        var gc = Math.round(mid + ux * rad);
        var gr = Math.round(mid + uy * rad);
        var hit = null;
        for (var probe = 0; probe <= 1 && hit === null; probe++) {
          if (cellZ(gc + probe, gr) !== undefined && cellZ(gc + probe, gr) > 2) {
            hit = [gc + probe, gr];
          } else if (cellZ(gc, gr + probe) !== undefined && cellZ(gc, gr + probe) > 2) {
            hit = [gc, gr + probe];
          } else if (cellZ(gc - probe, gr) !== undefined && cellZ(gc - probe, gr) > 2) {
            hit = [gc - probe, gr];
          }
        }
        if (hit === null) {
          continue;
        }
        nodes.push({
          kind: "wood",
          wx: hit[0] + QUIET + 0.5 - half,
          wy: hit[1] + QUIET + 0.5 - half,
          z: Math.max(0.4, cellZ(hit[0], hit[1]) - 1.25),
          h: 0.6,
          size: 0.6,
          col: TRUNK_BROWNS[(i + Math.round(rad)) % TRUNK_BROWNS.length]
        });
      }
    }

    /* ---- soil base + sparse life just outside the code square ---- */
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

    /* frames: scan = straight down onto the square; showcase fits the tree */
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
      var rad2 = Math.sqrt(q.wx * q.wx + q.wy * q.wy) + 1;
      minX = Math.min(minX, -rad2);
      maxX = Math.max(maxX, rad2);
      minY = Math.min(minY, -rad2 * SIDE_SIN - (q.z + (q.h || 1) + 0.6) * SIDE_COS);
      maxY = Math.max(maxY, rad2 * SIDE_SIN - q.z * SIDE_COS);
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

    /* camera: straight overhead + orthographic while scanning, ~45° iso
       with a whisper of perspective for the showcase */
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
    var ox = (SIZE - s * (maxX + minX)) / 2;
    var oy = (SIZE - s * (maxY + minY)) / 2;

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
    var bh = treePos.baseHalf;

    /* soil base under everything (light beige: reads as background to a
       scanner, ground to the eye) */
    ctx.fillStyle = rgb(PLATE_A, 1);
    ctx.beginPath();
    ctx.moveTo(px_(-bh, -bh), py_(-bh, -bh, 0));
    ctx.lineTo(px_(bh, -bh), py_(bh, -bh, 0));
    ctx.lineTo(px_(bh, bh), py_(bh, bh, 0));
    ctx.lineTo(px_(-bh, bh), py_(-bh, bh, 0));
    ctx.closePath();
    ctx.fill();

    if (!voxel) {
      /* straight-down view: every module back on its grid cell */
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
      return;
    }

    /* soft shadow pooling under the crown */
    ctx.globalAlpha = e * 0.6;
    ctx.fillStyle = "rgba(94, 84, 60, 0.16)";
    ctx.beginPath();
    ctx.ellipse(px_(0, 0), py_(0, 0, 0) + 1, half * 0.62 * s, half * 0.62 * s * sa, 0, 0, 6.29);
    ctx.fill();
    ctx.globalAlpha = 1;

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

      if (node.kind === "grass" || node.kind === "blade") {
        ctx.globalAlpha = alpha * (node.kind === "blade" ? e : 1);
        ctx.fillStyle = rgb(node.col, 1);
        for (var b2 = -1; b2 <= 1; b2++) {
          var bx2 = node.wx + b2 * (node.kind === "blade" ? 0.24 : 0.55);
          var bhh = node.h * (b2 === 0 ? 1 : 0.72);
          ctx.beginPath();
          ctx.moveTo(px_(bx2 - 0.22, node.wy), py_(bx2 - 0.22, node.wy, node.z));
          ctx.lineTo(px_(bx2 + 0.22, node.wy), py_(bx2 + 0.22, node.wy, node.z));
          ctx.lineTo(px_(bx2 + b2 * 0.14, node.wy), py_(bx2 + b2 * 0.14, node.wy, node.z + bhh));
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
      if (node.kind === "leaf" && node.z > 2 && wob) {
        z0 += Math.sin(now * 0.002 + (node.wx + node.wy) * 0.6) * wob;
        z1 += Math.sin(now * 0.002 + (node.wx + node.wy) * 0.6) * wob;
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

      ctx.fillStyle = rgb(bcol, Math.min(1.08, light * 1.05));
      ctx.beginPath();
      ctx.moveTo(px_(node.wx - hf, node.wy - hf), py_(node.wx - hf, node.wy - hf, z1));
      ctx.lineTo(px_(node.wx + hf, node.wy - hf), py_(node.wx + hf, node.wy - hf, z1));
      ctx.lineTo(px_(node.wx + hf, node.wy + hf), py_(node.wx + hf, node.wy + hf, z1));
      ctx.lineTo(px_(node.wx - hf, node.wy + hf), py_(node.wx - hf, node.wy + hf, z1));
      ctx.closePath();
      ctx.fill();
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
