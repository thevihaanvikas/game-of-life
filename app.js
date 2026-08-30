const canvas = document.getElementById('lifeCanvas');
const ctx = canvas.getContext('2d');
const frame = document.getElementById('canvasFrame');
const chart = document.getElementById('populationChart');
const chartCtx = chart?.getContext('2d');
const generationEl = document.getElementById('generation');
const populationEl = document.getElementById('population');
const emptyHint = document.getElementById('emptyHint');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const playBtn = document.getElementById('playBtn');
const playLabel = document.getElementById('playLabel');
const speedRange = document.getElementById('speedRange');
const speedValue = document.getElementById('speedValue');
const gridReadout = document.getElementById('gridReadout');
const themeColorMeta = document.getElementById('themeColor');
const faviconLink = document.getElementById('favicon');
const boundaryModeSelect = document.getElementById('boundaryMode');
const settingsTrigger = document.getElementById('settingsTrigger');
const settingsDesktopTrigger = document.getElementById('settingsDesktopTrigger');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');
const mainColorInput = document.getElementById('mainColor');
const mainColorResetBtn = document.getElementById('mainColorReset');
const presetList = document.getElementById('presetList');
const morePresetsBtn = document.getElementById('morePresets');
const colorSwatchButtons = document.querySelectorAll('.color-swatch');

// Reduced-motion users get no canvas animations: no birth tint settling, no
// birth/death ripples. The query object is live, so toggling the OS setting
// applies immediately. (CSS already covers transitions and the modal pop.)
const reducedMotionQuery =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

