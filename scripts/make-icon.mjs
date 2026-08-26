#!/usr/bin/env node
/** One mark: idle mound invader from src/renderer/src/buddy.tsx. Run: node scripts/make-icon.mjs */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { crc32, deflateSync } from "node:zlib";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "build");
const GRID = 16;
const BG = [0x17, 0x17, 0x17, 0xff];
const FG = [0x41, 0xa7, 0x9d, 0xff];
const SPRITE = [
  "..#....#..",
  "...#..#...",
  "..######..",
  ".##.##.##.",
  "##########",
  "#.######.#",
  "#.#....#.#",
  "...#..#...",
];

function filled(x, y) {
  const originX = (GRID - SPRITE[0].length) / 2;
  const originY = (GRID - SPRITE.length) / 2;
  const col = x - originX;
  const row = y - originY;
  return SPRITE[row]?.[col] === "#";
}

function rgba(size) {
  const cell = size / GRID;
  const bytes = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = filled(Math.floor(x / cell), Math.floor(y / cell)) ? FG : BG;
      bytes.set(color, (y * size + x) * 4);
    }
  }
  return bytes;
}

function pngChunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([header, payload, checksum]);
}

function encodePng(size) {
  const pixels = rgba(size);
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    pixels.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(sizes) {
  const images = sizes.map((size) => encodePng(size));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const size = sizes[i];
    const entry = 6 + i * 16;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([header, ...images]);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "icon.png"), encodePng(1024));
writeFileSync(join(OUT, "icon.ico"), encodeIco([16, 32, 48, 256]));

const iconset = join(OUT, "icon.iconset");
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset);
const mac = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];
for (const [name, size] of mac) writeFileSync(join(iconset, name), encodePng(size));

const icns = spawnSync("iconutil", ["-c", "icns", iconset, "-o", join(OUT, "icon.icns")], {
  encoding: "utf8",
});
if (icns.status !== 0) {
  console.error(icns.stderr || "iconutil failed");
  process.exit(1);
}
rmSync(iconset, { recursive: true, force: true });
console.log("wrote build/icon.png, build/icon.icns, build/icon.ico");
