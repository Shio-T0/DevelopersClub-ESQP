/* ============================================================
   Developer's Club — ESQP · 2025/2026
   ============================================================ */

(() => {
'use strict';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===========================================================
   1 · BACKGROUND — os plotters
   ===========================================================
   Two stacked canvases:

     #bg      ink layer. NOT cleared while a figure is being
              drawn — each frame strokes only the few segments
              each pen just travelled, so the drawing accumulates
              like real ink instead of being repainted. Cheap:
              cost per frame is constant, not O(points drawn).
     #bg-fx   live layer, cleared every frame — the pen nibs, the
              plate caption, and the reading-lamp glow that
              follows the cursor.

   Several pens work at once, each on its own small plate: one
   parametric figure from the Victorian drawing-machine
   repertoire (harmonograph, engine-turned guilloché, Lissajous,
   rose). Each pen carries a different ink strength, so the page
   reads as a sheet of study plates rather than one big drawing.
   Pens are parked in slots around the edges and kept faint —
   the page copy has to stay perfectly readable over them.
   =========================================================== */

const inkCanvas = document.getElementById('bg');
const fxCanvas  = document.getElementById('bg-fx');
const ink = inkCanvas.getContext('2d');
const fx  = fxCanvas.getContext('2d');

let W = 0, H = 0, dpr = 1;
let mode = 'normal';
const pointer = { x: -9999, y: -9999, active: false };

const PALETTES = {
    normal:   { ink: [194, 90, 46], alt: [216, 164, 65], lamp: [216, 164, 65] },
    phosphor: { ink: [143, 207, 114], alt: [201, 217, 106], lamp: [201, 217, 106] }
};

/* One pen per entry: how hard it presses, and how fine its nib is.
   Keeping these fixed per pen (rather than random per plate) is what
   makes them read as different instruments. */
const PENS = [
    { alpha: 0.36, width: 1.05 },
    { alpha: 0.30, width: 0.95 },
    { alpha: 0.24, width: 0.85 },
    { alpha: 0.19, width: 0.75 },
    { alpha: 0.15, width: 0.65 }
];

/* The centre plate: one pen reserved for a golden spiral drawn across
   the whole page. It gets the lightest hand of all — it is the only
   figure that crosses the copy column, so it has to stay a whisper. */
const GRAND_PEN = { alpha: 0.28, width: 0.90 };

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => a + ((Math.random() * (b - a + 1)) | 0);
const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const gcd = (a, b) => b ? gcd(b, a % b) : a;

/* Coherent value noise — the pen arm wobbles, it doesn't jitter.
   Random per-point offsets would read as grain; noise reads as a
   loose linkage. */
const hash = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'];

/* --- the repertoire ------------------------------------------
   Every figure exposes pointAt(u) → [x, y] in roughly [-1, 1],
   so the drawing code never needs to know which curve it is.
   Parameters are constrained to keep every family ornamental:
   ratios that collapse to a plain circle are excluded. */

function makeFigure(only) {
    // The spiral is never handed out at random — it belongs to the centre
    // plate (see GRAND_PEN), which asks for it by name.
    const kind = only || ['harmonograph', 'guilloche', 'rose'][(Math.random() * 3) | 0];

    if (kind === 'harmonograph') {
        // Two detuned pendulums per axis, decaying — the drift between
        // f and f' is what makes the figure precess instead of retracing.
        const a1 = rand(0.55, 0.8), a2 = 1 - a1;
        const f1 = irand(2, 5), f2 = irand(2, 5) + rand(0.003, 0.01);
        const f3 = irand(2, 5), f4 = irand(2, 5) + rand(0.003, 0.01);
        const p1 = rand(0, TAU), p2 = rand(0, TAU);
        const p3 = rand(0, TAU), p4 = rand(0, TAU);
        const decay = rand(0.0016, 0.0034);
        const tMax = 200;
        return {
            label: 'harmonógrafo', N: 4200,
            pointAt: (u) => {
                const t = u * tMax, e = Math.exp(-decay * t);
                return [
                    (a1 * Math.sin(f1 * t + p1) + a2 * Math.sin(f2 * t + p2)) * e,
                    (a1 * Math.sin(f3 * t + p3) + a2 * Math.sin(f4 * t + p4)) * e
                ];
            }
        };
    }

    if (kind === 'guilloche') {
        // Hypotrochoid — the engine-turned ring on old certificates.
        // The rolling circle r must stay SMALL against the offset k, so the
        // ripple runs fast around a wide ring: that ratio is the whole
        // effect. Invert it (large r, small k) and the pen instead draws a
        // circle whose centre drifts, i.e. a pile of overlapping rings.
        const r = irand(1, 3);
        let R = irand(7, 13);
        while (gcd(R, r) !== 1) R++;                 // coprime → closes cleanly
        const k = R - r;
        const d = r * rand(0.5, 1.15);
        const norm = 1 / (k + d);
        const tMax = TAU * r;
        return {
            label: 'guilhochê', N: 4600,
            pointAt: (u) => {
                const t = u * tMax, a = (k / r) * t;
                return [(k * Math.cos(t) + d * Math.cos(a)) * norm,
                        (k * Math.sin(t) - d * Math.sin(a)) * norm];
            }
        };
    }

    // Every square flips the rectangle's aspect, so the term count decides
    // whether the construction comes out landscape or portrait. Pick the one
    // that matches the viewport, or it can only fill one axis.
    if (kind === 'golden') return makeGoldenConstruction(W >= H ? 10 : 9);

    if (kind === 'spiral') {
        // Logarithmic spiral at the golden growth rate — the radius
        // multiplies by φ every quarter turn.
        // Stepped by radius rather than by angle: on this curve arc length
        // is proportional to r, so a linear r is a constant pen speed. With
        // even Δθ the pen would spend most of the draw inside the invisible
        // centre and the figure would only appear in its last few seconds.
        const PHI = (1 + Math.sqrt(5)) / 2;
        const b = Math.log(PHI) / (Math.PI / 2);
        const tMax = TAU * rand(2.1, 2.9);
        const rot = rand(0, TAU);
        const hand = Math.random() < 0.5 ? 1 : -1;   // both chiralities
        const rMin = Math.exp(-b * tMax);
        return {
            label: 'espiral áurea', N: 3000,
            pointAt: (u) => {
                const r = rMin + (1 - rMin) * u;
                const a = (tMax + Math.log(r) / b) * hand + rot;
                return [r * Math.cos(a), r * Math.sin(a)];
            }
        };
    }

    // Rose. k = 1 is a circle and k = 1/1 the same — force k ≠ 1.
    const q = irand(1, 4);
    let n = irand(3, 9);
    if (n === q) n++;
    const k = n / q;
    const tMax = TAU * q * ((n * q) % 2 === 0 ? 2 : 1);
    return {
        label: 'rosácea', N: 3800,
        pointAt: (u) => {
            const t = u * tMax, rr = Math.cos(k * t);
            return [rr * Math.cos(t), rr * Math.sin(t)];
        }
    };
}

/* --- the golden rectangle ------------------------------------
   The centre plate, built the way it is built on paper: a unit
   square, then a square on one side of the growing rectangle,
   turning a quarter each time. Sides come out as the Fibonacci
   numbers, and a quarter-circle in every square chains into the
   spiral. Squares are stamped as the pen reaches them; the arcs
   are the pen's actual path.

   Angles run in screen space (y down), so a quarter turn is
   always +90° and the start angle only depends on which side the
   square was attached to. */

function makeGoldenConstruction(terms) {
    const fib = [1, 1];
    while (fib.length < terms) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);

    // The first square behaves as if attached from below, so its arc ends
    // exactly where the second square's begins.
    const squares = [{ x: 0, y: 0, s: 1, fib: 1, dir: 3 }];
    let x0 = 0, y0 = 0, x1 = 1, y1 = 1;
    for (let k = 1; k < terms; k++) {
        const dir = (k - 1) % 4;
        let sq;
        if (dir === 0)      { const s = y1 - y0; sq = { x: x1,     y: y0,     s }; x1 += s; }
        else if (dir === 1) { const s = x1 - x0; sq = { x: x0,     y: y0 - s, s }; y0 -= s; }
        else if (dir === 2) { const s = y1 - y0; sq = { x: x0 - s, y: y0,     s }; x0 -= s; }
        else                { const s = x1 - x0; sq = { x: x0,     y: y1,     s }; y1 += s; }
        sq.dir = dir;
        sq.fib = sq.s;
        squares.push(sq);
    }

    /* Arc per square: centre corner + start angle, always sweeping -90°
       (counter-clockwise on screen, where y points down).

       The centre must be the trailing end of the edge this square shares
       with the rectangle before it. That is the only corner that leaves
       consecutive arcs curving the SAME way — centre them on the opposite
       corner and the curvature flips at every junction, which draws a
       star of cusps instead of a spiral. */
    for (const sq of squares) {
        const { x, y, s, dir } = sq;
        sq.acx = (dir === 2 || dir === 3) ? x + s : x;
        sq.acy = (dir === 1 || dir === 2) ? y + s : y;
        sq.a0 = ((((1 - dir) % 4) + 4) % 4) * (Math.PI / 2);
        sq.len = s * (Math.PI / 2);
    }

    // cumulative arc length → the pen travels at a constant speed instead
    // of crawling through the tiny inner squares
    let total = 0;
    for (const sq of squares) { sq.at = total; total += sq.len; }

    const rectW = x1 - x0, rectH = y1 - y0;
    const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
    const norm = 2 / Math.max(rectW, rectH);

    return {
        label: 'espiral áurea', N: 3400,
        squares, fit: { w: rectW, h: rectH }, ox, oy,
        pointAt: (u) => {
            const target = u * total;
            let k = squares.length - 1;
            while (k > 0 && squares[k].at > target) k--;
            const sq = squares[k];
            const a = sq.a0 - Math.min(1, (target - sq.at) / sq.len) * (Math.PI / 2);
            return [(sq.acx + sq.s * Math.cos(a) - ox) * norm,
                    (sq.acy + sq.s * Math.sin(a) - oy) * norm];
        }
    };
}

/* Squares are stamped and lifted outside the per-frame segment path —
   they are their own subpaths, and beginPath() mid-stroke would discard
   the line being drawn. */
function stampSquare(pen, k, lifting) {
    const sq = pen.squares[k];
    const x = pen.cx + (sq.x - pen.ox) * pen.unit;
    const y = pen.cy + (sq.y - pen.oy) * pen.unit;
    const s = sq.s * pen.unit;
    if (lifting) {
        ink.globalCompositeOperation = 'destination-out';
        ink.strokeStyle = '#000';
        ink.lineWidth = pen.width + 1.8;
    } else {
        ink.strokeStyle = rgba(inkColor(pen), pen.alpha * 0.6);
        ink.lineWidth = pen.width * 0.9;
    }
    ink.beginPath();
    ink.rect(x, y, s, s);
    ink.stroke();
    if (lifting) ink.globalCompositeOperation = 'source-over';
}

/* The side length is written into the square once it is drawn. Anything
   under ~26px across is left unlabelled — the two unit squares at the eye
   of the spiral are far too small to hold a number. */
function labelSquare(pen, k) {
    const sq = pen.squares[k];
    const s = sq.s * pen.unit;
    if (s < 26) return;
    pen.labels.push({
        k, fib: sq.fib,
        x: pen.cx + (sq.x - pen.ox + sq.s / 2) * pen.unit,
        y: pen.cy + (sq.y - pen.oy + sq.s / 2) * pen.unit,
        size: Math.max(10, Math.min(30, s * 0.2)),
        t0: performance.now()
    });
}

/* --- slots ----------------------------------------------------
   Anchor points around the edges of the viewport. Plates are
   parked here so they sit beside the copy column, and two pens
   never share a slot — each pen dissolves its own bounding box,
   which would otherwise wipe a neighbour. */

let slots = [];
function buildSlots() {
    // Left and right bands only. The copy column runs down the middle of
    // the page and the background is fixed, so anything parked there ends
    // up behind body text at some scroll position. (The centre plate is
    // the deliberate exception — see GRAND_PEN.)
    const anchors = W < 900
        ? [[0.14, 0.10], [0.86, 0.27], [0.12, 0.50], [0.88, 0.70], [0.16, 0.90], [0.84, 0.95]]
        : [[0.08, 0.12], [0.92, 0.16], [0.06, 0.40], [0.94, 0.44],
           [0.09, 0.68], [0.91, 0.72], [0.12, 0.93], [0.88, 0.95]];
    slots = anchors.map(([fx, fy]) => ({ x: fx * W, y: fy * H, busy: false }));
}

/* --- pens ------------------------------------------------------ */

let pens = [];
let plateNo = 0;
let forcedKind = null;   // set by the console API in block 10; used once
let lastLabel = '';
let lastRoman = 'i';

function newPlate(pen) {
    plateNo++;
    const common = {
        seed: rand(0, 900),
        wob: rand(0.5, 1.3),
        alpha: pen.baseAlpha,
        i: 0,
        j: 0,
        phase: 'draw',
        hold: 0,
        eraseRate: ERASE_STEPS,
        roman: ROMAN[(plateNo - 1) % ROMAN.length]
    };

    if (pen.grand) {
        // Centre of the page, filling almost all of it.
        const fig = makeFigure('golden');
        const unit = Math.min(W * 0.94 / fig.fit.w, H * 0.9 / fig.fit.h);
        Object.assign(pen, fig, common, {
            cx: W / 2,
            cy: H / 2,
            unit,
            scale: unit * Math.max(fig.fit.w, fig.fit.h) / 2,
            wob: rand(0.4, 0.9),      // ruler-and-compass work: barely any play
            accent: false,
            labels: [],
            nextSq: 0,
            nextLift: 0
        });
    } else {
        if (pen.slot) pen.slot.busy = false;
        const free = slots.filter((s) => !s.busy && s !== pen.slot);
        const pool = free.length ? free : slots.filter((s) => !s.busy);
        const slot = pool.length ? pool[(Math.random() * pool.length) | 0] : slots[0];
        slot.busy = true;
        // Roughly a third of the plates are drawn large, so the page isn't
        // a set of identically sized medallions. Big ones get a lighter
        // hand since they reach further into the copy column.
        const big = Math.random() < 0.35;
        Object.assign(pen, makeFigure(forcedKind), common, {
            slot,
            cx: slot.x + rand(-16, 16),
            cy: slot.y + rand(-16, 16),
            scale: Math.min(W, H) * (big ? rand(0.17, 0.26) : rand(0.075, 0.13)),
            alpha: pen.baseAlpha * (big ? 0.8 : 1),
            accent: Math.random() < 0.22,
            squares: null,
            labels: []
        });
        forcedKind = null;   // a request from the console applies to one plate
    }

    const start = project(pen, 0);
    pen.px = start[0];
    pen.py = start[1];
    pen.ex = start[0];
    pen.ey = start[1];
    lastLabel = pen.label;
    lastRoman = pen.roman;
}

function project(pen, i) {
    const p = pen.pointAt(i / pen.N);
    return [
        pen.cx + p[0] * pen.scale + (noise(i * 0.02, pen.seed) - 0.5) * pen.wob,
        pen.cy + p[1] * pen.scale + (noise(i * 0.02, pen.seed + 37) - 0.5) * pen.wob
    ];
}

function inkColor(pen) {
    const pal = PALETTES[mode];
    return pen.accent ? pal.alt : pal.ink;
}

const STEPS_PER_FRAME = 3;
const ERASE_STEPS = 13;      // the pen lifts ink faster than it lays it down

function advance(pen) {
    if (pen.wait > 0) { pen.wait--; return; }

    if (pen.phase === 'draw') {
        // One path per frame. Nothing may call beginPath() inside this
        // loop — that would discard the path mid-build and the stroke
        // would render whatever shape restarted it.
        ink.strokeStyle = rgba(inkColor(pen), pen.alpha);
        ink.lineWidth = pen.width;
        ink.lineCap = 'round';
        ink.lineJoin = 'round';
        ink.beginPath();
        ink.moveTo(pen.px, pen.py);
        for (let s = 0; s < STEPS_PER_FRAME && pen.i < pen.N; s++) {
            pen.i++;
            const pt = project(pen, pen.i);
            ink.lineTo(pt[0], pt[1]);
            pen.px = pt[0];
            pen.py = pt[1];
        }
        ink.stroke();
        // squares the pen has just reached — stamped after the stroke, never
        // inside the loop above
        while (pen.squares && pen.nextSq < pen.squares.length &&
               pen.i >= squareIndex(pen, pen.nextSq)) {
            stampSquare(pen, pen.nextSq, false);
            labelSquare(pen, pen.nextSq);
            pen.nextSq++;
        }
        if (pen.i >= pen.N) {
            pen.phase = 'hold';
            pen.hold = pen.grand ? irand(420, 620) : irand(140, 260);
        }
        return;
    }

    if (pen.phase === 'hold') {
        if (--pen.hold <= 0) pen.phase = 'erase';
        return;
    }

    /* Erase: the pen retraces its own line and lifts the ink, in the
       order it was laid down. Dissolving a rectangle instead (the old
       way) left a hard rectangular seam where the fill stopped, wiped
       whatever else had been drawn inside that box, and ended on a hard
       clearRect — retracing touches this plate's pixels and nothing
       else. Stroke slightly wider than the line so the antialiased
       edges go with it. */
    ink.globalCompositeOperation = 'destination-out';
    ink.strokeStyle = '#000';
    ink.lineWidth = pen.width + 1.6;
    ink.lineCap = 'round';
    ink.lineJoin = 'round';
    ink.beginPath();
    ink.moveTo(pen.ex, pen.ey);
    for (let s = 0; s < pen.eraseRate && pen.j < pen.N; s++) {
        pen.j++;
        const pt = project(pen, pen.j);
        ink.lineTo(pt[0], pt[1]);
        pen.ex = pt[0];
        pen.ey = pt[1];
    }
    ink.stroke();
    ink.globalCompositeOperation = 'source-over';
    // lift each square as the retrace passes it, and drop its number
    while (pen.squares && pen.nextLift < pen.squares.length &&
           pen.j >= squareIndex(pen, pen.nextLift)) {
        stampSquare(pen, pen.nextLift, true);
        pen.labels = pen.labels.filter((l) => l.k !== pen.nextLift);
        pen.nextLift++;
    }
    if (pen.j >= pen.N) newPlate(pen);
}

/* Point index at which the pen enters square k's arc. */
function squareIndex(pen, k) {
    const sq = pen.squares[k];
    const last = pen.squares[pen.squares.length - 1];
    return Math.round((sq.at / (last.at + last.len)) * pen.N);
}

/* Konami swaps the palette; clear the page fast so the new ink shows. */
function dissolvePlates() {
    for (const pen of pens) {
        if (pen.phase !== 'erase') {
            pen.phase = 'erase';
            pen.j = 0;
            pen.nextLift = 0;
            // start from the figure's own first point — anywhere else and
            // the first erase segment cuts a swath across the page
            const start = project(pen, 0);
            pen.ex = start[0];
            pen.ey = start[1];
            pen.wait = 0;
        }
        pen.eraseRate = ERASE_STEPS * 5;
    }
}

/* --- live layer: nibs, lamp, caption --------------------------- */

function drawFx() {
    fx.clearRect(0, 0, W, H);
    const pal = PALETTES[mode];

    // reading lamp — a warm pool of light under the cursor
    if (pointer.active) {
        const g = fx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 250);
        g.addColorStop(0, rgba(pal.lamp, 0.05));
        g.addColorStop(0.5, rgba(pal.lamp, 0.018));
        g.addColorStop(1, rgba(pal.lamp, 0));
        fx.fillStyle = g;
        fx.fillRect(pointer.x - 250, pointer.y - 250, 500, 500);
    }

    // pen nibs — dimmer on the way back, when the pen is lifting ink
    for (const pen of pens) {
        if (pen.wait > 0) continue;
        const erasing = pen.phase === 'erase';
        if (pen.phase !== 'draw' && !erasing) continue;
        const x = erasing ? pen.ex : pen.px;
        const y = erasing ? pen.ey : pen.py;
        const k = erasing ? 0.5 : 1;
        fx.strokeStyle = rgba(pal.lamp, 0.4 * k);
        fx.lineWidth = 1;
        fx.beginPath();
        fx.arc(x, y, 3.5, 0, TAU);
        fx.stroke();
        fx.fillStyle = rgba(pal.lamp, 0.75 * k);
        fx.beginPath();
        fx.arc(x, y, 1.1, 0, TAU);
        fx.fill();
    }

    // side lengths of the golden rectangle. Each number counts up to its
    // Fibonacci value as the square lands and settles into place — the same
    // ease-out the hero ledger uses, so the page has one counting idiom.
    const now = performance.now();
    fx.textAlign = 'center';
    fx.textBaseline = 'middle';
    for (const pen of pens) {
        if (!pen.labels || !pen.labels.length) continue;
        for (const L of pen.labels) {
            const p = Math.min(1, (now - L.t0) / 760);
            const eased = 1 - Math.pow(1 - p, 3);
            const value = Math.max(1, Math.round(eased * L.fib));
            fx.font = `${L.size}px JetBrains Mono, ui-monospace, monospace`;
            fx.fillStyle = rgba(pal.lamp, Math.min(1, p * 2.4) * 0.3);
            fx.fillText(String(value), L.x, L.y + (1 - eased) * 7);
        }
    }
    fx.textAlign = 'left';
    fx.textBaseline = 'alphabetic';

    // caption for the plate most recently started, set in the margin
    // like an engraved figure number
    if (W > 700 && lastLabel) {
        fx.font = '10px JetBrains Mono, ui-monospace, monospace';
        fx.fillStyle = rgba(pal.lamp, 0.2);
        fx.fillText(`fig. ${lastRoman} · ${lastLabel}`, 26, H - 24);
    }
}

