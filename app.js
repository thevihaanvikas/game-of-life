const canvas = document.getElementById('lifeCanvas');
const ctx = canvas.getContext('2d');
const frame = document.getElementById('canvasFrame');
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
const statsGrid = document.querySelector('.stats-grid');

// --- Theme system ---
const THEMES = {
  DARK: 'dark',
  HIGH_CONTRAST: 'high-contrast',
  LIGHT: 'light'
};

let currentTheme = THEMES.DARK;
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme) {
  const root = document.documentElement;
  switch (theme) {
    case THEMES.DARK:
      root.style.setProperty('--bg', '#090d1b');
      root.style.setProperty('--panel', 'rgba(22,29,53,.68)');
      root.style.setProperty('--line', 'rgba(148,163,205,.17)');
      root.style.setProperty('--muted', '#818ba8');
      root.style.setProperty('--text', '#f1f3fc');
      root.style.setProperty('--lime', '#c7f36a');
      root.style.setProperty('--cyan', '#60d7ed');
      break;
    case THEMES.HIGH_CONTRAST:
      root.style.setProperty('--bg', '#000000');
      root.style.setProperty('--panel', 'rgba(34,34,34,.85)');
      root.style.setProperty('--line', 'rgba(255,255,255,.3)');
      root.style.setProperty('--muted', '#ffffff');
      root.style.setProperty('--text', '#ffffff');
      root.style.setProperty('--lime', '#00ff00');
      root.style.setProperty('--cyan', '#00ffff');
      break;
    case THEMES.LIGHT:
      root.style.setProperty('--bg', '#f8f9fa');
      root.style.setProperty('--panel', 'rgba(255,255,255,.8)');
      root.style.setProperty('--line', 'rgba(0,0,0,.1)');
      root.style.setProperty('--muted', '#6c757d');
      root.style.setProperty('--text', '#212529');
      root.style.setProperty('--lime', '#8bbf26');
      root.style.setProperty('--cyan', '#17a2b8');
      break;
  }
  currentTheme = theme;
  localStorage.setItem('gameOfLifeTheme', theme);
}

// Initialize theme from saved preference or system preference
const savedTheme = localStorage.getItem('gameOfLifeTheme');
if (savedTheme && THEMES[savedTheme]) {
  applyTheme(savedTheme);
} else if (prefersDark.matches) {
  applyTheme(THEMES.DARK);
} else {
  applyTheme(THEMES.LIGHT);
}

// Theme toggle button is already in index.html, just add click handler
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const order = [THEMES.HIGH_CONTRAST, THEMES.LIGHT, THEMES.DARK];
      const currentIndex = order.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % order.length;
      applyTheme(order[nextIndex]);
    });
  }
});

// --- Cell age & trail tracking ---
let cols = 48, rows = 30;
let cells = makeGrid();
let ages = makeGrid();         // how long cell has survived (generations)
let trail = makeGrid();        // recently dead cells (age decays each generation)
let running = false, generation = 0, timer = null, drawing = false, drawValue = true, zoom = 1;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const TRAIL_LIFETIME = 5;      // generations a cell stays in trail
const POP_HISTORY_LENGTH = 50; // generations remembered for graph
let popHistory = new Array(POP_HISTORY_LENGTH).fill(0);
let popHistoryIndex = 0;

function makeGrid() {
  return Array.from({ length: rows }, () => new Uint16Array(cols));
}

function resetGrids() {
  cells = makeGrid();
  ages = makeGrid();
  trail = makeGrid();
  popHistory = new Array(POP_HISTORY_LENGTH).fill(0);
  popHistoryIndex = 0;
}

// --- Color from age: brighter when young, dimmer when old ---
function getCellColorFromAge(age) {
  const normalized = Math.min(age, 40) / 40;
  const r = Math.round(200 + 55 * (1 - normalized)); // 200→255
  const g = Math.round(255 - 100 * (1 - normalized)); // 255→155
  const b = Math.round(50 + 20 * (1 - normalized));  // 50→70
  return `rgb(${r},${g},${b})`;
}

// --- Birth effect: brief pulse at cell position ---
function triggerBirthEffect(x, y) {
  const pulse = document.createElement('div');
  pulse.style.cssText = `
    position: fixed;
    left: calc(${x}px + 2px);
    top: calc(${y}px + 2px);
    width: 5px;
    height: 5px;
    background: var(--lime);
    border-radius: 50%;
    pointer-events: none;
    animation: pulseBirth 0.35s ease-out forwards;
    z-index: 2000;
    box-shadow: 0 0 8px var(--lime);
  `;
  document.body.appendChild(pulse);
  setTimeout(() => pulse.remove(), 350);
}

