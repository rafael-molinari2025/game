'use strict';
// =====================================================================
//  Dados do jogo: mapa, rotas, torres, heróis, itens e monstros
// =====================================================================

const MAP = 3600;
const NEUTRAL = 2;
const TEAM_COLORS = ['#4aa3ff', '#ff5a5a', '#c08cff'];
const TEAM_NAMES = ['Azul', 'Vermelho'];
const NEXUS_POS = [{ x: 330, y: 3270 }, { x: 3270, y: 330 }];
const FOUNTAIN = [{ x: 150, y: 3450 }, { x: 3450, y: 150 }];
const FOUNTAIN_R = 330;
const START_GOLD = 500;
const GOLD_PER_SEC = 2.2;
const WAVE_INTERVAL = 30;
const FIRST_WAVE = 8;
const MAX_LEVEL = 18;

// ---------------------------------------------------------------- Rotas
function buildLane(name, points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { name, points, segs, total };
}

// Os caminhos vão da base Azul (canto inferior esquerdo) até a base Vermelha
const LANES = {
  top: buildLane('top', [{ x: 330, y: 3270 }, { x: 380, y: 2880 }, { x: 380, y: 380 }, { x: 2880, y: 380 }, { x: 3270, y: 330 }]),
  mid: buildLane('mid', [{ x: 330, y: 3270 }, { x: 3270, y: 330 }]),
  bot: buildLane('bot', [{ x: 330, y: 3270 }, { x: 720, y: 3220 }, { x: 3220, y: 3220 }, { x: 3220, y: 720 }, { x: 3270, y: 330 }]),
};
const LANE_NAMES_PT = { top: 'Topo', mid: 'Meio', bot: 'Baixo' };

function laneProject(lane, x, y) {
  let best = Infinity, prog = 0;
  for (const s of lane.segs) {
    const r = pointSegDist(x, y, s.a.x, s.a.y, s.b.x, s.b.y);
    if (r.d < best) { best = r.d; prog = s.start + r.t * s.len; }
  }
  return { prog, off: best };
}
// Progresso na rota relativo ao time (0 = própria base)
function teamProg(lane, team, x, y) {
  const p = laneProject(lane, x, y).prog;
  return team === 0 ? p : lane.total - p;
}
function lanePointAt(lane, team, prog) {
  const p = clamp(team === 0 ? prog : lane.total - prog, 0, lane.total);
  for (let i = 0; i < lane.segs.length; i++) {
    const s = lane.segs[i];
    if (p <= s.start + s.len || i === lane.segs.length - 1) {
      const t = s.len ? clamp((p - s.start) / s.len, 0, 1) : 0;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t) };
    }
  }
  return { x: lane.points[0].x, y: lane.points[0].y };
}

// ---------------------------------------------------------------- Torres
const BLUE_TOWERS = [
  { lane: 'top', tier: 1, x: 380, y: 1300 }, { lane: 'top', tier: 2, x: 380, y: 2300 },
  { lane: 'mid', tier: 1, x: 1390, y: 2210 }, { lane: 'mid', tier: 2, x: 900, y: 2700 },
  { lane: 'bot', tier: 1, x: 2300, y: 3220 }, { lane: 'bot', tier: 2, x: 1300, y: 3220 },
  { lane: 'base', tier: 3, x: 540, y: 2920 }, { lane: 'base', tier: 3, x: 680, y: 3060 },
];
const LANE_SWAP = { top: 'bot', bot: 'top', mid: 'mid', base: 'base' };
const TOWER_DEFS = [
  ...BLUE_TOWERS.map((t) => ({ ...t, team: 0 })),
  ...BLUE_TOWERS.map((t) => ({ lane: LANE_SWAP[t.lane], tier: t.tier, x: MAP - t.x, y: MAP - t.y, team: 1 })),
];

// ---------------------------------------------------------------- Tropas
const MINION_TYPES = {
  melee: { hp: 450, hpG: 22, ad: 14, adG: 1.0, range: 60, as: 0.8, ms: 135, armor: 8, r: 14, gold: 21, xp: 60, ranged: false },
  ranged: { hp: 290, hpG: 12, ad: 24, adG: 1.6, range: 330, as: 0.65, ms: 135, armor: 0, r: 12, gold: 15, xp: 30, ranged: true },
  siege: { hp: 850, hpG: 40, ad: 42, adG: 3.0, range: 380, as: 0.5, ms: 130, armor: 20, r: 18, gold: 60, xp: 95, ranged: true },
};

