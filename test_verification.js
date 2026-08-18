const fs = require('fs');
const path = require('path');
const HLSParser = require('./lib/hls_parser.js');
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

  if (variants[0].resolution !== '1920x1080' || variants[0].url !== 'https://stream.example.com/video/1080p/index.m3u8') {
    throw new Error('Variant 0 parsing mismatch');
  }

  console.log('✅ HLSParser master playlist parsing passed.');
  console.log(`   Parsed variants: ${variants.map(v => v.label).join(', ')}`);
} catch (e) {
  console.error('❌ HLSParser master test failed:', e.message);
  process.exit(1);
}

// 3. HLS Parser Media Playlist test
try {
  const sampleMediaM3U8 = `
#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
segment_0.ts
#EXTINF:9.009,
segment_1.ts
#EXTINF:4.500,
segment_2.ts
  `;

  const mediaUrl = 'https://stream.example.com/video/1080p/index.m3u8';
  const mediaInfo = HLSParser.parseMediaPlaylist(sampleMediaM3U8, mediaUrl);

  if (mediaInfo.segmentCount !== 3) throw new Error(`Expected 3 segments, got ${mediaInfo.segmentCount}`);
  if (mediaInfo.segments[0].url !== 'https://stream.example.com/video/1080p/segment_0.ts') {
    throw new Error('Segment 0 URL resolution mismatch');
  }

  console.log('✅ HLSParser media playlist parsing passed.');
  console.log(`   Total segments: ${mediaInfo.segmentCount}, Total duration: ${mediaInfo.totalDuration}s`);
} catch (e) {
  console.error('❌ HLSParser media test failed:', e.message);
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
