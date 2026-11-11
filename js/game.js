'use strict';
// =====================================================================
//  Estado e simulação do jogo
// =====================================================================

let G = null; // partida atual
let UID = 0;

function makeUnit(o) {
  return Object.assign({
    id: ++UID, kind: 'minion', team: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 12,
    hp: 1, maxHp: 1, mana: 0, maxMana: 0, ad: 0, ap: 0, armor: 0, mr: 0,
    range: 100, as: 1, bonusAS: 0, ms: 100, vision: 600, dead: false, ranged: false,
    target: null, moveTo: null, atkCd: 0, buffs: [], facing: 0, swingT: 0,
    hpRegen: 0, manaRegen: 0, dash: null, visible: [true, true], vuln: true,
  }, o);
}

function xpNeed(level) { return 120 + level * 80; }

// ---------------------------------------------------------------- Criação
function makeHero(defId, team, isPlayer, name, lane) {
  const def = HEROES[defId];
  const f = FOUNTAIN[team];
  const h = makeUnit({
    kind: 'hero', defId, def, team, isPlayer, name, lane, r: 24, level: 1, xp: 0, gold: START_GOLD,
    items: [], kills: 0, deaths: 0, assists: 0, cs: 0, streak: 0, cds: [0, 0, 0, 0], sumCds: [0, 0],
    respawn: 0, vision: 950, projColor: def.projColor, ranged: !def.melee, attackers: new Map(),
    recall: null, x: f.x + rand(-50, 50), y: f.y + rand(-50, 50), lifesteal: 0, cdr: 0,
  });
  recalcHero(h);
  h.hp = h.maxHp; h.mana = h.maxMana;
  return h;
}

function recalcHero(h) {
  const d = h.def, L = h.level - 1;
  const it = {};
  for (const id of h.items) for (const [k, v] of Object.entries(ITEM_MAP[id].stats)) it[k] = (it[k] || 0) + v;
  const oldMax = h.maxHp, oldMana = h.maxMana;
  h.maxHp = d.hp + d.hpG * L + (it.hp || 0);
  h.maxMana = d.mana + d.manaG * L + (it.mana || 0);
  h.ad = d.ad + d.adG * L + (it.ad || 0);
  h.ap = d.ap + d.apG * L + (it.ap || 0);
  h.armor = d.armor + d.armorG * L + (it.armor || 0);
  h.mr = d.mr + d.mrG * L + (it.mr || 0);
  h.as = d.as;
  h.bonusAS = d.asG * L + (it.as || 0);
  h.ms = d.ms + (it.ms || 0);
  h.range = d.range;
  h.lifesteal = it.lifesteal || 0;
  h.cdr = Math.min(0.4, it.cdr || 0);
  h.hpRegen = d.hpRegen * (1 + L * 0.1);
  h.manaRegen = d.manaRegen * (1 + L * 0.1);
  if (h.maxHp > oldMax) h.hp += h.maxHp - oldMax;
  if (h.maxMana > oldMana) h.mana += h.maxMana - oldMana;
  h.hp = Math.min(h.hp, h.maxHp);
  h.mana = Math.min(h.mana, h.maxMana);
}

function makeTower(t) {
  return makeUnit({
    kind: 'tower', team: t.team, x: t.x, y: t.y, r: 38, maxHp: 3200, hp: 3200, ad: 160,
    armor: 40, mr: 40, range: 460, as: 0.85, ms: 0, vision: 850, lane: t.lane, tier: t.tier,
    ranged: true, projColor: t.team ? '#ff9a8a' : '#8ac8ff', heat: 0, lastTgt: null, force: null, forceT: 0,
  });
}

function makeNexus(team) {
  const p = NEXUS_POS[team];
  return makeUnit({ kind: 'nexus', team, x: p.x, y: p.y, r: 62, maxHp: 5500, hp: 5500, armor: 30, mr: 30, ms: 0, vision: 1000 });
}

function makeMonster(c) {
  const T = MONSTER_TYPES[c.type];
  return makeUnit({
    kind: 'monster', team: NEUTRAL, mtype: c.type, mdef: T, name: T.name, x: c.x, y: c.y, home: { x: c.x, y: c.y },
    r: T.r, maxHp: T.hp, hp: T.hp, ad: T.ad, armor: T.armor, mr: T.mr, range: 70, as: 0.7, ms: 230,
    vision: 400, gold: T.gold, xp: T.xp, respawnAt: 0, leashing: false,
  });
}

function makeMinion(team, laneName, type) {
  const T = MINION_TYPES[type];
  const lane = LANES[laneName];
  const mins = G.time / 60;
  const pts = team === 0 ? lane.points : lane.points.slice().reverse();
  const start = lanePointAt(lane, team, 140);
  const hp = T.hp + T.hpG * mins;
  return makeUnit({
    kind: 'minion', mtype: type, team, lane: laneName, laneObj: lane, path: pts,
    wpProg: pts.map((p) => teamProg(lane, team, p.x, p.y)), wp: 1,
    x: start.x + rand(-20, 20), y: start.y + rand(-20, 20), r: T.r, maxHp: hp, hp,
    ad: T.ad + T.adG * mins, armor: T.armor, mr: 0, range: T.range, as: T.as, ms: T.ms, vision: 600,
    ranged: T.ranged, projColor: team ? '#ffb3a7' : '#a5d8ff', gold: T.gold, xp: T.xp, thinkT: 0, aggroLock: 0, atkCd: Math.random() * 0.4,
  });
}

