// Planimetria di un'arena: profili delle tribune, sezioni (quattro lati e angoli) e zone del pubblico.
// Convenzione: x lungo la pista, z in larghezza. Nord = z < 0 (lato lontano dalla telecamera), sud = z > 0 (panchine).
// Ovest = x < 0, est = x > 0. Lungo una sezione t va da 0 a 1: da ovest a est sui lati lunghi, da nord a sud sui lati corti.

import { RINK } from './common.js?v=184';

export const SIDES = ['north', 'south', 'west', 'east'];

// Profilo di una tribuna: file con distanza dal bordo interno (d), profondità, altezza; fronti degli anelli (bands).
export function makeProfile(spec) {
  const rows = [], bands = [], floors = [], base = spec.base ?? 1.2;
  let d = 0, last = 0;
  spec.tiers.forEach((t, ti) => {
    let top = base, below = 0;
    if (t.overhang) {
      d -= t.overhang;
      top = last + t.clearance;
      below = top - 0.35;
    } else if (ti > 0) {
      const gd = t.gap?.depth ?? 1.8, gr = t.gap?.rise ?? 2.6;
      floors.push({ d0: d, d1: d + gd, h: last }); d += gd;
      bands.push({ d, y0: last, y1: last + gr, kind: t.fascia || 'plain', tier: ti });
      top = last + gr; below = last;
    }
    for (let r = 0; r < t.rows; r++) {
      rows.push({ d, depth: t.depth, h: top, below, tier: ti, standing: !!(t.standing ?? spec.standing), vip: !!t.vip, index: rows.length, first: r === 0 });
      below = top; d += t.depth; top += t.rise;
    }
    last = rows[rows.length - 1].h;
  });
  return { rows, bands, floors, base, depth: d, top: last, spec };
}

// Altezza della fila a distanza d (utile per piazzare telecamere sopra il pubblico).
export function heightAt(P, d) {
  let h = P.base;
  for (const R of P.rows) { if (R.d <= d) h = Math.max(h, R.h); }
  return h;
}

