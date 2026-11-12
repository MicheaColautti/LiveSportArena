// Texture disegnate su canvas (ghiaccio, LED, striscioni, bandiere, maglie) e materiali animati.
import * as THREE from 'three';
import { TEAMS } from './teams.js?v=184';
import { RINK, FONT, seeded, lum, canvas, texture, drawLogo, fitText } from './common.js?v=184';

/* ---------- texture ---------- */

export function iceTexture(homeLogo) {
  const W = 2048, H = 1024, s = W / 60, [c, g] = canvas(W, H);
  const X = x => (x + 30) * s, Z = z => (z + 15) * s;
  const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#eef5f9'); grad.addColorStop(0.5, '#fbfdfe'); grad.addColorStop(1, '#eef5f9');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const rand = seeded(3); g.strokeStyle = 'rgba(120,150,170,.05)';
  for (let i = 0; i < 260; i++) { g.lineWidth = 1 + rand() * 2; g.beginPath(); const x = rand() * W, y = rand() * H; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 220, y + (rand() - 0.5) * 60); g.stroke(); }
  const RED = '#cf2f3c', BLUE = '#2a62b6';
  if (homeLogo) { g.globalAlpha = 0.92; drawLogo(g, homeLogo, X(0), Z(0), 7.2 * s); g.globalAlpha = 1; }
  const vline = (x, w, col) => { g.fillStyle = col; g.fillRect(X(x) - w * s / 2, 0, w * s, H); };
  const ring = (x, z, r, col, w = 0.05) => { g.beginPath(); g.arc(X(x), Z(z), r * s, 0, Math.PI * 2); g.strokeStyle = col; g.lineWidth = w * s; g.stroke(); };
  const dot = (x, z, r, col) => { g.beginPath(); g.arc(X(x), Z(z), r * s, 0, Math.PI * 2); g.fillStyle = col; g.fill(); };
  vline(0, 0.3, RED); for (const k of [-1, 1]) { vline(k * RINK.blueX, 0.3, BLUE); vline(k * RINK.goalX, 0.05, RED); }
  ring(0, 0, 4.5, BLUE); dot(0, 0, 0.15, BLUE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    ring(sx * 20, sz * 7, 4.5, RED); dot(sx * 20, sz * 7, 0.3, RED); dot(sx * 6.7, sz * 7, 0.3, RED);
    g.fillStyle = RED; for (const hx of [-0.85, 0.85]) for (const hz of [-1, 1]) g.fillRect(X(sx * 20 + hx) - 0.025 * s, Z(sz * 7 + hz * 4.45) - (hz > 0 ? 0 : 0.6 * s), 0.05 * s, 0.6 * s);
  }
  for (const k of [-1, 1]) {
    const x = k * RINK.goalX;
    g.beginPath(); g.moveTo(X(x), Z(-1.83)); g.arc(X(x), Z(0), 1.83 * s, -Math.PI / 2, Math.PI / 2, k > 0); g.closePath();
    g.fillStyle = 'rgba(86,160,226,.42)'; g.fill(); g.strokeStyle = RED; g.lineWidth = 0.05 * s; g.stroke();
    g.beginPath(); g.moveTo(X(x), Z(-3.25)); g.lineTo(X(k * 30), Z(-4.4)); g.moveTo(X(x), Z(3.25)); g.lineTo(X(k * 30), Z(4.4)); g.stroke();
  }
  const t = texture(c); t.anisotropy = 8; return t;
}

export function boardsTexture(team) {
  const W = 2048, H = 128, [c, g] = canvas(W, H), T = TEAMS[team];
  g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2c230'; g.fillRect(0, H * 0.8, W, H * 0.2);
  const ads = ['LIVE SPORT ARENA', T.name.toUpperCase(), 'SPONSOR', 'HOCKEY', T.city.toUpperCase(), 'SPONSOR', 'LIVE SPORT ARENA', T.short];
  const w = W / ads.length;
  ads.forEach((a, i) => {
    const inv = i % 3 === 1;
    if (inv) { g.fillStyle = T.primary; g.fillRect(i * w + 6, 10, w - 12, H * 0.62); }
    g.fillStyle = inv ? (lum(T.primary) > 0.6 ? '#111' : '#fff') : (i % 2 ? '#1c2533' : T.primary);
    fitText(g, a, w - 30, 44, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a, i * w + w / 2, H * 0.42);
  });
  return texture(c, true);
}