function newGame(opts) {
  UID = 0;
  const g = {
    opts, time: 0, units: [], heroes: [], projectiles: [], effects: [], fx: [], particles: [], texts: [],
    feed: [], markers: [], announce: null, spawnQueue: [], nextWave: FIRST_WAVE, waveNo: 0,
    over: false, winner: -1, overT: 0, kills: [0, 0], firstBlood: false, visT: 0,
    camera: { x: 0, y: 0 }, camLocked: true, paused: false, cleanT: 0,
  };
  G = g;
  for (const t of TOWER_DEFS) g.units.push(makeTower(t));
  g.units.push(makeNexus(0), makeNexus(1));
  for (const c of CAMPS) g.units.push(makeMonster(c));

  const n = opts.teamSize;
  const lanes = LANE_ORDER[n];
  const names = shuffle(BOT_NAMES.slice());
  for (let team = 0; team < 2; team++) {
    let pool = shuffle(HERO_IDS.filter((id) => !(team === 0 && id === opts.heroId)));
    for (let i = 0; i < n; i++) {
      const isPlayer = team === 0 && i === 0;
      if (!pool.length) pool = shuffle(HERO_IDS.slice());
      const heroId = isPlayer ? opts.heroId : pool.pop();
      const name = isPlayer ? 'Você' : names.pop();
      const h = makeHero(heroId, team, isPlayer, name, lanes[i]);
      if (!isPlayer) h.ai = { timer: rand(0, 0.6), state: 'lane', buildIdx: 0, diff: team === 0 ? 'normal' : opts.difficulty };
      g.units.push(h);
      g.heroes.push(h);
      if (isPlayer) g.player = h;
    }
  }
  computeVuln(g);
  computeVision(g);
  addFeed('Bem-vindo à Arena Rúnica! A primeira onda de tropas chega em instantes.', '#ffd43b');
  return g;
}

// ---------------------------------------------------------------- Buffs
function addBuff(u, kind, value, dur, src) {
  if (!u || u.dead) return;
  if (kind === 'shield') { u.buffs.push({ kind, value, t: dur, max: value }); return; }
  const ex = src ? u.buffs.find((b) => b.kind === kind && b.src === src) : null;
  if (ex) { ex.value = Math.max(ex.value, value); ex.t = Math.max(ex.t, dur); }
  else u.buffs.push({ kind, value, t: dur, src });
}
function buffVal(u, kind, sum) {
  let v = 0;
  for (const b of u.buffs) if (b.kind === kind) v = sum ? v + b.value : Math.max(v, b.value);
  return v;
}
function hasBuff(u, kind) { for (const b of u.buffs) if (b.kind === kind) return true; return false; }
function isStunned(u) { return hasBuff(u, 'stun'); }
function shieldOf(u) { return buffVal(u, 'shield', true); }

function tickBuffs(u, dt) {
  for (let i = u.buffs.length - 1; i >= 0; i--) {
    const b = u.buffs[i];
    b.t -= dt;
    if (b.kind === 'regen') heal(u, b.value * dt);
    if (b.t <= 0 || (b.kind === 'shield' && b.value <= 0)) u.buffs.splice(i, 1);
  }
}

// ---------------------------------------------------------------- Atributos
function getMS(u) { return u.ms * (1 + buffVal(u, 'haste', true)) * (1 - buffVal(u, 'slow')); }
function getAS(u) { return Math.min(2.5, u.as * (1 + u.bonusAS + buffVal(u, 'aspeed', true))); }
function getAD(u) { return u.ad * (1 + buffVal(u, 'dmgamp', true)); }
function heal(u, amt) { if (!u.dead) u.hp = Math.min(u.maxHp, u.hp + amt); }

// ---------------------------------------------------------------- Consultas
function isStructure(u) { return u.kind === 'tower' || u.kind === 'nexus'; }

function computeVuln(g) {
  for (const u of g.units) {
    if (u.kind === 'tower') {
      if (u.tier === 1) u.vuln = true;
      else if (u.tier === 2) u.vuln = !g.units.some((o) => o.kind === 'tower' && o.team === u.team && o.lane === u.lane && o.tier === 1 && !o.dead);
      else u.vuln = g.units.some((o) => o.kind === 'tower' && o.team === u.team && o.tier === 2 && o.dead);
    } else if (u.kind === 'nexus') {
      u.vuln = !g.units.some((o) => o.kind === 'tower' && o.team === u.team && o.tier === 3 && !o.dead);
    }
  }
}

function computeVision(g) {
  const src = [[], []];
  for (const u of g.units) if (!u.dead && u.team < 2) src[u.team].push(u);
  for (const u of g.units) {
    for (let tm = 0; tm < 2; tm++) {
      if (u.team === tm || isStructure(u)) { u.visible[tm] = true; continue; }
      let vis = false;
      for (const s of src[tm]) { if (dist2(s.x, s.y, u.x, u.y) <= s.vision * s.vision) { vis = true; break; } }
      u.visible[tm] = vis;
    }
  }
}

function canAttack(u, t) {
  if (!t || t.dead || t.team === u.team) return false;
  if (isStructure(t) && !t.vuln) return false;
  if (u.kind === 'hero' && u.team < 2 && !t.visible[u.team]) return false;
  return true;
}

