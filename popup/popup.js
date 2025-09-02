// popup.js - Versión simplificada
const languages = {
  af: 'Afrikaans', ar: 'Árabe', bg: 'Búlgaro', bn: 'Bengalí', ca: 'Catalán', cs: 'Checo',
  da: 'Danés', de: 'Alemán', el: 'Griego', en: 'Inglés', eo: 'Esperanto', es: 'Español', et: 'Estonio',
  fa: 'Persa', fi: 'Finés', fr: 'Francés', he: 'Hebreo', hi: 'Hindi', hu: 'Húngaro', id: 'Indonesio',
  it: 'Italiano', ja: 'Japonés', ko: 'Coreano', lt: 'Lituano', lv: 'Letón', nl: 'Neerlandés',
  no: 'Noruego', pl: 'Polaco', pt: 'Portugués', ro: 'Rumano', ru: 'Ruso', sk: 'Eslovaco', sl: 'Esloveno',
  sv: 'Sueco', th: 'Tailandés', tr: 'Turco', uk: 'Ucraniano', ur: 'Urdu', vi: 'Vietnamita', zh: 'Chino'
};

const toggle = document.getElementById('toggle');
const modeSel = document.getElementById('mode');
const targetSel = document.getElementById('targetLang');
const openOptions = document.getElementById('openOptions');


(async function init() {
  // Rellena idiomas
  Object.entries(languages).forEach(([code, name]) => {
    const opt = document.createElement('option'); opt.value = code; opt.textContent = name; targetSel.appendChild(opt);
  });
  const { targetLang = 'es', mode = 'auto' } = await chrome.storage.sync.get(['targetLang','mode']);
  targetSel.value = targetLang; modeSel.value = mode;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { enabledTabs = {} } = await chrome.storage.local.get('enabledTabs');
  toggle.checked = !!enabledTabs[tab.id];
})();


toggle.addEventListener('change', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const enabled = toggle.checked;
  const mode = modeSel.value;
  await chrome.runtime.sendMessage({ type: 'SET_ENABLED', tabId: tab.id, enabled, mode });
  // Guarda el estado por pestaña
  const { enabledTabs = {} } = await chrome.storage.local.get('enabledTabs');
  enabledTabs[tab.id] = enabled;
  await chrome.storage.local.set({ enabledTabs });
});

modeSel.addEventListener('change', async () => {
  await chrome.storage.sync.set({ mode: modeSel.value });
});

targetSel.addEventListener('change', async () => {
  await chrome.storage.sync.set({ targetLang: targetSel.value });
});

openOptions.addEventListener('click', (e) => {
  e.preventDefault(); chrome.runtime.openOptionsPage();
});
