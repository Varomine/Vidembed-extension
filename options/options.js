// VidEmbed Options Logic - Enhanced Settings Manager

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const toastMsg = document.getElementById('toastMsg');

  const proxyUrlInput = document.getElementById('proxyUrlInput');
  const blockTS = document.getElementById('blockTS');
  const blockM4S = document.getElementById('blockM4S');
  const blockVTT = document.getElementById('blockVTT');
  const blockAAC = document.getElementById('blockAAC');
  const customBlockedInput = document.getElementById('customBlockedInput');
  const minSizeFilter = document.getElementById('minSizeFilter');
  const defaultThreads = document.getElementById('defaultThreads');
  const autoDownload = document.getElementById('autoDownload');

  // Load saved options from chrome storage
  chrome.storage.sync.get([
    'proxyUrl',
    'blockTS',
    'blockM4S',
    'blockVTT',
    'blockAAC',
    'customBlocked',
    'minSizeFilter',
    'defaultThreads',
    'autoDownload'
  ], (items) => {
    if (items.proxyUrl !== undefined) proxyUrlInput.value = items.proxyUrl;
    if (items.blockTS !== undefined) blockTS.checked = items.blockTS;
    if (items.blockM4S !== undefined) blockM4S.checked = items.blockM4S;
    if (items.blockVTT !== undefined) blockVTT.checked = items.blockVTT;
    if (items.blockAAC !== undefined) blockAAC.checked = items.blockAAC;
    if (items.customBlocked !== undefined) customBlockedInput.value = items.customBlocked;
    if (items.minSizeFilter !== undefined) minSizeFilter.value = items.minSizeFilter;
    if (items.defaultThreads !== undefined) defaultThreads.value = items.defaultThreads;
    if (items.autoDownload !== undefined) autoDownload.value = items.autoDownload.toString();
  });

  function saveAllSettings(e) {
    if (e) e.preventDefault();

    const blockedList = [];
    if (blockTS.checked) blockedList.push('.ts');
    if (blockM4S.checked) blockedList.push('.m4s');
    if (blockVTT.checked) {
      blockedList.push('.vtt');
      blockedList.push('.srt');
    }
    if (blockAAC.checked) blockedList.push('.aac');

    const customText = customBlockedInput.value.trim();
    if (customText) {
      const customItems = customText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      customItems.forEach(item => {
        const formatted = item.startsWith('.') ? item : `.${item}`;
        if (!blockedList.includes(formatted)) {
          blockedList.push(formatted);
        }
      });
    }

    const settingsObj = {
      proxyUrl: proxyUrlInput.value.trim(),
      blockTS: blockTS.checked,
      blockM4S: blockM4S.checked,
      blockVTT: blockVTT.checked,
      blockAAC: blockAAC.checked,
      customBlocked: customText,
      blockedExtensions: blockedList,
      minSizeFilter: parseInt(minSizeFilter.value, 10) || 0,
      defaultThreads: parseInt(defaultThreads.value, 10) || 6,
      autoDownload: autoDownload.value === 'true'
    };

    chrome.storage.sync.set(settingsObj, () => {
      toastMsg.classList.remove('hidden');
      setTimeout(() => {
        toastMsg.classList.add('hidden');
      }, 2500);
    });
  }

  form.addEventListener('submit', saveAllSettings);
});