// --- Death effect: brief fade pulse ---
function triggerDeathEffect(x, y) {
  const death = document.createElement('div');
  death.style.cssText = `
    position: fixed;
    left: calc(${x}px + 2px);
    top: calc(${y}px + 2px);
    width: 5px;
    height: 5px;
    background: rgba(255,255,255,.6);
    border-radius: 50%;
    pointer-events: none;
    animation: pulseDeath 0.4s ease-out forwards;
    z-index: 2000;
  `;
  document.body.appendChild(death);
  setTimeout(() => death.remove(), 400);
}

// Add keyframe styles for birth/death effects
const effectStyle = document.createElement('style');
effectStyle.textContent = `
  @keyframes pulseBirth {
    0% { transform: scale(0); opacity: 1; }
    100% { transform: scale(1.4); opacity: 0; }
  }
  @keyframes pulseDeath {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(1.8); opacity: 0; }
  }
`;
document.head.appendChild(effectStyle);

// --- Population graph: compact line chart for desktop ---
function renderPopGraph() {
  if (window.innerWidth > 850) {
    let graphCanvas = document.getElementById('popGraphCanvas');
    if (!graphCanvas) {
      graphCanvas = document.createElement('canvas');
      graphCanvas.id = 'popGraphCanvas';
      graphCanvas.width = 90;
      graphCanvas.height = 22;
      graphCanvas.style.cssText = `
        flex-shrink: 0;
        border-left: 1px solid var(--line);
        margin-left: 10px;
      `;
      const popRow = populationEl.parentElement;
      if (popRow && popRow.parentElement) {
        popRow.parentElement.insertBefore(graphCanvas, popRow.nextSibling);
      }
    }

    const gc = graphCanvas.getContext('2d');
    gc.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

    const padding = 2;
    const w = graphCanvas.width - padding * 2;
    const h = graphCanvas.height - padding * 2;

    const values = [...popHistory];
    const minV = Math.min(...values);
    const maxV = Math.max(...values);

    if (maxV === minV) {
      gc.strokeStyle = var(--cyan);
      gc.lineWidth = 1;
      gc.beginPath();
      gc.moveTo(padding, padding + h / 2);
      gc.lineTo(padding + w, padding + h / 2);
      gc.stroke();
      return;
    }

    gc.strokeStyle = var(--cyan);
    gc.lineWidth = 1.5;
    gc.beginPath();

    for (let i = 0; i < POP_HISTORY_LENGTH; i++) {
      const x = padding + (i / POP_HISTORY_LENGTH) * w;
      const y = padding + h - ((values[i] - minV) / (maxV - minV)) * h;
      if (i === 0) gc.moveTo(x, y); else gc.lineTo(x, y);
    }
    gc.stroke();

    gc.fillStyle = 'rgba(96, 215, 237, 0.18)';
    gc.beginPath();
    gc.moveTo(padding, graphCanvas.height - padding);
    gc.lineTo(padding, padding);
    gc.lineTo(padding + w, padding);
    gc.lineTo(padding + w, graphCanvas.height - padding);
    gc.closePath();
    gc.fill();
  } else {
    // Hide on mobile
    const graphCanvas = document.getElementById('popGraphCanvas');
    if (graphCanvas) {
      graphCanvas.style.display = 'none';
    }
  }
}

// --- Trail mode: render recently deceased as dim afterimage ---
function updateTrail() {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (trail[y][x] > 0) {
        trail[y][x]--; // age decays each generation
      }
    }
  }
}

function addCellToTrail(x, y) {
  if (x >= 0 && x < cols && y >= 0 && y < rows) {
    trail[y][x] = TRAIL_LIFETIME;
  }
}

