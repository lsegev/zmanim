#!/usr/bin/env node
// Generates the "מיל" app icon set from a single vector definition.
//
//   node tools/make-icon.mjs [--variant dusk|sundial|flat] [--out <dir>]
//
// Concept: a Roman milestone (miliarium) beside the sun on the horizon. The
// stone is the traveller's marker in space, the sun is the basis of every
// zman, and the carved XVIII is the eighteen minutes of a halachic mil —
// which also reads as ח״י.
//
// The scene is expressed as offsets from the canvas centre and scaled by a
// single factor, so the maskable variant is the same drawing pulled into the
// safe zone rather than a separate piece of art.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const SIZE = 512;
const C = SIZE / 2;

/** Roman numerals as stroked paths — no font needed, identical on every host. */
function romanXVIII(cx, cy, h, stroke, color) {
  const gw = h * 0.62; // width of an X or a V
  const gap = h * 0.16;
  const widths = [gw, gw, stroke, stroke, stroke];
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  const top = cy - h / 2;
  const bot = cy + h / 2;
  let x = cx - total / 2;
  const d = [];

  d.push(`M${x},${top}L${x + gw},${bot}`, `M${x + gw},${top}L${x},${bot}`); // X
  x += gw + gap;
  d.push(`M${x},${top}L${x + gw / 2},${bot}L${x + gw},${top}`); // V
  x += gw + gap;
  for (let i = 0; i < 3; i++) {
    d.push(`M${x + stroke / 2},${top}L${x + stroke / 2},${bot}`); // III
    x += stroke + gap;
  }

  return `<path d="${d.join(' ')}" fill="none" stroke="${color}"
      stroke-width="${stroke}" stroke-linecap="butt" stroke-linejoin="miter"/>`;
}

function columnPath(cx, capY, capR, baseY) {
  return (
    `M${cx - capR},${capY} A${capR},${capR} 0 0 1 ${cx + capR},${capY} ` +
    `L${cx + capR},${baseY} L${cx - capR},${baseY} Z`
  );
}

// ---------------------------------------------------------------------------
// Variant A — "dusk": backlit silhouette, warm gradient sky.
// ---------------------------------------------------------------------------
function dusk(s) {
  const horizon = C + s(126);
  const capR = s(58);
  const capY = C - s(88);
  const baseY = C + s(96);
  const plinthTop = C + s(92);
  const plinthHalfW = s(86);
  const sunR = s(132);
  const col = columnPath(C, capY, capR, baseY);

  return `
  <defs>
    <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${horizon}">
      <stop offset="0" stop-color="#101B33"/><stop offset="0.42" stop-color="#26375F"/>
      <stop offset="0.72" stop-color="#6C5470"/><stop offset="1" stop-color="#E79B4F"/>
    </linearGradient>
    <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="${C}" cy="${horizon}" r="${sunR}">
      <stop offset="0" stop-color="#FFEBBF"/><stop offset="1" stop-color="#FFB55A"/>
    </radialGradient>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${C}" cy="${horizon}" r="${sunR * 1.85}">
      <stop offset="0" stop-color="#FFB55A" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#FFB55A" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="above"><rect x="0" y="0" width="${SIZE}" height="${horizon}"/></clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
  <g clip-path="url(#above)">
    <circle cx="${C}" cy="${horizon}" r="${sunR * 1.85}" fill="url(#glow)"/>
    <circle cx="${C}" cy="${horizon}" r="${sunR}" fill="url(#sun)"/>
  </g>
  <rect x="0" y="${horizon}" width="${SIZE}" height="${SIZE - horizon}" fill="#0D1628"/>
  <rect x="0" y="${horizon - 1.5}" width="${SIZE}" height="3" fill="#FFCF8A" opacity="0.45"/>
  <rect x="${C - plinthHalfW}" y="${plinthTop}" width="${plinthHalfW * 2}" height="${s(30)}" rx="${s(5)}" fill="#0A1526"/>
  <path d="${col}" fill="#0A1526"/>
  <path d="${col}" fill="none" stroke="#FFCF8A" stroke-width="${s(3)}" opacity="0.5"/>
  ${romanXVIII(C, C + s(14), s(40), s(8), '#F6C97E')}`;
}

