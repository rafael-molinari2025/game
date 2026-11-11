'use strict';
// =====================================================================
//  Desenho: mapa, unidades, efeitos, névoa de guerra, HUD e minimapa
// =====================================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const fogCanvas = document.createElement('canvas');
const fctx = fogCanvas.getContext('2d');
const mmCanvas = document.createElement('canvas');
const view = { w: 0, h: 0, dpr: 1, zoom: 1, mm: { x: 0, y: 0, s: 200 } };
const hudRects = [];
let TREES = [];

function resize() {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = Math.floor(view.w * view.dpr); canvas.height = Math.floor(view.h * view.dpr);
  canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
  fogCanvas.width = Math.ceil(view.w / 2); fogCanvas.height = Math.ceil(view.h / 2);
  view.zoom = clamp(Math.min(view.w / 1500, view.h / 850), 0.55, 1.1);
  const s = Math.round(clamp(Math.min(view.w, view.h) * 0.27, 140, 240));
  view.mm = { x: view.w - s - 12, y: view.h - s - 12, s };
  buildMinimapBase();
}

function screenToWorld(sx, sy) {
  return { x: sx / view.zoom + G.camera.x, y: sy / view.zoom + G.camera.y };
}

// ---------------------------------------------------------------- Cenário
function distToLanes(x, y) {
  let m = Infinity;
  for (const k in LANES) m = Math.min(m, laneProject(LANES[k], x, y).off);
  return m;
}
function genScenery() {
  const rng = mulberry32(1337);
  TREES = [];
  let tries = 0;
  while (TREES.length < 460 && tries < 30000) {
    tries++;
    const x = rng() * MAP, y = rng() * MAP;
    if (distToLanes(x, y) < 175) continue;
    if (Math.abs(x - y) / Math.SQRT2 < 150) continue;
    if (NEXUS_POS.some((p) => Math.hypot(p.x - x, p.y - y) < 720)) continue;
    if (CAMPS.some((c) => Math.hypot(c.x - x, c.y - y) < 190)) continue;
    TREES.push({ x, y, r: 22 + rng() * 26, s: rng() });
  }
  TREES.sort((a, b) => a.y - b.y);
}

function buildMinimapBase() {
  const s = view.mm.s;
  mmCanvas.width = s * view.dpr; mmCanvas.height = s * view.dpr;
  const c = mmCanvas.getContext('2d');
  c.setTransform((s * view.dpr) / MAP, 0, 0, (s * view.dpr) / MAP, 0, 0);
  c.fillStyle = '#2c4a2a'; c.fillRect(0, 0, MAP, MAP);
  c.strokeStyle = '#2b6a8a'; c.lineWidth = 240; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(MAP, MAP); c.stroke();
  c.fillStyle = '#1f3a1f';
  for (const t of TREES) { c.beginPath(); c.arc(t.x, t.y, t.r * 1.6, 0, TAU); c.fill(); }
  c.strokeStyle = '#a08c5c'; c.lineWidth = 120; c.lineJoin = 'round';
  for (const k in LANES) { const p = LANES[k].points; c.beginPath(); c.moveTo(p[0].x, p[0].y); for (const q of p) c.lineTo(q.x, q.y); c.stroke(); }
  for (let t = 0; t < 2; t++) {
    c.fillStyle = t ? 'rgba(255,90,90,0.35)' : 'rgba(74,163,255,0.35)';
    c.beginPath(); c.arc(NEXUS_POS[t].x, NEXUS_POS[t].y, 600, 0, TAU); c.fill();
  }
}