/* --- wiring --------------------------------------------------- */

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    for (const [cv, c] of [[inkCanvas, ink], [fxCanvas, fx]]) {
        cv.width = W * dpr;
        cv.height = H * dpr;
        cv.style.width = W + 'px';
        cv.style.height = H + 'px';
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.scale(dpr, dpr);
    }
    // resizing wipes the bitmap, so whatever was in progress is gone
    ink.clearRect(0, 0, W, H);
    buildSlots();

    const count = W < 900 ? 3 : 5;
    const specs = [GRAND_PEN, ...PENS.slice(0, count - 1)];
    pens = specs.map((spec, idx) => {
        const pen = {
            baseAlpha: spec.alpha,
            width: spec.width,
            grand: idx === 0,
            wait: 0,
            slot: null
        };
        newPlate(pen);
        // stagger the starts so the pens never finish together
        pen.wait = idx * irand(140, 380);
        return pen;
    });
}

let rafId = 0;
let running = true;
function loop() {
    rafId = requestAnimationFrame(loop);
    if (!running) return;
    for (const pen of pens) advance(pen);
    drawFx();
}

window.addEventListener('resize', resize, { passive: true });
window.addEventListener('mousemove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
}, { passive: true });
window.addEventListener('mouseout', () => { pointer.active = false; }, { passive: true });
window.addEventListener('blur', () => { pointer.active = false; });