function prefersReducedMotion() {
  return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let cols = 48;
let rows = 30;
const TARGET_CELL_SIZE = 14;
const MIN_COLS = 40;
const MIN_ROWS = 20;
const MAX_COLS = 160;
const MAX_ROWS = 100;
let cells = makeGrid();
let bornAt = makeTimeGrid();
let trails = makeTrailGrid();
let running = false;
let generation = 0;
let timer = null;
let drawing = false;
let drawValue = true;
let zoom = 1;
let history = [0];
let effects = [];
let effectFrame = 0;
let trailEnabled = true;
let boundaryMode = 'wrap';
let settingsOpener = null;
let pixelRatio = 1;
let chartPixelRatio = 1;
let viewWidth = 0;
let viewHeight = 0;

const themeColors = {
  dark: {
    alive: '#00ff00',
    accent: '#00ffff',
    background: '#000000',
    grid: 'rgba(255, 255, 255, 0.36)',
    // Birth tint leans toward white: a cell is painted in a lighter shade
    // of the alive colour, then settles into the alive colour. The strong
    // lean makes the painting effect clearly visible against black.
    birthExtreme: '#ffffff',
    birthTintAmount: 0.7,
  },
  light: {
    alive: '#00b300',
    accent: '#16718a',
    background: '#ffffff',
    grid: 'rgba(0, 0, 0, 0.36)',
    // Mirror of dark: the birth tint leans toward black — a darker shade,
    // but only a little, so it never reads as a black cell on white.
    birthExtreme: '#000000',
    birthTintAmount: 0.52,
  },
};

// Painting effect: a cell appears in a lighter shade of the alive colour
// (dark theme) or a darker shade (light theme) and settles into the alive
// colour over a fraction of a second of WALL-CLOCK time — whether or not
// the simulation is running. Pure painting feedback, not a survival cue.
// The lean amount itself is per theme (see birthTintAmount above).
const BIRTH_SETTLE_MS = 320;
const BIRTH_RAMP_STEPS = 24;
let cellColorRamp = [];
let cellColorRampKey = '';
let lastBirthAt = 0;
let settleFrame = 0;

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbString(rgb) {
  return `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function buildCellColorRamp(alive, extreme, amount) {
  // ramp[0] = birth shade (alive colour shifted toward the theme extreme),
  // ramp[last] = the alive colour itself.
  const aliveRgb = hexToRgb(alive);
  const tint = mixRgb(aliveRgb, hexToRgb(extreme), amount);
  const ramp = [];
  for (let step = 0; step <= BIRTH_RAMP_STEPS; step += 1) {
    ramp.push(rgbString(mixRgb(tint, aliveRgb, step / BIRTH_RAMP_STEPS)));
  }
  return ramp;
}

function markBirth(x, y, time = performance.now()) {
  bornAt[y][x] = time;
  if (time > lastBirthAt) lastBirthAt = time;
}

function scheduleSettleAnimation() {
  // Redraw on animation frames until every birth tint has settled. Painted
  // cells and evolution births are already covered by the effects loop;
  // bulk loads (presets, random fields) schedule this directly.
  if (prefersReducedMotion() || settleFrame) return;
  const tick = () => {
    settleFrame = 0;
    draw();
    if (performance.now() - lastBirthAt < BIRTH_SETTLE_MS + 80) {
      settleFrame = requestAnimationFrame(tick);
    }
  };
  settleFrame = requestAnimationFrame(tick);
}

const metaThemeColors = {
  dark: '#000000',
  light: '#ffffff',
};

const faviconByTheme = {
  dark: 'favicon.svg',
  light: 'favicon-light.svg',
};

// Custom main colour (set from the Settings panel). `null` means "use the
// theme default"; a value overrides --lime / --cell-alive, the canvas alive
// colour and the favicon for BOTH themes, and survives reloads.
const MAIN_COLOR_KEY = 'game-of-life:main-color';
const defaultAliveByTheme = { dark: '#00ff00', light: '#00b300' };
let customMainColor = null;

const patterns = {
  glider: ['010', '001', '111'],
  pulsar: [
    '0011100011100',
    '0000000000000',
    '1000010100001',
    '1000010100001',
    '1000010100001',
    '0011100011100',
    '0000000000000',
    '0011100011100',
    '1000010100001',
    '1000010100001',
    '1000010100001',
    '0000000000000',
    '0011100011100',
  ],
  lwss: ['01001', '10000', '10001', '11110'],
  penta: ['0010000100', '1101111011', '0010000100'],
  rpentomino: ['011', '110', '010'],
  acorn: ['0100000', '0001000', '1100111'],
  diehard: ['00000010', '11000000', '01000111'],
  gun: [
    '000000000000000000000000000000100000',
    '000000000000000000000000000010100000',
    '000000000000110000000000001100000011',
    '000000000001000100000000000110000011',
    '110000000010000010000000000110000000',
    '110000000010001011000000000010100000',
    '000000000010000010000000000000100000',
    '000000000001000100000000000000000000',
    '000000000000110000000000000000000000',
  ],
};

function makeGrid() {
  return Array.from({ length: rows }, () => new Uint16Array(cols));
}

function makeTimeGrid() {
  // Wall-clock birth timestamps (Float64; 0 = born long ago / settled).
  return Array.from({ length: rows }, () => new Float64Array(cols));
}

function makeTrailGrid() {
  return Array.from({ length: rows }, () => new Float32Array(cols));
}

function updateGridReadout() {
  gridReadout.textContent = `${cols} × ${rows}`;
}

function resizeGrid(nextCols, nextRows) {
  if (nextCols === cols && nextRows === rows) return;

  const previousCols = cols;
  const previousRows = rows;
  const previousCells = cells;
  const previousBornAt = bornAt;
  const previousTrails = trails;
  const nextCells = Array.from({ length: nextRows }, () => new Uint16Array(nextCols));
  const nextBornAt = Array.from({ length: nextRows }, () => new Float64Array(nextCols));
  const nextTrails = Array.from({ length: nextRows }, () => new Float32Array(nextCols));

  // Resize around the centre of the world. Existing cells are mapped by their
  // relative position so resizing the window does not erase a hand-painted
  // pattern or make it jump to a corner.
  for (let y = 0; y < previousRows; y += 1) {
    for (let x = 0; x < previousCols; x += 1) {
      const targetX = Math.min(nextCols - 1, Math.round(x * (nextCols - 1) / Math.max(1, previousCols - 1)));
      const targetY = Math.min(nextRows - 1, Math.round(y * (nextRows - 1) / Math.max(1, previousRows - 1)));
      nextCells[targetY][targetX] = Math.max(nextCells[targetY][targetX], previousCells[y][x]);
      nextBornAt[targetY][targetX] = Math.max(nextBornAt[targetY][targetX], previousBornAt[y][x]);
      nextTrails[targetY][targetX] = Math.max(nextTrails[targetY][targetX], previousTrails[y][x]);
    }
  }

  cols = nextCols;
  rows = nextRows;
  cells = nextCells;
  bornAt = nextBornAt;
  trails = nextTrails;
  updateGridReadout();
}

function resizeGridForViewport(width, height) {
  // One cell size for BOTH axes, so cells are always perfect squares. The
  // minimum grid is 40×20; on frames too small for that at the target size
  // the cell shrinks (instead of the cells stretching into rectangles).
  const cell = Math.min(TARGET_CELL_SIZE, width / MIN_COLS, height / MIN_ROWS);
  // +1e-4 guards floor() against float division returning 39.99999999.
  const nextCols = Math.min(MAX_COLS, Math.floor(width / cell + 1e-4));
  const nextRows = Math.min(MAX_ROWS, Math.floor(height / cell + 1e-4));
  resizeGrid(nextCols, nextRows);
}

function currentTheme() {
  return document.body.dataset.theme || 'dark';
}

function colorsForTheme() {
  return themeColors[currentTheme()] || themeColors.dark;
}

function population() {
  return cells.reduce((total, row) => total + row.reduce((count, value) => count + (value ? 1 : 0), 0), 0);
}

function updateReadouts() {
  const pop = population();
  emptyHint.classList.toggle('hidden', pop > 0);
  populationEl.textContent = String(pop).padStart(4, '0');
  generationEl.textContent = String(generation).padStart(5, '0');
}

function resizeCanvas(target, context, cssWidth, cssHeight) {
  // Size the bitmap in WHOLE device pixels and pin the element to bitmap/dpr.
  // floor() guarantees the pin never exceeds the measured content box, so the
  // CSS `max-width: 100%` can never clamp the element below its bitmap: the
  // bitmap maps 1:1 onto device pixels and nothing is ever resampled (the
  // v5 bug: the border box was measured, the element came out ~2px smaller
  // than the bitmap, and nearest-neighbour resampling ate whole gridlines).
  const dpr = Math.min(window.devicePixelRatio || 1, 4);
  target.width = Math.max(1, Math.floor(cssWidth * dpr));
  target.height = Math.max(1, Math.floor(cssHeight * dpr));
  target.style.width = `${target.width / dpr}px`;
  target.style.height = `${target.height / dpr}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

function resizeCanvasUnpinned(target, context, cssWidth, cssHeight) {
  // For the chart the CSS (width:100% + clamped height) owns the element size;
  // only the bitmap is scaled by the dpr so lines stay crisp.
  const dpr = Math.min(window.devicePixelRatio || 1, 4);
  target.width = Math.max(1, Math.round(cssWidth * dpr));
  target.height = Math.max(1, Math.round(cssHeight * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

function contentBoxOf(element) {
  // getBoundingClientRect() is the BORDER box; the canvas lives inside the
  // border, so the drawable area is the content box.
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    width: rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
    height: rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
  };
}

function setSize() {
  const board = contentBoxOf(frame);

  if (board.width > 0 && board.height > 0) {
    viewWidth = board.width;
    viewHeight = board.height;
    pixelRatio = resizeCanvas(canvas, ctx, viewWidth, viewHeight);
    resizeGridForViewport(viewWidth, viewHeight);
  }

  if (chart && chartCtx) {
    const chartRect = chart.getBoundingClientRect();
    if (chartRect.width > 0 && chartRect.height > 0) {
      chartPixelRatio = resizeCanvasUnpinned(chart, chartCtx, chartRect.width, chartRect.height);
    }
  }

  draw();
  drawChart();
}

function scheduleEffects() {
  if (prefersReducedMotion() || !effects.length || effectFrame) return;
  effectFrame = requestAnimationFrame(animateEffects);
}

function animateEffects(now) {
  effectFrame = 0;
  draw(now);

  if (effects.some((effect) => now - effect.time < 420)) {
    scheduleEffects();
  } else {
    effects = [];
  }
}

function gridGeometry() {
  // The single source of truth for grid layout. draw() paints through this
  // and cellFromEvent() inverts it exactly, so what you tap is always the
  // cell that lights up — at any aspect ratio, dpr or zoom.
  const width = canvas.width / pixelRatio;
  const height = canvas.height / pixelRatio;
  const cell = Math.min(width / cols, height / rows) * zoom; // square cells
  return {
    width,
    height,
    cell,
    left: (width - cell * cols) / 2,
    top: (height - cell * rows) / 2,
  };
}

function draw(now = performance.now()) {
  // Draw in the canvas' own coordinate space (bitmap / dpr). The element is
  // pinned to that exact size in resizeCanvas, so every coordinate maps
  // 1:1 onto device pixels — nothing is resampled or blurred.
  const { width, height, cell, left, top } = gridGeometry();
  if (!width || !height) return;

  const { alive, accent, background, grid, birthExtreme, birthTintAmount } = colorsForTheme();
  const rampKey = alive + birthExtreme + String(birthTintAmount);
  if (cellColorRampKey !== rampKey) {
    cellColorRamp = buildCellColorRamp(alive, birthExtreme, birthTintAmount);
    cellColorRampKey = rampKey;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const gridWidth = cell * cols;
  const gridHeight = cell * rows;

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1 / pixelRatio;
  ctx.beginPath();
  // Snap each line to a device pixel boundary so every gridline gets
  // exactly one full device pixel of coverage at any dpr. The +0.5 can push
  // an edge-flush line half a device pixel outside the bitmap — where it
  // would be clipped to half opacity (the stubborn "faint line on the
  // side") — so lines that belong inside the canvas are clamped to its
  // last device pixel. Lines genuinely outside (zoom > 1) are left alone.
  const snapLine = (position, edge, bitmapEdge) => {
    let device = Math.round(position * pixelRatio);
    if (position <= edge + 1e-6) device = Math.min(device, bitmapEdge - 1);
    if (position >= -1e-6) device = Math.max(device, 0);
    return (device + 0.5) / pixelRatio;
  };
  for (let x = 0; x <= cols; x += 1) {
    const px = snapLine(left + x * cell, width, canvas.width);
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + gridHeight);
  }
  for (let y = 0; y <= rows; y += 1) {
    const py = snapLine(top + y * cell, height, canvas.height);
    ctx.moveTo(left, py);
    ctx.lineTo(left + gridWidth, py);
  }
  ctx.stroke();

  const padding = Math.max(1.5, cell * 0.18);
  const cellDrawSize = Math.max(1, cell - padding * 2);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const value = cells[y][x];
      const trail = trails[y][x];
      const xPosition = left + x * cell + padding;
      const yPosition = top + y * cell + padding;

      if (!value && trailEnabled && trail > 0) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = trail * 0.22;
        ctx.fillRect(xPosition, yPosition, cellDrawSize, cellDrawSize);
        ctx.globalAlpha = 1;
      }

      if (value) {
        // Painting effect: freshly-born cells start in a lighter/darker
        // shade of the alive colour and settle into it over a moment of
        // wall-clock time — even while the simulation is paused.
        const settle = prefersReducedMotion()
          ? 1
          : (now - bornAt[y][x]) / BIRTH_SETTLE_MS;
        if (settle < 1) {
          const eased = 1 - (1 - settle) * (1 - settle); // ease-out
          ctx.fillStyle =
            cellColorRamp[Math.min(BIRTH_RAMP_STEPS, Math.floor(eased * (BIRTH_RAMP_STEPS + 1)))];
        } else {
          ctx.fillStyle = alive;
        }
        ctx.fillRect(xPosition, yPosition, cellDrawSize, cellDrawSize);
      }
    }
  }

  if (prefersReducedMotion()) return;

  effects.forEach((effect) => {
    const progress = Math.min(1, (now - effect.time) / 420);
    const alpha = (1 - progress) * 0.38;
    if (alpha <= 0) return;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.type === 'birth' ? alive : accent;
    const xPosition = left + effect.x * cell + padding - progress * 1.2;
    const yPosition = top + effect.y * cell + padding - progress * 1.2;
    ctx.fillRect(
      xPosition,
      yPosition,
      Math.max(1, cellDrawSize + progress * 2.4),
      Math.max(1, cellDrawSize + progress * 2.4),
    );
    ctx.globalAlpha = 1;
  });

  updateReadouts();
}

function drawChart() {
  if (!chart || !chartCtx) return;
  // Draw in the bitmap's own coordinate space (bitmap / dpr); the element is
  // CSS-sized (width:100%, clamped height), so the browser may scale it, but
  // a smooth line chart resamples gracefully — unlike the pixel grid.
  const width = chart.width / chartPixelRatio;
  const height = chart.height / chartPixelRatio;
  if (!width || !height || !history.length) return;

  chartCtx.clearRect(0, 0, width, height);
  chartCtx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--chart').trim() || '#00ffff';
  chartCtx.fillStyle = chartCtx.strokeStyle;
  chartCtx.lineWidth = 1.5 / chartPixelRatio;
  chartCtx.lineJoin = 'round';
  chartCtx.lineCap = 'round';

  const maximum = Math.max(1, ...history);
  const xForIndex = (index) => index * (width - 2) / Math.max(1, history.length - 1) + 1;
  const yForValue = (value) => height - 3 - (value / maximum) * (height - 7);

  if (history.length === 1) {
    chartCtx.beginPath();
    chartCtx.arc(xForIndex(0), yForValue(history[0]), 1.8, 0, Math.PI * 2);
    chartCtx.fill();
    return;
  }

  chartCtx.beginPath();
  history.forEach((value, index) => {
    const x = xForIndex(index);
    const y = yForValue(value);
    if (index === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();
}

function recordPopulation() {
  history.push(population());
  if (history.length > 80) history.shift();
  drawChart();
}

function updateManualHistory() {
  const currentPopulation = population();
  history[history.length - 1] = currentPopulation;
  drawChart();
}

function addEffect(x, y, type, time = performance.now()) {
  if (prefersReducedMotion()) return;
  effects.push({ x, y, type, time });
  if (effects.length > 2400) effects.splice(0, effects.length - 2400);
}

function cellIsAlive(x, y) {
  if (boundaryMode === 'wrap') {
    return cells[(y + rows) % rows][(x + cols) % cols];
  }
  if (x < 0 || x >= cols || y < 0 || y >= rows) return 0;
  return cells[y][x];
}

function evolve() {
  const next = makeGrid();
  const nextBornAt = makeTimeGrid();
  const nextTrails = makeTrailGrid();
  const changedAt = performance.now();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx || dy) {
            neighbours += cellIsAlive(x + dx, y + dy) ? 1 : 0;
          }
        }
      }

      const born = neighbours === 3;
      const survives = cells[y][x] && (neighbours === 2 || neighbours === 3);
      next[y][x] = born || survives ? 1 : 0;

      if (next[y][x]) {
        nextBornAt[y][x] = cells[y][x] ? bornAt[y][x] : changedAt;
      }

      if (!next[y][x] && cells[y][x]) {
        nextTrails[y][x] = 1;
        addEffect(x, y, 'death', changedAt);
      } else if (next[y][x] && !cells[y][x]) {
        addEffect(x, y, 'birth', changedAt);
      }

      nextTrails[y][x] = Math.max(nextTrails[y][x], trails[y][x] * 0.86);
    }
  }

  cells = next;
  bornAt = nextBornAt;
  trails = nextTrails;
  generation += 1;
  recordPopulation();
  draw();
  scheduleEffects();
}