// ---------------------------------------------------------------- Selva
const MONSTER_TYPES = {
  lobo: { name: 'Lobo Sombrio', hp: 1100, ad: 35, armor: 15, mr: 10, r: 24, gold: 75, xp: 110, respawn: 75, color: '#7d6a9e' },
  arauto: { name: 'Arauto de Pedra', hp: 4000, ad: 75, armor: 35, mr: 30, r: 44, gold: 150, xp: 300, respawn: 240, color: '#9a8466', reward: 'teamGold' },
  serpe: { name: 'Serpe Ancestral', hp: 5200, ad: 95, armor: 40, mr: 40, r: 48, gold: 200, xp: 350, respawn: 300, color: '#3fae8c', reward: 'teamBuff' },
};
const CAMPS = [
  { x: 900, y: 1500, type: 'lobo' }, { x: 1500, y: 900, type: 'lobo' },
  { x: 2100, y: 2700, type: 'lobo' }, { x: 2700, y: 2100, type: 'lobo' },
  { x: 1150, y: 1150, type: 'arauto' }, { x: 2450, y: 2450, type: 'serpe' },
];

// ---------------------------------------------------------------- Itens
const ITEMS = [
  { id: 'pocao', name: 'Poção de Vida', cost: 50, stats: {}, consumable: true, color: '#e8516b', abbr: 'Po', desc: 'Use (1-6): recupera 160 de vida em 10s.' },
  { id: 'botas', name: 'Botas Velozes', cost: 300, stats: { ms: 35 }, color: '#b38b5d', abbr: 'Bo' },
  { id: 'adaga', name: 'Adaga Ágil', cost: 300, stats: { as: 0.15 }, color: '#e0c34a', abbr: 'Ad' },
  { id: 'espada', name: 'Espada Longa', cost: 350, stats: { ad: 12 }, color: '#d97a4a', abbr: 'Es' },
  { id: 'tomo', name: 'Tomo Ampliador', cost: 400, stats: { ap: 25 }, color: '#8a6bf0', abbr: 'To' },
  { id: 'cristal', name: 'Cristal de Rubi', cost: 400, stats: { hp: 180 }, color: '#d9415a', abbr: 'Cr' },
  { id: 'cota', name: 'Cota de Malha', cost: 450, stats: { armor: 25 }, color: '#9aa4ad', abbr: 'Co' },
  { id: 'manto', name: 'Manto Arcano', cost: 450, stats: { mr: 25 }, color: '#5ab2c9', abbr: 'Ma' },
  { id: 'vampira', name: 'Lâmina Vampírica', cost: 900, stats: { ad: 20, lifesteal: 0.12 }, color: '#b3263c', abbr: 'LV' },
  { id: 'orbe', name: 'Orbe do Sábio', cost: 950, stats: { ap: 35, mana: 300, cdr: 0.1 }, color: '#5c7cfa', abbr: 'OS' },
  { id: 'gigante', name: 'Cinturão do Gigante', cost: 1000, stats: { hp: 450 }, color: '#c2553d', abbr: 'CG' },
  { id: 'cajado', name: 'Cajado do Vazio', cost: 1100, stats: { ap: 65 }, color: '#6a3fd1', abbr: 'CV' },
  { id: 'egide', name: 'Égide Rúnica', cost: 1200, stats: { armor: 40, mr: 30, hp: 200 }, color: '#4f9c88', abbr: 'ÉR' },
  { id: 'furia', name: 'Gume da Fúria', cost: 1300, stats: { ad: 40, as: 0.2 }, color: '#ff7a1a', abbr: 'GF' },
  { id: 'relogio', name: 'Ampulheta Rúnica', cost: 1250, stats: { ap: 50, cdr: 0.15, armor: 20 }, color: '#d6b45c', abbr: 'AR' },
];
const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const STAT_LABELS = { ad: 'Dano', ap: 'Poder', hp: 'Vida', mana: 'Mana', armor: 'Armadura', mr: 'Resist. Mágica', as: 'Vel. de Ataque', ms: 'Velocidade', lifesteal: 'Roubo de Vida', cdr: 'Redução de Recarga' };
function itemStatText(item) {
  if (item.desc) return item.desc;
  return Object.entries(item.stats).map(([k, v]) => {
    const pct = k === 'as' || k === 'lifesteal' || k === 'cdr';
    return '+' + (pct ? Math.round(v * 100) + '%' : v) + ' ' + STAT_LABELS[k];
  }).join(', ');
}

