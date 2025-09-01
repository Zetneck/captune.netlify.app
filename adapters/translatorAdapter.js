// adapters/translatorAdapter.js
export class Translator {
  constructor() { this.provider = null; }

  async translate(text, targetLang) {
    const cfg = await chrome.storage.sync.get(['trProvider','ltEndpoint','ltKey']);
    const provider = cfg.trProvider || 'libretranslate';
    if (provider === 'libretranslate') return this._libreTranslate(text, targetLang, cfg);
    throw new Error('Proveedor de traducción no configurado');
  }

  async _libreTranslate(text, targetLang, cfg) {
    const endpoint = cfg.ltEndpoint || 'https://libretranslate.com/translate';
    const body = { q: text, source: 'auto', target: targetLang, format: 'text' };
    if (cfg.ltKey) body.api_key = cfg.ltKey;
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('LibreTranslate error');
    const json = await res.json();
    return json?.translatedText || text;
  }
}
