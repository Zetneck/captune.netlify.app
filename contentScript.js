// contentScript.js
// --- languageCodeToName helper ---
const languages = {
  af: 'Afrikaans', ar: 'Árabe', bg: 'Búlgaro', bn: 'Bengalí', ca: 'Catalán', cs: 'Checo',
  da: 'Danés', de: 'Alemán', el: 'Griego', en: 'Inglés', eo: 'Esperanto', es: 'Español', et: 'Estonio',
  fa: 'Persa', fi: 'Finés', fr: 'Francés', he: 'Hebreo', hi: 'Hindi', hu: 'Húngaro', id: 'Indonesio',
  it: 'Italiano', ja: 'Japonés', ko: 'Coreano', lt: 'Lituano', lv: 'Letón', nl: 'Neerlandés',
  no: 'Noruego', pl: 'Polaco', pt: 'Portugués', ro: 'Rumano', ru: 'Ruso', sk: 'Eslovaco', sl: 'Esloveno',
  sv: 'Sueco', th: 'Tailandés', tr: 'Turco', uk: 'Ucraniano', ur: 'Urdu', vi: 'Vietnamita', zh: 'Chino'
};
function languageCodeToName(code) { return languages[code] || code; }

let overlayEl; let lastText = '';
let currentSettings = { targetLang: 'es', mode: 'auto' };

init();

async function init() {
  const resp = await chrome.runtime.sendMessage({ type: 'INIT_STATE_REQUEST' });
  currentSettings = resp?.settings || currentSettings;
  createOverlay();
  hookPlatforms();
}

function createOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  overlayEl.id = 'st-overlay';
  overlayEl.className = 'st-overlay hidden';
  overlayEl.innerHTML = `
    <div class="st-inner">
      <div class="st-line" id="st-line"></div>
      <div class="st-meta" id="st-meta"></div>
    </div>`;
  document.documentElement.appendChild(overlayEl);
}

function setOverlayVisible(v) {
  overlayEl?.classList.toggle('hidden', !v);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OVERLAY_TOGGLE') setOverlayVisible(!!msg.enabled);
  if (msg.type === 'OVERLAY_NOTICE') showMeta(msg.message);
  if (msg.type === 'SUBTITLE_TEXT') renderLine(msg.text, msg.langDetected);
});

function showMeta(text) {
  const meta = document.getElementById('st-meta');
  if (!meta) return;
  meta.textContent = text || '';
  meta.classList.add('show');
  setTimeout(() => meta.classList.remove('show'), 3000);
}

async function hookPlatforms() {
  const host = location.hostname;
  if (host.includes('youtube.com')) hookYouTubeCaptions();
  else if (host.includes('twitch.tv') || host.includes('kick.com')) hookNoNativeCaptions();
}

function hookNoNativeCaptions() {
  showMeta('Sin subtítulos nativos. Activa ASR Premium en el popup.');
}

function hookYouTubeCaptions() {
  const vid = document.querySelector('video');
  if (!vid) {
    // Reintenta cuando cargue el player (navegación SPA)
    const obs = new MutationObserver(() => {
      const v2 = document.querySelector('video');
      if (v2) { obs.disconnect(); hookYouTubeCaptions(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return;
  }

  // Usa textTracks si existen
  const tracks = vid.textTracks;
  if (!tracks || tracks.length === 0) {
    showMeta('Este video no expone subtítulos. Prueba ASR Premium.');
    return;
  }
  // Prioriza el track de subtítulos más cercano a tu idioma
  let track = Array.from(tracks).find(t => t.kind === 'subtitles' || t.kind === 'captions') || tracks[0];
  track.mode = 'hidden';
  track.addEventListener('cuechange', async () => {
    const cues = track.activeCues;
    if (!cues || cues.length === 0) return;
    const text = Array.from(cues).map(c => c.text).join('\n');
    if (!text || text === lastText) return;
    lastText = text;
    const { targetLang } = currentSettings;
    try {
      const { translated } = await chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text, targetLang });
      const langDetected = track.language || 'auto';
      chrome.runtime.sendMessage({ type: 'DEBUG', note: 'translated via site captions' });
      renderLine(translated || text, langDetected);
    } catch (e) {
      renderLine(text, track.language);
    }
  });
  showMeta('Leyendo subtítulos nativos del video.');
}

function renderLine(text, langDetected) {
  const el = document.getElementById('st-line');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 100);
  const meta = document.getElementById('st-meta');
  if (meta) meta.textContent = langDetected ? `⇄ ${languageCodeToName(langDetected)} → ${languageCodeToName(currentSettings.targetLang)}` : '';
}
