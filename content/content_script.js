// VidEmbed Content Script - Enhanced DOM Media, Thumbnail Sniffer & Video Element Picker

(function () {
  // Never interfere with YouTube
  const host = window.location.hostname.toLowerCase();
  if (host.includes('youtube.com') || host.includes('googlevideo.com') || host.includes('youtu.be')) {
    return;
  }

  const detectedUrls = new Map();
  let pickerActive = false;
  let hoverOverlay = null;

  function createHoverOverlay() {
    if (hoverOverlay) return;
    hoverOverlay = document.createElement('div');
    hoverOverlay.style.position = 'fixed';
    hoverOverlay.style.pointerEvents = 'none';
    hoverOverlay.style.zIndex = '9999999';
    hoverOverlay.style.border = '3px solid #818cf8';
    hoverOverlay.style.background = 'rgba(99, 102, 241, 0.15)';
    hoverOverlay.style.borderRadius = '4px';
    hoverOverlay.style.transition = 'all 0.1s ease';
    hoverOverlay.style.display = 'none';
    document.body.appendChild(hoverOverlay);
  }

  function getCssSelector(el) {
    if (!el) return '';
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\s+/).filter(c => c && !c.startsWith('vidembed')).join('.');
      if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
    }
    return el.tagName.toLowerCase();
  }

  function handlePickerMouseMove(e) {
    if (!pickerActive) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === hoverOverlay) return;

    createHoverOverlay();
    const rect = target.getBoundingClientRect();
    hoverOverlay.style.top = `${rect.top}px`;
    hoverOverlay.style.left = `${rect.left}px`;
    hoverOverlay.style.width = `${rect.width}px`;
    hoverOverlay.style.height = `${rect.height}px`;
    hoverOverlay.style.display = 'block';
  }

  function handlePickerClick(e) {
    if (!pickerActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    const selector = getCssSelector(target);

    stopPicker();

    try {
      chrome.runtime.sendMessage({
        action: 'VIDEO_ELEMENT_PICKED',
        selector: selector,
        tagName: target.tagName,
        src: target.src || target.getAttribute('src') || ''
      });
    } catch (err) {}
  }

  function startPicker() {
    pickerActive = true;
    createHoverOverlay();
    document.addEventListener('mousemove', handlePickerMouseMove, true);
    document.addEventListener('click', handlePickerClick, true);
  }

  function stopPicker() {
    pickerActive = false;
    if (hoverOverlay) {
      hoverOverlay.style.display = 'none';
    }
    document.removeEventListener('mousemove', handlePickerMouseMove, true);
    document.removeEventListener('click', handlePickerClick, true);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_VIDEO_ELEMENT_PICKER') {
      startPicker();
      sendResponse({ status: 'picker_started' });
      return true;
    }
    if (msg.action === 'STOP_VIDEO_ELEMENT_PICKER') {
      stopPicker();
      sendResponse({ status: 'picker_stopped' });
      return true;
    }
  });

  function captureFrame(videoEl) {
    try {
      if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.65);
    } catch (e) {
      return null;
    }
  }

  function reportMedia(rawUrl, type = '', videoEl = null) {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return;

    let url = rawUrl;
    try {
      url = new URL(rawUrl, window.location.href).href;
    } catch (e) {}

    const lower = url.toLowerCase();
    if (lower.endsWith('.js') || lower.endsWith('.css') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
      return;
    }

    let thumbnail = null;
    let duration = null;

    if (videoEl) {
      thumbnail = captureFrame(videoEl) || videoEl.poster || null;
      if (videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
        duration = videoEl.duration;
      }
    }

    const prev = detectedUrls.get(url);
    if (prev && prev.thumbnail && !thumbnail) {
      thumbnail = prev.thumbnail;
    }

    detectedUrls.set(url, { url, type, thumbnail, duration });

    try {
      chrome.runtime.sendMessage({
        action: 'MEDIA_FOUND_DOM',
        media: {
          url: url,
          type: type,
          thumbnail: thumbnail,
          duration: duration
        }
      });
    } catch (err) {
      // Context invalidated
    }
  }

  function scanDOMMedia() {
    const videoElements = document.querySelectorAll('video, audio, source, embed, object');
    videoElements.forEach(el => {
      const parentVideo = el.tagName === 'VIDEO' ? el : el.closest('video');
      
      if (el.src) {
        reportMedia(el.src, el.type || '', parentVideo);
      }
      if (el.currentSrc) {
        reportMedia(el.currentSrc, el.type || '', parentVideo);
      }

      if (parentVideo) {
        parentVideo.addEventListener('loadeddata', () => reportMedia(parentVideo.src || parentVideo.currentSrc, '', parentVideo), { once: true });
        parentVideo.addEventListener('play', () => reportMedia(parentVideo.src || parentVideo.currentSrc, '', parentVideo), { once: true });
      }

      const sources = el.querySelectorAll('source');
      sources.forEach(srcEl => {
        if (srcEl.src) {
          reportMedia(srcEl.src, srcEl.type || '', parentVideo);
        }
      });
    });
  }

  scanDOMMedia();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'SOURCE') {
            const parentVideo = node.tagName === 'VIDEO' ? node : node.closest('video');
            if (node.src) reportMedia(node.src, node.type || '', parentVideo);
            if (node.currentSrc) reportMedia(node.currentSrc, node.type || '', parentVideo);
          }
          const childMedia = node.querySelectorAll ? node.querySelectorAll('video, audio, source') : [];
          childMedia.forEach(el => {
            const parentVideo = el.tagName === 'VIDEO' ? el : el.closest('video');
            if (el.src) reportMedia(el.src, el.type || '', parentVideo);
            if (el.currentSrc) reportMedia(el.currentSrc, el.type || '', parentVideo);
          });
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/page_interceptor.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    // Graceful fallback
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'VIDEMBED_STREAM_DETECTED' && event.data.url) {
      reportMedia(event.data.url);
    }
  });

})();
