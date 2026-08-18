// VidEmbed Page Context Interceptor - Hook XHR & Fetch for media streams

(function () {
  if (window.__VIDEMBED_INTERCEPTOR_LOADED__) return;
  window.__VIDEMBED_INTERCEPTOR_LOADED__ = true;

  // Never hook or interfere with YouTube player scripts or videoplayback chunks
  const host = window.location.hostname.toLowerCase();
  if (host.includes('youtube.com') || host.includes('googlevideo.com') || host.includes('youtu.be')) {
    return;
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
        if (url && typeof url === 'string') {
          const lower = url.toLowerCase();
          if (lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('.mp4') || lower.includes('.webm')) {
            window.postMessage({ type: 'VIDEMBED_STREAM_DETECTED', url: url }, '*');
          }
        }
      } catch (e) {}
      return origFetch.apply(this, args);
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  if (origOpen) {
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (url && typeof url === 'string') {
          const lower = url.toLowerCase();
          if (lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('.mp4') || lower.includes('.webm')) {
            window.postMessage({ type: 'VIDEMBED_STREAM_DETECTED', url: url }, '*');
          }
        }
      } catch (e) {}
      return origOpen.apply(this, [method, url, ...rest]);
    };
  }
})();