document.addEventListener('visibilitychange', () => { running = !document.hidden; });

resize();
if (!prefersReducedMotion) loop();
else {
    // One finished plate per pen, printed in a single pass — no animation.
    for (const pen of pens) {
        pen.wait = 0;
        ink.strokeStyle = rgba(inkColor(pen), pen.alpha);
        ink.lineWidth = pen.width;
        ink.lineJoin = 'round';
        ink.beginPath();
        ink.moveTo(pen.px, pen.py);
        for (let i = 1; i <= pen.N; i++) {
            const pt = project(pen, i);
            ink.lineTo(pt[0], pt[1]);
            if (i % 900 === 0) { ink.stroke(); ink.beginPath(); ink.moveTo(pt[0], pt[1]); }
        }
        ink.stroke();
        // squares and their numbers, already settled
        if (pen.squares) {
            for (let k = 0; k < pen.squares.length; k++) {
                stampSquare(pen, k, false);
                labelSquare(pen, k);
            }
            for (const l of pen.labels) l.t0 = -10000;
            pen.nextSq = pen.squares.length;
        }
        pen.i = pen.N;
        pen.phase = 'hold';
        pen.hold = 1e9;
    }
    drawFx();
}

/* ===========================================================
   2 · TYPEWRITER — hero tagline
   =========================================================== */

