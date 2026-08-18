// VidEmbed MP4 / Segment Stitcher Utility

class MP4Stitcher {
  /**
   * Stitch multiple Uint8Array segment buffers into a single Blob
   * @param {Array<Uint8Array>} segmentBuffers - Array of segment buffers in sequential order
   * @param {string} mimeType - Output Blob mime type (default video/mp4)
   * @returns {Blob}
   */
  static stitchSegments(segmentBuffers, mimeType = 'video/mp4') {
    if (!segmentBuffers || segmentBuffers.length === 0) {
      throw new Error('No segment buffers provided for stitching.');
    }

    // Determine total length
    let totalLength = 0;
    for (let i = 0; i < segmentBuffers.length; i++) {
      if (segmentBuffers[i]) {
        totalLength += segmentBuffers[i].byteLength;
      }
    }

    // Merge into single array
    const mergedArray = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < segmentBuffers.length; i++) {
      if (segmentBuffers[i]) {
        mergedArray.set(segmentBuffers[i], offset);
        offset += segmentBuffers[i].byteLength;
      }
    }

    return new Blob([mergedArray], { type: mimeType });
  }

  /**
   * Stream merge to Blob to conserve RAM for large files
   */
  static createBlobFromBuffers(segmentBuffers, mimeType = 'video/mp4') {
    const validBuffers = segmentBuffers.filter(Boolean);
    return new Blob(validBuffers, { type: mimeType });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MP4Stitcher;
}
