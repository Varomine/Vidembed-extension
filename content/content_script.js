// VidEmbed Content Script - Enhanced DOM Media & Thumbnail Sniffer

(function () {
  // Never interfere with YouTube
  const host = window.location.hostname.toLowerCase();
  if (host.includes('youtube.com') || host.includes('googlevideo.com') || host.includes('youtu.be')) {
    return;
  }

  const detectedUrls = new Map();

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