function setRunning(value) {
  running = value;
  playLabel.textContent = running ? 'Pause' : 'Play';
  playBtn.querySelector('.play-icon').textContent = running ? 'Ⅱ' : '▶';
  playBtn.setAttribute('aria-pressed', String(running));
  statusText.textContent = running ? 'Simulation running' : 'Simulation paused';
  statusDot.style.background = running ? 'var(--cyan)' : 'var(--lime)';
  statusDot.style.boxShadow = running ? '0 0 12px var(--cyan)' : '0 0 12px var(--lime)';

  clearInterval(timer);
  timer = null;
  if (running) timer = setInterval(evolve, 1000 / Number(speedRange.value));
}

function resetState() {
  cells = makeGrid();
  bornAt = makeTimeGrid();
  trails = makeTrailGrid();
  effects = [];
  generation = 0;
}

function selectPreset(name) {
  document.querySelectorAll('.preset').forEach((button) => {
    button.classList.toggle('active', button.dataset.pattern === name);
  });
}

function place(pattern, offsetX, offsetY, stamp = 0) {
  pattern.forEach((line, y) => {
    [...line].forEach((value, x) => {
      const targetX = x + offsetX;
      const targetY = y + offsetY;
      if (value === '1' && targetY >= 0 && targetY < rows && targetX >= 0 && targetX < cols) {
        cells[targetY][targetX] = 1;
        bornAt[targetY][targetX] = stamp;
        if (stamp > lastBirthAt) lastBirthAt = stamp;
      }
    });
  });
}