// --- Core draw function with age coloring and trail ---
function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, w, h);
  const gridW = w * zoom, gridH = h * zoom, left = (w - gridW) / 2, top = (h - gridH) / 2;
  const cw = gridW / cols, ch = gridH / rows;

  // Draw grid lines
  ctx.strokeStyle = 'rgba(108, 127, 170, .12)';
  ctx.lineWidth = Math.max(.45, .55 * DPR);
  ctx.beginPath();
  for (let x = 0; x <= cols; x++) {
    const px = Math.round(left + x * cw) + .5;
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + gridH);
  }
  for (let y = 0; y <= rows; y++) {
    const py = Math.round(top + y * ch) + .5;
    ctx.moveTo(left, py);
    ctx.lineTo(left + gridW, py);
  }
  ctx.stroke();

  // Draw cells with age coloring and trail
  ctx.fillStyle = '#c7f36a';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cells[y][x]) {
        // Use age-based color if cell is alive
        const cellColor = getCellColorFromAge(ages[y][x]);
        ctx.fillStyle = cellColor;

        // Draw with trail influence: if cell also has trail, blend
        const trailAlpha = trail[y][x] / TRAIL_LIFETIME;
        if (trailAlpha > 0 && cells[y][x]) {
          const trailPad = Math.max(1, Math.min(cw, ch) * .18);
          ctx.globalAlpha = trailAlpha * 0.3;
          ctx.fillRect(left + x * cw + trailPad, top + y * ch + trailPad, Math.max(1, cw - trailPad * 2), Math.max(1, ch - trailPad * 2));
          ctx.globalAlpha = 1;
        }

        const pad = Math.max(1.5, Math.min(cw, ch) * .18);
        ctx.fillRect(left + x * cw + pad, top + y * ch + pad, Math.max(1, cw - pad * 2), Math.max(1, ch - pad * 2));
      } else if (trail[y][x] > 0) {
        // Draw dim trail cell where no live cell exists
        const tAlpha = trail[y][x] / TRAIL_LIFETIME;
        ctx.globalAlpha = tAlpha * 0.15;
        ctx.fillStyle = 'rgba(199, 243, 106, 0.15)';
        const pad = Math.max(1, Math.min(cw, ch) * .18);
        ctx.fillRect(left + x * cw + pad, top + y * ch + pad, Math.max(1, cw - pad * 2), Math.max(1, ch - pad * 2));
        ctx.globalAlpha = 1;
      }
    }
  }

  // Draw grid lines (on top)
  ctx.strokeStyle = 'rgba(108, 127, 170, .12)';
  ctx.lineWidth = Math.max(.45, .55 * DPR);
  ctx.beginPath();
  for (let x = 0; x <= cols; x++) {
    const px = Math.round(left + x * cw) + .5;
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + gridH);
  }
  for (let y = 0; y <= rows; y++) {
    const py = Math.round(top + y * ch) + .5;
    ctx.moveTo(left, py);
    ctx.lineTo(left + gridW, py);
  }
  ctx.stroke();

  // Update UI
  const pop = population();
  emptyHint.classList.toggle('hidden', pop > 0);
  populationEl.textContent = String(pop).padStart(4, '0');
  generationEl.textContent = String(generation).padStart(5, '0');

  // Update trail and population graph
  updateTrail();
  if (generation > 0) {
    popHistory[popHistoryIndex % POP_HISTORY_LENGTH] = pop;
    popHistoryIndex++;
    renderPopGraph();
  }
}

// --- Evolve function with birth/death tracking ---
function evolve() {
  const next = makeGrid();
  let diedCellsThisGen = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) {
            n += cells[(y + dy + rows) % rows][(x + dx + cols) % cols];
          }
        }
      }

      const wasAlive = cells[y][x] === 1;
      const willLive = n === 3 || (wasAlive && n === 2);

      if (willLive) {
        next[y][x] = 1;
        if (!wasAlive) {
          // Birth: start age tracking and trigger effect
          ages[y][x] = 1;
          triggerBirthEffect(x, y);
        } else {
          // Survival: increment age
          ages[y][x]++;
        }
      } else {
        // Cell dies
        if (wasAlive) {
          diedCellsThisGen++;
          addCellToTrail(x, y); // add to trail for afterimage
          ages[y][x] = 0; // reset age
          triggerDeathEffect(x, y); // trigger death effect
        }
        next[y][x] = 0;
      }
    }
  }

  cells = next;
  generation++;

  draw();
}

// --- Set running ---
function setRunning(value) {
  running = value;
  playLabel.textContent = running ? 'Pause' : 'Play';
  playBtn.querySelector('.play-icon').textContent = running ? 'Ⅱ' : '▶';
  statusText.textContent = running ? 'Simulation running' : 'Simulation paused';
  statusDot.style.background = running ? 'var(--cyan)' : 'var(--lime)';
  statusDot.style.boxShadow = running ? '0 0 12px var(--cyan)' : '0 0 12px var(--lime)';
  clearInterval(timer);
  if (running) {
    timer = setInterval(evolve, 1000 / Number(speedRange.value));
  }
}

