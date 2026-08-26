const canvas = document.getElementById('lifeCanvas');
const ctx = canvas.getContext('2d');
const frame = document.getElementById('canvasFrame');
const chart = document.getElementById('populationChart');
const chartCtx = chart.getContext('2d');
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

let cols = 48, rows = 30;
let cells = makeGrid(), ages = makeGrid(), trails = makeGrid();
let running = false, generation = 0, timer = null, drawing = false, drawValue = true, zoom = 1;
let history = [0], effects = [], trailEnabled = true, lastFrame = 0;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const colors = { dark: ['#c7f36a', '#60d7ed', '#0a1020'], light: ['#27734a', '#16718a', '#f4f7f5'], contrast: ['#ffff00', '#00ffff', '#000000'] };

function makeGrid() { return Array.from({length: rows}, () => new Uint16Array(cols)); }
function syncViewportHeight() { const h = Math.round(window.visualViewport?.height || document.documentElement.clientHeight || innerHeight); document.documentElement.style.setProperty('--viewport-height', `${h}px`); }
syncViewportHeight(); window.visualViewport?.addEventListener('resize', syncViewportHeight); window.addEventListener('resize', syncViewportHeight);
function themeColors() { return colors[document.body.dataset.theme || 'dark']; }
function setSize() { const r = frame.getBoundingClientRect(); canvas.width = Math.round(r.width * DPR); canvas.height = Math.round(r.height * DPR); ctx.setTransform(DPR,0,0,DPR,0,0); if (chart) { chart.width = Math.max(220, Math.round(chart.clientWidth * DPR)); chart.height = Math.round(chart.clientHeight * DPR); chartCtx.setTransform(DPR,0,0,DPR,0,0); } draw(); drawChart(); }
function scheduleEffects() { if (!effects.length) return; requestAnimationFrame(animateEffects); }
function animateEffects(now) { draw(now); if (effects.some(e => now - e.time < 420)) requestAnimationFrame(animateEffects); else effects = []; }
function draw(now = performance.now()) {
  const w=canvas.clientWidth,h=canvas.clientHeight; const [alive,accent,bg]=themeColors(); ctx.clearRect(0,0,w,h); ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  const gridW=w*zoom,gridH=h*zoom,left=(w-gridW)/2,top=(h-gridH)/2,cw=gridW/cols,ch=gridH/rows;
  ctx.strokeStyle=document.body.dataset.theme==='contrast'?'rgba(255,255,255,.28)':'rgba(108,127,170,.12)'; ctx.lineWidth=Math.max(.45,.55*DPR); ctx.beginPath();
  for(let x=0;x<=cols;x++){const px=Math.round(left+x*cw)+.5;ctx.moveTo(px,top);ctx.lineTo(px,top+gridH)} for(let y=0;y<=rows;y++){const py=Math.round(top+y*ch)+.5;ctx.moveTo(left,py);ctx.lineTo(left+gridW,py)} ctx.stroke();
  const pad=Math.max(1.5,Math.min(cw,ch)*.18);
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    const v=cells[y][x], trail=trails[y][x]; if(!v && trailEnabled && trail>0){ctx.fillStyle=accent;ctx.globalAlpha=trail*.22;ctx.fillRect(left+x*cw+pad,top+y*ch+pad,Math.max(1,cw-pad*2),Math.max(1,ch-pad*2));ctx.globalAlpha=1}
    if(v){ const age=Math.min(1, ages[y][x]/18); ctx.fillStyle=alive; ctx.globalAlpha=.52+age*.48; ctx.fillRect(left+x*cw+pad,top+y*ch+pad,Math.max(1,cw-pad*2),Math.max(1,ch-pad*2)); ctx.globalAlpha=1; }
  }
  // Birth/death pulses are deliberately brief and subtle.
  effects.forEach(e=>{const p=Math.min(1,(now-e.time)/420),alpha=(1-p)*.38;if(alpha<=0)return;ctx.globalAlpha=alpha;ctx.fillStyle=e.type==='birth'?alive:accent;const x=left+e.x*cw+pad-p*1.2,y=top+e.y*ch+pad-p*1.2;ctx.fillRect(x,y,Math.max(1,cw-pad*2+p*2.4),Math.max(1,ch-pad*2+p*2.4));ctx.globalAlpha=1});
  const pop=population(); emptyHint.classList.toggle('hidden',pop>0); populationEl.textContent=String(pop).padStart(4,'0'); generationEl.textContent=String(generation).padStart(5,'0');
}
function population(){return cells.reduce((n,row)=>n+row.reduce((a,v)=>a+(v?1:0),0),0)}
function recordPopulation(){history.push(population()); if(history.length>80)history.shift(); drawChart()}
function drawChart(){ if(!chart || !chart.clientWidth)return; const w=chart.clientWidth,h=chart.clientHeight; chartCtx.clearRect(0,0,w,h); if(history.length<2)return; const max=Math.max(1,...history),min=Math.min(0,...history); chartCtx.strokeStyle=getComputedStyle(document.body).getPropertyValue('--chart').trim()||'#60d7ed'; chartCtx.lineWidth=1.5; chartCtx.beginPath(); history.forEach((v,i)=>{const x=i*(w-2)/(Math.max(1,history.length-1))+1,y=h-3-(v-min)/(max-min||1)*(h-7);i?chartCtx.lineTo(x,y):chartCtx.moveTo(x,y)}); chartCtx.stroke(); }
function evolve(){const next=makeGrid(),nextAges=makeGrid(),nextTrails=makeGrid(); for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)n+=cells[(y+dy+rows)%rows][(x+dx+cols)%cols]?1:0;const born=n===3,survives=cells[y][x]&&n===2;next[y][x]=born||survives?1:0; if(next[y][x])nextAges[y][x]=cells[y][x]?Math.min(65535,ages[y][x]+1):1; if(!next[y][x]&&cells[y][x]){nextTrails[y][x]=1;effects.push({x,y,type:'death',time:performance.now()})}else if(next[y][x]&&!cells[y][x])effects.push({x,y,type:'birth',time:performance.now()}); nextTrails[y][x]=Math.max(nextTrails[y][x],trails[y][x]*.86)} cells=next;ages=nextAges;trails=nextTrails;generation++;recordPopulation();draw();scheduleEffects()}
function setRunning(value){running=value;playLabel.textContent=running?'Pause':'Play';playBtn.querySelector('.play-icon').textContent=running?'Ⅱ':'▶';statusText.textContent=running?'Simulation running':'Simulation paused';statusDot.style.background=running?'var(--cyan)':'var(--lime)';statusDot.style.boxShadow=running?'0 0 12px var(--cyan)':'0 0 12px var(--lime)';clearInterval(timer);if(running)timer=setInterval(evolve,1000/Number(speedRange.value))}
function clear(){setRunning(false);cells=makeGrid();ages=makeGrid();trails=makeGrid();effects=[];generation=0;history=[0];selectPreset('blank');draw();drawChart()}
function randomize(){setRunning(false);cells=makeGrid();ages=makeGrid();trails=makeGrid();for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(Math.random()<.27){cells[y][x]=1;ages[y][x]=1}generation=0;history=[population()];selectPreset('random');draw();drawChart()}
function place(pattern,ox,oy){pattern.forEach((line,y)=>[...line].forEach((v,x)=>{if(v==='1'&&y+oy>=0&&y+oy<rows&&x+ox>=0&&x+ox<cols){cells[y+oy][x+ox]=1;ages[y+oy][x+ox]=1}}))}
const patterns={glider:['010','001','111'],gun:['000000000000000000000000000000100000','000000000000000000000000000010100000','000000000000110000000000001100000011','000000000001000100000000000110000011','110000000010000010000000000110000000','110000000010001011000000000010100000','000000000010000010000000000000100000','000000000001000100000000000000000000','000000000000110000000000000000000000']};
function selectPreset(name){document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b.dataset.pattern===name))}
function loadPattern(name){setRunning(false);cells=makeGrid();ages=makeGrid();trails=makeGrid();generation=0;history=[0];if(name==='glider')place(patterns.glider,Math.floor(cols/2)-1,Math.floor(rows/2)-1);if(name==='gun')place(patterns.gun,2,Math.floor(rows/2)-4);if(name==='random'){randomize();return}selectPreset(name);history=[population()];draw();drawChart()}
function cellFromEvent(e){const r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height,gx=(px-(1-zoom)/2)/zoom,gy=(py-(1-zoom)/2)/zoom;return[Math.floor(gx*cols),Math.floor(gy*rows)]}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();drawing=true;canvas.setPointerCapture(e.pointerId);const[x,y]=cellFromEvent(e);if(x>=0&&x<cols&&y>=0&&y<rows){drawValue=!cells[y][x];cells[y][x]=drawValue?1:0;ages[y][x]=drawValue?1:0;trails[y][x]=0;effects.push({x,y,type:drawValue?'birth':'death',time:performance.now()});draw();scheduleEffects()}});
canvas.addEventListener('pointermove',e=>{if(!drawing)return;const[x,y]=cellFromEvent(e);if(x>=0&&x<cols&&y>=0&&y<rows&&cells[y][x]!==drawValue){cells[y][x]=drawValue?1:0;ages[y][x]=drawValue?1:0;trails[y][x]=0;effects.push({x,y,type:drawValue?'birth':'death',time:performance.now()});draw();scheduleEffects()}});canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false);
playBtn.onclick=()=>setRunning(!running);document.getElementById('stepBtn').onclick=()=>{setRunning(false);evolve()};document.getElementById('clearBtn').onclick=clear;document.getElementById('randomizeBtn').onclick=randomize;
speedRange.oninput=()=>{speedValue.textContent=`${speedRange.value} gen/s`;if(running)setRunning(true)};document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>loadPattern(b.dataset.pattern));document.getElementById('fitBtn').onclick=()=>{zoom=1;updateZoom();setSize()};document.getElementById('zoomOut').onclick=()=>{zoom=Math.max(.75,+(zoom-.25).toFixed(2));updateZoom();draw()};document.getElementById('zoomIn').onclick=()=>{zoom=Math.min(2,+(zoom+.25).toFixed(2));updateZoom();draw()};
document.querySelectorAll('.theme-btn').forEach(btn=>btn.onclick=()=>{document.body.dataset.theme=btn.dataset.theme;document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b===btn));draw();drawChart()});document.getElementById('trailToggle').onchange=e=>{trailEnabled=e.target.checked;draw()};
function updateZoom(){document.getElementById('zoomValue').textContent=`${Math.round(zoom*100)}%`}window.addEventListener('resize',setSize);document.addEventListener('keydown',e=>{if(e.target.matches('input'))return;if(e.code==='Space'){e.preventDefault();setRunning(!running)}if(e.key.toLowerCase()==='r')randomize();if(e.key.toLowerCase()==='c')clear()});gridReadout.textContent=`${cols} × ${rows}`;setSize();