function loadPattern(name) {
  setRunning(false);
  resetState();

  const stamp = performance.now();
  if (name === 'glider') {
    place(patterns.glider, Math.floor(cols / 2) - 1, Math.floor(rows / 2) - 1, stamp);
  } else if (name === 'gun') {
    place(patterns.gun, 2, Math.floor(rows / 2) - 4, stamp);
  } else if (name === 'pulsar') {
    place(patterns.pulsar, Math.floor(cols / 2) - 6, Math.floor(rows / 2) - 6, stamp);
  } else if (name === 'lwss') {
    place(patterns.lwss, Math.floor(cols / 2) - 2, Math.floor(rows / 2) - 2, stamp);
  } else if (name === 'penta') {
    place(patterns.penta, Math.floor(cols / 2) - 5, Math.floor(rows / 2) - 1, stamp);
  } else if (name === 'rpentomino') {
    place(patterns.rpentomino, Math.floor(cols / 2) - 1, Math.floor(rows / 2) - 1, stamp);
  } else if (name === 'acorn') {
    place(patterns.acorn, Math.floor(cols / 2) - 3, Math.floor(rows / 2) - 1, stamp);
  } else if (name === 'diehard') {
    place(patterns.diehard, Math.floor(cols / 2) - 4, Math.floor(rows / 2) - 1, stamp);
  } else if (name === 'random') {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (Math.random() < 0.27) {
          cells[y][x] = 1;
          bornAt[y][x] = stamp;
        }
      }
    }
    if (stamp > lastBirthAt) lastBirthAt = stamp;
  }

  history = [population()];
  selectPreset(name);
  statusText.textContent = name === 'blank' ? 'Ready to evolve' : 'Pattern loaded';
  draw();
  drawChart();
  if (name !== 'blank') scheduleSettleAnimation();
}

