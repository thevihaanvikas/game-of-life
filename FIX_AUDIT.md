# Birth tint as a painting effect v10 (corrects v9)

v9 misunderstood the request: it tied cell colour to survival age
(generations) and used near-white/near-black birth shades. What was
actually wanted is a **painting effect** on wall-clock time:

- A cell appears in a **lighter shade of the main colour** (dark theme)
  or a **darker shade** (light theme) — e.g. light green `rgb(115,255,115)`
  settling to `#00ff00` in dark mode, dark green `rgb(0,98,0)` settling
  to `#00b300` in light mode — and settles into the true colour over
  **320 ms**, with an ease-out, whether or not the simulation is
  running. The generation-based `ages` grid is gone entirely, replaced
  by `bornAt` wall-clock timestamps (migrated centre-stably on grid
  resize, reset on death).
- The tint applies to every birth: painted cells, evolution births, and
  preset/random loads (which bloom in). Painted and evolved cells are
  animated by the existing effects loop; bulk loads schedule a small
  dedicated settle animator, which terminates once everything has
  settled.
- The ramp follows the theme **and** the custom main colour from the
  Settings picker, cached per colour pair.
- **Settings button hover now adopts the main colour** (border, icon,
  label — `var(--lime)`, which the picker overrides on `<body>`),
  instead of the neutral Randomize-style treatment from v9.

---

# Age colour ramp, system theme & settings polish v9

- **Prominent cell-age effect**: the old 82%→100% opacity fade was too
  subtle. Cells now render through a 19-step colour ramp: freshly drawn
  cells are **near-white with a tint of the alive colour** in dark mode
  (near-black with a tint in light mode — the mirror image, so it pops
  on white too) and settle into the full alive colour over 18
  generations, at full opacity throughout. The ramp follows the theme
  AND the custom main colour from the Settings picker, and is cached per
  colour pair so per-cell drawing is still a plain array lookup.
- **System theme on startup**: the hardcoded `data-theme="dark"` on
  `<body>` is gone; the app reads `prefers-color-scheme` at boot and
  applies dark or light (favicon and meta theme-color follow). An
  explicit choice via the theme buttons still wins for the session.
- **Settings button hover**: after v8 removed the hover outright, the
  SETTINGS card and the header gear button now get exactly the
  Randomize button's hover treatment — `border-color: var(--line-strong)`
  + `background: var(--surface-hover)` with the same 0.2s easing (no
  lift, no cyan).
- **Built-in pattern option removed** from the Settings panel — the
  preset list in the rail already covers it. All `patternSelect`
  references (element ref, change listener, sync in `selectPreset`)
  are gone.

---

# Main-colour picker & settings hover v8

- **Main colour picker** in the Settings panel (next to the pattern and
  edge-behaviour fields): a native colour swatch plus a Reset button.
  The chosen colour overrides the site's main colour for BOTH themes —
  the `--lime` / `--cell-alive` tokens (Play button, status dot, legend,
  glider icon, active-preset arrow, checkbox accent…), the canvas alive
  colour, and the **favicon, regenerated live** as a recoloured SVG data
  URI of the same glyph. The Play-button label flips between black and
  white by luminance so it stays readable on any colour. The pick
  persists in `localStorage` (validated on read; malformed values fall
  back to theme defaults) and survives theme switches; Reset restores
  per-theme defaults.
- **Settings hover effects removed**: the SETTINGS rail card and the
  header gear button no longer highlight, lift, or recolour on hover
  (their `aria-expanded` styling went with it — the modal backdrop
  covers the trigger whenever the menu is open, so it never showed).
  The now-pointless transition on the rail card was dropped too.

---

# Contrast & button-pair polish v7

- **Cell contrast**: freshly-born cells used to render at 52% opacity,
  which read as dim on both themes. The floor is now 82%, so every live
  cell is clearly alive from its first generation; long survivors still
  brighten to full opacity (the age cue is preserved, just compressed).