export function ledTexture(team, arenaName) {
  const T = TEAMS[team], W = 2048, H = 64, [c, g] = canvas(W, H);
  const msgs = [T.short, T.chant.toUpperCase(), arenaName.toUpperCase(), 'LIVE SPORT ARENA', 'FORMAZIONI'];
  const w = W / msgs.length;
  msgs.forEach((m, i) => {
    const bg = [T.primary, '#06080b', T.secondary, '#06080b', T.primary][i];
    g.fillStyle = bg; g.fillRect(i * w, 0, w, H);
    const fg = bg === '#06080b' ? (lum(T.primary) < 0.25 ? T.secondary : T.primary) : (bg === T.secondary ? T.primary : (lum(T.primary) > 0.6 ? '#111' : T.secondary));
    g.fillStyle = fg === bg ? '#fff' : fg; fitText(g, m, w - 40, 40, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m, i * w + w / 2, H / 2 + 2);
  });
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
  return texture(c, true);
}

export function suitesTexture() {
  const W = 512, H = 64, [c, g] = canvas(W, H), rand = seeded(9);
  g.fillStyle = '#10141a'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) { const lit = rand() < 0.7; g.fillStyle = lit ? `rgba(255,${200 + rand() * 40 | 0},${140 + rand() * 50 | 0},${0.55 + rand() * 0.35})` : 'rgba(80,100,120,.35)'; g.fillRect(x + 3, 6, 26, H - 12); }
  return texture(c, true);
}

// Muro bianco davanti alla curva con una scritta a fumetto (Kloten: «JETZT WIRD'S Glatt»), con qualche raggio nero.
export function sloganWallTexture(left, right, aspect = 3, band = null) {
  const W = 2048, H = Math.max(160, Math.round(W / aspect)), [c, g] = canvas(W, H), rand = seeded(left + right);
  g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#111'; g.lineWidth = 4;
  for (let i = 0; i < 40; i++) { const cx = W * (0.2 + rand() * 0.36), cy = H * (0.3 + rand() * 0.4), a = rand() * Math.PI * 2, r0 = H * 0.32, r1 = r0 + 18 + rand() * 30; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke(); }
  g.fillStyle = '#121212'; g.textBaseline = 'middle';
  // Scritta al centro del muro: «JETZT WIRD'S» in nero corsivo pesante e, staccato a destra, «Glatt».
  g.save(); g.translate(W * 0.2, H * 0.6); g.transform(1, 0, -0.18, 1, 0, 0); g.font = `900 ${Math.round(H * 0.36)}px Impact, 'Arial Black', sans-serif`; g.fillText(left, 0, 0); g.restore();
  g.font = `bold ${Math.round(H * 0.44)}px Georgia, 'Times New Roman', serif`; g.textAlign = 'left'; g.fillText(right, W * 0.6, H * 0.6);
  // Fascia blu in cima con la scritta della curva (bianca, bordo rosso), come lo striscione del Kloten.
  if (band) { const bh = H * 0.24; g.fillStyle = '#1d2f6e'; g.fillRect(0, 0, W, bh); g.fillStyle = '#c8202c'; g.fillRect(0, bh - 4, W, 4);
    g.font = `900 ${Math.round(bh * 0.7)}px 'Courier New', monospace`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#c8202c'; g.strokeText(band, W / 2, bh / 2); g.fillStyle = '#f4f4f2'; g.fillText(band, W / 2, bh / 2); }
  return texture(c);
}

// Faccia di una torre d'angolo in cemento (Porrentruy): cemento a casseri con le aperture sovrapposte, scure dentro, con
// il soffitto di legno, il parapetto di legno chiaro, il corrimano e qualcuno affacciato.
export function cornerTowerTexture(levels = 3) {
  const W = 256, H = 512, [c, g] = canvas(W, H), rand = seeded('corner-tower' + levels);
  g.fillStyle = '#b4b4af'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(90,90,85,.25)'; g.lineWidth = 1; for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,60,55,.35)'; g.fillRect(rand() * W, rand() * H, 2, 2); }
  const top = 0.08, bottom = 0.78, lh = (bottom - top) / levels;
  for (let k = 0; k < levels; k++) {
    const y0 = H * (top + k * lh) + 10, oh = H * lh - 22, x0 = W * 0.1, ow = W * 0.8;
    g.fillStyle = '#1f2024'; g.fillRect(x0, y0, ow, oh);
    g.fillStyle = '#c9a777'; g.fillRect(x0, y0, ow, oh * 0.12);
    g.fillStyle = 'rgba(255,214,150,.55)'; for (let x = x0 + 14; x < x0 + ow - 10; x += 34) g.fillRect(x, y0 + oh * 0.12, 10, 4);
    for (let i = 0; i < 4; i++) if (rand() < 0.7) { const px = x0 + 16 + rand() * (ow - 32); g.fillStyle = '#3a3c42'; g.fillRect(px, y0 + oh * 0.42, 12, oh * 0.3); g.beginPath(); g.arc(px + 6, y0 + oh * 0.38, 6, 0, Math.PI * 2); g.fillStyle = '#d7a985'; g.fill(); }
    g.fillStyle = '#ddc394'; g.fillRect(x0, y0 + oh * 0.66, ow, oh * 0.34);
    g.fillStyle = 'rgba(120,90,50,.35)'; for (let x = x0; x < x0 + ow; x += 10) g.fillRect(x, y0 + oh * 0.66, 1, oh * 0.34);
    g.fillStyle = '#d9dcdf'; g.fillRect(x0, y0 + oh * 0.6, ow, 3);
  }
  return texture(c);
}

