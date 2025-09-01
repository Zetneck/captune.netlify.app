// offscreen/offscreen.js
// Captura audio de la pestaña activa y lo envía a ASR (Deepgram WS). Reenvía textos al contentScript vía background.

let ws; let mediaStream; let processor; let audioCtx; let sourceNode;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ASR_START') startAsr(msg.tabId);
  if (msg.type === 'ASR_STOP') stopAsr();
});

async function startAsr(tabId) {
  try {
    console.log('Iniciando ASR para tabId:', tabId);
    chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Verificando configuración...' });
    
    const cfg = await chrome.storage.sync.get(['asrProvider','deepgramKey']);
    console.log('Configuración ASR:', { provider: cfg.asrProvider, hasKey: !!cfg.deepgramKey });
    
    if (cfg.asrProvider !== 'deepgram' || !cfg.deepgramKey) {
      chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Error: Configura Deepgram en Opciones.' });
      throw new Error('Configura Deepgram en Options.');
    }

    chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Solicitando captura de audio...' });
    console.log('Solicitando captura de audio para tabId:', tabId);
    
    // 1) Captura audio de la pestaña activa
    mediaStream = await chrome.tabCapture.capture({ audio: true, video: false });
    console.log('MediaStream obtenido:', mediaStream);
    
    if (!mediaStream) {
      chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Error: No se pudo capturar audio de la pestaña.' });
      throw new Error('No se pudo capturar audio de la pestaña.');
    }

    chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Audio capturado. Configurando procesador...' });

    audioCtx = new AudioContext({ sampleRate: 48000 });
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);

    // ScriptProcessor es legacy pero sencillo para MVP; puedes migrar a AudioWorklet
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    sourceNode.connect(processor);
    processor.connect(audioCtx.destination);

    chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Conectando a Deepgram...' });
    
    // 2) Conecta WS ASR
    const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language=auto`;
    console.log('Conectando a Deepgram con URL:', wsUrl);
    
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = () => {
      console.log('WS Deepgram conectado, enviando token de autorización...');
      // Enviar el token como mensaje de configuración inicial
      ws.send(JSON.stringify({
        type: 'configure',
        'access-token': cfg.deepgramKey
      }));
      chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Conectado a Deepgram. Procesando audio...' });
    };
    
    ws.onerror = (e) => {
      console.error('WS Deepgram error:', e);
      chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Error: No se pudo conectar a Deepgram. Verifica tu API key.' });
    };
    
    ws.onclose = (e) => {
      console.log('WS Deepgram cerrado:', e.code, e.reason);
      if (e.code !== 1000) {
        chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: `Conexión cerrada: ${e.reason || 'Error desconocido'}` });
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Deepgram response:', data);
        
        if (data.error) {
          chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: `Error Deepgram: ${data.error}` });
          return;
        }
        
        const alt = data.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim();
        
        if (text) {
          console.log('Transcripción recibida:', text, 'Final:', data.is_final);
          chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: `Transcribiendo: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"` });
          
          if (data.is_final) {
            // Envía texto al background para traducir y reenviar al content
            chrome.runtime.sendMessage({ type: 'ASR_TEXT', text });
          }
        }
      } catch (err) {
        console.error('Error procesando respuesta Deepgram:', err);
        chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'Error procesando respuesta de Deepgram.' });
      }
    };

    // 3) Procesa audio y envía al WS
    let audioPacketsSent = 0;
    processor.onaudioprocess = (e) => {
      if (ws?.readyState !== WebSocket.OPEN) {
        if (audioPacketsSent % 100 === 0) {
          console.log('WebSocket no está abierto, estado:', ws?.readyState);
        }
        return;
      }
      
      const input = e.inputBuffer.getChannelData(0);
      
      // Verificar si hay audio (nivel de volumen)
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);
      
      // Simple downsample a 16k: toma cada factor (3: 48k -> 16k)
      const factor = Math.floor(audioCtx.sampleRate / 16000);
      const out = new Int16Array(Math.floor(input.length / factor));
      
      let j = 0;
      for (let i = 0; i < input.length; i += factor) {
        let sample = Math.max(-1, Math.min(1, input[i]));
        out[j++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      
      try {
        ws.send(out.buffer);
        audioPacketsSent++;
        
        // Log cada 100 paquetes para mostrar actividad
        if (audioPacketsSent % 100 === 0) {
          console.log(`Paquetes de audio enviados: ${audioPacketsSent}, RMS: ${rms.toFixed(4)}`);
          if (rms > 0.001) {
            chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: `Detectando audio... (${audioPacketsSent} paquetes)` });
          }
        }
      } catch (wsError) {
        console.error('Error enviando audio a WebSocket:', wsError);
      }
    };

    console.log('ASR configurado completamente');
    chrome.runtime.sendMessage({ type: 'ASR_STATUS', status: 'ASR Premium activado. Capturando audio...' });

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
