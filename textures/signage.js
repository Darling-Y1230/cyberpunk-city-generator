/**
 * textures/signage.js — procedural advertising art.
 *
 * The city's entire ad network is painted once into a single atlas at load
 * time; every billboard in the world is then an instance that selects a tile.
 * That keeps tens of thousands of signs at one draw call and a few hundred KB
 * of VRAM, with no external image files.
 */

const AD_FONTS = '"Noto Sans SC","Microsoft YaHei","PingFang SC","Hiragino Sans GB","Yu Gothic","Malgun Gothic",system-ui,sans-serif';
const MONO = '"Cascadia Mono","Consolas","SF Mono","DejaVu Sans Mono",monospace';

export const AD_THEMES = [
  { id: 'ai',        cjk: '神经核心',  lat: 'NEURAL CORE v9',     sub: '思考快过语言 · THINK FASTER', hue: 0.55 },
  { id: 'cyberware', cjk: '义体强化',  lat: 'KYBER ARMS™',        sub: '军工级 钛合金骨架',            hue: 0.85 },
  { id: 'bci',       cjk: '脑机接口',  lat: 'LINK YOUR MIND',     sub: '0.4ms 延迟 · 双向同步',        hue: 0.45 },
  { id: 'hovercar',  cjk: '飞车出行',  lat: 'AERO-TAXI 24H',      sub: '无需执照 · 全城直达',          hue: 0.10 },
  { id: 'idol',      cjk: '虚拟偶像',  lat: 'AI IDOL: MIRA',      sub: '全息巡演 今夜 22:00',          hue: 0.92 },
  { id: 'pharma',    cjk: '药剂',      lat: 'SOOTHE-X 3.0',       sub: '无副作用 · 医保覆盖',          hue: 0.38 },
  { id: 'crypto',    cjk: '数字货币',  lat: 'NCRED ▮ 4,281.55',   sub: '去中心化清算网络',             hue: 0.14 },
  { id: 'noodle',    cjk: '深夜拉面',  lat: 'RAMEN 24H',          sub: '热汤 · 合成叉烧 · ￥18',       hue: 0.03 },
  { id: 'security',  cjk: '武装安保',  lat: 'SABLE SECURITY',     sub: '企业治外法权响应 90 秒',       hue: 0.72 },
  { id: 'energy',    cjk: '聚变电池',  lat: 'FUSION CELL D-7',    sub: '十年续航 · 零辐射泄漏',        hue: 0.16 },
];

const rand = (rng, a, b) => a + (b - a) * rng.next();

