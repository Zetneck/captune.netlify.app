// utils/segment.js
// Sencillo helper si más adelante deseas dividir por frases o manejar timings.
export function splitIntoPhrases(text) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}