// ---------------------------------------------------------------- Mundo
function drawGround(g) {
  const z = view.zoom, cam = g.camera;
  const vx1 = cam.x + view.w / z, vy1 = cam.y + view.h / z;
  ctx.fillStyle = '#0d120d'; ctx.fillRect(cam.x, cam.y, vx1 - cam.x, vy1 - cam.y);
  ctx.fillStyle = '#365c33'; ctx.fillRect(0, 0, MAP, MAP);

  // Selva (tons mais escuros)
  ctx.fillStyle = 'rgba(20,45,22,0.45)';
  ctx.beginPath(); ctx.moveTo(500, 500); ctx.lineTo(500, 2700); ctx.lineTo(2700, 500); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3100, 3100); ctx.lineTo(3100, 900); ctx.lineTo(900, 3100); ctx.closePath(); ctx.fill();

  // Rio
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#24546e'; ctx.lineWidth = 260;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(MAP, MAP); ctx.stroke();
  ctx.strokeStyle = '#2f6f8f'; ctx.lineWidth = 200;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(MAP, MAP); ctx.stroke();
  const wave = (g.time * 30) % 120;
  ctx.strokeStyle = 'rgba(160,220,255,0.12)'; ctx.lineWidth = 4; ctx.setLineDash([30, 90]); ctx.lineDashOffset = -wave;
  ctx.beginPath(); ctx.moveTo(-40, 40); ctx.lineTo(MAP - 40, MAP + 40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, -40); ctx.lineTo(MAP + 40, MAP - 40); ctx.stroke();
  ctx.setLineDash([]);

  // Rotas
  ctx.lineJoin = 'round';
  for (const k in LANES) {
    const p = LANES[k].points;
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (const q of p) ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = '#5e5236'; ctx.lineWidth = 180; ctx.stroke();
    ctx.strokeStyle = '#8c7a50'; ctx.lineWidth = 150; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,200,0.05)'; ctx.lineWidth = 60; ctx.stroke();
  }

  // Bases
  for (let t = 0; t < 2; t++) {
    const p = NEXUS_POS[t];
    const gr = ctx.createRadialGradient(p.x, p.y, 100, p.x, p.y, 640);
    gr.addColorStop(0, t ? '#5a3a3d' : '#34465e'); gr.addColorStop(0.8, t ? '#4a3a3a' : '#363f4d'); gr.addColorStop(1, 'rgba(60,60,60,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, 640, 0, TAU); ctx.fill();
    ctx.strokeStyle = t ? 'rgba(255,90,90,0.35)' : 'rgba(74,163,255,0.35)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 560, 0, TAU); ctx.stroke();
    const f = FOUNTAIN[t];
    ctx.fillStyle = t ? 'rgba(255,90,90,0.18)' : 'rgba(74,163,255,0.18)';
    ctx.beginPath(); ctx.arc(f.x, f.y, FOUNTAIN_R, 0, TAU); ctx.fill();
    ctx.strokeStyle = TEAM_COLORS[t]; ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.arc(f.x, f.y, FOUNTAIN_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    const pulse = 0.5 + 0.5 * Math.sin(g.time * 3);
    ctx.fillStyle = TEAM_COLORS[t]; ctx.globalAlpha = 0.5 + pulse * 0.3;
    ctx.beginPath(); ctx.arc(f.x, f.y, 40, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }

  // Acampamentos
  for (const c of CAMPS) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.type === 'lobo' ? 80 : 130, 0, TAU); ctx.fill();
  }
}

function drawTrees(g) {
  const z = view.zoom, cam = g.camera;
  const x0 = cam.x - 60, y0 = cam.y - 60, x1 = cam.x + view.w / z + 60, y1 = cam.y + view.h / z + 60;
  for (const t of TREES) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(t.x + 8, t.y + t.r * 0.5, t.r, t.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = t.s > 0.5 ? '#1e3d1f' : '#234723';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = t.s > 0.5 ? '#2b5a2c' : '#2f6130';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, TAU); ctx.fill();
  }
}

function inView(g, x, y, pad) {
  const z = view.zoom, c = g.camera;
  return x > c.x - pad && y > c.y - pad && x < c.x + view.w / z + pad && y < c.y + view.h / z + pad;
}

function drawEffectsGround(g) {
  for (const e of g.effects) {
    if (e.kind === 'zone') {
      const a = 0.18 + 0.08 * Math.sin(e.t * 10);
      ctx.fillStyle = hexA(e.color, a); ctx.strokeStyle = hexA(e.color, 0.8); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (e.kind === 'delayed') {
      const k = clamp(e.t / e.delay, 0, 1);
      const enemy = e.team !== G.player.team;
      ctx.strokeStyle = hexA(enemy ? '#ff6b6b' : e.color, 0.9); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = hexA(enemy ? '#ff6b6b' : e.color, 0.25);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * k, 0, TAU); ctx.fill();
    }
  }
}

function drawFx(g) {
  for (const f of g.fx) {
    const k = f.t / f.dur;
    if (f.kind === 'ring') {
      ctx.strokeStyle = hexA(f.color, 1 - k); ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, TAU); ctx.stroke();
    } else if (f.kind === 'cone') {
      ctx.fillStyle = hexA(f.color, 0.5 * (1 - k));
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.r, f.a - f.spread, f.a + f.spread); ctx.closePath(); ctx.fill();
    } else if (f.kind === 'laser') {
      ctx.strokeStyle = hexA(f.color, 1 - k); ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
    }
  }
  for (const m of g.markers) {
    const k = m.t / 0.5;
    ctx.strokeStyle = hexA(m.color, 1 - k); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y, 18 * (1 - k) + 4, 0, TAU); ctx.stroke();
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
}

