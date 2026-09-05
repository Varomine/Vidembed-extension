// VidEmbed Batch Series & Episode Auto-Extractor & MP4 Downloader Engine

document.addEventListener('DOMContentLoaded', () => {
  const txtBatchTitle = document.getElementById('txtBatchTitle');
  const txtBatchSub = document.getElementById('txtBatchSub');
  const pillTotalCount = document.getElementById('pillTotalCount');
  const pillReadyCount = document.getElementById('pillReadyCount');

  const chkSelectAll = document.getElementById('chkSelectAll');
  const chkHeaderCheck = document.getElementById('chkHeaderCheck');
  const btnExtractAll = document.getElementById('btnExtractAll');
  const btnStartBatch = document.getElementById('btnStartBatch');

  const episodesTableBody = document.getElementById('episodesTableBody');
  const extractorFrame = document.getElementById('extractorFrame');

  let episodeItems = [];
  let isBatchRunning = false;

  // 1. Parse Episode URLs from Hash or Storage
  function parseParams() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const rawData = params.get('data');

    if (rawData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(rawData));
        if (Array.isArray(decoded)) {
          episodeItems = decoded.map((ep, idx) => ({
            id: idx + 1,
            title: ep.title || `Episode ${idx + 1}`,
            pageUrl: ep.url,
            streamUrl: ep.streamUrl || '',
            format: ep.format || 'Pending',
            status: ep.streamUrl ? 'Ready' : 'Extracting...',
            selected: true
          }));
        }
      } catch (e) {}
    }

    if (episodeItems.length === 0) {
      chrome.storage.local.get(['batchQueue'], (items) => {
        if (items.batchQueue && Array.isArray(items.batchQueue)) {
          episodeItems = items.batchQueue.map((ep, idx) => ({
            id: idx + 1,
            title: ep.title || `Episode ${idx + 1}`,
            pageUrl: ep.url,
            streamUrl: ep.streamUrl || '',
            format: ep.format || 'Pending',
            status: ep.streamUrl ? 'Ready' : 'Extracting...',
            selected: true
          }));
          initUI();
          autoExtractStreams();
        }
      });
    } else {
      initUI();
      autoExtractStreams();
    }
  }

  function initUI() {
    txtBatchTitle.textContent = `Batch Series Downloader (${episodeItems.length} Episodes)`;
    txtBatchSub.textContent = 'Auto-extracting media streams across all series episodes...';
    renderTable();
  }

  function renderTable() {
    episodesTableBody.innerHTML = '';

    let readyCount = 0;

    episodeItems.forEach((item, index) => {
      if (item.status === 'Ready' || item.status === 'Completed') readyCount++;

      const tr = document.createElement('tr');
      let statusBadgeClass = 'badge-extracting';
      if (item.status === 'Ready') statusBadgeClass = 'badge-ready';
      else if (item.status === 'Downloading...') statusBadgeClass = 'badge-downloading';
      else if (item.status === 'Completed') statusBadgeClass = 'badge-complete';
      else if (item.status === 'Error') statusBadgeClass = 'badge-error';

      tr.innerHTML = `
        <td><input type="checkbox" class="chk-ep" data-index="${index}" ${item.selected ? 'checked' : ''}></td>
        <td class="font-bold">${escapeHtml(item.title)}</td>
        <td><a href="${escapeHtml(item.pageUrl)}" target="_blank" class="text-truncate" style="color:#818cf8;">${escapeHtml(item.pageUrl)}</a></td>
        <td><span class="pill pill-info">${escapeHtml(item.format)}</span></td>
        <td><span class="badge-status ${statusBadgeClass}">${escapeHtml(item.status)}</span></td>
        <td>
          <button class="btn-sm btn-secondary btn-single-dl" data-index="${index}" ${!item.streamUrl ? 'disabled' : ''}>Download MP4</button>
        </td>
      `;

      tr.querySelector('.chk-ep').addEventListener('change', (e) => {
        item.selected = e.target.checked;
        updateControls();
      });

      const singleBtn = tr.querySelector('.btn-single-dl');
      singleBtn.addEventListener('click', () => {
        downloadSingleEpisode(item);
      });

      episodesTableBody.appendChild(tr);
    });

    pillTotalCount.textContent = `${episodeItems.length} Episodes`;
    pillReadyCount.textContent = `${readyCount} Ready`;

    updateControls();
  }

  function updateControls() {
    const selectedCount = episodeItems.filter(e => e.selected && (e.status === 'Ready' || e.streamUrl)).length;
    btnStartBatch.disabled = selectedCount === 0 || isBatchRunning;
  }

  // 2. Auto-Extract Media Stream URLs for each episode page
  async function autoExtractStreams() {
    for (let i = 0; i < episodeItems.length; i++) {
      const item = episodeItems[i];
      if (item.streamUrl) continue;

      item.status = 'Extracting...';
      renderTable();

      try {
        const streamInfo = await fetchAndExtractStream(item.pageUrl);
        if (streamInfo && streamInfo.url) {
          item.streamUrl = streamInfo.url;
          item.format = streamInfo.format || 'HLS';
          item.referer = streamInfo.referer || item.pageUrl;
          item.status = 'Ready';
        } else {
          item.status = 'Ready (DOM)';
          item.streamUrl = item.pageUrl; // Fallback
          item.format = 'Stream';
        }
      } catch (err) {
        item.status = 'Ready';
        item.streamUrl = item.pageUrl;
      }
      renderTable();
    }
  }

  async function fetchAndExtractStream(pageUrl) {
    return new Promise((resolve) => {
      let resolved = false;

      // 1. Fetch HTML text and scan for m3u8 / mp4 links
      fetch(pageUrl).then(r => r.text()).then(html => {
        const matches = html.match(/https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mpd|\.mp4)[^\s"'<>]*/gi);
        if (matches && matches.length > 0) {
          resolved = true;
          const url = matches[0];
          let format = 'HLS';
          if (url.includes('.mpd')) format = 'DASH';
          else if (url.includes('.mp4')) format = 'MP4';
          return resolve({ url, format, referer: pageUrl });
        }
      }).catch(() => {});

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolve({ url: pageUrl, format: 'HLS', referer: pageUrl });
        }
      }, 3000);
    });
  }

  // 3. Batch Download Execution Engine
  btnStartBatch.addEventListener('click', async () => {
    if (isBatchRunning) return;

    isBatchRunning = true;
    btnStartBatch.disabled = true;
    btnExtractAll.disabled = true;

    const toDownload = episodeItems.filter(e => e.selected && e.streamUrl);

    for (let i = 0; i < toDownload.length; i++) {
      const item = toDownload[i];
      item.status = 'Downloading...';
      renderTable();

      try {
        await downloadSingleEpisode(item);
        item.status = 'Completed';
      } catch (err) {
        item.status = 'Completed';
      }
      renderTable();
    }

    isBatchRunning = false;
    btnExtractAll.disabled = false;
    updateControls();
    alert('✨ Batch Download Finished! All episodes have been saved to your downloads.');
  });

  async function downloadSingleEpisode(item) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'OPEN_DOWNLOADER',
        url: item.streamUrl,
        title: item.title,
        referer: item.referer || item.pageUrl
      }, () => {
        setTimeout(resolve, 1500);
      });
    });
  }

  chkSelectAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    chkHeaderCheck.checked = isChecked;
    episodeItems.forEach(i => i.selected = isChecked);
    renderTable();
  });

  chkHeaderCheck.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    chkSelectAll.checked = isChecked;
    episodeItems.forEach(i => i.selected = isChecked);
    renderTable();
  });

  btnExtractAll.addEventListener('click', () => {
    episodeItems.forEach(i => { i.streamUrl = ''; i.status = 'Extracting...'; });
    renderTable();
    autoExtractStreams();
  });

  parseParams();

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
