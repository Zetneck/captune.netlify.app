// offscreen/offscreen.js
// Captura audio de la pestaña activa y lo envía a ASR (Deepgram WS). Reenvía textos al contentScript vía background.

let ws; let mediaStream; let processor; let audioCtx; let sourceNode;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ASR_START') startAsr(msg.tabId);
  if (msg.type === 'ASR_STOP') stopAsr();
});

async function startAsr(tabId) {
  try {
    const cfg = await chrome.storage.sync.get(['asrProvider','deepgramKey']);
    if (cfg.asrProvider !== 'deepgram' || !cfg.deepgramKey) {
      chrome.runtime.sendMessage({ type: 'OVERLAY_NOTICE', message: 'ASR error: Configura Deepgram en Opciones.' });
      throw new Error('Configura Deepgram en Options.');
    }

    // 1) Captura audio de la pestaña activa
    mediaStream = await chrome.tabCapture.capture({ audio: true, video: false });
    if (!mediaStream) {
      chrome.runtime.sendMessage({ type: 'OVERLAY_NOTICE', message: 'ASR error: No se pudo capturar audio de la pestaña.' });
      throw new Error('No se pudo capturar audio de la pestaña.');
    }

    audioCtx = new AudioContext({ sampleRate: 48000 });
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);

    // ScriptProcessor es legacy pero sencillo para MVP; puedes migrar a AudioWorklet
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    sourceNode.connect(processor);
    processor.connect(audioCtx.destination);

    // 2) Conecta WS ASR
    ws = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language=auto');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      console.log('WS Deepgram conectado');
      ws.send(JSON.stringify({ type: 'configure', access_token: cfg.deepgramKey }));
    };
    ws.onerror = (e) => {
      chrome.runtime.sendMessage({ type: 'OVERLAY_NOTICE', message: 'ASR error: No se pudo conectar a Deepgram.' });
      console.error('WS error', e);
    };
    ws.onclose = () => console.log('WS cerrado');

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const alt = data.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim();
        if (text && data.is_final) {
          // Envía texto al background para traducir y reenviar al content
          chrome.runtime.sendMessage({ type: 'ASR_TEXT', text });
        }
      } catch (err) {
        chrome.runtime.sendMessage({ type: 'OVERLAY_NOTICE', message: 'ASR error: Respuesta inválida de Deepgram.' });
      }
    };

    // 3) Downsample a 16k y envía al WS
    const downCtx = new OfflineAudioContext(1, 16000, 16000);

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Simple downsample a 16k: toma cada factor (3: 48k -> 16k)
      const factor = Math.floor(audioCtx.sampleRate / 16000);
      const out = new Int16Array(Math.floor(input.length / factor));
      let j = 0;
      for (let i = 0; i < input.length; i += factor) {
        let s = Math.max(-1, Math.min(1, input[i]));
        out[j++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      if (ws?.readyState === 1) ws.send(out.buffer);
    };

  } catch (e) {
    chrome.runtime.sendMessage({ type: 'OVERLAY_NOTICE', message: 'ASR error: ' + e.message });
  }
}

function stopAsr() {
  try { processor?.disconnect(); } catch {}
  try { sourceNode?.disconnect(); } catch {}
  try { audioCtx?.close(); } catch {}
  try { mediaStream?.getAudioTracks()?.forEach(t => t.stop()); } catch {}
  if (ws && ws.readyState === 1) ws.close();
  ws = null; processor = null; sourceNode = null; audioCtx = null; mediaStream = null;
}
