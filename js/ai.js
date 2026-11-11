'use strict';
// =====================================================================
//  Inteligência artificial dos heróis controlados por bots
// =====================================================================

const DIFF = {
  facil: { think: 0.45, aggro: -0.2, castChance: 0.35, retreat: 0.35, aim: 0.4 },
  normal: { think: 0.3, aggro: 0, castChance: 0.65, retreat: 0.3, aim: 0.8 },
  dificil: { think: 0.18, aggro: 0.12, castChance: 0.9, retreat: 0.25, aim: 1 },
};

function botUpdate(h, dt) {
  if (h.dead) return;
  h.ai.timer -= dt;
  if (h.ai.timer > 0) return;
  const D = DIFF[h.ai.diff] || DIFF.normal;
  h.ai.timer = D.think * rand(0.8, 1.2);
  botThink(h, D);
}

function enemyHeroesNear(h, r) {
  return G.heroes.filter((e) => !e.dead && e.team !== h.team && e.visible[h.team] && dist(h, e) < r);
}
function allyHeroesNear(h, r) {
  return G.heroes.filter((e) => !e.dead && e !== h && e.team === h.team && dist(h, e) < r);
}
function enemyTowerCovering(u, team, pad = 0) {
  for (const t of G.units) {
    if (t.kind === 'tower' && !t.dead && t.team !== team && dist(t, u) <= t.range + pad) return t;
  }
  return null;
}
function towerHasMinionTank(tower) {
  for (const m of G.units) {
    if (m.kind === 'minion' && !m.dead && m.team !== tower.team && dist(m, tower) <= tower.range) return true;
  }
  return false;
}

function botShop(h) {
  const build = h.def.build;
  while (h.ai.buildIdx < build.length && h.items.length < 6) {
    const it = ITEM_MAP[build[h.ai.buildIdx]];
    if (h.gold < it.cost) break;
    buyItem(h, it.id);
    h.ai.buildIdx++;
  }
}

function tryEscape(h, to) {
  const abs = h.def.abilities;
  for (let i = 0; i < 3; i++) {
    if (abs[i].ai === 'escape' && canCast(h, i)) { castAbility(h, i, to.x, to.y); return true; }
  }
  if (h.sumCds[0] <= 0) { castSummoner(h, 0, to.x, to.y); return true; }
  return false;
}

function botThink(h, D) {
  const ai = h.ai, hpR = h.hp / h.maxHp, f = FOUNTAIN[h.team];
  const inBase = dist(h, f) < FOUNTAIN_R + 120;
  const foes = enemyHeroesNear(h, 1000);
  let closest = null;
  for (const e of foes) if (!closest || dist(h, e) < dist(h, closest)) closest = e;

  if (h.recall) {
    if (closest && dist(h, closest) < 700) cancelRecall(h);
    else return;
  }

  if (inBase) {
    botShop(h);
    if (ai.state === 'retreat') ai.state = 'heal';
    if (ai.state === 'heal') {
      if (hpR < 0.95 || h.mana < h.maxMana * 0.85) { issueStop(h); return; }
      ai.state = 'lane';
    }
  }

  // Decidir recuar
  if (ai.state === 'lane') {
    if (hpR < D.retreat || (hpR < 0.45 && closest && h.mana < 60)) ai.state = 'retreat';
    else if (h.gold > 1400 && !closest && hpR < 0.8 && h.items.length < 6) ai.state = 'retreat';
  }

  if (ai.state === 'retreat' || ai.state === 'heal') {
    if (closest && dist(h, closest) < 450) {
      if (hpR < 0.3 && h.sumCds[1] <= 0) castSummoner(h, 1, f.x, f.y);
      if (hpR < 0.25) tryEscape(h, f);
    }
    const danger = enemyHeroesNear(h, 1100).length > 0 || enemyTowerCovering(h, h.team, 50);
    if (!danger && !inBase && dist(h, f) > 1200) { startRecall(h); return; }
    issueMove(h, f.x + rand(-60, 60), f.y + rand(-60, 60));
    return;
  }

  laneLogic(h, D, foes, hpR);
}