function enemiesInRadius(team, x, y, r) {
  const out = [];
  for (const u of G.units) {
    if (u.dead || u.team === team || isStructure(u)) continue;
    if (dist2(u.x, u.y, x, y) <= (r + u.r) * (r + u.r)) out.push(u);
  }
  return out;
}

function nearestEnemy(u, radius, includeStructures) {
  let best = null, bd = radius * radius;
  for (const o of G.units) {
    if (!canAttack(u, o) || o.team === NEUTRAL) continue;
    if (!includeStructures && isStructure(o)) continue;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function clampRange(u, tx, ty, range) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  const p = d <= range ? { x: tx, y: ty } : { x: u.x + (dx / d) * range, y: u.y + (dy / d) * range };
  p.x = clamp(p.x, 30, MAP - 30); p.y = clamp(p.y, 30, MAP - 30);
  return p;
}

// ---------------------------------------------------------------- Efeitos
function fireSkillshot(src, tx, ty, o) {
  const a = Math.atan2(ty - src.y, tx - src.x);
  src.facing = a;
  G.projectiles.push({
    homing: false, x: src.x, y: src.y, dx: Math.cos(a), dy: Math.sin(a), speed: o.speed, range: o.range,
    r: o.r, color: o.color, pierce: !!o.pierce, traveled: 0, hit: new Set(), team: src.team, src, onHit: o.onHit, big: true,
  });
}
function addZone(o) { G.effects.push(Object.assign({ kind: 'zone', t: 0, tick: o.every }, o)); }
function addDelayed(o) { G.effects.push(Object.assign({ kind: 'delayed', t: 0 }, o)); }
function startDash(u, tx, ty, speed, o = {}) {
  cancelRecall(u);
  u.dash = { tx: clamp(tx, 30, MAP - 30), ty: clamp(ty, 30, MAP - 30), speed, onPass: o.onPass, onEnd: o.onEnd, hit: new Set(), color: o.color || '#fff' };
  u.target = null; u.moveTo = null;
}
function blink(u, tx, ty, color) {
  cancelRecall(u);
  burst(u.x, u.y, color, 16, 160);
  u.x = clamp(tx, 30, MAP - 30); u.y = clamp(ty, 30, MAP - 30);
  burst(u.x, u.y, color, 16, 160);
  u.moveTo = null;
}
function spawnFx(o) { G.fx.push(Object.assign({ t: 0 }, o)); }
function spark(x, y, color) {
  G.particles.push({ x, y, vx: rand(-30, 30), vy: rand(-60, -10), life: 0.5, max: 0.5, color, size: rand(2, 4) });
}
function burst(x, y, color, n, speed) {
  if (G.particles.length > 1500) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.2, 1) * speed;
    const life = rand(0.3, 0.7);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: rand(2, 5) });
  }
}
function addText(x, y, text, color, big) {
  G.texts.push({ x: x + rand(-10, 10), y, text, color, t: 0, dur: big ? 1.4 : 0.9, big });
}
function addFeed(text, color) {
  G.feed.push({ t: G.time, text, color });
  if (G.feed.length > 6) G.feed.shift();
}
function announce(text, sub, color) { G.announce = { text, sub, color: color || '#fff', t: 0, dur: 3 }; }

// ---------------------------------------------------------------- Comandos
function issueMove(h, x, y, attackMove) {
  if (h.dead) return;
  cancelRecall(h);
  h.target = null;
  h.moveTo = { x: clamp(x, 20, MAP - 20), y: clamp(y, 20, MAP - 20) };
  h.attackMove = !!attackMove;
}
function issueAttack(h, t) {
  if (h.dead || h.target === t) return;
  cancelRecall(h);
  h.target = t; h.moveTo = null;
}
function issueStop(h) { h.target = null; h.moveTo = null; h.attackMove = false; }
function startRecall(h) {
  if (h.dead || h.recall || h.dash) return;
  h.target = null; h.moveTo = null;
  h.recall = { t: 4, dur: 4 };
}
function cancelRecall(h) { if (h.recall) h.recall = null; }

function canCast(h, i) {
  const ab = h.def.abilities[i];
  return !h.dead && !h.dash && !isStunned(h) && h.cds[i] <= 0 && h.mana >= ab.cost && (i < 3 || h.level >= 6);
}
function castAbility(h, i, tx, ty) {
  if (!canCast(h, i)) return false;
  const ab = h.def.abilities[i];
  cancelRecall(h);
  h.mana -= ab.cost;
  h.cds[i] = ab.cd * (1 - h.cdr);
  ab.cast(h, tx, ty);
  return true;
}
function castSummoner(h, i, tx, ty) {
  if (h.dead || h.dash || isStunned(h) || h.sumCds[i] > 0) return false;
  cancelRecall(h);
  h.sumCds[i] = SUMMONERS[i].cd;
  if (i === 0) { const p = clampRange(h, tx, ty, 400); blink(h, p.x, p.y, '#ffe066'); }
  else {
    heal(h, 80 + 20 * h.level);
    addBuff(h, 'haste', 0.3, 1.5, 'cura');
    spawnFx({ kind: 'ring', x: h.x, y: h.y, r: 80, color: '#69db7c', dur: 0.5, follow: h });
    if (h.isPlayer) addText(h.x, h.y - 40, '+' + fmtN(80 + 20 * h.level), '#69db7c');
  }
  return true;
}

