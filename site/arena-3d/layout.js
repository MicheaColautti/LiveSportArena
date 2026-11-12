// Planimetria di un'arena: profili delle tribune, sezioni (quattro lati e angoli) e zone del pubblico.
// Convenzione: x lungo la pista, z in larghezza. Nord = z < 0 (lato lontano dalla telecamera), sud = z > 0 (panchine).
// Ovest = x < 0, est = x > 0. Lungo una sezione t va da 0 a 1: da ovest a est sui lati lunghi, da nord a sud sui lati corti.

import { RINK } from './common.js?v=23';

export const SIDES = ['north', 'south', 'west', 'east'];

// Profilo di una tribuna: file con distanza dal bordo interno (d), profondità, altezza; fronti degli anelli (bands).
export function makeProfile(spec) {
  const rows = [], bands = [], floors = [], base = spec.base ?? 1.2;
  let d = 0, last = 0;
  spec.tiers.forEach((t, ti) => {
    let top = base, below = 0;
    if (ti > 0) {
      const gd = t.gap?.depth ?? 1.8, gr = t.gap?.rise ?? 2.6;
      floors.push({ d0: d, d1: d + gd, h: last }); d += gd;
      bands.push({ d, y0: last, y1: last + gr, kind: t.fascia || 'plain', tier: ti });
      top = last + gr; below = last;
    }
    for (let r = 0; r < t.rows; r++) {
      rows.push({ d, depth: t.depth, h: top, below, tier: ti, standing: !!(t.standing ?? spec.standing), index: rows.length, first: r === 0 });
      below = top; d += t.depth; top += t.rise;
    }
    last = rows[rows.length - 1].h;
  });
  return { rows, bands, floors, base, depth: d, top: last, spec };
}

// Altezza della fila a distanza d (utile per piazzare telecamere sopra il pubblico).
export function heightAt(P, d) {
  let h = P.base;
  for (const R of P.rows) { if (R.d > d) break; h = R.h; }
  return h;
}

export function buildLayout(A) {
  const { halfL, halfW, corner } = RINK, g = A.gaps;
  const ex = halfL + g.end, zn = halfW + g.side, zs = halfW + g.bench;
  const P = Object.fromEntries(SIDES.map(k => [k, makeProfile(A.stands[k])]));
  // Angoli: false = aperti; true = tribune laterali che girano; { west: 'end' } = la curva ovest avvolge i suoi angoli.
  // Dove l'angolo è chiuso, le file seguono la curva della balaustra (archi concentrici agli angoli della pista).
  const corners = A.corners === true ? { west: 'side', east: 'side' } : (A.corners || {});
  const cx = halfL - corner, cz = halfW - corner;
  const x0 = corners.west ? -cx : -ex, x1 = corners.east ? cx : ex;
  const end = key => { const c = corners[key]; return { z0: c ? -cz : -zn, z1: c ? cz : zs }; };
  const W = end('west'), E = end('east');
  const sections = [
    { key: 'north', kind: 'straight', ox: (x0 + x1) / 2, oz: -zn, dx: 1, dz: 0, nx: 0, nz: -1, len: x1 - x0, profile: P.north },
    { key: 'south', kind: 'straight', ox: (x0 + x1) / 2, oz: zs, dx: 1, dz: 0, nx: 0, nz: 1, len: x1 - x0, profile: P.south },
    { key: 'west', kind: 'straight', ox: -ex, oz: (W.z0 + W.z1) / 2, dx: 0, dz: 1, nx: -1, nz: 0, len: W.z1 - W.z0, profile: P.west },
    { key: 'east', kind: 'straight', ox: ex, oz: (E.z0 + E.z1) / 2, dx: 0, dz: 1, nx: 1, nz: 0, len: E.z1 - E.z0, profile: P.east },
  ];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const endKey = sx < 0 ? 'west' : 'east', side = sz < 0 ? 'north' : 'south', mode = corners[endKey];
    if (!mode) continue;
    const a0 = Math.atan2(0, sx); let a1 = Math.atan2(sz, 0);
    if (Math.abs(a1 - a0) > Math.PI) a1 += a1 < a0 ? 2 * Math.PI : -2 * Math.PI;
    sections.push({ key: `corner-${endKey}-${side}`, kind: 'arc', cx: sx * cx, cz: sz * cz, rx: ex - cx, rz: (sz < 0 ? zn : zs) - cz, a0, a1, end: endKey, side, wrap: mode === 'end', profile: mode === 'end' ? P[endKey] : P[side] });
  }
  return { sections, ex, zn, zs, profiles: P };
}

