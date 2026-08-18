// VidEmbed Parallel HLS Stream Downloader Engine - Sliding Window & Full Video Polling

document.addEventListener('DOMContentLoaded', async () => {
  const videoTitleDisplay = document.getElementById('videoTitleDisplay');
  const qualitySelect = document.getElementById('qualitySelect');
  const filenameInput = document.getElementById('filenameInput');
  const threadSelect = document.getElementById('threadSelect');
  const btnStartDownload = document.getElementById('btnStartDownload');
  const btnCancel = document.getElementById('btnCancel');

  const statusHeading = document.getElementById('statusHeading');
  const speedDisplay = document.getElementById('speedDisplay');
  const progressBar = document.getElementById('progressBar');
  const percentDisplay = document.getElementById('percentDisplay');
  const segmentDisplay = document.getElementById('segmentDisplay');
  const sizeDisplay = document.getElementById('sizeDisplay');
  const etaDisplay = document.getElementById('etaDisplay');

  const resultSection = document.getElementById('resultSection');
  const outputVideo = document.getElementById('outputVideo');
  const btnSaveFile = document.getElementById('btnSaveFile');

  let targetUrl = '';
  let streamTitle = 'video';
  let streamReferer = '';
  let masterVariants = [];
  let isDownloading = false;
  let cancelRequested = false;

  function parseParams() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    targetUrl = params.get('url') ? decodeURIComponent(params.get('url')) : '';
    streamTitle = params.get('title') ? decodeURIComponent(params.get('title')) : 'video';
    streamReferer = params.get('referer') ? decodeURIComponent(params.get('referer')) : '';

    videoTitleDisplay.textContent = streamTitle;
    filenameInput.value = sanitizeFilename(streamTitle);
  }

  function sanitizeFilename(name) {
    if (!name) return 'video';
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + ' MB';
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    if (bytesPerSec > 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
    }
    return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
  }

  function formatETA(seconds) {
    if (!seconds || !isFinite(seconds) || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async function corsFetch(url, options = {}) {
    try {
      const res = await fetch(url, { ...options, mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      return await fetch(url, { ...options, mode: 'no-cors' });
    }
  }

  parseParams();

  if (!targetUrl) {
    statusHeading.textContent = 'Error: No HLS stream URL provided.';
    return;
  }

  if (streamReferer) {
    chrome.runtime.sendMessage({ action: 'SET_STREAM_REFERER', referer: streamReferer });
  }

  // 1. Initial Playlist Parsing
  try {
    statusHeading.textContent = 'Status: Fetching HLS Playlist...';
    const response = await corsFetch(targetUrl);
    const m3u8Text = await response.text();

    if (HLSParser.isMasterPlaylist(m3u8Text)) {
      masterVariants = HLSParser.parseMasterPlaylist(m3u8Text, targetUrl);
      qualitySelect.innerHTML = '';

      masterVariants.forEach((variant, index) => {
        const option = document.createElement('option');
        option.value = variant.url;
        option.textContent = variant.label;
        if (index === 0) option.selected = true;
        qualitySelect.appendChild(option);
      });

      qualitySelect.disabled = false;
      statusHeading.textContent = 'Status: Select resolution and click Start Download.';
    } else {
      qualitySelect.innerHTML = '<option value="' + targetUrl + '">Direct Stream (Single Quality)</option>';
      qualitySelect.disabled = true;
      statusHeading.textContent = 'Status: Ready to download.';
    }
  } catch (err) {
    statusHeading.textContent = `Error parsing playlist: ${err.message}`;
  }

  // 2. Parallel Downloader Engine with Dynamic Sliding Window Support
  btnStartDownload.addEventListener('click', async () => {
    if (isDownloading) return;

    const selectedMediaUrl = qualitySelect.value || targetUrl;
    const maxConcurrency = parseInt(threadSelect.value, 10) || 6;
    const outputFilename = filenameInput.value.trim() || 'video';

    isDownloading = true;
    cancelRequested = false;
    btnStartDownload.disabled = true;
    qualitySelect.disabled = true;
    threadSelect.disabled = true;
    btnCancel.classList.remove('hidden');
    resultSection.classList.add('hidden');

    statusHeading.textContent = 'Status: Fetching segment list...';

    try {
      const resp = await corsFetch(selectedMediaUrl);
      const playlistText = await resp.text();
      const mediaInfo = HLSParser.parseMediaPlaylist(playlistText, selectedMediaUrl);

      const segments = [...mediaInfo.segments];
      const segmentUrlSet = new Set(segments.map(s => s.url));
      let hasEndList = mediaInfo.hasEndList;

      if (segments.length === 0) {
        throw new Error('No video segments found in playlist.');
      }

      statusHeading.textContent = `Status: Downloading ${segments.length} segments (${mediaInfo.formattedTotalDuration || 'full video'})...`;
      segmentDisplay.textContent = `0 / ${segments.length}`;

      const segmentBuffers = [];
      let completedCount = 0;
      let totalBytesDownloaded = 0;

      let lastBytes = 0;
      let lastTime = Date.now();
      let currentIndex = 0;

      // Sliding Window Poller: continuously fetch playlist for new segments if #EXT-X-ENDLIST is missing
      let pollFailures = 0;
      async function pollPlaylistLoop() {
        while (isDownloading && !hasEndList && !cancelRequested && pollFailures < 8) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const pResp = await corsFetch(selectedMediaUrl);
            const pText = await pResp.text();
            const pInfo = HLSParser.parseMediaPlaylist(pText, selectedMediaUrl);

            hasEndList = pInfo.hasEndList;

            let addedNew = 0;
            pInfo.segments.forEach(newSeg => {
              if (!segmentUrlSet.has(newSeg.url)) {
                segmentUrlSet.add(newSeg.url);
                segments.push(newSeg);
                addedNew++;
              }
            });

            if (addedNew > 0) {
              pollFailures = 0;
            } else {
              pollFailures++;
            }
          } catch (e) {
            pollFailures++;
          }
        }
      }

      // Launch sliding window poller in background
      if (!hasEndList) {
        pollPlaylistLoop();
      }

      // Parallel Worker Pool
      async function fetchWorker() {
        while (isDownloading && !cancelRequested) {
          if (currentIndex >= segments.length) {
            if (hasEndList || pollFailures >= 8) {
              break; // All segments finished
            }
            await new Promise(r => setTimeout(r, 400));
            continue;
          }

          const segIndex = currentIndex++;
          const seg = segments[segIndex];

          let attempts = 0;
          let success = false;

          while (attempts < 4 && !success && !cancelRequested) {
            attempts++;
            try {
              const segResp = await corsFetch(seg.url);
              const buffer = await segResp.arrayBuffer();
              const u8 = new Uint8Array(buffer);

              segmentBuffers[segIndex] = u8;
              completedCount++;
              totalBytesDownloaded += u8.byteLength;
              success = true;

              const totalSegsCount = segments.length;
              const pct = Math.min(100, Math.round((completedCount / totalSegsCount) * 100));
              progressBar.style.width = `${pct}%`;
              percentDisplay.textContent = `${pct}%`;
              segmentDisplay.textContent = `${completedCount} / ${totalSegsCount}`;
              sizeDisplay.textContent = formatBytes(totalBytesDownloaded);

              const now = Date.now();
              const timeDiff = (now - lastTime) / 1000;
              if (timeDiff >= 0.5) {
                const bytesDiff = totalBytesDownloaded - lastBytes;
                const bytesPerSec = bytesDiff / timeDiff;
                speedDisplay.textContent = formatSpeed(bytesPerSec);

                const remainingBytes = (totalBytesDownloaded / completedCount) * (totalSegsCount - completedCount);
                const etaSecs = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;
                etaDisplay.textContent = formatETA(etaSecs);

                lastBytes = totalBytesDownloaded;
                lastTime = now;
              }

            } catch (fetchErr) {
              if (attempts >= 4) {
                console.warn(`Failed segment ${segIndex} after 4 attempts:`, fetchErr);
              } else {
                await new Promise(r => setTimeout(r, 400 * attempts));
              }
            }
          }
        }
      }

      const workerPromises = [];
      for (let i = 0; i < Math.min(maxConcurrency, 16); i++) {
        workerPromises.push(fetchWorker());
      }

      await Promise.all(workerPromises);

      if (cancelRequested) {
        statusHeading.textContent = 'Status: Download Cancelled.';
        resetUI();
        return;
      }

      // 3. Stitch segments into single MP4 file
      statusHeading.textContent = `Status: Stitching ${segmentBuffers.filter(Boolean).length} segments into MP4 video file...`;
      const outputBlob = MP4Stitcher.stitchSegments(segmentBuffers, 'video/mp4');
      const videoBlobUrl = URL.createObjectURL(outputBlob);

      outputVideo.src = videoBlobUrl;
      btnSaveFile.href = videoBlobUrl;
      btnSaveFile.download = `${outputFilename}.mp4`;
      resultSection.classList.remove('hidden');

      chrome.downloads.download({
        url: videoBlobUrl,
        filename: `${outputFilename}.mp4`,
        saveAs: false
      });

      statusHeading.textContent = 'Status: Completed Successfully!';
      speedDisplay.textContent = 'Done!';

    } catch (err) {
      statusHeading.textContent = `Download Error: ${err.message}`;
    } finally {
      resetUI();
    }
  });

  btnCancel.addEventListener('click', () => {
    cancelRequested = true;
  });

  function resetUI() {
    isDownloading = false;
    btnStartDownload.disabled = false;
    qualitySelect.disabled = masterVariants.length === 0;
    threadSelect.disabled = false;
    btnCancel.classList.add('hidden');
  }
});
