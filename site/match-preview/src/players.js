// Giocatori stilizzati e materiali condivisi.
import * as THREE from 'three';
import { TEAMS } from './teams.js?v=184';
import { color, lum, Mesher } from './common.js?v=184';
import { kitColors, jerseyTexture } from './textures.js?v=184';

/* ---------- giocatori ---------- */

export const matCache = new Map(), CACHED = new Set();
export function lambert(c) { if (!matCache.has(c)) { const m = new THREE.MeshLambertMaterial({ color: c }); matCache.set(c, m); CACHED.add(m); } return matCache.get(c); }
export function disposeObject(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { if (CACHED.has(m)) continue; m.map?.dispose(); m.uniforms?.uMap?.value?.dispose(); m.dispose(); }
  });
}

export function makePlayer(team, info, pos, away = false) {
  const T = TEAMS[team], K = kitColors(team, away), goalie = pos === 'G', g = new THREE.Group(), body = new THREE.Group();
  const pants = lum(T.primary) > 0.5 ? (lum(T.accent) < 0.4 ? T.accent : '#16181c') : T.primary;
  const helmet = goalie ? T.secondary === '#ffffff' ? T.primary : T.secondary : T.primary;
  const box = (sx, sy, sz, x, y, z, mat, parent = body) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const jersey = lambert(K.shirt), num = new THREE.MeshLambertMaterial({ map: jerseyTexture(team, info.number, goalie, away) });
  const black = lambert('#15171a'), skin = lambert('#e2b08a'), white = lambert('#f4f4f2'), sec = lambert(T.secondary), steel = lambert('#c9ced4');
  const w = goalie ? 1.35 : 1;
  for (const z of [-0.13 * w, 0.13 * w]) {
    box(0.32, 0.08, 0.1, 0.04, 0.07, z, black); box(0.34, 0.025, 0.02, 0.04, 0.015, z, steel);
    if (goalie) box(0.22, 0.72, 0.28, 0.06, 0.48, z * 1.15, white).add(new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.12, 0.285), lambert(K.stripe)));
    else box(0.16, 0.44, 0.17, 0.02, 0.33, z, jersey);
  }
  box(0.38 * w, 0.36, 0.48 * w, 0, 0.74, 0, lambert(pants));
  const torso = box(0.34 * w, 0.62, 0.56 * w, 0, 1.22, 0, [num, num, jersey, jersey, jersey, jersey]);
  box(0.4 * w, 0.17, 0.68 * w, 0, 1.5, 0, jersey);
  for (const z of [-1, 1]) {
    const arm = box(0.15, 0.44, 0.15, 0.1, 1.3, z * 0.37 * w, jersey); arm.rotation.z = -0.55;
    box(0.16, 0.14, 0.16, 0.3, 1.1, z * 0.33 * w, goalie && z > 0 ? white : lambert(pants));
  }
  box(0.1, 0.08, 0.1, 0, 1.62, 0, skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), skin); head.position.set(0.01, 1.74, 0); body.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), lambert(helmet)); hm.position.set(0, 1.76, 0); hm.castShadow = true; body.add(hm);
  box(0.03, goalie ? 0.2 : 0.07, 0.24, 0.14, goalie ? 1.72 : 1.78, 0, goalie ? lambert('#dfe3e8') : lambert('#9fb4c8'));
  // Bastone: dal guanto al ghiaccio, davanti al giocatore.
  const stick = new Mesher(), dark = color('#1b1d21'), tape = color('#f2f2f2');
  const hand = [0.3, 1.1, 0.3 * w], blade = [goalie ? 0.75 : 1.05, 0.05, goalie ? 0.05 : 0.18];
  stick.beam(hand, blade, goalie ? 0.05 : 0.035, dark);
  stick.box(blade[0] + 0.12, 0.04, blade[2], 0.3, goalie ? 0.12 : 0.07, 0.03, tape);
  const sm = stick.mesh(); sm.castShadow = true; body.add(sm);
  body.rotation.z = goalie ? -0.22 : -0.16; body.position.x = goalie ? -0.05 : 0;
  if (goalie) { body.scale.set(1, 0.86, 1); body.position.y = 0; }
  g.add(body);
  g.userData = { body, torso, info, pos, team };
  g.traverse(o => { o.userData.player = g; });
  return g;
}
