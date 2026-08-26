# Cross-browser fix v2

## Root cause confirmed from the screenshots

The two screenshots have the same desktop-width layout, but the Arc version
uses the base vertical `.preset-list` while the Brave version uses the
two-column preset layout.

That switch was controlled by viewport HEIGHT (`max-height: 720px`) rather
than by the actual desktop layout. Arc and Brave can expose different CSS
viewport dimensions because their browser chrome/zoom/window configuration
differs. The result was:

- Arc: four presets stacked vertically
- Brave: four presets in a 2×2 grid
- Arc's right rail became much taller and pushed/clipped Settings
- the board itself remained roughly the same size

## Fix

- Desktop presets now always use a 2×2 grid.
- Desktop layout no longer locks the entire document to `100vh`/`100dvh`
  with `overflow: hidden`.
- The right control rail is allowed to size naturally.
- Canvas children are constrained to their grid column.
- The original stylesheet is retained as `styles.css.backup`.

This removes the browser-height-dependent behavior that caused the screenshot
difference.
