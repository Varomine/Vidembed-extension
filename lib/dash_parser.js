// VidEmbed MPEG-DASH MPD Parser Library

class DASHParser {
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
   * Format seconds to mm:ss or hh:mm:ss
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
   * Parse ISO 8601 duration (e.g. PT24M15S, PT1H2M30S)
   */
  static parseISODuration(isoStr) {
    if (!isoStr) return 0;
    const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/i);
    if (!match) return 0;
    const hours = parseFloat(match[1] || 0);
    const minutes = parseFloat(match[2] || 0);
    const seconds = parseFloat(match[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Replace DASH SegmentTemplate variables
   */
  static replaceTemplate(template, repId, number, time, bandwidth) {
    if (!template) return '';
    let result = template;

    if (repId !== undefined) {
      result = result.replace(/\$RepresentationID\$/g, repId);
    }
    if (bandwidth !== undefined) {
      result = result.replace(/\$Bandwidth\$/g, bandwidth);
    }
    if (time !== undefined) {
      result = result.replace(/\$Time\$/g, time);
    }
    if (number !== undefined) {
      result = result.replace(/\$Number%0(\d+)d\$/g, (_, width) => {
        return String(number).padStart(parseInt(width, 10), '0');
      });
      result = result.replace(/\$Number\$/g, number);
    }

    return result;
  }

  /**
   * Check if text is MPEG-DASH MPD XML
   */
  static isDASHMPD(mpdText) {
    if (!mpdText || typeof mpdText !== 'string') return false;
    return mpdText.includes('<MPD') || mpdText.includes('xmlns="urn:mpeg:dash:schema:mpd:2011"');
  }

  /**
   * Helper to parse XML document in both Browser DOM and Node environments
   */
  static parseXML(xmlText) {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      return parser.parseFromString(xmlText, 'text/xml');
    }
    
    // Node.js fallback parser for testing
    return {
      querySelector: (tag) => {
        if (tag === 'MPD') {
          const durMatch = xmlText.match(/mediaPresentationDuration="([^"]+)"/);
          return {
            getAttribute: (attr) => attr === 'mediaPresentationDuration' ? (durMatch ? durMatch[1] : null) : null
          };
        }
        if (tag === 'BaseURL') {
          const baseMatch = xmlText.match(/<BaseURL>([^<]+)<\/BaseURL>/);
          return baseMatch ? { textContent: baseMatch[1] } : null;
        }
        return null;
      },
      querySelectorAll: (tag) => {
        if (tag === 'AdaptationSet') {
          const sets = xmlText.split(/<AdaptationSet/g).slice(1);
          return sets.map(setStr => ({
            getAttribute: (attr) => {
              const m = setStr.match(new RegExp(`${attr}="([^"]+)"`));
              return m ? m[1] : '';
            },
            querySelector: (childTag) => {
              if (childTag === 'SegmentTemplate') {
                const initM = setStr.match(/initialization="([^"]+)"/);
                const mediaM = setStr.match(/media="([^"]+)"/);
                const scaleM = setStr.match(/timescale="([^"]+)"/);
                const durM = setStr.match(/duration="([^"]+)"/);
                const startM = setStr.match(/startNumber="([^"]+)"/);
                return (initM || mediaM) ? {
                  getAttribute: (a) => {
                    if (a === 'initialization') return initM ? initM[1] : '';
                    if (a === 'media') return mediaM ? mediaM[1] : '';
                    if (a === 'timescale') return scaleM ? scaleM[1] : '1';
                    if (a === 'duration') return durM ? durM[1] : '0';
                    if (a === 'startNumber') return startM ? startM[1] : '1';
                    return null;
                  },
                  querySelector: () => null
                } : null;
              }
              return null;
            },
            querySelectorAll: (childTag) => {
              if (childTag === 'Representation') {
                const repMatches = setStr.split(/<Representation/g).slice(1);
                return repMatches.map(rStr => ({
                  getAttribute: (a) => {
                    const m = rStr.match(new RegExp(`${a}="([^"]+)"`));
                    return m ? m[1] : '';
                  },
                  querySelector: () => null
                }));
              }
              return [];
            }
          }));
        }
        return [];
      }
    };
  }

  /**
   * Main DASH MPD Parser
   */
  static parseMPD(mpdXmlText, mpdUrl) {
    const xmlDoc = this.parseXML(mpdXmlText);
    const mpdNode = xmlDoc.querySelector('MPD');

    if (!mpdNode) {
      throw new Error('Invalid MPEG-DASH MPD XML document.');
    }

    const durationIso = mpdNode.getAttribute('mediaPresentationDuration');
    const totalDuration = this.parseISODuration(durationIso);

    let baseUrl = mpdUrl;
    const baseUrlNode = xmlDoc.querySelector('BaseURL');
    if (baseUrlNode && baseUrlNode.textContent && baseUrlNode.textContent.trim()) {
      baseUrl = this.resolveUrl(baseUrlNode.textContent.trim(), mpdUrl);
    }

    const videoRepresentations = [];
    const audioRepresentations = [];

    const adaptationSets = xmlDoc.querySelectorAll('AdaptationSet');

    adaptationSets.forEach(adSet => {
      const mimeType = adSet.getAttribute('mimeType') || '';
      const contentType = adSet.getAttribute('contentType') || '';
      const isVideo = mimeType.includes('video') || contentType === 'video';
      const isAudio = mimeType.includes('audio') || contentType === 'audio';

      const templateNode = adSet.querySelector('SegmentTemplate') || (xmlDoc.querySelector ? xmlDoc.querySelector('SegmentTemplate') : null);
      const reps = adSet.querySelectorAll('Representation');

      reps.forEach(rep => {
        const id = rep.getAttribute('id') || '1';
        const bandwidth = parseInt(rep.getAttribute('bandwidth') || '0', 10);
        const width = rep.getAttribute('width');
        const height = rep.getAttribute('height');
        const repMime = rep.getAttribute('mimeType') || mimeType;

        let resolution = '';
        if (width && height) {
          resolution = `${width}x${height}`;
        }

        const repTemplate = (rep.querySelector && rep.querySelector('SegmentTemplate')) || templateNode;

        const repObj = {
          id,
          bandwidth,
          resolution,
          mimeType: repMime,
          label: height ? `${height}p (${bandwidth ? Math.round(bandwidth/1000) + ' kbps' : ''})` : `${id} (${Math.round(bandwidth/1000)} kbps)`,
          template: repTemplate
        };

        if (isVideo || repMime.includes('video')) {
          videoRepresentations.push(repObj);
        } else if (isAudio || repMime.includes('audio')) {
          audioRepresentations.push(repObj);
        }
      });
    });

    videoRepresentations.sort((a, b) => b.bandwidth - a.bandwidth);
    audioRepresentations.sort((a, b) => b.bandwidth - a.bandwidth);

    return {
      baseUrl,
      totalDuration,
      formattedTotalDuration: this.formatDuration(totalDuration),
      videoRepresentations,
      audioRepresentations,
      xmlDoc
    };
  }

  /**
   * Extract segment URLs for a specific DASH Representation
   */
  static getRepresentationSegments(rep, baseUrl, totalDuration = 0) {
    const template = rep.template;
    if (!template) return { initUrl: null, segments: [] };

    const timescale = parseFloat(template.getAttribute('timescale') || '1');
    const durationAttr = parseFloat(template.getAttribute('duration') || '0');
    const startNumber = parseInt(template.getAttribute('startNumber') || '1', 10);

    const initTemplate = template.getAttribute('initialization') || '';
    const mediaTemplate = template.getAttribute('media') || '';

    const initUrl = initTemplate ? this.resolveUrl(this.replaceTemplate(initTemplate, rep.id, undefined, undefined, rep.bandwidth), baseUrl) : null;

    const segments = [];

    const timelineNode = template.querySelector ? template.querySelector('SegmentTimeline') : null;
    if (timelineNode) {
      const sNodes = timelineNode.querySelectorAll('S');
      let currentTime = 0;
      let segNumber = startNumber;

      sNodes.forEach(s => {
        const tAttr = s.getAttribute('t');
        const dAttr = parseFloat(s.getAttribute('d'));
        const rAttr = parseInt(s.getAttribute('r') || '0', 10);

        if (tAttr) currentTime = parseFloat(tAttr);

        for (let count = 0; count <= rAttr; count++) {
          const segUrlRelative = this.replaceTemplate(mediaTemplate, rep.id, segNumber, currentTime, rep.bandwidth);
          segments.push({
            url: this.resolveUrl(segUrlRelative, baseUrl),
            duration: dAttr / timescale
          });
          currentTime += dAttr;
          segNumber++;
        }
      });
    } else if (durationAttr > 0 && totalDuration > 0) {
      const segDurationSec = durationAttr / timescale;
      const totalSegments = Math.ceil(totalDuration / segDurationSec);

      for (let i = 0; i < totalSegments; i++) {
        const segNum = startNumber + i;
        const segTime = i * durationAttr;
        const segUrlRelative = this.replaceTemplate(mediaTemplate, rep.id, segNum, segTime, rep.bandwidth);
        segments.push({
          url: this.resolveUrl(segUrlRelative, baseUrl),
          duration: segDurationSec
        });
      }
    }

    return {
      initUrl,
      segments
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DASHParser;
}