// Polilinea di una sezione a distanza d dal bordo interno; t0..t1 = porzione lungo la sezione.
export function sectionLine(S, d, t0 = 0, t1 = 1, step = 7) {
  if (S.kind === 'straight') {
    const n = Math.max(1, Math.round(S.len * (t1 - t0) / step)), pts = [];
    for (let i = 0; i <= n; i++) {
      const s = (t0 + (t1 - t0) * i / n - 0.5) * S.len;
      pts.push([S.ox + S.dx * s + S.nx * d, S.oz + S.dz * s + S.nz * d]);
    }
    return pts;
  }
  const n = 14, pts = [];
  for (let i = 0; i <= n; i++) { const a = S.a0 + (S.a1 - S.a0) * (t0 + (t1 - t0) * i / n); pts.push([S.cx + Math.cos(a) * (S.rx + d), S.cz + Math.sin(a) * (S.rz + d)]); }
  return pts;
}

// Punto e normale verso l'esterno a (t, d) su una sezione.
export function sectionPoint(S, t, d) {
  if (S.kind === 'straight') {
    const s = (t - 0.5) * S.len;
    return { x: S.ox + S.dx * s + S.nx * d, z: S.oz + S.dz * s + S.nz * d, nx: S.nx, nz: S.nz };
  }
  const a = S.a0 + (S.a1 - S.a0) * t;
  return { x: S.cx + Math.cos(a) * (S.rx + d), z: S.cz + Math.sin(a) * (S.rz + d), nx: Math.cos(a), nz: Math.sin(a) };
}

export function samplePolyline(pts, spacing, rand, jitter = 0.1) {
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push({ a: pts[i - 1], b: pts[i], len, start: total }); total += len; }
  const out = [], n = Math.floor(total / spacing);
  if (n < 1) return out;
  const off = (total - (n - 1) * spacing) / 2;
  for (let k = 0; k < n; k++) {
    const s = Math.min(total - 1e-3, Math.max(0, off + k * spacing + (rand() - 0.5) * jitter));
    const seg = segs.find(q => s <= q.start + q.len) || segs[segs.length - 1];
    if (!seg.len) continue;
    const u = (s - seg.start) / seg.len, dx = (seg.b[0] - seg.a[0]) / seg.len, dz = (seg.b[1] - seg.a[1]) / seg.len;
    const x = seg.a[0] + (seg.b[0] - seg.a[0]) * u, z = seg.a[1] + (seg.b[1] - seg.a[1]) * u;
    let nx = dz, nz = -dx; if (nx * x + nz * z < 0) { nx = -nx; nz = -nz; }
    out.push({ x, z, dx, dz, nx, nz, t: s / total });
  }
  return out;
}

// Zona di un posto: 'curve' (curva di casa), 'standing' (altri settori in piedi di casa), 'guest' (ospiti), 'side' (pubblico misto).
export function zoneAt(A, S, t, R) {
  const side = S.kind === 'arc' ? (S.wrap ? S.end : null) : S.key;
  const inside = z => z && z.side === side && (S.kind === 'arc' || (t >= (z.from ?? 0) && t <= (z.to ?? 1))) && (z.tier == null || z.tier === R.tier);
  if (S.kind !== 'arc' && inside(A.guest)) return 'guest';
  if (inside(A.home)) return R.standing ? 'curve' : 'side';
  for (const z of A.standing || []) if (inside(z) && R.standing) return 'standing';
  return 'side';
}

export function sectionByKey(layout, key) { return layout.sections.find(s => s.key === key); }
