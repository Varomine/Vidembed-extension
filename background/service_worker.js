// VidEmbed Background Service Worker - Non-Intrusive Sniffer & Targeted Downloader Rules

const tabMediaMap = new Map();
const urlRefererMap = new Map();

// Default blocked file extensions
let blockedExtensions = ['.ts', '.m4s', '.key', '.vtt', '.srt'];

// Sync blocked extensions from chrome storage
function loadSettings() {
  chrome.storage.sync.get(['blockedExtensions'], (items) => {
    if (items.blockedExtensions && Array.isArray(items.blockedExtensions)) {
      blockedExtensions = items.blockedExtensions;
    }
  });
}
loadSettings();
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedExtensions) {
    blockedExtensions = changes.blockedExtensions.newValue || ['.ts', '.m4s', '.key'];
  }
});

// Dynamic Referer & CORS Modifier - Scoped ONLY to stream requests, never global browsing
function applyRefererRule(refererUrl) {
  if (!refererUrl || !chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateSessionRules) return;

  try {
    const origin = new URL(refererUrl).origin;
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [2001],
      addRules: [
        {
          id: 2001,
          priority: 10,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Referer', operation: 'set', value: refererUrl },
              { header: 'Origin', operation: 'set', value: origin }
            ],
            responseHeaders: [
              { header: 'access-control-allow-origin', operation: 'set', value: '*' },
              { header: 'access-control-allow-methods', operation: 'set', value: 'GET, POST, OPTIONS, HEAD' }
            ]
          },
          condition: {
            urlFilter: '*',
            resourceTypes: ['xmlhttprequest', 'media', 'other']
          }
        }
      ]
    }).catch(e => console.warn('Referer rule update error:', e));
  } catch (e) {
    // Invalid referer URL
  }
}

// Clean up any old global rules on startup
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateSessionRules) {
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1001]
  }).catch(() => {});
}

// Capture exact Referer header sent by video player iframe
try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      let referer = '';
      if (details.requestHeaders) {
        for (const h of details.requestHeaders) {
          if (h.name.toLowerCase() === 'referer') {
            referer = h.value;
            break;
          }
        }
      }

      const effectiveReferer = referer || details.initiator || (details.documentUrl ? new URL(details.documentUrl).origin : '');
      if (effectiveReferer && details.url) {
        urlRefererMap.set(details.url, effectiveReferer);
      }
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders', 'extraHeaders']
  );
} catch (e) {
  console.warn('webRequest.onBeforeSendHeaders listener failed:', e);
}

function sanitizeFilename(name) {
  if (!name) return 'video';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function getFilenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      let file = segments[segments.length - 1];
      file = file.split('?')[0];
      if (file.length > 3 && file.includes('.')) {
        return decodeURIComponent(file);
      }
    }
  } catch (e) {
  }
  return 'media_stream';
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return 'Unknown size';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getMediaFormat(url, contentType = '') {
  const cleanUrl = url.toLowerCase().split('?')[0];
  const type = contentType.toLowerCase();

  if (cleanUrl.endsWith('.m3u8') || url.toLowerCase().includes('.m3u8') || type.includes('mpegurl') || type.includes('apple.mpegurl')) {
    return 'HLS';
  }
  if (cleanUrl.endsWith('.mpd') || url.toLowerCase().includes('.mpd') || type.includes('dash+xml')) {
    return 'DASH';
  }
  if (cleanUrl.endsWith('.mp4') || type.includes('video/mp4')) {
    return 'MP4';
  }
  if (cleanUrl.endsWith('.webm') || type.includes('video/webm')) {
    return 'WEBM';
  }
  if (cleanUrl.endsWith('.flv') || type.includes('video/x-flv')) {
    return 'FLV';
  }
  if (cleanUrl.endsWith('.ts') || type.includes('video/mp2t')) {
    return 'TS';
  }
  if (cleanUrl.endsWith('.mp3') || type.includes('audio/mpeg') || type.includes('audio/mp3')) {
    return 'MP3';
  }
  if (cleanUrl.endsWith('.aac') || type.includes('audio/aac')) {
    return 'AAC';
  }
  if (type.startsWith('video/')) {
    return type.split('/')[1].toUpperCase();
  }

  return 'Stream';
}

