const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('node:path');
const fs = require('node:fs');

const font = path.join(__dirname, '../../fonts/Arial.ttf');
if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'Raymond');
const colors = { bg: '#0b1017', panel: '#141c27', line: '#283242', text: '#f4f0e8', muted: '#91a0b5', gold: '#dfbd7c', track: '#263141' };
const avatars = new Map(), frames = new Map(), rendering = new Map();
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
let frameBytes = 0, activeRenders = 0;
const renderWaiters = [];
const standardNumbers = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const compactNumbers = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
async function withRenderSlot(draw) {
  if (activeRenders >= 4) {
    if (renderWaiters.length >= 24) throw Object.assign(new Error('Card renderer is busy'), { code: 'RENDER_BUSY' });
    await new Promise(resolve => renderWaiters.push(resolve));
  } else activeRenders++;
  try { return await draw(); }
  finally { const next = renderWaiters.shift(); if (next) next(); else activeRenders--; }
}
function remember(map, key, value, max) {
  map.delete(key); map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}
async function avatar(url) {
  if (!url) return null;
  if (Buffer.isBuffer(url)) return loadImage(url); // Local preview assets, never command input.
  const cached = avatars.get(url);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = (async () => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname)) return null;
      const response = await fetch(parsed, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      if (!response.ok || Number(response.headers.get('content-length')) > 524288) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 524288) return null;
      return await loadImage(buffer);
    } catch { return null; }
  })();
  remember(avatars, url, { until: Date.now() + 300000, promise }, 64);
  return promise;
}
async function frame(key, draw) {
  const hit = frames.get(key);
  if (hit && hit.until > Date.now()) return hit.buffer;
  if (rendering.has(key)) return rendering.get(key);
  const promise = (async () => {
    const buffer = await withRenderSlot(draw);
    if (frames.has(key)) { frameBytes -= frames.get(key).buffer.length; frames.delete(key); }
    frames.set(key, { buffer, until: Date.now() + 15000 }); frameBytes += buffer.length;
    while (frames.size > 24 || frameBytes > MAX_FRAME_BYTES) {
      const first = frames.keys().next().value;
      frameBytes -= frames.get(first).buffer.length; frames.delete(first);
    }
    return buffer;
  })();
  rendering.set(key, promise);
  try { return await promise; } finally { rendering.delete(key); }
}
function rounded(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function text(ctx, value, x, y, size = 20, color = colors.text, weight = 'normal', maxWidth) {
  ctx.font = `${weight} ${size}px Raymond, Arial, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'left';
  let label = String(value ?? '').replace(/[\n\r\t]/g, ' ');
  if (maxWidth && ctx.measureText(label).width > maxWidth) {
    const units = [...label];
    while (units.length && ctx.measureText(`${units.join('')}…`).width > maxWidth) units.pop();
    label = `${units.join('')}…`;
  }
  ctx.fillText(label, x, y);
}
function base(width, height) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width, 0, 10, width, 0, width * .8);
  glow.addColorStop(0, '#262b30'); glow.addColorStop(1, colors.bg);
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  rounded(ctx, 1, 1, width - 2, height - 2, 24, null, colors.line);
  ctx.fillStyle = colors.gold; ctx.fillRect(36, 32, 4, 20);
  text(ctx, 'R A Y M O N D', 53, 48, 17, colors.gold, 'bold');
  return { canvas, ctx };
}
function progress(ctx, x, y, width, ratio, height = 9) {
  rounded(ctx, x, y, width, height, height / 2, colors.track);
  const value = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (value) rounded(ctx, x, y, Math.max(height, width * value), height, height / 2, colors.gold);
}
function portrait(ctx, image, name, x, y, size, border = colors.line) {
  ctx.save(); ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  if (image) ctx.drawImage(image, x, y, size, size);
  else {
    ctx.fillStyle = '#263447'; ctx.fillRect(x, y, size, size);
    text(ctx, [...String(name || '?')][0].toUpperCase(), x + size * .32, y + size * .65, size * .43, colors.gold, 'bold');
  }
  ctx.restore(); ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 + 3, 0, Math.PI * 2);
  ctx.lineWidth = 2; ctx.strokeStyle = border; ctx.stroke();
}
function number(value) { return (Number(value) >= 1000000 ? compactNumbers : standardNumbers).format(Number(value) || 0); }
function footer(ctx, width, y, left, right = 'Your community. Your progress.') {
  ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(36, y - 24); ctx.lineTo(width - 36, y - 24); ctx.stroke();
  text(ctx, left, 36, y, 15, colors.muted, 'normal', width * .55);
  ctx.font = '15px Raymond, Arial, sans-serif'; const rightWidth = ctx.measureText(right).width;
  text(ctx, right, width - 36 - rightWidth, y, 15, colors.muted);
}
module.exports = { colors, avatar, frame, rounded, text, base, progress, portrait, number, footer };