export function buildLayout(A) {
  const { halfL, halfW, corner } = RINK, g = A.gaps;
  const ex = halfL + g.end, zn = halfW + g.side, zs = halfW + g.bench;
  const P = Object.fromEntries(SIDES.map(k => [k, makeProfile(A.stands[k])]));
  // Angoli: false = aperti; true = tribune laterali che girano; { west: 'end' } = la curva ovest avvolge i suoi angoli.
  // Dove l'angolo è chiuso, le file seguono la curva della balaustra (archi concentrici agli angoli della pista).
  // 'wedge' = cunei d'angolo (Lugano): i quattro lati arrivano dritti fino al rettangolo esterno e ogni angolo è un prisma
  // a base triangolare troncato in diagonale. In pianta è un triangolo con il vertice verso lo spigolo della pista e i due
  // cateti lungo le testate delle tribune vicine; sopra, la gradinata sale dal vertice (basso, vicino al ghiaccio) fino
  // all'ipotenusa in fondo (alta). File parallele all'ipotenusa, scala al centro.
  if (A.corners === 'wedge') {
    const sections = [
      { key: 'north', kind: 'straight', ox: 0, oz: -zn, dx: 1, dz: 0, nx: 0, nz: -1, len: 2 * ex, profile: P.north },
      { key: 'south', kind: 'straight', ox: 0, oz: zs, dx: 1, dz: 0, nx: 0, nz: 1, len: 2 * ex, profile: P.south },
      { key: 'west', kind: 'straight', ox: -ex, oz: (zs - zn) / 2, dx: 0, dz: 1, nx: -1, nz: 0, len: zn + zs, profile: P.west },
      { key: 'east', kind: 'straight', ox: ex, oz: (zs - zn) / 2, dx: 0, dz: 1, nx: 1, nz: 0, len: zn + zs, profile: P.east },
    ];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sections.push(wedgeSection(A, P, sx, sz, ex, zn, zs));
    return { sections, ex, zn, zs, profiles: P };
  }
  const corners = A.corners === true ? { west: 'side', east: 'side' } : (A.corners || {});
  const cx = halfL - corner, cz = halfW - corner;
  // sidesTo: ['east'] = i lati lunghi proseguono dritti fino in fondo alla testata (oltre la sua tribuna), che sta tra
  // loro con gli angoli a squadra (Zurigo: le tribune laterali arrivano al muro delle nicchie).
  const to = k => (A.sidesTo || []).includes(k) && !corners[k] ? P[k].depth : 0;
  const x0 = corners.west ? -cx : -ex - to('west'), x1 = corners.east === 'short' ? ex - 2 : corners.east ? cx : ex + to('east');
  const end = key => { const c = corners[key]; if (c === 'short') return { z0: -zn + 2, z1: zs - 2 }; return { z0: c ? -cz : -zn, z1: c ? cz : zs }; };
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
    const short = mode === 'short', zEdge = sz < 0 ? zn : zs;
    sections.push({ key: `corner-${endKey}-${side}`, kind: 'arc', cx: sx * (short ? ex - 2 : cx), cz: sz * (short ? zEdge - 2 : cz), rx: short ? 2 : ex - cx, rz: short ? 2 : zEdge - cz, a0, a1, end: endKey, side, wrap: mode === 'end', profile: short ? makeProfile({ base: P[endKey].base, tiers: [A.stands[endKey].tiers[0]] }) : mode === 'end' ? P[endKey] : P[side], chamfer: A.cornerStyle === 'chamfer', chamferFrom: ((mode === 'end' ? P[endKey] : P[side]).bands[0]?.d ?? 0) - 0.01 });
  }
  // upperArc (Zurigo): l'anello superiore dei lati lunghi gira sopra l'angolo curvo del primo anello e prosegue lungo la
  // testata, a scalare. Ogni fila è una sezione appesa (hang) a sé: la prima fa il giro completo (arco + tratto dritto
  // lungo la testata, dove incontra quella dell'altro lato); le altre si fermano sempre un po' prima. Nessuna fila passa
  // oltre il muro di fondo (`wall` = distanza del muro dal fronte della testata): l'arco si ferma appena prima.
  const UA = A.upperArc;
  if (UA) {
    const end = UA.end || 'east', sx = end === 'east' ? 1 : -1, wall = UA.wall ?? P[end].depth + 3, rx = ex - cx, gap = UA.gap ?? 0.3;
    for (const side of ['north', 'south']) {
      const Q = P[side], rows = Q.rows.filter(R => R.tier > 0), sz = side === 'north' ? -1 : 1, rz = (sz < 0 ? zn : zs) - cz;
      if (!rows.length) continue;
      const a0 = Math.atan2(0, sx); let a1 = Math.atan2(sz, 0); if (Math.abs(a1 - a0) > Math.PI) a1 += a1 < a0 ? 2 * Math.PI : -2 * Math.PI;
      const main = sections.find(S => S.key === side); if (main) main.hangEnd = sx > 0 ? 1 : 0;
      rows.forEach((R0, k) => {
        const R = { ...R0, index: 0, first: true, below: k === 0 ? Math.max(R0.below, R0.h - (UA.parapet ?? 1.2)) : R0.below };
        const prof = { rows: [R], bands: [], floors: [], base: R.h, depth: R.d + R.depth, top: R.h };
        // Angolo (dalla direzione della testata) dove la fila incontra il muro, e quello voluto per la scala.
        const back = rx + R.d + R.depth, cosW = (rx + wall - gap) / back, clip = cosW >= 1 ? 0 : Math.acos(cosW), want = k <= 1 ? 0 : (k - 1) * (UA.stepDeg ?? 6) * Math.PI / 180;
        const th = Math.max(clip, want); if (th >= Math.PI / 2 - 0.05) return;
        const b0 = a0 + (a1 - a0) * (th / (Math.PI / 2));
        sections.push({ key: `corner-${end}-${side}-up${k}`, kind: 'arc', hang: true, capStart: th > 0, cx: sx * cx, cz: sz * cz, rx, rz, a0: b0, a1, end, side, wrap: false, profile: prof, chamfer: false, chamferFrom: 0 });
        // Tratto dritto lungo la testata: la prima fila arriva a metà (incontra l'altra), la seconda si ferma prima.
        const L = k === 0 ? cz : k === 1 ? cz * (UA.second ?? 0.45) : 0;
        if (L > 0.3 && clip === 0) {
          const zA = sz * cz, zB = sz * (cz - L);
          sections.push({ key: `${end}-up${k}-${side}`, kind: 'straight', hang: true, capEnd: k > 0, ox: sx * ex, oz: (zA + zB) / 2, dx: 0, dz: 1, nx: sx, nz: 0, len: Math.abs(zA - zB), profile: prof });
        }
      });
    }
  }
  return { sections, ex, zn, zs, profiles: P };
}