function isMediaUrl(url, contentType = '') {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return false;

  const lowerUrl = url.toLowerCase();
  const cleanUrl = lowerUrl.split('?')[0];
  const type = contentType.toLowerCase();

  // Exclude YouTube and GoogleVideo completely
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('googlevideo.com') || lowerUrl.includes('youtu.be')) {
    return false;
  }

  const isBlocked = blockedExtensions.some(ext => cleanUrl.endsWith(ext.toLowerCase()));
  if (isBlocked && !lowerUrl.includes('.m3u8') && !lowerUrl.includes('.mpd')) {
    return false;
  }

  const mediaKeywords = ['.mp4', '.m3u8', '.mpd', '.webm', '.flv', '.mov', '.m4v', '.aac', '.mp3', '.m4a'];
  const isExtensionMatch = mediaKeywords.some(ext => lowerUrl.includes(ext));

  const isTypeMatch = type.startsWith('video/') || 
                      type.startsWith('audio/') || 
                      type.includes('mpegurl') || 
                      type.includes('apple.mpegurl') || 
                      type.includes('dash+xml') ||
                      type.includes('application/x-mpegurl');

  const isIgnored = cleanUrl.endsWith('.js') || cleanUrl.endsWith('.css') || cleanUrl.endsWith('.png') || 
                    cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.gif') || 
                    cleanUrl.endsWith('.svg') || cleanUrl.endsWith('.vtt') || cleanUrl.endsWith('.srt') ||
                    cleanUrl.endsWith('.ico') || cleanUrl.endsWith('.woff') || cleanUrl.endsWith('.woff2') || cleanUrl.endsWith('.ttf');

  return (isExtensionMatch || isTypeMatch) && !isIgnored;
}

function addTabMedia(tabId, mediaInfo) {
  if (!tabId || tabId <= 0) return;
  if (!tabMediaMap.has(tabId)) {
    tabMediaMap.set(tabId, new Map());
  }

  const tabMedia = tabMediaMap.get(tabId);
  const existing = tabMedia.get(mediaInfo.url);

  if (!existing) {
    tabMedia.set(mediaInfo.url, mediaInfo);
  } else {
    if (mediaInfo.contentLength && !existing.contentLength) {
      existing.contentLength = mediaInfo.contentLength;
      existing.formattedSize = formatBytes(mediaInfo.contentLength);
    }
    if (mediaInfo.thumbnail && !existing.thumbnail) {
      existing.thumbnail = mediaInfo.thumbnail;
    }
    if (mediaInfo.duration && !existing.duration) {
      existing.duration = mediaInfo.duration;
      existing.formattedDuration = formatDuration(mediaInfo.duration);
    }
    if (mediaInfo.title && existing.title === 'Media Video') {
      existing.title = mediaInfo.title;
    }
    if (mediaInfo.referer && !existing.referer) {
      existing.referer = mediaInfo.referer;
    }
  }

  updateBadge(tabId);
}

