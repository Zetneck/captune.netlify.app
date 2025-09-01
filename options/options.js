const licenseKey = document.getElementById('licenseKey');
const saveLicense = document.getElementById('saveLicense');
const licenseStatus = document.getElementById('licenseStatus');
const asrProvider = document.getElementById('asrProvider');
const deepgramKey = document.getElementById('deepgramKey');
const trProvider = document.getElementById('trProvider');
const ltEndpoint = document.getElementById('ltEndpoint');
const ltKey = document.getElementById('ltKey');
const testConfig = document.getElementById('testConfig');

(async function init(){
  const cfg = await chrome.storage.sync.get(['licenseKey','asrProvider','deepgramKey','trProvider','ltEndpoint','ltKey']);
  console.log('Configuración cargada en options:', cfg);
  
  licenseKey.value = cfg.licenseKey || '';
  asrProvider.value = cfg.asrProvider || 'deepgram';
  deepgramKey.value = cfg.deepgramKey || '';
  trProvider.value = cfg.trProvider || 'libretranslate';
  ltEndpoint.value = cfg.ltEndpoint || 'https://libretranslate.com/translate';
  ltKey.value = cfg.ltKey || '';
  
  // Para testing, si no hay API key, mostrar un placeholder
  if (!cfg.deepgramKey) {
    console.log('No hay API key de Deepgram configurada');
    deepgramKey.placeholder = 'Pega aquí tu API key de Deepgram';
  }
})();

saveLicense.addEventListener('click', async () => {
  const config = {
    licenseKey: licenseKey.value.trim(),
    asrProvider: asrProvider.value,
    deepgramKey: deepgramKey.value.trim(),
    trProvider: trProvider.value,
    ltEndpoint: ltEndpoint.value.trim(),
    ltKey: ltKey.value.trim()
  };
  
  console.log('Guardando configuración:', {
    ...config,
    deepgramKey: config.deepgramKey ? `[${config.deepgramKey.length} chars]` : '[empty]'
  });
  
  await chrome.storage.sync.set(config);
  
  // Validación básica
  if (!config.deepgramKey) {
    licenseStatus.textContent = '⚠️ Guardado, pero falta API Key de Deepgram para ASR Premium.';
    licenseStatus.style.color = '#ff9800';
  } else if (config.deepgramKey.length < 10) {
    licenseStatus.textContent = '⚠️ Guardado, pero API Key de Deepgram parece muy corta.';
    licenseStatus.style.color = '#ff9800';
  } else {
    licenseStatus.textContent = '✅ Guardado correctamente. ASR Premium listo para usar.';
    licenseStatus.style.color = '#4caf50';
  }
});

testConfig.addEventListener('click', async () => {
  testConfig.textContent = '🔄 Probando...';
  testConfig.disabled = true;
  
  try {
    // Test 1: Verificar storage
    const cfg = await chrome.storage.sync.get(['asrProvider', 'deepgramKey']);
    console.log('Test storage result:', cfg);
    
    if (!cfg.deepgramKey) {
      licenseStatus.textContent = '❌ No hay API Key de Deepgram. Configúrala primero.';
      licenseStatus.style.color = '#f44336';
      return;
    }
    
    // Test 2: Verificar formato de API key
    if (!cfg.deepgramKey.startsWith('dg_') && cfg.deepgramKey.length < 20) {
      licenseStatus.textContent = '⚠️ API Key no parece válida (debería empezar con dg_ y ser más larga).';
      licenseStatus.style.color = '#ff9800';
      return;
    }
    
    // Test 3: Test básico de conectividad (ping a Deepgram)
    try {
      const response = await fetch('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: {
          'Authorization': `Token ${cfg.deepgramKey}`
        }
      });
      
      if (response.ok) {
        licenseStatus.textContent = '✅ API Key válida! Deepgram responde correctamente.';
        licenseStatus.style.color = '#4caf50';
      } else {
        licenseStatus.textContent = `❌ API Key inválida. Deepgram respondió: ${response.status}`;
        licenseStatus.style.color = '#f44336';
      }
    } catch (netError) {
      licenseStatus.textContent = '⚠️ No se pudo conectar a Deepgram. Revisa tu conexión.';
      licenseStatus.style.color = '#ff9800';
      console.error('Network test error:', netError);
    }
    
  } catch (error) {
    licenseStatus.textContent = `❌ Error en test: ${error.message}`;
    licenseStatus.style.color = '#f44336';
    console.error('Config test error:', error);
  } finally {
    testConfig.textContent = '🔍 Test Configuración';
    testConfig.disabled = false;
  }
});