// Cuneo d'angolo. Cateti: lungo x (accanto alla testata, lungo quanto è profonda la tribuna del lato corto) e lungo z
// (accanto al lato lungo, profondo quanto la sua tribuna). d = distanza dal vertice misurata perpendicolare all'ipotenusa.
// Il vertice è spostato di 5 cm dentro l'angolo: le facce del cuneo non stanno mai sullo stesso piano delle testate vicine.
// A.wedge: { h0 (quota del vertice), top (quota in fondo; default la più bassa delle due tribune vicine), row (profondità
// della fila), edge (colore del parapetto sui cateti), at: { 'west-north': { ...override } } }.
function wedgeSection(A, P, sx, sz, ex, zn, zs) {
  const endKey = sx < 0 ? 'west' : 'east', side = sz < 0 ? 'north' : 'south';
  const W = { ...(A.wedge || {}), ...(A.wedge?.at?.[`${endKey}-${side}`] || {}) };
  // lower: il cuneo riempie solo l'angolo dell'anello basso (Berna): cateti e quota finale presi dal primo anello dei lati vicini,
  // così sopra l'angolo l'anello superiore resta diviso in quattro parti.
  const tier0 = Q => { const r = Q.rows.filter(R => R.tier === 0).at(-1); return { depth: r.d + r.depth, top: r.h }; };
  const Le = W.lower ? tier0(P[endKey]).depth : P[endKey].depth, Ln = W.lower ? tier0(P[side]).depth : P[side].depth, hyp = Math.hypot(Le, Ln), H = Le * Ln / hyp;
  const h0 = W.h0 ?? Math.min(P[endKey].base, P[side].base), top = W.top ?? (W.lower ? Math.min(tier0(P[endKey]).top, tier0(P[side]).top) : Math.min(P[endKey].top, P[side].top));
  // tip: punta piatta, le file partono a questa distanza dal vertice (la prima fila è già un tratto dritto).
  const tip = W.tip ?? 0, n = Math.max(2, Math.round((H - tip) / (W.row ?? 0.85)));
  let profile;
  if (W.match) {
    // match: il cuneo ripete gli anelli della testata vicina (file, corridoio, muro, secondo anello) con le profondità
    // ridotte in proporzione, così sale fino in cima come i lati e le quote combaciano lungo i cateti.
    const spec = A.stands[endKey], k = (H - tip) / P[endKey].depth;
    profile = makeProfile({ ...spec, tiers: spec.tiers.map(t => ({ ...t, depth: t.depth * k, vip: false, standing: false, ...(t.gap ? { gap: { ...t.gap, depth: (t.gap.depth ?? 1.8) * k } } : {}) })) });
  } else profile = makeProfile({ base: h0, tiers: [{ rows: n, rise: (top - h0) / (n - 1), depth: (H - tip) / n }] });
  return { key: `wedge-${endKey}-${side}`, kind: 'wedge', ix: sx * (ex + 0.05), iz: sz < 0 ? -(zn + 0.05) : zs + 0.05, sx, sz, Le, Ln, H, tip,
    nx: sx * Ln / hyp, nz: sz * Le / hyp, end: endKey, side, wrap: false, profile, edge: W.edge, stair: W.stair ?? true };
}

// Valori di t per una sezione: passo regolare più i tagli richiesti (confini dei settori), ordinati.
export function sectionTs(S, t0 = 0, t1 = 1, step = 7, cuts = []) {
  const n = S.kind === 'straight' ? Math.max(1, Math.round(S.len * (t1 - t0) / step)) : S.kind === 'wedge' ? 4 : 14;
  const ts = Array.from({ length: n + 1 }, (_, i) => t0 + (t1 - t0) * i / n);
  for (const c of cuts) if (c > t0 + 1e-3 && c < t1 - 1e-3 && !ts.some(t => Math.abs(t - c) < 0.02)) ts.push(c);
  return ts.sort((a, b) => a - b);
}

// Polilinea di una sezione a distanza d dal bordo interno; t0..t1 = porzione lungo la sezione.
export function sectionLine(S, d, t0 = 0, t1 = 1, step = 7, cuts = []) {
  return sectionTs(S, t0, t1, step, cuts).map(t => { const p = sectionPoint(S, t, d); return [p.x, p.z]; });
}

