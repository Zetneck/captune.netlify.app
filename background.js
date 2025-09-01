// background.js
import { Translator } from './adapters/translatorAdapter.js';

const STATE = {
  enabledByTab: new Map(), // tabId -> { enabled: bool, mode: 'auto'|'asr' }
  licenseInfo: null,
  translator: null,
  offscreenCreated: false
};

async function ensureOffscreen() {
  if (STATE.offscreenCreated) return;
  const exists = await chrome.offscreen.hasDocument?.();
  if (exists) {
    STATE.offscreenCreated = true;
    return;
  }
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK', 'BLOBS'],
    justification: 'Process tab audio & stream to ASR provider for live captions.'
  });
  STATE.offscreenCreated = true;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'INIT_STATE_REQUEST') {
      const settings = await chrome.storage.sync.get({
        targetLang: 'es',
        mode: 'auto', // 'auto' (use site captions) | 'asr' (premium)
        premiumEnabled: false
      });
      STATE.translator ||= new Translator();
      sendResponse({ ok: true, settings });
    }

    if (msg.type === 'SET_ENABLED') {
      const { tabId, enabled, mode } = msg;
      STATE.enabledByTab.set(tabId, { enabled, mode });
      if (!enabled) {
        chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_TOGGLE', enabled: false });
        chrome.runtime.sendMessage({ type: 'ASR_STOP', tabId });
        return sendResponse({ ok: true });
      }

      chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_TOGGLE', enabled: true });

      if (mode === 'asr') {
        await ensureOffscreen();
        const licenseOk = await verifyLicense();
        if (!licenseOk) {
          chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_NOTICE',
            message: 'ASR Premium requiere licencia activa. Ve a Options.' });
          return sendResponse({ ok: false, error: 'NO_LICENSE' });
        }
        chrome.runtime.sendMessage({ type: 'ASR_START', tabId });
      }
      sendResponse({ ok: true });
    }

    if (msg.type === 'TRANSLATE_TEXT') {
      try {
        STATE.translator ||= new Translator();
        const { text, targetLang } = msg;
        const translated = await STATE.translator.translate(text, targetLang);
        sendResponse({ ok: true, translated });
      } catch (e) {
        console.error('Translation error', e);
        sendResponse({ ok: false, error: e?.message || 'Translation failed' });
      }
    }
  })();
  return true; // keep port alive for async
});

async function verifyLicense() {
  if (STATE.licenseInfo?.validUntil && Date.now() < STATE.licenseInfo.validUntil) return STATE.licenseInfo.valid;
  const { licenseKey } = await chrome.storage.sync.get({ licenseKey: '' });
  if (!licenseKey) return false;
  try {
    const res = await fetch('https://your-worker.example/license/verify?key=' + encodeURIComponent(licenseKey));
    const json = await res.json();
    STATE.licenseInfo = { valid: !!json.valid, validUntil: Date.now() + 10 * 60 * 1000 };
    return json.valid;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  (async () => {
    if (msg.type === 'ASR_TEXT') {
      const { targetLang } = await chrome.storage.sync.get({ targetLang: 'es' });
      const translated = await STATE.translator.translate(msg.text, targetLang);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SUBTITLE_TEXT', text: translated, langDetected: 'auto' });
    }
  })();
  return true;
});
