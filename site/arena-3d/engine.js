// Vista "Arena 3D": costruisce un'arena dalla configurazione (arenas.js) e la mette in scena in quattro regie.
//   intro     vista aerea dell'esterno con informazioni su arena e squadra, poi ingresso dal tetto
//   lineup    formazioni: telecamera fissa, niente cubo, una linea alla volta
//   tour      giro automatico dentro l'arena, le linee cambiano da sole (le tabelle le mostra la pagina)
//   explore   telecamera libera, con vista in sezione dall'alto
// Sistema di riferimento e lati: vedi layout.js. La squadra di casa difende la porta a ovest.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TEAMS } from './teams.js?v=23';
import { ARENAS } from './arenas.js?v=23';
import { POSITIONS, placeholderLineup } from './lineups.js?v=23';
import { RINK, seeded, pick, weighted, ease, color, lum, logoOf, canvas, texture, drawLogo, fitText, Mesher, stripGeometry, roundedRect, readable, _p, _s } from './common.js?v=23';
import { iceTexture, boardsTexture, ledTexture, suitesTexture, bannerTexture, hangingBannerTexture, flagAtlas, flagMaterial, bounceMaterial } from './textures.js?v=23';
import { lambert, disposeObject, makePlayer } from './players.js?v=23';
import { buildLayout, sectionLine, sectionPoint, samplePolyline, zoneAt, heightAt, sectionByKey } from './layout.js?v=23';
import { buildExterior } from './exterior.js?v=23';

export { RINK };
const NEUTRALS = ['#2b2f36', '#3c4048', '#56606b', '#e6e6e6', '#1d2a44', '#5b4636', '#8a8f99', '#1a1a1a', '#6f7f8f', '#a33a3a', '#3f5f3f'];
const SKIN = ['#f1c9a5', '#e0ac83', '#c68863', '#8d5a3b', '#f5d6bc', '#d9a07a'];

// Posizioni per la squadra di casa; gli ospiti sono speculari (x → -x, z → -z).
export const GAME_SLOTS = { LW: [-4.6, -7.4], C: [-3.2, 0], RW: [-4.6, 7.4], LD: [-12.5, -4.6], RD: [-12.5, 4.6], G: [-24.7, 0] };
export const LINEUP_SLOTS = { LW: [-8.6, -6.4], C: [-6.4, 0], RW: [-8.6, 6.4], LD: [-16.2, -4.2], RD: [-16.2, 4.2], G: [-23.4, 0] };
const BENCH = { home: [-7.5, 16.6], away: [7.5, 16.6] };
const SKY = '#bfd5e6';