// ---------------------------------------------------------------- Loja
function nearShop(h) { return h.dead || dist(h, FOUNTAIN[h.team]) < FOUNTAIN_R + 250; }
function buyItem(h, id) {
  const it = ITEM_MAP[id];
  if (!it || h.gold < it.cost || h.items.length >= 6 || !nearShop(h)) return false;
  h.gold -= it.cost;
  h.items.push(id);
  recalcHero(h);
  return true;
}
function sellItem(h, idx) {
  const id = h.items[idx];
  if (!id || !nearShop(h)) return false;
  h.items.splice(idx, 1);
  h.gold += Math.floor(ITEM_MAP[id].cost * 0.6);
  recalcHero(h);
  return true;
}
function useItem(h, idx) {
  const id = h.items[idx];
  if (!id || h.dead) return false;
  const it = ITEM_MAP[id];
  if (!it.consumable) return false;
  if (id === 'pocao') addBuff(h, 'regen', 16, 10);
  h.items.splice(idx, 1);
  recalcHero(h);
  return true;
}

// ---------------------------------------------------------------- Combate
function dealDamage(src, tgt, amt, type, isAttack) {
  if (!tgt || tgt.dead || amt <= 0) return 0;
  if (isStructure(tgt) && !tgt.vuln) return 0;
  const res = type === 'phys' ? tgt.armor : type === 'magic' ? tgt.mr : 0;
  let dmg = (amt * 100) / (100 + Math.max(0, res));
  dmg *= 1 - buffVal(tgt, 'reduce');
  const raw = dmg;
  for (const b of tgt.buffs) {
    if (b.kind === 'shield' && b.value > 0 && dmg > 0) { const a = Math.min(b.value, dmg); b.value -= a; dmg -= a; }
  }
  tgt.hp -= dmg;

  if (src) {
    if (isAttack && src.lifesteal) heal(src, raw * src.lifesteal);
    if (tgt.kind === 'hero') {
      if (src.kind === 'hero') { tgt.attackers.set(src.id, G.time); heroAggro(src, tgt); }
      cancelRecall(tgt);
    }
    if (tgt.kind === 'monster' && !tgt.leashing && (!tgt.target || tgt.target.dead)) tgt.target = src;
    if (src.isPlayer || tgt.isPlayer) {
      const col = tgt.isPlayer ? '#ff6b6b' : type === 'magic' ? '#b197fc' : type === 'true' ? '#fff' : '#ffd8a8';
      addText(tgt.x, tgt.y - tgt.r - 10, fmtN(raw), col);
    }
  } else if (tgt.kind === 'hero') cancelRecall(tgt);

  if (tgt.hp <= 0) kill(tgt, src);
  return raw;
}

// Agressão de torres e tropas quando um herói ataca outro herói perto delas
function heroAggro(src, tgt) {
  for (const t of G.units) {
    if (t.dead || t.team !== tgt.team) continue;
    if (t.kind === 'tower') {
      if (dist(t, src) <= t.range + src.r && dist(t, tgt) <= t.range + 250) { t.force = src; t.forceT = 2.5; }
    } else if (t.kind === 'minion') {
      if (dist(t, tgt) < 550 && dist(t, src) < 650) { t.target = src; t.aggroLock = 2; }
    }
  }
}

function performAttack(u, t) {
  u.atkCd = 1 / getAS(u);
  let dmg = getAD(u);
  let type = 'phys';
  if (u.kind === 'tower') {
    if (t.kind === 'minion') { dmg = t.maxHp * (t.mtype === 'siege' ? 0.14 : 0.42); type = 'true'; }
    else {
      u.heat = u.lastTgt === t ? Math.min(3, u.heat + 1) : 0;
      dmg = (170 + (G.time / 60) * 7) * (1 + 0.35 * u.heat);
    }
    u.lastTgt = t;
  }
  if (u.ranged) {
    const tower = u.kind === 'tower';
    G.projectiles.push({
      homing: true, x: u.x, y: u.y - (tower ? 30 : 0), target: t, speed: tower ? 1100 : 950, r: tower ? 9 : u.kind === 'hero' ? 6 : 4,
      color: u.projColor, src: u, team: u.team, onHit: (tg) => dealDamage(u, tg, dmg, type, true),
    });
  } else {
    dealDamage(u, t, dmg, type, true);
    u.swingT = 0.2;
  }
}

function giveGold(h, amt, x, y) {
  h.gold += amt;
  if (h.isPlayer && amt >= 5) addText(x ?? h.x, (y ?? h.y) - 30, '+' + fmtN(amt), '#ffd43b');
}

function giveXP(h, amt) {
  if (h.level >= MAX_LEVEL) return;
  h.xp += amt;
  while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) {
    h.xp -= xpNeed(h.level);
    h.level++;
    recalcHero(h);
    spawnFx({ kind: 'ring', x: h.x, y: h.y, r: 60, color: '#ffd43b', dur: 0.6, follow: h });
    if (h.isPlayer) {
      addText(h.x, h.y - 50, 'Nível ' + h.level + '!', '#ffd43b', true);
      if (h.level === 6) announce('Habilidade suprema liberada!', 'Pressione R para usar ' + h.def.abilities[3].name, '#ffd43b');
    }
  }
  if (h.level >= MAX_LEVEL) h.xp = 0;
}

