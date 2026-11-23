'use strict';
// =====================================================================
//  Skins (cosméticos pagos via Stripe Payment Links)
//
//  O jogo não tem servidor: a compra acontece na página do Stripe e, ao
//  final, o Stripe redireciona o jogador de volta com
//  ?compra=<sku>&cs=<id da Checkout Session>. O desbloqueio fica salvo
//  apenas neste navegador (localStorage) — é um sistema de confiança,
//  adequado para itens puramente cosméticos.
// =====================================================================

const SKINS = {
  kael_eclipse: {
    id: 'kael_eclipse', hero: 'kael', name: 'Eclipse Lunar',
    color: '#9fb4ff', accent: '#e7ecff', price: 'R$ 4,90',
    link: 'https://buy.stripe.com/test_dRm9ALczu0Em5z69r0cZa00',
  },
  lyra_aurora: {
    id: 'lyra_aurora', hero: 'lyra', name: 'Aurora Boreal',
    color: '#c77dff', accent: '#72efdd', price: 'R$ 4,90',
    link: 'https://buy.stripe.com/test_3cIfZ91UQ9aSaTq5aKcZa01',
  },
  morvek_inferno: {
    id: 'morvek_inferno', hero: 'morvek', name: 'Chama Infernal',
    color: '#ff6b35', accent: '#ffd166', price: 'R$ 4,90',
    link: 'https://buy.stripe.com/test_9B63cn1UQ72KaTq7iScZa02',
  },
  thorn_glacial: {
    id: 'thorn_glacial', hero: 'thorn', name: 'Cristal Glacial',
    color: '#74c0fc', accent: '#e3fafc', price: 'R$ 4,90',
    link: 'https://buy.stripe.com/test_8x2dR19ni9aS4v21YycZa03',
  },
};

const SKIN_BUNDLE = {
  id: 'pacote_runico', name: 'Pacote Rúnico', price: 'R$ 14,90',
  link: 'https://buy.stripe.com/test_7sY5kv7fa72K2mUeLkcZa04',
  unlocks: Object.keys(SKINS),
};

const SKIN_STORE_KEY = 'arena-runica.skins.v1';

// Estado salvo: { owned: [skinId...], equipped: { heroId: skinId|null } }
const skinState = loadSkinState();

function loadSkinState() {
  const empty = { owned: [], equipped: {} };
  try {
    const raw = localStorage.getItem(SKIN_STORE_KEY);
    if (!raw) return empty;
    const s = JSON.parse(raw);
    return {
      owned: Array.isArray(s.owned) ? s.owned.filter((id) => SKINS[id]) : [],
      equipped: s.equipped && typeof s.equipped === 'object' ? s.equipped : {},
    };
  } catch (e) {
    return empty;
  }
}

function saveSkinState() {
  try { localStorage.setItem(SKIN_STORE_KEY, JSON.stringify(skinState)); } catch (e) { /* modo privado etc. */ }
}

function ownsSkin(id) { return skinState.owned.includes(id); }
function skinsForHero(heroId) { return Object.values(SKINS).filter((s) => s.hero === heroId); }

function equippedSkin(heroId) {
  const id = skinState.equipped[heroId];
  return id && SKINS[id] && ownsSkin(id) ? SKINS[id] : null;
}

function equipSkin(heroId, skinId) {
  skinState.equipped[heroId] = skinId && ownsSkin(skinId) ? skinId : null;
  saveSkinState();
}

function unlockSkins(ids) {
  for (const id of ids) {
    if (!SKINS[id] || ownsSkin(id)) continue;
    skinState.owned.push(id);
    // Equipa automaticamente a skin recém-comprada
    skinState.equipped[SKINS[id].hero] = id;
  }
  saveSkinState();
}

// Cor de exibição de um herói, respeitando a skin equipada
function heroColor(h) { return h.skin ? h.skin.color : h.def.color; }

// Trata o retorno do Stripe (?compra=<sku>&cs=<session id>). Retorna a
// mensagem a exibir, ou null se a URL não for um retorno de compra.
function handlePurchaseReturn() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return null; }
  const sku = params.get('compra');
  if (!sku) return null;
  const cs = params.get('cs') || '';

  // Limpa a URL para que recarregar a página não repita a mensagem
  try {
    params.delete('compra'); params.delete('cs');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  } catch (e) { /* ignora */ }

  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(cs)) return null;

  if (sku === SKIN_BUNDLE.id) {
    unlockSkins(SKIN_BUNDLE.unlocks);
    return 'Compra concluída! Todas as skins foram desbloqueadas.';
  }
  if (SKINS[sku]) {
    unlockSkins([sku]);
    const s = SKINS[sku];
    return `Compra concluída! Skin ${HEROES[s.hero].name} ${s.name} desbloqueada.`;
  }
  return null;
}
