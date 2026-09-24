# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important
Maintain ~/Projects/papercuts.md, a global log shared by all my Claude sessions of anything that slowed down development. When you lose time to one mid-session, append date · symptom · fix · project. Check this file first when tooling fails mysteriously.

## What this is

Static one-page site for **Developer's Club / ESQP · 2025/2026**. Vanilla HTML / CSS / JS, no build step, no dependencies. UI copy is Portuguese. Deploys as-is to GitHub Pages — `index.html` at root is the entrypoint. Source of truth for the club's content is `~/Downloads/Developers_Club.pptx` (slides 1–9 — identity, projects, next chapter, join info).

## Running it

```bash
python -m http.server 8000        # then http://localhost:8000
```

No HMR — reload the browser after edits. `package.json` exists but declares no deps and isn't used.
Open the page over **http**, not `file://` — the content is fetched with `fetch()`.

## Editing the content (no code)

Three JSON files under `data/` drive the three content sections. Edit the file, commit, push — that's the whole publishing flow. Each file carries a `_help` key explaining itself; the loader ignores it, and `download()` preserves it on export.

| File | Section on the page |
|---|---|
| `data/projects.json` | `#journey` — "O que já construímos" |
| `data/events.json` | `#events` — "O que está planeado" |
| `data/next.json` | `#next` — "O que aí vem" |

In any `title` field, wrapping a word in `*asterisks*` renders it in the accent colour (`inline()` in `index.js` escapes the HTML first, so the JSON stays plain text). `projects.json` order is the on-page order; events are sorted by `date` (newest first) regardless of file order.

`projects.json` and `events.json` are also editable from the admin panel (below). `next.json` is edited by hand — it changes about once a year.

## Design direction

"Livro de registo" — an aged workshop ledger lit by a warm CRT. Dark walnut ground, parchment text, oxidised-iron/brass/verdigris accents, paper grain, ruled-paper lines. Modern layout, antique surface. Structural devices are borrowed from real computing artifacts and are meant to stay content-true:

- the **events timeline is a `git log --graph`** — commit rail, nodes, a short hash per entry, `planeado`/`feito` refs. It matches the actual publishing flow (edits land by commit).
- **project cards sit on fanfold tractor-feed paper** — the sprocket strip is `.work::before`.
- the **hero ledger** (projects / pillars / curiosity) is an index with dotted leaders, not big-number stat tiles.
- **buttons letterpress**: `box-shadow` offset collapses on `:hover`/`:active` so they physically press into the page.
- the **club emblem** (`images/logo.jpg`) is a black-ground woodcut, so it's composited with `mix-blend-mode: screen` + a warm `sepia/hue-rotate` filter. That's why it sits on the page with no visible box — don't replace it with a plain `<img>`.

## Architecture

- `index.html` — `<header class="hero">` + five `<section>`s (`#identity`, `#journey`, `#events`, `#next`, `#join`) + `<footer>` + admin login modal + admin side panel. Section IDs are the anchor targets for the nav and the `IntersectionObserver` that highlights the active nav link. `#journey`, `#events` and `#next` are empty shells filled from JSON.
- `styles/style.css` — single stylesheet, CSS variables only (no preprocessor). Palette in `:root`: `--rust` (primary) → `--brass` (secondary) → `--verdigris` (code/links), on `--ink` with `--paper` text. `body.phosphor-mode` redefines those for the konami easter egg — everything using the variables follows automatically. `--panel` / `--panel-blur` are the ground every card of body copy sits on — pillars, project cards, log entries, the next-chapter card. The plotter draws across the whole page, and the readability comes from the blur as much as the fill: the plate still reads through the card, softened into a wash rather than hairlines crossing the text. **Raise the blur before raising the alpha** — an opaque panel kills the layering and the cards turn into slabs. Use these tokens for any new text block rather than inventing another translucent gradient.
- `index.js` — IIFE, nine numbered blocks (see comments). Block boundaries matter; new behavior should be added as a new block at the bottom rather than threaded into existing ones.
- `data/*.json` — committed content, described above. **Public visitors only ever see what's committed.**

### Background: the plotters (`index.js` block 1)

Five unseen drafting pens (three under 900px) each ink their own **plate**, hold it, lift it, and start another. One pen is reserved for the centre of the page; the rest work small figures in the margins. Two stacked full-window canvases:

