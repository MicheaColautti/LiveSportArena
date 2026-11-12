// Esterno dell'arena per l'intro aerea: involucro, tetto, insegna e dintorni stilizzati (da viste satellite).
// Tutto è configurato in arenas.js → exterior. I lati (north/south/west/east) seguono la convenzione di layout.js.

import * as THREE from 'three';
import { TEAMS } from './teams.js?v=23';
import { seeded, color, canvas, texture, drawLogo, fitText, lum, Mesher, stripGeometry, roundedRect } from './common.js?v=23';

// L'involucro deve contenere tutto il rettangolo interno: ottagono e angoli arrotondati vengono allargati quanto serve.
function footprint(shape, X0, X1, Z0, Z1) {
  let w = X1 - X0, d = Z1 - Z0;
  if (shape === 'octagon') { const c = Math.min(w, d) * 0.3, e = c / 2 + 1; X0 -= e; X1 += e; Z0 -= e; Z1 += e; return [[X0 + c, Z0], [X1 - c, Z0], [X1, Z0 + c], [X1, Z1 - c], [X1 - c, Z1], [X0 + c, Z1], [X0, Z1 - c], [X0, Z0 + c]]; }
  if (shape === 'rounded') { const r0 = Math.min(w, d) / 2 * 0.42, e = r0 * 0.3 + 1, hx = w / 2 + e, hz = d / 2 + e, mx = X0 + w / 2, mz = Z0 + d / 2; return roundedRect(hx, hz, Math.min(hx, hz) * 0.42, 7).map(([x, z]) => [x + mx, z + mz]); }
  return [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
}

function facadeTexture(E) {
  const W = 512, H = 256, [c, g] = canvas(W, H), base = E.wall || '#8d9096';
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const dark = color(base).multiplyScalar(0.72).getStyle(), light = color(base).lerp(color('#ffffff'), 0.18).getStyle();
  if (E.facade === 'wood') { for (let x = 0; x < W; x += 8) { g.fillStyle = x % 16 ? dark : base; g.fillRect(x, 0, 6, H); } }
  else if (E.facade === 'fins') { for (let x = 0; x < W; x += 24) { g.fillStyle = dark; g.fillRect(x, 0, 6, H); g.fillStyle = light; g.fillRect(x + 6, 0, 2, H); } }
  else if (E.facade === 'glass') { g.fillStyle = '#35495c'; g.fillRect(0, H * 0.15, W, H * 0.6); g.strokeStyle = dark; g.lineWidth = 3; for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, H * 0.15); g.lineTo(x, H * 0.75); g.stroke(); } }
  else { g.strokeStyle = dark; g.lineWidth = 2; for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  // Fascia vetrata con ingressi al piano terra.
  g.fillStyle = '#2b3a47'; g.fillRect(0, H * 0.86, W, H * 0.14);
  const rand = seeded(E.wall || 'f');
  for (let x = 4; x < W; x += 28) { g.fillStyle = rand() < 0.6 ? 'rgba(255,214,150,.75)' : 'rgba(150,180,200,.5)'; g.fillRect(x, H * 0.88, 20, H * 0.1); }
  g.fillStyle = light; g.fillRect(0, 0, W, 6);
  const t = texture(c, true); return t;
}

function roofTexture(kind, tint) {
  const [c, g] = canvas(256, 256), rand = seeded(kind);
  if (kind === 'solar' || kind === 'terracotta-solar') {
    g.fillStyle = kind === 'solar' ? '#9a9c9e' : '#a5573a'; g.fillRect(0, 0, 256, 256);
    for (let y = 8; y < 256; y += 32) { g.fillStyle = '#1d2b45'; g.fillRect(6, y, 244, 22); g.strokeStyle = 'rgba(160,180,210,.35)'; g.lineWidth = 1; for (let x = 6; x < 250; x += 14) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.stroke(); } }
  } else if (kind === 'metal') {
    g.fillStyle = tint || '#3b3e43'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,255,255,.08)'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 3, 256);
  } else if (kind === 'wood') {
    g.fillStyle = tint || '#5a4532'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 10) { g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.05)'; g.fillRect(0, y, 256, 9); }
  } else {
    g.fillStyle = tint || '#c9ccd0'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(0,0,0,.08)'; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(90,95,100,.5)'; g.fillRect(rand() * 220, rand() * 220, 18, 12); }
  }
  const t = texture(c, true); t.wrapT = THREE.RepeatWrapping; return t;
}

function glazingTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3e5566'; g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256); grad.addColorStop(0, 'rgba(190,215,235,.35)'); grad.addColorStop(1, 'rgba(40,60,75,0)'); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1d1a17'; g.lineWidth = 6; for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.lineWidth = 4; for (let y = 0; y <= 256; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = texture(c, true); t.wrapT = THREE.RepeatWrapping; return t;
}

function signTexture(A, logo) {
  const [c, g] = canvas(1024, 160), T = TEAMS[A.team];
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 1024, 160);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(80, 80, 70, 0, Math.PI * 2); g.fill(); drawLogo(g, logo, 80, 80, 110);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, A.name.toUpperCase(), 840, 84, 900); g.fillText(A.name.toUpperCase(), 170, 80);
  g.fillStyle = T.primary; g.fillRect(170, 128, 160, 8);
  const t = texture(c); return t;
}

function pitchTexture() {
  const [c, g] = canvas(512, 340);
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#4f8a3c' : '#589842'; g.fillRect(i * 51.2, 0, 51.2, 340); }
  g.strokeStyle = '#f2f2f2'; g.lineWidth = 3; g.strokeRect(14, 14, 484, 312); g.beginPath(); g.moveTo(256, 14); g.lineTo(256, 326); g.stroke();
  g.beginPath(); g.arc(256, 170, 40, 0, Math.PI * 2); g.stroke(); g.strokeRect(14, 100, 70, 140); g.strokeRect(428, 100, 70, 140);
  return texture(c);
}

// Rettangolo orientato: centro, lunghezza lungo x (o z se along='z'), larghezza.
function flatRect(group, cx, cz, lx, lz, mat, y = 0.02) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), mat); m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); group.add(m); return m;
}

