import { languages } from '../utils/language.js';

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