// ---------------------------------------------------------------------------
// Variant B — "sundial": lit sandstone column, low sun to the left, cast
// shadow to the right. The shadow is the sundial reading — time itself.
// ---------------------------------------------------------------------------
function sundial(s) {
  const horizon = C + s(118);
  const capR = s(50);
  const capY = C - s(100);
  const baseY = C + s(90);
  const plinthTop = C + s(86);
  const plinthHalfW = s(78);
  const plinthBot = plinthTop + s(32);
  const sunCx = C - s(120);
  const sunR = s(96);
  const col = columnPath(C, capY, capR, baseY);

  const shadow = [
    `${C - plinthHalfW},${plinthBot}`,
    `${C + plinthHalfW},${plinthBot}`,
    `${C + s(250)},${plinthBot + s(26)}`,
    `${C + s(40)},${plinthBot + s(26)}`,
  ].join(' ');

  return `
  <defs>
    <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${horizon}">
      <stop offset="0" stop-color="#152549"/><stop offset="0.5" stop-color="#3D5183"/>
      <stop offset="1" stop-color="#F0B778"/>
    </linearGradient>
    <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="${sunCx}" cy="${horizon}" r="${sunR}">
      <stop offset="0" stop-color="#FFF0CE"/><stop offset="1" stop-color="#FFAF4E"/>
    </radialGradient>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${sunCx}" cy="${horizon}" r="${sunR * 2.1}">
      <stop offset="0" stop-color="#FFB55A" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#FFB55A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="stone" gradientUnits="userSpaceOnUse" x1="${C - capR}" y1="0" x2="${C + capR}" y2="0">
      <stop offset="0" stop-color="#F3D6A8"/><stop offset="0.32" stop-color="#DCB57F"/>
      <stop offset="0.7" stop-color="#9C7850"/><stop offset="1" stop-color="#6A4E34"/>
    </linearGradient>
    <linearGradient id="shadowG" gradientUnits="userSpaceOnUse" x1="${C}" y1="0" x2="${C + s(250)}" y2="0">
      <stop offset="0" stop-color="#3A2A1C" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#3A2A1C" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="above"><rect x="0" y="0" width="${SIZE}" height="${horizon}"/></clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
  <g clip-path="url(#above)">
    <circle cx="${sunCx}" cy="${horizon}" r="${sunR * 2.1}" fill="url(#glow)"/>
    <circle cx="${sunCx}" cy="${horizon}" r="${sunR}" fill="url(#sun)"/>
  </g>
  <rect x="0" y="${horizon}" width="${SIZE}" height="${SIZE - horizon}" fill="#C68F55"/>
  <rect x="0" y="${horizon}" width="${SIZE}" height="${SIZE - horizon}" fill="#8B5E3C" opacity="0.45"/>
  <polygon points="${shadow}" fill="url(#shadowG)"/>
  <rect x="${C - plinthHalfW}" y="${plinthTop}" width="${plinthHalfW * 2}" height="${s(32)}" rx="${s(4)}" fill="#8A6845"/>
  <path d="${col}" fill="url(#stone)"/>
  <rect x="${C - capR}" y="${capY + capR * 0.55}" width="${capR * 2}" height="${s(3)}" fill="#6A4E34" opacity="0.35"/>
  ${romanXVIII(C - s(4), C + s(6), s(38), s(7), '#5B4127')}`;
}

// ---------------------------------------------------------------------------
// Variant C — "flat": no gradients, maximum legibility at small sizes.
// ---------------------------------------------------------------------------
function flat(s) {
  const groundY = C + s(122);
  const capR = s(56);
  const capY = C - s(92);
  const baseY = C + s(92);
  const plinthHalfW = s(88);
  const col = columnPath(C, capY, capR, baseY);

  return `
  <rect width="${SIZE}" height="${SIZE}" fill="#16294D"/>
  <circle cx="${C}" cy="${C - s(6)}" r="${s(158)}" fill="#F6B352"/>
  <rect x="0" y="${groundY}" width="${SIZE}" height="${SIZE - groundY}" fill="#10203C"/>
  <rect x="${C - plinthHalfW}" y="${C + s(88)}" width="${plinthHalfW * 2}" height="${s(34)}" rx="${s(6)}" fill="#F4E7CE"/>
  <path d="${col}" fill="#F4E7CE"/>
  ${romanXVIII(C, C + s(16), s(42), s(9), '#16294D')}`;
}

const variants = { dusk, sundial, flat };

function buildSvg(variantName, scale) {
  const s = (v) => v * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${variants[variantName](s)}
</svg>`;
}

// scale 1 fills the frame; 0.78 pulls the drawing inside the maskable safe circle.
const targets = [
  { file: 'icon.svg', scale: 1, svgOnly: true },
  { file: 'icon-maskable.svg', scale: 0.78, svgOnly: true },
  { file: 'icon-512.png', scale: 1, size: 512 },
  { file: 'icon-192.png', scale: 1, size: 192 },
  { file: 'icon-maskable-512.png', scale: 0.78, size: 512 },
  { file: 'icon-maskable-192.png', scale: 0.78, size: 192 },
  { file: 'apple-touch-icon.png', scale: 0.88, size: 180 },
  { file: 'favicon-32.png', scale: 1, size: 32 },
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const variant = arg('variant', 'sundial');
const outDir = arg('out', process.cwd());

if (!variants[variant]) {
  console.error(`unknown variant "${variant}" — expected one of ${Object.keys(variants).join(', ')}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

for (const t of targets) {
  const svg = buildSvg(variant, t.scale);
  const dest = join(outDir, t.file);
  if (t.svgOnly) {
    await writeFile(dest, svg);
  } else {
    await sharp(Buffer.from(svg)).resize(t.size, t.size).png({ compressionLevel: 9 }).toFile(dest);
  }
  console.log('wrote', dest);
}
