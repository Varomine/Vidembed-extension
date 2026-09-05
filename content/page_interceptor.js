// VidEmbed Page Context Interceptor - Hook XHR, Fetch & Response Body for #EXTM3U Playlists

(function () {
  if (window.__VIDEMBED_INTERCEPTOR_LOADED__) return;
  window.__VIDEMBED_INTERCEPTOR_LOADED__ = true;

  // Never hook or interfere with YouTube player scripts or videoplayback chunks
  const host = window.location.hostname.toLowerCase();
  if (host.includes('youtube.com') || host.includes('googlevideo.com') || host.includes('youtu.be')) {
    return;
  }

  function notifyStreamUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    window.postMessage({ type: 'VIDEMBED_STREAM_DETECTED', url: url }, '*');
  }

  function checkUrlAndNotify(url) {
    if (!url || typeof url !== 'string') return;
    const lower = url.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('.mp4') || lower.includes('.webm') || lower.includes('m3u8') || lower.includes('manifest') || lower.includes('master') || lower.includes('playlist')) {
      notifyStreamUrl(url);
    }
  }

  function checkTextAndNotify(text, reqUrl) {
    if (!text || typeof text !== 'string') return;

    // 1. If response body contains #EXTM3U or <MPD, the request URL itself is an HLS/DASH playlist!
    if (text.includes('#EXTM3U') || text.includes('<MPD')) {
      if (reqUrl) notifyStreamUrl(reqUrl);
    }

    // 2. Extract embedded http(s) URLs pointing to m3u8, mpd, or mp4
    try {
      const matches = text.match(/https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mpd|\.mp4)[^\s"'<>]*/gi);
      if (matches) {
        matches.forEach(m => notifyStreamUrl(m));
      }
    } catch (e) {}
  }

  // Hook HTMLMediaElement.prototype.src
  try {
    const origSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (origSrcDesc && origSrcDesc.set) {
      const origSet = origSrcDesc.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set: function (val) {
          if (val && typeof val === 'string') {
            checkUrlAndNotify(val);
          }
          return origSet.call(this, val);
        },
        get: origSrcDesc.get,
        configurable: true
      });
    }
  } catch (e) {}

  // Hook Fetch API
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      checkUrlAndNotify(url);

      const promise = origFetch.apply(this, args);
      promise.then(response => {
        try {
          const clone = response.clone();
          const targetReqUrl = response.url || url;
          clone.text().then(text => checkTextAndNotify(text, targetReqUrl)).catch(() => {});
        } catch (e) {}
      }).catch(() => {});

      return promise;
    };
  }

  // Hook XMLHttpRequest API
  const origOpen = XMLHttpRequest.prototype.open;
  if (origOpen) {
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__vidembed_url = url;
      checkUrlAndNotify(url);
      return origOpen.apply(this, [method, url, ...rest]);
    };

    const origSend = XMLHttpRequest.prototype.send;
    if (origSend) {
      XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
          try {
            if (this.responseText) {
              const reqUrl = this.responseURL || this.__vidembed_url;
              checkTextAndNotify(this.responseText, reqUrl);
            }
          } catch (e) {}
        });
        return origSend.apply(this, args);
      };
    }
  }
})();
