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
const gridSizeSelect = document.getElementById('gridSize');
const patternSelect = document.getElementById('patternSelect');
const boundaryModeSelect = document.getElementById('boundaryMode');
const settingsTrigger = document.getElementById('settingsTrigger');
const settingsDesktopTrigger = document.getElementById('settingsDesktopTrigger');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');

let cols = 48;
let rows = 30;
const TARGET_CELL_SIZE = 14;
const MIN_COLS = 40;
const MIN_ROWS = 20;
const MAX_COLS = 160;
const MAX_ROWS = 100;
let cells = makeGrid();
let ages = makeGrid();
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
let gridSizeMode = 'responsive';
let boundaryMode = 'wrap';
let settingsOpener = null;
let pixelRatio = 1;
let chartPixelRatio = 1;

const themeColors = {
  dark: {
    alive: '#00ff00',
    accent: '#00ffff',
    background: '#000000',
    grid: 'rgba(255, 255, 255, 0.36)',
  },
  light: {
    alive: '#27734a',
    accent: '#16718a',
    background: '#f6faf8',
    grid: 'rgba(48, 86, 77, 0.2)',
  },
  contrast: {
    alive: '#ffff00',
    accent: '#00ffff',
    background: '#000000',
    grid: 'rgba(255, 255, 255, 0.36)',
  },
};

const metaThemeColors = {
  dark: '#000000',
  light: '#edf4f1',
  contrast: '#000000',
};

const faviconByTheme = {
  dark: 'favicon.svg',
  light: 'favicon-light.svg',
  contrast: 'favicon-contrast.svg',
};

const patterns = {
  glider: ['010', '001', '111'],
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
  const previousAges = ages;
  const previousTrails = trails;
  const nextCells = Array.from({ length: nextRows }, () => new Uint16Array(nextCols));
  const nextAges = Array.from({ length: nextRows }, () => new Uint16Array(nextCols));
  const nextTrails = Array.from({ length: nextRows }, () => new Float32Array(nextCols));

  // Resize around the centre of the world. Existing cells are mapped by their
  // relative position so resizing the window does not erase a hand-painted
  // pattern or make it jump to a corner.
  for (let y = 0; y < previousRows; y += 1) {
    for (let x = 0; x < previousCols; x += 1) {
      const targetX = Math.min(nextCols - 1, Math.round(x * (nextCols - 1) / Math.max(1, previousCols - 1)));
      const targetY = Math.min(nextRows - 1, Math.round(y * (nextRows - 1) / Math.max(1, previousRows - 1)));
      nextCells[targetY][targetX] = Math.max(nextCells[targetY][targetX], previousCells[y][x]);
      nextAges[targetY][targetX] = Math.max(nextAges[targetY][targetX], previousAges[y][x]);
      nextTrails[targetY][targetX] = Math.max(nextTrails[targetY][targetX], previousTrails[y][x]);
    }
  }

  cols = nextCols;
  rows = nextRows;
  cells = nextCells;
  ages = nextAges;
  trails = nextTrails;
  updateGridReadout();
}

const fixedGridSizes = {
  compact: [40, 20],
  standard: [48, 30],
  large: [72, 45],
};

function resizeGridForViewport(width, height) {
  if (gridSizeMode !== 'responsive') return;
  const nextCols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.round(width / TARGET_CELL_SIZE)));
  const nextRows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(height / TARGET_CELL_SIZE)));
  resizeGrid(nextCols, nextRows);
}