/* Block 10 can take the tagline over as a console; while it holds it, the
   typewriter idles instead of overwriting what's being typed. */
let shellActive = false;

const typed = document.getElementById('typed');
if (typed && !prefersReducedMotion) {
    const phrases = [
        'Programa. Cria. Constrói.',
        'Da sala de aula até ao espaço.',
        'Curiosidade primeiro, sintaxe depois.',
        'Ninguém precisa de saber tudo.'
    ];
    let pi = 0, ci = 0, deleting = false;
    const tick = () => {
        // the console owns the line while it's open — idle, don't reset
        if (shellActive) { setTimeout(tick, 300); return; }
        const phrase = phrases[pi];
        if (!deleting) {
            ci++;
            typed.textContent = phrase.slice(0, ci);
            if (ci === phrase.length) {
                deleting = true;
                setTimeout(tick, 2600);
                return;
            }
            setTimeout(tick, 55 + Math.random() * 50);
        } else {
            ci--;
            typed.textContent = phrase.slice(0, ci);
            if (ci === 0) {
                deleting = false;
                pi = (pi + 1) % phrases.length;
                setTimeout(tick, 400);
                return;
            }
            setTimeout(tick, 28);
        }
    };
    tick();
} else if (typed) {
    typed.textContent = 'Programa. Cria. Constrói.';
}

/* ===========================================================
   3 · SCROLL REVEAL — IntersectionObserver
   =========================================================== */

function inInitialViewport(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // 40px margin matches the IO rootMargin below
    return r.top < (vh - 40) && r.bottom > 0;
}

let revealIO = null;
if ('IntersectionObserver' in window) {
    revealIO = new IntersectionObserver((entries) => {
        for (const e of entries) {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                revealIO.unobserve(e.target);
            }
        }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
}

/* Elements rendered from JSON register themselves here after mounting. */
function observeReveals(root) {
    const scope = root || document;
    scope.querySelectorAll('.reveal').forEach((el) => {
        if (el.classList.contains('visible')) return;
        // IO's first callback is async, which is too slow for the first
        // paint — anything already on screen is revealed straight away.
        if (inInitialViewport(el)) { el.classList.add('visible'); return; }
        if (revealIO) revealIO.observe(el);
        else el.classList.add('visible');
    });
}
observeReveals();

/* ===========================================================
   4 · ANIMATED COUNTERS — the ledger figures
   =========================================================== */

if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target;
            const dur = 900;
            const start = performance.now();
            const animate = (t) => {
                const target = +el.dataset.target;
                const p = Math.min(1, (t - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(eased * target);
                if (p < 1) requestAnimationFrame(animate);
                else {
                    el.textContent = target;
                    el.dataset.counted = '1';
                }
            };
            requestAnimationFrame(animate);
            cio.unobserve(el);
        }
    }, { threshold: 0.4 });
    document.querySelectorAll('.n[data-target]').forEach((c) => cio.observe(c));
}

/* ===========================================================
   5 · CARD TILT — paper lifting, not glass tipping
   =========================================================== */

const TILT_MAX = 2.5;
function bindTilt(card) {
    let raf = 0;
    let tx = 0, ty = 0;
    card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width  - 0.5;
        const y = (e.clientY - r.top)  / r.height - 0.5;
        tx = -y * TILT_MAX;
        ty =  x * TILT_MAX;
        if (raf) return;
        raf = requestAnimationFrame(() => {
            card.style.transform =
                `perspective(1000px) translateY(-3px) rotateX(${tx}deg) rotateY(${ty}deg)`;
            raf = 0;
        });
    });
    card.addEventListener('mouseleave', () => {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        card.style.transform = '';
    });
}
function bindTilts(root) {
    (root || document).querySelectorAll('[data-tilt]').forEach(bindTilt);
}
bindTilts();

/* ===========================================================
   6 · NAV — active section highlight + mobile burger
   =========================================================== */

const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
const sectionTargets = ['top', 'identity', 'journey', 'events', 'next', 'join']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

if ('IntersectionObserver' in window) {
    const nio = new IntersectionObserver((entries) => {
        for (const e of entries) {
            if (e.isIntersecting) {
                const id = '#' + e.target.id;
                navAnchors.forEach((a) => {
                    a.classList.toggle('active', a.getAttribute('href') === id);
                });
            }
        }
    }, { threshold: 0.35 });
    sectionTargets.forEach((s) => nio.observe(s));
}