// Punto e normale verso l'esterno a (t, d) su una sezione.
export function sectionPoint(S, t, d) {
  if (S.kind === 'straight') {
    const s = (t - 0.5) * S.len;
    return { x: S.ox + S.dx * s + S.nx * d, z: S.oz + S.dz * s + S.nz * d, nx: S.nx, nz: S.nz };
  }
  if (S.kind === 'wedge') {
    // t = 0 sul cateto accanto alla testata, t = 1 sul cateto accanto al lato lungo.
    const f = (d + S.tip) / S.H;
    return { x: S.ix + S.sx * S.Le * f * (1 - t), z: S.iz + S.sz * S.Ln * f * t, nx: S.nx, nz: S.nz };
  }
  if (S.chamfer && d >= S.chamferFrom) {
    // Anello superiore con l'angolo smussato: un taglio dritto in diagonale (Lugano); l'anello basso segue la balaustra.
    const ax = S.cx + Math.cos(S.a0) * (S.rx + d), az = S.cz + Math.sin(S.a0) * (S.rz + d), bx = S.cx + Math.cos(S.a1) * (S.rx + d), bz = S.cz + Math.sin(S.a1) * (S.rz + d);
    let nx = bz - az, nz = -(bx - ax); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * (ax + bx - 2 * S.cx) + nz * (az + bz - 2 * S.cz) < 0) { nx = -nx; nz = -nz; }
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx, nz };
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
// Un settore può proseguire nell'angolo vicino: guest.corner = lato con cui l'angolo confina (es. side 'east', corner 'south').
export function inZone(S, t, R, z) {
  if (!z) return false;
  if (z.tier != null && z.tier !== R.tier) return false;
  if (z.rowFrom != null && R.index < z.rowFrom) return false; // settore che non arriva al ghiaccio: davanti restano posti normali
  if (S.kind !== 'straight') {
    // cornerTo: l'angolo è occupato solo fino a quel punto (t da 0 sul lato del settore a 1 sull'altro lato).
    // cornerFrom..cornerTo: tratto dell'angolo occupato (0 = dal lato del settore). cornerOnly: solo l'angolo, niente lato.
    if (z.corner) { const inC = (S.end === z.side && S.side === z.corner) || (S.side === z.side && S.end === z.corner), tt = S.end === z.side ? t : 1 - t; return inC && tt >= (z.cornerFrom ?? 0) - 1e-6 && (z.cornerTo == null || tt <= z.cornerTo + 1e-6); }
    return S.wrap && S.end === z.side && z.from == null && z.to == null;
  }
  if (z.cornerOnly) return false;
  return S.key === z.side && t >= (z.from ?? 0) - 1e-6 && t <= (z.to ?? 1) + 1e-6;
}

export function zoneAt(A, S, t, R) {
  if (inZone(S, t, R, A.guest)) return 'guest';
  if (inZone(S, t, R, A.home) || (S.kind === 'arc' && S.wrap && A.home?.side === S.end && (A.home.tier == null || A.home.tier === R.tier))) return R.standing || A.home?.seatedCurve ? 'curve' : 'side';
  // standing[].force: settore in piedi anche dentro una tribuna a sedere; .curve: tifosi di casa che saltano (come la curva).
  for (const z of A.standing || []) if (inZone(S, t, R, z) && (R.standing || z.force)) return z.curve ? 'curve' : 'standing';
  return 'side';
}

// Settori in piedi dentro un anello a sedere (es. ospiti in piedi su metà lato): il gradino si disegna senza sedili.
export function standsAt(A, S, t, R) {
  if (R.standing) return true;
  if (A.guest?.standing && inZone(S, t, R, A.guest)) return true;
  return (A.standing || []).some(z => z.force && inZone(S, t, R, z));
}

// Confini dei settori lungo una sezione dritta (per tagliare le file nel punto giusto).
export function zoneCuts(A, S) {
  if (S.kind !== 'straight') return [];
  return [A.home, A.guest, ...(A.standing || [])].filter(z => z && z.side === S.key).flatMap(z => [z.from, z.to]).filter(v => v != null);
}

export function sectionByKey(layout, key) { return layout.sections.find(s => s.key === key); }
