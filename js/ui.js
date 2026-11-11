'use strict';
// =====================================================================
//  Entrada (mouse/teclado), câmera, menus, loja e placar
// =====================================================================

const input = { mx: 0, my: 0, rDown: false, lDownMM: false, amArmed: false, space: false, lastRMove: 0, keys: {} };
const $ = (id) => document.getElementById(id);
const menuState = { heroId: 'kael', teamSize: 5, difficulty: 'normal' };
let toastTimer = 0;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1300);
}

function hudHit(x, y) {
  return hudRects.find((q) => q.type !== 'panel' && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h)
    || hudRects.find((q) => q.type === 'panel' && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
}
function minimapHit(x, y) {
  const m = view.mm;
  if (x < m.x || y < m.y || x > m.x + m.s || y > m.y + m.s) return null;
  return { x: ((x - m.x) / m.s) * MAP, y: ((y - m.y) / m.s) * MAP };
}
function pickEnemyAt(wx, wy) {
  const team = G.player.team;
  let best = null, bd = Infinity;
  for (const u of G.units) {
    if (u.dead || u.team === team || !u.visible[team]) continue;
    if (isStructure(u) && !u.vuln) continue;
    const d = Math.hypot(u.x - wx, u.y - wy) - u.r - 14 - (u.kind === 'hero' ? 10 : 0);
    if (d < 0 && d < bd) { bd = d; best = u; }
  }
  return best;
}
function gameActive() { return G && !G.paused && !G.over; }

function rightClickWorld() {
  const p = G.player;
  if (p.dead) return;
  const w = screenToWorld(input.mx, input.my);
  const e = pickEnemyAt(w.x, w.y);
  if (e) { issueAttack(p, e); G.markers.push({ x: e.x, y: e.y, t: 0, color: '#ff6b6b' }); }
  else { issueMove(p, w.x, w.y); G.markers.push({ x: w.x, y: w.y, t: 0, color: '#69db7c' }); }
}

function setupInput() {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousemove', (e) => {
    input.mx = e.clientX; input.my = e.clientY;
    if (!gameActive()) return;
    if (input.lDownMM) { const mm = minimapHit(e.clientX, e.clientY); if (mm) centerCameraOn(mm.x, mm.y); }
    if (input.rDown && !G.player.target && performance.now() - input.lastRMove > 100 && !hudHit(e.clientX, e.clientY)) {
      input.lastRMove = performance.now();
      const mm = minimapHit(e.clientX, e.clientY);
      if (!mm) { const w = screenToWorld(input.mx, input.my); issueMove(G.player, w.x, w.y); }
    }
    const w = screenToWorld(input.mx, input.my);
    canvas.style.cursor = pickEnemyAt(w.x, w.y) ? 'crosshair' : 'default';
  });
  canvas.addEventListener('mousedown', (e) => {
    input.mx = e.clientX; input.my = e.clientY;
    if (!gameActive()) return;
    const mm = minimapHit(e.clientX, e.clientY);
    if (e.button === 2) {
      input.rDown = true;
      if (mm) { issueMove(G.player, mm.x, mm.y); G.markers.push({ x: mm.x, y: mm.y, t: 0, color: '#69db7c' }); return; }
      if (hudHit(e.clientX, e.clientY)) return;
      input.amArmed = false;
      rightClickWorld();
    } else if (e.button === 0) {
      if (mm) { G.camLocked = false; input.lDownMM = true; centerCameraOn(mm.x, mm.y); return; }
      const hr = hudHit(e.clientX, e.clientY);
      if (hr) { onHudClick(hr); return; }
      if (input.amArmed) {
        input.amArmed = false;
        const w = screenToWorld(input.mx, input.my);
        const t = pickEnemyAt(w.x, w.y);
        if (t) issueAttack(G.player, t); else issueMove(G.player, w.x, w.y, true);
        G.markers.push({ x: w.x, y: w.y, t: 0, color: '#ff922b' });
      }
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) input.rDown = false;
    if (e.button === 0) input.lDownMM = false;
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') { $('score').classList.add('hidden'); e.preventDefault(); }
    if (e.code === 'Space') input.space = false;
    input.keys[e.code] = false;
  });
  window.addEventListener('blur', () => { input.rDown = false; input.space = false; input.keys = {}; });
}