const burger = document.getElementById('burger');
const navLinks = document.querySelector('.nav-links');
if (burger && navLinks) {
    burger.addEventListener('click', () => {
        burger.classList.toggle('open');
        navLinks.classList.toggle('open');
    });
    navLinks.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            burger.classList.remove('open');
            navLinks.classList.remove('open');
        }
    });
}

/* ===========================================================
   7 · KONAMI CODE — swap the amber tube for a green phosphor one
   =========================================================== */

const konami = [
    'ArrowUp','ArrowUp','ArrowDown','ArrowDown',
    'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight',
    'b','a'
];
let kIdx = 0;
window.addEventListener('keydown', (e) => {
    if (shellActive) return;   // keys belong to the console while it's open
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === konami[kIdx]) {
        kIdx++;
        if (kIdx === konami.length) {
            mode = mode === 'phosphor' ? 'normal' : 'phosphor';
            document.body.classList.toggle('phosphor-mode', mode === 'phosphor');
            dissolvePlates();
            kIdx = 0;
            flashStatus(mode === 'phosphor' ? 'phosphor tube · on' : 'phosphor tube · off');
        }
    } else {
        kIdx = (k === konami[0]) ? 1 : 0;
    }
});

function flashStatus(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
        position: 'fixed', bottom: '1.5rem', left: '50%',
        transform: 'translateX(-50%)',
        padding: '0.7rem 1.15rem',
        background: 'var(--bg-elev)',
        border: '1px solid var(--border-hot)',
        boxShadow: '3px 3px 0 rgba(8, 6, 4, 0.6)',
        color: 'var(--brass)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        zIndex: '9999',
        opacity: '0',
        transition: 'opacity 0.3s, transform 0.3s'
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(-4px)';
    });
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
    }, 1900);
}

/* ===========================================================
   8 · CONTENT — the three JSON files that drive the page
   ===========================================================
   data/projects.json  → "O que já construímos"
   data/events.json    → "O que está planeado"
   data/next.json      → "O que aí vem"

   Each file is the committed source of truth: what's in the repo is
   what visitors see. The admin panel edits projects + events in the
   browser only (localStorage), and exports a replacement file to
   commit. next.json is edited by hand — it changes once a year.
   =========================================================== */

const $ = (id) => document.getElementById(id);

function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Titles may wrap one word in *asterisks* to colour it. */
function inline(s) {
    return escapeHTML(s).replace(/\*([^*]+)\*/g, '<span class="accent">$1</span>');
}

function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* Deterministic 7-char hash so each log entry keeps the same id
   between reloads — the same trick git uses to name a commit. */
function shortHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0').slice(0, 7);
}

function tagsHTML(tags) {
    const items = (tags || []).filter(Boolean).map((t) => `<li>${escapeHTML(t)}</li>`).join('');
    return items ? `<ul class="tags">${items}</ul>` : '';
}

/* --- a tiny store: committed file + local draft + export ------- */

function createStore({ key, url, field, filename }) {
    return {
        key, url, field, filename,
        help: '',
        committed: [],
        current: [],
        async load() {
            try {
                const res = await fetch(this.url, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data[this.field])) this.committed = data[this.field];
                    if (data && typeof data._help === 'string') this.help = data._help;
                }
            } catch (_) { /* offline or file:// — fall back to the local draft */ }
            const local = this.readLocal();
            this.current = local !== null ? local : [...this.committed];
        },
        readLocal() {
            try {
                const raw = localStorage.getItem(this.key);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed[this.field])) return parsed[this.field];
            } catch (_) { /* ignore */ }
            return null;
        },
        saveLocal() {
            localStorage.setItem(this.key, JSON.stringify({ [this.field]: this.current }));
        },
        clearLocal() {
            localStorage.removeItem(this.key);
            this.current = [...this.committed];
        },
        isDirty() {
            return JSON.stringify(this.current) !== JSON.stringify(this.committed);
        },
        download(items) {
            const payload = {};
            if (this.help) payload._help = this.help;
            payload[this.field] = items || this.current;
            const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
            const href = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = href;
            a.download = this.filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(href); a.remove(); }, 100);
        }
    };
}

const eventsStore = createStore({
    key: 'devsclub.events.local.v1',
    url: 'data/events.json',
    field: 'events',
    filename: 'events.json'
});
const worksStore = createStore({
    key: 'devsclub.projects.local.v1',
    url: 'data/projects.json',
    field: 'projects',
    filename: 'projects.json'
});

/* --- render: projects ----------------------------------------- */

function renderWorks() {
    const host = $('works-list');
    if (!host) return;
    host.innerHTML = '';
    for (const w of worksStore.current) {
        const el = document.createElement('article');
        el.className = 'work reveal';
        el.setAttribute('data-tilt', '');
        el.innerHTML = `
            <header class="work-head">
                <span class="work-file">${escapeHTML(w.file || (w.id || 'projeto') + '.md')}</span>
                ${w.category ? `<span class="work-cat">${escapeHTML(w.category)}</span>` : ''}
            </header>
            <h3>${inline(w.title || '')}</h3>
            ${w.tagline ? `<p class="tagline">${escapeHTML(w.tagline)}</p>` : ''}
            <p class="body">${escapeHTML(w.description || '')}</p>
            ${tagsHTML(w.tags)}
        `;
        host.appendChild(el);
    }
    observeReveals(host);
    bindTilts(host);

    const stat = $('stat-projects');
    if (stat) {
        stat.dataset.target = String(worksStore.current.length);
        if (stat.dataset.counted === '1') stat.textContent = worksStore.current.length;
    }
}

/* --- render: events, as a commit log --------------------------- */