function paintCell(x, y, value) {
  if (x < 0 || x >= cols || y < 0 || y >= rows || cells[y][x] === value) return false;

  cells[y][x] = value ? 1 : 0;
  if (value) markBirth(x, y);
  else bornAt[y][x] = 0;
  trails[y][x] = 0;
  addEffect(x, y, value ? 'birth' : 'death');
  return true;
}

function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return [-1, -1];

  // Invert gridGeometry() exactly: element-relative pixel -> coordinate
  // space -> grid cell. The element is pinned to the bitmap so the scale
  // factor is 1, but mapping through the rect keeps clicks correct even if
  // a future stylesheet ever clamps the element.
  const { width, height, cell, left, top } = gridGeometry();
  const x = (event.clientX - rect.left) * (width / rect.width);
  const y = (event.clientY - rect.top) * (height / rect.height);
  return [Math.floor((x - left) / cell), Math.floor((y - top) / cell)];
}

function finishDrawing(event) {
  drawing = false;
  if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const [x, y] = cellFromEvent(event);
  if (x < 0 || x >= cols || y < 0 || y >= rows) {
    drawing = false;
    return;
  }

  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  drawValue = !cells[y][x];
  if (paintCell(x, y, drawValue)) {
    selectPreset('');
    updateManualHistory();
    draw();
    scheduleEffects();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing) return;
  event.preventDefault();
  const [x, y] = cellFromEvent(event);
  if (paintCell(x, y, drawValue)) {
    updateManualHistory();
    draw();
    scheduleEffects();
  }
});

