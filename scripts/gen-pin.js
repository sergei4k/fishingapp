#!/usr/bin/env node
// Generates a white-on-transparent teardrop pin PNG for use as an SDF Mapbox marker.
// Run: node scripts/gen-pin.js
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 25;
const CX = W / 2, CY = W / 2;
const OUTER_R = W / 2 - 1;                     // 14px
const INNER_R = Math.round(OUTER_R * 0.42);     // hollow centre (~6px)
const TIP = CY + OUTER_R + 10;                 // tip 10px below circle bottom
const H   = TIP + 3;                           // canvas height

// Tangent lines from tip to circle — gives smooth flow out of circle
const D       = TIP - CY;
const SIN_T   = OUTER_R / D;
const TAN_T   = SIN_T / Math.sqrt(1 - SIN_T * SIN_T);
const TANG_Y  = CY + OUTER_R * SIN_T;          // y where tail meets circle

function inShape(px, py) {
  const d2 = (px - CX) ** 2 + (py - CY) ** 2;
  // Hollow centre
  if (d2 <= INNER_R * INNER_R) return false;
  // Outer circle cap
  if (d2 <= OUTER_R * OUTER_R) return true;
  // Tail: tangent-line sides so it flows cleanly off the circle
  if (py >= TANG_Y && py < TIP) {
    const hw = (TIP - py) * TAN_T;
    if (Math.abs(px - CX) <= hw) return true;
  }
  return false;
}

// Soft alpha via 8x8 supersampling for smooth edges
function alpha(px, py) {
  const N = 8;
  let hits = 0;
  for (let dy = 0; dy < N; dy++)
    for (let dx = 0; dx < N; dx++)
      if (inShape(px + (dx + 0.5) / N, py + (dy + 0.5) / N)) hits++;
  return Math.round((hits / (N * N)) * 255);
}

// Build raw PNG pixel data (RGBA, filter byte 0 per row)
const rows = [];
for (let y = 0; y < H; y++) {
  rows.push(0); // filter byte
  for (let x = 0; x < W; x++) {
    const a = alpha(x, y);
    rows.push(255, 255, 255, a); // white, variable alpha
  }
}

const raw        = Buffer.from(rows);
const compressed = zlib.deflateSync(raw);

// CRC32
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'images', 'pin.png');
fs.writeFileSync(out, png);
console.log(`pin.png written (${W}x${H})`);
