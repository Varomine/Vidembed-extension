// VidEmbed HLS M3U8 Playlist Parser - Enhanced with Sliding Window & ENDLIST Detection

class HLSParser {
  /**
   * Resolve relative URL against base URL
   */
  static resolveUrl(relativeUrl, baseUrl) {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch (e) {
      return relativeUrl;
    }
  }

  /**
   * Format seconds into mm:ss or hh:mm:ss
   */
  static formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Check if playlist is a Master Playlist
   */
  static isMasterPlaylist(m3u8Text) {
    return m3u8Text.includes('#EXT-X-STREAM-INF') || m3u8Text.includes('#EXT-X-MEDIA');
  }

  /**
   * Parse Master Playlist
   */
  static parseMasterPlaylist(m3u8Text, masterUrl) {
    const lines = m3u8Text.split(/\r?\n/);
    const variants = [];
    let currentStreamInfo = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        currentStreamInfo = {};
        const attrString = line.substring('#EXT-X-STREAM-INF:'.length);
        
        const bwMatch = attrString.match(/BANDWIDTH=(\d+)/);
        if (bwMatch) {
          currentStreamInfo.bandwidth = parseInt(bwMatch[1], 10);
        }

        const resMatch = attrString.match(/RESOLUTION=(\d+x\d+)/);
        if (resMatch) {
          currentStreamInfo.resolution = resMatch[1];
        }

        const nameMatch = attrString.match(/NAME="([^"]+)"/);
        if (nameMatch) {
          currentStreamInfo.name = nameMatch[1];
        }
      } else if (!line.startsWith('#') && currentStreamInfo) {
        currentStreamInfo.url = this.resolveUrl(line, masterUrl);
        
        let qualityLabel = 'Default';
        if (currentStreamInfo.resolution) {
          const height = currentStreamInfo.resolution.split('x')[1];
          qualityLabel = `${height}p (${currentStreamInfo.resolution})`;
        } else if (currentStreamInfo.bandwidth) {
          qualityLabel = `${Math.round(currentStreamInfo.bandwidth / 1000)} kbps`;
        }

        currentStreamInfo.label = currentStreamInfo.name || qualityLabel;
        variants.push(currentStreamInfo);
        currentStreamInfo = null;
      }
    }

    variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
    return variants;
  }

  /**
   * Parse Media Playlist
   */
  static parseMediaPlaylist(m3u8Text, mediaUrl) {
    const lines = m3u8Text.split(/\r?\n/);
    const segments = [];
    let targetDuration = 10;
    let currentDuration = 0;
    let keyInfo = null;
    const hasEndList = m3u8Text.includes('#EXT-X-ENDLIST');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = parseFloat(line.split(':')[1]) || 10;
      } else if (line.startsWith('#EXT-X-KEY:')) {
        const keyAttr = line.substring('#EXT-X-KEY:'.length);
        const methodMatch = keyAttr.match(/METHOD=([^,]+)/);
        const uriMatch = keyAttr.match(/URI="([^"]+)"/);
        if (methodMatch && uriMatch) {
          keyInfo = {
            method: methodMatch[1],
            uri: this.resolveUrl(uriMatch[1], mediaUrl)
          };
        }
      } else if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          currentDuration = parseFloat(durationMatch[1]);
        }
      } else if (!line.startsWith('#')) {
        const segmentUrl = this.resolveUrl(line, mediaUrl);
        segments.push({
          url: segmentUrl,
          duration: currentDuration || targetDuration,
          key: keyInfo
        });
        currentDuration = 0;
      }
    }

    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

    return {
      targetDuration,
      totalDuration,
      formattedTotalDuration: this.formatDuration(totalDuration),
      segmentCount: segments.length,
      hasEndList,
      segments
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HLSParser;
}
