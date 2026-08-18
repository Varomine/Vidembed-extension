// VidEmbed Page Context Interceptor - Hook XHR & Fetch for media streams

(function () {
  if (window.__VIDEMBED_INTERCEPTOR_LOADED__) return;
  window.__VIDEMBED_INTERCEPTOR_LOADED__ = true;

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      if (url && typeof url === 'string') {
        const lower = url.toLowerCase();
        if (lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('.mp4') || lower.includes('.webm')) {
          window.postMessage({ type: 'VIDEMBED_STREAM_DETECTED', url: url }, '*');
        }
      }
      return origFetch.apply(this, args);
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  if (origOpen) {
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (url && typeof url === 'string') {
        const lower = url.toLowerCase();
        if (lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('.mp4') || lower.includes('.webm')) {
          window.postMessage({ type: 'VIDEMBED_STREAM_DETECTED', url: url }, '*');
        }
      }
      return origOpen.apply(this, [method, url, ...rest]);
    };
  }
})();