function laneLogic(h, D, foes, hpR) {
  const lane = LANES[h.lane];
  const team = h.team;
  const myProg = teamProg(lane, team, h.x, h.y);

  // Linha de frente: tropa aliada mais avançada nesta rota
  let front = -1;
  for (const m of G.units) {
    if (m.kind === 'minion' && !m.dead && m.team === team && m.lane === h.lane) {
      const p = teamProg(lane, team, m.x, m.y);
      if (p > front) front = p;
    }
  }
  let safe = 300;
  let enemyTowerProg = lane.total;
  for (const t of G.units) {
    if (t.kind !== 'tower' || t.dead) continue;
    if (t.lane !== h.lane && t.lane !== 'base') continue;
    const p = teamProg(lane, team, t.x, t.y);
    if (t.team === team && t.lane === h.lane) safe = Math.max(safe, p - 150);
    if (t.team !== team) enemyTowerProg = Math.min(enemyTowerProg, p);
  }
  if (front < 0) front = safe;
  let desired = front - (h.ranged ? 170 : 70);
  // Não ficar sob a torre inimiga sem tropas aliadas
  const nearTower = G.units.find((t) => t.kind === 'tower' && !t.dead && t.team !== team && (t.lane === h.lane || t.lane === 'base') && Math.abs(teamProg(lane, team, t.x, t.y) - desired) < 700);
  if (nearTower && !towerHasMinionTank(nearTower)) desired = Math.min(desired, enemyTowerProg - nearTower.range - 80);

  // Fugir da torre inimiga que está mirando em mim
  const tw = enemyTowerCovering(h, team, 60);
  if (tw && (tw.target === h || !towerHasMinionTank(tw))) {
    const p = lanePointAt(lane, team, myProg - 400);
    issueMove(h, p.x, p.y);
    return;
  }

  // Combate contra heróis
  if (foes.length) {
    const allies = allyHeroesNear(h, 900).length + 1;
    const nFoes = foes.filter((e) => dist(h, e) < 900).length;
    let best = null, bestScore = -Infinity, threat = null, threatScore = Infinity;
    for (const e of foes) {
      const d = dist(h, e);
      if (d > 800) continue;
      const eR = e.hp / e.maxHp;
      const base = (hpR - eR) + (h.level - e.level) * 0.08 + (allies - nFoes) * 0.25 + D.aggro + (eR < 0.3 ? 0.35 : 0);
      if (base < threatScore) { threatScore = base; threat = e; }
      let score = base - d / 2500;
      if (enemyTowerCovering(e, team) && eR > 0.2) score -= 0.7;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (best && bestScore > -0.05) {
      issueAttack(h, best);
      botCast(h, best, D);
      return;
    }
    if (threat && threatScore < -0.35 && dist(h, threat) < 650) {
      const p = lanePointAt(lane, team, myProg - 300);
      issueMove(h, p.x, p.y);
      return;
    }
  }

  // Farm: tropas inimigas
  const reach = h.range + 300;
  let lh = null, low = null;
  for (const m of G.units) {
    if (m.kind !== 'minion' || m.dead || m.team === team || !m.visible[team]) continue;
    if (dist(h, m) > reach) continue;
    const cov = enemyTowerCovering(m, team);
    if (cov && !towerHasMinionTank(cov)) continue;
    const eff = getAD(h) * 100 / (100 + m.armor);
    if (m.hp <= eff * 1.05 && (!lh || m.hp < lh.hp)) lh = m;
    if (!low || m.hp < low.hp) low = m;
  }
  const target = lh || low;
  if (target) {
    issueAttack(h, target);
    // Limpar a onda com habilidade de vez em quando
    if (h.mana > h.maxMana * 0.6 && Math.random() < 0.08 * D.castChance) {
      const q = h.def.abilities[0];
      if ((q.ai === 'damage' || q.ai === 'selfaoe') && dist(h, target) < q.range * 0.9) castAbility(h, 0, target.x, target.y);
    }
    return;
  }

  // Estruturas inimigas
  for (const s of G.units) {
    if (!isStructure(s) || s.dead || s.team === team || !s.vuln) continue;
    if (dist(h, s) < 750 && (s.kind === 'nexus' || towerHasMinionTank(s))) { issueAttack(h, s); return; }
  }

  // Monstros próximos atacando o bot
  for (const m of G.units) {
    if (m.kind === 'monster' && !m.dead && m.target === h) { issueAttack(h, m); return; }
  }

  // Posicionar-se na rota
  const p = lanePointAt(lane, team, desired);
  const jitter = (h.id % 5 - 2) * 25 * (team === 0 ? 1 : -1);
  if (dist2(h.x, h.y, p.x + jitter, p.y - jitter) > 70 * 70) issueMove(h, p.x + jitter, p.y - jitter);
  else if (h.target) issueStop(h);
}

function botCast(h, t, D) {
  const d = dist(h, t);
  const hpR = h.hp / h.maxHp, tR = t.hp / t.maxHp;
  const abs = h.def.abilities;
  // Feitiço de cura em luta
  if (hpR < 0.3 && h.sumCds[1] <= 0) castSummoner(h, 1, h.x, h.y);
  for (let i = 3; i >= 0; i--) {
    if (!canCast(h, i) || Math.random() > D.castChance) continue;
    if (i === 3 && tR > 0.75 && enemyHeroesNear(h, 700).length < 2) continue;
    const ab = abs[i];
    let ok = false, tx = t.x, ty = t.y;
    switch (ab.ai) {
      case 'damage': {
        if (d <= ab.range * 0.92) {
          const lead = ab.speed ? d / ab.speed : 0.5;
          tx = t.x + t.vx * lead * D.aim; ty = t.y + t.vy * lead * D.aim;
          ok = true;
        }
        break;
      }
      case 'selfaoe': ok = d <= ab.range * 0.85; break;
      case 'engage': ok = d <= ab.range && d > 140 && hpR > 0.35 && !enemyTowerCovering(t, h.team); break;
      case 'buff': ok = d <= h.range + 150; break;
      case 'shield': ok = hpR < 0.75 && d < 500; break;
      default: ok = false;
    }
    if (ok && castAbility(h, i, tx, ty)) return;
  }
}
