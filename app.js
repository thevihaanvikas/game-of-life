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

let cols = 48, rows = 30, cells = makeGrid();
let running = false, generation = 0, timer = null, drawing = false, drawValue = true, zoom = 1;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

// Older mobile browsers can report 100vh as the full screen, including the system bar.
// Use the visual viewport when available so the app's bottom edge stays in the visible area.
function syncViewportHeight() {
  const visualHeight = window.visualViewport?.height;
  const height = Math.round(visualHeight || document.documentElement.clientHeight || window.innerHeight);
  document.documentElement.style.setProperty('--viewport-height', `${height}px`);
}
syncViewportHeight();
window.visualViewport?.addEventListener('resize', syncViewportHeight);
window.addEventListener('resize', syncViewportHeight);

function makeGrid() { return Array.from({length: rows}, () => new Uint8Array(cols)); }
function setSize() {
  const rect = frame.getBoundingClientRect();
  canvas.width = Math.round(rect.width * DPR); canvas.height = Math.round(rect.height * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  draw();
}
function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, w, h);
  const gridW = w * zoom, gridH = h * zoom, left = (w-gridW)/2, top = (h-gridH)/2;
  const cw = gridW / cols, ch = gridH / rows;
  ctx.strokeStyle = 'rgba(108, 127, 170, .12)'; ctx.lineWidth = Math.max(.45, .55 * DPR);
  ctx.beginPath();
  for (let x = 0; x <= cols; x++) { const px = Math.round(left + x * cw) + .5; ctx.moveTo(px, top); ctx.lineTo(px, top+gridH); }
  for (let y = 0; y <= rows; y++) { const py = Math.round(top + y * ch) + .5; ctx.moveTo(left, py); ctx.lineTo(left+gridW, py); }
  ctx.stroke();
  ctx.fillStyle = '#c7f36a';
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) if (cells[y][x]) {
    const pad = Math.max(1.5, Math.min(cw, ch) * .18);
    ctx.fillRect(left+x*cw+pad, top+y*ch+pad, Math.max(1,cw-pad*2), Math.max(1,ch-pad*2));
  }
  const pop = population();
  emptyHint.classList.toggle('hidden', pop > 0);
  populationEl.textContent = String(pop).padStart(4,'0');
  generationEl.textContent = String(generation).padStart(5,'0');
}
function population() { return cells.reduce((n,row) => n + row.reduce((a,v)=>a+v,0), 0); }
function evolve() {
  const next = makeGrid();
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
    let n=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(dx||dy) n += cells[(y+dy+rows)%rows][(x+dx+cols)%cols];
    next[y][x] = n === 3 || (cells[y][x] && n === 2) ? 1 : 0;
  }
  cells = next; generation++; draw();
}
function setRunning(value) {
  running = value;
  playLabel.textContent = running ? 'Pause' : 'Play';
  playBtn.querySelector('.play-icon').textContent = running ? 'Ⅱ' : '▶';
  statusText.textContent = running ? 'Simulation running' : 'Simulation paused';
  statusDot.style.background = running ? 'var(--cyan)' : 'var(--lime)';
  statusDot.style.boxShadow = running ? '0 0 12px var(--cyan)' : '0 0 12px var(--lime)';
  clearInterval(timer);
  if (running) timer = setInterval(evolve, 1000 / Number(speedRange.value));
}
function clear() { setRunning(false); cells = makeGrid(); generation = 0; selectPreset('blank'); draw(); }
function randomize() { setRunning(false); cells = makeGrid(); for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) cells[y][x] = Math.random() < .27 ? 1 : 0; generation=0; selectPreset('random'); draw(); }
function place(pattern, ox, oy) { pattern.forEach((line,y)=>[...line].forEach((v,x)=>{if(v==='1' && y+oy>=0 && y+oy<rows && x+ox>=0 && x+ox<cols) cells[y+oy][x+ox]=1;})); }
const patterns = {
  glider: ['010','001','111'],
  gun: ['000000000000000000000000000000100000','000000000000000000000000000010100000','000000000000110000000000001100000011','000000000001000100000000000110000011','110000000010000010000000000110000000','110000000010001011000000000010100000','000000000010000010000000000000100000','000000000001000100000000000000000000','000000000000110000000000000000000000']
};
function selectPreset(name) { document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active', b.dataset.pattern===name)); }
function loadPattern(name) { setRunning(false); cells=makeGrid(); generation=0; if(name==='glider') place(patterns.glider, Math.floor(cols/2)-1, Math.floor(rows/2)-1); if(name==='gun') place(patterns.gun, 2, Math.floor(rows/2)-4); if(name==='random'){randomize();return} selectPreset(name); draw(); }
function cellFromEvent(e) { const r=canvas.getBoundingClientRect(); const px=(e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height; const gx=(px-(1-zoom)/2)/zoom, gy=(py-(1-zoom)/2)/zoom; return [Math.floor(gx*cols),Math.floor(gy*rows)]; }
canvas.addEventListener('pointerdown', e=>{ e.preventDefault(); drawing=true; canvas.setPointerCapture(e.pointerId); const [x,y]=cellFromEvent(e); if(x>=0&&x<cols&&y>=0&&y<rows){drawValue=!cells[y][x]; cells[y][x]=drawValue; draw();} });
canvas.addEventListener('pointermove', e=>{if(!drawing)return; const [x,y]=cellFromEvent(e); if(x>=0&&x<cols&&y>=0&&y<rows&&cells[y][x]!==drawValue){cells[y][x]=drawValue;draw();}});
canvas.addEventListener('pointerup', ()=>drawing=false); canvas.addEventListener('pointercancel', ()=>drawing=false);
playBtn.onclick=()=>setRunning(!running); document.getElementById('stepBtn').onclick=()=>{setRunning(false);evolve()}; document.getElementById('clearBtn').onclick=clear; document.getElementById('randomizeBtn').onclick=randomize;
speedRange.oninput=()=>{speedValue.textContent=`${speedRange.value} gen/s`; if(running)setRunning(true)};
document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>loadPattern(b.dataset.pattern));
document.getElementById('fitBtn').onclick=()=>{zoom=1;updateZoom();setSize()};
document.getElementById('zoomOut').onclick=()=>{zoom=Math.max(.75, +(zoom-.25).toFixed(2));updateZoom();draw()};
document.getElementById('zoomIn').onclick=()=>{zoom=Math.min(2, +(zoom+.25).toFixed(2));updateZoom();draw()};
function updateZoom(){document.getElementById('zoomValue').textContent=`${Math.round(zoom*100)}%`}
window.addEventListener('resize', setSize); document.addEventListener('keydown', e=>{if(e.target.matches('input'))return;if(e.code==='Space'){e.preventDefault();setRunning(!running)} if(e.key.toLowerCase()==='r')randomize(); if(e.key.toLowerCase()==='c')clear()});
gridReadout.textContent=`${cols} × ${rows}`; setSize();
