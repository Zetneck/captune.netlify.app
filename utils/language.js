// utils/language.js
export const languages = {
  af: 'Afrikaans', ar: 'Árabe', bg: 'Búlgaro', bn: 'Bengalí', ca: 'Catalán', cs: 'Checo',
  da: 'Danés', de: 'Alemán', el: 'Griego', en: 'Inglés', eo: 'Esperanto', es: 'Español', et: 'Estonio',
  fa: 'Persa', fi: 'Finés', fr: 'Francés', he: 'Hebreo', hi: 'Hindi', hu: 'Húngaro', id: 'Indonesio',
  it: 'Italiano', ja: 'Japonés', ko: 'Coreano', lt: 'Lituano', lv: 'Letón', nl: 'Neerlandés',
  no: 'Noruego', pl: 'Polaco', pt: 'Portugués', ro: 'Rumano', ru: 'Ruso', sk: 'Eslovaco', sl: 'Esloveno',
  sv: 'Sueco', th: 'Tailandés', tr: 'Turco', uk: 'Ucraniano', ur: 'Urdu', vi: 'Vietnamita', zh: 'Chino'
};

export function languageCodeToName(code) { return languages[code] || code; }
