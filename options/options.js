const licenseKey = document.getElementById('licenseKey');
const saveLicense = document.getElementById('saveLicense');
const licenseStatus = document.getElementById('licenseStatus');
const asrProvider = document.getElementById('asrProvider');
const deepgramKey = document.getElementById('deepgramKey');
const trProvider = document.getElementById('trProvider');
const ltEndpoint = document.getElementById('ltEndpoint');
const ltKey = document.getElementById('ltKey');

(async function init(){
  const cfg = await chrome.storage.sync.get(['licenseKey','asrProvider','deepgramKey','trProvider','ltEndpoint','ltKey']);
  licenseKey.value = cfg.licenseKey || '';
  asrProvider.value = cfg.asrProvider || 'deepgram';
  deepgramKey.value = cfg.deepgramKey || '';
  trProvider.value = cfg.trProvider || 'libretranslate';
  ltEndpoint.value = cfg.ltEndpoint || 'https://libretranslate.com/translate';
  ltKey.value = cfg.ltKey || '';
})();

saveLicense.addEventListener('click', async () => {
  await chrome.storage.sync.set({
    licenseKey: licenseKey.value.trim(),
    asrProvider: asrProvider.value,
    deepgramKey: deepgramKey.value.trim(),
    trProvider: trProvider.value,
    ltEndpoint: ltEndpoint.value.trim(),
    ltKey: ltKey.value.trim()
  });
  licenseStatus.textContent = 'Guardado. La licencia se validará al usar ASR.';
});