- `<canvas id="bg">` (`z-index: -4`) — the **ink layer, never cleared while a plate is drawing**. Each frame strokes only the `STEPS_PER_FRAME` segments each pen just travelled, so figures accumulate like real ink and the per-frame cost stays constant instead of growing with the drawing. This is the reason the whole thing is cheap; if you ever change it to redraw full paths per frame, the cost becomes O(points).
- `<canvas id="bg-fx">` (`z-index: -3`) — the **live layer, cleared every frame**: the pen nibs, the plate caption (`fig. iii · guilhochê`, suppressed under 700px), and the warm reading-lamp glow that follows the cursor. Anything that must not accumulate belongs here.

`makeFigure()` returns `{ label, N, pointAt(u) }` where `u` goes 0→1 and the result is roughly in `[-1, 1]` — the drawing code never knows which curve it has. The margin pens draw harmonographs (detuned decaying pendulums), guilloché rings (hypotrochoid — the engine-turned ornament on old certificates) and roses. **Every family is parameter-constrained to stay ornamental** — coprime ratios, `k ≠ 1`, and on the guilloché a rolling circle small against the offset. Loosen those and figures collapse into plain circles, ellipses or a pile of overlapping rings. Roughly a third of margin plates are drawn large (and correspondingly fainter) so the page isn't a set of identical medallions.

#### The centre plate

`makeGoldenConstruction(terms)` builds the golden rectangle the way it's built on paper: a unit square, then a square along one side of the growing rectangle, turning a quarter each time. Sides come out as the Fibonacci numbers and a quarter-circle in each square chains into the spiral.

- **Arcs are the pen's path**; **squares are stamped separately** as the pen reaches each one, and lifted again on the way out. They're their own subpaths, so `stampSquare()` is always called *after* the frame's `stroke()` — never inside the segment loop.
- **Each arc is centred on the trailing end of the edge its square shares with the rectangle before it**, sweeping −90° (counter-clockwise on screen, y down). That is the only corner of the four that leaves consecutive arcs curving the *same* way. Centre them on the opposite corner and the chain is still continuous — every arc still meets the next — but the curvature flips at each junction and the figure draws as a star of cusps instead of a spiral. Continuity alone does not prove it's right; check that the two centres at a junction sit on the same side (the dot product of the radius vectors is +1, not −1).
- Every square flips the rectangle's aspect, so **the term count decides landscape vs portrait**: 10 terms on a wide viewport, 9 on a tall one. Get this wrong and the construction can only fill one axis.
- `pointAt(u)` walks a **cumulative arc-length table**, not an angle. Stepped by angle the pen would crawl through the tiny inner squares and race the outer ones. Any new curve with a large dynamic range needs the same treatment.
- Each square's side length is written at its centre on the **fx layer**, counting up to its Fibonacci value with the same cubic ease-out the hero ledger uses — one counting idiom for the whole page. Squares under 26px across go unlabelled; the two unit squares at the eye are far too small to hold a number.

`project()` offsets every point with the **coherent value-noise field** (`noise(i * 0.02, seed)`) — the pen arm has play in it. Per-point random jitter would read as grain; noise reads as a loose linkage.

Each pen runs its own `phase`: `draw` → `hold` → `erase`. **Erasing is the pen retracing its own line** in `destination-out`, slightly wider so the antialiased edges go with it, in the order the line was laid down. The earlier version dissolved a rectangle around the plate, which left a hard rectangular seam where the fill stopped, wiped whatever else had been drawn inside that box, and ended on a hard `clearRect`. Retracing touches that plate's pixels and nothing else — verified at 0% residue per family. `dissolvePlates()` restarts the retrace at 5× speed; block 7 calls it on the konami toggle so the new palette shows without waiting.