// Vetrata delle logge VIP: lastre alte con montanti chiari, riflesso freddo in alto e luce calda delle sale dietro,
// con qualche ospite in controluce.
export function vipGlassTexture() {
  const W = 256, H = 128, [c, g] = canvas(W, H), rand = seeded(17);
  for (let x = 0; x < W; x += 64) {
    const warm = g.createLinearGradient(0, 0, 0, H); warm.addColorStop(0, '#3a4a58'); warm.addColorStop(0.45, '#6d6450'); warm.addColorStop(1, rand() < 0.75 ? '#d8b47a' : '#8f8a7c');
    g.fillStyle = warm; g.fillRect(x, 0, 64, H);
    g.fillStyle = 'rgba(200,220,235,.18)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x, 50); g.fill();
    for (let k = 0; k < 3; k++) if (rand() < 0.6) { const px = x + 8 + rand() * 46, ph = 26 + rand() * 10; g.fillStyle = 'rgba(30,28,26,.75)'; g.fillRect(px, H - ph, 7, ph); g.beginPath(); g.arc(px + 3.5, H - ph - 4, 4, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = '#d6dbe0'; for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 4, H); g.fillRect(0, 0, W, 4); g.fillRect(0, H - 6, W, 6);
  return texture(c, true);
}

export function bannerTexture(team, text, sub) {
  const T = TEAMS[team], W = 1024, H = 128, [c, g] = canvas(W, H);
  g.fillStyle = T.primary; g.fillRect(0, 0, W, H);
  g.fillStyle = T.secondary; g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12);
  g.fillStyle = T.accent; g.fillRect(0, 12, W, 5); g.fillRect(0, H - 17, W, 5);
  const fg = lum(T.primary) > 0.6 ? T.accent === '#ffffff' ? '#111' : T.accent : T.secondary;
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, text.toUpperCase(), W - 80, 66, 900); g.fillText(text.toUpperCase(), W / 2, sub ? 54 : H / 2 + 2);
  if (sub) { fitText(g, sub.toUpperCase(), W - 120, 24, 700); g.fillText(sub.toUpperCase(), W / 2, 96); }
  return texture(c);
}

export function hangingBannerTexture(team, logo, line) {
  const T = TEAMS[team], W = 256, H = 448, [c, g] = canvas(W, H);
  g.fillStyle = T.primary; g.fillRect(0, 0, W, H);
  g.fillStyle = T.secondary; g.fillRect(0, H - 70, W, 70); g.fillStyle = T.accent; g.fillRect(0, H - 78, W, 8);
  g.beginPath(); g.arc(W / 2, 150, 92, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  drawLogo(g, logo, W / 2, 150, 150);
  g.fillStyle = lum(T.primary) > 0.6 ? '#111' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, T.short, W - 30, 54, 900); g.fillText(T.short, W / 2, 292);
  g.fillStyle = lum(T.secondary) > 0.6 ? T.primary : '#fff'; fitText(g, line, W - 30, 26, 800); g.fillText(line, W / 2, H - 35);
  return texture(c);
}

