/* Jarvis — assistente pessoal de voz (PWA)
 * Voz: Web Speech API do navegador (reconhecimento e fala em pt-BR)
 * Cérebro: Google Gemini (cota gratuita), chamado direto do navegador
 * Dados (chave, memória, notas, lembretes) ficam salvos só neste aparelho.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- armazenamento
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('jarvis.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('jarvis.' + key, JSON.stringify(value)); } catch { /* sem armazenamento */ }
    },
  };

  const DEFAULT_MODEL = 'gemini-2.5-flash';
  const cfg = Object.assign(
    { key: '', model: DEFAULT_MODEL, name: '', city: '', conversation: false, wake: false, muted: false },
    store.get('cfg', {})
  );
  let history = store.get('history', []);   // conteúdos no formato do Gemini
  let memory = store.get('memory', []);     // fatos sobre o usuário
  let notes = store.get('notes', []);
  let reminders = store.get('reminders', []);

  const saveCfg = () => store.set('cfg', cfg);
  const saveHistory = () => store.set('history', history);
  const saveMemory = () => store.set('memory', memory);
  const saveNotes = () => store.set('notes', notes);
  const saveReminders = () => store.set('reminders', reminders);

  // ---------------------------------------------------------------- elementos
  const $ = (id) => document.getElementById(id);
  const orb = $('orb');
  const statusEl = $('status');
  const interimEl = $('interim');
  const chat = $('chat');
  const form = $('form');
  const input = $('input');
  const btnMic = $('btnMic');
  const btnMute = $('btnMute');
  const dlg = $('settings');

  // ---------------------------------------------------------------- interface
  let busy = false;

  function setState(state, text) {
    orb.classList.remove('idle', 'listening', 'thinking', 'speaking');
    orb.classList.add(state);
    btnMic.classList.toggle('active', state === 'listening');
    if (text !== undefined) statusEl.textContent = text;
  }

  function idleText() {
    if (cfg.wake && wakeSupported()) return 'Diga "Jarvis" ou toque no microfone';
    return 'Toque no microfone para falar';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderText(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(https?:\/\/[^\s<]*[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return html;
  }

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = renderText(text);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function addLink(label, url) {
    const div = document.createElement('div');
    div.className = 'msg bot';
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '🔗 ' + label;
    div.appendChild(a);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function renderHistory() {
    chat.innerHTML = '';
    for (const c of history) {
      const text = (c.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      if (!text) continue;
      addMsg(c.role === 'user' ? 'user' : 'bot', text);
    }
  }

  // ---------------------------------------------------------------- fala (TTS)
  let voice = null;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    const pt = voices.filter((v) => /^pt(-|_)BR/i.test(v.lang));
    voice = pt.find((v) => /google/i.test(v.name)) || pt[0] || voices.find((v) => /^pt/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function cleanForSpeech(text) {
    return text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (cfg.muted || !('speechSynthesis' in window)) return resolve();
      const clean = cleanForSpeech(text);
      if (!clean) return resolve();
      speechSynthesis.cancel();
      // frases curtas: o Chrome corta falas longas
      const chunks = clean.match(/[^.!?;]+[.!?;]*/g) || [clean];
      let i = 0;
      setState('speaking', 'Falando…');
      const next = () => {
        if (i >= chunks.length) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(chunks[i++].trim());
        u.lang = 'pt-BR';
        if (voice) u.voice = voice;
        u.rate = 1.05;
        u.onend = next;
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
      };
      next();
    });
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // ---------------------------------------------------------------- reconhecimento de voz
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let cmdRec = null;   // ouvindo um comando
  let wakeRec = null;  // ouvindo a palavra "Jarvis"
  let wakeWanted = false;

  const wakeSupported = () => !!SR;

  function listen() {
    if (!SR) {
      addMsg('error', 'Seu navegador não reconhece voz. Use o Google Chrome (no Android ou no PC). Você ainda pode digitar.');
      return;
    }
    if (busy) return;
    stopSpeaking();
    stopWake();
    if (cmdRec) { cmdRec.abort(); cmdRec = null; }

    const rec = new SR();
    cmdRec = rec;
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';

    rec.onstart = () => setState('listening', 'Ouvindo…');
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      interimEl.textContent = finalText + interim;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        addMsg('error', 'Sem permissão para o microfone. Libere o microfone para este site nas configurações do navegador.');
      } else if (e.error === 'network') {
        addMsg('error', 'O reconhecimento de voz precisa de internet.');
      }
    };
    rec.onend = () => {
      if (cmdRec === rec) cmdRec = null;
      interimEl.textContent = '';
      const text = finalText.trim();
      if (text) {
        send(text);
      } else {
        setState('idle', idleText());
        resumeWake();
      }
    };
    try { rec.start(); } catch { /* já iniciado */ }
  }

  function startWake() {
    if (!SR || !cfg.wake) return;
    wakeWanted = true;
    if (wakeRec || cmdRec || busy) return;
    const rec = new SR();
    wakeRec = rec;
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;
    orb.classList.add('wake');

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const said = e.results[i][0].transcript;
        const m = said.match(/\b(jarvis|jarbas|jarvas|jervis)\b[\s,.!?]*(.*)$/i);
        if (!m) continue;
        const command = m[2].trim();
        stopWake(true);
        if (command.length > 2) send(command);
        else { speak('Pois não?').then(listen); }
        return;
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wakeWanted = false;
        addMsg('error', 'Sem permissão para o microfone, então não consigo ficar ouvindo "Jarvis".');
      }
    };
    rec.onend = () => {
      if (wakeRec === rec) wakeRec = null;
      orb.classList.remove('wake');
      // o navegador encerra a escuta de tempos em tempos: reinicia
      if (wakeWanted && cfg.wake && !busy && !cmdRec) setTimeout(startWake, 300);
    };
    try { rec.start(); } catch { wakeRec = null; }
  }

  function stopWake(keepWanted) {
    if (!keepWanted) wakeWanted = false;
    if (wakeRec) {
      const r = wakeRec;
      wakeRec = null;
      try { r.abort(); } catch { /* ignore */ }
    }
    orb.classList.remove('wake');
  }

  function resumeWake() {
    if (cfg.wake) startWake();
  }

  // ---------------------------------------------------------------- ferramentas
  const tools = [
    {
      name: 'obter_data_hora',
      description: 'Retorna a data, o dia da semana e a hora atuais do aparelho do usuário.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'clima',
      description: 'Consulta o clima atual e a previsão de 3 dias. Se a cidade não for informada, usa a cidade padrão ou a localização do aparelho.',
      parameters: {
        type: 'object',
        properties: { cidade: { type: 'string', description: 'Nome da cidade, ex.: "Curitiba"' } },
      },
    },
    {
      name: 'criar_lembrete',
      description: 'Cria um lembrete que avisa o usuário com voz e notificação. Informe "minutos" (daqui a quantos minutos) OU "horario" (HH:MM, hoje ou amanhã se já passou).',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'O que lembrar' },
          minutos: { type: 'number', description: 'Daqui a quantos minutos' },
          horario: { type: 'string', description: 'Horário no formato HH:MM' },
        },
        required: ['texto'],
      },
    },
    {
      name: 'listar_lembretes',
      description: 'Lista os lembretes pendentes.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'cancelar_lembrete',
      description: 'Cancela um lembrete pelo número mostrado em listar_lembretes.',
      parameters: { type: 'object', properties: { numero: { type: 'number' } }, required: ['numero'] },
    },
    {
      name: 'salvar_nota',
      description: 'Salva uma anotação (lista de compras, ideia, recado etc.).',
      parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
    },
    {
      name: 'listar_notas',
      description: 'Lista as anotações salvas.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'apagar_nota',
      description: 'Apaga uma anotação pelo número mostrado em listar_notas.',
      parameters: { type: 'object', properties: { numero: { type: 'number' } }, required: ['numero'] },
    },
    {
      name: 'lembrar_fato',
      description: 'Guarda na memória permanente um fato importante sobre o usuário (preferências, nomes, rotina, gostos). Use quando o usuário contar algo pessoal útil ou pedir para lembrar.',
      parameters: { type: 'object', properties: { fato: { type: 'string' } }, required: ['fato'] },
    },
    {
      name: 'esquecer_fato',
      description: 'Remove um fato da memória pelo número (a lista numerada está nas instruções).',
      parameters: { type: 'object', properties: { numero: { type: 'number' } }, required: ['numero'] },
    },
    {
      name: 'pesquisar_wikipedia',
      description: 'Busca um resumo na Wikipédia em português sobre um assunto, pessoa, lugar ou evento.',
      parameters: { type: 'object', properties: { termo: { type: 'string' } }, required: ['termo'] },
    },
    {
      name: 'abrir',
      description: 'Abre um site ou faz uma busca em outro app: google, youtube (músicas e vídeos), maps (lugares e rotas) ou um endereço (url) direto.',
      parameters: {
        type: 'object',
        properties: {
          onde: { type: 'string', enum: ['google', 'youtube', 'maps', 'url'] },
          termo: { type: 'string', description: 'O que buscar, ou a URL completa quando onde = "url"' },
        },
        required: ['onde', 'termo'],
      },
    },
  ];

  const WEATHER = {
    0: 'céu limpo', 1: 'predominantemente limpo', 2: 'parcialmente nublado', 3: 'nublado',
    45: 'neblina', 48: 'neblina com geada', 51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte',
    61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 66: 'chuva congelante', 67: 'chuva congelante forte',
    71: 'neve fraca', 73: 'neve', 75: 'neve forte', 80: 'pancadas de chuva fracas', 81: 'pancadas de chuva',
    82: 'pancadas de chuva fortes', 95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas fortes com granizo',
  };

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('sem geolocalização'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        reject,
        { timeout: 10000, maximumAge: 600000 }
      );
    });
  }

  async function toolClima({ cidade }) {
    let lat, lon, place;
    const city = (cidade || cfg.city || '').trim();
    if (city) {
      const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=' + encodeURIComponent(city)).then((r) => r.json());
      if (!g.results || !g.results.length) return { erro: 'Cidade não encontrada: ' + city };
      const r = g.results[0];
      lat = r.latitude; lon = r.longitude;
      place = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    } else {
      try {
        ({ lat, lon } = await getPosition());
        place = 'localização atual';
      } catch {
        return { erro: 'Não sei a cidade. Peça ao usuário a cidade ou para configurar a cidade padrão.' };
      }
    }
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3';
    const w = await fetch(url).then((r) => r.json());
    const c = w.current;
    return {
      local: place,
      agora: {
        temperatura: c.temperature_2m + '°C',
        sensacao: c.apparent_temperature + '°C',
        umidade: c.relative_humidity_2m + '%',
        vento: c.wind_speed_10m + ' km/h',
        condicao: WEATHER[c.weather_code] || 'desconhecida',
      },
      previsao: w.daily.time.map((d, i) => ({
        data: d,
        min: w.daily.temperature_2m_min[i] + '°C',
        max: w.daily.temperature_2m_max[i] + '°C',
        chance_chuva: w.daily.precipitation_probability_max[i] + '%',
        condicao: WEATHER[w.daily.weather_code[i]] || 'desconhecida',
      })),
    };
  }

  async function toolWikipedia({ termo }) {
    const url = 'https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&redirects=1&generator=search&gsrlimit=1&gsrsearch=' + encodeURIComponent(termo);
    const data = await fetch(url).then((r) => r.json());
    const pages = data.query && data.query.pages;
    if (!pages) return { erro: 'Nada encontrado na Wikipédia para: ' + termo };
    const p = Object.values(pages)[0];
    return { titulo: p.title, resumo: (p.extract || '').slice(0, 2500), link: 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')) };
  }

  function toolAbrir({ onde, termo }) {
    const q = encodeURIComponent(termo);
    let url, label;
    if (onde === 'youtube') { url = 'https://www.youtube.com/results?search_query=' + q; label = 'YouTube: ' + termo; }
    else if (onde === 'maps') { url = 'https://www.google.com/maps/search/?api=1&query=' + q; label = 'Mapa: ' + termo; }
    else if (onde === 'url') {
      url = /^https?:\/\//i.test(termo) ? termo : 'https://' + termo;
      if (!/^https?:\/\/[^\s]+$/i.test(url)) return { erro: 'URL inválida' };
      label = url;
    } else { url = 'https://www.google.com/search?q=' + q; label = 'Google: ' + termo; }
    const win = window.open(url, '_blank', 'noopener');
    addLink(label, url);
    return { ok: true, aberto: !!win, observacao: win ? 'Aberto em nova aba.' : 'O navegador bloqueou a abertura automática; um botão foi mostrado na tela para o usuário tocar.' };
  }

  function parseWhen({ minutos, horario }) {
    const now = Date.now();
    if (typeof minutos === 'number' && minutos > 0) return now + minutos * 60000;
    if (horario) {
      const m = String(horario).match(/(\d{1,2})[:h](\d{2})?/);
      if (m) {
        const d = new Date();
        d.setHours(+m[1], +(m[2] || 0), 0, 0);
        if (d.getTime() <= now) d.setDate(d.getDate() + 1);
        return d.getTime();
      }
    }
    return null;
  }

  const fmtTime = (ms) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function runTool(name, args) {
    args = args || {};
    switch (name) {
      case 'obter_data_hora': {
        const d = new Date();
        return { agora: d.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' }), fuso: Intl.DateTimeFormat().resolvedOptions().timeZone };
      }
      case 'clima': return toolClima(args);
      case 'criar_lembrete': {
        const when = parseWhen(args);
        if (!when) return { erro: 'Informe em quantos minutos ou o horário (HH:MM).' };
        reminders.push({ id: Date.now(), texto: args.texto, quando: when });
        reminders.sort((a, b) => a.quando - b.quando);
        saveReminders();
        askNotificationPermission();
        return { ok: true, quando: fmtTime(when), aviso: 'O lembrete só toca com o app aberto ou em segundo plano recente.' };
      }
      case 'listar_lembretes':
        return { lembretes: reminders.map((r, i) => ({ numero: i + 1, texto: r.texto, quando: fmtTime(r.quando) })) };
      case 'cancelar_lembrete': {
        const i = Math.round(args.numero) - 1;
        if (!reminders[i]) return { erro: 'Lembrete não encontrado' };
        const [r] = reminders.splice(i, 1);
        saveReminders();
        return { ok: true, cancelado: r.texto };
      }
      case 'salvar_nota':
        notes.push({ texto: args.texto, em: Date.now() });
        saveNotes();
        return { ok: true, total: notes.length };
      case 'listar_notas':
        return { notas: notes.map((n, i) => ({ numero: i + 1, texto: n.texto, em: fmtTime(n.em) })) };
      case 'apagar_nota': {
        const i = Math.round(args.numero) - 1;
        if (!notes[i]) return { erro: 'Nota não encontrada' };
        const [n] = notes.splice(i, 1);
        saveNotes();
        return { ok: true, apagada: n.texto };
      }
      case 'lembrar_fato':
        if (!memory.includes(args.fato)) memory.push(args.fato);
        saveMemory();
        return { ok: true };
      case 'esquecer_fato': {
        const i = Math.round(args.numero) - 1;
        if (!memory[i]) return { erro: 'Fato não encontrado' };
        const [f] = memory.splice(i, 1);
        saveMemory();
        return { ok: true, esquecido: f };
      }
      case 'pesquisar_wikipedia': return toolWikipedia(args);
      case 'abrir': return toolAbrir(args);
      default: return { erro: 'Ferramenta desconhecida: ' + name };
    }
  }

  const TOOL_LABELS = {
    obter_data_hora: '🕒 consultando a hora', clima: '🌦️ consultando o clima', criar_lembrete: '⏰ criando lembrete',
    listar_lembretes: '⏰ vendo lembretes', cancelar_lembrete: '⏰ cancelando lembrete', salvar_nota: '📝 salvando nota',
    listar_notas: '📝 lendo notas', apagar_nota: '📝 apagando nota', lembrar_fato: '🧠 guardando na memória',
    esquecer_fato: '🧠 esquecendo', pesquisar_wikipedia: '📚 pesquisando na Wikipédia', abrir: '🔗 abrindo',
  };

  // ---------------------------------------------------------------- Gemini
  function systemPrompt() {
    const now = new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
    const mem = memory.length ? memory.map((f, i) => (i + 1) + '. ' + f).join('\n') : '(vazia)';
    return [
      'Você é o Jarvis, um assistente pessoal de voz educado, prestativo, com um leve toque de humor britânico.',
      'Responda sempre em português do Brasil.',
      'Suas respostas serão FALADAS em voz alta: seja breve e natural (1 a 3 frases na maioria das vezes),',
      'sem markdown, sem listas longas, sem emojis. Só dê detalhes longos se o usuário pedir.',
      cfg.name ? 'Chame o usuário de "' + cfg.name + '".' : '',
      'Data e hora atuais: ' + now + '.',
      cfg.city ? 'Cidade padrão do usuário: ' + cfg.city + '.' : '',
      'Use as ferramentas disponíveis sempre que ajudarem (clima, lembretes, notas, memória, Wikipédia, abrir sites).',
      'Quando o usuário contar algo pessoal que valha lembrar no futuro, use lembrar_fato sem precisar perguntar.',
      'Memória sobre o usuário:\n' + mem,
    ].filter(Boolean).join('\n');
  }

  async function callGemini(contents) {
    const model = (cfg.model || DEFAULT_MODEL).trim();
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key.trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        tools: [{ functionDeclarations: tools }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText;
      if (res.status === 400 && /api key/i.test(msg)) throw new Error('Chave da API inválida. Confira nas configurações (⚙️).');
      if (res.status === 403) throw new Error('Chave sem permissão para o Gemini. Gere uma nova em aistudio.google.com/apikey.');
      if (res.status === 404) throw new Error('Modelo "' + model + '" não encontrado. Troque o modelo nas configurações (ex.: ' + DEFAULT_MODEL + ').');
      if (res.status === 429) throw new Error('Limite gratuito atingido por agora. Espere um pouco e tente de novo.');
      throw new Error('Erro do Gemini (' + res.status + '): ' + msg);
    }
    const cand = data.candidates && data.candidates[0];
    if (!cand || !cand.content) {
      const reason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'sem resposta';
      throw new Error('O Gemini não respondeu (' + reason + ').');
    }
    if (!cand.content.parts) cand.content.parts = [];
    cand.content.role = 'model';
    return cand.content;
  }

  function trimHistory() {
    const MAX = 40;
    if (history.length <= MAX) return;
    history = history.slice(-MAX);
    // começa sempre numa fala de texto do usuário
    while (history.length && !(history[0].role === 'user' && history[0].parts.some((p) => p.text))) history.shift();
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    if (!cfg.key) {
      addMsg('error', 'Antes, cole sua chave gratuita do Gemini nas configurações (⚙️).');
      openSettings();
      return;
    }
    busy = true;
    stopWake(true);
    stopSpeaking();
    addMsg('user', text);
    setState('thinking', 'Pensando…');

    const turn = [{ role: 'user', parts: [{ text }] }];
    let reply = '';
    try {
      for (let round = 0; round < 6; round++) {
        const content = await callGemini(history.concat(turn));
        turn.push(content);
        const calls = content.parts.filter((p) => p.functionCall);
        const textOut = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
        if (!calls.length) { reply = textOut; break; }
        const responses = [];
        for (const p of calls) {
          const { name, args } = p.functionCall;
          addMsg('tool', TOOL_LABELS[name] || name);
          let result;
          try { result = await runTool(name, args); }
          catch (err) { result = { erro: String(err.message || err) }; }
          responses.push({ functionResponse: { name, response: result } });
        }
        turn.push({ role: 'user', parts: responses });
      }
      if (!reply) reply = 'Pronto.';
      history = history.concat(turn);
      trimHistory();
      saveHistory();
      addMsg('bot', reply);
    } catch (err) {
      addMsg('error', err.message || String(err));
      reply = '';
    }

    busy = false;
    if (reply) await speak(reply);
    setState('idle', idleText());
    if (reply && cfg.conversation && SR) listen();
    else resumeWake();
  }

  // ---------------------------------------------------------------- lembretes
  async function askNotificationPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    } catch { /* ignore */ }
  }

  async function notify(text) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      const opts = { body: text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [200, 100, 200], tag: 'jarvis-' + Date.now() };
      if (reg) reg.showNotification('Jarvis — lembrete', opts);
      else new Notification('Jarvis — lembrete', opts);
    } catch { /* ignore */ }
  }

  function checkReminders() {
    const now = Date.now();
    const due = reminders.filter((r) => r.quando <= now);
    if (!due.length) return;
    reminders = reminders.filter((r) => r.quando > now);
    saveReminders();
    for (const r of due) {
      const late = now - r.quando > 5 * 60000 ? ' (atrasado, era para ' + fmtTime(r.quando) + ')' : '';
      const msg = '⏰ Lembrete: ' + r.texto + late;
      addMsg('bot', msg);
      notify(r.texto);
      if (!busy) speak((cfg.name ? cfg.name + ', ' : '') + 'lembrete: ' + r.texto).then(() => setState('idle', idleText()));
    }
  }

  // ---------------------------------------------------------------- configurações
  function renderMemory() {
    const list = $('memList');
    if (!memory.length) { list.textContent = 'Ainda não guardei nada sobre você.'; return; }
    const ol = document.createElement('ol');
    for (const f of memory) {
      const li = document.createElement('li');
      li.textContent = f;
      ol.appendChild(li);
    }
    list.innerHTML = '';
    list.appendChild(ol);
  }

  function openSettings() {
    $('cfgKey').value = cfg.key;
    $('cfgModel').value = cfg.model;
    $('cfgName').value = cfg.name;
    $('cfgCity').value = cfg.city;
    $('cfgConversation').checked = cfg.conversation;
    $('cfgWake').checked = cfg.wake;
    renderMemory();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  dlg.addEventListener('close', () => {
    cfg.key = $('cfgKey').value.trim();
    cfg.model = $('cfgModel').value.trim() || DEFAULT_MODEL;
    cfg.name = $('cfgName').value.trim();
    cfg.city = $('cfgCity').value.trim();
    cfg.conversation = $('cfgConversation').checked;
    const wasWake = cfg.wake;
    cfg.wake = $('cfgWake').checked;
    saveCfg();
    if (cfg.wake && !wasWake) startWake();
    if (!cfg.wake && wasWake) stopWake();
    if (!busy) setState('idle', idleText());
  });

  $('btnClearChat').addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  $('btnClearMem').addEventListener('click', () => {
    if (!confirm('Apagar tudo o que o Jarvis lembra sobre você?')) return;
    memory = [];
    saveMemory();
    renderMemory();
  });

  // ---------------------------------------------------------------- eventos
  btnMic.addEventListener('click', () => {
    if (cmdRec) { cmdRec.stop(); return; }
    if (orb.classList.contains('speaking')) { stopSpeaking(); setState('idle', idleText()); return; }
    listen();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value;
    input.value = '';
    send(t);
  });

  btnMute.addEventListener('click', () => {
    cfg.muted = !cfg.muted;
    saveCfg();
    btnMute.textContent = cfg.muted ? '🔇' : '🔊';
    if (cfg.muted) stopSpeaking();
  });

  $('btnSettings').addEventListener('click', openSettings);

  // ---------------------------------------------------------------- início
  btnMute.textContent = cfg.muted ? '🔇' : '🔊';
  renderHistory();
  setState('idle', idleText());

  if (!cfg.key) {
    addMsg('bot', 'Olá! Eu sou o Jarvis. Para começar, toque em ⚙️ e cole sua chave gratuita do Gemini (pegue em https://aistudio.google.com/apikey). Depois é só tocar no microfone e falar comigo.');
  } else if (!history.length) {
    addMsg('bot', 'Às suas ordens' + (cfg.name ? ', ' + cfg.name : '') + '. Toque no microfone ou digite.');
  }

  if (cfg.wake) {
    // navegadores só liberam o microfone após um toque; tenta já e de novo no primeiro toque
    startWake();
    document.addEventListener('pointerdown', () => { if (cfg.wake && !wakeRec && !cmdRec && !busy) startWake(); }, { once: true });
  }

  checkReminders();
  setInterval(checkReminders, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ });
  }
})();