canvas.addEventListener('pointerup', finishDrawing);
canvas.addEventListener('pointercancel', finishDrawing);
canvas.addEventListener('lostpointercapture', () => {
  drawing = false;
});

playBtn.addEventListener('click', () => setRunning(!running));
document.getElementById('stepBtn').addEventListener('click', () => {
  setRunning(false);
  evolve();
});
document.getElementById('clearBtn').addEventListener('click', () => loadPattern('blank'));
document.getElementById('randomizeBtn').addEventListener('click', () => loadPattern('random'));

speedRange.addEventListener('input', () => {
  speedValue.textContent = `${speedRange.value} gen/s`;
  if (running) setRunning(true);
});

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => loadPattern(button.dataset.pattern));
});

morePresetsBtn?.addEventListener('click', () => {
  const open = presetList.classList.toggle('open');
  morePresetsBtn.setAttribute('aria-expanded', String(open));
  morePresetsBtn.querySelector('.label').textContent = open ? 'Fewer presets' : 'More presets';
});

function setSettingsOpen(open, opener = null) {
  if (open) {
    settingsOpener = opener || settingsOpener;
    // Opening settings is an intentional pause. The simulation stays paused
    // after the menu closes so a settings change cannot be missed.
    setRunning(false);
  }

  settingsPanel.classList.toggle('open', open);
  settingsBackdrop.classList.toggle('open', open);
  settingsPanel.setAttribute('aria-hidden', String(!open));
  settingsBackdrop.setAttribute('aria-hidden', String(!open));
  settingsTrigger.setAttribute('aria-expanded', String(open));
  settingsDesktopTrigger.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('settings-open', open);

  if (open) {
    settingsClose.focus();
  } else {
    settingsOpener?.focus();
    settingsOpener = null;
  }
}