export const FLAG_CELL = [256, 160], FLAG_GRID = [4, 2];
export function flagAtlas(team, logo) {
  const T = TEAMS[team], [cw, ch] = FLAG_CELL, [c, g] = canvas(cw * FLAG_GRID[0], ch * FLAG_GRID[1]);
  const designs = T.flags.slice(0, FLAG_GRID[0] * FLAG_GRID[1]);
  const p = T.primary, s = T.secondary, a = T.accent;
  designs.forEach((d, i) => {
    const x = (i % FLAG_GRID[0]) * cw, y = Math.floor(i / FLAG_GRID[0]) * ch;
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
    const R = (col, rx, ry, rw, rh) => { g.fillStyle = col; g.fillRect(x + rx * cw, y + ry * ch, rw * cw, rh * ch); };
    switch (d) {
      case 'h2': R(p, 0, 0, 1, .5); R(s, 0, .5, 1, .5); break;
      case 'h3': R(p, 0, 0, 1, 1 / 3); R(s, 0, 1 / 3, 1, 1 / 3); R(a === s ? p : a, 0, 2 / 3, 1, 1 / 3); break;
      case 'v2': R(p, 0, 0, .5, 1); R(s, .5, 0, .5, 1); break;
      case 'v3': R(p, 0, 0, 1 / 3, 1); R(s, 1 / 3, 0, 1 / 3, 1); R(a === s ? p : a, 2 / 3, 0, 1 / 3, 1); break;
      case 'diag': R(p, 0, 0, 1, 1); g.beginPath(); g.moveTo(x, y + ch); g.lineTo(x + cw, y); g.lineTo(x + cw, y + ch); g.fillStyle = s; g.fill();
        g.beginPath(); g.moveTo(x, y + ch); g.lineTo(x + cw, y); g.strokeStyle = a; g.lineWidth = 18; g.stroke(); break;
      case 'cross': R(p, 0, 0, 1, 1); R(s, .3, 0, .14, 1); R(s, 0, .43, 1, .14); break;
      case 'stripes': for (let k = 0; k < 7; k++) R(k % 2 ? s : p, 0, k / 7, 1, 1 / 7); R(a === s ? p : a, 0, 3 / 7, 1, 1 / 7); break;
      case 'name2': R(s, 0, 0, 1, 1); R(p, 0, 0, 1, .16); R(p, 0, .84, 1, .16); g.fillStyle = p; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, T.short, cw - 30, 70, 900); g.fillText(T.short, x + cw / 2, y + ch / 2 + 2); break;
      case 'check': for (let ix = 0; ix < 8; ix++) for (let iy = 0; iy < 5; iy++) R((ix + iy) % 2 ? p : s, ix / 8, iy / 5, 1 / 8, 1 / 5); break;
      case 'logo': R(s, 0, 0, 1, 1); R(p, 0, 0, 1, .12); R(p, 0, .88, 1, .12); drawLogo(g, logo, x + cw / 2, y + ch / 2, ch * 0.66); break;
      case 'name': R(p, 0, 0, 1, 1); R(s, 0, .78, 1, .22); g.fillStyle = s; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, T.short, cw - 30, 70, 900); g.fillText(T.short, x + cw / 2, y + ch * 0.4); break;
      default: R(p, 0, 0, 1, 1);
    }
    g.restore();
  });
  const t = texture(c); t.userData = { count: designs.length }; return t;
}

// Divisa: in casa colore sociale, in trasferta maglia bianca con i colori sociali sui dettagli.
export function kitColors(team, away) {
  const T = TEAMS[team];
  if (!away) return { shirt: T.primary, stripe: T.secondary, trim: T.accent, number: lum(T.primary) > 0.6 ? (lum(T.secondary) > 0.6 ? T.accent : T.secondary) : T.secondary };
  const dark = lum(T.primary) < 0.6 ? T.primary : (lum(T.secondary) < 0.6 ? T.secondary : T.accent);
  return { shirt: '#f3f4f2', stripe: T.primary, trim: dark, number: dark };
}

export function jerseyTexture(team, number, goalie, away) {
  const T = TEAMS[team], K = kitColors(team, away), [c, g] = canvas(128, 128);
  g.fillStyle = K.shirt; g.fillRect(0, 0, 128, 128);
  g.fillStyle = K.stripe; g.fillRect(0, 96, 128, 10); g.fillStyle = K.trim; g.fillRect(0, 106, 128, 4);
  g.font = `900 ${goalie ? 54 : 64}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fg = K.number;
  g.lineWidth = 6; g.strokeStyle = lum(fg) > 0.5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.85)'; g.strokeText(String(number), 64, 52);
  g.fillStyle = fg; g.fillText(String(number), 64, 52);
  return texture(c);
}

/* ---------- materiali speciali ---------- */

export function flagMaterial(map, time) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uMap: { value: map }, uTime: time, uGrid: { value: new THREE.Vector2(...FLAG_GRID) } },
    vertexShader: `
      uniform float uTime; uniform vec2 uGrid;
      attribute float aDesign; attribute float aPhase;
      varying vec2 vUv; varying float vShade;
      void main() {
        vec3 p = position;
        float w = length(instanceMatrix[0].xyz);
        float k = uv.x, wave = uTime * 5.2 + aPhase - uv.x * 5.0;
        p.z += sin(wave) * 0.07 * k * (1.0 + 0.4 * sin(uTime * 1.3 + aPhase)) / max(w, 0.4) * w;
        p.y -= k * k * 0.06;
        vShade = 0.8 + 0.2 * cos(wave);
        float col = mod(aDesign, uGrid.x), row = floor(aDesign / uGrid.x);
        vUv = vec2((col + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying float vShade;
      void main() { vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function bounceMaterial(time) {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\nattribute vec2 aBounce;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aBounce.x * abs(sin(uTime * 4.4 + aBounce.y));');
  };
  return m;
}
