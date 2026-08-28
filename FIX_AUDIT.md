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

## What changed

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
