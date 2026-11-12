// Utilità condivise: numeri casuali ripetibili, colori, immagini, canvas e costruzione di geometrie.
import * as THREE from 'three';
import { TEAMS, LOGO_DIR } from './teams.js?v=184';

export const RINK = { halfL: 30, halfW: 15, corner: 8.5, goalX: 26, blueX: 8.2 };
export const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

/* ---------- utilità ---------- */

export function seeded(seed) {
  let s = typeof seed === 'number' ? seed : [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = (rand, list) => list[Math.floor(rand() * list.length)];
export const weighted = (rand, pairs) => { let r = rand() * pairs.reduce((a, p) => a + p[1], 0); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };
export const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const color = c => new THREE.Color(c);
export const lum = c => { const k = color(c); return 0.299 * k.r + 0.587 * k.g + 0.114 * k.b; };

const images = new Map();
export function loadImage(src) {
  if (!images.has(src)) images.set(src, new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; }));
  return images.get(src);
}
export const logoOf = team => loadImage(LOGO_DIR + TEAMS[team].logo + '.png');

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function texture(c, repeat = false) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; }
  return t;
}
export function drawLogo(g, img, cx, cy, size) {
  if (!img) return;
  const k = size / Math.max(img.width, img.height), w = img.width * k, h = img.height * k;
  g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
export function fitText(g, text, maxW, size, weight = 800) {
  let s = size; g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = `${weight} ${s}px ${FONT}`; }
  return s;
}

/* ---------- costruttore di geometrie con colori per vertice ---------- */

export const CUBE = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]];
export const CUBE_FACES = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
export const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Mesher {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, k) { for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.c.push(k.r, k.g, k.b); } }
  quad(a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
  boxM(m, k) {
    const v = CUBE.map(([x, y, z]) => _v.set(x, y, z).applyMatrix4(m).toArray());
    for (const f of CUBE_FACES) this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], k);
  }
  box(x, y, z, sx, sy, sz, k, ry = 0, rz = 0, rx = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YZX')), _s.set(sx, sy, sz)); this.boxM(_m, k);
  }
  beam(a, b, thick, k, thickY = thick) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    _m.compose(A.add(B).multiplyScalar(0.5), _q, _s.set(len, thickY, thick)); this.boxM(_m, k);
  }
  // Parete verticale visibile solo dall'interno (dall'esterno l'arena resta "in sezione").
  wall(a, b, y0, y1, k) {
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]), nz = b[0] - a[0];
    if (nx * mx + nz * mz > 0) [a, b] = [b, a];
    this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], k);
  }
  get empty() { return this.p.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals(); return g;
  }
  mesh(opts = {}) { return new THREE.Mesh(this.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...opts })); }
}

// Nastro verticale lungo una polilinea [[x, z], ...]: u in metri / uScale, v da y0 a y1.
export function stripGeometry(pts, y0, y1, { closed = false, uScale = 10 } = {}) {
  const P = closed ? [...pts, pts[0]] : pts, pos = [], uv = [], idx = [];
  let L = 0;
  P.forEach((p, i) => {
    if (i) L += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]);
    const a = typeof y0 === 'function' ? y0(p) : y0, b = typeof y1 === 'function' ? y1(p) : y1;
    pos.push(p[0], a, p[1], p[0], b, p[1]); uv.push(L / uScale, 0, L / uScale, 1);
    if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.userData.length = L; return g;
}

export function roundedRect(hx, hz, r, n = 10) {
  const pts = [], arc = (cx, cz, from) => { for (let i = 0; i <= n; i++) { const a = from + i / n * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  arc(hx - r, hz - r, 0); arc(-hx + r, hz - r, Math.PI / 2); arc(-hx + r, -hz + r, Math.PI); arc(hx - r, -hz + r, Math.PI * 1.5);
  return pts;
}

// Orienta una polilinea in modo che una scritta sul nastro si legga dall'interno dell'arena.
export function readable(pts) {
  if (pts.length < 2) return pts;
  const i = Math.floor((pts.length - 1) / 2), a = pts[i], b = pts[i + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let nx = dz, nz = -dx; if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
  return dx * -nz + dz * nx < 0 ? [...pts].reverse() : pts;
}