function drawUnit(g, u) {
  const p = G.player;
  if (u.kind === 'tower') return drawTower(g, u);
  if (u.kind === 'nexus') return drawNexus(g, u);
  if (u.dead) return;
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.55, u.r, u.r * 0.45, 0, 0, TAU); ctx.fill();

  if (u.kind === 'hero') {
    if (u.recall) {
      const k = 1 - u.recall.t / u.recall.dur;
      ctx.strokeStyle = 'rgba(116,192,252,0.8)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 16, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    }
    if (u === p) {
      ctx.strokeStyle = 'rgba(105,219,124,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.6, u.r + 8, (u.r + 8) * 0.45, 0, 0, TAU); ctx.stroke();
    }
    // Arma
    const sw = u.swingT > 0 ? Math.sin((u.swingT / 0.2) * Math.PI) * 1.2 : 0;
    const a = u.facing + sw - 0.3;
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(a);
    if (u.def.melee) {
      ctx.fillStyle = '#dee2e6'; ctx.fillRect(u.r - 4, -3, u.r * 1.4, 6);
      ctx.fillStyle = '#868e96'; ctx.fillRect(u.r - 8, -7, 6, 14);
    } else {
      ctx.strokeStyle = u.def.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(u.r - 2, 0, 14, -1.2, 1.2); ctx.stroke();
    }
    ctx.restore();
    // Corpo
    const gr = ctx.createRadialGradient(u.x - 8, u.y - 8, 4, u.x, u.y, u.r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, u.def.color); gr.addColorStop(1, shade(u.def.color, -0.35));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = TEAM_COLORS[u.team]; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.def.name[0], u.x, u.y + 1);
  } else if (u.kind === 'minion') {
    const col = TEAM_COLORS[u.team];
    ctx.fillStyle = shade(col, -0.15); ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = 2;
    ctx.beginPath();
    if (u.mtype === 'melee') ctx.arc(u.x, u.y, u.r, 0, TAU);
    else if (u.mtype === 'ranged') { ctx.moveTo(u.x, u.y - u.r - 2); ctx.lineTo(u.x + u.r, u.y); ctx.lineTo(u.x, u.y + u.r + 2); ctx.lineTo(u.x - u.r, u.y); ctx.closePath(); }
    else ctx.rect(u.x - u.r, u.y - u.r, u.r * 2, u.r * 2);
    ctx.fill(); ctx.stroke();
    if (u.swingT > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 4, u.facing - 0.6, u.facing + 0.6); ctx.stroke(); }
  } else if (u.kind === 'monster') {
    const col = u.mdef.color;
    ctx.fillStyle = col; ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = u.target ? '#ff6b6b' : '#ffe066';
    const ex = Math.cos(u.facing) * u.r * 0.35, ey = Math.sin(u.facing) * u.r * 0.35;
    ctx.beginPath(); ctx.arc(u.x + ex - u.r * 0.25, u.y + ey - u.r * 0.15, u.r * 0.12, 0, TAU); ctx.arc(u.x + ex + u.r * 0.25, u.y + ey - u.r * 0.15, u.r * 0.12, 0, TAU); ctx.fill();
  }

  // Estados
  if (shieldOf(u) > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 6, 0, TAU); ctx.stroke(); }
  if (hasBuff(u, 'reduce')) { ctx.strokeStyle = 'rgba(206,212,218,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 3, 0, TAU); ctx.stroke(); }
  if (hasBuff(u, 'slow')) { ctx.strokeStyle = 'rgba(116,192,252,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  if (hasBuff(u, 'dmgamp')) { ctx.strokeStyle = 'rgba(63,174,140,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 9, 0, TAU); ctx.stroke(); }
  if (isStunned(u)) {
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
      const a = G.time * 5 + (i * TAU) / 3;
      ctx.beginPath(); ctx.arc(u.x + Math.cos(a) * u.r * 0.8, u.y - u.r - 8 + Math.sin(a) * 5, 3, 0, TAU); ctx.fill();
    }
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; gg *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

function drawTower(g, u) {
  const col = TEAM_COLORS[u.team];
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(u.x, u.y + 22, u.r + 6, u.r * 0.5, 0, 0, TAU); ctx.fill();
  if (u.dead) {
    ctx.fillStyle = '#4a4d55';
    for (let i = 0; i < 6; i++) { const a = i * 1.1; ctx.beginPath(); ctx.arc(u.x + Math.cos(a) * 18, u.y + Math.sin(a) * 12, 10, 0, TAU); ctx.fill(); }
    return;
  }
  const p = G.player;
  if (u.team !== p.team && !p.dead && dist(u, p) < u.range + 300) {
    const aimed = u.target === p;
    ctx.strokeStyle = aimed ? 'rgba(255,60,60,0.85)' : 'rgba(255,120,120,0.35)'; ctx.lineWidth = aimed ? 4 : 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, u.range, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = '#5c616b'; ctx.strokeStyle = '#2b2e33'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#767c87';
  ctx.beginPath(); ctx.arc(u.x, u.y - 8, u.r * 0.7, 0, TAU); ctx.fill();
  const bob = Math.sin(G.time * 2 + u.id) * 4;
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(u.x, u.y - 50 + bob); ctx.lineTo(u.x + 12, u.y - 28 + bob); ctx.lineTo(u.x, u.y - 6 + bob); ctx.lineTo(u.x - 12, u.y - 28 + bob); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  if (!u.vuln) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y - 10, u.r + 8, 0, TAU); ctx.stroke(); }
  if (u.target && !u.target.dead) {
    ctx.strokeStyle = hexA(col, 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(u.x, u.y - 30); ctx.lineTo(u.target.x, u.target.y); ctx.stroke();
  }
}

function drawNexus(g, u) {
  const col = TEAM_COLORS[u.team];
  if (u.dead) { ctx.fillStyle = '#3a3d44'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill(); return; }
  ctx.fillStyle = '#4b505a'; ctx.strokeStyle = '#25282d'; ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6 + Math.PI / 6; ctx.lineTo(u.x + Math.cos(a) * u.r, u.y + Math.sin(a) * u.r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const pulse = 0.6 + 0.4 * Math.sin(G.time * 2.5);
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 30 * pulse;
  ctx.beginPath(); ctx.arc(u.x, u.y - 10, 26 + pulse * 4, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(u.x - 7, u.y - 18, 8, 0, TAU); ctx.fill();
  if (!u.vuln) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 12, 0, TAU); ctx.stroke(); }
}

function drawProjectiles(g) {
  for (const p of g.projectiles) {
    ctx.fillStyle = p.color;
    if (p.big) { ctx.shadowColor = p.color; ctx.shadowBlur = 15; }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const p of g.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawBars(g, u) {
  if (u.dead) return;
  const p = G.player;
  let w, h, yOff;
  if (u.kind === 'hero') { w = 76; h = 9; yOff = u.r + 22; }
  else if (u.kind === 'tower') { w = 90; h = 8; yOff = 66; }
  else if (u.kind === 'nexus') { w = 140; h = 10; yOff = u.r + 26; }
  else if (u.kind === 'monster') { w = u.r * 2.2; h = 6; yOff = u.r + 12; }
  else { if (u.hp >= u.maxHp) return; w = 32; h = 4; yOff = u.r + 8; }
  const x = u.x - w / 2, y = u.y - yOff;
  const col = u.team === NEUTRAL ? '#ffa94d' : u === p ? '#51cf66' : u.team === p.team ? '#4aa3ff' : '#ff4d4d';
  const sh = shieldOf(u);
  const total = Math.max(u.maxHp, u.hp + sh);
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col; ctx.fillRect(x, y, (w * u.hp) / total, h);
  if (sh > 0) { ctx.fillStyle = '#f1f3f5'; ctx.fillRect(x + (w * u.hp) / total, y, (w * sh) / total, h); }
  if (u.kind === 'hero') {
    // Divisões a cada 100 de vida
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let v = 100; v < total; v += 100) ctx.fillRect(x + (w * v) / total, y, 1, v % 1000 === 0 ? h : h * 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 1, y + h + 1, w + 2, 5);
    ctx.fillStyle = '#4dabf7'; ctx.fillRect(x, y + h + 2, (w * u.mana) / Math.max(1, u.maxMana), 3);
    ctx.fillStyle = '#1a1b1e'; ctx.fillRect(x - 20, y - 1, 18, h + 7);
    ctx.fillStyle = '#ffd43b'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.level, x - 11, y + 5);
    ctx.fillStyle = u === p ? '#d3f9d8' : '#fff'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(u.isPlayer ? u.def.name : u.name + ' · ' + u.def.name, u.x, y - 9);
  } else if (u.kind === 'monster') {
    ctx.fillStyle = '#fff'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (u.mtype !== 'lobo') ctx.fillText(u.name, u.x, y - 8);
  }
}

function drawTexts(g) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of g.texts) {
    const k = t.t / t.dur;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = (t.big ? 'bold 22px' : 'bold 15px') + ' system-ui, sans-serif';
    ctx.fillStyle = '#000'; ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawFog(g) {
  const fw = fogCanvas.width, fh = fogCanvas.height, k = fw / view.w;
  const z = view.zoom, cam = g.camera, team = g.player.team;
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, fw, fh);
  fctx.fillStyle = 'rgba(6,10,22,0.6)'; fctx.fillRect(0, 0, fw, fh);
  fctx.globalCompositeOperation = 'destination-out';
  for (const u of g.units) {
    if (u.dead || u.team !== team) continue;
    const r = u.vision * z * k;
    const sx = (u.x - cam.x) * z * k, sy = (u.y - cam.y) * z * k;
    if (sx < -r || sy < -r || sx > fw + r || sy > fh + r) continue;
    const gr = fctx.createRadialGradient(sx, sy, r * 0.7, sx, sy, r);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = gr; fctx.beginPath(); fctx.arc(sx, sy, r, 0, TAU); fctx.fill();
  }
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.drawImage(fogCanvas, 0, 0, view.w, view.h);
}