Tuning notes:
- `PENS` holds one entry per margin pen (`alpha` 0.36 → 0.15, with matching nib widths) and `GRAND_PEN` the centre one. These are **fixed per pen, not per plate** — that constancy is what makes them read as different instruments rather than random opacity.
- The centre plate is the only figure that crosses the copy column, which is why it gets a light hand (`0.28`) and its squares lighter still (`× 0.6`).
- Alpha can't go much lower: the `.grain` (overlay blend) and `.vignette` layers sit above this canvas and eat a lot of contrast. At `0.4` alpha / `0.85px` a single figure is effectively invisible on a real screen.
- `buildSlots()` parks plates in **left and right bands only** (`0.07–0.16` and `0.84–0.93` of `W`). The copy column runs down the middle and the background is fixed, so anything parked centrally ends up behind body text at some scroll position. Slots are also claimed (`busy`) so two pens never share one — a pen's fade would wipe its neighbour.
- Figures are small on purpose (`min(W, H) * 0.085–0.145`).
- `dpr` is capped at 2 — don't remove this cap, retina laptops will halve their FPS otherwise.
- Resizing wipes the canvas bitmap, so `resize()` clears and restarts with a fresh plate. Animation pauses on `visibilitychange`, and under `prefers-reduced-motion` one finished plate is printed in a single synchronous pass with no loop.

Headless note: screenshotting this needs a browser that actually produces frames. With `--virtual-time-budget` Chrome fires only a handful of `requestAnimationFrame` callbacks and does not recomposite after synchronous canvas writes, so the background will look blank in a headless capture even though the bitmap has content. Verify in a real browser, or raise `STEPS_PER_FRAME` in a throwaway copy.

### Other JS blocks

