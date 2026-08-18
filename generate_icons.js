const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation
function makeCrcTable() {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[n] = c;
  }
  return crcTable;
}
const crcTable = makeCrcTable();

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crcBuf]);
}

function createPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw Image Data (Filter byte 0 per scanline + RGBA)
  const rawLines = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 4);
    line[0] = 0; // Filter type None
    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 4;
      
      // Draw background gradient (indigo/purple)
      const r = Math.round(99 + (139 - 99) * (y / height));
      const g = Math.round(102 + (92 - 102) * (y / height));
      const b = Math.round(241 + (246 - 241) * (y / height));

      // Draw play triangle in center
      const cx = width / 2;
      const cy = height / 2;
      const size = width * 0.35;
      
      // Simple triangle test: x in [cx-size*0.4, cx+size*0.5]
      const relX = (x - (cx - size * 0.2)) / size;
      const relY = Math.abs(y - cy) / (size * 0.7);

      const inPlayButton = relX >= 0 && relX <= 0.7 && relY <= (0.7 - relX * 0.9);

      if (inPlayButton) {
        line[idx] = 255;   // R
        line[idx+1] = 255; // G
        line[idx+2] = 255; // B
        line[idx+3] = 255; // A
      } else {
        line[idx] = r;
        line[idx+1] = g;
        line[idx+2] = b;
        line[idx+3] = 255;
      }
    }
    rawLines.push(line);
  }

  const rawData = Buffer.concat(rawLines);
  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const pngBuffer = createPng(size, size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated ${filePath}`);
});