function onHudClick(r) {
  const p = G.player;
  if (r.type === 'item') {
    const id = p.items[r.i];
    if (id && ITEM_MAP[id].consumable) useItem(p, r.i);
  } else if (r.type === 'shop') toggleShop();
}

function onKeyDown(e) {
  if (!G) return;
  if (e.code === 'Tab') { e.preventDefault(); if (!G.over) { renderScoreboard(); $('score').classList.remove('hidden'); } return; }
  if (e.code === 'Escape') {
    if (!$('shop').classList.contains('hidden')) { toggleShop(false); return; }
    if (!G.over) togglePause();
    return;
  }
  if (e.code === 'KeyP') { if (!G.over) toggleShop(); return; }
  if (!gameActive() || e.repeat && e.code !== 'Space') return;
  input.keys[e.code] = true;
  const p = G.player;
  const w = screenToWorld(input.mx, input.my);
  const abil = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 }[e.code];
  if (abil !== undefined) {
    if (p.dead) return;
    const ab = p.def.abilities[abil];
    if (abil === 3 && p.level < 6) toast('A habilidade suprema libera no nível 6');
    else if (p.cds[abil] > 0) toast(ab.name + ' está em recarga');
    else if (p.mana < ab.cost) toast('Mana insuficiente');
    else if (isStunned(p)) toast('Você está atordoado!');
    else castAbility(p, abil, w.x, w.y);
    return;
  }
  switch (e.code) {
    case 'KeyD': case 'KeyF': {
      const i = e.code === 'KeyD' ? 0 : 1;
      if (p.sumCds[i] > 0) toast(SUMMONERS[i].name + ' está em recarga');
      else castSummoner(p, i, w.x, w.y);
      break;
    }
    case 'KeyB': if (!p.dead) startRecall(p); break;
    case 'KeyS': issueStop(p); break;
    case 'KeyA': input.amArmed = true; break;
    case 'KeyY': G.camLocked = !G.camLocked; toast(G.camLocked ? 'Câmera travada no herói' : 'Câmera livre (mova o mouse até as bordas)'); break;
    case 'Space': input.space = true; e.preventDefault(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6': {
      const idx = Number(e.code.slice(5)) - 1;
      if (!useItem(p, idx) && p.items[idx]) toast('Este item não pode ser usado');
      break;
    }
  }
}

// ---------------------------------------------------------------- Câmera
function centerCameraOn(x, y) {
  G.camera.x = x - view.w / view.zoom / 2;
  G.camera.y = y - view.h / view.zoom / 2;
  clampCamera();
}
function clampCamera() {
  const vw = view.w / view.zoom, vh = view.h / view.zoom;
  G.camera.x = clamp(G.camera.x, -300, MAP + 300 - vw);
  G.camera.y = clamp(G.camera.y, -300, MAP + 300 - vh);
}
function updateCamera(dt) {
  if (!G) return;
  const p = G.player;
  const vw = view.w / view.zoom, vh = view.h / view.zoom;
  if ((G.camLocked || input.space) && !input.lDownMM) {
    const tx = p.x - vw / 2, ty = p.y - vh / 2;
    const k = 1 - Math.pow(0.0005, dt);
    G.camera.x = lerp(G.camera.x, tx, k); G.camera.y = lerp(G.camera.y, ty, k);
  } else if (!G.paused) {
    const edge = 14, sp = 1100 * dt;
    if (input.mx < edge || input.keys.ArrowLeft) G.camera.x -= sp;
    if (input.mx > view.w - edge || input.keys.ArrowRight) G.camera.x += sp;
    if (input.my < edge || input.keys.ArrowUp) G.camera.y -= sp;
    if (input.my > view.h - edge || input.keys.ArrowDown) G.camera.y += sp;
  }
  clampCamera();
}

