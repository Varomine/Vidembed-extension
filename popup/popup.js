// VidEmbed Popup UI Logic - Configurable Proxy, Referer Spoofing & Sandbox Support

document.addEventListener('DOMContentLoaded', () => {
  const mediaContainer = document.getElementById('mediaContainer');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const detectedCount = document.getElementById('detectedCount');
  const chkHideTS = document.getElementById('chkHideTS');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnClear = document.getElementById('btnClear');
  const btnOptions = document.getElementById('btnOptions');

  const previewModal = document.getElementById('previewModal');
  const previewVideo = document.getElementById('previewVideo');
  const previewIframe = document.getElementById('previewIframe');
  const previewTitle = document.getElementById('previewTitle');
  const chkUseProxy = document.getElementById('chkUseProxy');
  const chkUseSandbox = document.getElementById('chkUseSandbox');
  const btnClosePreview = document.getElementById('btnClosePreview');

  let activeTabId = null;
  let allMediaItems = [];
  let currentHlsInstance = null;

  // Active Preview State
  let activePreviewUrl = '';
  let activePreviewTitle = '';
  let activePreviewIsHLS = false;
  let activePreviewReferer = '';

  let userProxyUrl = '';

  function loadUserConfig() {
    chrome.storage.sync.get(['proxyUrl'], (items) => {
      if (items.proxyUrl) {
        userProxyUrl = items.proxyUrl.trim();
      } else {
        userProxyUrl = '';
      }
    });
  }
  loadUserConfig();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      activeTabId = tabs[0].id;
      loadTabMedia();
    }
  });

  function loadTabMedia() {
    if (!activeTabId) return;

    chrome.runtime.sendMessage({ action: 'GET_TAB_MEDIA', tabId: activeTabId }, (response) => {
      if (response && response.mediaList) {
        allMediaItems = response.mediaList;
        renderMediaList(allMediaItems);
      } else {
        allMediaItems = [];
        renderMediaList([]);
      }
    });
  }

  function renderMediaList(items) {
    const query = searchInput.value.toLowerCase().trim();
    const hideTS = chkHideTS ? chkHideTS.checked : true;

    const filtered = items.filter(item => {
      const lowerUrl = item.url.toLowerCase().split('?')[0];
      const isTS = item.format === 'TS' || lowerUrl.endsWith('.ts') || lowerUrl.endsWith('.m4s');
      if (hideTS && isTS && !lowerUrl.includes('.m3u8')) {
        return false;
      }

      return item.title.toLowerCase().includes(query) ||
             item.url.toLowerCase().includes(query) ||
             item.format.toLowerCase().includes(query);
    });

    mediaContainer.innerHTML = '';

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      detectedCount.textContent = '0 media streams detected';
      return;
    }

    emptyState.classList.add('hidden');
    detectedCount.textContent = `${filtered.length} media stream${filtered.length > 1 ? 's' : ''} found`;

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'media-card';

      let badgeClass = 'mp4';
      if (item.isHLS) badgeClass = 'hls';
      else if (item.format.includes('WEBM')) badgeClass = 'webm';
      else if (item.format === 'TS') badgeClass = 'ts';
      else if (item.format.includes('MP3') || item.format.includes('AAC')) badgeClass = 'audio';

      const isHLSStream = item.isHLS || item.url.includes('.m3u8');
      const durationText = item.formattedDuration || (item.duration ? formatDuration(item.duration) : '');

      card.innerHTML = `
        <button class="btn-delete-item" title="Remove stream from list">&times;</button>

        <div class="card-top-row">
          <div class="thumb-container">
            ${item.thumbnail ? `
              <img class="thumb-img" src="${escapeHtml(item.thumbnail)}" alt="Preview">
            ` : `
              <div class="thumb-fallback">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </div>
            `}
            ${durationText ? `
              <div class="duration-badge">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                ${escapeHtml(durationText)}
              </div>
            ` : ''}
          </div>

          <div class="card-info">
            <span class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            <div class="card-meta">
              <span class="format-badge ${badgeClass}">${escapeHtml(item.format)}</span>
              <span>${escapeHtml(item.formattedSize || 'Unknown size')}</span>
            </div>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-action btn-preview" title="Preview Stream">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Preview
          </button>
          <button class="btn-action btn-copy" title="Copy Direct Stream URL">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy URL
          </button>
          ${isHLSStream ? `
            <button class="btn-action btn-hls" title="Download HLS Stream as MP4">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download HLS
            </button>
          ` : `
            <button class="btn-action btn-download" title="Download Media File">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
          `}
        </div>
      `;

      // Event Listeners
      const deleteBtn = card.querySelector('.btn-delete-item');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          action: 'REMOVE_MEDIA_ITEM',
          tabId: activeTabId,
          url: item.url
        }, () => {
          loadTabMedia();
        });
      });

      const copyBtn = card.querySelector('.btn-copy');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(item.url).then(() => {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          `;
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy URL
            `;
          }, 1500);
        });
      });

      const previewBtn = card.querySelector('.btn-preview');
      previewBtn.addEventListener('click', () => {
        openPreviewModal(item.url, item.title, isHLSStream, item.referer);
      });

      if (isHLSStream) {
        const hlsBtn = card.querySelector('.btn-hls');
        hlsBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: 'OPEN_DOWNLOADER',
            url: item.url,
            title: item.title,
            referer: item.referer || ''
          });
        });
      } else {
        const dlBtn = card.querySelector('.btn-download');
        dlBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_FILE',
            url: item.url,
            filename: item.filename,
            ext: item.format.toLowerCase(),
            referer: item.referer || ''
          });
        });
      }

      mediaContainer.appendChild(card);
    });
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Open Preview Modal
  function openPreviewModal(url, title, isHLS, referer) {
    activePreviewUrl = url;
    activePreviewTitle = title;
    activePreviewIsHLS = isHLS;
    activePreviewReferer = referer || '';

    previewTitle.textContent = title;
    previewModal.classList.remove('hidden');

    if (activePreviewReferer) {
      chrome.runtime.sendMessage({ action: 'SET_STREAM_REFERER', referer: activePreviewReferer });
    }

    chrome.storage.sync.get(['proxyUrl'], (items) => {
      userProxyUrl = (items.proxyUrl || '').trim();
      renderActivePreview();
    });
  }

  function renderActivePreview() {
    if (!activePreviewUrl) return;

    if (currentHlsInstance) {
      currentHlsInstance.destroy();
      currentHlsInstance = null;
    }
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewIframe.removeAttribute('src');

    const useProxy = chkUseProxy.checked;
    const useSandbox = chkUseSandbox.checked;

    let targetUrl = activePreviewUrl;

    if (useProxy) {
      if (userProxyUrl) {
        targetUrl = userProxyUrl + encodeURIComponent(activePreviewUrl);
      } else {
        alert('Proxy URL is not set. Please set your Proxy URL in Extension Settings.\n\nTo host your own free proxy, visit: https://github.com/Varomine/streamrelay');
        chkUseProxy.checked = false;
        targetUrl = activePreviewUrl;
      }
    }

    if (useSandbox) {
      previewVideo.classList.add('hidden');
      previewIframe.classList.remove('hidden');
      previewIframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      previewIframe.src = targetUrl;
    } else {
      previewIframe.classList.add('hidden');
      previewIframe.removeAttribute('src');
      previewVideo.classList.remove('hidden');

      const cleanUrl = targetUrl.toLowerCase().split('?')[0];
      const isHLSUrl = activePreviewIsHLS || cleanUrl.includes('.m3u8');

      if (isHLSUrl && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hls.loadSource(targetUrl);
        hls.attachMedia(previewVideo);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          previewVideo.play().catch(() => {});
        });
        currentHlsInstance = hls;
      } else {
        previewVideo.src = targetUrl;
        previewVideo.play().catch(() => {});
      }
    }
  }

  function closePreview() {
    previewVideo.pause();
    if (currentHlsInstance) {
      currentHlsInstance.destroy();
      currentHlsInstance = null;
    }
    previewVideo.removeAttribute('src');
    previewIframe.removeAttribute('src');
    previewVideo.classList.add('hidden');
    previewIframe.classList.add('hidden');
    previewModal.classList.add('hidden');

    activePreviewUrl = '';
  }

  chkUseProxy.addEventListener('change', renderActivePreview);
  chkUseSandbox.addEventListener('change', renderActivePreview);

  btnClosePreview.addEventListener('click', closePreview);

  searchInput.addEventListener('input', () => {
    renderMediaList(allMediaItems);
  });

  if (chkHideTS) {
    chkHideTS.addEventListener('change', () => {
      renderMediaList(allMediaItems);
    });
  }

  btnRefresh.addEventListener('click', () => {
    if (activeTabId) {
      chrome.tabs.reload(activeTabId, () => {
        setTimeout(loadTabMedia, 1000);
      });
    }
  });

  btnClear.addEventListener('click', () => {
    if (activeTabId) {
      chrome.runtime.sendMessage({ action: 'CLEAR_TAB_MEDIA', tabId: activeTabId }, () => {
        loadTabMedia();
      });
    }
  });

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }
});
