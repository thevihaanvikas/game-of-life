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