function shareXP(x, y, team, amt) {
  const hs = G.heroes.filter((h) => !h.dead && h.team === team && dist2(h.x, h.y, x, y) < 1100 * 1100);
  if (!hs.length) return;
  const each = hs.length === 1 ? amt : (amt * (1 + 0.2 * (hs.length - 1))) / hs.length;
  for (const h of hs) giveXP(h, each);
}

function kill(u, killer) {
  u.hp = 0; u.dead = true; u.target = null; u.moveTo = null; u.dash = null; u.recall = null; u.buffs = [];
  burst(u.x, u.y, u.kind === 'hero' ? u.def.color : TEAM_COLORS[u.team], u.kind === 'minion' ? 8 : 30, u.kind === 'minion' ? 120 : 260);

  if (u.kind === 'minion') {
    if (killer && killer.kind === 'hero') { giveGold(killer, u.gold, u.x, u.y); killer.cs++; }
    shareXP(u.x, u.y, 1 - u.team, u.xp);
  } else if (u.kind === 'hero') heroDied(u, killer);
  else if (u.kind === 'tower') towerDied(u, killer);
  else if (u.kind === 'nexus') endGame(1 - u.team);
  else if (u.kind === 'monster') monsterDied(u, killer);
}

function heroName(h) { return h.name + ' (' + h.def.name + ')'; }

function heroDied(u, killer) {
  u.deaths++;
  u.respawn = 6 + u.level * 2.2 + (G.time / 60) * 0.4;
  let kh = killer && killer.kind === 'hero' ? killer : null;
  if (!kh) {
    let best = -1;
    for (const [id, t] of u.attackers) {
      if (G.time - t < 10 && t > best) { const h = G.heroes.find((x) => x.id === id); if (h && h.team !== u.team) { best = t; kh = h; } }
    }
  }
  const assists = [];
  for (const [id, t] of u.attackers) {
    if (G.time - t > 10 || (kh && id === kh.id)) continue;
    const h = G.heroes.find((x) => x.id === id);
    if (h && h.team !== u.team) assists.push(h);
  }
  const victimStreak = u.streak; u.streak = 0;
  if (kh) {
    kh.kills++; kh.streak++;
    G.kills[kh.team]++;
    let bounty = 300 + Math.min(500, victimStreak >= 2 ? victimStreak * 100 : 0);
    if (!G.firstBlood) { G.firstBlood = true; bounty += 100; announce('Primeiro Abate!', heroName(kh) + ' abateu ' + heroName(u), TEAM_COLORS[kh.team]); }
    else if (kh.isPlayer || u.isPlayer) announce(kh.isPlayer ? 'Você abateu um inimigo!' : 'Você foi abatido!', heroName(kh) + ' → ' + heroName(u), TEAM_COLORS[kh.team]);
    if (kh.streak === 3 || kh.streak === 5) addFeed(heroName(kh) + (kh.streak === 3 ? ' está em uma série de abates!' : ' é IMPARÁVEL!'), '#ffd43b');
    giveGold(kh, bounty, u.x, u.y);
    addFeed(heroName(kh) + ' abateu ' + heroName(u), TEAM_COLORS[kh.team]);
  } else {
    G.kills[1 - u.team]++;
    addFeed(heroName(u) + ' foi executado', TEAM_COLORS[1 - u.team]);
    if (u.isPlayer) announce('Você foi executado!', '', '#ff6b6b');
  }
  for (const a of assists) { a.assists++; giveGold(a, 150, u.x, u.y); }
  shareXP(u.x, u.y, 1 - u.team, 80 + 35 * u.level);
  u.attackers.clear();
}

function towerDied(u, killer) {
  for (const h of G.heroes) if (h.team !== u.team) giveGold(h, 150);
  if (killer && killer.kind === 'hero') giveGold(killer, 100, u.x, u.y);
  const ours = u.team === G.player.team;
  addFeed('Torre ' + (ours ? 'aliada' : 'inimiga') + ' destruída!', TEAM_COLORS[1 - u.team]);
  announce(ours ? 'Uma torre aliada caiu!' : 'Torre inimiga destruída!', '', TEAM_COLORS[1 - u.team]);
  burst(u.x, u.y, '#adb5bd', 50, 300);
}

function monsterDied(u, killer) {
  u.respawnAt = G.time + u.mdef.respawn;
  const team = killer && killer.team < 2 ? killer.team : -1;
  if (killer && killer.kind === 'hero') giveGold(killer, u.gold, u.x, u.y);
  if (team >= 0) {
    shareXP(u.x, u.y, team, u.xp);
    if (u.mdef.reward === 'teamGold') {
      for (const h of G.heroes) if (h.team === team) giveGold(h, 100);
      addFeed('Time ' + TEAM_NAMES[team] + ' derrotou o ' + u.name + ' (+100 de ouro para todos)', TEAM_COLORS[team]);
    } else if (u.mdef.reward === 'teamBuff') {
      for (const h of G.heroes) if (h.team === team && !h.dead) addBuff(h, 'dmgamp', 0.15, 120, 'serpe');
      addFeed('Time ' + TEAM_NAMES[team] + ' derrotou a ' + u.name + ' (+15% de dano por 2 min)', TEAM_COLORS[team]);
      announce('Serpe Ancestral derrotada!', 'Time ' + TEAM_NAMES[team] + ' recebe +15% de dano', TEAM_COLORS[team]);
    }
  }
}