function renderWorld(g) {
  const z = view.zoom, dpr = view.dpr, cam = g.camera;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * dpr * z, -cam.y * dpr * z);
  drawGround(g);
  drawEffectsGround(g);
  const team = g.player.team;
  const list = g.units.filter((u) => (isStructure(u) || !u.dead) && (u.team === team || u.visible[team]) && inView(g, u.x, u.y, 120));
  list.sort((a, b) => a.y - b.y);
  for (const u of list) drawUnit(g, u);
  drawTrees(g);
  drawProjectiles(g);
  drawFx(g);
  drawFog(g);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * dpr * z, -cam.y * dpr * z);
  for (const u of list) drawBars(g, u);
  drawTexts(g);
  // Indicador de alcance de ataque do jogador (segurando A)
  if (input.amArmed && !g.player.dead) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.player.x, g.player.y, g.player.range + g.player.r, 0, TAU); ctx.stroke();
  }
  // Indicador de alcance de habilidade ao passar o mouse na HUD
  if (hoverAbility != null && !g.player.dead) {
    const ab = hoverAbility >= 0 ? g.player.def.abilities[hoverAbility] : null;
    if (ab && ab.range) {
      ctx.strokeStyle = hexA(ab.color, 0.6); ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(g.player.x, g.player.y, ab.range, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

// ---------------------------------------------------------------- HUD
let hoverAbility = null;

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawSlot(x, y, s, color, label, key, cd, cdMax, disabled, extra) {
  roundRect(x, y, s, s, 6);
  const gr = ctx.createLinearGradient(x, y, x + s, y + s);
  gr.addColorStop(0, shade(color, 0.25)); gr.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = '#c9a85b'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `bold ${Math.round(s * 0.4)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + s / 2, y + s / 2 + 1);
  if (disabled) { roundRect(x, y, s, s, 6); ctx.fillStyle = 'rgba(10,20,40,0.6)'; ctx.fill(); }
  if (cd > 0) {
    ctx.save(); roundRect(x, y, s, s, 6); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.moveTo(x + s / 2, y + s / 2);
    ctx.arc(x + s / 2, y + s / 2, s, -Math.PI / 2, -Math.PI / 2 + TAU * (cd / cdMax)); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.34)}px system-ui, sans-serif`;
    ctx.fillText(cd >= 1 ? Math.ceil(cd) : cd.toFixed(1), x + s / 2, y + s / 2 + 1);
  }
  if (key) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x, y + s - 14, 16, 14);
    ctx.fillStyle = '#ffe8a3'; ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(key, x + 8, y + s - 6.5);
  }
  if (extra) {
    ctx.fillStyle = '#74c0fc'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(extra, x + s - 3, y + 8); ctx.textAlign = 'center';
  }
}