// ---------------------------------------------------------------- Feitiços
const SUMMONERS = [
  { key: 'D', name: 'Lampejo', cd: 150, color: '#ffe066', desc: () => 'Teleporta você uma curta distância na direção do cursor.' },
  { key: 'F', name: 'Cura', cd: 120, color: '#69db7c', desc: (h) => `Recupera ${fmtN(80 + 20 * h.level)} de vida e dá 30% de velocidade por 1,5s.` },
];

// ---------------------------------------------------------------- Heróis
// Tipos de IA das habilidades: damage (projétil/área em ponto), selfaoe (ao redor),
// engage (avanço), buff, shield (defensiva), escape (fuga)
const HEROES = {
  kael: {
    name: 'Kael', title: 'Lâmina Solar', role: 'Lutador', color: '#f2b441', melee: true,
    desc: 'Guerreiro corpo a corpo que avança sobre os inimigos e explode em luz solar.',
    hp: 650, hpG: 98, mana: 300, manaG: 38, ad: 62, adG: 3.6, ap: 0, apG: 0,
    armor: 30, armorG: 3.4, mr: 30, mrG: 1.3, range: 115, as: 0.68, asG: 0.025, ms: 240,
    hpRegen: 3, manaRegen: 2.2, projColor: '#ffd27a',
    build: ['botas', 'espada', 'vampira', 'cota', 'gigante', 'furia', 'egide'],
    abilities: [
      {
        key: 'Q', name: 'Corte Solar', cd: 6, cost: 35, range: 290, ai: 'selfaoe', color: '#ffcf5a',
        dmg: (h) => 45 + 20 * h.level + 0.9 * getAD(h),
        desc(h) { return `Golpeia em cone à frente, causando ${fmtN(this.dmg(h))} de dano físico.`; },
        cast(h, tx, ty) {
          const a = Math.atan2(ty - h.y, tx - h.x); h.facing = a;
          const dmg = this.dmg(h);
          for (const e of enemiesInRadius(h.team, h.x, h.y, this.range)) {
            if (angleDiff(Math.atan2(e.y - h.y, e.x - h.x), a) < 1.0) dealDamage(h, e, dmg, 'phys');
          }
          spawnFx({ kind: 'cone', x: h.x, y: h.y, a, r: this.range, spread: 1.0, color: this.color, dur: 0.25 });
        },
      },
      {
        key: 'W', name: 'Égide Solar', cd: 14, cost: 50, range: 0, ai: 'shield', color: '#fff3bf',
        amt: (h) => 60 + 22 * h.level + 0.08 * h.maxHp,
        desc(h) { return `Ganha um escudo de ${fmtN(this.amt(h))} por 3s e 30% de velocidade por 2s.`; },
        cast(h) {
          addBuff(h, 'shield', this.amt(h), 3);
          addBuff(h, 'haste', 0.3, 2, 'kaelW');
          spawnFx({ kind: 'ring', x: h.x, y: h.y, r: 70, color: this.color, dur: 0.4, follow: h });
        },
      },
      {
        key: 'E', name: 'Investida', cd: 10, cost: 45, range: 380, ai: 'engage', color: '#ffa94d',
        dmg: (h) => 35 + 16 * h.level + 0.6 * getAD(h),
        desc(h) { return `Avança na direção do cursor, causando ${fmtN(this.dmg(h))} de dano físico e lentidão aos inimigos atravessados.`; },
        cast(h, tx, ty) {
          const p = clampRange(h, tx, ty, this.range); const dmg = this.dmg(h);
          startDash(h, p.x, p.y, 1150, {
            color: this.color,
            onPass: (e) => { dealDamage(h, e, dmg, 'phys'); addBuff(e, 'slow', 0.35, 1, 'kaelE'); },
          });
        },
      },
      {
        key: 'R', name: 'Eclipse', cd: 60, cost: 100, range: 320, ai: 'selfaoe', color: '#ffe066',
        dmg: (h) => 140 + 38 * h.level + 1.0 * getAD(h),
        desc(h) { return `Após 0,35s, explode em luz ao seu redor, causando ${fmtN(this.dmg(h))} de dano físico e atordoando por 1s.`; },
        cast(h) {
          const dmg = this.dmg(h);
          addDelayed({
            x: h.x, y: h.y, r: this.range, delay: 0.35, follow: h, color: this.color, team: h.team,
            onTrigger: (e) => {
              for (const u of enemiesInRadius(h.team, e.x, e.y, e.r)) { dealDamage(h, u, dmg, 'phys'); addBuff(u, 'stun', 1, 1, 'kaelR'); }
              spawnFx({ kind: 'ring', x: e.x, y: e.y, r: e.r, color: '#fff3bf', dur: 0.5 });
              burst(e.x, e.y, '#ffd43b', 40, 320);
            },
          });
        },
      },
    ],
  },

  lyra: {
    name: 'Lyra', title: 'Arqueira dos Ventos', role: 'Atiradora', color: '#63e6be', melee: false,
    desc: 'Atiradora de longo alcance com muito dano contínuo e uma chuva de flechas devastadora.',
    hp: 540, hpG: 86, mana: 320, manaG: 35, ad: 58, adG: 3.2, ap: 0, apG: 0,
    armor: 22, armorG: 3.0, mr: 30, mrG: 1.0, range: 525, as: 0.72, asG: 0.03, ms: 230,
    hpRegen: 2.5, manaRegen: 2.4, projColor: '#9effc4',
    build: ['botas', 'adaga', 'espada', 'vampira', 'furia', 'furia', 'manto'],
    abilities: [
      {
        key: 'Q', name: 'Flecha Perfurante', cd: 7, cost: 50, range: 950, ai: 'damage', speed: 1400, color: '#7dffb0',
        dmg: (h) => 40 + 22 * h.level + 1.0 * getAD(h),
        desc(h) { return `Dispara uma flecha que atravessa inimigos em linha, causando ${fmtN(this.dmg(h))} de dano físico.`; },
        cast(h, tx, ty) {
          const dmg = this.dmg(h);
          fireSkillshot(h, tx, ty, { speed: this.speed, range: this.range, r: 20, color: this.color, pierce: true, onHit: (e) => dealDamage(h, e, dmg, 'phys') });
        },
      },
      {
        key: 'W', name: 'Frenesi', cd: 14, cost: 40, range: 0, ai: 'buff', color: '#ffe066',
        desc() { return 'Ganha 60% de velocidade de ataque e 15% de velocidade de movimento por 5s.'; },
        cast(h) {
          addBuff(h, 'aspeed', 0.6, 5, 'lyraW'); addBuff(h, 'haste', 0.15, 5, 'lyraW');
          spawnFx({ kind: 'ring', x: h.x, y: h.y, r: 60, color: this.color, dur: 0.4, follow: h });
        },
      },
      {
        key: 'E', name: 'Salto do Vento', cd: 12, cost: 30, range: 320, ai: 'escape', color: '#a5d8ff',
        desc() { return 'Salta rapidamente na direção do cursor.'; },
        cast(h, tx, ty) { const p = clampRange(h, tx, ty, this.range); startDash(h, p.x, p.y, 1000, { color: this.color }); },
      },
      {
        key: 'R', name: 'Chuva de Flechas', cd: 70, cost: 100, range: 1100, ai: 'damage', speed: 0, color: '#38d9a9',
        dmg: (h) => 220 + 48 * h.level + 0.9 * getAD(h),
        desc(h) { return `Faz chover flechas numa área por 2s, causando até ${fmtN(this.dmg(h))} de dano físico e 40% de lentidão.`; },
        cast(h, tx, ty) {
          const p = clampRange(h, tx, ty, this.range); const tick = this.dmg(h) / 8;
          addZone({
            x: p.x, y: p.y, r: 270, dur: 2, every: 0.25, color: this.color, team: h.team,
            onTick: (z) => {
              for (const u of enemiesInRadius(h.team, z.x, z.y, z.r)) { dealDamage(h, u, tick, 'phys'); addBuff(u, 'slow', 0.4, 0.5, 'lyraR'); }
              for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, d = Math.random() * z.r; spark(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, '#b2f2bb'); }
            },
          });
        },
      },
    ],
  },

  morvek: {
    name: 'Morvek', title: 'Mago do Abismo', role: 'Mago', color: '#9775fa', melee: false,
    desc: 'Mago que controla áreas e causa explosões enormes de dano mágico.',
    hp: 520, hpG: 82, mana: 480, manaG: 45, ad: 50, adG: 2.8, ap: 25, apG: 4,
    armor: 20, armorG: 3.0, mr: 30, mrG: 1.0, range: 480, as: 0.64, asG: 0.018, ms: 228,
    hpRegen: 2.4, manaRegen: 3.5, projColor: '#c38bff',
    build: ['botas', 'tomo', 'orbe', 'cajado', 'relogio', 'cajado', 'manto'],
    abilities: [
      {
        key: 'Q', name: 'Orbe Sombrio', cd: 5, cost: 50, range: 900, ai: 'damage', speed: 1000, color: '#b197fc',
        dmg: (h) => 60 + 26 * h.level + 0.75 * h.ap,
        desc(h) { return `Lança um orbe que explode no primeiro inimigo atingido, causando ${fmtN(this.dmg(h))} de dano mágico em área.`; },
        cast(h, tx, ty) {
          const dmg = this.dmg(h);
          fireSkillshot(h, tx, ty, {
            speed: this.speed, range: this.range, r: 18, color: this.color,
            onHit: (e, p) => {
              for (const u of enemiesInRadius(h.team, p.x, p.y, 140)) dealDamage(h, u, dmg, 'magic');
              spawnFx({ kind: 'ring', x: p.x, y: p.y, r: 140, color: this.color, dur: 0.35 });
              burst(p.x, p.y, '#d0bfff', 14, 160);
            },
          });
        },
      },
      {
        key: 'W', name: 'Poço do Abismo', cd: 12, cost: 70, range: 750, ai: 'damage', speed: 0, color: '#7048e8',
        dmg: (h) => 90 + 30 * h.level + 0.6 * h.ap,
        desc(h) { return `Cria uma área sombria por 3s que causa até ${fmtN(this.dmg(h))} de dano mágico e 35% de lentidão.`; },
        cast(h, tx, ty) {
          const p = clampRange(h, tx, ty, this.range); const tick = this.dmg(h) / 6;
          addZone({
            x: p.x, y: p.y, r: 210, dur: 3, every: 0.5, color: this.color, team: h.team,
            onTick: (z) => { for (const u of enemiesInRadius(h.team, z.x, z.y, z.r)) { dealDamage(h, u, tick, 'magic'); addBuff(u, 'slow', 0.35, 0.6, 'morvekW'); } },
          });
        },
      },
      {
        key: 'E', name: 'Passo Etéreo', cd: 14, cost: 60, range: 400, ai: 'escape', color: '#e599f7',
        desc() { return 'Teleporta-se instantaneamente para o local indicado.'; },
        cast(h, tx, ty) { const p = clampRange(h, tx, ty, this.range); blink(h, p.x, p.y, this.color); },
      },
      {
        key: 'R', name: 'Colapso Estelar', cd: 65, cost: 120, range: 950, ai: 'damage', speed: 0, color: '#da77f2',
        dmg: (h) => 240 + 55 * h.level + 1.0 * h.ap,
        desc(h) { return `Após 1s, uma estrela colapsa na área, causando ${fmtN(this.dmg(h))} de dano mágico e atordoando por 0,8s.`; },
        cast(h, tx, ty) {
          const p = clampRange(h, tx, ty, this.range); const dmg = this.dmg(h);
          addDelayed({
            x: p.x, y: p.y, r: 260, delay: 1.0, color: this.color, team: h.team,
            onTrigger: (e) => {
              for (const u of enemiesInRadius(h.team, e.x, e.y, e.r)) { dealDamage(h, u, dmg, 'magic'); addBuff(u, 'stun', 0.8, 0.8, 'morvekR'); }
              spawnFx({ kind: 'ring', x: e.x, y: e.y, r: e.r, color: '#f3d9fa', dur: 0.5 });
              burst(e.x, e.y, '#e599f7', 50, 360);
            },
          });
        },
      },
    ],
  },

  thorn: {
    name: 'Thorn', title: 'Colosso de Pedra', role: 'Tanque', color: '#8fb3a0', melee: true,
    desc: 'Tanque enorme que aguenta muito dano, atordoa grupos e protege os aliados.',
    hp: 720, hpG: 108, mana: 300, manaG: 35, ad: 56, adG: 3.0, ap: 0, apG: 0,
    armor: 36, armorG: 3.8, mr: 32, mrG: 1.5, range: 120, as: 0.64, asG: 0.02, ms: 232,
    hpRegen: 3.5, manaRegen: 2.2, projColor: '#c3fae8',
    build: ['botas', 'cristal', 'cota', 'gigante', 'egide', 'manto', 'egide'],
    abilities: [
      {
        key: 'Q', name: 'Rocha Arremessada', cd: 7, cost: 45, range: 850, ai: 'damage', speed: 1050, color: '#a9e34b',
        dmg: (h) => 50 + 20 * h.level + 0.05 * h.maxHp,
        desc(h) { return `Arremessa uma rocha que causa ${fmtN(this.dmg(h))} de dano mágico e 35% de lentidão por 1,5s.`; },
        cast(h, tx, ty) {
          const dmg = this.dmg(h);
          fireSkillshot(h, tx, ty, {
            speed: this.speed, range: this.range, r: 24, color: '#94a3a0',
            onHit: (e) => { dealDamage(h, e, dmg, 'magic'); addBuff(e, 'slow', 0.35, 1.5, 'thornQ'); burst(e.x, e.y, '#adb5bd', 10, 140); },
          });
        },
      },
      {
        key: 'W', name: 'Pele de Granito', cd: 15, cost: 50, range: 0, ai: 'shield', color: '#ced4da',
        desc() { return 'Reduz todo o dano recebido em 35% por 4s.'; },
        cast(h) { addBuff(h, 'reduce', 0.35, 4, 'thornW'); spawnFx({ kind: 'ring', x: h.x, y: h.y, r: 70, color: this.color, dur: 0.5, follow: h }); },
      },
      {
        key: 'E', name: 'Tremor', cd: 9, cost: 50, range: 260, ai: 'selfaoe', color: '#d8a657',
        dmg: (h) => 40 + 18 * h.level + 0.03 * h.maxHp,
        desc(h) { return `Golpeia o chão, causando ${fmtN(this.dmg(h))} de dano mágico ao redor e 40% de lentidão.`; },
        cast(h) {
          const dmg = this.dmg(h);
          for (const u of enemiesInRadius(h.team, h.x, h.y, this.range)) { dealDamage(h, u, dmg, 'magic'); addBuff(u, 'slow', 0.4, 1.5, 'thornE'); }
          spawnFx({ kind: 'ring', x: h.x, y: h.y, r: this.range, color: this.color, dur: 0.4 });
          burst(h.x, h.y, '#c9a26b', 24, 240);
        },
      },
      {
        key: 'R', name: 'Avalanche', cd: 70, cost: 100, range: 650, ai: 'engage', color: '#ffd8a8',
        dmg: (h) => 120 + 35 * h.level + 0.06 * h.maxHp,
        desc(h) { return `Investe até o local indicado e, ao aterrissar, causa ${fmtN(this.dmg(h))} de dano mágico em área e atordoa por 1,2s.`; },
        cast(h, tx, ty) {
          const p = clampRange(h, tx, ty, this.range); const dmg = this.dmg(h);
          startDash(h, p.x, p.y, 1300, {
            color: this.color,
            onEnd: () => {
              for (const u of enemiesInRadius(h.team, h.x, h.y, 270)) { dealDamage(h, u, dmg, 'magic'); addBuff(u, 'stun', 1.2, 1.2, 'thornR'); }
              spawnFx({ kind: 'ring', x: h.x, y: h.y, r: 270, color: this.color, dur: 0.5 });
              burst(h.x, h.y, '#e9c48a', 40, 300);
            },
          });
        },
      },
    ],
  },
};
const HERO_IDS = Object.keys(HEROES);

const LANE_ORDER = { 1: ['mid'], 3: ['mid', 'top', 'bot'], 5: ['mid', 'top', 'bot', 'bot', 'top'] };
const BOT_NAMES = ['Atlas', 'Nyx', 'Orion', 'Vega', 'Ícaro', 'Juno', 'Talos', 'Selene', 'Kiro', 'Íris', 'Draco', 'Luna', 'Fênix', 'Zeca', 'Mira', 'Bento', 'Tália', 'Rex'];