function hsl(rng, hue, s, l) {
  return `hsl(${Math.round(((hue % 1) + 1) % 1 * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

function withAlpha(rng, hue, a, l = 0.5) {
  return `hsla(${Math.round(((hue % 1) + 1) % 1 * 360)} 90% ${Math.round(l * 100)}% / ${a})`;
}

/** Draws a plausible product silhouette for the theme. */
function drawMotif(ctx, theme, x, y, w, h, rng, ink) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(2, w * 0.012);
  ctx.lineJoin = 'round';
  switch (theme.id) {
    case 'ai': {                                     // processor die
      const s = Math.min(w, h) * 0.52;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.lineWidth = Math.max(2, w * 0.008);
      for (let i = 0; i < 7; i++) {
        const p = -s / 2 + (i + 0.5) * (s / 7);
        ctx.beginPath(); ctx.moveTo(p, -s / 2); ctx.lineTo(p, -s / 2 - s * 0.14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p, s / 2); ctx.lineTo(p, s / 2 + s * 0.14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s / 2, p); ctx.lineTo(-s / 2 - s * 0.14, p); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s / 2, p); ctx.lineTo(s / 2 + s * 0.14, p); ctx.stroke();
      }
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(-s * 0.22, -s * 0.22, s * 0.44, s * 0.44);
      break;
    }
    case 'cyberware': {                              // prosthetic arm
      const s = Math.min(w, h) * 0.7;
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, s * 0.5);
      ctx.lineTo(-s * 0.30, -s * 0.1);
      ctx.lineTo(-s * 0.12, -s * 0.30);
      ctx.lineTo(s * 0.16, -s * 0.42);
      ctx.lineTo(s * 0.34, -s * 0.18);
      ctx.lineTo(s * 0.10, s * 0.06);
      ctx.lineTo(s * 0.24, s * 0.5);
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-s * 0.1 + i * s * 0.14, -s * 0.06, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'bci': {                                    // head + signal arcs
      const s = Math.min(w, h) * 0.62;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.44, s * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.9 - i * 0.16;
        ctx.beginPath();
        ctx.arc(0, -s * 0.05, s * (0.5 + i * 0.22), -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
      }
      break;
    }
    case 'hovercar': {                               // aero taxi
      const s = Math.min(w, h) * 0.9;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.12);
      ctx.lineTo(-s * 0.26, -s * 0.16);
      ctx.lineTo(s * 0.22, -s * 0.20);
      ctx.lineTo(s * 0.5, s * 0.04);
      ctx.lineTo(s * 0.34, s * 0.22);
      ctx.lineTo(-s * 0.36, s * 0.24);
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(-s * 0.44, s * 0.34); ctx.lineTo(s * 0.44, s * 0.34); ctx.stroke();
      break;
    }
    case 'idol': {                                    // stylised avatar
      const s = Math.min(w, h) * 0.6;
      ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.34, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, s * 0.66);
      ctx.quadraticCurveTo(0, s * 0.02, s * 0.62, s * 0.66);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.24, s * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.24, s * 0.05, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'pharma': {                                  // capsule
      const s = Math.min(w, h) * 0.8;
      ctx.save(); ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.roundRect(-s * 0.5, -s * 0.17, s, s * 0.34, s * 0.17);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.17); ctx.lineTo(0, s * 0.17); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'crypto': {                                  // coin stack + chart
      const s = Math.min(w, h) * 0.6;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.85 - i * 0.2;
        ctx.beginPath();
        ctx.ellipse(0, s * 0.34 - i * s * 0.22, s * 0.5, s * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.5); ctx.lineTo(-s * 0.4, -s * 0.2);
      ctx.lineTo(0, -s * 0.42); ctx.lineTo(s * 0.5, s * 0.05); ctx.lineTo(s * 0.95, -s * 0.3);
      ctx.stroke();
      break;
    }
    case 'noodle': {                                  // ramen bowl
      const s = Math.min(w, h) * 0.72;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.05); ctx.lineTo(s * 0.5, s * 0.05); ctx.stroke();
      ctx.globalAlpha = 0.6;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.14, -s * 0.05);
        ctx.quadraticCurveTo(i * s * 0.14 + s * 0.1, -s * 0.4, i * s * 0.14 - s * 0.05, -s * 0.62);
        ctx.stroke();
      }
      break;
    }
    case 'security': {                                // shield + eye
      const s = Math.min(w, h) * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.lineTo(s * 0.45, -s * 0.30);
      ctx.lineTo(s * 0.34, s * 0.32);
      ctx.lineTo(0, s * 0.58);
      ctx.lineTo(-s * 0.34, s * 0.32);
      ctx.lineTo(-s * 0.45, -s * 0.30);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.26, s * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {                                        // fusion cell
      const s = Math.min(w, h) * 0.6;
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.9 - i * 0.2;
        ctx.beginPath(); ctx.arc(0, 0, s * i * 0.28, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Paints one advertising tile. */
export function paintAdTile(ctx, x, y, w, h, theme, rng) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.translate(x, y);

  const vertical = rng.bool(0.24);
  const ink = rng.bool(0.5) ? '#ffffff' : hsl(rng, theme.hue + 0.5, 0.95, 0.82);
  const accent = hsl(rng, theme.hue, 1.0, 0.62);
  const accent2 = hsl(rng, theme.hue + rand(rng, 0.35, 0.65), 1.0, 0.55);

  // ---- background ------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#05060b');
  bg.addColorStop(0.5, hsl(rng, theme.hue, 0.9, 0.16));
  bg.addColorStop(1, '#04050a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // diagonal light wedge
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, h); ctx.lineTo(w * (0.3 + rng.next() * 0.4), -h * 0.2);
  ctx.lineTo(w * (0.55 + rng.next() * 0.4), -h * 0.2); ctx.lineTo(w * 0.25, h);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  // ---- motif -----------------------------------------------------------
  drawMotif(ctx, theme, w * (vertical ? 0.72 : 0.80), h * 0.52, w * 0.34, h * 0.72, rng, accent);
  ctx.globalAlpha = 0.35;
  drawMotif(ctx, theme, w * (vertical ? 0.72 : 0.80) + 3, h * 0.52 + 2, w * 0.34, h * 0.72, rng, accent2);
  ctx.globalAlpha = 1;

  // ---- headline --------------------------------------------------------
  ctx.textBaseline = 'top';
  if (vertical) {
    // Japanese-style vertical blade: glyphs stacked down the left edge
    const chars = theme.cjk.split('');
    const size = Math.min(h / (chars.length + 0.6), w * 0.26);
    ctx.font = `900 ${size}px ${AD_FONTS}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = accent;
    ctx.shadowBlur = size * 0.6;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillStyle = i % 2 === 0 ? ink : accent;
      ctx.fillText(chars[i], w * 0.20, h * 0.06 + i * size * 1.08);
    }
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.translate(w * 0.72, h * 0.9);
    ctx.font = `700 ${h * 0.085}px ${MONO}`;
    ctx.fillStyle = withAlpha(rng, theme.hue, 0.85);
    ctx.textAlign = 'center';
    ctx.fillText(theme.lat.slice(0, 14), 0, 0);
    ctx.restore();
  } else {
    const big = theme.cjk;
    const size = Math.min(w * 0.62 / Math.max(big.length * 0.62, 1), h * 0.42);
    ctx.font = `900 ${size}px ${AD_FONTS}`;
    ctx.textAlign = 'left';
    ctx.shadowColor = accent;
    ctx.shadowBlur = size * 0.55;
    ctx.fillStyle = ink;
    ctx.fillText(big, w * 0.05, h * 0.10);
    ctx.shadowBlur = 0;

    ctx.font = `800 ${Math.max(11, h * 0.115)}px ${AD_FONTS}`;
    ctx.fillStyle = accent;
    ctx.fillText(theme.lat, w * 0.05, h * 0.10 + size * 1.06);

    ctx.font = `500 ${Math.max(9, h * 0.072)}px ${AD_FONTS}`;
    ctx.fillStyle = withAlpha(rng, theme.hue + 0.5, 0.8, 0.75);
    ctx.fillText(theme.sub, w * 0.05, h * 0.10 + size * 1.06 + h * 0.145);
  }

  // ---- price / legal strip --------------------------------------------
  ctx.font = `600 ${Math.max(8, h * 0.062)}px ${MONO}`;
  ctx.fillStyle = withAlpha(rng, theme.hue + 0.5, 0.65);
  ctx.textAlign = 'left';
  ctx.fillText('¥' + (rng.int(9, 9999)) + '.00', w * 0.05, h * 0.9);

  // barcode
  ctx.fillStyle = withAlpha(rng, theme.hue, 0.55, 0.85);
  let bx = w * 0.58;
  for (let i = 0; i < 26 && bx < w * 0.95; i++) {
    const bw = rng.float(1, 3.4);
    if (rng.bool(0.62)) ctx.fillRect(bx, h * 0.885, bw, h * 0.075);
    bx += bw + 1.6;
  }

  // corner brackets — the "corporate HUD" look
  ctx.strokeStyle = withAlpha(rng, theme.hue + 0.5, 0.6, 0.7);
  ctx.lineWidth = Math.max(2, w * 0.008);
  const bl = w * 0.05;
  const corners = [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * bl, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * bl);
    ctx.stroke();
  }

  // ---- CRT scanlines + vignette ---------------------------------------
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = '#000';
  const lineGap = Math.max(2, Math.round(h / 90));
  for (let sy = 0; sy < h; sy += lineGap * 2) ctx.fillRect(0, sy, w, lineGap);
  ctx.globalAlpha = 1;

  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // occasional dead-pixel band / interference
  if (rng.bool(0.3)) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = accent2;
    const by = rng.float(0, h), bh = rng.float(1, 6);
    ctx.fillRect(0, by, w, bh);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * Builds the atlas. Returns { canvas, texture, cols, rows, tileThemes }.
 */