function toggleSettings(opener) {
  setSettingsOpen(!settingsPanel.classList.contains('open'), opener);
}

settingsTrigger.addEventListener('click', () => toggleSettings(settingsTrigger));
settingsDesktopTrigger.addEventListener('click', () => toggleSettings(settingsDesktopTrigger));
settingsClose.addEventListener('click', () => setSettingsOpen(false));
settingsBackdrop.addEventListener('click', () => setSettingsOpen(false));
boundaryModeSelect.addEventListener('change', (event) => {
  boundaryMode = event.target.value === 'bounded' ? 'bounded' : 'wrap';
});

document.getElementById('fitBtn').addEventListener('click', () => {
  zoom = 1;
  updateZoom();
  draw();
});

document.getElementById('zoomOut').addEventListener('click', () => {
  zoom = Math.max(0.75, Number((zoom - 0.25).toFixed(2)));
  updateZoom();
  draw();
});

document.getElementById('zoomIn').addEventListener('click', () => {
  zoom = Math.min(2, Number((zoom + 0.25).toFixed(2)));
  updateZoom();
  draw();
});

function inkForColor(color) {
  // Black or white text on the primary button, whichever stays readable on
  // the chosen colour (defaults resolve to black, exactly as before).
  const hex = color.slice(1);
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#000000' : '#ffffff';
}