function drawHUD(g) {
  const { w, h, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hudRects.length = 0;
  const p = g.player;

  // Barra superior: placar e tempo
  const tw = 230, tx = (w - tw) / 2;
  roundRect(tx, 6, tw, 38, 8); ctx.fillStyle = 'rgba(12,14,20,0.82)'; ctx.fill();
  ctx.strokeStyle = 'rgba(201,168,91,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = TEAM_COLORS[0]; ctx.fillText(g.kills[0], tx + 40, 26);
  ctx.fillStyle = TEAM_COLORS[1]; ctx.fillText(g.kills[1], tx + tw - 40, 26);
  ctx.fillStyle = '#e9ecef'; ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(fmtTime(g.time), tx + tw / 2, 26);

  // Canto superior esquerdo: estatísticas pessoais
  roundRect(8, 6, 210, 38, 8); ctx.fillStyle = 'rgba(12,14,20,0.82)'; ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = '#e9ecef'; ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`A/M/A ${p.kills}/${p.deaths}/${p.assists}`, 18, 26);
  ctx.fillStyle = '#adb5bd'; ctx.fillText(`Tropas ${p.cs}`, 140, 26);

  // Feed de eventos (direita)
  ctx.textAlign = 'right'; ctx.font = '13px system-ui, sans-serif';
  let fy = 60;
  for (const f of g.feed) {
    const age = g.time - f.t;
    if (age > 12) continue;
    ctx.globalAlpha = clamp(1 - (age - 9) / 3, 0, 1);
    const tw2 = ctx.measureText(f.text).width;
    ctx.fillStyle = 'rgba(12,14,20,0.7)'; ctx.fillRect(w - tw2 - 22, fy - 11, tw2 + 14, 22);
    ctx.fillStyle = f.color; ctx.fillText(f.text, w - 15, fy);
    fy += 26;
  }
  ctx.globalAlpha = 1;

  // Anúncio central
  if (g.announce) {
    const a = g.announce, k = a.t / a.dur;
    ctx.globalAlpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px Georgia, serif'; ctx.fillStyle = '#000'; ctx.fillText(a.text, w / 2 + 2, h * 0.2 + 2);
    ctx.fillStyle = a.color; ctx.fillText(a.text, w / 2, h * 0.2);
    if (a.sub) { ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = '#e9ecef'; ctx.fillText(a.sub, w / 2, h * 0.2 + 32); }
    ctx.globalAlpha = 1;
  }

  // Painel inferior
  const s = clamp(Math.min((w - view.mm.s - 40) / 820, h / 700), 0.55, 1.15);
  const pw = 600, ph = 118;
  const px = Math.max(10 + 130 * s, (w - view.mm.s - 24 - pw * s) / 2 + 60 * s), py = h - ph * s - 10;
  ctx.save(); ctx.translate(px, py); ctx.scale(s, s);
  const reg = (x, y, ww, hh, data) => hudRects.push(Object.assign({ x: px + x * s, y: py + y * s, w: ww * s, h: hh * s }, data));
  roundRect(0, 0, pw, ph, 12); ctx.fillStyle = 'rgba(14,16,24,0.9)'; ctx.fill();
  ctx.strokeStyle = 'rgba(201,168,91,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  reg(0, 0, pw, ph, { type: 'panel' });

  // Retrato
  ctx.save();
  ctx.beginPath(); ctx.arc(55, 52, 38, 0, TAU); ctx.fillStyle = p.def.color; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = TEAM_COLORS[p.team]; ctx.stroke();
  ctx.fillStyle = '#111'; ctx.font = 'bold 34px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.def.name[0], 55, 54);
  if (p.dead) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.arc(55, 52, 38, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.fillText(Math.ceil(p.respawn), 55, 53); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(55, 96, 14, 0, TAU); ctx.fillStyle = '#1a1b1e'; ctx.fill(); ctx.strokeStyle = '#c9a85b'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd43b'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.level, 55, 97);
  // Barra de XP ao redor do retrato
  if (p.level < MAX_LEVEL) {
    ctx.strokeStyle = '#be4bdb'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(55, 52, 43, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * (p.xp / xpNeed(p.level))); ctx.stroke();
  }

  // Habilidades
  const abs = p.def.abilities;
  for (let i = 0; i < 4; i++) {
    const ab = abs[i], x = 110 + i * 62, y = 10;
    const locked = i === 3 && p.level < 6;
    const noMana = p.mana < ab.cost;
    drawSlot(x, y, 54, ab.color, ab.name[0], ab.key, Math.max(0, p.cds[i]), ab.cd * (1 - p.cdr), locked || noMana || p.dead, ab.cost ? String(ab.cost) : '');
    if (locked) { ctx.fillStyle = '#ced4da'; ctx.font = 'bold 11px system-ui'; ctx.fillText('Nv 6', x + 27, y + 27); }
    reg(x, y, 54, 54, { type: 'ability', i });
  }
  for (let i = 0; i < 2; i++) {
    const sm = SUMMONERS[i], x = 362 + i * 44, y = 10;
    drawSlot(x, y, 38, sm.color, sm.name[0], sm.key, Math.max(0, p.sumCds[i]), sm.cd, p.dead, '');
    reg(x, y, 38, 38, { type: 'summoner', i });
  }
  // Atributos curtos sob feitiços
  ctx.textAlign = 'left'; ctx.font = '11px system-ui'; ctx.fillStyle = '#adb5bd';
  ctx.fillText('B: Voltar', 364, 58);

  // Vida e mana
  const bx = 110, bw = 332;
  ctx.fillStyle = '#000'; ctx.fillRect(bx, 72, bw, 18);
  ctx.fillStyle = '#2f9e44'; ctx.fillRect(bx, 72, (bw * p.hp) / p.maxHp, 18);
  const sh = shieldOf(p);
  if (sh > 0) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(bx + (bw * p.hp) / p.maxHp, 72, Math.min(bw - (bw * p.hp) / p.maxHp, (bw * sh) / p.maxHp), 18); }
  ctx.fillStyle = '#000'; ctx.fillRect(bx, 93, bw, 12);
  ctx.fillStyle = '#1c7ed6'; ctx.fillRect(bx, 93, (bw * p.mana) / Math.max(1, p.maxMana), 12);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`${fmtN(p.hp)} / ${fmtN(p.maxHp)}`, bx + bw / 2, 81.5);
  ctx.font = 'bold 10px system-ui'; ctx.fillText(`${fmtN(p.mana)} / ${fmtN(p.maxMana)}`, bx + bw / 2, 99.5);

  // Itens
  for (let i = 0; i < 6; i++) {
    const x = 456 + (i % 3) * 44, y = 10 + Math.floor(i / 3) * 44;
    const id = p.items[i];
    if (id) { const it = ITEM_MAP[id]; drawSlot(x, y, 40, it.color, it.abbr, String(i + 1), 0, 1, false, ''); }
    else { roundRect(x, y, 40, 40, 6); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(201,168,91,0.35)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    reg(x, y, 40, 40, { type: 'item', i });
  }
  ctx.beginPath(); ctx.arc(462, 106, 6, 0, TAU); ctx.fillStyle = '#fcc419'; ctx.fill();
  ctx.fillStyle = '#ffd43b'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(fmtN(p.gold), 473, 107);
  roundRect(530, 97, 56, 18, 4); ctx.fillStyle = nearShop(p) ? '#c9a85b' : '#495057'; ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('LOJA (P)', 558, 106.5);
  reg(530, 97, 56, 18, { type: 'shop' });
  ctx.restore();

  // Caixa de atributos (à esquerda do painel)
  {
    const bw2 = 120 * s, bh2 = 118 * s, sx = px - bw2 - 8, sy = py;
    roundRect(sx, sy, bw2, bh2, 10); ctx.fillStyle = 'rgba(14,16,24,0.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(201,168,91,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    const rows = [['Dano', fmtN(getAD(p)), '#ffa94d'], ['Poder', fmtN(p.ap), '#b197fc'], ['Armadura', fmtN(p.armor), '#ffd43b'], ['Res. Mág.', fmtN(p.mr), '#74c0fc'], ['Vel. Atq.', getAS(p).toFixed(2), '#ffe066'], ['Veloc.', fmtN(getMS(p)), '#e9ecef']];
    ctx.font = `${Math.round(12 * s)}px system-ui`; ctx.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const yy = sy + 12 * s + i * 17.5 * s + 4 * s;
      ctx.textAlign = 'left'; ctx.fillStyle = '#adb5bd'; ctx.fillText(r[0], sx + 9 * s, yy);
      ctx.textAlign = 'right'; ctx.fillStyle = r[2]; ctx.fillText(r[1], sx + bw2 - 9 * s, yy);
    });
  }

  // Barra de retorno à base
  if (p.recall) {
    const k = 1 - p.recall.t / p.recall.dur, bw3 = 220;
    const x = (w - bw3) / 2, y = py - 40;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 2, y - 2, bw3 + 4, 18);
    ctx.fillStyle = '#4dabf7'; ctx.fillRect(x, y, bw3 * k, 14);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Voltando à base...', w / 2, y + 7.5);
  }

  // Tela de morte
  if (p.dead && !g.over) {
    ctx.fillStyle = 'rgba(40,40,50,0.35)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.font = 'bold 28px Georgia, serif'; ctx.fillStyle = '#ff8787';
    ctx.fillText('Renascendo em ' + Math.ceil(p.respawn) + 's', w / 2, h * 0.42);
    ctx.font = '14px system-ui'; ctx.fillStyle = '#dee2e6';
    ctx.fillText('Aproveite para comprar itens na loja (P)', w / 2, h * 0.42 + 30);
  }

  drawMinimap(g);
  drawTooltip(g);
}

