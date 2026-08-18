const fs = require('fs');
const path = require('path');
const HLSParser = require('./lib/hls_parser.js');
const DASHParser = require('./lib/dash_parser.js');
const MP4Stitcher = require('./lib/mp4_stitcher.js');

console.log('=== Running VidEmbed Automated Verifications ===\n');

// 1. Manifest JSON check
try {
  const manifestPath = path.join(__dirname, 'manifest.json');
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifestObj = JSON.parse(manifestText);
  console.log('✅ manifest.json is valid JSON.');
  console.log(`   Extension Name: "${manifestObj.name}", Version: ${manifestObj.version}`);
} catch (e) {
  console.error('❌ Manifest validation failed:', e.message);
  process.exit(1);
}

// 2. HLS Parser Master Playlist test
try {
  const sampleMasterM3U8 = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,NAME="1080p"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,NAME="720p"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,NAME="360p"
360p/index.m3u8
  `;

  const baseUrl = 'https://stream.example.com/video/master.m3u8';
  const isMaster = HLSParser.isMasterPlaylist(sampleMasterM3U8);
  if (!isMaster) throw new Error('Expected master playlist detection to be true');

  const variants = HLSParser.parseMasterPlaylist(sampleMasterM3U8, baseUrl);
  if (variants.length !== 3) throw new Error(`Expected 3 variants, got ${variants.length}`);

  console.log('✅ HLSParser master playlist parsing passed.');
  console.log(`   Parsed variants: ${variants.map(v => v.label).join(', ')}`);
} catch (e) {
  console.error('❌ HLSParser master test failed:', e.message);
  process.exit(1);
}

// 3. DASH Parser Test
try {
  const sampleMPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT24M15S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <SegmentTemplate initialization="init-$RepresentationID$.mp4" media="chunk-$RepresentationID$-$Number$.m4s" timescale="1000" duration="4000" startNumber="1"/>
      <Representation id="1080p" bandwidth="4500000" width="1920" height="1080"/>
      <Representation id="720p" bandwidth="2500000" width="1280" height="720"/>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">
      <SegmentTemplate initialization="init-audio.mp4" media="chunk-audio-$Number$.m4s" timescale="1000" duration="4000" startNumber="1"/>
      <Representation id="audio_eng" bandwidth="128000"/>
    </AdaptationSet>
  </Period>
</MPD>`;

  const baseUrl = 'https://stream.example.com/dash/manifest.mpd';
  const isDASH = DASHParser.isDASHMPD(sampleMPD);
  if (!isDASH) throw new Error('Expected DASH MPD detection to be true');

  const parsed = DASHParser.parseMPD(sampleMPD, baseUrl);
  if (parsed.videoRepresentations.length !== 2) throw new Error('Expected 2 video representations');
  if (parsed.totalDuration !== 1455) throw new Error(`Expected 1455s total duration, got ${parsed.totalDuration}`);

  const segs = DASHParser.getRepresentationSegments(parsed.videoRepresentations[0], baseUrl, parsed.totalDuration);
  if (segs.segments.length === 0) throw new Error('Expected DASH segment calculation');

  console.log('✅ DASHParser MPD XML parsing passed.');
  console.log(`   Representations: ${parsed.videoRepresentations.map(r => r.label).join(', ')}, Segments: ${segs.segments.length}`);
} catch (e) {
  console.error('❌ DASHParser test failed:', e.message);
  process.exit(1);
}

// 4. MP4 Segment Stitcher test
try {
  const seg1 = new Uint8Array([70, 73, 76, 69]);
  const seg2 = new Uint8Array([95, 68, 65, 84, 65]);
  const blob = MP4Stitcher.stitchSegments([seg1, seg2], 'video/mp4');

  if (!blob || typeof blob.size !== 'number') {
    throw new Error('Blob output invalid');
  }

  console.log('✅ MP4Stitcher binary segment stitching passed.');
  console.log(`   Stitched blob size: ${blob.size} bytes`);
} catch (e) {
  console.error('❌ MP4Stitcher test failed:', e.message);
  process.exit(1);
}

console.log('\n✨ All automated tests passed successfully!');