function reviveMonster(m) {
  const mins = G.time / 60;
  m.dead = false; m.maxHp = m.mdef.hp * (1 + mins * 0.05); m.hp = m.maxHp;
  m.ad = m.mdef.ad * (1 + mins * 0.04);
  m.x = m.home.x; m.y = m.home.y; m.target = null; m.leashing = false; m.buffs = [];
}

function respawnHero(h) {
  const f = FOUNTAIN[h.team];
  h.dead = false; h.hp = h.maxHp; h.mana = h.maxMana; h.x = f.x + rand(-40, 40); h.y = f.y + rand(-40, 40);
  h.target = null; h.moveTo = null; h.buffs = [];
  if (h.ai) h.ai.state = 'lane';
}

function endGame(winner) {
  if (G.over) return;
  G.over = true; G.winner = winner;
  announce(winner === G.player.team ? 'VITÓRIA!' : 'DERROTA', 'O Núcleo ' + (winner === 0 ? 'Vermelho' : 'Azul') + ' foi destruído', TEAM_COLORS[winner]);
}

// ---------------------------------------------------------------- Movimento
// Desvia de torres/núcleos que estejam no caminho (contorna pela tangente)
function steerAround(u, nx, ny, targetDist) {
  for (const s of G.units) {
    if (!isStructure(s) || s.dead) continue;
    const sx = s.x - u.x, sy = s.y - u.y;
    const ahead = sx * nx + sy * ny;
    const R = s.r + u.r * 0.6 + 8;
    if (ahead <= 0 || ahead > R + 70 || ahead > targetDist) continue;
    const cross = nx * sy - ny * sx;
    if (Math.abs(cross) >= R) continue;
    const sl = Math.hypot(sx, sy) || 1;
    // tangente do lado oposto ao centro da estrutura
    const side = cross >= 0 ? -1 : 1;
    let tx = (-sy / sl) * side, ty = (sx / sl) * side;
    if (tx * nx + ty * ny < 0) { tx = -tx; ty = -ty; }
    return { x: tx, y: ty };
  }
  return null;
}

function moveToward(u, tx, ty, dt, stopDist = 0) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= stopDist + 0.5) return true;
  const step = getMS(u) * dt;
  u.facing = Math.atan2(dy, dx);
  const st = steerAround(u, dx / d, dy / d, d);
  if (st) {
    u.x += st.x * step; u.y += st.y * step;
    u.x = clamp(u.x, 15, MAP - 15); u.y = clamp(u.y, 15, MAP - 15);
    return false;
  }
  if (step >= d - stopDist) {
    const k = (d - stopDist) / d;
    u.x += dx * k; u.y += dy * k;
    return true;
  }
  u.x += (dx / d) * step; u.y += (dy / d) * step;
  u.x = clamp(u.x, 15, MAP - 15); u.y = clamp(u.y, 15, MAP - 15);
  return false;
}

function updateDash(u, dt) {
  const d = u.dash;
  if (d.onPass) {
    for (const e of enemiesInRadius(u.team, u.x, u.y, u.r + 25)) {
      if (!d.hit.has(e.id)) { d.hit.add(e.id); d.onPass(e); }
    }
  }
  const dx = d.tx - u.x, dy = d.ty - u.y, dd = Math.hypot(dx, dy), step = d.speed * dt;
  if (Math.random() < 0.8) spark(u.x, u.y, d.color);
  if (step >= dd) {
    u.x = d.tx; u.y = d.ty; u.dash = null;
    if (d.onEnd) d.onEnd();
  } else {
    u.facing = Math.atan2(dy, dx);
    u.x += (dx / dd) * step; u.y += (dy / dd) * step;
  }
}

function unitAct(u, dt) {
  u.atkCd -= dt;
  if (u.swingT > 0) u.swingT -= dt;
  if (u.dash) { updateDash(u, dt); return; }
  if (isStunned(u) || u.recall) return;
  let t = u.target;
  if (t && !canAttack(u, t)) { u.target = t = null; }
  if (t) {
    const reach = u.range + t.r + u.r * 0.5;
    const d = dist(u, t);
    if (d <= reach) {
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.atkCd <= 0) performAttack(u, t);
    } else if (u.ms > 0) moveToward(u, t.x, t.y, dt, reach * 0.9);
    else u.target = null;
    return;
  }
  if (u.moveTo) {
    if (moveToward(u, u.moveTo.x, u.moveTo.y, dt)) { u.moveTo = null; u.attackMove = false; }
  }
}

function separate(g) {
  const mob = [];
  for (const u of g.units) if (!u.dead && !isStructure(u)) mob.push(u);
  for (let i = 0; i < mob.length; i++) {
    const a = mob[i];
    for (let j = i + 1; j < mob.length; j++) {
      const b = mob[j];
      const dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * 0.85;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      const wa = a.dash ? 0 : b.dash ? 2 : a.kind === 'hero' && b.kind !== 'hero' ? 0.4 : 1;
      const wb = b.dash ? 0 : a.dash ? 2 : b.kind === 'hero' && a.kind !== 'hero' ? 0.4 : 1;
      a.x -= nx * push * wa; a.y -= ny * push * wa;
      b.x += nx * push * wb; b.y += ny * push * wb;
    }
  }
  for (const s of g.units) {
    if (!isStructure(s) || s.dead) continue;
    for (const u of mob) {
      const dx = u.x - s.x, dy = u.y - s.y, rr = s.r + u.r * 0.6;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0) { const d = Math.sqrt(d2); u.x = s.x + (dx / d) * rr; u.y = s.y + (dy / d) * rr; }
    }
  }
}

