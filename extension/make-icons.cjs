// Dependency-free PNG generator: node make-icons.cjs  -> icons/icon{16,32,48,128}.png
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// Unit-square coordinates (0..1). Returns [r,g,b,a]. Same mark as src/app/icon.svg (32-unit grid):
// white receipt slip with a torn bottom edge and one ruled line, on a near-black tile.
const INK = [11, 11, 12, 255], PAPER = [255, 255, 255, 255];
function pixel(x, y) {
  const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return [0, 0, 0, 0]; // rounded-square tile
  // Slip on a 32-unit grid scaled to 80% of the tile, centred.
  const u = (x - 0.1) / 0.8 * 32, v = (y - 0.1) / 0.8 * 32;
  if (u < 7 || u > 25 || v < 3) return INK;
  for (const ccx of [9.5, 22.5]) if (v < 5.5 && (ccx < 16 ? u < ccx : u > ccx) && Math.hypot(u - ccx, v - 5.5) > 2.5) return INK;
  // torn bottom: 3 teeth between y 26.5 and 29
  const f = ((u - 7) / 18) * 3, t = Math.abs((f - Math.floor(f)) * 2 - 1);
  if (v > 26.5 + 2.5 * t) return INK;
  if (Math.abs(v - 19.5) < 1.125 && u > 11.5 - 1.125 && u < 20.5 + 1.125) return INK; // ruled line
  return PAPER;
}

function png(size) {
  const ss = 3, rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0
    for (let px = 0; px < size; px++) {
      let a = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const p = pixel((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
        for (let i = 0; i < 3; i++) a[i] += p[i] * p[3];
        a[3] += p[3];
      }
      const o = 1 + px * 4, n = ss * ss;
      row[o + 3] = Math.round(a[3] / n);
      for (let i = 0; i < 3; i++) row[o + i] = a[3] ? Math.round(a[i] / a[3]) : 0;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, "icons");
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `icon${s}.png`), png(s));