function sortEvents(arr) {
    // Newest first — ISO dates sort lexicographically
    return [...arr].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function renderEvents() {
    const list = $('events-list');
    const empty = $('events-empty');
    const head = $('log-head');
    const foot = $('log-foot');
    if (!list || !empty) return;

    const sorted = sortEvents(eventsStore.current);
    list.innerHTML = '';
    const has = sorted.length > 0;
    empty.hidden = has;
    if (head) head.hidden = !has;
    if (foot) foot.hidden = !has;
    if (!has) return;

    const today = new Date().toISOString().slice(0, 10);
    for (const ev of sorted) {
        const li = document.createElement('li');
        li.className = 'event';
        const upcoming = (ev.date || '') >= today;
        li.innerHTML = `
            <div class="event-head">
                <span class="event-hash">${shortHash(ev.id || ev.title || '')}</span>
                <span class="event-date">${escapeHTML(formatDate(ev.date))}</span>
                ${ev.category ? `<span class="event-cat">${escapeHTML(ev.category)}</span>` : ''}
                <span class="event-ref">${upcoming ? 'planeado' : 'feito'}</span>
            </div>
            <h3>${inline(ev.title || '')}</h3>
            <p>${escapeHTML(ev.description || '')}</p>
            ${tagsHTML(ev.tags)}
        `;
        list.appendChild(li);
    }
}

/* --- render: next chapter -------------------------------------- */

async function renderNext() {
    const host = $('next-card');
    if (!host) return;
    let n = null;
    try {
        const res = await fetch('data/next.json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && data.next) n = data.next;
        }
    } catch (_) { /* leave the section empty rather than showing a broken card */ }
    if (!n) { host.hidden = true; return; }

    const points = (n.points || []).map((p) => `
        <div class="next-point">
            <strong>${escapeHTML(p.title || '')}</strong>
            <span>${escapeHTML(p.text || '')}</span>
        </div>
    `).join('');

    host.innerHTML = `
        <div class="next-top">
            <div class="next-badge">
                <span class="badge-dot"></span>
                ${escapeHTML(n.badge || '')}
                ${n.state ? `<span class="state">· ${escapeHTML(n.state)}</span>` : ''}
            </div>
            ${n.file ? `<div class="next-file">ficheiro: <em>${escapeHTML(n.file)}</em></div>` : ''}
        </div>
        <h3>${inline(n.title || '')}</h3>
        <p class="lead">${escapeHTML(n.description || '')}</p>
        ${points ? `<div class="next-points">${points}</div>` : ''}
    `;
}

/* ===========================================================
   8b · ADMIN — local editor for projects + events
   ===========================================================
   The password lives in data/admin.local.json, which .gitignore
   keeps out of the repo. Format: { "password": "..." }
   Missing file (deployed site, fresh clone) → admin UI is hidden
   and login is impossible. This is a convenience gate on one
   machine, not real auth: the integrity boundary is git.
   =========================================================== */

let ADMIN_PASSWORD = null;
const LS_ADMIN_KEY = 'devsclub.admin.session.v1';
let isAdmin = false;

async function tryLoadAdminConfig() {
    try {
        const res = await fetch('data/admin.local.json', { cache: 'no-store' });
        if (!res.ok) return false;
        const data = await res.json();
        if (data && typeof data.password === 'string' && data.password.length > 0) {
            ADMIN_PASSWORD = data.password;
            return true;
        }
    } catch (_) { /* file missing or malformed → admin disabled */ }
    return false;
}

function disableAdminUI() {
    const trigger = $('admin-trigger');
    if (trigger) trigger.hidden = true;
    const sep = trigger && trigger.previousElementSibling;
    if (sep && sep.classList.contains('sep')) sep.hidden = true;
    const emptyLink = $('events-empty-admin');
    if (emptyLink) emptyLink.remove();
}

/* --- login --- */

const loginModal = $('login-modal');
const loginForm = $('login-form');
const loginPw = $('login-pw');
const loginError = $('login-error');

function openLogin(e) {
    if (e) e.preventDefault();
    if (!ADMIN_PASSWORD) return;
    if (isAdmin) { openAdmin(); return; }
    if (!loginModal) return;
    loginModal.hidden = false;
    loginModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => loginPw && loginPw.focus(), 30);
}
function closeLogin() {
    if (!loginModal) return;
    loginModal.hidden = true;
    loginModal.setAttribute('aria-hidden', 'true');
    if (loginForm) loginForm.reset();
    if (loginError) loginError.hidden = true;
}

$('admin-trigger') && $('admin-trigger').addEventListener('click', openLogin);
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'events-empty-admin') openLogin(e);
});

loginModal && loginModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) closeLogin();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loginModal && !loginModal.hidden) closeLogin();
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        if (!ADMIN_PASSWORD) return;
        e.preventDefault();
        openLogin();
    }
});

loginForm && loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!loginPw || !ADMIN_PASSWORD) return;
    if (loginPw.value === ADMIN_PASSWORD) {
        isAdmin = true;
        sessionStorage.setItem(LS_ADMIN_KEY, '1');
        closeLogin();
        openAdmin();
    } else {
        if (loginError) loginError.hidden = false;
        loginPw.value = '';
        loginPw.focus();
    }
});

if (sessionStorage.getItem(LS_ADMIN_KEY) === '1') isAdmin = true;

/* --- panel shell --- */

const adminPanel = $('admin-panel');
const adminDirty = $('admin-dirty');

function openAdmin() {
    if (!isAdmin || !adminPanel) return;
    adminPanel.hidden = false;
    adminPanel.setAttribute('aria-hidden', 'false');
    renderAdminEvents();
    renderAdminWorks();
    updateDirtyUI();
}
function closeAdmin() {
    if (!adminPanel) return;
    adminPanel.hidden = true;
    adminPanel.setAttribute('aria-hidden', 'true');
}
$('admin-close') && $('admin-close').addEventListener('click', closeAdmin);
$('admin-logout') && $('admin-logout').addEventListener('click', () => {
    isAdmin = false;
    sessionStorage.removeItem(LS_ADMIN_KEY);
    closeAdmin();
});

document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        document.querySelectorAll('.admin-tab').forEach((t) => {
            const on = t === tab;
            t.classList.toggle('is-on', on);
            t.setAttribute('aria-selected', String(on));
        });
        document.querySelectorAll('.admin-pane').forEach((p) => {
            p.hidden = p.dataset.pane !== name;
        });
    });
});

function updateDirtyUI() {
    const dirty = eventsStore.isDirty() || worksStore.isDirty();
    if (adminDirty) adminDirty.hidden = !dirty;
    const evDiscard = $('admin-discard');
    const wkDiscard = $('work-discard');
    if (evDiscard) evDiscard.hidden = !eventsStore.isDirty();
    if (wkDiscard) wkDiscard.hidden = !worksStore.isDirty();
}

function slugify(s, max) {
    return (s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, max || 40);
}

/* --- admin: events --- */

const adminList = $('admin-list');

function renderAdminEvents() {
    if (!adminList) return;
    const sorted = sortEvents(eventsStore.current);
    const count = $('admin-count');
    if (count) count.textContent = sorted.length;
    const committedIds = new Set(eventsStore.committed.map((e) => e.id));
    adminList.innerHTML = '';
    for (const ev of sorted) {
        const li = document.createElement('li');
        li.className = 'admin-list-item' + (committedIds.has(ev.id) ? '' : ' local');
        li.innerHTML = `
            <div class="admin-li-main">
                <div class="admin-li-date">${escapeHTML(ev.date || '')}</div>
                <div class="admin-li-title">${escapeHTML(ev.title || '(sem título)')}</div>
            </div>
            <div class="admin-li-actions">
                <button class="admin-li-btn del" data-id="${escapeHTML(ev.id)}" title="apagar">del</button>
            </div>
        `;
        adminList.appendChild(li);
    }
    adminList.querySelectorAll('.del').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!confirm('Apagar este registo?')) return;
            eventsStore.current = eventsStore.current.filter((e) => e.id !== btn.dataset.id);
            eventsStore.saveLocal();
            renderEvents();
            renderAdminEvents();
            updateDirtyUI();
        });
    });
}