export function buildExterior(A, { EX, EZn, EZs, roofY, archRise = 0, logo }) {
  const E = A.exterior || {}, group = new THREE.Group(), rand = seeded(A.team + 'ext');
  const pad = 1.2, X0 = -EX - pad, X1 = EX + pad, Z0 = -EZn - pad, Z1 = EZs + pad;
  const H = E.roof === 'star' && E.eaves ? E.eaves : roofY + (E.parapet ?? 1.5), fp = footprint(E.shape, X0, X1, Z0, Z1);
  const occupied = [[X0 - 14, X1 + 14, Z0 - 14, Z1 + 14]];
  const occupy = (x0, x1, z0, z1) => occupied.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);

  // Terreno e piazzale.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: E.ground === 'urban' ? '#8e8f88' : E.ground === 'alpine' ? '#6f8a55' : '#79925a' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; group.add(ground);
  flatRect(group, (X0 + X1) / 2, (Z0 + Z1) / 2, X1 - X0 + 28, Z1 - Z0 + 28, new THREE.MeshLambertMaterial({ color: '#b8b5ad' }), -0.03);

  // Facciata.
  const fac = facadeTexture(E);
  const facade = new THREE.Mesh(stripGeometry(fp, 0, H, { closed: true, uScale: 18 }), new THREE.MeshLambertMaterial({ map: fac, side: THREE.DoubleSide }));
  group.add(facade);

  // Tetto.
  const roof = new THREE.Group(); group.add(roof);
  const kind = E.roof || 'flat', mat = E.roofMat || 'membrane';
  if (kind === 'star') {
    // Falde incrociate (come Davos): due tetti a capanna che si intersecano, timpani vetrati sui quattro lati.
    const M = new Mesher(), cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, hx = (X1 - X0) / 2, hz = (Z1 - Z0) / 2, rise = E.rise ?? 20;
    const hgt = (x, z) => H + rise * Math.max(1 - Math.abs(z - cz) / hz, 1 - Math.abs(x - cx) / hx);
    const N = 32, k = color(E.roofColor || '#3d3a36'), k2 = k.clone().multiplyScalar(1.12);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = X0 + (X1 - X0) * i / N, x1 = X0 + (X1 - X0) * (i + 1) / N, z0 = Z0 + (Z1 - Z0) * j / N, z1 = Z0 + (Z1 - Z0) * (j + 1) / N;
      const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, alongX = 1 - Math.abs(zm - cz) / hz > 1 - Math.abs(xm - cx) / hx;
      M.quad([x0, hgt(x0, z0), z0], [x1, hgt(x1, z0), z0], [x1, hgt(x1, z1), z1], [x0, hgt(x0, z1), z1], alongX ? k : k2);
    }
    roof.add(M.mesh({ flatShading: true }));
    // Timpani: triangoli verticali sui quattro lati, in vetro con montanti.
    const glass = new THREE.MeshLambertMaterial({ map: glazingTexture(), emissive: color('#2a3d4c'), emissiveIntensity: 0.5, side: THREE.DoubleSide });
    const tri = (a, b, c2) => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c2], 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (Math.hypot(b[0] - a[0], b[2] - a[2])) / 8, 0, (Math.hypot(b[0] - a[0], b[2] - a[2])) / 16, (c2[1] - a[1]) / 8], 2)); g2.computeVertexNormals(); roof.add(new THREE.Mesh(g2, glass)); };
    tri([X0, H, Z0], [X0, H, Z1], [X0, H + rise, cz]); tri([X1, H, Z0], [X1, H, Z1], [X1, H + rise, cz]);
    tri([X0, H, Z0], [X1, H, Z0], [cx, H + rise, Z0]); tri([X0, H, Z1], [X1, H, Z1], [cx, H + rise, Z1]);
    // Gronda scura sporgente.
    roof.add(new THREE.Mesh(stripGeometry(fp, H - 0.6, H + 0.15, { closed: true }), new THREE.MeshLambertMaterial({ color: '#1f1b18', side: THREE.DoubleSide })));
  } else if (kind === 'pyramid') {
    const M = new Mesher(), cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, apex = [cx, H + (E.rise ?? 14), cz], k = color(E.roofColor || '#4a3a2c');
    fp.forEach((p, i) => { const q = fp[(i + 1) % fp.length]; M.tri([p[0], H, p[1]], [q[0], H, q[1]], apex, i % 2 ? k : k.clone().multiplyScalar(0.88)); });
    roof.add(M.mesh());
  } else if (kind === 'barrel') {
    const M = new Mesher(), N = 20, zc = (Z0 + Z1) / 2, hz = (Z1 - Z0) / 2, rise = E.rise ?? hz * 0.35, k = color(E.roofColor || '#d7d9dc');
    for (let i = 0; i < N; i++) {
      const u0 = -1 + 2 * i / N, u1 = -1 + 2 * (i + 1) / N, y0 = H + rise * Math.sqrt(1 - u0 * u0), y1 = H + rise * Math.sqrt(1 - u1 * u1);
      M.quad([X0, y0, zc + u0 * hz], [X1, y0, zc + u0 * hz], [X1, y1, zc + u1 * hz], [X0, y1, zc + u1 * hz], i % 2 ? k : k.clone().multiplyScalar(0.94));
      const cap = color(E.wall || '#d7d3c9');
      for (const x of [X0, X1]) { M.tri([x, H, zc + u0 * hz], [x, H, zc + u1 * hz], [x, y1, zc + u1 * hz], cap); M.tri([x, H, zc + u0 * hz], [x, y1, zc + u1 * hz], [x, y0, zc + u0 * hz], cap); }
    }
    roof.add(M.mesh());
  } else {
    const shape = new THREE.Shape(fp.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 9, pos.getY(i) / 9);
    geo.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: roofTexture(mat, E.roofColor) })); top.position.y = H + 0.02; roof.add(top);
    const parapet = new THREE.Mesh(stripGeometry(fp, H, H + 0.7, { closed: true }), new THREE.MeshLambertMaterial({ color: color(E.wall || '#8d9096').multiplyScalar(0.85), side: THREE.DoubleSide })); roof.add(parapet);
    if (kind === 'shed') {
      const M = new Mesher(), k = color('#e9ecef'), g = color('#7f9db5');
      for (let z = Z0 + 4; z < Z1 - 4; z += 7) { M.quad([X0 + 3, H, z], [X1 - 3, H, z], [X1 - 3, H + 2.4, z + 2.2], [X0 + 3, H + 2.4, z + 2.2], g); M.quad([X0 + 3, H + 2.4, z + 2.2], [X1 - 3, H + 2.4, z + 2.2], [X1 - 3, H, z + 5.5], [X0 + 3, H, z + 5.5], k); }
      roof.add(M.mesh());
    }
    if (kind === 'slope') { top.rotation.z = 0; }
  }

  // Insegna sul lato principale (sud) e torri d'ingresso.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 4.7), new THREE.MeshBasicMaterial({ map: signTexture(A, logo), transparent: true }));
  sign.position.set(0, Math.min(H - 3, 9), Z1 + 0.15); group.add(sign);
  if (E.towers) for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, H * 0.8, 20), new THREE.MeshLambertMaterial({ color: '#2b2d31' })); t.position.set(x, H * 0.4, z); group.add(t);
  }

  // Dintorni.
  const place = (f, w, len) => {
    const d = f.dist ?? 30, off = f.offset ?? 0;
    if (f.side === 'north') return { cx: off, cz: Z0 - d - w / 2, lx: len, lz: w, along: 'x' };
    if (f.side === 'south') return { cx: off, cz: Z1 + d + w / 2, lx: len, lz: w, along: 'x' };
    if (f.side === 'west') return { cx: X0 - d - w / 2, cz: off, lx: w, lz: len, along: 'z' };
    return { cx: X1 + d + w / 2, cz: off, lx: w, lz: len, along: 'z' };
  };
  const cars = [];
  for (const f of E.features || []) {
    const len = f.len ?? 1400;
    if (f.type === 'rail') {
      const w = (f.tracks ?? 3) * 5, p = place(f, w, len), M = new Mesher(), steel = color('#5b5e63');
      flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshLambertMaterial({ color: '#8a8378' }), 0.01);
      for (let i = 0; i < (f.tracks ?? 3); i++) for (const o of [-0.72, 0.72]) {
        const c = -w / 2 + 2.5 + i * 5 + o;
        if (p.along === 'x') M.box(p.cx, 0.12, p.cz + c, len, 0.15, 0.12, steel); else M.box(p.cx + c, 0.12, p.cz, 0.12, 0.15, len, steel);
      }
      group.add(M.mesh()); occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'road' || f.type === 'motorway') {
      const w = f.type === 'motorway' ? 26 : 10, p = place(f, w, len);
      flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshLambertMaterial({ color: '#4a4c50' }), 0.015);
      const n = f.type === 'motorway' ? 3 : 1;
      for (let i = 1; i <= n; i++) { const o = -w / 2 + i * w / (n + 1); if (p.along === 'x') flatRect(group, p.cx, p.cz + o, len, 0.25, new THREE.MeshBasicMaterial({ color: '#e8e8e2' }), 0.025); else flatRect(group, p.cx + o, p.cz, 0.25, len, new THREE.MeshBasicMaterial({ color: '#e8e8e2' }), 0.025); }
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'river') {
      const p = place(f, f.w ?? 34, len);
      flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshPhongMaterial({ color: '#4f7f95', shininess: 80, specular: color('#9bb7c6') }), 0.01);
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'runway') {
      const p = place(f, 30, len);
      flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshLambertMaterial({ color: '#9c9d9a' }), 0.012);
      for (let s = -len / 2 + 10; s < len / 2; s += 30) flatRect(group, p.along === 'x' ? p.cx + s : p.cx, p.along === 'x' ? p.cz : p.cz + s, p.along === 'x' ? 14 : 0.8, p.along === 'x' ? 0.8 : 14, new THREE.MeshBasicMaterial({ color: '#f3f3f0' }), 0.022);
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'parking') {
      const p = place(f, f.w ?? 40, f.len ?? 60);
      flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshLambertMaterial({ color: '#6f7175' }), 0.012);
      for (let i = 0; i < (f.cars ?? 40); i++) cars.push([p.cx + (rand() - 0.5) * (p.lx - 4), p.cz + (rand() - 0.5) * (p.lz - 4), p.along]);
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'pitch' || f.type === 'stadium') {
      const p = place(f, 74, 110), m = flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshLambertMaterial({ map: pitchTexture() }), 0.014);
      if (p.along === 'z') m.rotation.z = Math.PI / 2, m.scale.set(p.lz / p.lx, p.lx / p.lz, 1);
      if (f.type === 'stadium') { const M = new Mesher(), k = color('#9da1a7'); M.box(p.cx, 6, p.cz - p.lz / 2 - 6, p.lx + 20, 12, 10, k); M.box(p.cx, 6, p.cz + p.lz / 2 + 6, p.lx + 20, 12, 10, k); M.box(p.cx - p.lx / 2 - 6, 4, p.cz, 10, 8, p.lz, k); M.box(p.cx + p.lx / 2 + 6, 4, p.cz, 10, 8, p.lz, k); group.add(M.mesh()); }
      occupy(p.cx - p.lx / 2 - 14, p.cx + p.lx / 2 + 14, p.cz - p.lz / 2 - 14, p.cz + p.lz / 2 + 14);
    } else if (f.type === 'pool') {
      const p = place(f, 26, 50);
      flatRect(group, p.cx, p.cz, p.lx + 8, p.lz + 8, new THREE.MeshLambertMaterial({ color: '#d9d4c8' }), 0.012);
      flatRect(group, p.cx, p.cz, p.lx, p.lz, new THREE.MeshPhongMaterial({ color: '#3fb2d6', shininess: 90 }), 0.02);
      occupy(p.cx - p.lx / 2 - 4, p.cx + p.lx / 2 + 4, p.cz - p.lz / 2 - 4, p.cz + p.lz / 2 + 4);
    } else if (f.type === 'hall' || f.type === 'rink2' || f.type === 'garage') {
      const p = place(f, f.w ?? 40, f.len ?? 60), h = f.h ?? (f.type === 'garage' ? 9 : 12), M = new Mesher();
      M.box(p.cx, h / 2, p.cz, p.lx, h, p.lz, color(f.color || (f.type === 'garage' ? '#9a9c9f' : '#d9dadc')));
      group.add(M.mesh()); occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'city' || f.type === 'gardens') {
      const M = new Mesher(), n = f.n ?? 40, spread = f.spread ?? 220;
      for (let i = 0; i < n; i++) {
        const along = (rand() - 0.5) * spread * 2, out = (f.dist ?? 40) + rand() * (f.depth ?? 160);
        let x, z; if (f.side === 'north') { x = along; z = Z0 - out; } else if (f.side === 'south') { x = along; z = Z1 + out; } else if (f.side === 'west') { x = X0 - out; z = along; } else { x = X1 + out; z = along; }
        if (occupied.some(r => x > r[0] - 8 && x < r[1] + 8 && z > r[2] - 8 && z < r[3] + 8)) continue;
        if (f.type === 'gardens') { M.box(x, 0.05, z, 8 + rand() * 6, 0.1, 6 + rand() * 5, color(pick3(rand, ['#6f9a4c', '#8bab5a', '#a58a5c', '#5f8a45']))); continue; }
        const w = 12 + rand() * 18, d = 12 + rand() * 18, h = 8 + rand() * (f.height ?? 22);
        M.box(x, h / 2, z, w, h, d, color(pick3(rand, ['#d8d3c8', '#c9c4ba', '#b8b4ad', '#e2ddd2', '#a9a59e'])), rand() * 0.3);
        M.box(x, h + 0.4, z, w * 0.96, 0.8, d * 0.96, color('#7c7a76'), 0);
        occupy(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
      }
      group.add(M.mesh());
    }
  }
  if (cars.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), cars.length), m = new THREE.Matrix4(), k = new THREE.Color();
    cars.forEach(([x, z, along], i) => { m.compose(new THREE.Vector3(x, 0.75, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), along === 'x' ? Math.PI / 2 : 0), new THREE.Vector3(1.9, 1.4, 4.4)); inst.setMatrixAt(i, m); inst.setColorAt(i, k.set(pick3(rand, ['#e6e6e6', '#202226', '#8b9096', '#b3262c', '#2b4d7a', '#c7c9cc']))); });
    group.add(inst);
  }

  // Alberi: bosco attorno o sparsi.
  const treeCount = E.trees ?? 160, rMin = Math.max(X1, Z1) + 22, rMax = rMin + (E.forest ? 140 : 260);
  if (treeCount) {
    const conifer = E.conifers ?? true, trunks = [], crowns = [];
    for (let i = 0, tries = 0; i < treeCount && tries < treeCount * 8; tries++) {
      const a = rand() * Math.PI * 2, r = rMin + Math.pow(rand(), E.forest ? 0.8 : 1.4) * (rMax - rMin), x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
      if (occupied.some(q => x > q[0] - 3 && x < q[1] + 3 && z > q[2] - 3 && z < q[3] + 3)) continue;
      const h = 9 + rand() * 12; trunks.push([x, z, h]); crowns.push([x, z, h, rand()]); i++;
    }
    const m = new THREE.Matrix4(), k = new THREE.Color(), q = new THREE.Quaternion();
    const tg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 5), new THREE.MeshLambertMaterial({ color: '#5a4430' }), trunks.length);
    const cg = new THREE.InstancedMesh(conifer ? new THREE.ConeGeometry(1, 1, 7) : new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial(), crowns.length);
    trunks.forEach(([x, z, h], i) => { m.compose(new THREE.Vector3(x, h * 0.15, z), q, new THREE.Vector3(1, h * 0.3, 1)); tg.setMatrixAt(i, m); });
    crowns.forEach(([x, z, h, v], i) => { m.compose(new THREE.Vector3(x, conifer ? h * 0.6 : h * 0.62, z), q, conifer ? new THREE.Vector3(h * 0.22, h * 0.8, h * 0.22) : new THREE.Vector3(h * 0.3, h * 0.32, h * 0.3)); cg.setMatrixAt(i, m); cg.setColorAt(i, k.set(conifer ? (v < 0.5 ? '#2f4f2f' : '#3a5d36') : (v < 0.5 ? '#4f7a3a' : '#5f8a44'))); });
    group.add(tg, cg);
  }

  // Montagne all'orizzonte.
  if (E.mountains) {
    const n = E.mountains, M = new Mesher();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.3, r = 520 + rand() * 380, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 140 + rand() * 300, w = 160 + rand() * 220;
      const peak = [x, h, z], segs = 7, base = Array.from({ length: segs }, (_, j) => { const b = j / segs * Math.PI * 2; return [x + Math.cos(b) * w, -1, z + Math.sin(b) * w]; });
      const rock = color(rand() < 0.5 ? '#6e7568' : '#7d8273'), snow = color('#f1f3f4');
      base.forEach((p, j) => {
        const q = base[(j + 1) % segs], mid = (s, t) => [s[0] + (t[0] - s[0]) * 0.72, s[1] + (t[1] - s[1]) * 0.72, s[2] + (t[2] - s[2]) * 0.72];
        const p2 = mid(p, peak), q2 = mid(q, peak);
        M.quad(p, q, q2, p2, j % 2 ? rock : rock.clone().multiplyScalar(0.9));
        M.tri(p2, q2, peak, h > 260 ? snow : rock.clone().multiplyScalar(1.08));
      });
    }
    group.add(M.mesh({ flatShading: true }));
  }

  return { group, roof, facade, height: H + (kind === 'pyramid' || kind === 'star' ? (E.rise ?? 14) : kind === 'barrel' ? (E.rise ?? 10) : 0), footprint: fp };
}

function pick3(rand, list) { return list[Math.floor(rand() * list.length)]; }
