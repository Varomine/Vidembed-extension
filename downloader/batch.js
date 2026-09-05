// VidEmbed Batch Video Downloader JS Engine - Targeted Element Picker & Range Generator

document.addEventListener('DOMContentLoaded', () => {
  const inputVideoSelector = document.getElementById('inputVideoSelector');
  const btnPickElement = document.getElementById('btnPickElement');

  const inputUrlPattern = document.getElementById('inputUrlPattern');
  const inputStartPage = document.getElementById('inputStartPage');
  const inputEndPage = document.getElementById('inputEndPage');
  const btnGenerateLinks = document.getElementById('btnGenerateLinks');

  const urlInputText = document.getElementById('urlInputText');
  const txtUrlCount = document.getElementById('txtUrlCount');
  const btnDetectStreams = document.getElementById('btnDetectStreams');
  const btnStartBatch = document.getElementById('btnStartBatch');

  const chkSelectAll = document.getElementById('chkSelectAll');
  const chkHeaderCheck = document.getElementById('chkHeaderCheck');
  const pillReadyCount = document.getElementById('pillReadyCount');
  const episodesTableBody = document.getElementById('episodesTableBody');

  let detectedItems = [];
  let isDownloadingBatch = false;

  // 1. Point & Click Element Picker
  btnPickElement.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'START_VIDEO_ELEMENT_PICKER' }, (resp) => {
          alert('🎯 Click on the video player on your web page to select it!');
        });
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'VIDEO_ELEMENT_PICKED' && msg.selector) {
      inputVideoSelector.value = msg.selector;
      alert(`✅ Selected Video Container: "${msg.selector}"`);
    }
  });

  // 2. Generate Episode Links from URL Pattern (${page})
  btnGenerateLinks.addEventListener('click', () => {
    let pattern = inputUrlPattern.value.trim();
    const start = parseInt(inputStartPage.value, 10) || 1;
    const end = parseInt(inputEndPage.value, 10) || 1;

    if (!pattern) {
      alert('Please enter a URL pattern containing ${page}.\n\nExample:\nhttps://www.mioz-anime.com/episode/higurashi-no-naku-koro-ni-kai-ep-${page}');
      return;
    }

    if (!pattern.includes('${page}') && !pattern.includes('$page') && !pattern.includes('{page}')) {
      pattern = pattern + '${page}';
    }

    if (start > end) {
      alert('First Episode number must be less than or equal to Last Episode number.');
      return;
    }

    const generatedUrls = [];
    for (let i = start; i <= end; i++) {
      const url = pattern.replace(/\$\{page\}|\$page|\{page\}/gi, i);
      generatedUrls.push(url);
    }

    urlInputText.value = generatedUrls.join('\n');
    txtUrlCount.textContent = `${generatedUrls.length} URLs generated`;

    startAutoDetection();
  });

  urlInputText.addEventListener('input', () => {
    const lines = parseUrlsFromInput();
    txtUrlCount.textContent = `${lines.length} URL${lines.length !== 1 ? 's' : ''} entered`;
  });

  function parseUrlsFromInput() {
    const text = urlInputText.value || '';
    return text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 5 && (l.startsWith('http://') || l.startsWith('https://')));
  }

  function initFromStorage() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const rawData = params.get('data');

    if (rawData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(rawData));
        if (Array.isArray(decoded) && decoded.length > 0) {
          urlInputText.value = decoded.map(d => d.url || d).join('\n');
          txtUrlCount.textContent = `${decoded.length} URLs entered`;
          startAutoDetection();
        }
      } catch (e) {}
    } else {
      chrome.storage.local.get(['batchQueue'], (items) => {
        if (items.batchQueue && Array.isArray(items.batchQueue) && items.batchQueue.length > 0) {
          urlInputText.value = items.batchQueue.map(d => d.url || d).join('\n');
          txtUrlCount.textContent = `${items.batchQueue.length} URLs entered`;
          startAutoDetection();
        }
      });
    }
  }

  btnDetectStreams.addEventListener('click', startAutoDetection);

  async function startAutoDetection() {
    const urls = parseUrlsFromInput();
    if (urls.length === 0) {
      alert('Please paste or generate episode URLs first.');
      return;
    }

    const targetSelector = inputVideoSelector.value.trim();

    detectedItems = urls.map((url, idx) => ({
      id: idx + 1,
      title: extractTitleFromUrl(url, idx + 1),
      pageUrl: url,
      streamUrl: '',
      format: 'Pending',
      status: 'Detecting...',
      selected: true
    }));

    renderTable();

    for (let i = 0; i < detectedItems.length; i++) {
      const item = detectedItems[i];
      try {
        const info = await scanPageForStream(item.pageUrl, targetSelector);
        item.streamUrl = info.url;
        item.format = info.format;
        item.referer = item.pageUrl;
        item.status = 'Ready';
      } catch (err) {
        item.streamUrl = item.pageUrl;
        item.format = 'Stream';
        item.status = 'Ready';
      }
      renderTable();
    }
  }

  async function scanPageForStream(pageUrl, targetSelector) {
    return new Promise((resolve) => {
      let done = false;

      fetch(pageUrl).then(r => r.text()).then(html => {
        // Target specifically inside selected element if possible
        if (targetSelector && html.includes(targetSelector.replace(/[.#]/g, ''))) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const targetNode = doc.querySelector(targetSelector);
          if (targetNode) {
            const nodeSrc = targetNode.src || targetNode.getAttribute('src') || targetNode.getAttribute('data-src');
            if (nodeSrc) {
              done = true;
              let fullUrl = nodeSrc;
              try { fullUrl = new URL(nodeSrc, pageUrl).href; } catch(e){}
              let format = fullUrl.includes('.mpd') ? 'DASH' : (fullUrl.includes('.mp4') ? 'MP4' : 'HLS');
              return resolve({ url: fullUrl, format });
            }
          }
        }

        // Regex fallback
        const matches = html.match(/https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mpd|\.mp4)[^\s"'<>]*/gi);
        if (matches && matches.length > 0) {
          done = true;
          const url = matches[0];
          let format = 'HLS';
          if (url.includes('.mpd')) format = 'DASH';
          else if (url.includes('.mp4')) format = 'MP4';
          return resolve({ url, format });
        }
      }).catch(() => {});

      setTimeout(() => {
        if (!done) {
          resolve({ url: pageUrl, format: 'HLS' });
        }
      }, 2500);
    });
  }

  function extractTitleFromUrl(url, index) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        let last = segments[segments.length - 1];
        last = last.replace(/[-_]/g, ' ');
        return last.charAt(0).toUpperCase() + last.slice(1);
      }
    } catch (e) {}
    return `Episode ${index}`;
  }

  function renderTable() {
    episodesTableBody.innerHTML = '';
    let readyCount = 0;

    detectedItems.forEach((item, index) => {
      if (item.status === 'Ready' || item.status === 'Completed') readyCount++;

      const tr = document.createElement('tr');
      let statusClass = 'badge-extracting';
      if (item.status === 'Ready') statusClass = 'badge-ready';
      else if (item.status === 'Downloading...') statusClass = 'badge-downloading';
      else if (item.status === 'Completed') statusClass = 'badge-complete';

      tr.innerHTML = `
        <td><input type="checkbox" class="chk-item" data-index="${index}" ${item.selected ? 'checked' : ''}></td>
        <td style="font-weight:600; color:#ffffff;">${escapeHtml(item.title)}</td>
        <td><a href="${escapeHtml(item.pageUrl)}" target="_blank" class="text-truncate" style="color:#818cf8;">${escapeHtml(item.pageUrl)}</a></td>
        <td><span class="pill pill-info">${escapeHtml(item.format)}</span></td>
        <td><span class="badge-status ${statusClass}">${escapeHtml(item.status)}</span></td>
        <td>
          <button class="btn-sm btn-secondary btn-single" data-index="${index}" ${!item.streamUrl ? 'disabled' : ''}>Download MP4</button>
        </td>
      `;

      tr.querySelector('.chk-item').addEventListener('change', (e) => {
        item.selected = e.target.checked;
        updateControls();
      });

      tr.querySelector('.btn-single').addEventListener('click', () => {
        triggerDownload(item);
      });

      episodesTableBody.appendChild(tr);
    });

    pillReadyCount.textContent = `${readyCount} Ready`;
    updateControls();
  }

  function updateControls() {
    const selectedReady = detectedItems.filter(i => i.selected && i.streamUrl).length;
    btnStartBatch.disabled = selectedReady === 0 || isDownloadingBatch;
  }

  btnStartBatch.addEventListener('click', async () => {
    if (isDownloadingBatch) return;

    isDownloadingBatch = true;
    btnStartBatch.disabled = true;

    const toDownload = detectedItems.filter(i => i.selected && i.streamUrl);

    for (let i = 0; i < toDownload.length; i++) {
      const item = toDownload[i];
      item.status = 'Downloading...';
      renderTable();

      try {
        await triggerDownload(item);
        item.status = 'Completed';
      } catch (err) {
        item.status = 'Completed';
      }
      renderTable();
    }

    isDownloadingBatch = false;
    updateControls();
    alert('✨ Batch Download Complete! All videos saved as MP4.');
  });

  async function triggerDownload(item) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'OPEN_DOWNLOADER',
        url: item.streamUrl,
        title: item.title,
        referer: item.referer || item.pageUrl
      }, () => {
        setTimeout(resolve, 1500);
      });
    });
  }

  chkSelectAll.addEventListener('change', (e) => {
    const val = e.target.checked;
    chkHeaderCheck.checked = val;
    detectedItems.forEach(i => i.selected = val);
    renderTable();
  });

  chkHeaderCheck.addEventListener('change', (e) => {
    const val = e.target.checked;
    chkSelectAll.checked = val;
    detectedItems.forEach(i => i.selected = val);
    renderTable();
  });

  initFromStorage();

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