$('admin-form') && $('admin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('ev-date').value;
    const title = $('ev-title').value.trim();
    const description = $('ev-desc').value.trim();
    if (!date || !title || !description) return;
    eventsStore.current = [{
        id: `ev-${date}-${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        title,
        category: $('ev-category').value.trim() || undefined,
        description,
        tags: $('ev-tags').value.split(',').map((t) => t.trim()).filter(Boolean)
    }, ...eventsStore.current];
    eventsStore.saveLocal();
    renderEvents();
    renderAdminEvents();
    updateDirtyUI();
    e.target.reset();
    $('ev-title').focus();
});

$('admin-export') && $('admin-export').addEventListener('click', () => {
    eventsStore.download(sortEvents(eventsStore.current));
    flashStatus('events.json descarregado — substitui o ficheiro e faz commit');
});

$('admin-discard') && $('admin-discard').addEventListener('click', () => {
    if (!confirm('Descartar alterações locais e voltar ao que está em data/events.json?')) return;
    eventsStore.clearLocal();
    renderEvents();
    renderAdminEvents();
    updateDirtyUI();
});

/* --- admin: projects --- */

const workList = $('work-list');

function renderAdminWorks() {
    if (!workList) return;
    const items = worksStore.current;
    const count = $('work-count');
    if (count) count.textContent = items.length;
    const committedIds = new Set(worksStore.committed.map((w) => w.id));
    workList.innerHTML = '';
    items.forEach((w, i) => {
        const li = document.createElement('li');
        li.className = 'admin-list-item' + (committedIds.has(w.id) ? '' : ' local');
        li.innerHTML = `
            <div class="admin-li-main">
                <div class="admin-li-date">${escapeHTML(w.file || w.category || '')}</div>
                <div class="admin-li-title">${escapeHTML((w.title || '(sem título)').replace(/\*/g, ''))}</div>
            </div>
            <div class="admin-li-actions">
                <button class="admin-li-btn up" data-i="${i}" title="subir" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="admin-li-btn down" data-i="${i}" title="descer" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="admin-li-btn del" data-i="${i}" title="apagar">del</button>
            </div>
        `;
        workList.appendChild(li);
    });

    const commit = () => {
        worksStore.saveLocal();
        renderWorks();
        renderAdminWorks();
        updateDirtyUI();
    };
    workList.querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        if (i <= 0) return;
        const a = worksStore.current;
        [a[i - 1], a[i]] = [a[i], a[i - 1]];
        commit();
    }));
    workList.querySelectorAll('.down').forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        const a = worksStore.current;
        if (i >= a.length - 1) return;
        [a[i + 1], a[i]] = [a[i], a[i + 1]];
        commit();
    }));
    workList.querySelectorAll('.del').forEach((b) => b.addEventListener('click', () => {
        if (!confirm('Apagar este projeto?')) return;
        worksStore.current.splice(+b.dataset.i, 1);
        commit();
    }));
}

$('work-form') && $('work-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('wk-title').value.trim();
    const description = $('wk-desc').value.trim();
    if (!title || !description) return;
    const id = slugify(title.replace(/\*/g, '')) || `projeto-${Date.now()}`;
    worksStore.current = [...worksStore.current, {
        id,
        file: $('wk-file').value.trim() || `${id}.md`,
        category: $('wk-category').value.trim() || undefined,
        title,
        tagline: $('wk-tagline').value.trim() || undefined,
        description,
        tags: $('wk-tags').value.split(',').map((t) => t.trim()).filter(Boolean)
    }];
    worksStore.saveLocal();
    renderWorks();
    renderAdminWorks();
    updateDirtyUI();
    e.target.reset();
    $('wk-title').focus();
});

$('work-export') && $('work-export').addEventListener('click', () => {
    worksStore.download();
    flashStatus('projects.json descarregado — substitui o ficheiro e faz commit');
});

$('work-discard') && $('work-discard').addEventListener('click', () => {
    if (!confirm('Descartar alterações locais e voltar ao que está em data/projects.json?')) return;
    worksStore.clearLocal();
    renderWorks();
    renderAdminWorks();
    updateDirtyUI();
});

/* --- boot the content --- */

eventsStore.load().then(renderEvents);
worksStore.load().then(renderWorks);
renderNext();

tryLoadAdminConfig().then((ok) => {
    if (!ok) {
        disableAdminUI();
        sessionStorage.removeItem(LS_ADMIN_KEY);
        isAdmin = false;
    }
});

/* ===========================================================
   9 · BOOT — a branded log for anyone who opens devtools
   =========================================================== */

const css = (c) => `color:${c};font-family:JetBrains Mono,monospace;`;
console.log('%cDeveloper\'s Club', css('#c25a2e') + 'font-size:15px;font-weight:bold;');
console.log('%c> ESQP · 2025/2026 · on branch main', css('#d8a441'));
console.log('%c> conteúdo: data/projects.json · data/events.json · data/next.json', css('#79b39d'));
console.log('%c> dica: tenta ↑↑↓↓←→←→ba, ou club.help()', css('#83705a') + 'font-style:italic;');

/* ===========================================================
   10 · EASTER EGGS — for anyone who pokes around
   ===========================================================
   Four more, each found a different way, so they read as a set
   rather than variations on one trick:

     · type  fib / ink / sudo  anywhere on the page
     · click the hero emblem five times → paper proof
     · click the hero prompt → a small console in the tagline
     · open devtools and call club.help()

   Block 7's konami code is the fifth. Everything here reuses
   what the page already has — the plotter, the ledger, the
   emblem — rather than adding new machinery.
   =========================================================== */

/* --- the ledger runs the sequence it was already hinting at --- */

let fibRunning = false;
function runFibonacci() {
    const cells = document.querySelectorAll('.ledger-row .v');
    if (!cells.length || fibRunning) return;
    fibRunning = true;
    const original = [...cells].map((c) => c.textContent);
    const seq = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
    let step = 0;
    flashStatus('fibonacci()');
    const id = setInterval(() => {
        cells.forEach((c, n) => { c.textContent = seq[(step + n * 2) % seq.length]; });
        if (++step > seq.length) {
            clearInterval(id);
            cells.forEach((c, n) => { c.textContent = original[n]; });
            fibRunning = false;
        }
    }, 110);
}

/* --- a fresh sheet: every pen lifts its plate and starts over --- */

function freshSheet(kind) {
    forcedKind = kind || null;
    dissolvePlates();
    flashStatus(kind ? `folha nova · ${kind}` : 'folha nova');
}

/* --- typed words, anywhere on the page ------------------------ */

const WORDS = {
    fib:   runFibonacci,
    ink:   () => freshSheet(),
    sudo:  () => flashStatus('sudo: este clube não tem root'),
    carta: () => openPost()
};
const LONGEST_WORD = Math.max(...Object.keys(WORDS).map((w) => w.length));
let wordBuffer = '';

window.addEventListener('keydown', (e) => {
    if (shellActive || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    // never while someone is filling in the admin panel
    if (e.target && e.target.matches && e.target.matches('input, textarea')) return;
    wordBuffer = (wordBuffer + e.key.toLowerCase()).slice(-LONGEST_WORD);
    for (const word of Object.keys(WORDS)) {
        if (wordBuffer.endsWith(word)) {
            WORDS[word]();
            wordBuffer = '';
            break;
        }
    }
});

/* --- five clicks on the emblem: plate ↔ paper proof ------------ */

const heroPlate = document.querySelector('.hero-plate');
if (heroPlate) {
    let taps = 0, tapTimer = 0;
    heroPlate.addEventListener('click', () => {
        taps++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { taps = 0; }, 1400);
        if (taps >= 5) {
            taps = 0;
            const proofing = heroPlate.classList.toggle('proof');
            flashStatus(proofing ? 'prova em papel' : 'chapa de volta');
        }
    });
}

/* --- the tagline is a real prompt if you click it -------------- */

const tagline = document.querySelector('.hero-tagline');
let shellInput = null;
let outputTimer = 0;

function shellPrint(text) {
    if (!typed) return;
    typed.textContent = text;
    clearTimeout(outputTimer);
    outputTimer = setTimeout(() => {
        if (shellActive && shellInput) typed.textContent = shellInput.value;
    }, 2400);
}

function runCommand(line) {
    const [name, ...args] = line.split(/\s+/);
    switch (name) {
        case '':        return;
        case 'help':    return shellPrint('ls · whoami · uptime · plot · fib · sair');
        case 'ls':      return shellPrint('identidade  percurso  diário  próximo  junta-te');
        case 'whoami':  return shellPrint('visitante@esqp');
        case 'uptime':  return shellPrint(`${Math.round(performance.now() / 1000)}s nesta página`);
        case 'plot':    freshSheet(args[0]); return shellPrint('folha nova');
        case 'fib':     runFibonacci(); return shellPrint('fibonacci()');
        case 'sudo':    return shellPrint('este clube não tem root');
        case 'exit':
        case 'sair':    return closeShell();
        default:        return shellPrint(`comando desconhecido: ${name}`);
    }
}

function openShell() {
    if (shellActive || !typed || !tagline) return;
    shellActive = true;
    tagline.classList.add('shell');
    typed.textContent = '';

    if (!shellInput) {
        // a real input, so phones raise a keyboard; it is visually hidden
        // and everything typed is mirrored into #typed
        shellInput = document.createElement('input');
        shellInput.className = 'shell-input';
        shellInput.setAttribute('aria-label', 'consola do clube');
        shellInput.autocomplete = 'off';
        shellInput.spellcheck = false;
        tagline.appendChild(shellInput);

        shellInput.addEventListener('input', () => {
            clearTimeout(outputTimer);
            typed.textContent = shellInput.value;
        });
        shellInput.addEventListener('keydown', (e) => {
            // the konami and word listeners must not see these keys
            e.stopPropagation();
            if (e.key === 'Enter') {
                const line = shellInput.value.trim();
                shellInput.value = '';
                runCommand(line);
            } else if (e.key === 'Escape') {
                closeShell();
            }
        });
        shellInput.addEventListener('blur', closeShell);
    }

    shellInput.value = '';
    shellInput.focus();
    flashStatus('consola aberta · escreve help · esc para sair');
}

function closeShell() {
    if (!shellActive) return;
    shellActive = false;
    clearTimeout(outputTimer);
    if (tagline) tagline.classList.remove('shell');
    if (shellInput) shellInput.blur();
    if (typed) typed.textContent = '';
}

tagline && tagline.addEventListener('click', (e) => {
    if (e.target === shellInput) return;
    openShell();
});

/* --- break the wax seal: a letter to the club ------------------
   The site is static — nothing here can send mail on its own. The
   form composes the letter and hands it to the visitor's mail app
   (or Gmail on the web), which is the only honest option without a
   backend. Swapping this for a real send means pointing the form
   at a service endpoint; the fields are already the right shape. */

const CLUB_ADDRESS = ['developersclub.esqp', 'gmail.com'].join('@');
const postModal = $('post-modal');
const postForm = $('post-form');

function letterText() {
    const name = ($('post-name').value || '').trim();
    const from = ($('post-from').value || '').trim();
    const body = ($('post-body').value || '').trim();
    return `${body}\n\n—\n${name}${from ? ` · ${from}` : ''}\nenviado pelo site do Developer's Club`;
}

function openPost() {
    if (!postModal) return;
    const addr = $('post-address');
    if (addr) addr.textContent = CLUB_ADDRESS;
    postModal.hidden = false;
    postModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const f = $('post-name'); if (f) f.focus(); }, 30);
    flashStatus('selo quebrado · correio do clube');
}