export class ArenaView {
  constructor(canvasEl, overlayEl, { quality = 'high' } = {}) {
    this.canvas = canvasEl; this.overlay = overlayEl; this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.3, 4000);
    this.controls = new OrbitControls(this.camera, canvasEl);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.49, minDistance: 6, maxDistance: 220, autoRotateSpeed: 0.35, enabled: false });
    this.target = new THREE.Vector3();
    this.time = { value: 0 };
    this.clock = new THREE.Clock();
    this.state = { arena: null, away: null, line: 1, labels: true };
    this.mode = 'lineup';
    this.arrangement = 'lineup';
    this.lineups = {};
    this.players = { home: [], away: [] };
    this.leaving = [];
    this.leds = [];
    this.labels = new Map();
    this.listeners = {};
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selected = null;
    this.tween = null;
    this.tour = { angle: Math.PI / 2, nextLine: 0, paused: false, lineEvery: 9000 };
    this.intro = { start: 0 };
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvasEl);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  on(event, fn) { (this.listeners[event] ||= []).push(fn); }
  emit(event, data) { (this.listeners[event] || []).forEach(fn => fn(data)); }

  resize() {
    const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false); this.camera.aspect = r.width / r.height;
    if (this.mode === 'lineup' && this.A) this.applyLineupFov(); else this.camera.updateProjectionMatrix();
  }

  /* ---------------- API pubblica ---------------- */

  async load({ arena, away, line = 1, lineups = {}, mode } = {}) {
    const A = ARENAS[arena]; if (!A) throw new Error(`Arena sconosciuta: ${arena}`);
    if (!away || away === A.team) away = Object.keys(TEAMS).find(t => t !== A.team);
    this.state = { ...this.state, arena, away, line };
    Object.assign(this.lineups, lineups);
    const [homeLogo, awayLogo] = await Promise.all([logoOf(A.team), logoOf(away)]);
    this.clearAll();
    this.A = A; this.logos = { [A.team]: homeLogo, [away]: awayLogo };
    this.layout = buildLayout(A);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.awayLayer = new THREE.Group(); this.scene.add(this.awayLayer);
    this.buildLights(); this.buildRink(); this.buildStands(); this.buildRoof(); this.buildDecor(); this.buildOutside();
    this.buildAwayLayer();
    this.spawnAll();
    this.setMode(mode || this.mode, { instant: true });
    this.emit('change', this.info());
  }

  async setAway(away) {
    if (!this.A || away === this.A.team || away === this.state.away) return;
    this.state.away = away; this.logos[away] = await logoOf(away);
    this.disposeGroup(this.awayLayer); this.awayLayer = new THREE.Group(); this.scene.add(this.awayLayer);
    this.buildAwayLayer();
    this.disposeSide('away'); this.spawnSide('away', ['G', ...POSITIONS], true);
    this.drawCube(); this.emit('change', this.info());
  }

  setLine(n, { auto = false } = {}) {
    if (n === this.state.line) return;
    this.state.line = n;
    for (const side of ['home', 'away']) { this.benchSkaters(side); this.spawnSide(side, POSITIONS, false); }
    this.drawCube(); this.emit('change', this.info()); this.emit('line', { line: n, auto });
  }

  setLineups(lineups) { Object.assign(this.lineups, lineups); this.spawnAll(); this.emit('change', this.info()); }
  setLabels(on) { this.state.labels = on; this.overlay.classList.toggle('off', !on); }
  setAutoRotate(on) { this.controls.autoRotate = on; }
  setTourPaused(p) { this.tour.paused = p; }

  info() {
    const A = this.A, line = this.state.line;
    const side = s => { const team = s === 'home' ? A.team : this.state.away, L = this.lineupFor(team); return { team, goalie: L.goalies[0], line: L.lines[line - 1], placeholder: !!L.placeholder }; };
    return { arena: A, arenaId: this.state.arena, away: this.state.away, line, mode: this.mode, home: side('home'), guest: side('away') };
  }

  lineupFor(team) { return this.lineups[team] || (this.lineups[team] = placeholderLineup(team)); }

  /* ---------------- regie ---------------- */

  setMode(mode, { instant = false } = {}) {
    const prev = this.mode; this.mode = mode;
    if (mode !== 'intro') this.intro.entering = false;
    this.controls.enabled = mode === 'explore';
    this.controls.autoRotate = mode === 'explore' && this.controls.autoRotate;
    this.overlay.dataset.mode = mode;
    if (this.cube) this.cube.visible = mode !== 'lineup';
    if (this.outside) this.outside.visible = mode === 'intro';
    this.scene.background = mode === 'intro' ? color(SKY) : color(this.A.style.wall).multiplyScalar(0.55);
    this.scene.fog = mode === 'intro' ? new THREE.Fog(SKY, 700, 2600) : null;
    this.arrange(mode === 'lineup' ? 'lineup' : 'game', instant || prev === 'intro');
    this.camera.fov = 48; this.camera.clearViewOffset();
    if (mode === 'lineup') { const c = this.lineupCamera(); this.flyTo(c.pos, c.target, instant ? 0 : 1300, () => this.applyLineupFov()); if (instant) this.applyLineupFov(); }
    else if (mode === 'tour') { this.tour.nextLine = performance.now() + this.tour.lineEvery; if (!instant && prev !== 'intro') { const p = this.tourPose(this.tour.angle); this.flyTo(p.pos, p.target, 1300); } }
    else if (mode === 'intro') { this.intro.start = performance.now(); this.intro.entering = false; this.tween = null; }
    else if (mode === 'explore') { const v = this.views().tribuna; this.flyTo(v.pos, v.target, instant ? 0 : 1100); }
    this.camera.updateProjectionMatrix();
    this.emit('mode', mode);
  }

  // Dall'intro: volo sopra il tetto e discesa dentro l'arena, poi parte il tour.
  enterArena() {
    if (this.mode !== 'intro' || this.intro.entering) return;
    this.intro.entering = true;
    const top = this.outsideTop ?? this.roofY;
    const p = this.tourPose(this.tour.angle = Math.PI / 2);
    this.flyPath([this.camera.position.clone(), new THREE.Vector3(0, top + 45, 30), new THREE.Vector3(0, top + 6, 8), p.pos], [this.target.clone(), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), p.target], 4200, () => this.setMode('tour'));
  }

  views() {
    const { zs, profiles } = this.layout, Y = this.roofY;
    const eye = (P, f) => Math.min(Y - 2.5, heightAt(P, P.depth * f) + 2.4);
    return {
      tribuna: { pos: [12, eye(profiles.south, 0.85) + 2.5, zs + profiles.south.depth * 0.85], target: [-6, 0.5, 0] },
      alto: { pos: [0.01, Math.max(92, this.extent.EX * 1.4), 22], target: [0, 0, 0] },
      diorama: { pos: [this.extent.EX * 1.1, this.extent.EX * 0.85, this.extent.EZ * 1.9], target: [0, 2, 0] },
    };
  }

  lineupCamera() {
    const P = this.layout.profiles.south, d = Math.min(9, P.depth * 0.5), y = Math.max(11, heightAt(P, d) + 6.5), z = this.layout.zs + d;
    return { pos: new THREE.Vector3(0, Math.min(y, this.roofY - 2), z), target: new THREE.Vector3(0, 0.2, -2) };
  }

  // Campo visivo per contenere tutta la pista; lineupOffset (0–0.3) alza la scena se la pagina copre la parte bassa.
  applyLineupFov() {
    const base = this.lineupCamera(), half = this.camera.aspect < 1 ? 18 : 27, off = this.lineupOffset || 0, maxV = THREE.MathUtils.degToRad(70);
    // Schermi stretti: se servirebbe un campo visivo troppo largo, la telecamera arretra lungo la sua linea di vista,
    // ma resta dentro l'arena (davanti alla parete di fondo e sotto il tetto).
    const dir = base.pos.clone().sub(base.target), d0 = dir.length(), maxH = 2 * Math.atan(Math.tan(maxV / 2) * this.camera.aspect);
    const u = dir.clone().normalize(), limZ = (this.extent.EZs - 2 - base.target.z) / Math.max(u.z, 1e-3), limY = (this.roofY - 2.5 - base.target.y) / Math.max(u.y, 1e-3);
    const dist = Math.min(Math.max(d0, half / Math.tan(maxH / 2)), limZ, limY);
    const pos = base.target.clone().add(dir.normalize().multiplyScalar(dist)); pos.y = Math.min(pos.y, this.roofY - 2);
    if (!this.tween && this.mode === 'lineup') { this.camera.position.copy(pos); this.camera.lookAt(base.target); }
    const h = 2 * Math.atan(half / dist), v = 2 * Math.atan(Math.tan(h / 2) / this.camera.aspect);
    this.camera.fov = Math.min(76, Math.max(34, THREE.MathUtils.radToDeg(v) * (1 + off * 1.2)));
    const r = this.canvas.getBoundingClientRect();
    if (off && r.width) this.camera.setViewOffset(r.width, r.height, 0, r.height * off, r.width, r.height); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  tourPose(a) {
    const rx = RINK.halfL + this.A.gaps.end + 1.6, rz = RINK.halfW + Math.min(this.A.gaps.side, this.A.gaps.bench) + 1.8;
    const y = Math.min(this.roofY - 3, 9.6 + 1.3 * Math.sin(a * 2));
    return { pos: new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz), target: new THREE.Vector3(-Math.cos(a) * 9, 1.4, -Math.sin(a) * 4.5) };
  }

  flyTo(pos, target, ms, done) {
    const P = pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(...pos), T = target instanceof THREE.Vector3 ? target : new THREE.Vector3(...target);
    if (!ms) { this.camera.position.copy(P); this.target.copy(T); this.controls.target.copy(T); this.camera.lookAt(T); this.tween = null; done?.(); return; }
    this.flyPath([this.camera.position.clone(), P], [this.target.clone(), T], ms, done);
  }

  flyPath(points, targets, ms, done) { this.tween = { points, targets, start: performance.now(), ms, done }; }

  select(player, silent = false) {
    if (!player && !this.selected && silent) return;
    this.selected = player || null;
    if (!this.selRing) { this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), new THREE.MeshBasicMaterial({ color: '#d2f277', transparent: true, opacity: 0.95, depthWrite: false })); this.selRing.rotation.x = -Math.PI / 2; this.selRing.position.y = 0.02; this.scene.add(this.selRing); }
    this.selRing.visible = !!player;
    for (const [p, el] of this.labels) el.classList.toggle('sel', p === player);
    if (!silent) this.emit('select', player ? { ...player.userData.info, pos: player.userData.pos, team: player.userData.team } : null);
  }

  /* ---------------- costruzione: interno ---------------- */

  buildLights() {
    const L = this.A.light || {}, tint = color(L.tint || '#ffffff');
    const hemi = new THREE.HemisphereLight(tint, color('#3a3c42'), 1.5 * (L.ambient ?? 1)); this.root.add(hemi);
    const key = new THREE.DirectionalLight(tint, 1.7 * (L.key ?? 1)); key.position.set(-8, 40, 14);
    key.castShadow = true; key.shadow.mapSize.set(2048, 1024);
    Object.assign(key.shadow.camera, { left: -34, right: 34, top: 18, bottom: -18, near: 10, far: 80 }); key.shadow.bias = -0.0005;
    this.root.add(key);
    const fill = new THREE.DirectionalLight(tint, 0.5 * (L.key ?? 1)); fill.position.set(12, 30, -20); this.root.add(fill);
  }

  buildRink() {
    const A = this.A, { halfL, halfW, corner } = RINK;
    const shape = new THREE.Shape(), r = corner;
    shape.moveTo(-halfL + r, -halfW); shape.lineTo(halfL - r, -halfW); shape.absarc(halfL - r, -halfW + r, r, -Math.PI / 2, 0);
    shape.lineTo(halfL, halfW - r); shape.absarc(halfL - r, halfW - r, r, 0, Math.PI / 2); shape.lineTo(-halfL + r, halfW);
    shape.absarc(-halfL + r, halfW - r, r, Math.PI / 2, Math.PI); shape.lineTo(-halfL, -halfW + r); shape.absarc(-halfL + r, -halfW + r, r, Math.PI, Math.PI * 1.5);
    const geo = new THREE.ShapeGeometry(shape, 16), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + halfL) / (2 * halfL), (pos.getY(i) + halfW) / (2 * halfW));
    geo.rotateX(-Math.PI / 2);
    const ice = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: iceTexture(this.logos[A.team]), shininess: 90, specular: color('#3a4450') }));
    ice.receiveShadow = true; ice.position.y = 0.005; this.root.add(ice);

    const inner = readable(roundedRect(halfL, halfW, corner)), outer = readable(roundedRect(halfL + 0.2, halfW + 0.2, corner + 0.2));
    this.root.add(new THREE.Mesh(stripGeometry(inner, 0, 1.07, { closed: true, uScale: 30 }), new THREE.MeshLambertMaterial({ map: boardsTexture(A.team), side: THREE.DoubleSide })));
    const M = new Mesher(), white = color('#f1f2f0'), yellow = color('#efc230');
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length], c = outer[(i + 1) % outer.length], d = outer[i];
      M.quad([a[0], 1.07, a[1]], [b[0], 1.07, b[1]], [c[0], 1.07, c[1]], [d[0], 1.07, d[1]], yellow);
      M.quad([d[0], 0, d[1]], [c[0], 0, c[1]], [c[0], 1.07, c[1]], [d[0], 1.07, d[1]], white);
    }
    this.root.add(M.mesh());
    const glassH = p => Math.abs(p[0]) > 22 ? 2.6 : 1.95;
    this.root.add(new THREE.Mesh(stripGeometry(inner, 1.07, glassH, { closed: true }), new THREE.MeshPhongMaterial({ color: '#d8eef8', transparent: true, opacity: 0.13, shininess: 120, side: THREE.DoubleSide, depthWrite: false })));
    this.root.add(new THREE.Mesh(stripGeometry(inner, p => glassH(p) - 0.04, glassH, { closed: true }), new THREE.MeshBasicMaterial({ color: '#9aa4ad', side: THREE.DoubleSide })));
    for (const sgn of [-1, 1]) this.root.add(this.makeGoal(sgn));
  }

  makeGoal(sign) {
    const g = new THREE.Group(), red = lambert('#d22d3c');
    const post = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), red); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
    post(0.07, 1.22, 0.07, 0, 0.61, -0.915); post(0.07, 1.22, 0.07, 0, 0.61, 0.915); post(0.07, 0.07, 1.9, 0, 1.22, 0);
    const net = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const pts = (a, b, c, d) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, net)); };
    const D = 1.05, hw = 0.915;
    pts([0, 1.22, -hw], [0, 1.22, hw], [D, 0.45, hw], [D, 0.45, -hw]); pts([D, 0, -hw], [D, 0, hw], [D, 0.45, hw], [D, 0.45, -hw]);
    pts([0, 0, -hw], [D, 0, -hw], [D, 0.45, -hw], [0, 1.22, -hw]); pts([0, 0, hw], [D, 0, hw], [D, 0.45, hw], [0, 1.22, hw]);
    g.position.x = sign * RINK.goalX; g.rotation.y = sign > 0 ? 0 : Math.PI; return g;
  }

  // Tribune: gradini con sedili e schienali, scale tra i settori, barriere nelle curve, pavimenti dei corridoi.
  buildStands() {
    const A = this.A, st = A.style, { sections } = this.layout, rand = seeded(A.team + 'stands');
    const conc = color(st.concrete), riser = color(st.riser), seats = st.seats.map(color), terrace = color(st.concrete).multiplyScalar(1.12), floorC = color(st.floor).lerp(conc, 0.4);
    const rails = color('#c7ccd2'), fasciaC = color(TEAMS[A.team].primary).lerp(color('#111'), 0.35), aisle = conc.clone().lerp(color('#ffffff'), 0.18);
    const M = new Mesher(), lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    let roofBase = 0;
    sections.forEach((S, si) => {
      const P = S.profile;
      roofBase = Math.max(roofBase, P.top);
      P.rows.forEach((R, ri) => {
        const inner = sectionLine(S, R.d), outer = sectionLine(S, R.d + R.depth);
        for (let i = 0; i < inner.length - 1; i++) {
          let seat;
          if (R.standing) seat = ri % 2 ? terrace : terrace.clone().multiplyScalar(0.96);
          else if (st.seatPattern === 'rows') seat = seats[ri % seats.length];
          else if (st.seatPattern === 'blocks') seat = seats[(Math.floor(i / (S.kind === 'arc' ? 4 : 1)) + si) % seats.length];
          else if (st.seatPattern === 'random') seat = pick(rand, seats);
          else seat = seats[0];
          const a = inner[i], b = inner[i + 1], c = outer[i + 1], d = outer[i];
          const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]), hasAisle = S.kind === 'straight' ? segLen > 3 : i % 3 === 2 && segLen > 1.5;
          const u = hasAisle ? 1 - Math.min(0.45, 1.1 / Math.max(segLen, 0.1)) : 1;
          const a2 = lerp2(a, b, u), d2 = lerp2(d, c, u);
          M.quad([a[0], R.h, a[1]], [a2[0], R.h, a2[1]], [d2[0], R.h, d2[1]], [d[0], R.h, d[1]], seat);
          if (hasAisle) M.quad([a2[0], R.h, a2[1]], [b[0], R.h, b[1]], [c[0], R.h, c[1]], [d2[0], R.h, d2[1]], aisle);
          // Schienali: una fascia verticale verso il fondo del gradino.
          if (!R.standing && R.depth > 0.6) {
            const ba = lerp2(a, d, 0.78), bb = lerp2(a2, d2, 0.78);
            M.quad([ba[0], R.h, ba[1]], [bb[0], R.h, bb[1]], [bb[0], R.h + 0.42, bb[1]], [ba[0], R.h + 0.42, ba[1]], seat.clone().multiplyScalar(0.78));
          }
          const front = R.first && R.tier > 0 ? fasciaC : riser;
          M.quad([a[0], R.below, a[1]], [b[0], R.below, b[1]], [b[0], R.h, b[1]], [a[0], R.h, a[1]], ri === 0 ? conc : front);
        }
        if (S.kind === 'straight') for (const k of [0, inner.length - 1]) M.quad([inner[k][0], 0, inner[k][1]], [outer[k][0], 0, outer[k][1]], [outer[k][0], R.h, outer[k][1]], [inner[k][0], R.h, inner[k][1]], conc);
        if (R.standing && ri % 4 === 3) { const l = sectionLine(S, R.d + 0.08); for (let i = 0; i < l.length - 1; i++) M.beam([l[i][0], R.h + 1.0, l[i][1]], [l[i + 1][0], R.h + 1.0, l[i + 1][1]], 0.05, rails); }
      });
      for (const f of P.floors) { const a = sectionLine(S, f.d0), b = sectionLine(S, f.d1); for (let i = 0; i < a.length - 1; i++) M.quad([a[i][0], f.h, a[i][1]], [a[i + 1][0], f.h, a[i + 1][1]], [b[i + 1][0], f.h, b[i + 1][1]], [b[i][0], f.h, b[i][1]], floorC); }
      // Parapetto sul fronte degli anelli superiori.
      for (const b of P.bands) { const l = sectionLine(S, b.d + 0.05); for (let i = 0; i < l.length - 1; i++) M.beam([l[i][0], b.y1 + 1, l[i][1]], [l[i + 1][0], b.y1 + 1, l[i + 1][1]], 0.06, rails); }
    });
    this.roofY = roofBase + A.roof.clear;
    // Ingombro esterno dalle linee di fondo di tutte le sezioni.
    let EX = this.layout.ex + 2, EZn = this.layout.zn + 2, EZs = this.layout.zs + 2;
    for (const S of sections) for (const [x, z] of sectionLine(S, S.profile.depth)) { EX = Math.max(EX, Math.abs(x) + 0.4); if (z < 0) EZn = Math.max(EZn, -z + 0.4); else EZs = Math.max(EZs, z + 0.4); }
    this.extent = { EX, EZn, EZs, EZ: Math.max(EZn, EZs) };
    const wallC = color(st.wall), W = new Mesher(), Y = this.roofY, wc = wallC.clone().multiplyScalar(0.9);
    sections.forEach(S => { const P = S.profile, l = sectionLine(S, P.depth); for (let i = 0; i < l.length - 1; i++) W.wall(l[i], l[i + 1], P.top, Y, wallC); });
    W.wall([-EX, -EZn], [EX, -EZn], 0, Y, wc); W.wall([-EX, EZs], [EX, EZs], 0, Y, wc); W.wall([-EX, -EZn], [-EX, EZs], 0, Y, wc); W.wall([EX, -EZn], [EX, EZs], 0, Y, wc);
    this.root.add(W.mesh({ side: THREE.FrontSide }));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * EX, EZn + EZs), new THREE.MeshLambertMaterial({ color: st.floor }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.02, (EZs - EZn) / 2); this.root.add(floor);
    // Panchine e box dei puniti.
    const k = color(TEAMS[A.team].primary);
    M.box(-7.5, 0.22, RINK.halfW + 1.4, 9, 0.44, 2.4, color('#30333a')); M.box(-7.5, 0.75, RINK.halfW + 2.5, 9, 1.5, 0.2, k); M.box(-7.5, 0.48, RINK.halfW + 2.05, 9, 0.1, 0.5, k.clone().multiplyScalar(0.7));
    M.box(7.5, 0.22, RINK.halfW + 1.4, 9, 0.44, 2.4, color('#30333a'));
    this.benchAwayRange = [3, 12];
    M.box(-2.6, 0.6, -RINK.halfW - 1.3, 3.6, 1.2, 1.8, color('#2b2e35')); M.box(2.6, 0.6, -RINK.halfW - 1.3, 3.6, 1.2, 1.8, color('#2b2e35')); M.box(0, 0.7, -RINK.halfW - 1.2, 1.4, 1.4, 1.6, color('#41454d'));
    this.root.add(M.mesh());
  }

  buildRoof() {
    const A = this.A, R = A.roof, { EX, EZn, EZs } = this.extent, Y = this.roofY, M = new Mesher(), roofC = color(R.color);
    const steel = roofC.clone().lerp(color(lum(R.color) > 0.5 ? '#8e959e' : '#5b616a'), 0.5), lights = new Mesher(), lightC = color('#ffffff');
    const zc = (EZs - EZn) / 2, EZ = (EZn + EZs) / 2;
    let lightY = Y - 0.6, gableMesh = null;
    const arch = R.type === 'wood-arch' || R.type === 'wood-gothic';
    this.archRise = 0;
    if (!arch) M.quad([-EX, Y, -EZn], [EX, Y, -EZn], [EX, Y, EZs], [-EX, Y, EZs], roofC);
    if (R.type === 'truss') {
      const depth = Math.min(2.4, R.clear - 1.4); lightY = Y - depth;
      for (let x = -EX + 3; x <= EX - 2; x += 8.5) {
        M.beam([x, Y - 0.15, -EZn], [x, Y - 0.15, EZs], 0.22, steel); M.beam([x, Y - depth, -EZn + 1], [x, Y - depth, EZs - 1], 0.22, steel);
        let up = true;
        for (let z = -EZn + 1; z < EZs - 1; z += 2.5) { const z2 = Math.min(EZs - 1, z + 2.5); M.beam([x, up ? Y - depth : Y - 0.15, z], [x, up ? Y - 0.15 : Y - depth, z2], 0.1, steel); M.beam([x, Y - depth, z], [x, Y - 0.15, z], 0.08, steel); up = !up; }
      }
      for (const z of [-EZn + 4, zc, EZs - 4]) M.beam([-EX, Y - 0.25, z], [EX, Y - 0.25, z], 0.14, steel);
    } else if (R.type === 'flat') {
      lightY = Y - 1.6;
      for (let x = -EX + 4; x < EX; x += 6) M.beam([x, Y - 0.5, -EZn], [x, Y - 0.5, EZs], 0.5, roofC.clone().multiplyScalar(0.8), 0.9);
      for (const z of [-11, -4, 4, 11]) M.beam([-34, Y - 1.4, z], [34, Y - 1.4, z], 0.7, color('#2a2d33'), 0.25);
    } else if (R.type === 'botta') {
      lightY = Y - 1.2;
      for (const s of [-1, 1]) for (let c = -EX - EZ; c <= EX + EZ; c += 7) {
        const x0 = Math.max(-EX, s > 0 ? -EZn - c : c - EZs), x1 = Math.min(EX, s > 0 ? EZs - c : c + EZn);
        if (x1 - x0 < 1) continue;
        const zf = x => s > 0 ? x + c : c - x;
        M.beam([x0, Y - 0.5, zf(x0)], [x1, Y - 0.5, zf(x1)], 0.35, steel, 0.8);
      }
      M.beam([-EX, Y - 0.8, -EZn + 0.5], [EX, Y - 0.8, -EZn + 0.5], 0.8, steel, 1.4); M.beam([-EX, Y - 0.8, EZs - 0.5], [EX, Y - 0.8, EZs - 0.5], 0.8, steel, 1.4);
    } else if (arch) {
      const rise = R.type === 'wood-gothic' ? EZ * 0.62 : EZ * 0.3;
      const f = R.type === 'wood-gothic' ? u => Math.sqrt(Math.max(0, 1 - Math.abs(u))) : u => Math.sqrt(Math.max(0, 1 - u * u));
      const N = 28, prof = Array.from({ length: N + 1 }, (_, i) => { const z = -EZn + (EZn + EZs) * i / N; return [z, Y + rise * f((z - zc) / EZ)]; });
      const plank = [roofC.clone().multiplyScalar(1.05), roofC.clone().multiplyScalar(0.93)];
      for (let i = 0; i < N; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; M.quad([-EX, y0, z0], [EX, y0, z0], [EX, y1, z1], [-EX, y1, z1], plank[i % 2]); }
      const glulam = roofC.clone().lerp(color('#d29a5c'), 0.45);
      for (let x = -EX + 2.5; x <= EX - 2; x += 6) for (let i = 0; i < N; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; M.beam([x, y0 - 0.6, z0], [x, y1 - 0.6, z1], 0.5, glulam, 1.1); }
      for (let i = 0; i <= N; i += 4) M.beam([-EX, prof[i][1] - 1.1, prof[i][0]], [EX, prof[i][1] - 1.1, prof[i][0]], 0.25, glulam, 0.35);
      const glass = !!A.extras?.glassGables, gable = glass ? new Mesher() : M, gc = glass ? color('#9ec4dd') : color(A.style.wall);
      for (const x of [-EX, EX]) for (let i = 0; i < N; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; gable.quad([x, Y, z0], [x, Y, z1], [x, y1, z1], [x, y0, z0], gc); }
      if (glass) {
        gableMesh = gable.mesh({ transparent: true, opacity: 0.55, emissive: color('#6a8fb0'), emissiveIntensity: 0.6 });
        for (const x of [-EX + 0.05, EX - 0.05]) { for (let z = -EZn; z <= EZs; z += 2.2) M.beam([x, Y, z], [x, Y + rise * f((z - zc) / EZ), z], 0.12, glulam); for (let k = 1; k < 4; k++) M.beam([x, Y + rise * k / 4, -EZn], [x, Y + rise * k / 4, EZs], 0.1, glulam); }
      }
      lightY = Y + rise * 0.55 - 1;
      this.archRise = rise;
    }
    const cw = (A.cube?.w ?? 0) / 2 + 1;
    for (let x = -27; x <= 27; x += 6) for (const z of [-10, -4, 4, 10]) if (Math.abs(x) > cw || Math.abs(z) > cw) lights.box(x, lightY, z, 1.3, 0.16, 0.55, lightC);
    this.ceiling = new THREE.Group(); this.root.add(this.ceiling);
    this.ceiling.add(M.mesh()); if (gableMesh) this.ceiling.add(gableMesh);
    const lm = lights.mesh(); lm.material = new THREE.MeshBasicMaterial({ color: '#fffdf3' }); this.ceiling.add(lm);
    this.lightY = lightY;
  }

  buildDecor() {
    const A = this.A, { sections } = this.layout, home = A.team;
    const led = ledTexture(home, A.name), ledMat = new THREE.MeshBasicMaterial({ map: led, side: THREE.DoubleSide });
    this.leds.push({ tex: led, speed: 0.035 });
    const suitesMat = new THREE.MeshBasicMaterial({ map: suitesTexture(), side: THREE.DoubleSide });
    const teamMat = new THREE.MeshLambertMaterial({ color: TEAMS[home].primary, side: THREE.DoubleSide });
    for (const S of sections) {
      const P = S.profile;
      for (const b of P.bands) {
        const l = readable(sectionLine(S, b.d - 0.06));
        if (b.kind === 'led') this.root.add(new THREE.Mesh(stripGeometry(l, Math.max(b.y0 + 0.15, b.y1 - 1.05), b.y1 - 0.12, { uScale: 22 }), ledMat));
        else if (b.kind === 'suites') this.root.add(new THREE.Mesh(stripGeometry(l, b.y0 + 0.45, b.y1 - 0.4, { uScale: 6 }), suitesMat));
        else if (b.kind === 'team') this.root.add(new THREE.Mesh(stripGeometry(l, b.y0 + 0.3, b.y1 - 0.3, { uScale: 10 }), teamMat));
      }
      if (A.led.rim) this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, P.depth - 0.06)), P.top + 0.25, P.top + 1.15, { uScale: 22 }), ledMat));
    }
    // Striscione della curva di casa sul muretto davanti alla prima fila.
    const H = A.home, curve = sectionByKey(this.layout, H.side), from = H.from ?? 0, to = H.to ?? 1;
    if ((H.tier ?? 0) === 0) {
      const l = readable(sectionLine(curve, -0.06, from + 0.03, to - 0.03)), len = Math.hypot(l.at(-1)[0] - l[0][0], l.at(-1)[1] - l[0][1]);
      this.root.add(new THREE.Mesh(stripGeometry(l, 0.35, Math.max(1.2, curve.profile.base - 0.1), { uScale: len }), new THREE.MeshLambertMaterial({ map: bannerTexture(home, TEAMS[home].curve, TEAMS[home].chant), side: THREE.DoubleSide })));
    }
    // Stendardi appesi al tetto sopra la curva di casa.
    const top = this.archRise ? this.roofY + this.archRise * 0.25 : this.lightY;
    const mid = (from + to) / 2, spread = curve.key === 'north' || curve.key === 'south' ? 0.12 : 0.22, hb = new THREE.PlaneGeometry(2.6, 4.5);
    ['Hockey club', 'National League', 'Casa nostra'].forEach((t, i) => {
      const p = sectionPoint(curve, mid + (i - 1) * spread, 1.5);
      const m = new THREE.Mesh(hb, new THREE.MeshLambertMaterial({ map: hangingBannerTexture(home, this.logos[home], t.toUpperCase()), side: THREE.DoubleSide }));
      m.position.set(p.x, top - 0.6 - 2.25, p.z); m.rotation.y = Math.atan2(-p.nx, -p.nz); this.root.add(m);
    });
    // Maxi cubo.
    if (A.cube) {
      const { w, h } = A.cube, topY = this.archRise ? this.roofY + this.archRise * 0.45 : this.roofY;
      const cy = Math.max(10 + h / 2, Math.min(topY - 1.6 - h / 2, 14 + h / 2));
      const g = new THREE.Group(); g.position.y = cy;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lambert('#14161a')));
      const [c, ctx] = canvas(768, Math.round(768 * h / w)); this.cubeCanvas = [c, ctx]; this.cubeTex = texture(c);
      const scr = new THREE.MeshBasicMaterial({ map: this.cubeTex });
      for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), scr); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * (w / 2 + 0.03), 0, Math.cos(a) * (w / 2 + 0.03)); p.rotation.y = a; g.add(p); }
      const ringTex = ledTexture(home, A.name); this.leds.push({ tex: ringTex, speed: -0.05 });
      g.add(new THREE.Mesh(stripGeometry(roundedRect(w / 2 + 0.05, w / 2 + 0.05, 0.01, 1), -h / 2 - 0.9, -h / 2 - 0.05, { closed: true, uScale: w * 2 }), new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide })));
      const cable = new Mesher(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cable.beam([sx * w * 0.4, h / 2, sz * w * 0.4], [sx * w * 0.2, topY - cy, sz * w * 0.2], 0.04, color('#222'));
      g.add(cable.mesh());
      this.cube = g; this.root.add(g);
    }
  }

  buildOutside() {
    const top = this.roofY + (this.archRise || 0);
    const ext = buildExterior(this.A, { ...this.extent, roofY: top, logo: this.logos[this.A.team] });
    this.outside = ext.group; this.outsideRoof = ext.roof; this.outsideTop = ext.height;
    this.outside.visible = false; this.root.add(this.outside);
  }

  drawCube() {
    if (!this.cubeCanvas) return;
    const [c, g] = this.cubeCanvas, W = c.width, H = c.height, home = this.A.team, away = this.state.away, TH = TEAMS[home], TA = TEAMS[away];
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0b0f16'); grad.addColorStop(1, '#151b26'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = TH.primary; g.fillRect(0, 0, W / 2, H * 0.07); g.fillStyle = TA.primary; g.fillRect(W / 2, 0, W / 2, H * 0.07);
    const ls = Math.min(W * 0.3, H * 0.5);
    for (const [img, x] of [[this.logos[home], W * 0.22], [this.logos[away], W * 0.78]]) { g.beginPath(); g.arc(x, H * 0.44, ls * 0.62, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill(); drawLogo(g, img, x, H * 0.44, ls * 0.9); }
    g.fillStyle = '#d2f277'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'VS', W * 0.2, H * 0.16, 900); g.fillText('VS', W / 2, H * 0.44);
    g.fillStyle = '#ffffff'; fitText(g, `${this.state.line}ª LINEA IN PISTA`, W * 0.9, H * 0.1, 800); g.fillText(`${this.state.line}ª LINEA IN PISTA`, W / 2, H * 0.82);
    g.fillStyle = 'rgba(255,255,255,.55)'; fitText(g, this.A.name.toUpperCase(), W * 0.8, H * 0.06, 700); g.fillText(this.A.name.toUpperCase(), W / 2, H * 0.93);
    this.cubeTex.needsUpdate = true;
  }

  /* ---------------- pubblico, bandiere, settore ospiti ---------------- */

  buildAwayLayer() {
    const A = this.A, home = A.team, away = this.state.away, TH = TEAMS[home], TA = TEAMS[away], { sections } = this.layout;
    const rand = seeded(home + away + 'crowd'), fans = [], flags = { home: [], away: [] };
    const density = this.quality === 'high' ? 1 : 0.75;
    const mixes = {
      curve: [[TH.primary, 50], [TH.secondary, 30], [TH.accent, 14], ['#1a1a1a', 6]],
      standing: [[TH.primary, 42], [TH.secondary, 26], [TH.accent, 10], ...NEUTRALS.map(n => [n, 22 / NEUTRALS.length])],
      guest: [[TA.primary, 52], [TA.secondary, 32], [TA.accent, 16]],
      side: [[TH.primary, 30], [TH.secondary, 14], ...NEUTRALS.map(n => [n, 56 / NEUTRALS.length])],
    };
    for (const S of sections) {
      const P = S.profile, segLen = S.kind === 'straight' ? S.len / Math.max(1, Math.round(S.len / 7)) : 0;
      P.rows.forEach((R, ri) => {
        const spacing = (R.standing ? 0.56 : 0.62) / density;
        for (const p of samplePolyline(sectionLine(S, R.d + R.depth * 0.55), spacing, rand, 0.14)) {
          if (segLen && (p.t * S.len) % segLen > segLen - 1.15) continue; // scale tra i settori
          const zone = zoneAt(A, S, p.t, R);
          const occ = zone === 'curve' ? 0.97 : zone === 'guest' ? 0.92 : zone === 'standing' ? 0.93 : A.occupancy ?? 0.88;
          if (rand() > occ) continue;
          const shirt = weighted(rand, mixes[zone]);
          const bounce = zone === 'curve' ? 0.1 + rand() * 0.08 : zone === 'guest' ? 0.08 + rand() * 0.07 : zone === 'standing' ? 0.05 + rand() * 0.05 : 0;
          fans.push({ x: p.x, z: p.z, y: R.h, yaw: Math.atan2(-p.dz, p.dx), standing: R.standing || zone === 'guest', shirt, head: rand() < 0.12 ? (zone === 'guest' ? TA.primary : TH.primary) : pick(rand, SKIN), bounce, phase: rand() * 6.28 });
          const flagChance = zone === 'curve' ? (ri > 0 ? 0.085 : 0) : zone === 'standing' ? 0.025 : zone === 'guest' ? 0.07 : 0;
          if (rand() < flagChance) (zone === 'guest' ? flags.away : flags.home).push({ ...p, y: R.h, big: zone === 'curve' && rand() < 0.07, design: rand(), phase: rand() * 6.28 });
        }
      });
    }
    this.buildFans(fans);
    this.buildFlags(flags.home, home);
    this.buildFlags(flags.away, away);
    // Settore ospiti: striscione e reti di separazione.
    const G = A.guest, S = sectionByKey(this.layout, G.side);
    if (S) {
      const tier = G.tier ?? 0, band = tier > 0 ? S.profile.bands.find(b => b.tier === tier) : null;
      const d = band ? band.d - 0.08 : -0.06, y1 = band ? band.y1 - 0.1 : S.profile.base - 0.1, y0 = band ? Math.max(band.y0 + 0.2, y1 - 1.3) : Math.max(0.35, y1 - 1.5);
      const l = readable(sectionLine(S, d, (G.from ?? 0) + 0.02, (G.to ?? 1) - 0.02)), len = Math.hypot(l.at(-1)[0] - l[0][0], l.at(-1)[1] - l[0][1]);
      this.awayLayer.add(new THREE.Mesh(stripGeometry(l, y0, y1, { uScale: len }), new THREE.MeshLambertMaterial({ map: bannerTexture(away, TA.name, 'Settore ospiti'), side: THREE.DoubleSide })));
      const rows = S.profile.rows.filter(R => R.tier === tier), net = new Mesher(), k = color('#cfd6dd');
      if (rows.length) for (const t of [G.from ?? 0, G.to ?? 1]) {
        if (t <= 0.001 || t >= 0.999) continue;
        const a = sectionPoint(S, t, rows[0].d), b = sectionPoint(S, t, rows.at(-1).d + rows.at(-1).depth);
        net.quad([a.x, rows[0].below, a.z], [b.x, rows.at(-1).h, b.z], [b.x, rows.at(-1).h + 2.4, b.z], [a.x, rows[0].h + 2.4, a.z], k);
      }
      if (!net.empty) this.awayLayer.add(net.mesh({ transparent: true, opacity: 0.28, depthWrite: false }));
    }
    const bm = new Mesher(), kA = color(TA.primary), [x0, x1] = this.benchAwayRange, z1 = RINK.halfW + 2.6;
    bm.box((x0 + x1) / 2, 0.76, z1 - 0.09, x1 - x0, 1.52, 0.22, kA); bm.box((x0 + x1) / 2, 0.49, z1 - 0.55, x1 - x0, 0.11, 0.5, kA.clone().multiplyScalar(0.7));
    this.awayLayer.add(bm.mesh());
    this.drawCube();
  }

  buildFans(fans) {
    const n = fans.length; if (!n) return;
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1), headGeo = new THREE.IcosahedronGeometry(0.13, this.quality === 'high' ? 1 : 0);
    const bodies = new THREE.InstancedMesh(bodyGeo, bounceMaterial(this.time), n), heads = new THREE.InstancedMesh(headGeo, bounceMaterial(this.time), n);
    const bb = new Float32Array(n * 2), hb = new Float32Array(n * 2), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), k = new THREE.Color();
    fans.forEach((f, i) => {
      const bh = f.standing ? 0.78 : 0.56, base = f.y + (f.standing ? 0.55 : 0.42);
      q.setFromAxisAngle(up, f.yaw);
      m.compose(_p.set(f.x, base + bh / 2, f.z), q, _s.set(0.44, bh, 0.28)); bodies.setMatrixAt(i, m); bodies.setColorAt(i, k.set(f.shirt));
      m.compose(_p.set(f.x, base + bh + 0.13, f.z), q, _s.set(1, 1, 1)); heads.setMatrixAt(i, m); heads.setColorAt(i, k.set(f.head));
      bb[i * 2] = f.bounce / bh; bb[i * 2 + 1] = f.phase; hb[i * 2] = f.bounce; hb[i * 2 + 1] = f.phase;
    });
    bodyGeo.setAttribute('aBounce', new THREE.InstancedBufferAttribute(bb, 2)); headGeo.setAttribute('aBounce', new THREE.InstancedBufferAttribute(hb, 2));
    for (const mesh of [bodies, heads]) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; this.awayLayer.add(mesh); }
    this.fanCount = n;
  }

  buildFlags(list, team) {
    if (!list.length) return;
    const atlas = flagAtlas(team, this.logos[team]), count = atlas.userData.count, n = list.length;
    const geo = new THREE.PlaneGeometry(1, 1, 12, 2); geo.translate(0.5, -0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, flagMaterial(atlas, this.time), n);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), lambert('#d9d9d9'), n);
    const design = new Float32Array(n), phase = new Float32Array(n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((f, i) => {
      const w = f.big ? 4.4 : 1.7, h = f.big ? 2.9 : 1.1, pole = f.big ? 5.4 : 2.5, hand = f.y + 1.35, top = hand + pole;
      const yaw = Math.atan2(-f.nx, -f.nz) + (Math.floor(f.phase * 10) % 2 ? 0.5 : -0.5) * (f.big ? 0.3 : 1);
      q.setFromAxisAngle(up, yaw);
      m.compose(_p.set(f.x, top, f.z), q, _s.set(w, h, 1)); mesh.setMatrixAt(i, m);
      m.compose(_p.set(f.x, hand + pole / 2, f.z), q, _s.set(1, pole, 1)); poles.setMatrixAt(i, m);
      design[i] = Math.floor(f.design * count); phase[i] = f.phase;
    });
    geo.setAttribute('aDesign', new THREE.InstancedBufferAttribute(design, 1)); geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.frustumCulled = false; poles.frustumCulled = false;
    this.awayLayer.add(mesh, poles);
  }

  /* ---------------- giocatori ---------------- */

  slotFor(side, pos, kind = this.arrangement) {
    const [x, z] = (kind === 'lineup' ? LINEUP_SLOTS : GAME_SLOTS)[pos];
    return side === 'home' ? [x, z] : [-x, -z];
  }
  facingFor(side, kind = this.arrangement) { return kind === 'lineup' ? -Math.PI / 2 : side === 'home' ? 0 : Math.PI; }

  arrange(kind, instant) {
    this.arrangement = kind;
    for (const side of ['home', 'away']) for (const g of this.players[side]) {
      const [x, z] = this.slotFor(side, g.userData.pos), facing = this.facingFor(side);
      if (instant) { g.position.set(x, 0, z); g.rotation.y = facing; delete g.userData.tween; }
      else g.userData.tween = { from: g.position.clone(), to: new THREE.Vector3(x, 0, z), start: performance.now(), ms: 1200, facing };
    }
  }

  spawnAll() { for (const side of ['home', 'away']) { this.disposeSide(side); this.spawnSide(side, ['G', ...POSITIONS], true); } }

  spawnSide(side, positions, instant) {
    const team = side === 'home' ? this.A.team : this.state.away, L = this.lineupFor(team), line = L.lines[this.state.line - 1] || L.lines[0];
    const facing = this.facingFor(side), bench = BENCH[side];
    positions.map(pos => [pos, pos === 'G' ? L.goalies[0] : line[pos]]).filter(([, info]) => info).forEach(([pos, info], i) => {
      const g = makePlayer(team, info, pos, side === 'away'), [x, z] = this.slotFor(side, pos);
      g.rotation.y = facing; g.position.set(x, 0, z);
      if (!instant) {
        g.position.set(bench[0] + (i - 2) * 0.9, 0, bench[1]);
        g.userData.tween = { from: g.position.clone(), to: new THREE.Vector3(x, 0, z), start: performance.now() + 380 + i * 90, ms: 1500, facing };
      }
      g.userData.phase = Math.random() * 6.28; g.userData.side = side;
      this.scene.add(g); this.addLabel(g); this.players[side].push(g);
    });
  }

  disposeSide(side) { for (const g of this.players[side] || []) this.disposePlayer(g); this.players[side] = []; }

  benchSkaters(side) {
    const bench = BENCH[side], keep = [];
    for (const g of this.players[side]) {
      if (g.userData.pos === 'G') { keep.push(g); continue; }
      if (g === this.selected) this.select(null);
      g.userData.tween = { from: g.position.clone(), to: new THREE.Vector3(bench[0] + (Math.random() - 0.5) * 6, 0, bench[1] - 0.6), start: performance.now(), ms: 1200, leave: true, facing: g.rotation.y };
      this.leaving.push(g);
    }
    this.players[side] = keep;
  }

  disposePlayer(g) {
    if (g === this.selected) this.select(null, true);
    this.scene.remove(g); this.labels.get(g)?.remove(); this.labels.delete(g); disposeObject(g);
  }

  addLabel(g) {
    const { info, team } = g.userData, el = document.createElement('button');
    el.className = 'label'; el.type = 'button';
    el.style.setProperty('--team', TEAMS[team].primary); el.style.setProperty('--ink', lum(TEAMS[team].primary) > 0.6 ? '#111' : '#fff');
    el.innerHTML = `<b>${info.number}</b><span>${String(info.name).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</span>`;
    el.setAttribute('aria-label', `${info.name}, numero ${info.number}`);
    el.onclick = () => this.select(this.selected === g ? null : g);
    this.overlay.append(el); this.labels.set(g, el);
  }

  bindPointer() {
    let down = null;
    this.canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; if (this.mode === 'explore') this.tween = null; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects([...this.players.home, ...this.players.away], true)[0];
      this.select(hit ? hit.object.userData.player : null);
    });
  }

  /* ---------------- ciclo di disegno ---------------- */

  frame() {
    if (!this.A) return;
    const dt = Math.min(0.05, this.clock.getDelta()), now = performance.now();
    this.time.value += dt;
    for (const l of this.leds) l.tex.offset.x += dt * l.speed;
    this.updateCamera(dt, now);
    // Tetto interno nascosto quando la telecamera è sopra o fuori; tetto esterno nascosto mentre si entra.
    const c = this.camera.position, E = this.extent, inside = Math.abs(c.x) < E.EX && c.z > -E.EZn && c.z < E.EZs;
    if (this.ceiling) this.ceiling.visible = inside && c.y < this.roofY + (this.archRise || 0) - 0.3;
    if (this.outsideRoof) this.outsideRoof.visible = !(this.intro.entering && c.y < (this.outsideTop ?? 0) + 4);
    if (this.mode === 'tour' && !this.tour.paused && now > this.tour.nextLine) { this.tour.nextLine = now + this.tour.lineEvery; this.setLine(this.state.line % 4 + 1, { auto: true }); }
    const tick = g => {
      const tw = g.userData.tween, b = g.userData.body;
      if (tw) {
        const u = Math.max(0, Math.min(1, (now - tw.start) / tw.ms)), e = ease(u);
        g.position.lerpVectors(tw.from, tw.to, e);
        const dx = tw.to.x - tw.from.x, dz = tw.to.z - tw.from.z, moving = u > 0 && u < 1 && Math.hypot(dx, dz) > 0.5;
        g.rotation.y = moving ? Math.atan2(-dz, dx) : (u >= 1 ? tw.facing : g.rotation.y);
        b.rotation.x = moving ? Math.sin(now / 160 + g.userData.phase) * 0.12 : 0;
        if (u >= 1) { delete g.userData.tween; if (tw.leave) { this.disposePlayer(g); this.leaving = this.leaving.filter(x => x !== g); return; } }
      } else {
        b.rotation.x = Math.sin(this.time.value * 1.6 + g.userData.phase) * 0.03;
        b.position.y = Math.abs(Math.sin(this.time.value * 2 + g.userData.phase)) * 0.015;
      }
    };
    [...this.players.home, ...this.players.away, ...this.leaving].forEach(tick);
    if (this.selected && this.selRing) this.selRing.position.set(this.selected.position.x, 0.02, this.selected.position.z);
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  updateCamera(dt, now) {
    if (this.tween) {
      const t = this.tween, u = Math.min(1, (now - t.start) / t.ms), e = ease(u);
      const bez = (pts, k) => { let p = pts.map(v => v.clone()); while (p.length > 1) p = p.slice(1).map((v, i) => p[i].clone().lerp(v, k)); return p[0]; };
      this.camera.position.copy(bez(t.points, e)); this.target.copy(bez(t.targets, e));
      this.camera.lookAt(this.target); this.controls.target.copy(this.target);
      if (u >= 1) { this.tween = null; t.done?.(); }
      return;
    }
    if (this.mode === 'intro' && !this.intro.entering) {
      const el = (now - this.intro.start) / 1000, R = Math.max(this.extent.EX, this.extent.EZ) * 3.1, k = ease(Math.min(1, el / 9));
      const a = -0.6 + el * 0.11, r = R * (1.5 - 0.5 * k), h = R * (0.95 - 0.45 * k);
      this.camera.position.set(Math.cos(a) * r, h, Math.sin(a) * r * 0.92); this.target.set(0, this.roofY * 0.35, 0); this.camera.lookAt(this.target);
    } else if (this.mode === 'tour') {
      if (!this.tour.paused) this.tour.angle += dt * 0.085;
      const p = this.tourPose(this.tour.angle); this.camera.position.copy(p.pos); this.target.copy(p.target); this.camera.lookAt(this.target);
    } else if (this.mode === 'explore') {
      this.controls.update();
    }
  }

  placeLabels() {
    if (!this.state.labels || this.mode === 'tour' || this.mode === 'intro') return;
    const r = this.canvas.getBoundingClientRect(), v = new THREE.Vector3();
    for (const [g, el] of this.labels) {
      v.set(g.position.x, 2.35, g.position.z).project(this.camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${(v.x + 1) / 2 * r.width}px, ${(1 - v.y) / 2 * r.height}px) translate(-50%, -100%)`;
    }
  }

  /* ---------------- pulizia ---------------- */

  disposeGroup(group) { if (group) { this.scene.remove(group); disposeObject(group); } }

  clearAll() {
    for (const side of ['home', 'away']) (this.players[side] || []).forEach(g => this.disposePlayer(g));
    this.leaving.forEach(g => this.disposePlayer(g)); this.leaving = [];
    this.players = { home: [], away: [] };
    this.disposeGroup(this.root); this.disposeGroup(this.awayLayer);
    this.leds = []; this.cubeCanvas = null; this.cube = null; this.archRise = 0; this.ceiling = null; this.outside = null; this.outsideRoof = null; this.tween = null;
    this.select(null, true);
  }
}