// ---------------------------------------------------------------- IA das unidades
function heroTick(h, dt) {
  for (let i = 0; i < 4; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
  for (let i = 0; i < 2; i++) if (h.sumCds[i] > 0) h.sumCds[i] -= dt;
  heal(h, h.hpRegen * dt);
  h.mana = Math.min(h.maxMana, h.mana + h.manaRegen * dt);
  if (h.recall) {
    h.recall.t -= dt;
    if (Math.random() < 0.5) spark(h.x + rand(-20, 20), h.y + rand(-10, 20), '#74c0fc');
    if (h.recall.t <= 0) {
      const f = FOUNTAIN[h.team];
      h.recall = null; h.x = f.x + rand(-30, 30); h.y = f.y + rand(-30, 30);
      h.target = null; h.moveTo = null;
      burst(h.x, h.y, '#74c0fc', 25, 200);
    }
  }
  if (h.attackMove && h.moveTo && !h.target) {
    const e = nearestEnemy(h, Math.max(450, h.range + 150), true);
    if (e) h.target = e;
  }
}

function findMinionTarget(m) {
  let best = null, bs = Infinity;
  for (const o of G.units) {
    if (o.dead || o.team === m.team || o.team === NEUTRAL) continue;
    if (isStructure(o) && !o.vuln) continue;
    const d = dist(m, o);
    if (d > 480 + o.r) continue;
    const s = d + (o.kind === 'hero' ? 300 : isStructure(o) ? 80 : 0);
    if (s < bs) { bs = s; best = o; }
  }
  return best;
}

function minionTick(m, dt) {
  if (m.aggroLock > 0) m.aggroLock -= dt;
  m.thinkT -= dt;
  if (m.thinkT <= 0) {
    m.thinkT = 0.25 + Math.random() * 0.1;
    const t = m.target;
    if (!t || t.dead || dist(m, t) > 700 || !canAttack(m, t)) m.target = findMinionTarget(m);
    else if (t.kind === 'hero' && m.aggroLock <= 0) {
      const alt = findMinionTarget(m);
      if (alt && alt.kind !== 'hero') m.target = alt;
    }
    const prog = teamProg(m.laneObj, m.team, m.x, m.y);
    while (m.wp < m.path.length - 1 && m.wpProg[m.wp] <= prog + 25) m.wp++;
  }
  if (!m.target) m.moveTo = m.path[m.wp];
}

function towerTick(t, dt) {
  t.atkCd -= dt;
  if (t.forceT > 0) t.forceT -= dt;
  const inR = (u) => u && !u.dead && u.team !== t.team && u.team !== NEUTRAL && dist(t, u) <= t.range + u.r;
  if (t.forceT > 0 && inR(t.force)) t.target = t.force;
  else if (!inR(t.target)) {
    t.target = null;
    let best = null, bs = Infinity;
    for (const u of G.units) {
      if (!inR(u) || isStructure(u)) continue;
      const s = dist(t, u) + (u.kind === 'hero' ? 10000 : 0);
      if (s < bs) { bs = s; best = u; }
    }
    t.target = best;
  }
  if (t.target && t.atkCd <= 0) performAttack(t, t.target);
}

function monsterTick(m, dt) {
  if (m.leashing) {
    m.target = null; m.moveTo = m.home;
    heal(m, m.maxHp * 0.25 * dt);
    if (dist(m, m.home) < 15) { m.leashing = false; m.hp = m.maxHp; m.moveTo = null; }
  } else if (m.target && (m.target.dead || dist(m.home, m.target) > 650 || dist(m.home, m) > 700)) {
    m.target = null; m.leashing = true;
  }
  unitAct(m, dt);
}

function fountainTick(g, dt) {
  for (const u of g.units) {
    if (u.dead || isStructure(u) || u.team === NEUTRAL) continue;
    const own = FOUNTAIN[u.team], foe = FOUNTAIN[1 - u.team];
    if (u.kind === 'hero' && dist2(u.x, u.y, own.x, own.y) < FOUNTAIN_R * FOUNTAIN_R) {
      heal(u, u.maxHp * 0.12 * dt);
      u.mana = Math.min(u.maxMana, u.mana + u.maxMana * 0.12 * dt);
    }
    if (dist2(u.x, u.y, foe.x, foe.y) < (FOUNTAIN_R + 80) * (FOUNTAIN_R + 80)) {
      dealDamage(null, u, 800 * dt, 'true');
      if (Math.random() < 0.3) spawnFx({ kind: 'laser', x: foe.x, y: foe.y, tx: u.x, ty: u.y, color: TEAM_COLORS[1 - u.team], dur: 0.12 });
    }
  }
}

// ---------------------------------------------------------------- Atualização
function queueWave(g) {
  g.waveNo++;
  const siege = g.waveNo % 3 === 0;
  const types = ['melee', 'melee', 'melee'];
  if (siege) types.push('siege');
  types.push('ranged', 'ranged', 'ranged');
  for (let team = 0; team < 2; team++) {
    for (const lane of ['top', 'mid', 'bot']) {
      types.forEach((type, i) => g.spawnQueue.push({ t: g.time + i * 0.7, team, lane, type }));
    }
  }
}

function updateProjectiles(g, dt) {
  const ps = g.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    let done = false;
    if (p.homing) {
      const t = p.target;
      if (!t || t.dead) { ps.splice(i, 1); continue; }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), s = p.speed * dt;
      if (d <= s + t.r * 0.5) { p.onHit(t); done = true; }
      else { p.x += (dx / d) * s; p.y += (dy / d) * s; }
    } else {
      const s = p.speed * dt;
      p.x += p.dx * s; p.y += p.dy * s; p.traveled += s;
      for (const u of g.units) {
        if (u.dead || u.team === p.team || isStructure(u) || p.hit.has(u.id)) continue;
        if (dist2(u.x, u.y, p.x, p.y) < (u.r + p.r) * (u.r + p.r)) {
          p.hit.add(u.id);
          p.onHit(u, p);
          if (!p.pierce) { done = true; break; }
        }
      }
      if (p.traveled >= p.range) done = true;
      if (Math.random() < 0.7) spark(p.x, p.y, p.color);
    }
    if (done) ps.splice(i, 1);
  }
}