// ---------------------------------------------------------------- Menus
function setupMenu() {
  const cards = $('heroes');
  cards.innerHTML = '';
  for (const id of HERO_IDS) {
    const d = HEROES[id];
    const el = document.createElement('button');
    el.className = 'hero-card' + (id === menuState.heroId ? ' selected' : '');
    el.dataset.id = id;
    el.innerHTML = `<div class="hero-icon" style="--c:${d.color}">${d.name[0]}</div>
      <div class="hero-name">${d.name}</div><div class="hero-title">${d.title}</div>
      <div class="hero-role">${d.role} · ${d.melee ? 'Corpo a corpo' : 'À distância'}</div>`;
    el.addEventListener('click', () => { menuState.heroId = id; setupMenu(); });
    cards.appendChild(el);
  }
  const d = HEROES[menuState.heroId];
  $('hero-detail').innerHTML = `<p>${d.desc}</p><ul>` +
    d.abilities.map((a) => `<li><b class="key">${a.key}</b> <b>${a.name}</b> — ${a.desc(fakeHero(d))}</li>`).join('') + '</ul>';
  for (const b of document.querySelectorAll('[data-size]')) {
    b.classList.toggle('selected', Number(b.dataset.size) === menuState.teamSize);
    b.onclick = () => { menuState.teamSize = Number(b.dataset.size); setupMenu(); };
  }
  for (const b of document.querySelectorAll('[data-diff]')) {
    b.classList.toggle('selected', b.dataset.diff === menuState.difficulty);
    b.onclick = () => { menuState.difficulty = b.dataset.diff; setupMenu(); };
  }
  $('play').onclick = startGame;
}

// Herói "fantasma" de nível 1 apenas para mostrar os números na descrição
function fakeHero(def) {
  return { level: 1, def, ad: def.ad, ap: def.ap, maxHp: def.hp, buffs: [] };
}

function startGame() {
  newGame({ heroId: menuState.heroId, teamSize: menuState.teamSize, difficulty: menuState.difficulty });
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  centerCameraOn(G.player.x, G.player.y);
  endShown = false;
  toast('Clique com o botão direito para mover e atacar');
}

function toggleShop(force) {
  const el = $('shop');
  const show = force !== undefined ? force : el.classList.contains('hidden');
  el.classList.toggle('hidden', !show);
  if (show) renderShop();
}

function renderShop() {
  const p = G.player;
  const can = nearShop(p);
  $('shop-gold').textContent = fmtN(p.gold);
  $('shop-status').textContent = can ? 'Você está na loja — clique para comprar.' : 'Volte à base (fonte) para comprar ou vender itens.';
  $('shop-status').className = can ? 'ok' : 'warn';
  const grid = $('shop-items');
  grid.innerHTML = '';
  for (const it of ITEMS) {
    const el = document.createElement('button');
    const afford = p.gold >= it.cost && p.items.length < 6 && can;
    el.className = 'item' + (afford ? '' : ' disabled');
    el.innerHTML = `<div class="item-icon" style="--c:${it.color}">${it.abbr}</div>
      <div class="item-info"><div class="item-name">${it.name}</div><div class="item-stats">${itemStatText(it)}</div></div>
      <div class="item-cost">${it.cost}</div>`;
    el.addEventListener('click', () => {
      if (!can) return toast('Você precisa estar na base para comprar');
      if (p.items.length >= 6) return toast('Inventário cheio');
      if (p.gold < it.cost) return toast('Ouro insuficiente');
      buyItem(p, it.id); renderShop();
    });
    grid.appendChild(el);
  }
  const inv = $('shop-inv');
  inv.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const id = p.items[i];
    const el = document.createElement('div');
    el.className = 'inv-slot';
    if (id) {
      const it = ITEM_MAP[id];
      el.innerHTML = `<div class="item-icon" style="--c:${it.color}">${it.abbr}</div><button class="sell">Vender ${Math.floor(it.cost * 0.6)}</button>`;
      el.querySelector('.sell').addEventListener('click', () => { if (!sellItem(p, i)) toast('Você precisa estar na base para vender'); renderShop(); });
      el.title = it.name + ' — ' + itemStatText(it);
    }
    inv.appendChild(el);
  }
}

