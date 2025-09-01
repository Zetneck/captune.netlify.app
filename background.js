// background.js
import { Translator } from './adapters/translatorAdapter.js';

const STATE = {
  enabledByTab: new Map(), // tabId -> { enabled: bool, mode: 'auto'|'asr' }
  licenseInfo: null,
  translator: null,
  offscreenCreated: false
};

async function ensureOffscreen() {
  console.log('Verificando offscreen document...');
  if (STATE.offscreenCreated) {
    console.log('Offscreen document ya existe');
    return;
  }
  
  try {
    const exists = await chrome.offscreen.hasDocument?.();
    console.log('Offscreen document exists:', exists);
    if (exists) {
      STATE.offscreenCreated = true;
      return;
    }
    
    console.log('Creando offscreen document...');
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Process tab audio & stream to ASR provider for live captions.'
    });
    STATE.offscreenCreated = true;
    console.log('Offscreen document creado exitosamente');
  } catch (error) {
    console.error('Error creando offscreen document:', error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'INIT_STATE_REQUEST') {
        const settings = await chrome.storage.sync.get({
          targetLang: 'es',
          mode: 'auto', // 'auto' (use site captions) | 'asr' (premium)
          premiumEnabled: false
        });
        STATE.translator ||= new Translator();
        sendResponse({ ok: true, settings });
        return;
      }

      if (msg.type === 'SET_ENABLED') {
        const { tabId, enabled, mode } = msg;
        STATE.enabledByTab.set(tabId, { enabled, mode });
        if (!enabled) {
          try {
            await chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_TOGGLE', enabled: false });
            await chrome.tabs.sendMessage(tabId, { type: 'ASR_STATUS', status: 'ASR Premium desactivado.' });
          } catch (e) {
            console.warn('No se pudo enviar OVERLAY_TOGGLE (desactivar):', e);
          }
          try {
            chrome.runtime.sendMessage({ type: 'ASR_STOP', tabId });
          } catch (e) {
            console.warn('No se pudo enviar ASR_STOP:', e);
          }
          sendResponse({ ok: true });
          return;
        }

      // Inyecta el content script solo si no está activo
      let needsInjection = true;
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        needsInjection = false; // Si no hay error, el script ya está inyectado
      } catch (e) {
        // Error esperado si el content script no está inyectado
        console.log('Content script no encontrado, inyectando...');
      }
      
      if (needsInjection) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['contentScript.js']
          });
          // Espera un momento para que se inicialice
          await new Promise(res => setTimeout(res, 500));
          console.log('Content script inyectado exitosamente');
        } catch (injectError) {
          console.error('Error inyectando content script:', injectError);
          return sendResponse({ ok: false, error: 'INJECT_FAILED' });
        }
      }
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_TOGGLE', enabled: true });
        await chrome.tabs.sendMessage(tabId, { type: 'ASR_STATUS', status: 'ASR Premium activado. Esperando audio...' });
      } catch (e) {
        console.warn('No se pudo enviar OVERLAY_TOGGLE (activar):', e);
      }

      if (mode === 'asr') {
        console.log('Activando modo ASR Premium...');
        try {
          await ensureOffscreen();
          console.log('Offscreen document preparado, verificando licencia...');
          
          const licenseOk = await verifyLicense();
          if (!licenseOk) {
            console.log('Licencia inválida');
            try {
              await chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_NOTICE',
                message: 'ASR Premium requiere licencia activa. Ve a Options.' });
              await chrome.tabs.sendMessage(tabId, { type: 'ASR_STATUS', status: 'Licencia inválida o no activa.' });
            } catch (e) {
              console.warn('No se pudo enviar OVERLAY_NOTICE:', e);
            }
            return sendResponse({ ok: false, error: 'NO_LICENSE' });
          }
          
          console.log('Licencia válida, iniciando ASR...');
          chrome.runtime.sendMessage({ type: 'ASR_START', tabId });
        } catch (error) {
          console.error('Error en modo ASR:', error);
          try {
            await chrome.tabs.sendMessage(tabId, { type: 'ASR_STATUS', status: `Error ASR: ${error.message}` });
          } catch (e) {
            console.warn('No se pudo enviar error ASR:', e);
          }
          return sendResponse({ ok: false, error: error.message });
        }
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
    } catch (error) {
      console.error('Error in message handler:', error);
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true; // keep port alive for async
});

async function verifyLicense() {
  // Siempre recarga la licencia al activar ASR (no usa caché)
  const { licenseKey } = await chrome.storage.sync.get({ licenseKey: '' });
  if (!licenseKey || licenseKey.length < 8) return false;
  try {
    const res = await fetch('https://captune.netlify.app/.netlify/functions/license-verify?key=' + encodeURIComponent(licenseKey));
    const json = await res.json();
    STATE.licenseInfo = { valid: !!json.valid, validUntil: Date.now() + 10 * 60 * 1000 };
    return !!json.valid;
  } catch (e) {
    console.error('Error validando licencia:', e);
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  (async () => {
    if (msg.type === 'ASR_TEXT') {
      try {
        console.log('Procesando texto ASR:', msg.text);
        STATE.translator ||= new Translator();
        const { targetLang } = await chrome.storage.sync.get({ targetLang: 'es' });
        const translated = await STATE.translator.translate(msg.text, targetLang);
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { 
            type: 'SUBTITLE_TEXT', 
            text: translated, 
            langDetected: 'auto' 
          });
          console.log('Texto traducido enviado al content script:', translated);
        }
      } catch (e) {
        console.error('Error procesando ASR_TEXT:', e);
      }
    }
    
    if (msg.type === 'ASR_STATUS') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { 
            type: 'ASR_STATUS', 
            status: msg.status 
          });
        }
      } catch (e) {
        console.error('Error enviando ASR_STATUS:', e);
      }
    }
  })();
  return true;
});