function updateEffects(g, dt) {
  for (let i = g.effects.length - 1; i >= 0; i--) {
    const e = g.effects[i];
    e.t += dt;
    if (e.kind === 'zone') {
      e.tick -= dt;
      while (e.tick <= 0 && e.t <= e.dur + 0.001) { e.tick += e.every; e.onTick(e); }
      if (e.t >= e.dur) g.effects.splice(i, 1);
    } else if (e.kind === 'delayed') {
      if (e.follow && !e.follow.dead) { e.x = e.follow.x; e.y = e.follow.y; }
      if (e.t >= e.delay) { g.effects.splice(i, 1); e.onTrigger(e); }
    }
  }
}

function updateFx(g, dt) {
  for (let i = g.fx.length - 1; i >= 0; i--) {
    const f = g.fx[i];
    f.t += dt;
    if (f.follow) { f.x = f.follow.x; f.y = f.follow.y; }
    if (f.t >= f.dur) g.fx.splice(i, 1);
  }
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
    if (p.life <= 0) g.particles.splice(i, 1);
  }
  for (let i = g.texts.length - 1; i >= 0; i--) {
    const t = g.texts[i];
    t.t += dt; t.y -= 40 * dt;
    if (t.t >= t.dur) g.texts.splice(i, 1);
  }
  for (let i = g.markers.length - 1; i >= 0; i--) {
    g.markers[i].t += dt;
    if (g.markers[i].t > 0.5) g.markers.splice(i, 1);
  }
  if (g.announce) { g.announce.t += dt; if (g.announce.t > g.announce.dur) g.announce = null; }
}

function step(g, dt) {
  if (g.over) { g.overT += dt; updateFx(g, dt); return; }
  g.time += dt;

  if (g.time >= g.nextWave) { queueWave(g); g.nextWave += WAVE_INTERVAL; }
  for (let i = g.spawnQueue.length - 1; i >= 0; i--) {
    const s = g.spawnQueue[i];
    if (g.time >= s.t) { g.units.push(makeMinion(s.team, s.lane, s.type)); g.spawnQueue.splice(i, 1); }
  }

  computeVuln(g);
  g.visT -= dt;
  if (g.visT <= 0) { g.visT = 0.1; computeVision(g); }

  for (const u of g.units) { u.px = u.x; u.py = u.y; }
  // Alterna a ordem de processamento a cada passo para nenhum time agir sempre primeiro
  g.flip = !g.flip;
  const n = g.units.length;
  for (let k = 0; k < n; k++) {
    const u = g.units[g.flip ? k : n - 1 - k];
    if (u.dead) {
      if (u.kind === 'hero') { u.respawn -= dt; if (u.respawn <= 0) respawnHero(u); }
      else if (u.kind === 'monster' && g.time >= u.respawnAt) reviveMonster(u);
      continue;
    }
    tickBuffs(u, dt);
    switch (u.kind) {
      case 'hero': heroTick(u, dt); if (u.ai) botUpdate(u, dt); unitAct(u, dt); break;
      case 'minion': minionTick(u, dt); unitAct(u, dt); break;
      case 'tower': towerTick(u, dt); break;
      case 'monster': monsterTick(u, dt); break;
    }
  }
  separate(g);
  for (const u of g.units) { u.vx = (u.x - u.px) / dt; u.vy = (u.y - u.py) / dt; }

  updateProjectiles(g, dt);
  updateEffects(g, dt);
  fountainTick(g, dt);
  updateFx(g, dt);

  for (const h of g.heroes) {
    const bonus = h.ai && h.team === 1 && g.opts.difficulty === 'dificil' ? 1.15 : h.ai && h.team === 1 && g.opts.difficulty === 'facil' ? 0.85 : 1;
    h.gold += GOLD_PER_SEC * dt * bonus;
  }

  g.cleanT -= dt;
  if (g.cleanT <= 0) { g.cleanT = 1; g.units = g.units.filter((u) => !(u.kind === 'minion' && u.dead)); }
}