function drawMinimap(g) {
  const { x, y, s } = view.mm, k = s / MAP;
  const team = g.player.team;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
  ctx.drawImage(mmCanvas, x, y, s, s);
  ctx.strokeStyle = '#c9a85b'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, s + 4, s + 4);
  for (const u of g.units) {
    const ux = x + u.x * k, uy = y + u.y * k;
    if (u.kind === 'tower') {
      ctx.fillStyle = u.dead ? '#495057' : TEAM_COLORS[u.team];
      ctx.fillRect(ux - 4, uy - 4, 8, 8); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(ux - 4, uy - 4, 8, 8);
    } else if (u.kind === 'nexus') {
      ctx.fillStyle = TEAM_COLORS[u.team]; ctx.beginPath(); ctx.arc(ux, uy, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
    } else if (u.dead) continue;
    else if (u.kind === 'minion') {
      if (u.team !== team && !u.visible[team]) continue;
      ctx.fillStyle = TEAM_COLORS[u.team]; ctx.fillRect(ux - 1.5, uy - 1.5, 3, 3);
    } else if (u.kind === 'monster') {
      if (!u.visible[team]) { ctx.fillStyle = 'rgba(192,140,255,0.45)'; } else ctx.fillStyle = '#c08cff';
      ctx.beginPath(); ctx.arc(ux, uy, u.mtype === 'lobo' ? 3 : 5, 0, TAU); ctx.fill();
    }
  }
  for (const hh of g.heroes) {
    if (hh.dead || (hh.team !== team && !hh.visible[team])) continue;
    const ux = x + hh.x * k, uy = y + hh.y * k;
    ctx.beginPath(); ctx.arc(ux, uy, 6, 0, TAU); ctx.fillStyle = hh.def.color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = hh.isPlayer ? '#fff' : TEAM_COLORS[hh.team]; ctx.stroke();
  }
  // Retângulo da câmera
  const c = g.camera;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + c.x * k, y + c.y * k, (view.w / view.zoom) * k, (view.h / view.zoom) * k);
}