function updateBadge(tabId) {
  const tabMedia = tabMediaMap.get(tabId);
  const count = tabMedia ? tabMedia.size : 0;
  
  if (count > 0) {
    chrome.action.setBadgeText({ tabId, text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#6366f1' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId <= 0) return;

    let contentType = '';
    let contentLength = 0;

    if (details.responseHeaders) {
      for (const header of details.responseHeaders) {
        const name = header.name.toLowerCase();
        if (name === 'content-type') {
          contentType = header.value || '';
        } else if (name === 'content-length') {
          contentLength = parseInt(header.value, 10) || 0;
        }
      }
    }

    if (isMediaUrl(details.url, contentType)) {
      const filename = getFilenameFromUrl(details.url);
      const format = getMediaFormat(details.url, contentType);
      const capturedReferer = urlRefererMap.get(details.url) || details.initiator || '';

      chrome.tabs.get(details.tabId, (tab) => {
        const pageTitle = (tab && tab.title) ? tab.title : filename;
        const mediaObj = {
          url: details.url,
          title: pageTitle,
          filename: filename,
          format: format,
          contentType: contentType,
          contentLength: contentLength,
          formattedSize: formatBytes(contentLength),
          isHLS: format.includes('HLS') || details.url.toLowerCase().includes('.m3u8'),
          isDASH: format.includes('DASH') || details.url.toLowerCase().includes('.mpd'),
          referer: capturedReferer || (tab ? tab.url : ''),
          thumbnail: null,
          duration: null,
          formattedDuration: '',
          timestamp: Date.now()
        };

        addTabMedia(details.tabId, mediaObj);
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ONLY clear tab media when main frame URL actually changes, NOT on subframe/iframe status loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    tabMediaMap.set(tabId, new Map());
    updateBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaMap.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderTabId = sender.tab ? sender.tab.id : null;

  if (message.action === 'GET_TAB_MEDIA') {
    const targetTabId = message.tabId || senderTabId;
    const tabMedia = tabMediaMap.get(targetTabId);
    const list = tabMedia ? Array.from(tabMedia.values()) : [];
    sendResponse({ mediaList: list });
    return true;
  }

  if (message.action === 'SET_STREAM_REFERER') {
    if (message.referer) {
      applyRefererRule(message.referer);
    }
    sendResponse({ status: 'referer_applied' });
    return true;
  }

  if (message.action === 'MEDIA_FOUND_DOM') {
    const tabId = senderTabId;
    if (tabId && message.media) {
      chrome.tabs.get(tabId, (tab) => {
        const pageTitle = (tab && tab.title) ? tab.title : getFilenameFromUrl(message.media.url);
        const capturedReferer = urlRefererMap.get(message.media.url) || (tab ? tab.url : '');
        const mediaObj = {
          url: message.media.url,
          title: pageTitle,
          filename: getFilenameFromUrl(message.media.url),
          format: getMediaFormat(message.media.url, message.media.type || ''),
          contentType: message.media.type || '',
          contentLength: 0,
          formattedSize: 'DOM Video',
          isHLS: message.media.url.toLowerCase().includes('.m3u8'),
          isDASH: message.media.url.toLowerCase().includes('.mpd'),
          referer: capturedReferer,
          thumbnail: message.media.thumbnail || null,
          duration: message.media.duration || null,
          formattedDuration: formatDuration(message.media.duration),
          timestamp: Date.now()
        };
        addTabMedia(tabId, mediaObj);
      });
    }
    sendResponse({ status: 'ok' });
    return true;
  }

  if (message.action === 'REMOVE_MEDIA_ITEM') {
    const targetTabId = message.tabId || senderTabId;
    if (targetTabId && message.url) {
      const tabMedia = tabMediaMap.get(targetTabId);
      if (tabMedia) {
        tabMedia.delete(message.url);
        updateBadge(targetTabId);
      }
    }
    sendResponse({ status: 'removed' });
    return true;
  }

  if (message.action === 'CLEAR_TAB_MEDIA') {
    if (message.tabId) {
      tabMediaMap.set(message.tabId, new Map());
      updateBadge(message.tabId);
    }
    sendResponse({ status: 'cleared' });
    return true;
  }

  if (message.action === 'OPEN_DOWNLOADER') {
    const streamUrl = encodeURIComponent(message.url);
    const title = encodeURIComponent(message.title || 'video');
    const referer = encodeURIComponent(message.referer || urlRefererMap.get(message.url) || '');
    
    if (message.referer || urlRefererMap.get(message.url)) {
      applyRefererRule(message.referer || urlRefererMap.get(message.url));
    }

    const downloaderUrl = chrome.runtime.getURL(`downloader/downloader.html#url=${streamUrl}&title=${title}&referer=${referer}`);
    chrome.tabs.create({ url: downloaderUrl });
    sendResponse({ status: 'opened' });
    return true;
  }

  if (message.action === 'DOWNLOAD_FILE') {
    if (message.referer) {
      applyRefererRule(message.referer);
    }

    chrome.downloads.download({
      url: message.url,
      filename: sanitizeFilename(message.filename || 'video') + (message.ext ? `.${message.ext}` : '.mp4'),
      saveAs: true
    }, (downloadId) => {
      sendResponse({ downloadId, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
    });
    return true;
  }
});