- **Randomize / Settings pair**: in the landscape rail the two buttons
  share row 4 but sized themselves differently — Randomize had a *fixed*
  `height: clamp(24px, 3.8vh, 36px)` while Settings had `min-height`
  with the same clamp *plus* vertical padding, so Settings grew taller
  at most viewport heights (and their horizontal paddings differed:
  4px vs 6–10px). Both now share one rule: the same height clamp,
  `min-height: 0` (cancelling the trigger's base 44px), zero vertical
  padding, identical horizontal padding, and matched 16px icons — equal
  boxes at every viewport height, on top of the equal grid columns and
  the shared 11px radius they already had.

---

# Layout & rendering fix v6

## What changed in v6

Five user-visible bugs, each traced to a distinct root cause:

### 1. Population chart rendered at half its allotted width

`.population-chart canvas` had **no CSS width**. An unpinned `<canvas>`
renders at its intrinsic size — the bitmap — which is `rect x dpr` device
pixels. At dpr 2 the element was therefore twice as wide as its container
and `.stats-block { overflow: hidden }` clipped it to the **left half**.
(It looked correct at dpr 1, which is why static checks missed it.)

- Fixed with `display: block; width: 100%` (the CSS clamp keeps owning the
  height); `drawChart()` now draws in the bitmap's own coordinate space
  (`chart.width / chartPixelRatio`).

### 2. The faint gridline "moved to the side" — two stacked causes

- **Border-box vs content-box**: `setSize` measured
  `frame.getBoundingClientRect()` (the *border* box, 1px border) but the
  canvas element is clamped by `max-width: 100%` to the *content* box, so
  the element came out ~2px narrower than its pinned bitmap. The browser
  resampled (with `image-rendering: pixelated`, nearest-neighbour), which
  dropped whole device columns and ate gridlines. `setSize` now measures
  the content box (`contentBoxOf`) and the bitmap is `floor()`-ed so the
  pin is always **inside** the content box — `max-width` can never clamp
  and the bitmap maps 1:1 onto device pixels.
- **Edge-flush lines clipped to half opacity**: the snap formula
  `(round(x * dpr) + 0.5) / dpr` pushes a line that sits exactly on the
  canvas edge half a device pixel *outside* the bitmap, where it renders
  at half width — a faint line hugging the right/bottom side. Lines that
  belong inside the canvas are now clamped to its last device pixel.
- **dpr capped at 2**: every device with dpr > 2 (2.625/2.75/3 — a large
  share of Android phones, Plus/Pro Max iPhones) upscaled the pinned
  bitmap by 1.3–1.5x with nearest-neighbour, making line weights uneven
  regardless of snapping. The cap is now 4, restoring the 1:1 mapping on
  real screens.

### 3. Cells stretched into rectangles

`cols` and `rows` were derived independently (`round(width / 14)` etc.)
with 40x20 minimums, so narrow/short frames produced 8.5 x 21px
"cells". The grid now derives **one square cell size** —
`cell = min(14, width / 40, height / 20)` — with
`cols = floor(width / cell)`, `rows = floor(height / cell)`, drawn
centred with letterboxing (letterbox stripes are the canvas background
colour, so they are invisible). Cells are square at every aspect ratio,
including 340px phones and ultrawide landscape.

### 4. Painting offset — geometry split across two code paths

`draw()` and `cellFromEvent()` each implemented the zoom/letterbox maths
separately (and the click path assumed the grid fills the whole element).
Both now go through one `gridGeometry()` — the single source of truth —
and `cellFromEvent()` is its exact inverse, mapping through the element
rect so clicks stay correct even if a future stylesheet clamps the
canvas. Verified end-to-end in a mock-DOM harness: a drag across every
aspect ratio / dpr / zoom lights up exactly the cells under the finger,
contiguously, with no leakage into other rows.

### 5. Preset icons — dot grid fighting the SVG

The Glider/Random inline SVGs (added in v5) were drawn **on top of** the
old CSS dot-grid background (`radial-gradient` dots at a fixed 7px pitch
that does not scale with the icon box) — two unaligned patterns stacked,
which read as "still broken". All four presets (Blank, Glider, Gun,
Random) are now a single inline SVG each on a 3x3 `viewBox`, on a clean
solid chip with no background pattern; they scale crisply from 16px to
31px.

---

# Layout & theme fix v5

## What changed in v5

### Removals

- **Grid size controls removed.** The Settings panel no longer offers
  fixed grid sizes; the grid is always sized responsively to the board
  frame. The associated state (`gridSizeMode`, `fixedGridSizes`,
  `setGridSize`) is gone from `app.js`.
- **High contrast theme removed.** The theme button, token block,
  canvas colors, meta theme-color, and `favicon-contrast.svg` are all
  gone. Only Dark and Light remain.

### Light mode follows the dark scheme

Light is now the exact inverse of the dark scheme instead of a soft
glass theme: white page, solid near-white panels, **black hairlines**,
flat surfaces, no shadows, no blur, no ambient glow, and a
`rgba(0, 0, 0, 0.36)` canvas grid mirroring dark's white-on-black grid.
The primary green is `#00b300` (dark enough to stay readable on white);
the secondary cyan stays a readable dark teal.

### Faint-centre gridline glitch fixed

The canvas bitmap was sized from `frame.clientWidth`, which is a
*rounded integer*, while the element actually renders at a fractional
CSS size. The browser then resampled the bitmap onto the element box,
and the sub-pixel drift landed some gridlines (typically around the
centre of the board) between device pixels, where antialiasing rendered
them at reduced opacity.

- `setSize` now measures the frame with `getBoundingClientRect()`
  (fractional, exact).
- The canvas element is pinned via inline styles to exactly
  `bitmap / dpr` CSS pixels, so the bitmap maps 1:1 onto device pixels
  and is never resampled.
- `draw()` works in that same pinned coordinate space and snaps every
  gridline to a device pixel boundary
  (`(round(css * dpr) + 0.5) / dpr`), so each line gets exactly one
  full device pixel of coverage at any device pixel ratio.

### Legend and preset icons

- The board legend is now a single plain square (no border radius, no
  glow) labelled "Life"; the Trail square and label are gone.
- The Glider and Random field preset icons are inline SVGs on a 3x3
  `viewBox`, so they scale with the icon box at every breakpoint. The
  old CSS drawing used fixed pixel offsets (`top: 7px; left: 8px` and
  fixed-size box-shadows), which drifted out of the icon as the box
  shrank and resized.

---

# Layout & theme fix v4

## What changed in v4

### Landscape never scrolls

The interface is now locked to the viewport in every landscape aspect
ratio, while portrait keeps the comfortable scrolling layout:

- `@media (orientation: landscape) and (min-width: 500px)` locks
  `html`/`body`/`.app-shell` to exactly one viewport height with
  `overflow: hidden`, so a scrollbar can never appear. (Landscape windows
  narrower than 500px cannot fit a board plus a rail; they keep the
  scrolling stacked layout.)
- The workspace flexes to fill the height left by the topbar, hero and
  footer, and the canvas frame absorbs whatever remains — its 8:5 aspect
  ratio is dropped in landscape because the grid renderer adapts its
  dimensions to any frame size.
- Every rail size is a `vh`-driven `clamp()`, so the rail compresses
  *smoothly* as the window gets shorter. No breakpoint switches layout
  structure on height — two browsers with slightly different chrome
  merely compress things slightly differently, so they can never
  disagree about the structure the way Arc and Brave did in v2.
- Purely decorative copy is dropped progressively on very short windows:
  the hero intro and footer below 540px of height, the hero itself below
  400px, and the population chart below 340px. The board and its controls
  always stay visible. A `overflow-y: auto` safety valve on the rail keeps
  every control reachable even on sliver-sized windows shorter than
  ~270px.
- Portrait viewports (and sub-500px landscape) are unchanged: stacked,
  scrollable, 8:5 board.

### Smaller fixes

- The SIMULATION "Step" button is now "+1 gen" (with a tooltip), which
  describes what it does.
- The Randomize button's corner radius was raised from 5px to 11px to
  match the control cards and the settings card it sits beside, so the
  whole rail reads as one unified set of tabs.

---

# Layout & theme fix v3

## Root causes found in the previous stylesheet

The stylesheet had grown by accretion and contained several structural
defects that broke scaling:

1. **An orphan closing brace (old line 1487).** The whole "Desktop fit
   mode" section had lost its `@media` wrapper, so ~70 lines of
   desktop-only rules (`overflow: hidden`, `height: 100%`, a forced
   two-column control grid, `aspect-ratio: auto`, `vh`-based `clamp()`s)
   applied at **every** viewport size — including phones. Because they sat
   *after* the mobile media queries in the file, they silently overrode
   them: the canvas frame lost its aspect ratio and could collapse, and
   the control rail clipped its content on small screens.

2. **Layout switching on viewport *height*** (`max-height: 720/600/540/480`
   queries). Different browser chrome (Arc vs Brave, zoom levels, URL bars)
   reports different viewport heights, so the same window produced
   different layouts in different browsers.

3. **`html, body { height: 100%; overflow: hidden }`** in the 701–850px
   range — content that did not fit was clipped instead of scrollable.

4. **Conflicting duplicated blocks**: three `:root` blocks and repeated
   light/contrast token blocks drifted apart; `randomize-btn` and the
   desktop settings trigger were explicitly placed into the *same* grid
   cell at ≤850px (overlapping buttons); the settings panel was placed
   into a grid it is not a child of.

5. **`vh`-based `clamp()` for paddings and fonts**, so UI sizes varied
   with browser chrome.

## What changed in v3

- `styles.css` was rewritten as a single-source stylesheet:
  - Breakpoints use **width (and orientation) only** — never height.
  - The page **scrolls** when content exceeds the viewport; nothing is
    clipped. `overflow: hidden` survives only inside the canvas frame,
    on ellipsized text, and on `<body>` while the settings modal is open.
  - Every grid/flex child that holds text or the canvas has `min-width: 0`.
  - The canvas frame always keeps an 8:5 aspect ratio, so it can never
    collapse; on desktop it is additionally capped by `100dvh` so the
    full interface fits common screen heights. The grid renderer adapts
    its dimensions to the actual frame size.
  - One token block per theme; components consume tokens only.
- **Theme change**: the default theme is now called **Dark** (was "Dark
  glass") and uses the flat, high-contrast color scheme — pure black
  surfaces, white hairlines, no shadows, no blur, no ambient glow — with
  **green (#00ff00)** as the main color instead of yellow. `app.js`
  (canvas colors, meta theme-color) and `favicon.svg` were updated to
  match. Light and High-contrast themes are unchanged.
- The previous stylesheet is retained as `styles.css.backup`.