function drawTooltip(g) {
  hoverAbility = null;
  const r = hudRects.find((q) => q.type !== 'panel' && input.mx >= q.x && input.mx <= q.x + q.w && input.my >= q.y && input.my <= q.y + q.h);
  if (!r) return;
  const p = g.player;
  let title = '', body = '', foot = '';
  if (r.type === 'ability') {
    const ab = p.def.abilities[r.i]; hoverAbility = r.i;
    title = `[${ab.key}] ${ab.name}`; body = ab.desc(p);
    foot = `Recarga: ${(ab.cd * (1 - p.cdr)).toFixed(1)}s · Mana: ${ab.cost}` + (r.i === 3 ? ' · Libera no nível 6' : '');
  } else if (r.type === 'summoner') {
    const sm = SUMMONERS[r.i]; title = `[${sm.key}] ${sm.name}`; body = sm.desc(p); foot = `Recarga: ${sm.cd}s`;
  } else if (r.type === 'item') {
    const id = p.items[r.i]; if (!id) return;
    const it = ITEM_MAP[id]; title = it.name; body = itemStatText(it); foot = 'Valor de venda: ' + Math.floor(it.cost * 0.6);
  } else if (r.type === 'shop') { title = 'Loja'; body = 'Abre a loja de itens. Você só pode comprar na sua base ou enquanto estiver morto.'; }
  else return;
  const w = 300;
  ctx.font = '13px system-ui';
  const lines = wrapText(body, w - 20);
  const hh = 34 + lines.length * 17 + (foot ? 20 : 0);
  const x = clamp(r.x + r.w / 2 - w / 2, 8, view.w - w - 8), y = r.y - hh - 10;
  roundRect(x, y, w, hh, 8); ctx.fillStyle = 'rgba(10,12,18,0.95)'; ctx.fill(); ctx.strokeStyle = '#c9a85b'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe8a3'; ctx.font = 'bold 14px system-ui'; ctx.fillText(title, x + 10, y + 16);
  ctx.fillStyle = '#dee2e6'; ctx.font = '13px system-ui';
  lines.forEach((l, i) => ctx.fillText(l, x + 10, y + 36 + i * 17));
  if (foot) { ctx.fillStyle = '#74c0fc'; ctx.font = '12px system-ui'; ctx.fillText(foot, x + 10, y + hh - 13); }
}

function wrapText(text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function render() {
  if (!G) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, view.w, view.h);
    return;
  }
  renderWorld(G);
  drawHUD(G);
}