function faviconSvgUrl(color) {
  // The favicon glyph from favicon.svg / favicon-light.svg, recoloured on
  // the fly and served as a data URI so the tab icon follows the picker.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 37 37">` +
    `<g transform="rotate(45 12.5 12.5)" fill="${color}">` +
    `<rect width="6.333" height="6.333" rx="1" opacity=".45"/>` +
    `<rect x="9.333" width="6.333" height="6.333" rx="1"/>` +
    `<rect x="9.333" y="9.333" width="6.333" height="6.333" rx="1"/>` +
    `<rect x="18.666" y="18.666" width="6.333" height="6.333" rx="1"/>` +
    `</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function updateFavicon() {
  faviconLink?.setAttribute(
    'href',
    customMainColor ? faviconSvgUrl(customMainColor) : faviconByTheme[currentTheme()],
  );
}

function applyMainColor(color, { persist = true } = {}) {
  customMainColor = color;
  if (persist) {
    try {
      if (color) localStorage.setItem(MAIN_COLOR_KEY, color);
      else localStorage.removeItem(MAIN_COLOR_KEY);
    } catch (error) {
      // Storage unavailable (private mode): the pick applies for this
      // session, it just won't survive a reload.
    }
  }

  const bodyStyle = document.body.style;
  if (color) {
    bodyStyle.setProperty('--lime', color);
    bodyStyle.setProperty('--cell-alive', color);
    bodyStyle.setProperty('--accent-ink', inkForColor(color));
  } else {
    bodyStyle.removeProperty('--lime');
    bodyStyle.removeProperty('--cell-alive');
    bodyStyle.removeProperty('--accent-ink');
  }
  themeColors.dark.alive = customMainColor || defaultAliveByTheme.dark;
  themeColors.light.alive = customMainColor || defaultAliveByTheme.light;

  if (mainColorInput) {
    mainColorInput.value = customMainColor || defaultAliveByTheme[currentTheme()];
  }
  syncColorSwatches();
  updateFavicon();
  draw();
}

function applyTheme(theme) {
  if (!themeColors[theme]) return;
  document.body.dataset.theme = theme;
  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === theme);
  });
  themeColorMeta?.setAttribute('content', metaThemeColors[theme]);
  updateFavicon();
  if (mainColorInput) {
    mainColorInput.value = customMainColor || defaultAliveByTheme[theme];
  }
  draw();
  drawChart();
  scheduleEffects();
}

document.querySelectorAll('.theme-btn').forEach((button) => {
  button.addEventListener('click', () => applyTheme(button.dataset.theme));
});

mainColorInput?.addEventListener('input', (event) => {
  const value = event.target.value;
  if (/^#[0-9a-f]{6}$/i.test(value)) applyMainColor(value);
});

mainColorResetBtn?.addEventListener('click', () => {
  applyMainColor(null);
});

function syncColorSwatches() {
  colorSwatchButtons.forEach((button) => {
    const active = Boolean(customMainColor)
      && button.dataset.color.toLowerCase() === customMainColor.toLowerCase();
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

colorSwatchButtons.forEach((button) => {
  button.addEventListener('click', () => applyMainColor(button.dataset.color));
});

document.getElementById('trailToggle').addEventListener('change', (event) => {
  trailEnabled = event.target.checked;
  draw();
});

function updateZoom() {
  document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
}

const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(setSize) : null;
resizeObserver?.observe(frame);
if (chart) resizeObserver?.observe(chart);
window.addEventListener('resize', setSize);

function isTypingTarget(target) {
  return target.matches('input, textarea, select, [contenteditable="true"]');
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsPanel.classList.contains('open')) {
    setSettingsOpen(false);
    return;
  }
  if (isTypingTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setRunning(!running);
  } else if (event.key.toLowerCase() === 'r') {
    loadPattern('random');
  } else if (event.key.toLowerCase() === 'c') {
    loadPattern('blank');
  }
});

updateGridReadout();
speedValue.textContent = `${speedRange.value} gen/s`;
updateZoom();
setSettingsOpen(false);
// Start on the system theme; the user's explicit choice (this session)
// always wins afterwards.
const systemPrefersLight =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: light)').matches;
applyTheme(systemPrefersLight ? 'light' : 'dark');

let storedMainColor = null;
try {
  const stored = localStorage.getItem(MAIN_COLOR_KEY);
  if (stored && /^#[0-9a-f]{6}$/i.test(stored)) storedMainColor = stored;
} catch (error) {
  // Storage unavailable — start on the theme default.
}
applyMainColor(storedMainColor, { persist: false });

setSize();