export function buildAdAtlas(THREE, rng, cols = 6, rows = 4, tw = 512, th = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * tw;
  canvas.height = rows * th;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // roundRect polyfill for older engines
  if (!ctx.roundRect) {
    ctx.roundRect = function (x, y, w, h, r) {
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }
  const themes = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const theme = AD_THEMES[(ry * cols + rx) % AD_THEMES.length];
      const r2 = rng.derive('tile' + rx + '_' + ry);
      paintAdTile(ctx, rx * tw, ry * th, tw, th, theme, r2);
      themes.push(theme);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { canvas, texture, cols, rows, themes };
}

/** Small helper atlas: shop / street / warning glyph strips. */
export function buildSignStrip(THREE, rng, n = 16, w = 256, h = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = w * n;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const words = ['電', '宿', '面', '薬', '酒', '網', '肉', '茶', '拳', '医', '錢', '武',
    'HOTEL', 'BAR', 'NOODLE', 'CYBER', 'CLINIC', 'PAWN', 'DATA', 'RAMEN'];
  for (let i = 0; i < n; i++) {
    const hue = rng.next();
    ctx.save();
    ctx.translate(i * w, 0);
    ctx.fillStyle = `hsl(${hue * 360} 85% 12%)`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `hsl(${hue * 360} 100% 62%)`;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = `hsl(${hue * 360} 100% 78%)`;
    ctx.font = `900 ${h * 0.5}px ${AD_FONTS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = `hsl(${hue * 360} 100% 60%)`;
    ctx.shadowBlur = 22;
    ctx.fillText(words[(i * 7) % words.length], w / 2, h / 2);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture: t, n, w, h };
}