// --- Clear ---
function clear() {
  setRunning(false);
  resetGrids();
  cells = makeGrid();
  generation = 0;
  draw();
}

// --- Randomize ---
function randomize() {
  setRunning(false);
  resetGrids();
  cells = makeGrid();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells[y][x] = Math.random() < .27 ? 1 : 0;
    }
  }
  generation = 0;
  draw();
}

// --- Place pattern ---
function place(pattern, ox, oy) {
  pattern.forEach((line, y) => {
    [...line].forEach((v, x) => {
      if (v === '1' && y + oy >= 0 && y + oy < rows && x + ox >= 0 && x + ox < cols) {
        cells[y + oy][x + ox] = 1;
      }
    });
  });
}

// --- Patterns ---
const patterns = {
  glider: ['010', '001', '111'],
  gun: ['000000000000000000000000000000100000', '000000000000000000000000000010100000', '000000000000110000000000001100000011', '00000000000100010000000000011000001100', '110000000010000010000000000110000000', '110000000010001011000000000010100000', '000000000010000010000000000000100000', '000000000001000100000000000000000000', '000000000000110000000000000000000000']
};

// --- Pattern selection ---
function selectPreset(name) {
  document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', b.dataset.pattern === name));
}

function loadPattern(name) {
  setRunning(false);
  resetGrids();
  generation = 0;
  if (name === 'glider') {
    place(patterns.glider, Math.floor(cols / 2) - 1, Math.floor(rows / 2) - 1);
  }
  if (name === 'gun') {
    place(patterns.gun, 2, Math.floor(rows / 2) - 4);
  }
  if (name === 'random') {
    randomize();
    return;
  }
  selectPreset(name);
  draw();
}

// --- Cell from event ---
function cellFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  const gx = (px - (1 - zoom) / 2) / zoom, gy = (py - (1 - zoom) / 2) / zoom;
  return [Math.floor(gx * cols), Math.floor(gy * rows)];
}

// --- Pointer events ---
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  drawing = true;
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = cellFromEvent(e);
  if (x >= 0 && x < cols && y >= 0 && y < rows) {
    drawValue = !cells[y][x];
    cells[y][x] = drawValue;
    if (cells[y][x] && drawValue) {
      ages[y][x] = 1;
    }
    triggerBirthEffect(x, y);
    draw();
  }
});

canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  const [x, y] = cellFromEvent(e);
  if (x >= 0 && x < cols && y >= 0 && y < rows && cells[y][x] !== drawValue) {
    cells[y][x] = drawValue;
    if (cells[y][x] && drawValue) {
      ages[y][x] = 1;
    }
    triggerBirthEffect(x, y);
    draw();
  }
});

canvas.addEventListener('pointerup', () => { drawing = false; });
canvas.addEventListener('pointercancel', () => { drawing = false; });

// --- Controls ---
playBtn.onclick = () => setRunning(!running);
document.getElementById('stepBtn').onclick = () => {
  setRunning(false);
  evolve();
};
document.getElementById('clearBtn').onclick = clear;
document.getElementById('randomizeBtn').onclick = randomize;

speedRange.oninput = () => {
  speedValue.textContent = `${speedRange.value} gen/s`;
  if (running) setRunning(true);
};

document.querySelectorAll('.preset').forEach(b => b.onclick = () => loadPattern(b.dataset.pattern));

document.getElementById('fitBtn').onclick = () => {
  zoom = 1;
  updateZoom();
  setSize();
};

document.getElementById('zoomOut').onclick = () => {
  zoom = Math.max(.75, +(zoom - .25).toFixed(2));
  updateZoom();
  draw();
};

document.getElementById('zoomIn').onclick = () => {
  zoom = Math.min(2, +(zoom + .25).toFixed(2));
  updateZoom();
  draw();
};

function updateZoom() {
  document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
};

window.addEventListener('resize', () => {
  setSize();
  renderPopGraph();
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    setRunning(!running);
  }
  if (e.key.toLowerCase() === 'r') {
    randomize();
  }
  if (e.key.toLowerCase() === 'c') {
    clear();
  }
});

gridReadout.textContent = `${cols} × ${rows}`;
setSize();

// Initial render and graph setup
draw();
renderPopGraph();