function renderScoreboard() {
  const rows = (team) => G.heroes.filter((h) => h.team === team).map((h) => `
    <tr class="${h.isPlayer ? 'me' : ''}">
      <td><span class="dot" style="background:${h.def.color}"></span>${h.isPlayer ? 'Você' : h.name} <small>${h.def.name}</small></td>
      <td>${h.level}</td><td>${h.kills}/${h.deaths}/${h.assists}</td><td>${h.cs}</td><td>${fmtN(h.gold)}</td>
      <td class="items">${h.items.map((id) => `<span class="mini" style="--c:${ITEM_MAP[id].color}" title="${ITEM_MAP[id].name}">${ITEM_MAP[id].abbr}</span>`).join('')}</td>
      <td>${h.dead ? '💀 ' + Math.ceil(h.respawn) + 's' : ''}</td>
    </tr>`).join('');
  const head = '<tr><th>Herói</th><th>Nv</th><th>A/M/A</th><th>Tropas</th><th>Ouro</th><th>Itens</th><th></th></tr>';
  $('score').innerHTML = `<div class="panel wide">
    <h2>Placar · ${fmtTime(G.time)}</h2>
    <h3 style="color:${TEAM_COLORS[0]}">Time Azul — ${G.kills[0]} abates</h3><table>${head}${rows(0)}</table>
    <h3 style="color:${TEAM_COLORS[1]}">Time Vermelho — ${G.kills[1]} abates</h3><table>${head}${rows(1)}</table></div>`;
}

function togglePause(force) {
  G.paused = force !== undefined ? force : !G.paused;
  $('pause').classList.toggle('hidden', !G.paused);
}

let endShown = false;
function showEnd() {
  endShown = true;
  const win = G.winner === G.player.team;
  renderScoreboard();
  $('end').innerHTML = `<div class="panel wide">
    <h1 class="${win ? 'win' : 'lose'}">${win ? 'VITÓRIA' : 'DERROTA'}</h1>
    <p>Duração da partida: ${fmtTime(G.time)}</p>
    ${$('score').querySelector('.panel').innerHTML.replace(/<h2>.*?<\/h2>/, '')}
    <div class="row"><button id="again" class="big">Jogar novamente</button><button id="tomenu">Menu principal</button></div></div>`;
  $('end').classList.remove('hidden');
  $('again').onclick = startGame;
  $('tomenu').onclick = () => { G = null; $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); setupMenu(); };
}

function setupOverlays() {
  $('resume').onclick = () => togglePause(false);
  $('quit').onclick = () => { togglePause(false); G = null; $('menu').classList.remove('hidden'); setupMenu(); };
  $('shop-close').onclick = () => toggleShop(false);
  setInterval(() => { if (G && !$('shop').classList.contains('hidden')) renderShopGoldOnly(); }, 500);
}
function renderShopGoldOnly() {
  const p = G.player;
  const can = nearShop(p);
  const wasCan = $('shop-status').className === 'ok';
  $('shop-gold').textContent = fmtN(p.gold);
  if (can !== wasCan) renderShop();
  else {
    const btns = $('shop-items').children;
    ITEMS.forEach((it, i) => btns[i] && btns[i].classList.toggle('disabled', !(p.gold >= it.cost && p.items.length < 6 && can)));
  }
}