- **2 · Typewriter** — cycles 4 phrases on `#typed`. Skipped under `prefers-reduced-motion` (falls back to the first phrase).
- **3 · Reveal** — `observeReveals(root)` adds `.visible` to `.reveal` elements at 12% on-screen, and reveals anything already in the viewport synchronously (IO's first callback is too late for first paint). **JSON-rendered sections call it again after mounting** — new nodes are invisible until they're registered.
- **4 · Counters** — animates `.n[data-target]` with a cubic ease-out; re-reads `dataset.target` each frame and sets `data-counted` when finished, so `renderWorks()` can correct the project count after the JSON lands.
- **5 · Tilt** — 3D rotation on `[data-tilt]` cards, capped at ±2.5° (paper lifting, not glass tipping). `bindTilts(root)` is re-run for JSON-rendered cards. Inline `style.transform` overrides the CSS hover transform — cleared on `mouseleave`.
- **6 · Nav** — section observer toggles `.active` on `.nav-links a`; `#burger` toggles `.open` for the mobile menu.
- **7 · Konami** — `↑↑↓↓←→←→ba` toggles `body.phosphor-mode` (green tube), swaps the canvas palette and calls `dissolvePlate()`; `flashStatus()` shows a transient toast.
- **8 · Content** — `createStore()` builds one loader per data file (fetch → localStorage draft → dirty check → export). `renderWorks()`, `renderEvents()` and `renderNext()` mount the HTML. `escapeHTML()` runs before `inline()` on every field.
- **8b · Admin** — login + side panel with a tab per store.
- **9 · Boot log** — branded `console.log` for anyone opening devtools.
- **10 · Easter eggs** — see below.

### Easter eggs

Five, each found a different way so they read as a set rather than variations on one trick. All of them drive things the page already has (the plotter, the ledger, the emblem, the tagline) rather than adding machinery.

| Trigger | What happens |
|---|---|
| `↑↑↓↓←→←→ba` (block 7) | green phosphor tube — swaps the palette and dissolves the plates |
| type `fib` anywhere | the hero ledger runs the Fibonacci sequence, then restores its real numbers |
| type `ink` anywhere | fresh sheet: every pen lifts its plate and starts a new one |
| type `sudo` anywhere | `sudo: este clube não tem root` |
| five clicks on the hero emblem | flips the printing plate to the **paper proof** pulled off it (`.hero-plate.proof` inverts the woodcut and drops the screen blend). Click five more to go back |
| click the hero tagline | the `>` prompt becomes a real console: `help · ls · whoami · uptime · plot · fib · sair`. Esc or clicking away closes it |
| three clicks on the **footer wax seal** (or type `carta`, or `club.carta()`) | breaks the seal and opens **o correio do clube** — a letter form addressed to the club |
| `club.help()` in devtools | lists the console API: `plot(figura)`, `sheet()`, `fib()`, `proof()`, `carta()` |

#### O correio do clube

The letter form composes the message and hands it to the visitor's mail client via `mailto:` (with an "abre no Gmail" web fallback and a copy-address button). **The site is static — nothing here can send mail on its own**, and that limit is stated in the UI rather than faked. To make it send server-side, point `#post-form` at a form endpoint (Formspree, Web3Forms and similar all take a POST from a static page); the fields are already the right shape and the address lives in one constant, `CLUB_ADDRESS`.

That constant is assembled in JS rather than written into the markup, so the modal doesn't hand the address to scrapers — though note the join section prints it in plain text anyway, so the obfuscation only matters if that changes.

Wiring worth knowing:

- The word triggers listen on `window` but **bail out when the target is an `input`/`textarea`** — otherwise typing "fib" into the admin panel would fire them.
- The tagline console sets `shellActive`, which the **typewriter (block 2) checks each tick** so it idles instead of overwriting what's being typed, and which the **konami listener checks** so typed letters don't advance it. Its input is a real (visually hidden) `<input>` so phones raise a keyboard; keydowns on it call `stopPropagation()`.
- `club.plot(kind)` sets `forcedKind`, which `newPlate()` consumes **once** for the next margin plate and then clears.

## Admin workflow

The admin credential lives in `data/admin.local.json`. The file is matched by `.gitignore`'s `*.local.json` pattern and **never gets committed**. Format:

```json
{ "password": "your-password-here" }
```

To set or change the password, edit that file. No hashing, no rebuild — just save and reload. To remove admin access on a machine, delete the file. On the deployed site (GitHub Pages) the file isn't present, so the `[ admin ]` link, the Ctrl+Shift+A shortcut, and the empty-state admin link are all hidden — login is impossible.

**This is still a local-machine gate, not real auth** — anyone with write access to the repo can publish whatever they want. The integrity boundary is git: only commits to `data/*.json` change what visitors see.

Open the admin: footer `[ admin ]` link, **Ctrl+Shift+A**, or the link in the empty-state placeholder when the log is empty.

The panel has two tabs, one per editable file:

- **diário** → add/delete events, "exportar events.json"
- **projetos** → add/delete/reorder (↑↓) projects, "exportar projects.json"

Edits live in `localStorage` (`devsclub.events.local.v1`, `devsclub.projects.local.v1`) so they only affect the admin's browser. Export downloads the file, replace the one in `data/`, commit, push. Then "descartar alterações locais" to confirm what you see matches what's deployed. The "por publicar" badge in the panel header means at least one store differs from its committed file.

## Gotchas

- **All section IDs are wired into block 6's `sectionTargets` array.** If you add or rename a `<section id>`, update that list or its nav link won't highlight on scroll.
- **`[hidden] { display: none !important }` is load-bearing** (top of the stylesheet). `.cta`, `.admin-pane`, `.modal` etc. set `display` from a class selector, which would otherwise beat the UA `[hidden]` rule and leave "hidden" elements on screen.
- **Anything rendered from JSON must call `observeReveals()` and `bindTilts()`** on its container, or the cards stay at `opacity: 0` and lose the tilt.
- **`data-tilt` is the tilt selector** — a new card type without it silently skips the effect.
- **No JS means no content** in `#journey`, `#events` and `#next` (there are `<noscript>` notes pointing at the JSON). That's the trade for a single source of truth.
- **The `images/` dir also holds unused legacy files** (`200x200.png`, `checkmark.png`, `img.png`, `mask_400x400.jpg`). `images/logo.jpg` is the live emblem — used in the nav, hero plate, footer seal and favicon.
- **Nothing may call `beginPath()` inside the per-frame stroke loop** in block 1. The loop builds one path with `moveTo` + `lineTo` and strokes it at the end; a `beginPath()` in the middle discards the path being built and restarts it with whatever shape follows, which then gets stroked. That is what produced the stray circles-with-a-radius-line the ink-bleed helper used to draw. Anything that fills or arcs must run after `stroke()`.
- **`prefers-reduced-motion` is respected in three places**: the plotter loop, the typewriter, and the CSS `*` transition override. Any new animation should check it too.
- **Layer order is deliberate** (bottom → top): `.rules-overlay` (−5) → `#bg` ink (−4) → `#bg-fx` (−3) → `.grain` (−2) → `.vignette` (−1). The ruled lines are printed on the page, the plotter draws on top of them, and grain/vignette age the whole thing.
- **Google Fonts is fetched from `fonts.googleapis.com`** with `preconnect` — three families (Fraunces display, Bitter body, JetBrains Mono). Works on GitHub Pages but it's the site's one external dependency; self-host if air-gapped hosting is ever needed. Fraunces is requested with its `SOFT`/`WONK` axes — the `--wonk` variable applies them.