function setGridSize(mode) {
  gridSizeMode = fixedGridSizes[mode] ? mode : 'responsive';
  if (gridSizeMode === 'responsive') {
    resizeGridForViewport(frame.clientWidth, frame.clientHeight);
  } else {
    const [nextCols, nextRows] = fixedGridSizes[gridSizeMode];
    resizeGrid(nextCols, nextRows);
  }
  draw();
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

function resizeCanvas(target, context, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  target.width = Math.max(1, Math.round(width * dpr));
  target.height = Math.max(1, Math.round(height * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

function setSize() {
  const boardRect = frame.getBoundingClientRect();
  const boardWidth = Math.floor(frame.clientWidth || boardRect.width);
  const boardHeight = Math.floor(frame.clientHeight || boardRect.height);

  if (boardWidth > 0 && boardHeight > 0) {
    pixelRatio = resizeCanvas(canvas, ctx, boardWidth, boardHeight);
    resizeGridForViewport(boardWidth, boardHeight);
  }

  if (chart && chartCtx) {
    const chartRect = chart.getBoundingClientRect();
    if (chartRect.width > 0 && chartRect.height > 0) {
      chartPixelRatio = resizeCanvas(chart, chartCtx, chartRect.width, chartRect.height);
    }
  }

  draw();
  drawChart();
}

function scheduleEffects() {
  if (!effects.length || effectFrame) return;
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

function draw(now = performance.now()) {
  const width = frame.clientWidth;
  const height = frame.clientHeight;
  if (!width || !height) return;

  const { alive, accent, background, grid } = colorsForTheme();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const gridWidth = width * zoom;
  const gridHeight = height * zoom;
  const left = (width - gridWidth) / 2;
  const top = (height - gridHeight) / 2;
  const cellWidth = gridWidth / cols;
  const cellHeight = gridHeight / rows;

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1 / pixelRatio;
  ctx.beginPath();
  for (let x = 0; x <= cols; x += 1) {
    const px = Math.round(left + x * cellWidth) + 0.5 / pixelRatio;
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + gridHeight);
  }
  for (let y = 0; y <= rows; y += 1) {
    const py = Math.round(top + y * cellHeight) + 0.5 / pixelRatio;
    ctx.moveTo(left, py);
    ctx.lineTo(left + gridWidth, py);
  }
  ctx.stroke();

  const padding = Math.max(1.5, Math.min(cellWidth, cellHeight) * 0.18);
  const cellDrawWidth = Math.max(1, cellWidth - padding * 2);
  const cellDrawHeight = Math.max(1, cellHeight - padding * 2);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const value = cells[y][x];
      const trail = trails[y][x];
      const xPosition = left + x * cellWidth + padding;
      const yPosition = top + y * cellHeight + padding;

      if (!value && trailEnabled && trail > 0) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = trail * 0.22;
        ctx.fillRect(xPosition, yPosition, cellDrawWidth, cellDrawHeight);
        ctx.globalAlpha = 1;
      }

      if (value) {
        const age = Math.min(1, ages[y][x] / 18);
        ctx.fillStyle = alive;
        ctx.globalAlpha = 0.52 + age * 0.48;
        ctx.fillRect(xPosition, yPosition, cellDrawWidth, cellDrawHeight);
        ctx.globalAlpha = 1;
      }
    }
  }

  effects.forEach((effect) => {
    const progress = Math.min(1, (now - effect.time) / 420);
    const alpha = (1 - progress) * 0.38;
    if (alpha <= 0) return;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.type === 'birth' ? alive : accent;
    const xPosition = left + effect.x * cellWidth + padding - progress * 1.2;
    const yPosition = top + effect.y * cellHeight + padding - progress * 1.2;
    ctx.fillRect(
      xPosition,
      yPosition,
      Math.max(1, cellDrawWidth + progress * 2.4),
      Math.max(1, cellDrawHeight + progress * 2.4),
    );
    ctx.globalAlpha = 1;
  });

  updateReadouts();
}

function drawChart() {
  if (!chart || !chartCtx) return;
  const width = chart.clientWidth;
  const height = chart.clientHeight;
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
  const nextAges = makeGrid();
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
        nextAges[y][x] = cells[y][x] ? Math.min(65535, ages[y][x] + 1) : 1;
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
  ages = nextAges;
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
  ages = makeGrid();
  trails = makeTrailGrid();
  effects = [];
  generation = 0;
}

function selectPreset(name) {
  document.querySelectorAll('.preset').forEach((button) => {
    button.classList.toggle('active', button.dataset.pattern === name);
  });
  if (patternSelect) patternSelect.value = name || '';
}

function place(pattern, offsetX, offsetY) {
  pattern.forEach((line, y) => {
    [...line].forEach((value, x) => {
      const targetX = x + offsetX;
      const targetY = y + offsetY;
      if (value === '1' && targetY >= 0 && targetY < rows && targetX >= 0 && targetX < cols) {
        cells[targetY][targetX] = 1;
        ages[targetY][targetX] = 1;
      }
    });
  });
}

function loadPattern(name) {
  setRunning(false);
  resetState();

  if (name === 'glider') {
    place(patterns.glider, Math.floor(cols / 2) - 1, Math.floor(rows / 2) - 1);
  } else if (name === 'gun') {
    place(patterns.gun, 2, Math.floor(rows / 2) - 4);
  } else if (name === 'random') {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (Math.random() < 0.27) {
          cells[y][x] = 1;
          ages[y][x] = 1;
        }
      }
    }
  }

  history = [population()];
  selectPreset(name);
  statusText.textContent = name === 'blank' ? 'Ready to evolve' : 'Pattern loaded';
  draw();
  drawChart();
}

function paintCell(x, y, value) {
  if (x < 0 || x >= cols || y < 0 || y >= rows || cells[y][x] === value) return false;

  cells[y][x] = value ? 1 : 0;
  ages[y][x] = value ? 1 : 0;
  trails[y][x] = 0;
  addEffect(x, y, value ? 'birth' : 'death');
  return true;
}

function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return [-1, -1];

  const normalizedX = (event.clientX - rect.left) / rect.width;
  const normalizedY = (event.clientY - rect.top) / rect.height;
  const gridX = (normalizedX - (1 - zoom) / 2) / zoom;
  const gridY = (normalizedY - (1 - zoom) / 2) / zoom;
  return [Math.floor(gridX * cols), Math.floor(gridY * rows)];
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
gridSizeSelect.addEventListener('change', (event) => setGridSize(event.target.value));
patternSelect.addEventListener('change', (event) => loadPattern(event.target.value));
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

function applyTheme(theme) {
  if (!themeColors[theme]) return;
  document.body.dataset.theme = theme;
  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === theme);
  });
  themeColorMeta?.setAttribute('content', metaThemeColors[theme]);
  faviconLink?.setAttribute('href', faviconByTheme[theme]);
  draw();
  drawChart();
  scheduleEffects();
}

document.querySelectorAll('.theme-btn').forEach((button) => {
  button.addEventListener('click', () => applyTheme(button.dataset.theme));
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
applyTheme(currentTheme());
setSize();