function closePost() {
    if (!postModal) return;
    postModal.hidden = true;
    postModal.setAttribute('aria-hidden', 'true');
}

postModal && postModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) closePost();
});

postForm && postForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = ($('post-subject').value || 'Olá, Developer\'s Club').trim();
    window.location.href = `mailto:${CLUB_ADDRESS}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(letterText())}`;
    flashStatus('carta aberta no teu email');
    setTimeout(closePost, 400);
});

$('post-gmail') && $('post-gmail').addEventListener('click', (e) => {
    e.preventDefault();
    const subject = ($('post-subject').value || 'Olá, Developer\'s Club').trim();
    window.open('https://mail.google.com/mail/?view=cm&fs=1' +
        `&to=${encodeURIComponent(CLUB_ADDRESS)}` +
        `&su=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(letterText())}`, '_blank', 'noopener');
});

$('post-copy') && $('post-copy').addEventListener('click', () => {
    const done = () => flashStatus('endereço copiado');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(CLUB_ADDRESS).then(done, () => flashStatus(CLUB_ADDRESS));
    } else {
        flashStatus(CLUB_ADDRESS);
    }
});

// the seal itself: three clicks breaks it
const footSeal = document.querySelector('.foot-seal');
if (footSeal) {
    footSeal.classList.add('is-seal');
    footSeal.setAttribute('title', 'selo do clube');
    let breaks = 0, breakTimer = 0;
    footSeal.addEventListener('click', () => {
        breaks++;
        clearTimeout(breakTimer);
        breakTimer = setTimeout(() => { breaks = 0; }, 1500);
        if (breaks >= 3) { breaks = 0; openPost(); }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && postModal && !postModal.hidden) closePost();
});

/* --- and the console API --------------------------------------- */

const KINDS = {
    'harmonograph': 'harmonograph', 'harmonógrafo': 'harmonograph',
    'guilloche': 'guilloche', 'guilhoche': 'guilloche', 'guilhochê': 'guilloche',
    'rose': 'rose', 'rosacea': 'rose', 'rosácea': 'rose'
};

window.club = {
    help() {
        const t = css('#d8a441'), d = css('#83705a');
        console.log('%cclub.help()', css('#c25a2e') + 'font-weight:bold;');
        console.log('%c  club.plot(figura)  %co desenho seguinte: harmonógrafo · guilhochê · rosácea', t, d);
        console.log('%c  club.sheet()       %cfolha nova, todos os desenhos recomeçam', t, d);
        console.log('%c  club.fib()         %co livro de registo conta a sequência de Fibonacci', t, d);
        console.log('%c  club.proof()       %ca chapa do emblema passa a prova em papel', t, d);
        console.log('%c  club.carta()       %cescrever ao clube', t, d);
        console.log('%c  na página:         %cescreve fib · ink · sudo · carta, clica no emblema 5x,', t, d);
        console.log('%c                     %cclica no prompt, ou parte o selo no rodapé (3x)', t, d);
        return 'boa exploração.';
    },
    plot(kind) {
        const k = KINDS[String(kind || '').toLowerCase()];
        if (!k) return 'figuras: harmonógrafo · guilhochê · rosácea';
        freshSheet(k);
        return `a desenhar ${kind}`;
    },
    sheet() { freshSheet(); return 'folha nova'; },
    fib() { runFibonacci(); return 'fibonacci()'; },
    carta() { openPost(); return 'correio do clube aberto'; },
    proof() {
        if (!heroPlate) return 'sem emblema nesta página';
        const on = heroPlate.classList.toggle('proof');
        flashStatus(on ? 'prova em papel' : 'chapa de volta');
        return on ? 'prova em papel' : 'chapa de volta';
    }
};

})();
