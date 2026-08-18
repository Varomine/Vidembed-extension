# 🎬 VidEmbed - High-Performance Video & Stream Downloader

[![Chrome Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![No Limits](https://img.shields.io/badge/Duration%20Limit-None-purple.svg)]()

> **Fast, restriction-free video & HLS (m3u8) stream downloader extension. No 2-hour limits or companion apps.**

**VidEmbed** is a lightweight, restriction-free browser extension for Chrome, Edge, Brave, and Opera. It automatically detects embedded video and audio streams (`.mp4`, `.m3u8`, `.webm`, `.mpd`, `.ts`), allows one-click link copying, and features a multi-threaded parallel HLS downloader that stitches stream segments into single `.mp4` video files directly inside your browser.

Unlike other tools like Video DownloadHelper, **VidEmbed has zero time limits, no watermarks, no subscriptions, and requires no external desktop companion software.**

---

## ⚡ Why VidEmbed?

| Feature | VidEmbed | Video DownloadHelper |
| :--- | :---: | :---: |
| **Duration / Length Limit** | ♾️ **Unlimited (No 2-Hr Limit)** | ⚠️ Limited (2 Hours / Wait Queues) |
| **External Companion App Needed?** | ❌ **No (100% In-Browser)** | ⚠️ Yes (Required for HLS/ADP) |
| **Parallel HLS Segment Downloads** | ✅ **Up to 16 Concurrent Threads** | ❌ Throttled / Slow |
| **CORS & Referer Bypass** | ✅ **Built-in DNR Rules** | ⚠️ Intermittent CORS blocks |
| **Stream Quality Selector** | ✅ **1080p, 720p, 480p, etc.** | 🔒 Paid / Premium Locked |
| **Price** | 🆓 **100% Free & Open Source** | 💰 Freemium / Paid |

---

## 🔥 Key Features

- 🎯 **Real-Time Media Sniffer**: Detects HTML5 `<video>`, `<source>`, `hls.js`, `VideoJS`, as well as background network HTTP media responses as you browse.
- ⚡ **Parallel HLS (.m3u8) Downloader**: Download multi-segment HLS streams using 4 to 16 parallel threads and stitch `.ts`/`.m4s` chunks into a clean `.mp4` file on the fly.
- 📺 **Resolution & Quality Picker**: Automatically parses master HLS playlists to let you choose your preferred quality (1080p, 720p, 480p, 360p).
- 📋 **One-Click "Copy URL"**: Instantly copy direct video/stream URLs to your clipboard.
- 👁️ **In-Popup Video Preview**: Built-in HTML5 player modal with live HLS preview, Sandboxed Iframe mode, and optional Proxy Relay support ([streamrelay](https://github.com/Varomine/streamrelay)).
- 🚫 **Smart Extension Filtering**: Hide individual `.ts` segment chunk noise so your stream list stays clean.
- 🛡️ **Built-In CORS Bypass**: Uses Chrome Manifest V3 `declarativeNetRequest` rules to strip cross-origin restrictions (`Access-Control-Allow-Origin: *`).

---

## 🚀 Installation Guide

### Loading unpacked in Developer Mode:

1. Download or clone this repository:
   ```bash
   git clone https://github.com/Varomine/Vidembed-extension.git
   ```
2. Open your browser and navigate to the Extensions page:
   - **Google Chrome**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button.
5. Select the `VidEmbed` directory folder.
6. Click the **VidEmbed** toolbar icon to start sniffing and downloading streams!

---

## 🛠️ Project Structure

```
VidEmbed/
├── manifest.json             # Extension Manifest V3 configuration
├── background/
│   └── service_worker.js     # Background HTTP sniffer, CORS DNR rules & tab registry
├── content/
│   ├── content_script.js     # DOM scanner & canvas thumbnail frame capture
│   └── page_interceptor.js   # Isolated XHR/Fetch stream intercepter
├── popup/
│   ├── popup.html            # Extension popup user interface
│   ├── popup.css             # Glassmorphism dark-theme popup styles
│   └── popup.js              # Media listing, copy URL, and preview modal
├── downloader/
│   ├── downloader.html       # Parallel HLS segment downloader tab UI
│   ├── downloader.css        # Downloader dashboard & speed analytics styles
│   └── downloader.js         # Multi-thread segment fetcher & MP4 stitcher engine
├── lib/
│   ├── hls_parser.js         # M3U8 master & media playlist parser
│   ├── mp4_stitcher.js       # Uint8Array segment merger into MP4 Blob
│   └── hls.min.js            # HLS.js live video player engine
├── options/
│   ├── options.html          # Configurable settings UI (Proxy URL & Block lists)
│   ├── options.css           # Options page styling
│   └── options.js            # Storage sync settings manager
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 🤝 Optional Stream Proxy Setup

If you need to proxy restricted video streams, VidEmbed supports optional custom proxy worker integration. Check out the open-source proxy repository:
👉 [https://github.com/Varomine/streamrelay](https://github.com/Varomine/streamrelay)

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
