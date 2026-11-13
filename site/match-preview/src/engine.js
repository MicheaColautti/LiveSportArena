// Vista "Arena 3D": costruisce un'arena dalla configurazione (arenas.js) e la mette in scena in quattro regie.
//   intro     vista aerea dell'esterno con informazioni su arena e squadra, poi ingresso dal tetto
//   lineup    formazioni: telecamera fissa, niente cubo, una linea alla volta
//   tour      giro automatico dentro l'arena, le linee cambiano da sole (le tabelle le mostra la pagina)
//   explore   telecamera libera, con vista in sezione dall'alto
// Sistema di riferimento e lati: vedi layout.js. La squadra di casa difende la porta a ovest.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TEAMS } from './teams.js?v=184';
import { ARENAS } from './arenas.js?v=184';
import { POSITIONS, placeholderLineup } from './lineups.js?v=184';
import { RINK, seeded, pick, weighted, ease, color, lum, logoOf, canvas, texture, drawLogo, fitText, Mesher, stripGeometry, roundedRect, readable, _p, _s } from './common.js?v=184';
import { iceTexture, boardsTexture, ledTexture, suitesTexture, vipGlassTexture, sloganWallTexture, cornerTowerTexture, bannerTexture, hangingBannerTexture, flagAtlas, flagMaterial, bounceMaterial } from './textures.js?v=184';
import { lambert, disposeObject, makePlayer } from './players.js?v=184';
import { buildLayout, sectionLine, sectionTs, sectionPoint, samplePolyline, zoneAt, standsAt, zoneCuts, heightAt, sectionByKey } from './layout.js?v=184';
import { buildExterior, octaRoof } from './exterior.js?v=184';

export { RINK };
const NEUTRALS = ['#2b2f36', '#3c4048', '#56606b', '#e6e6e6', '#1d2a44', '#5b4636', '#8a8f99', '#1a1a1a', '#6f7f8f', '#a33a3a', '#3f5f3f'];
const SKIN = ['#f1c9a5', '#e0ac83', '#c68863', '#8d5a3b', '#f5d6bc', '#d9a07a'];

// Posizioni per la squadra di casa; gli ospiti sono speculari (x → -x, z → -z).
export const GAME_SLOTS = { LW: [-4.6, -7.4], C: [-3.2, 0], RW: [-4.6, 7.4], LD: [-12.5, -4.6], RD: [-12.5, 4.6], G: [-24.7, 0] };
export const LINEUP_SLOTS = { LW: [-8.6, -6.4], C: [-3.8, 2.0], RW: [-8.6, 6.4], LD: [-16.2, -4.2], RD: [-16.2, 4.2], G: [-23.4, 0] };
const BENCH = { home: [-7.5, 16.6], away: [7.5, 16.6] };
const SKY = '#bfd5e6';
// Intro: secondi di giorno, di tramonto e di notte prima di entrare nell'arena.
export const INTRO = { day: 2.5, dusk: 5, night: 14 };
const SKY_HORIZON = ['#dfe9f0', '#f0a06a', '#16213a'], SKY_TOP = ['#8fb4d6', '#41558a', '#03060d'];
const MOON = color('#6d84b8'), DUSK = color('#ffb27a');
const mix3 = (list, n) => { const k = list.map(color); return n < 0.5 ? k[0].lerp(k[1], n * 2) : k[1].lerp(k[2], (n - 0.5) * 2); };

export class ArenaView {
  constructor(canvasEl, overlayEl, { quality = 'high' } = {}) {
    this.canvas = canvasEl; this.overlay = overlayEl; this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.3, 4000);
    this.controls = new OrbitControls(this.camera, canvasEl);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.49, minDistance: 6, maxDistance: 70, autoRotateSpeed: 0.35, enabled: false });
    this.target = new THREE.Vector3();
    this.time = { value: 0 };
    this.night = { value: 0 }; this.glow = { value: 0 };
    this.introMs = (INTRO.day + INTRO.dusk + INTRO.night) * 1000;
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
    this.gallery = mode === 'gallery';
    if (this.gallery) away = 'LSA';
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
    if (!this.gallery) this.spawnAll();
    this.setMode(mode || this.mode, { instant: true });
    if (!this.gallery) this.emit('change', this.info());
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
    this.controls.enabled = mode === 'gallery' || mode === 'explore' || mode === 'lineup';
    if (mode === 'lineup') {
      Object.assign(this.controls, { enablePan: false, minDistance: 8, maxDistance: this.extent.EX, minPolarAngle: 0.2, maxPolarAngle: Math.PI * 0.47 });
    }
    this.controls.autoRotate = mode === 'explore' && this.controls.autoRotate;
    this.overlay.dataset.mode = mode;
    if (this.cube) this.cube.visible = mode !== 'lineup';
    if (this.outside) this.outside.visible = mode === 'intro';
    this.scene.background = mode === 'intro' ? color(SKY) : color(this.A.style.wall).multiplyScalar(0.55);
    // Nebbia stretta: il paesaggio sfuma piano nel cielo (e di notte nel buio) invece di finire con uno stacco.
    this.scene.fog = (mode === 'intro' || mode === 'gallery') ? new THREE.Fog(SKY, 200, 760) : null;
    if (mode === 'intro') this.setNight(0); else { this.night.value = 0; this.setLightLevel(1); }
    // In volo sopra l'esterno serve più precisione di profondità: piano vicino più lontano, niente sfarfallio.
    this.camera.near = mode === 'intro' ? 6 : 0.3;
    this.arrange(mode === 'lineup' ? 'lineup' : 'game', instant || prev === 'intro');
    this.camera.fov = 48; this.camera.clearViewOffset();
    if (mode === 'gallery') {
      const span = Math.max(this.extent.EX, this.extent.EZ);
      Object.assign(this.controls, {minDistance: 4, maxDistance: span * 5, enablePan: true});
      this.exteriorPose = {pos:[span * 1.35, span, span * 1.55],target:[0,this.roofY * 0.35,0]};
      this.flyTo(this.exteriorPose.pos,this.exteriorPose.target,0);
      this.setNight(1);
    }
    if (mode === 'lineup') { const c = this.lineupCamera(); this.flyTo(c.pos, c.target, instant ? 0 : 1300, () => this.applyLineupFov()); if (instant) this.applyLineupFov(); }
    else if (mode === 'tour') { this.tour.nextLine = performance.now() + this.tour.lineEvery; if (!instant && prev !== 'intro') { const p = this.tourPose(this.tour.angle); this.flyTo(p.pos, p.target, 1300); } }
    else if (mode === 'intro') { this.intro.start = performance.now(); this.intro.entering = false; this.tween = null; }
    else if (mode === 'explore') { this.controls.maxDistance = Math.max(this.extent.EX, this.extent.EZ) * 3; const v = this.views().tribuna; this.flyTo(v.pos, v.target, instant ? 0 : 1100); }
    this.camera.updateProjectionMatrix();
    this.emit('mode', mode);
  }

  // Dall'intro: volo sopra il tetto e discesa dentro l'arena, poi parte il tour.
  enterArena() {
    if (this.mode !== 'intro' || this.intro.entering) return;
    this.intro.entering = true;
    this.camera.near = 0.5; this.camera.updateProjectionMatrix();
    const top = this.outsideTop ?? this.roofY;
    const p = this.tourPose(this.tour.angle = Math.PI / 2);
    this.flyPath([this.camera.position.clone(), new THREE.Vector3(0, top + 45, 30), new THREE.Vector3(0, top + 6, 8), p.pos], [this.target.clone(), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), p.target], 4200, () => this.setMode('tour'));
  }

  views() {
    const { zs, profiles } = this.layout, Y = this.roofY;
    const eye = (P, f) => Math.min(Y - 2.5, heightAt(P, P.depth * f) + 2.4);
    return {
      tribuna: { pos: [12, eye(profiles.south, 0.85) + 2.5, zs + profiles.south.depth * 0.85], target: [-6, 0.5, 0] },
      alto: { pos: [0.01, Y * 0.73, this.extent.EZs * 0.48], target: [0, 0, -3] },
      diorama: { pos: [this.extent.EX * 0.57, Y * 0.64, this.extent.EZs * 0.50], target: [0, 1, 0] },
    };
  }

  keepInside(v) {
    const E = this.extent, m = 1.5;
    v.x = THREE.MathUtils.clamp(v.x, -E.EX + m, E.EX - m); v.z = THREE.MathUtils.clamp(v.z, -E.EZn + m, E.EZs - m);
    v.y = THREE.MathUtils.clamp(v.y, 1.5, this.roofY + (this.archRise || 0) * 0.5 - 1.5);
    return v;
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
    this.lights = { hemi, key, fill, base: { hemi: hemi.intensity, key: key.intensity, fill: fill.intensity, tint: tint.clone() } };
  }

  // Luce generale (1 = pieno giorno o arena accesa) e quanto è notte (tinta lunare, tramonto caldo a metà).
  setLightLevel(level, n = 0) {
    const L = this.lights; if (!L) return;
    L.hemi.intensity = L.base.hemi * level; L.fill.intensity = L.base.fill * level; L.key.intensity = L.base.key * Math.max(0.04, level * level);
    L.hemi.color.copy(L.base.tint).lerp(MOON, n); L.key.color.copy(L.base.tint).lerp(DUSK, Math.sin(Math.PI * Math.min(1, n * 1.4)) * 0.8);
  }

  // Giorno → tramonto → notte per l'intro: cielo, nebbia, luci e tutto ciò che si accende (finestre, lampioni, auto, facciate).
  setNight(n) {
    this.night.value = n;
    const hz = mix3(SKY_HORIZON, n), top = mix3(SKY_TOP, n), g = THREE.MathUtils.smoothstep(n, 0.3, 0.8);
    this.glow.value = g;
    if (this.sky) { this.sky.uniforms.uTop.value.copy(top); this.sky.uniforms.uHorizon.value.copy(hz); this.sky.uniforms.uStars.value = THREE.MathUtils.smoothstep(n, 0.6, 1); }
    if (this.mode === 'intro' || this.gallery) { this.scene.background = hz; if (this.scene.fog) this.scene.fog.color.copy(hz); }
    this.nightLevel = 1 - 0.8 * n;
    this.setLightLevel(this.nightLevel, n);
    for (const it of this.nightList || []) it.mat[it.prop] = (it.min || 0) + it.max * g;
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
    const rails = color('#c7ccd2'), fasciaC = color(TEAMS[A.team].primary).lerp(color('#111'), 0.35), aisle = st.aisle ? color(st.aisle) : conc.clone().lerp(color('#ffffff'), 0.18), wedgeFace = color(st.wedgeFace || '#d9d6cf');
    const M = new Mesher(), lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    let roofBase = 0;
    this.vipFronts = [];
    sections.forEach((S, si) => {
      const P = S.profile;
      roofBase = Math.max(roofBase, P.top);
      // Curva in piedi di casa: niente scale tra i settori, solo due passaggi vicino al centro (A.home.aisles).
      const curveSec = this.isCurve(S), ent = this.entrances(S), vom = ent || (curveSec && S.kind === 'straight' ? this.vomitories(S) : null), cuts = [...zoneCuts(A, S), ...(vom ? vom.cuts : []), ...(S.kind === 'wedge' && S.stair ? [0.47, 0.53] : []), ...(A.vipBoxes && A.vipBoxes.side === S.key ? [A.vipBoxes.from ?? 0.1, A.vipBoxes.to ?? 0.9] : [])], upperFrom = st.upperSeats ? Math.floor(P.rows.length * st.upperSeats.from) : Infinity, upperC = st.upperSeats && color(st.upperSeats.color);
      // Soletta orizzontale sotto il balcone: stessa quota dal labbro fino al fondo.
      for (const R of P.rows.filter(row => row.first && P.spec?.tiers[row.tier]?.slab)) {
        const y = R.h - P.spec.tiers[R.tier].slab;
        const front = sectionLine(S, R.d), back = sectionLine(S, P.depth);
        for (let i = 0; i < front.length - 1; i++) {
          const [a, b, c, d] = [front[i], front[i + 1], back[i + 1], back[i]];
          M.quad([a[0], y, a[1]], [d[0], y, d[1]], [c[0], y, c[1]], [b[0], y, b[1]], conc);
          M.quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], R.h + 0.85, b[1]], [a[0], R.h + 0.85, a[1]], color('#c4c1ba'));
        }
      }
      P.rows.forEach((R, ri) => {
        // Lati con A.sectors: le scale stanno esattamente a 1/n, 2/n... (centrate), non sui tratti da 7 m; via i tagli troppo vicini.
        const sc = this.hasStairs(S) ? this.sectorBounds(S).flatMap(b => [b - 1.1 / S.len, b]) : null;
        const ts = sc ? [...sectionTs(S, 0, 1, 7, cuts).filter(t => t < 1e-6 || t > 1 - 1e-6 || !sc.some(c => Math.abs(t - c) * S.len < 1.2)), ...sc].sort((a, b) => a - b) : sectionTs(S, 0, 1, 7, cuts), at = d => ts.map(t => { const q = sectionPoint(S, t, d); return [q.x, q.z]; });
        const inner = at(R.d), outer = at(R.d + R.depth);
        for (let i = 0; i < inner.length - 1; i++) {
          const up = standsAt(A, S, (ts[i] + ts[i + 1]) / 2, R);
          let seat;
          if (up) seat = ri % 2 ? terrace : terrace.clone().multiplyScalar(0.96);
          else if (ri >= upperFrom) seat = upperC;
          else if (st.seatPattern === 'rows') seat = seats[ri % seats.length];
          else if (st.seatPattern === 'blocks') seat = seats[(Math.floor(i / (S.kind === 'arc' ? 4 : 1)) + si) % seats.length];
          else if (st.seatPattern === 'random') seat = pick(rand, seats);
          else seat = seats[0];
          const a = inner[i], b = inner[i + 1], c = outer[i + 1], d = outer[i];
          // Cuneo d'angolo: la scala scende al centro, dal fondo fino al vertice vicino al ghiaccio.
          if (S.kind === 'wedge' && S.stair && ts[i] >= 0.469 && ts[i + 1] <= 0.531) {
            M.quad([a[0], R.h, a[1]], [b[0], R.h, b[1]], [c[0], R.h, c[1]], [d[0], R.h, d[1]], aisle);
            M.quad([a[0], R.below, a[1]], [b[0], R.below, b[1]], [b[0], R.h, b[1]], [a[0], R.h, a[1]], aisle.clone().multiplyScalar(0.8));
            continue;
          }
          // VIP (Berna): ogni "fila" è un piano di logge. Pavimento, una fila di poltroncine sul bordo e, dietro,
          // la vetrata della loggia (disegnata a parte con la texture delle suite, vedi vipFronts).
          if (R.vip) {
            M.quad([a[0], R.h, a[1]], [b[0], R.h, b[1]], [c[0], R.h, c[1]], [d[0], R.h, d[1]], floorC);
            const sa = lerp2(a, d, 0.12), sb = lerp2(b, c, 0.12), sa2 = lerp2(a, d, 0.42), sb2 = lerp2(b, c, 0.42), vs = color(st.vipSeat || '#c8d400');
            M.quad([sa[0], R.h + 0.45, sa[1]], [sb[0], R.h + 0.45, sb[1]], [sb2[0], R.h + 0.45, sb2[1]], [sa2[0], R.h + 0.45, sa2[1]], vs);
            M.quad([sa2[0], R.h + 0.45, sa2[1]], [sb2[0], R.h + 0.45, sb2[1]], [sb2[0], R.h + 1.0, sb2[1]], [sa2[0], R.h + 1.0, sa2[1]], vs.clone().multiplyScalar(0.8));
            M.quad([a[0], R.h, a[1]], [b[0], R.h, b[1]], [b[0], R.h + 1.1, b[1]], [a[0], R.h + 1.1, a[1]], color('#d9dde2'));
            if (!R.first) this.vipFronts.push([a, b, R.below, R.h]);
            else M.quad([a[0], R.below, a[1]], [b[0], R.below, b[1]], [b[0], R.h, b[1]], [a[0], R.h, a[1]], fasciaC);
            if (i % 2 === 0) M.quad([lerp2(a, d, 0.98)[0], R.h, lerp2(a, d, 0.98)[1]], [a[0], R.h, a[1]], [a[0], R.h + 2.6, a[1]], [lerp2(a, d, 0.98)[0], R.h + 2.6, lerp2(a, d, 0.98)[1]], color('#b9bec4'));
            continue;
          }
          // Logge VIP dentro la tribuna (Rapperswil): nelle file della fascia solo il pavimento, la vetrata è disegnata a parte.
          if (this.inVipBox(S, (ts[i] + ts[i + 1]) / 2, ri)) {
            M.quad([a[0], R.h, a[1]], [b[0], R.h, b[1]], [c[0], R.h, c[1]], [d[0], R.h, d[1]], floorC);
            M.quad([a[0], R.below, a[1]], [b[0], R.below, b[1]], [b[0], R.h, b[1]], [a[0], R.h, a[1]], floorC);
            continue;
          }
          // Vomitorio: un'apertura nella gradinata con pavimento scuro e pareti laterali, niente gradini.
          // Gli ingressi del secondo anello (A.entrances) hanno le spalle e l'architrave gialli e il fondo nero.
          if (vom && (ent || R.standing) && vom.at((ts[i] + ts[i + 1]) / 2)) {
            const fy = P.rows[vom.r0].below, jamb = ent ? color(ent.color) : conc;
            if (ri >= vom.r0 && ri <= vom.r1) {
              M.quad([a[0], fy, a[1]], [b[0], fy, b[1]], [c[0], fy, c[1]], [d[0], fy, d[1]], color('#1b1c1f'));
              for (const [p1, p2] of [[a, d], [b, c]]) M.quad([p1[0], fy, p1[1]], [p2[0], fy, p2[1]], [p2[0], R.h, p2[1]], [p1[0], R.h, p1[1]], jamb);
              continue;
            }
            if (ri === vom.r1 + 1) {
              M.quad([a[0], fy, a[1]], [b[0], fy, b[1]], [b[0], R.h, b[1]], [a[0], R.h, a[1]], color(ent ? '#050506' : '#121315'));
              if (ent) M.quad([a[0], R.h - 0.7, a[1]], [b[0], R.h - 0.7, b[1]], [b[0], R.h + 0.02, b[1]], [a[0], R.h + 0.02, a[1]], jamb);
              M.quad([a[0], R.h, a[1]], [b[0], R.h, b[1]], [c[0], R.h, c[1]], [d[0], R.h, d[1]], seat); continue;
            }
          }
          const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]), hasAisle = sc ? this.sectorAisleAt(S, ts[i + 1]) : A.noAisles || S.kind === 'wedge' || (curveSec && R.standing) ? false : R.tier > 0 && A.upperAisles ? S.kind === 'straight' && this.upperAisleAt(S, ts[i + 1]) : S.kind === 'straight' ? segLen > 3 : i % 3 === 2 && segLen > 1.5;
          const u = hasAisle ? (sc ? 0 : 1 - Math.min(0.45, 1.1 / Math.max(segLen, 0.1))) : 1;
          const a2 = lerp2(a, b, u), d2 = lerp2(d, c, u);
          M.quad([a[0], R.h, a[1]], [a2[0], R.h, a2[1]], [d2[0], R.h, d2[1]], [d[0], R.h, d[1]], seat);
          if (hasAisle) M.quad([a2[0], R.h, a2[1]], [b[0], R.h, b[1]], [c[0], R.h, c[1]], [d2[0], R.h, d2[1]], aisle);
          // Schienali: una fascia verticale verso il fondo del gradino.
          if (!up && R.depth > 0.6) {
            const ba = lerp2(a, d, 0.78), bb = lerp2(a2, d2, 0.78);
            M.quad([ba[0], R.h, ba[1]], [bb[0], R.h, bb[1]], [bb[0], R.h + 0.42, bb[1]], [ba[0], R.h + 0.42, ba[1]], seat.clone().multiplyScalar(0.78));
          }
          if (up && !R.standing && ri % 3 === 2) M.beam([a[0], R.h + 1, a[1]], [b[0], R.h + 1, b[1]], 0.05, rails);
          if (P.spec?.tiers[R.tier]?.overhang && !P.spec.tiers[R.tier].slab) {
            const y = R.h - 0.35;
            M.quad([d[0], y, d[1]], [c[0], y, c[1]], [b[0], y, b[1]], [a[0], y, a[1]], conc);
          }
          const front = R.first && R.tier > 0 ? fasciaC : riser;
          if (!(R.first && P.spec?.tiers[R.tier]?.slab)) M.quad([a[0], R.below, a[1]], [b[0], R.below, b[1]], [b[0], R.h, b[1]], [a[0], R.h, a[1]], ri === 0 ? conc : front);
        }
        // Sezioni appese (anello alto che gira l'angolo, Zurigo): facce di testa solo dalla fila sotto; il lato lungo che
        // prosegue nell'arco appeso (hangEnd) non ha la faccia piena sotto l'anello alto da quella parte.
        if (S.kind === 'arc' && S.capStart) M.quad([inner[0][0], R.below, inner[0][1]], [outer[0][0], R.below, outer[0][1]], [outer[0][0], R.h, outer[0][1]], [inner[0][0], R.h, inner[0][1]], conc);
        if (S.kind === 'straight') for (const k of [0, inner.length - 1]) { if (S.hang && S.capEnd === false) continue; const y0 = P.spec?.tiers[R.tier]?.overhang ? R.h - 0.35 : S.hang || (R.tier > 0 && S.hangEnd === (k ? 1 : 0)) ? R.below : 0; M.quad([inner[k][0], y0, inner[k][1]], [outer[k][0], y0, outer[k][1]], [outer[k][0], R.h, outer[k][1]], [inner[k][0], R.h, inner[k][1]], conc); }
        // Cuneo: le due facce verticali del prisma lungo i cateti, a gradini dal pavimento fino alla fila.
        if (S.kind === 'wedge') for (const k of [0, inner.length - 1]) M.quad([inner[k][0], 0, inner[k][1]], [outer[k][0], 0, outer[k][1]], [outer[k][0], R.h, outer[k][1]], [inner[k][0], R.h, inner[k][1]], wedgeFace);
        if (R.standing && ri % 4 === 3) { const l = sectionLine(S, R.d + 0.08); for (let i = 0; i < l.length - 1; i++) M.beam([l[i][0], R.h + 1.0, l[i][1]], [l[i + 1][0], R.h + 1.0, l[i + 1][1]], 0.05, rails); }
      });
      // Parapetto inclinato sui due cateti del cuneo: la "V" chiara che scende verso il ghiaccio.
      if (S.kind === 'wedge') {
        const R0 = P.rows[0], RN = P.rows.at(-1), edge = S.edge ? color(S.edge) : wedgeFace.clone().multiplyScalar(1.08);
        for (const t of [0, 1]) {
          const p0 = sectionPoint(S, t, R0.d), p1 = sectionPoint(S, t, RN.d + RN.depth), y0 = R0.h, y1 = RN.h;
          // Il bordo inferiore scende di una alzata: copre i triangoli tra i gradini e la linea inclinata.
          const rise = P.rows.length > 1 ? P.rows[1].h - R0.h : 0;
          M.quad([p0.x, y0 - rise, p0.z], [p1.x, y1 - rise, p1.z], [p1.x, y1 + 1.0, p1.z], [p0.x, y0 + 1.0, p0.z], edge);
          M.beam([p0.x, y0 + 1.05, p0.z], [p1.x, y1 + 1.05, p1.z], 0.07, rails);
        }
      }
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
    // Davos: il soffitto di legno sta 1,4 m sotto le falde esterne (octaRoof) e i muri salgono fino a lui, a tratti di 2 m.
    // Davos: volta in legno con la stessa logica del tetto esterno, letta dalle foto dell'interno:
    //  - falde (hS, hE) che salgono da tutte e quattro le pareti partendo appena sopra l'ultima fila (lift): il legno scende
    //    fino alle tribune lungo tutto il perimetro, e le falde di lato e di testata si incontrano in diagonale negli angoli;
    //  - due volte a botte acute che si incrociano al centro: gA corre lungo la pista e apre la lunetta a punta sulle testate
    //    (larga az della testata), gB la attraversa e apre una lunetta più stretta sui lati lunghi (ax della lunghezza).
    // Si prende la più alta (raccordo morbido soft); il tutto resta sotto le falde esterne (octaRoof) di roof.thick.
    this.ceilAt = A.exterior?.octaStar ? (() => {
      const R = octaRoof(A, EX, EZn, EZs), V = A.roof.vault || {}, Ps = this.layout.profiles, lift = V.lift ?? 1.4, kk = V.soft ?? 1.2, p = V.point ?? 0.9;
      const zc = (EZs - EZn) / 2, EZh = (EZn + EZs) / 2, G = u => Math.pow(Math.max(0, 1 - Math.abs(u)), p);
      const smin = (a, b) => (a + b - Math.sqrt((a - b) * (a - b) + kk * kk)) / 2, smax = (a, b) => (a + b + Math.sqrt((a - b) * (a - b) + kk * kk)) / 2;
      const low = Math.max(Ps.north.top, Ps.south.top, Ps.west.top, Ps.east.top) + lift, rise = V.rise ?? 14, ax = V.ax ?? 0.45, az = V.az ?? 0.7, kh = V.hip ?? 0.6;
      const parts = (x, z) => { const dS = Math.max(0, z < zc ? z + EZn : EZs - z), dE = Math.max(0, EX - Math.abs(x)); return { gA: rise * G((z - zc) / (EZh * az)), gB: rise * G(x / (EX * ax)), hS: Math.min(kh * dS, rise), hE: Math.min(kh * dE, rise) }; };
      // Famiglia delle nervature: T = archi trasversali (x costante: lunetta di testata e falde dei lati lunghi),
      // L = archi longitudinali (z costante: lunetta laterale e falde delle testate).
      const region = (x, z) => { const q = parts(x, z), hip = Math.min(q.hS, q.hE), m = Math.max(q.gA, q.gB, hip); return m === q.gA ? 'TgA' : m === q.gB ? 'LgB' : q.hS <= q.hE ? 'ThS' : 'LhE'; };
      this.vaultParts = { parts, region, low };
      return (x, z) => { const q = parts(x, z); return smin(R.h(x, z) - (A.roof.thick ?? 1.4), low + Math.max(0, smax(smin(q.hS, q.hE) + kk * 0.5, smax(q.gA, q.gB)))); };
    })() : null;
    const wallTo = (a, b, y0, k, cap = Infinity) => {
      if (!this.ceilAt) return W.wall(a, b, y0, Y, k);
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let i = 0; i < n; i++) { const p = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], q = [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; W.wall(p, q, y0, Math.min(cap, this.ceilAt(m[0], m[1])), k); }
    };
    // Con il muro delle nicchie (Zurigo) la testata e i suoi angoli non hanno il muro scuro dietro: li chiude la parete piatta.
    const nicheEnd = A.extras?.nicheWall ? A.extras.nicheWall.side || 'east' : null;
    sections.forEach(S => { if (S.hang || nicheEnd && (S.key === nicheEnd || (S.kind === 'arc' && S.wrap && S.end === nicheEnd))) return; const P = S.profile, l = sectionLine(S, P.depth); for (let i = 0; i < l.length - 1; i++) wallTo(l[i], l[i + 1], P.top, wallC); });
    const endCap = A.extras?.glassGables ? Y : Infinity, sideCap = A.extras?.glassGables === 'ends' ? Infinity : endCap;
    wallTo([-EX, -EZn], [EX, -EZn], 0, wc, sideCap); wallTo([-EX, EZs], [EX, EZs], 0, wc, sideCap); wallTo([-EX, -EZn], [-EX, EZs], 0, wc, endCap); wallTo([EX, -EZn], [EX, EZs], 0, wc, endCap);
    if (this.gallery) {
      const shell = new Mesher(), finish = color(st.wall).lerp(color('#657175'), 0.38);
      const at = (point, y) => [point[0], y, point[1]];
      const base = -0.38;
      for (const section of sections) {
        const profile = section.profile;
        const rim = sectionLine(section, profile.depth);
        for (let i = 1; i < rim.length; i++) {
          const a = rim[i - 1], b = rim[i];
          shell.quad(at(a, base), at(b, base), at(b, profile.top), at(a, profile.top), finish);
          shell.tri([0, base, 0], at(a, base), at(b, base), finish);
        }
        // Chiude anche i fianchi esposti tra settori di profondità diversa.
        for (const t of [0, 1]) {
          for (const row of profile.rows) {
            const a = sectionPoint(section, t, row.d), b = sectionPoint(section, t, row.d + row.depth);
            shell.quad([a.x,base,a.z], [b.x,base,b.z], [b.x,row.h,b.z], [a.x,row.h,a.z], finish);
          }
        }
      }
      this.sectionShell = shell.mesh();
      this.root.add(this.sectionShell);
    }
    this.perimeterWalls = W.mesh();
    this.root.add(this.perimeterWalls);
    const rim = new Mesher(), rimColor = wallC.clone().multiplyScalar(1.2);
    const corners = [[-EX, -EZn], [EX, -EZn], [EX, EZs], [-EX, EZs]];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      rim.beam([a[0], Y + 0.18, a[1]], [b[0], Y + 0.18, b[1]], 0.46, rimColor, 0.36);
    });
    this.perimeterWalls.add(rim.mesh());
    if (A.extras?.timberWalls) {
      const T = new Mesher(), wood = color('#c99a62');
      const posts = (a, b) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(len / 5.5); for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n, ix = -Math.sign(x) * 0.25 * (Math.abs(b[0] - a[0]) < 0.1), iz = -Math.sign(z) * 0.25 * (Math.abs(b[1] - a[1]) < 0.1); T.box(x + ix, Y / 2, z + iz, 0.45, Y, 0.45, wood); } for (const f of [0.35, 0.62, 0.86]) T.beam([a[0] - Math.sign(a[0]) * 0.2 * (Math.abs(b[0] - a[0]) < 0.1), Y * f, a[1] - Math.sign(a[1]) * 0.2 * (Math.abs(b[1] - a[1]) < 0.1)], [b[0] - Math.sign(b[0]) * 0.2 * (Math.abs(b[0] - a[0]) < 0.1), Y * f, b[1] - Math.sign(b[1]) * 0.2 * (Math.abs(b[1] - a[1]) < 0.1)], 0.3, wood); };
      posts([-EX, -EZn], [EX, -EZn]); posts([-EX, EZs], [EX, EZs]); posts([-EX, -EZn], [-EX, EZs]); posts([EX, -EZn], [EX, EZs]);
      this.root.add(T.mesh());
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * EX, EZn + EZs), new THREE.MeshLambertMaterial({ color: st.floor }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.02, (EZs - EZn) / 2); this.perimeterWalls.add(floor);
    // Panchine e box dei puniti.
    const k = color(TEAMS[A.team].primary);
    M.box(-7.5, 0.22, RINK.halfW + 1.4, 9, 0.44, 2.4, color('#30333a')); M.box(-7.5, 0.75, RINK.halfW + 2.5, 9, 1.5, 0.2, k); M.box(-7.5, 0.48, RINK.halfW + 2.05, 9, 0.1, 0.5, k.clone().multiplyScalar(0.7));
    M.box(7.5, 0.22, RINK.halfW + 1.4, 9, 0.44, 2.4, color('#30333a'));
    this.benchAwayRange = [3, 12];
    M.box(-2.6, 0.6, -RINK.halfW - 1.3, 3.6, 1.2, 1.8, color('#2b2e35')); M.box(2.6, 0.6, -RINK.halfW - 1.3, 3.6, 1.2, 1.8, color('#2b2e35')); M.box(0, 0.7, -RINK.halfW - 1.2, 1.4, 1.4, 1.6, color('#41454d'));
    this.root.add(M.mesh());
    // Vetrate delle logge VIP: texture delle suite, accese anche con la luce della pista.
    if (this.vipFronts.length) {
      const pos = [], uv = [], tex = suitesTexture(); tex.wrapS = THREE.RepeatWrapping;
      for (const [a, b, y0, y1] of this.vipFronts) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) / 6; for (const [p, u, y, v] of [[a, 0, y0, 0], [b, L, y0, 0], [b, L, y1, 1], [a, 0, y0, 0], [b, L, y1, 1], [a, 0, y1, 1]]) { pos.push(p[0], y, p[1]); uv.push(u, v); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      this.root.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
    }
  }

  // Soffitto interno. Tipi: truss (capriate in acciaio), flat (travi piene), botta (travi diagonali), slats (travi scure e doghe chiare),
  // wood-truss (capriate in legno), vault (volta ribassata con archi), wood-arch / wood-gothic (archi in legno), wood-cross (volte incrociate).
  isCurve(S) { const H = this.A.home; return !!H && (S.kind === 'straight' ? S.key === H.side && H.from == null && H.to == null : S.wrap && S.end === H.side); }
  // Secondo anello con poche scale (A.upperAisles = una scala ogni n settori da ~7 m), alla fine del settore come le altre.
  // A.sectors = { north: 3 }: il lato ha solo n settori uguali, cioè n - 1 scale (su entrambi gli anelli) centrate a 1/n,
  // 2/n, ...; sectorBounds dà la fine di ogni passaggio (largo 1,1 m), sectorAisleNear se un punto ci sta sopra.
  // A.stairs = { east: [0.52] }: scale in punti precisi del lato (centro del passaggio), anche con noAisles (Lugano: una
  // scala tra la curva di casa e gli ospiti).
  hasStairs(S) { return S.kind === 'straight' && !!(this.A.stairs?.[S.key] || this.A.sectors?.[S.key]); }
  sectorBounds(S) { const at = this.A.stairs?.[S.key], m = this.A.sectors?.[S.key]; return (at || Array.from({ length: m - 1 }, (_, k) => (k + 1) / m)).map(c => c + 0.55 / S.len); }
  sectorAisleAt(S, t) { return this.sectorBounds(S).some(b => Math.abs(t - b) < 1e-4); }
  sectorAisleNear(S, t) { const ps = t * S.len; return this.sectorBounds(S).some(b => ps > b * S.len - 1.15 && ps <= b * S.len); }
  // A.vipBoxes = { side, rowFrom, rows, from, to, n }: una fascia di logge vetrate dentro la tribuna, con file di sedili
  // sopra, sotto e ai lati, divisa in n logge da montanti rossi.
  inVipBox(S, t, ri) { const V = this.A.vipBoxes; return !!V && S.kind === 'straight' && S.key === V.side && ri >= V.rowFrom && ri < V.rowFrom + V.rows && t > (V.from ?? 0.1) && t < (V.to ?? 0.9); }
  upperAisleAt(S, t) { const n = Math.max(1, Math.round(S.len / 7)), k = t * n, r = Math.round(k); return Math.abs(k - r) < 1e-4 && r > 0 && (r - 1) % this.A.upperAisles === Math.floor(this.A.upperAisles / 2); }
  // Ingressi del secondo anello (Berna, A.entrances { every, color, sides, rows }): aperture nere con le spalle gialle,
  // a passo regolare lungo i lati indicati, qualche fila sopra il fronte dell'anello; fuori dal settore ospiti.
  entrances(S) {
    const E = this.A.entrances; if (!E || S.kind !== 'straight' || !(E.sides || ['north', 'south', 'west', 'east']).includes(S.key)) return null;
    const rows = S.profile.rows, first = rows.findIndex(R => R.tier === 1 && !R.vip); if (first < 0) return null;
    const n = Math.max(1, Math.round(S.len / (E.every ?? 16))), hw = 1.5 / S.len, G = this.A.guest, all = Array.from({ length: n }, (_, k) => (k + 0.5) / n);
    const at = all.filter(c => !(G && G.side === S.key && c > (G.from ?? 0) - 0.03 && c < (G.to ?? 1) + 0.03));
    const r0 = first + (E.from ?? 5), r1 = Math.min(rows.length - 2, r0 + (E.rows ?? 4) - 1);
    return { cuts: at.flatMap(c => [c - hw, c + hw]), r0, r1, color: E.color || '#f2c500', at: t => at.some(c => Math.abs(t - c) < hw) };
  }
  // Due vomitori nella curva di casa, a sinistra e a destra del centro (t), larghi circa 2,8 m, alti 4 file.
  vomitories(S) {
    const off = Math.min(0.3, 5 / S.len), at = this.A.home?.vomitories ?? [0.5 - off, 0.5 + off], hw = 1.4 / S.len, rows = S.profile.rows.filter(R => R.standing).length;
    const r0 = Math.max(1, Math.floor(rows * 0.3)), r1 = Math.min(rows - 2, r0 + 3);
    return { cuts: at.flatMap(c => [c - hw, c + hw]), r0, r1, at: t => at.some(c => Math.abs(t - c) < hw) };
  }

  buildRoof() {
    const A = this.A, R = A.roof, { EX, EZn, EZs } = this.extent, Y = this.roofY, M = new Mesher(), roofC = color(R.color);
    const steel = R.steel ? color(R.steel) : roofC.clone().lerp(color(lum(R.color) > 0.5 ? '#8e959e' : '#5b616a'), 0.5), lights = new Mesher(), lightC = color('#ffffff');
    const zc = (EZs - EZn) / 2, EZ = (EZn + EZs) / 2, glows = new Mesher(), glowC = R.glow ? color(R.glow) : null, bright = new Mesher();
    let lightY = Y - 0.6, gableMesh = null; this.vaultRibs = null;
    const curved = ['wood-arch', 'wood-gothic', 'vault', 'wood-cross'].includes(R.type);
    this.archRise = 0;
    if (!curved && R.type !== 'slats' && R.type !== 'wood-truss') M.quad([-EX, Y, -EZn], [EX, Y, -EZn], [EX, Y, EZs], [-EX, Y, EZs], roofC);
    if (R.type === 'truss') {
      const depth = Math.min(2.4, R.clear - 1.4); lightY = Y - depth;
      for (let x = -EX + 3; x <= EX - 2; x += 8.5) {
        M.beam([x, Y - 0.15, -EZn], [x, Y - 0.15, EZs], 0.22, steel); M.beam([x, Y - depth, -EZn + 1], [x, Y - depth, EZs - 1], 0.22, steel);
        let up = true;
        for (let z = -EZn + 1; z < EZs - 1; z += 2.5) { const z2 = Math.min(EZs - 1, z + 2.5); M.beam([x, up ? Y - depth : Y - 0.15, z], [x, up ? Y - 0.15 : Y - depth, z2], 0.1, steel); M.beam([x, Y - depth, z], [x, Y - 0.15, z], 0.08, steel); up = !up; }
      }
      for (const z of [-EZn + 4, zc, EZs - 4]) M.beam([-EX, Y - 0.25, z], [EX, Y - 0.25, z], 0.14, steel);
      if (R.cross) for (const s of [-1, 1]) M.beam([-EX * 0.8, Y - depth * 0.6, s * EZ * 0.8 + zc], [EX * 0.8, Y - depth * 0.6, -s * EZ * 0.8 + zc], 0.45, steel, 0.9);
    } else if (R.type === 'flat') {
      lightY = Y - 1.6;
      for (let x = -EX + 4; x < EX; x += 6) {
        M.beam([x, Y - 0.5, -EZn], [x, Y - 0.5, EZs], 0.5, steel, 0.9);
        if (glowC) glows.box(x, Y - 0.98, zc, 0.18, 0.06, EZn + EZs - 4, glowC);
      }
      for (const z of [-11, -4, 4, 11]) M.beam([-34, Y - 1.4, z], [34, Y - 1.4, z], 0.7, color('#2a2d33'), 0.25);
    } else if (R.type === 'slats') {
      // Doghe chiare tra travi scure molto alte; due travi principali in diagonale (Vernets).
      lightY = Y - 1.9;
      const w1 = roofC, w2 = roofC.clone().multiplyScalar(0.86);
      for (let x = -EX, i = 0; x < EX; x += 0.9, i++) bright.quad([x, Y, -EZn], [Math.min(EX, x + 0.9), Y, -EZn], [Math.min(EX, x + 0.9), Y, EZs], [x, Y, EZs], i % 2 ? w1 : w2);
      for (let x = -EX + 3; x < EX; x += 7) M.beam([x, Y - 0.8, -EZn], [x, Y - 0.8, EZs], 0.55, steel, 1.6);
      for (const s of [-1, 1]) M.beam([-EX, Y - 1.8, s * (EZ - 3) + zc], [EX, Y - 1.8, -s * (EZ - 3) + zc], 0.9, steel, 1.4);
    } else if (R.type === 'wood-truss') {
      // Capriate in legno a triangoli sopra il ghiaccio, tavolato sopra (Porrentruy).
      const depth = Math.min(3, R.clear - 1.2), wood = steel; lightY = Y - depth + 0.3;
      for (let x = -EX, i = 0; x < EX; x += 1.2, i++) M.quad([x, Y, -EZn], [Math.min(EX, x + 1.2), Y, -EZn], [Math.min(EX, x + 1.2), Y, EZs], [x, Y, EZs], i % 2 ? roofC : roofC.clone().multiplyScalar(0.92));
      for (let x = -EX + 3; x <= EX - 2; x += 6) {
        M.beam([x, Y - 0.25, -EZn], [x, Y - 0.25, EZs], 0.32, wood, 0.5); M.beam([x, Y - depth, -EZn + 1.5], [x, Y - depth, EZs - 1.5], 0.32, wood, 0.45);
        let up = true;
        for (let z = -EZn + 1.5; z < EZs - 1.5; z += 4) { const z2 = Math.min(EZs - 1.5, z + 4); M.beam([x, up ? Y - depth : Y - 0.25, z], [x, up ? Y - 0.25 : Y - depth, z2], 0.26, wood); up = !up; }
      }
      for (let z = -EZn + 3; z < EZs - 2; z += 5) M.beam([-EX, Y - 0.45, z], [EX, Y - 0.45, z], 0.22, wood.clone().multiplyScalar(0.9));
    } else if (R.type === 'botta') {
      lightY = Y - 1.2;
      for (const s of [-1, 1]) for (let c = -EX - EZ; c <= EX + EZ; c += 7) {
        const x0 = Math.max(-EX, s > 0 ? -EZn - c : c - EZs), x1 = Math.min(EX, s > 0 ? EZs - c : c + EZn);
        if (x1 - x0 < 1) continue;
        const zf = x => s > 0 ? x + c : c - x;
        M.beam([x0, Y - 0.5, zf(x0)], [x1, Y - 0.5, zf(x1)], 0.35, steel, 0.8);
      }
      M.beam([-EX, Y - 0.8, -EZn + 0.5], [EX, Y - 0.8, -EZn + 0.5], 0.8, steel, 1.4); M.beam([-EX, Y - 0.8, EZs - 0.5], [EX, Y - 0.8, EZs - 0.5], 0.8, steel, 1.4);
    } else if (R.type === 'wood-cross') {
      // Volte incrociate in legno: due archi acuti che si intersecano, nervature lungo entrambe le direzioni (Davos).
      // bulge: 0.5 = volte piene (radice), 1 = falde dritte che scendono fino ai muri negli angoli.
      const EXr = EX, rise = Math.min(EZ, EXr) * 0.62, f = u => Math.pow(Math.max(0, 1 - Math.abs(u)), R.bulge ?? 0.5);
      const h = this.ceilAt || ((x, z) => Y + rise * Math.max(f((z - zc) / EZ), f(x / EXr)));
      const N = this.ceilAt ? 64 : 30, V = R.vault || {};
      const plank = this.ceilAt ? [roofC.clone().multiplyScalar(0.78), roofC.clone().multiplyScalar(0.74)] : [roofC.clone().multiplyScalar(1.05), roofC.clone().multiplyScalar(0.92)];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x0 = -EX + 2 * EX * i / N, x1 = -EX + 2 * EX * (i + 1) / N, z0 = -EZn + 2 * EZ * j / N, z1 = -EZn + 2 * EZ * (j + 1) / N;
        M.quad([x0, h(x0, z0), z0], [x1, h(x1, z0), z0], [x1, h(x1, z1), z1], [x0, h(x0, z1), z1], plank[(i + j) % 2]);
      }
      const glulam = roofC.clone().lerp(color(V.ribColor ?? '#e2b27a'), this.ceilAt ? 0.75 : 0.5);
      if (this.ceilAt) {
        // Nervature di Davos come nelle foto: archi in legno lamellare fitti e chiari sul tavolato scuro, ognuno nella sua
        // falda o lunetta (famiglie T e L di vaultParts.region). Ogni arco si ferma dove cambia famiglia: lì passa una
        // costola più grossa (diagonali degli angoli e compluvi delle lunette), ricavata dai punti in cui gli archi finiscono.
        const RB = new Mesher(), VP = this.vaultParts, sx = V.ribStep ?? 3.4, w = V.rib ?? 0.5, d = V.ribH ?? 1.5;
        const path = (pts, ww, dd, k) => { for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; RB.beam([x0, h(x0, z0) - dd * 0.5, z0], [x1, h(x1, z1) - dd * 0.5, z1], ww, k, dd); } };
        const seg = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
        const ribC = [glulam, glulam.clone().multiplyScalar(0.94)], ends = {};
        const rib = (P0, P1, fam, k) => {
          const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]), n = Math.ceil(L / 0.5), at = t => [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t];
          const is = t => VP.region(...at(t))[0] === fam, cut = (a, b) => { const ia = is(a); for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (is(m) === ia) a = m; else b = m; } return (a + b) / 2; };
          const mark = t => { const q = at(t), e = 0.3 / L, key = [VP.region(...at(Math.max(0, t - e))), VP.region(...at(Math.min(1, t + e)))].sort().join('|') + Math.sign(q[0]) + (q[1] < zc ? 'n' : 's'); (ends[key] = ends[key] || []).push(q); };
          let prev = is(0), start = 0;
          for (let i = 1; i <= n; i++) {
            const cur = is(i / n); if (cur === prev) continue;
            const tb = cut((i - 1) / n, i / n); mark(tb);
            if (cur) start = tb; else if (tb - start > 0.6 / L) path(seg(at(start), at(tb), Math.max(2, Math.ceil((tb - start) * L))), w, d, k);
            prev = cur;
          }
          if (prev && 1 - start > 0.6 / L) path(seg(at(start), at(1), Math.max(2, Math.ceil((1 - start) * L))), w, d, k);
        };
        for (let i = 0; ; i++) { const x = (i + 0.5) * sx; if (x > EX - 0.6) break; for (const s of [-1, 1]) rib([s * x, -EZn + 0.3], [s * x, EZs - 0.3], 'T', ribC[i % 2]); }
        for (let j = 0; ; j++) { const o = (j + 0.5) * sx; if (o > EZ - 0.6) break; for (const s of [-1, 1]) { const z = zc + s * o; if (z > -EZn + 0.3 && z < EZs - 0.3) rib([-EX + 0.3, z], [EX - 0.3, z], 'L', ribC[j % 2]); } }
        // Costole: i punti finali di ogni confine, ordinati per distanza dal centro, uniti in una linea continua.
        const edge = glulam.clone().multiplyScalar(0.9), groin = glulam.clone().multiplyScalar(1.06);
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const key = 'LhE|ThS' + cx + (cz < 0 ? 'n' : 's'); (ends[key] = ends[key] || []).push([cx * (EX - 0.3), cz < 0 ? -EZn + 0.3 : EZs - 0.3]); }
        for (const pts of Object.values(ends)) {
          pts.sort((a, b) => Math.hypot(a[0], a[1] - zc) - Math.hypot(b[0], b[1] - zc));
          for (let i = 0; i < pts.length - 1; i++) if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) < sx * 3) path(seg(pts[i], pts[i + 1], 3), w * 1.9, d * 1.35, groin);
        }
        // Trave di bordo lungo le pareti, dove le falde poggiano sopra le tribune.
        for (const s of [-1, 1]) path(seg([s * (EX - 0.4), -EZn + 0.4], [s * (EX - 0.4), EZs - 0.4], 40), w * 1.6, d * 1.1, edge);
        for (const z of [-EZn + 0.4, EZs - 0.4]) path(seg([-EX + 0.4, z], [EX - 0.4, z], 52), w * 1.6, d * 1.1, edge);
        this.vaultRibs = RB.mesh({ emissive: glulam.clone().multiplyScalar(V.ribGlow ?? 0.32) });
      } else {
        // Nervature in legno lamellare: archi trasversali (da tribuna a tribuna) più grossi, longitudinali più sottili.
        const K = 24, big = V.rib ?? 0.42, bigH = 0.8;
        for (let x = -EX + 2; x <= EX - 2; x += V.ribStep ?? 4.5) for (let k = 0; k < K; k++) { const z0 = -EZn + 2 * EZ * k / K, z1 = -EZn + 2 * EZ * (k + 1) / K; M.beam([x, h(x, z0) - bigH * 0.55, z0], [x, h(x, z1) - bigH * 0.55, z1], big, glulam, bigH); }
        for (let z = -EZn + 2; z <= EZs - 2; z += V.ribStep ?? 4.5) for (let k = 0; k < K; k++) { const x0 = -EX + 2 * EX * k / K, x1 = -EX + 2 * EX * (k + 1) / K; M.beam([x0, h(x0, z) - 0.4, z], [x1, h(x1, z) - 0.4, z], 0.42, glulam.clone().multiplyScalar(0.9), 0.8); }
      }
      const K = this.ceilAt ? 40 : 24;
      if (A.extras?.glassGables) {
        const G = new Mesher(), gc = color('#a9cbe2');
        for (let k = 0; k < K; k++) {
          const z0 = -EZn + 2 * EZ * k / K, z1 = -EZn + 2 * EZ * (k + 1) / K, x0 = -EX + 2 * EX * k / K, x1 = -EX + 2 * EX * (k + 1) / K;
          const hg = (x, z) => Math.max(Y, h(x, z));
          for (const x of [-EX, EX]) G.quad([x, Y, z0], [x, Y, z1], [x, hg(x, z1), z1], [x, hg(x, z0), z0], gc);
          if (A.extras.glassGables !== 'ends') for (const z of [-EZn, EZs]) G.quad([x0, Y, z], [x1, Y, z], [x1, hg(x1, z), z], [x0, hg(x0, z), z], gc);
        }
        gableMesh = G.mesh({ transparent: true, opacity: 0.5, emissive: color('#7d9fbe'), emissiveIntensity: 0.6 });
      }
      const top = this.ceilAt ? this.ceilAt(0, zc) - Y : rise;
      lightY = Y + top * 0.45 - 1; this.archRise = top;
    } else if (curved) {
      // Archi trasversali: la volta attraversa la pista da un lato lungo all'altro e si ripete da una testata all'altra.
      const rise = R.type === 'wood-gothic' ? EZ * 0.62 : R.type === 'vault' ? EZ * (R.rise ?? 0.2) : EZ * 0.3;
      const f = R.type === 'wood-gothic' ? u => Math.sqrt(Math.max(0, 1 - Math.abs(u))) : u => Math.sqrt(Math.max(0, 1 - u * u));
      const N = 28, prof = Array.from({ length: N + 1 }, (_, i) => { const z = -EZn + (EZn + EZs) * i / N; return [z, Y + rise * f((z - zc) / EZ)]; });
      const plank = [roofC.clone().multiplyScalar(1.05), roofC.clone().multiplyScalar(0.93)];
      for (let i = 0; i < N; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; M.quad([-EX, y0, z0], [EX, y0, z0], [EX, y1, z1], [-EX, y1, z1], plank[i % 2]); }
      const rib = R.type === 'vault' ? steel : (R.ribColor ? color(R.ribColor) : roofC.clone().lerp(color('#d29a5c'), 0.45)), step = R.type === 'vault' ? 7 : 6, thick = R.type === 'vault' ? 0.45 : 0.5;
      for (let x = -EX + 2.5; x <= EX - 2; x += step) for (let i = 0; i < N; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; M.beam([x, y0 - 0.6, z0], [x, y1 - 0.6, z1], thick, rib, R.type === 'vault' ? 1.3 : 1.1); }
      for (let i = 0; i <= N; i += 4) M.beam([-EX, prof[i][1] - 1.1, prof[i][0]], [EX, prof[i][1] - 1.1, prof[i][0]], 0.25, rib, 0.35);
      if (R.skylight) { const sk = color('#dfe9f2'); for (const i of [Math.floor(N / 2) - 1, Math.floor(N / 2)]) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; glows.quad([-EX + 3, y0 - 0.05, z0], [EX - 3, y0 - 0.05, z0], [EX - 3, y1 - 0.05, z1], [-EX + 3, y1 - 0.05, z1], sk); } }
      const glass = !!A.extras?.glassGables, gable = glass ? new Mesher() : M, gc = glass ? color('#9ec4dd') : color(A.style.wall);
      for (const x of [-EX, EX]) for (let i = 0; i < N; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; gable.quad([x, Y, z0], [x, Y, z1], [x, y1, z1], [x, y0, z0], gc); }
      if (glass) gableMesh = gable.mesh({ transparent: true, opacity: 0.55, emissive: color('#6a8fb0'), emissiveIntensity: 0.6 });
      lightY = Y + rise * (R.type === 'vault' ? 0.7 : 0.55) - 1;
      this.archRise = rise;
    }
    const cw = (A.cube?.w ?? 0) / 2 + 1;
    for (let x = -27; x <= 27; x += 6) for (const z of [-10, -4, 4, 10]) if (Math.abs(x) > cw || Math.abs(z) > cw) lights.box(x, lightY, z, 1.3, 0.16, 0.55, lightC);
    this.ceiling = new THREE.Group(); this.root.add(this.ceiling);
    this.ceiling.add(M.mesh()); if (gableMesh) this.ceiling.add(gableMesh); if (this.vaultRibs) this.ceiling.add(this.vaultRibs);
    const lm = lights.mesh(); lm.material = new THREE.MeshBasicMaterial({ color: '#fffdf3' }); this.ceiling.add(lm);
    // Doghe chiare illuminate dai fari (si vedono dal basso anche se la luce generale arriva dall'alto).
    if (!bright.empty) this.ceiling.add(bright.mesh({ emissive: roofC.clone().multiplyScalar(0.45) }));
    if (!glows.empty) { const gm = glows.mesh(); gm.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }); this.ceiling.add(gm); }
    this.lightY = lightY;
  }

  buildDecor() {
    const A = this.A, { sections } = this.layout, home = A.team;
    const led = ledTexture(home, A.name), ledMat = new THREE.MeshBasicMaterial({ map: led, side: THREE.DoubleSide });
    this.leds.push({ tex: led, speed: 0.035 });
    const suitesMat = new THREE.MeshBasicMaterial({ map: suitesTexture(), side: THREE.DoubleSide });
    const vipMat = new THREE.MeshBasicMaterial({ map: vipGlassTexture(), side: THREE.DoubleSide });
    const teamMat = new THREE.MeshLambertMaterial({ color: TEAMS[home].primary, side: THREE.DoubleSide });
    for (const S of sections) {
      const P = S.profile;
      for (const b of P.bands) {
        const l = readable(sectionLine(S, b.d - 0.06));
        // 'wall' (Berna): muro alto e scuro tra i due anelli, con una striscia LED larga in cima e un filo bianco sotto.
        if (b.kind === 'wall') {
          this.root.add(new THREE.Mesh(stripGeometry(l, b.y1 - 1.7, b.y1 - 0.2, { uScale: 22 }), ledMat));
          this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, b.d - 0.07)), b.y1 - 2.0, b.y1 - 1.85, { uScale: 22 }), new THREE.MeshBasicMaterial({ color: '#f4f4f2', side: THREE.DoubleSide })));
        } else if (b.kind === 'led') this.root.add(new THREE.Mesh(stripGeometry(l, Math.max(b.y0 + 0.15, b.y1 - 1.05), b.y1 - 0.12, { uScale: 22 }), ledMat));
        else if (b.kind === 'suites') this.root.add(new THREE.Mesh(stripGeometry(l, b.y0 + 0.45, b.y1 - 0.4, { uScale: 6 }), suitesMat));
        // 'vip': logge vetrate nella fascia tra i due anelli (Davos), con un filo chiaro sopra e sotto.
        else if (b.kind === 'vip') {
          this.root.add(new THREE.Mesh(stripGeometry(l, b.y0 + 0.25, b.y1 - 0.2, { uScale: 4.4 }), vipMat));
          for (const [a0, a1] of [[b.y0 + 0.1, b.y0 + 0.25], [b.y1 - 0.2, b.y1 - 0.08]]) this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, b.d - 0.07)), a0, a1, { uScale: 10 }), new THREE.MeshBasicMaterial({ color: '#dfe3e7', side: THREE.DoubleSide })));
        }
        // 'white' (Friburgo): fascia bianca luminosa sul fronte dell'anello alto, con un filo rosso sotto (style.detail).
        else if (b.kind === 'white') {
          this.root.add(new THREE.Mesh(stripGeometry(l, b.y1 - 0.75, b.y1 - 0.15, { uScale: 10 }), new THREE.MeshBasicMaterial({ color: '#f3f5f7', side: THREE.DoubleSide })));
          if (A.style.detail) this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, b.d - 0.07)), b.y1 - 0.95, b.y1 - 0.8, { uScale: 10 }), new THREE.MeshBasicMaterial({ color: A.style.detail, side: THREE.DoubleSide })));
        }
        else if (b.kind === 'named' && A.standNames?.[S.key]) {
          const sign = readable(sectionLine(S, b.d - 0.08, 0.35, 0.65));
          const width = Math.hypot(sign.at(-1)[0] - sign[0][0], sign.at(-1)[1] - sign[0][1]);
          const map = bannerTexture(home, A.standNames[S.key], '');
          this.root.add(new THREE.Mesh(stripGeometry(sign, b.y0 + 0.12, b.y1 - 0.12, { uScale: width }), new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide })));
        }
        else if (b.kind === 'team') this.root.add(new THREE.Mesh(stripGeometry(l, b.y0 + 0.3, b.y1 - 0.3, { uScale: 10 }), teamMat));
      }
      // Niente LED in cima alla testata del muro delle nicchie e ai tratti alti che la affiancano (Zurigo).
      const nicheEnd = A.extras?.nicheWall ? A.extras.nicheWall.side || 'east' : null, noRim = S.hang || (A.led.rimSkip || []).includes(S.key) || (nicheEnd && (S.key === nicheEnd || (S.kind === 'arc' && S.wrap && S.end === nicheEnd)));
      if (A.led.rim && !noRim) this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, P.depth - 0.06)), P.top + 0.25, P.top + 1.15, { uScale: 22 }), ledMat));
    }
    // Striscione della curva di casa sul muretto davanti alla prima fila.
    const H = A.home, curve = sectionByKey(this.layout, H.side), from = H.from ?? 0, to = H.to ?? 1;
    if ((H.tier ?? 0) === 0) {
      const l = readable(sectionLine(curve, -0.06, from + 0.03, to - 0.03)), len = Math.hypot(l.at(-1)[0] - l[0][0], l.at(-1)[1] - l[0][1]);
      // home.wall (Kloten): al posto dello striscione, il muro bianco alto davanti a tutta la curva (angoli compresi, se la
      // curva li avvolge) con la scritta a fumetto e la fascia della curva in cima.
      const y1 = Math.max(1.2, curve.profile.base - 0.1);
      if (H.wall) {
        const arcs = this.layout.sections.filter(c => c.kind === 'arc' && c.wrap && c.end === H.side && !c.hang), sideOf = c => c.side;
        const startSide = H.side === 'west' || H.side === 'east' ? 'north' : 'west', A0 = arcs.find(c => sideOf(c) === startSide), A1 = arcs.find(c => sideOf(c) !== startSide);
        const pts = [...(A0 ? sectionLine(A0, -0.06).reverse() : []), ...sectionLine(curve, -0.06), ...(A1 ? sectionLine(A1, -0.06) : [])].filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.05);
        const wl = readable(pts); let L = 0; for (let i = 1; i < wl.length; i++) L += Math.hypot(wl[i][0] - wl[i - 1][0], wl[i][1] - wl[i - 1][1]);
        this.root.add(new THREE.Mesh(stripGeometry(wl, 0.05, y1, { uScale: L }), new THREE.MeshLambertMaterial({ map: sloganWallTexture(H.wall[0], H.wall[1], L / (y1 - 0.05), H.wall[2]), side: THREE.DoubleSide })));
      } else this.root.add(new THREE.Mesh(stripGeometry(l, 0.35, y1, { uScale: len }), new THREE.MeshLambertMaterial({ map: bannerTexture(home, TEAMS[home].curve, TEAMS[home].chant), side: THREE.DoubleSide })));
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
      const [c, ctx] = canvas(768, Math.round(768 * h / w)); this.cubeCanvas = [c, ctx]; this.cubeTex = texture(c);
      const scr = new THREE.MeshBasicMaterial({ map: this.cubeTex });
      const ringTex = ledTexture(home, A.name); this.leds.push({ tex: ringTex, speed: -0.05 });
      if (A.cube.round) {
        // Tabellone rotondo (Rapperswil): tamburo con schermo continuo e anello LED sotto.
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 40), lambert('#14161a')));
        this.cubeTex.wrapS = THREE.RepeatWrapping; this.cubeTex.repeat.x = 3;
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 + 0.04, w / 2 + 0.04, h * 0.86, 48, 1, true), scr); g.add(drum);
        const led = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 + 0.06, w / 2 + 0.06, 0.8, 48, 1, true), new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide })); led.position.y = -h / 2 - 0.45; g.add(led);
      } else {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lambert('#14161a')));
        for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), scr); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * (w / 2 + 0.03), 0, Math.cos(a) * (w / 2 + 0.03)); p.rotation.y = a; g.add(p); }
        g.add(new THREE.Mesh(stripGeometry(roundedRect(w / 2 + 0.05, w / 2 + 0.05, 0.01, 1), -h / 2 - 0.9, -h / 2 - 0.05, { closed: true, uScale: w * 2 }), new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide })));
      }
      const cable = new Mesher(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cable.beam([sx * w * 0.4, h / 2, sz * w * 0.4], [sx * w * 0.2, topY - cy, sz * w * 0.2], 0.04, color('#222'));
      g.add(cable.mesh());
      this.cube = g; this.root.add(g);
    }
    const X = A.extras || {};
    if (X.cornerLandings || X.upperScreenHeight) {
      const { ex, zn, zs, profiles } = this.layout;
      const cement = color('#85898c'), edge = color('#c4c1ba'), metal = color('#505760');
      const addScreen = (structure, screenWidth, base, back, ventCount) => {
        const screenHeight = this.roofY - base;
        const screenY = base + screenHeight / 2;
        structure.box(0, screenY, back, screenWidth, screenHeight, 0.18, color('#323940'));
        const divisions = Math.ceil(screenWidth / 0.7);
        for (let bar = 0; bar <= divisions; bar++) {
          const x = (screenWidth - 0.12) * (bar / divisions - 0.5);
          structure.box(x, screenY, back + 0.20, 0.12, screenHeight, 0.16, color('#77818a'));
        }
        for (const fraction of [0.08, 0.52, 0.96]) {
          structure.box(0, base + fraction * screenHeight, back + 0.34, screenWidth, 0.14, 0.12, metal);
        }
        const ventY = base + screenHeight * 0.69;
        for (let i = 0; i < ventCount; i++) {
          const x = screenWidth * ((i + 0.5) / ventCount - 0.5);
          structure.box(x, ventY, back + 0.45, 3.4, 1.38, 0.2, edge);
          structure.box(x, ventY, back + 0.58, 3.16, 1.14, 0.08, color('#252a2d'));
          for (let slat = -2; slat <= 2; slat++) {
            structure.box(x, ventY + slat * 0.2, back + 0.67, 3.04, 0.09, 0.13, metal);
          }
        }
      };
      for (const side of (X.upperScreenHeight ? ['west', 'north', 'east', 'south'] : ['west', 'north', 'east'])) {
        const stand = sectionByKey(this.layout, side), profile = stand.profile;
        const wall = new Mesher();
        addScreen(wall, stand.len, X.upperScreenHeight ? Math.max(profile.top, this.roofY - X.upperScreenHeight) : profile.top, 0, Math.max(2, Math.round(stand.len / 11)));
        const mesh = wall.mesh();
        const depth = profile.depth - 0.16;
        mesh.position.set(stand.ox + stand.nx * depth, 0, stand.oz + stand.nz * depth);
        mesh.rotation.y = Math.atan2(-stand.nx, -stand.nz);
        this.root.add(mesh);
      }
      if (X.cornerLandings) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const end = profiles[sx < 0 ? 'west' : 'east'];
        const balcony = end.rows.find(row => row.tier === 1).h;
        const reach = Math.min(end.depth, profiles[sz < 0 ? 'north' : 'south'].depth) * 0.8;
        const width = reach * Math.SQRT2, opening = 2.4, jamb = (width - opening) / 2;
        const corner = new THREE.Group(), structure = new Mesher();
        corner.position.set(sx * (ex + reach / 2), 0, sz * ((sz < 0 ? zn : zs) + reach / 2));
        corner.rotation.y = Math.atan2(-sx, -sz);
        for (const side of [-1, 1]) {
          structure.box(side * (opening + jamb) / 2, balcony / 2, -0.12, jamb, balcony, 0.24, cement);
          structure.beam([side, 1.1, -0.1], [side, 2.2, -2.2], 0.07, metal);
        }
        structure.box(0, (balcony + 3.6) / 2, -0.12, opening, balcony - 3.6, 0.24, cement);
        structure.box(0, 2, -2.7, opening, 4, 0.15, color('#282c31'));
        for (let step = 0; step < 7; step++) {
          const h = (step + 1) * 0.17;
          structure.box(0, h / 2, -0.2 - step * 0.35, opening, h, 0.35, cement);
        }
        structure.box(0, balcony - 0.2, -0.9, width, 0.4, 1.8, edge);
        structure.beam([-width / 2, balcony + 1, 0], [width / 2, balcony + 1, 0], 0.08, metal);
        for (let post = 0; post <= 8; post++) structure.box(width * (post / 8 - 0.5), balcony + 0.5, 0, 0.065, 1, 0.065, metal);
        // Chiusura arretrata dietro il pianerottolo, fino alla linea del tetto.
        const screenWidth = width + 2 * 1.92 + 0.4;
        addScreen(structure, screenWidth, balcony, -1.92, 2);
        corner.add(structure.mesh());
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.13, 0.12), new THREE.MeshBasicMaterial({ color: '#ffdd9b' }));
        lamp.position.set(0, 3.72, 0.07);
        corner.add(lamp);
        for (const side of [-1, 1]) {
          const wallLight = lamp.clone();
          wallLight.position.set(side * screenWidth * 0.34, balcony + 1.85, -1.4);
          corner.add(wallLight);
        }
        this.root.add(corner);
      }
    }
    if (X.suiteBays) {
      const stand = sectionByKey(this.layout, 'south'), profile = stand.profile;
      const lastRow = profile.rows.at(-1);
      const standBack = stand.oz + lastRow.d + lastRow.depth;
      const width = stand.len / X.suiteBays, shell = new Mesher();
      const concrete = color('#85898c'), steel = color('#393e44');
      const glazing = new THREE.MeshBasicMaterial({ map: vipGlassTexture(), side: THREE.DoubleSide });
      for (let level = 0; level < (X.suiteLevels ?? 1); level++) {
        const z = standBack + 0.05 + level * 1.2, y = lastRow.h + 2.25 + level * 3.15;
        for (let i = 0; i < X.suiteBays; i++) {
          const left = stand.ox - stand.len / 2 + i * width + 0.56, right = left + width - 1.12;
          const x = (left + right) / 2;
          shell.box(x, y, z + 0.65, right - left, 0.38, 2.5, concrete);
          shell.box(x, y + 2.65, z + 0.65, right - left, 0.33, 2.5, steel);
          for (const edge of [left, right]) shell.box(edge, y + 1.3, z + 0.65, 0.3, 2.6, 2.4, concrete);
          const front = stripGeometry([[right, z - 0.4], [left, z - 0.4]], y + 0.2, y + 2.48, { uScale: right - left });
          this.root.add(new THREE.Mesh(front, glazing));
          if (i) shell.box(left - 0.56, (y + 2.9 + profile.top - 1) / 2, z + 0.4, 0.84, y + 3.9 - profile.top, 1.9, concrete);
        }
      }
      this.root.add(shell.mesh());
    }
    // Logge VIP (Zugo): vetrata continua sul muro di fondo dei rettilinei scelti (sides), sopra l'ultima fila e senza
    // pubblico sopra; sulle curve e negli angoli la stessa fascia prosegue come balconata: soletta sporgente, parapetto di
    // vetro con corrimano e montanti, muro scuro con porte illuminate e lampade, qualche spettatore appoggiato al parapetto.
    // Bordo superiore unico tutto attorno (sopra l'anello più alto), così la fascia gira senza salti.
    if (X.vipGlass) {
      const VG = X.vipGlass, sides = VG.sides || [VG.side || 'south'], rand = seeded(A.team + 'vip');
      const secs = sections.filter(S => !S.hang), yTop = Math.max(...secs.map(S => S.profile.top));
      const y0 = yTop + (VG.lift ?? 2.1), y1 = Math.min(y0 + (VG.h ?? 3.2), this.roofY - 0.5);
      const glassMat = new THREE.MeshBasicMaterial({ map: vipGlassTexture(), side: THREE.DoubleSide }), fr = new THREE.MeshBasicMaterial({ color: '#dfe3e7', side: THREE.DoubleSide });
      const [bc, bg] = canvas(256, 64); bg.fillStyle = '#23272d'; bg.fillRect(0, 0, 256, 64);
      for (let x = 20; x < 256; x += 64) { bg.fillStyle = '#e8c690'; bg.fillRect(x, 22, 16, 42); bg.fillStyle = '#3a3f47'; bg.fillRect(x + 36, 14, 14, 10); }
      bg.fillStyle = TEAMS[home].primary; bg.fillRect(0, 6, 256, 3);
      const backTex = texture(bc, true), backMat = new THREE.MeshBasicMaterial({ map: backTex, side: THREE.DoubleSide });
      const railMat = new THREE.MeshLambertMaterial({ color: '#bcd6ea', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      // behind (Bienne): logge e balconata non sopra ma dietro l'ultima fila, sul corridoio in fondo al profilo (tier
      // con 0 file): ogni lato alla sua quota; sulla balconata il fondo è una vetrata sul cielo notturno.
      const behind = !!VG.behind;
      const [kc, kg] = canvas(256, 128), sk = kg.createLinearGradient(0, 0, 0, 128); sk.addColorStop(0, '#02040b'); sk.addColorStop(0.75, '#081129'); sk.addColorStop(1, '#122046');
      kg.fillStyle = sk; kg.fillRect(0, 0, 256, 128); const rs = seeded('sky-window');
      for (let i = 0; i < 40; i++) { kg.fillStyle = `rgba(255,255,255,${0.4 + rs() * 0.5})`; kg.fillRect(rs() * 256, rs() * 80, 1.5, 1.5); }
      for (let x = 0; x < 256; x += 3) if (rs() < 0.5) { kg.fillStyle = rs() < 0.8 ? 'rgba(255,205,140,.8)' : 'rgba(200,220,255,.7)'; kg.fillRect(x, 112 + rs() * 12, 1.5, 1.5); }
      kg.fillStyle = '#c9ced4'; for (let x = 0; x < 256; x += 64) kg.fillRect(x, 0, 3, 128); kg.fillRect(0, 0, 256, 3); kg.fillRect(0, 62, 256, 2); kg.fillRect(0, 124, 256, 4);
      const skyMat = new THREE.MeshBasicMaterial({ map: texture(kc, true), side: THREE.DoubleSide });
      const B = new Mesher(), LP = new Mesher(), slab = color('#d9dde2'), post = color('#c9ced4'), rail = color('#eef1f4'), lampC = color('#fff4dc');
      const shirts = ['#0d5fa4', '#ffffff', '#1d2733', '#7a8796', '#0a4c86', '#c9ccd1', '#2f3a48'], skin = ['#e8c4a4', '#d7a985', '#b98563', '#f0d2b8'];
      for (const S of secs) {
        const P = S.profile, Y0 = behind ? P.top : y0, Y1 = behind ? Math.min(P.top + (VG.h ?? 3.2), this.roofY - 0.5) : y1;
        if (VG.balconies === false && !(S.kind === 'straight' && sides.includes(S.key))) continue; // solo le logge, niente balconata
        const isGlass = S.kind === 'straight' && sides.includes(S.key);
        if (isGlass && !VG.vipBalcony) {
          // Se tra l'ultima fila e la fascia comune c'è spazio, la vetrata ha due piani: il marcapiano bianco (con il filo del
          // colore di casa) sta alla quota del pavimento della balconata, così la linea gira attorno alla sala.
          // walk (con behind): la vetrata sta a walk metri dall'inizio del corridoio e dietro c'è il corpo delle logge, chiuso in
          // alto da una copertura scura fino al muro di fondo (così la sala mantiene la sua profondità).
          const gd = behind && VG.walk != null && P.floors.length ? P.floors.at(-1).d0 + VG.walk : P.depth - 0.08;
          const g0 = P.top + (VG.low ?? 0.5), gl = readable(sectionLine(S, gd)), lf = readable(sectionLine(S, gd - 0.02));
          if (gd < P.depth - 0.5) { const la = sectionLine(S, gd), lb = sectionLine(S, P.depth - 0.05), CV = new Mesher(), kc = color('#3a3d42');
            for (let i = 0; i < la.length - 1; i++) CV.quad([la[i][0], Y1 + 0.25, la[i][1]], [la[i + 1][0], Y1 + 0.25, la[i + 1][1]], [lb[i + 1][0], Y1 + 0.25, lb[i + 1][1]], [lb[i][0], Y1 + 0.25, lb[i][1]], kc);
            for (const i of [0, la.length - 1]) CV.quad([la[i][0], P.top, la[i][1]], [lb[i][0], P.top, lb[i][1]], [lb[i][0], Y1 + 0.25, lb[i][1]], [la[i][0], Y1 + 0.25, la[i][1]], kc);
            this.root.add(CV.mesh()); }
          const two = !behind && y0 - 0.35 - g0 > 1.2, pane = VG.pane ?? 4.4;
          if (two) {
            this.root.add(new THREE.Mesh(stripGeometry(gl, g0, y0 - 0.35, { uScale: pane }), glassMat), new THREE.Mesh(stripGeometry(gl, y0, y1, { uScale: pane }), glassMat));
            this.root.add(new THREE.Mesh(stripGeometry(lf, y0 - 0.35, y0, { uScale: 10 }), fr));
            this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, P.depth - 0.12)), y0 - 0.22, y0 - 0.14, { uScale: 10 }), new THREE.MeshBasicMaterial({ color: TEAMS[home].primary, side: THREE.DoubleSide })));
          } else if ((VG.storeys ?? 1) > 1) {
            // Più piani di logge (Zurigo: logge e piano media): vetrate uguali separate da marcapiani bianchi.
            const ns = VG.storeys, hs = (Y1 - g0) / ns;
            for (let k = 0; k < ns; k++) {
              this.root.add(new THREE.Mesh(stripGeometry(gl, g0 + k * hs + (k ? 0.35 : 0), g0 + (k + 1) * hs, { uScale: pane }), glassMat));
              if (k) this.root.add(new THREE.Mesh(stripGeometry(lf, g0 + k * hs, g0 + k * hs + 0.35, { uScale: 10 }), fr));
            }
          } else this.root.add(new THREE.Mesh(stripGeometry(gl, g0, Y1, { uScale: pane }), glassMat));
          for (const [a, b] of [[g0 - 0.3, g0], [Y1, Y1 + 0.25]]) this.root.add(new THREE.Mesh(stripGeometry(lf, a, b, { uScale: 10 }), fr));
          continue;
        }
        const bd = behind ? P.depth - (P.floors.at(-1)?.d0 ?? P.depth - 1.4) : VG.balcony ?? 1.4, back = sectionLine(S, P.depth - 0.05), edge = sectionLine(S, P.depth - bd), edge2 = sectionLine(S, P.depth - bd - 0.03);
        // Muro di fondo della balconata e soletta (piano, intradosso e bordo bianco con il filo del colore di casa).
        // vipBalcony (Zurigo): sul lato delle logge la balconata ha come fondo la vetrata delle logge VIP.
        this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, P.depth - 0.07)), Y0, Y1, { uScale: behind ? 5 : isGlass ? VG.pane ?? 4.4 : 8 }), behind ? skyMat : isGlass ? glassMat : backMat));
        if (isGlass) this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, P.depth - 0.09)), Y1, Y1 + 0.25, { uScale: 10 }), fr));
        if (behind) this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, P.depth - 0.09)), Y1, Y1 + 0.3, { uScale: 10 }), fr));
        if (!behind) for (let i = 0; i < back.length - 1; i++) {
          for (const y of [y0, y0 - 0.35]) B.quad([back[i][0], y, back[i][1]], [back[i + 1][0], y, back[i + 1][1]], [edge[i + 1][0], y, edge[i + 1][1]], [edge[i][0], y, edge[i][1]], slab);
          B.quad([edge[i][0], y0 - 0.35, edge[i][1]], [edge[i + 1][0], y0 - 0.35, edge[i + 1][1]], [edge[i + 1][0], y0, edge[i + 1][1]], [edge[i][0], y0, edge[i][1]], slab);
          B.quad([edge2[i][0], y0 - 0.22, edge2[i][1]], [edge2[i + 1][0], y0 - 0.22, edge2[i + 1][1]], [edge2[i + 1][0], y0 - 0.14, edge2[i + 1][1]], [edge2[i][0], y0 - 0.14, edge2[i][1]], color(TEAMS[home].primary));
        }
        // Parapetto di vetro, corrimano, montanti; lampade sul muro; spettatori appoggiati al parapetto.
        const rl = sectionLine(S, P.depth - bd + 0.05);
        this.root.add(new THREE.Mesh(stripGeometry(rl, Y0, Y0 + 1.0, { uScale: 4 }), railMat));
        if (!behind) for (let i = 0; i < rl.length - 1; i++) B.beam([rl[i][0], Y0 + 1.05, rl[i][1]], [rl[i + 1][0], Y0 + 1.05, rl[i + 1][1]], 0.08, rail);
        for (const q of samplePolyline(rl, 2.4, rand, 0)) B.box(q.x, Y0 + 0.5, q.z, 0.07, 0.98, 0.07, post);
        if (!behind && !isGlass) for (const q of samplePolyline(back, 6.5, rand, 0.4)) LP.box(q.x - q.nx * 0.08, Y1 - 0.6, q.z - q.nz * 0.08, 0.5, 0.18, 0.5, lampC);
        for (const q of samplePolyline(sectionLine(S, P.depth - bd + 0.45), 1.1, rand, 0.6)) {
          if (rand() > (VG.people ?? 0.35)) continue;
          const ry = Math.atan2(q.nx, q.nz), hgt = 1.0 + rand() * 0.15, k = color(shirts[(rand() * shirts.length) | 0]);
          B.box(q.x, Y0 + 0.45, q.z, 0.36, 0.9, 0.24, color('#2a2d33'), ry); B.box(q.x, Y0 + 0.9 + hgt / 2 - 0.45, q.z, 0.46, hgt * 0.62, 0.28, k, ry);
          B.box(q.x, Y0 + 1.6 + (hgt - 1) * 0.6, q.z, 0.24, 0.26, 0.24, color(skin[(rand() * skin.length) | 0]), ry);
        }
      }
      this.root.add(B.mesh());
      if (!LP.empty) { const lm = LP.mesh(); lm.material = new THREE.MeshBasicMaterial({ vertexColors: true }); this.root.add(lm); }
    }
    // Torri d'angolo (Porrentruy): con gli angoli aperti, ogni quadrato vuoto tra testata e lato lungo è una torre di
    // cemento fino al tetto, con le aperture sovrapposte rivolte verso la pista sulle due facce interne.
    if (X.cornerTowers && (!A.corners || X.cornerTowers.end)) {
      const CT = X.cornerTowers, { ex, zn, zs, profiles: PR } = this.layout, top = CT.height ?? this.roofY - 0.2, mat = new THREE.MeshLambertMaterial({ map: cornerTowerTexture(CT.levels ?? 3), side: THREE.DoubleSide });
      const conc = new THREE.MeshLambertMaterial({ color: '#a9a9a4', side: THREE.DoubleSide }), o = 0.12;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (CT.end && CT.end !== (sx < 0 ? 'west' : 'east')) continue;
        const De = PR[sx < 0 ? 'west' : 'east'].depth, Ds = PR[sz < 0 ? 'north' : 'south'].depth, zf = sz < 0 ? zn : zs;
        const xi = sx * (ex + (CT.width ? Math.max(o, De - CT.width) : o)), xo = sx * (ex + De), zi = sz * (zf + (CT.width ? Math.max(o, Ds - CT.width) : o)), zo = sz * (zf + Ds);
        this.root.add(new THREE.Mesh(stripGeometry([[xi, zo], [xi, zi]], 0, top, { uScale: Math.abs(zo - zi) }), mat));
        this.root.add(new THREE.Mesh(stripGeometry([[xi, zi], [xo, zi]], 0, top, { uScale: Math.abs(xo - xi) }), mat));
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(xo - xi), Math.abs(zo - zi)), conc); cap.rotation.x = -Math.PI / 2; cap.position.set((xi + xo) / 2, top, (zi + zo) / 2); this.root.add(cap);
      }
    }
    // Logge VIP dentro la tribuna: vetrata calda sul fronte della prima fila della fascia, montanti e architrave rosso
    // scuro, soletta sopra fino alla fila successiva.
    if (A.vipBoxes) {
      const V = A.vipBoxes, S = sectionByKey(this.layout, V.side), rows = S.profile.rows.slice(V.rowFrom, V.rowFrom + V.rows), R0 = rows[0], RL = rows.at(-1), t0 = V.from ?? 0.1, t1 = V.to ?? 0.9, n = V.n ?? 8;
      const fl = readable(sectionLine(S, R0.d - 0.03, t0, t1)); let Lf = 0; for (let i = 1; i < fl.length; i++) Lf += Math.hypot(fl[i][0] - fl[i - 1][0], fl[i][1] - fl[i - 1][1]);
      this.root.add(new THREE.Mesh(stripGeometry(fl, R0.below, RL.h + 0.1, { uScale: Lf / n }), new THREE.MeshBasicMaterial({ map: vipGlassTexture(), side: THREE.DoubleSide })));
      const VM = new Mesher(), fr = color(V.frame || '#7a1f24'), slab = color('#3a3c40');
      this.root.add(new THREE.Mesh(stripGeometry(readable(sectionLine(S, R0.d - 0.06, t0, t1)), RL.h - 0.25, RL.h + 0.12, { uScale: 10 }), new THREE.MeshLambertMaterial({ color: fr, side: THREE.DoubleSide })));
      for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n, p0 = sectionPoint(S, t, R0.d - 0.06); VM.box(p0.x, (R0.below + RL.h) / 2, p0.z, 0.3, RL.h - R0.below + 0.2, 0.3, fr); }
      const la = sectionLine(S, R0.d - 0.03, t0, t1), lb = sectionLine(S, RL.d + RL.depth, t0, t1);
      for (let i = 0; i < la.length - 1; i++) VM.quad([la[i][0], RL.h + 0.12, la[i][1]], [la[i + 1][0], RL.h + 0.12, la[i + 1][1]], [lb[i + 1][0], RL.h + 0.12, lb[i + 1][1]], [lb[i][0], RL.h + 0.12, lb[i][1]], slab);
      for (const t of [t0, t1]) { const pa = sectionPoint(S, t, R0.d - 0.03), pb = sectionPoint(S, t, RL.d + RL.depth); VM.quad([pa.x, R0.below, pa.z], [pb.x, R0.below, pb.z], [pb.x, RL.h + 0.12, pb.z], [pa.x, RL.h + 0.12, pa.z], color('#c9cbcd')); }
      this.root.add(VM.mesh());
    }
    // Anello sospeso sotto le travi (Friburgo): fascia scura con il bordo inferiore luminoso.
    // Cabine vetrate negli angoli (Friburgo): sul corridoio tra i due anelli dei cunei, vetro azzurrino con il telaio chiaro.
    if (X.cornerBoxes) for (const S of sections) {
      if (S.kind !== 'wedge' || !S.profile.floors.length) continue;
      const f = S.profile.floors[0], p = sectionPoint(S, 0.5, (f.d0 + f.d1) / 2), w = X.cornerBoxes.w ?? 7, h = X.cornerBoxes.h ?? 2.8, dd = Math.max(1.6, f.d1 - f.d0 + 0.8);
      const g = new THREE.Group(); g.position.set(p.x, f.h, p.z); g.rotation.y = Math.atan2(p.nx, p.nz);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), new THREE.MeshLambertMaterial({ color: '#bcd8ea', transparent: true, opacity: 0.45, emissive: color('#6f9fc4'), emissiveIntensity: 0.35, depthWrite: false }));
      glass.position.y = h / 2; g.add(glass);
      const fr = new Mesher(), k = color('#e9ecef');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) fr.box(sx * w / 2, h / 2, sz * dd / 2, 0.12, h, 0.12, k);
      fr.box(0, h, 0, w + 0.1, 0.2, dd + 0.1, k); fr.box(0, h + 0.55, -dd / 2 - 0.02, w * 0.5, 0.7, 0.06, color(X.cornerBoxes.label || '#1f5aa8'));
      g.add(fr.mesh()); this.root.add(g);
    }
    if (X.ring) {
      const ring = roundedRect(X.ring.rx, X.ring.rz, Math.min(X.ring.rx, X.ring.rz) * 0.9, 12), y = this.lightY + 0.6;
      this.root.add(new THREE.Mesh(stripGeometry(ring, y - 1.6, y, { closed: true, uScale: 6 }), new THREE.MeshLambertMaterial({ color: '#2a2c31', side: THREE.DoubleSide })));
      this.root.add(new THREE.Mesh(stripGeometry(roundedRect(X.ring.rx - 0.05, X.ring.rz - 0.05, Math.min(X.ring.rx, X.ring.rz) * 0.9 - 0.05, 12), y - 1.6, y - 1.25, { closed: true }), new THREE.MeshBasicMaterial({ color: '#f4f1e6', side: THREE.DoubleSide })));
    }
    // Muro di cemento al posto dell'anello superiore (Zurigo, testata `side`): una parete piatta che chiude la testata da
    // un lato lungo all'altro, appena dietro la linea di fondo della sua tribuna. La tribuna arriva fino al muro: tra la
    // linea di fondo (che negli angoli curva) e la parete c'è il ripiano della balconata. Sul muro, sotto il tetto, una fila
    // di nicchie a guscio poco profonde (larghe in alto, a punta arrotondata in basso), colorate a turno blu, bianco, rosso.
    if (X.nicheWall) {
      const NW = X.nicheWall, end = NW.side || 'east', sg = end === 'east' ? 1 : -1, Y = this.roofY, { EZn, EZs } = this.extent, conc = color(NW.color || '#c4c1ba');
      const secs = sections.filter(S => S.key === end || (S.kind === 'arc' && S.end === end && S.wrap));
      const pts = []; for (const S of secs) for (const [x, z] of sectionLine(S, S.profile.depth)) pts.push([x, z, S.profile.top]);
      pts.sort((a, b) => a[1] - b[1]);
      const xw = sg * (Math.max(...pts.map(p => sg * p[0])) + (NW.back ?? 0) + 0.02), top = Math.max(...pts.map(p => p[2]));
      // Parete piatta, a tutta larghezza e dal pavimento al tetto (dietro le tribune non si vede la parte bassa).
      const W = new Mesher();
      W.quad([xw, 0, -EZn], [xw, 0, EZs], [xw, Y, EZs], [xw, Y, -EZn], conc);
      // Ripiano della balconata tra la linea di fondo e la parete; ai due capi prosegue fino ai lati lunghi.
      const line = [[pts[0][0], -EZn], ...pts.map(p => [p[0], p[1]]), [pts.at(-1)[0], EZs]], floorC = color(this.A.style.concrete).lerp(conc, 0.5);
      for (let i = 0; i < line.length - 1; i++) { const [x0, z0] = line[i], [x1, z1] = line[i + 1]; if (Math.abs(z1 - z0) < 1e-3) continue; W.quad([x0, top - 0.04, z0], [x1, top - 0.04, z1], [xw, top - 0.04, z1], [xw, top - 0.04, z0], floorC); }
      this.root.add(W.mesh());
      // Nicchie equidistanti sulla parete, appena sporgenti.
      const n = NW.n ?? 8, cols = (NW.colors || ['#1d4fd8', '#f4f4f2', '#e8202a']).map(color), wN = NW.w ?? 4.5, hN = NW.h ?? 8, dN = NW.depth ?? 0.8, yTop = Y - (NW.top ?? 1.5), NM = cols.map(() => new Mesher());
      const span = (EZn + EZs) * (NW.span ?? 0.86), z0 = (EZs - EZn) / 2 - span / 2;
      for (let k = 0; k < n; k++) {
        const cz = z0 + span * (k + 0.5) / n, col = cols[k % cols.length], N = NM[k % cols.length], SU = 10, SV = 12;
        const P = (su, sv) => { const s = -1 + 2 * su / SU, v = sv / SV, hw = wN / 2 * Math.pow(1 - v, 0.55), d = dN * Math.sqrt(Math.max(0, 1 - s * s)) * Math.pow(1 - v, 0.35); return [xw - sg * (0.03 + d), yTop - v * hN, cz + s * hw]; };
        for (let i = 0; i < SU; i++) for (let j = 0; j < SV; j++) N.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), col.clone().multiplyScalar(0.9 + 0.1 * Math.cos((i / SU - 0.5) * Math.PI)));
        for (let i = 0; i < SU; i++) N.tri([xw - sg * 0.03, yTop, cz], P(i, 0), P(i + 1, 0), col.clone().multiplyScalar(0.8));
      }
      // Ogni colore ha la sua luce (come i fari colorati delle foto), così il blu e il rosso restano pieni.
      NM.forEach((N, i) => { if (!N.empty) this.root.add(N.mesh({ emissive: cols[i], emissiveIntensity: NW.glow ?? 0.35 })); });
    }
    // Gagliardetti appesi sopra un lato (Zurigo): triangoli bianchi, blu e rossi.
    if (X.pennants) {
      const P = new Mesher(), cols = X.pennants.map(color), y = this.lightY - 0.3, zz = -RINK.halfW - 3;
      for (let i = 0, x = -22; x <= 22; x += 3.4, i++) { const k = cols[i % cols.length]; P.tri([x - 1.1, y, zz], [x + 1.1, y, zz], [x, y - 4.2, zz], k); }
      this.root.add(P.mesh());
    }
  }

  buildOutside() {
    const top = this.roofY + (this.archRise || 0);
    const ext = buildExterior(this.A, { ...this.extent, roofY: top, wallY: this.roofY, logo: this.logos[this.A.team], time: this.time, glow: this.glow });
    this.outside = ext.group; this.outsideRoof = ext.roof; this.outsideTop = ext.height; this.nightList = ext.night; this.sky = ext.sky;
    this.outside.visible = false; this.root.add(this.outside);
  }

  drawCube() {
    if (!this.cubeCanvas) return;
    const [c, g] = this.cubeCanvas, W = c.width, H = c.height, home = this.A.team, away = this.state.away, TH = TEAMS[home], TA = TEAMS[away];
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0b0f16'); grad.addColorStop(1, '#151b26'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = TH.primary; g.fillRect(0, 0, W / 2, H * 0.07); g.fillStyle = TA.primary; g.fillRect(W / 2, 0, W / 2, H * 0.07);
    const ls = Math.min(W * 0.3, H * 0.5);
    for (const [img, x] of [[this.logos[home], W * 0.22], [this.logos[away], W * 0.78]]) { g.beginPath(); g.arc(x, H * 0.44, ls * 0.62, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill(); drawLogo(g, img, x, H * 0.44, ls * 0.9); }
    g.fillStyle = '#d2f277'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, this.gallery ? home : 'VS', W * 0.2, H * 0.16, 900); g.fillText(this.gallery ? home : 'VS', W / 2, H * 0.44);
    g.fillStyle = '#ffffff'; fitText(g, this.gallery ? TH.name : `${this.state.line}ª LINEA IN PISTA`, W * 0.9, H * 0.1, 800); g.fillText(this.gallery ? TH.name : `${this.state.line}ª LINEA IN PISTA`, W / 2, H * 0.82);
    g.fillStyle = 'rgba(255,255,255,.55)'; fitText(g, this.A.name.toUpperCase(), W * 0.8, H * 0.06, 700); g.fillText(this.A.name.toUpperCase(), W / 2, H * 0.93);
    this.cubeTex.needsUpdate = true;
  }

  /* ---------------- pubblico, bandiere, settore ospiti ---------------- */

  buildAwayLayer() {
    const A = this.A, home = A.team, away = this.state.away, TH = TEAMS[home], TA = TEAMS[away], { sections } = this.layout;
    const rand = seeded(home + away + 'crowd'), fans = [], flags = { home: [], away: [] };
    const density = this.quality === 'high' ? 1 : 0.75;
    const mixes = {
      // TH.extra: un colore in più a piccole dosi (Friburgo: qualche tocco di rosso nel blu, bianco e nero).
      curve: [[TH.primary, 50], [TH.secondary, 30], [TH.accent, 14], ['#1a1a1a', 6], ...(TH.extra ? [[TH.extra, 5]] : [])],
      standing: [[TH.primary, 42], [TH.secondary, 26], [TH.accent, 10], ...NEUTRALS.map(n => [n, 22 / NEUTRALS.length])],
      guest: [[TA.primary, 52], [TA.secondary, 32], [TA.accent, 16]],
      side: [[TH.primary, 30], [TH.secondary, 14], ...NEUTRALS.map(n => [n, 56 / NEUTRALS.length])],
    };
    for (const S of sections) {
      const P = S.profile, segLen = S.kind === 'straight' ? S.len / Math.max(1, Math.round(S.len / 7)) : 0, ent = this.entrances(S);
      P.rows.forEach((R, ri) => {
        const spacing = (R.standing ? 0.56 : 0.62) / density;
        for (const p of samplePolyline(sectionLine(S, R.d + R.depth * 0.55), spacing, rand, 0.14)) {
          if (S.kind === 'wedge' && S.stair && Math.abs(p.t - 0.5) < 0.06) continue; // scala al centro del cuneo
          if (this.hasStairs(S)) { if (this.sectorAisleNear(S, p.t)) continue; }
          else if (A.noAisles) { /* tribune continue, senza scale */ }
          else if (ent && ri >= ent.r0 && ri <= ent.r1 && ent.at(p.t)) continue; // ingressi gialli del secondo anello
          else if (this.isCurve(S) && R.standing) { const v = S.kind === 'straight' && this.vomitories(S); if (v && ri >= v.r0 && ri <= v.r1 && v.at(p.t)) continue; }
          else if (segLen && (R.tier === 0 || !A.upperAisles || Math.floor(p.t * S.len / segLen) % A.upperAisles === Math.floor(A.upperAisles / 2)) && (p.t * S.len) % segLen > segLen - 1.15) continue; // scale tra i settori
          if (A.corners === 'wedge' && S.kind === 'straight' && (p.t * S.len < 0.7 || (1 - p.t) * S.len < 0.7)) continue;
          if (this.inVipBox(S, p.t, ri)) continue;
          const fy = R.h;
          const zone = zoneAt(A, S, p.t, R);
          const occ = zone === 'curve' ? 0.97 : zone === 'guest' ? 0.92 : zone === 'standing' ? 0.93 : A.occupancy ?? 0.88;
          if (rand() > occ || (R.vip && rand() < 0.7)) continue;
          const shirt = weighted(rand, mixes[zone]);
          const bounce = zone === 'curve' ? 0.1 + rand() * 0.08 : zone === 'guest' ? 0.08 + rand() * 0.07 : zone === 'standing' ? 0.05 + rand() * 0.05 : 0;
          fans.push({ x: p.x, z: p.z, y: fy, yaw: Math.atan2(-p.dz, p.dx), standing: R.standing || zone === 'guest', shirt, head: rand() < 0.12 ? (zone === 'guest' ? TA.primary : TH.primary) : pick(rand, SKIN), bounce, phase: rand() * 6.28 });
          const flagChance = zone === 'curve' ? (ri > 0 ? A.curveFlags ?? 0.085 : 0) : zone === 'standing' ? 0.025 : zone === 'guest' ? 0.07 : zone === 'side' && R.tier > 0 && !R.vip ? A.sideFlags ?? 0 : 0;
          if (rand() < flagChance) (zone === 'guest' ? flags.away : flags.home).push({ ...p, y: R.h, big: zone === 'curve' && rand() < 0.07, design: rand(), phase: rand() * 6.28 });
        }
      });
    }
    this.buildFans(fans);
    if (this.gallery) this.buildFlags(flags.away.filter((_, i) => i % Math.max(1, Math.ceil(flags.away.length / 6)) === 0), away);
    // Bandiere disattivate: coprivano la vista in sezione sulle curve.
    // Settore ospiti: striscione e reti di separazione.
    const G = A.guest, S = sectionByKey(this.layout, G.side);
    if (S) {
      const tier = G.tier ?? 0, band = tier > 0 ? S.profile.bands.find(b => b.tier === tier) : null;
      // rowFrom: il settore parte più in alto (davanti ci sono posti normali); lo striscione fa da parapetto sulla prima fila ospite.
      const RF = G.rowFrom != null ? S.profile.rows[G.rowFrom] : null;
      const d = RF ? RF.d - 0.08 : band ? band.d - 0.08 : -0.06, y1 = RF ? RF.h + 1.05 : band ? band.y1 - 0.1 : S.profile.base - 0.1, y0 = RF ? RF.below + 0.05 : band ? Math.max(band.y0 + 0.2, y1 - 1.3) : Math.max(0.35, y1 - 1.5);
      // Settore solo nell'angolo (cornerOnly): lo striscione corre sul fronte dell'angolo, nel tratto occupato.
      const GC = G.corner ? sections.find(c => c.kind === 'arc' && ((c.end === G.side && c.side === G.corner) || (c.side === G.side && c.end === G.corner))) : null;
      const gcr = GC ? (GC.end === G.side ? [G.cornerFrom ?? 0, G.cornerTo ?? 1] : [1 - (G.cornerTo ?? 1), 1 - (G.cornerFrom ?? 0)]) : null;
      const l = readable(G.cornerOnly && GC ? sectionLine(GC, d, gcr[0] + 0.03, gcr[1] - 0.03) : sectionLine(S, d, (G.from ?? 0) + 0.02, (G.to ?? 1) - 0.02)), len = l.reduce((a2, p, i) => i ? a2 + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0, 0);
      this.awayLayer.add(new THREE.Mesh(stripGeometry(l, y0, y1, { uScale: len }), new THREE.MeshLambertMaterial({ map: bannerTexture(away, TA.name, 'Settore ospiti'), side: THREE.DoubleSide })));
      const rows = S.profile.rows.filter(R => R.tier === tier && R.index >= (G.rowFrom ?? 0)), net = new Mesher(), k = color('#cfd6dd');
      if (rows.length && !G.glass) for (const t of [G.from ?? 0, G.to ?? 1]) {
        if (t <= 0.001 || t >= 0.999) continue;
        const a = sectionPoint(S, t, rows[0].d), b = sectionPoint(S, t, rows.at(-1).d + rows.at(-1).depth);
        if (A.guestWall) {
          // Muretto pieno che separa gli ospiti dai tifosi di casa, a gradini come la tribuna.
          for (const R of rows) { const p0 = sectionPoint(S, t, R.d), p1 = sectionPoint(S, t, R.d + R.depth), w = 0.12, ox = p0.nz * w, oz = -p0.nx * w;
            net.box((p0.x + p1.x) / 2, R.h + 0.6, (p0.z + p1.z) / 2, Math.abs(p1.x - p0.x) + Math.abs(ox) * 2 + 0.05, 1.2, Math.abs(p1.z - p0.z) + Math.abs(oz) * 2 + 0.05, color('#8d9095')); }
        } else net.quad([a.x, rows[0].below, a.z], [b.x, rows.at(-1).h, b.z], [b.x, rows.at(-1).h + 2.4, b.z], [a.x, rows[0].h + 2.4, a.z], k);
      }
      if (!net.empty) this.awayLayer.add(A.guestWall ? net.mesh() : net.mesh({ transparent: true, opacity: 0.28, depthWrite: false }));
      // guest.glass (Bienne): gabbia di vetro attorno agli ospiti. Lastre a gradini sui lati liberi del settore (dove non
      // prosegue nell'angolo) e una parete dietro l'ultima fila, alte glassH sopra i gradini, con il profilo chiaro in cima.
      if (G.glass) {
        // join: estremo (t) dove il settore prosegue nell'angolo, lì niente lastra. Sui lati corti t = 0 è a nord, sui lunghi a ovest.
        const hg = G.glassH ?? 2.6, GL = new Mesher(), FR = new Mesher(), gk = color('#8fc3e6'), fk = color('#eef2f5');
        const C = G.corner ? sections.find(c => c.kind === 'arc' && ((c.end === G.side && c.side === G.corner) || (c.side === G.side && c.end === G.corner))) : null, tc = G.cornerTo ?? 1;
        const startCorner = G.side === 'west' || G.side === 'east' ? G.corner === 'north' : G.corner === 'west';
        const parts = G.cornerOnly ? [] : [{ S, t0: G.from ?? 0, t1: G.to ?? 1, join: C ? (startCorner ? 0 : 1) : -1 }];
        if (C) parts.push(G.cornerOnly ? { S: C, t0: gcr[0], t1: gcr[1], join: -1 } : C.end === G.side ? { S: C, t0: 0, t1: tc, join: 0 } : { S: C, t0: 1 - tc, t1: 1, join: 1 });
        for (const { S: Q, t0, t1, join } of parts) {
          const rr = Q.profile.rows.filter(R => R.tier === tier && R.index >= (G.rowFrom ?? 0)); if (!rr.length) continue;
          // Dietro l'ultima fila solo se lì non c'è già il muro di fondo (cioè se sopra c'è ancora un anello o un corridoio).
          const last = rr.at(-1), top = Q.profile.rows.at(-1) === last && !Q.profile.floors.some(f => f.d0 >= last.d + last.depth - 0.01), back = sectionLine(Q, last.d + last.depth + 0.05, t0, t1);
          if (!top) for (let i = 0; i < back.length - 1; i++) {
            const [a, b] = [back[i], back[i + 1]]; GL.quad([a[0], last.h, a[1]], [b[0], last.h, b[1]], [b[0], last.h + hg, b[1]], [a[0], last.h + hg, a[1]], gk);
            FR.beam([a[0], last.h + hg, a[1]], [b[0], last.h + hg, b[1]], 0.1, fk);
          }
          if (!top) for (const q of samplePolyline(back, 1.8, () => 0.5, 0)) FR.beam([q.x, last.h, q.z], [q.x, last.h + hg, q.z], 0.07, fk);
          // Davanti: vetro sul fronte della prima fila ospite, dal gradino sotto fino a hg sopra.
          const first = rr[0], front = sectionLine(Q, first.d - 0.06, t0, t1);
          for (let i = 0; i < front.length - 1; i++) { const [a, b] = [front[i], front[i + 1]]; GL.quad([a[0], first.below, a[1]], [b[0], first.below, b[1]], [b[0], first.h + hg, b[1]], [a[0], first.h + hg, a[1]], gk); FR.beam([a[0], first.h + hg, a[1]], [b[0], first.h + hg, b[1]], 0.1, fk); }
          for (const q of samplePolyline(front, 1.8, () => 0.5, 0)) FR.beam([q.x, first.below, q.z], [q.x, first.h + hg, q.z], 0.07, fk);
          for (const t of [t0, t1]) {
            if (Math.abs(t - join) < 1e-3) continue;
            for (const R of rr) {
              const p0 = sectionPoint(Q, t, R.d), p1 = sectionPoint(Q, t, R.d + R.depth);
              GL.quad([p0.x, R.h, p0.z], [p1.x, R.h, p1.z], [p1.x, R.h + hg, p1.z], [p0.x, R.h + hg, p0.z], gk);
              FR.beam([p0.x, R.h + hg, p0.z], [p1.x, R.h + hg, p1.z], 0.1, fk); FR.beam([p0.x, R.h, p0.z], [p0.x, R.h + hg, p0.z], 0.07, fk);
            }
          }
        }
        if (!GL.empty) { this.awayLayer.add(GL.mesh({ transparent: true, opacity: 0.45, depthWrite: false, emissive: color('#2d5f86'), emissiveIntensity: 0.35 })); this.awayLayer.add(FR.mesh()); }
      }
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
    el.innerHTML = `<b>${info.number}</b><span>${String(info.name).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])} ${info.flags || ''}</span>`;
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
    // Nell'intro si vede solo l'esterno: l'interno (più alto dell'involucro in alcune arene) ricompare quando si entra.
    // Durante il volo d'ingresso l'interno compare solo quando la telecamera è scesa sotto il tetto esterno (quando il tetto
    // sparisce): prima le file più alte del pubblico sbucherebbero attraverso le coperture.
    const galleryExterior = this.gallery && !this.cutaway && !(inside && c.y < (this.outsideTop || this.roofY) * 1.05);
    if (this.gallery && this.outside.visible !== galleryExterior) {
      this.setLightLevel(galleryExterior ? this.nightLevel : 1, galleryExterior ? 1 : 0);
    }
    const outsideOnly = galleryExterior || this.mode === 'intro' && (!this.intro.entering || c.y > (this.outsideTop ?? 0) + 4);
    if (this.root) for (const ch of this.root.children) if (ch !== this.outside && !ch.isLight) ch.visible = !outsideOnly;
    if (this.outside) this.outside.visible = galleryExterior || this.mode === 'intro';
    if (this.awayLayer) this.awayLayer.visible = !outsideOnly;
    if (this.outsideRoof) this.outsideRoof.visible = galleryExterior || this.mode === 'intro' && !(this.intro.entering && c.y < (this.outsideTop ?? 0) + 4);
    if (this.sectionShell) this.sectionShell.visible = this.gallery && this.cutaway;
    if (this.gallery && this.perimeterWalls) this.perimeterWalls.visible = !outsideOnly && !this.cutaway;
    if (this.ceiling) this.ceiling.visible = this.gallery ? !this.cutaway && inside && c.y < this.roofY * 0.85 : this.mode !== 'explore' || (inside && c.y < this.roofY - 0.3);
    if (this.mode === 'intro' && this.intro.entering && this.tween && this.nightLevel < 1) {
      const u = ease(Math.min(1, (now - this.tween.start) / this.tween.ms));
      this.setLightLevel(this.nightLevel + (1 - this.nightLevel) * u, this.night.value * (1 - u));
    }
    if (this.mode === 'tour' && !this.tour.paused && now > this.tour.nextLine) { this.tour.nextLine = now + this.tour.lineEvery; this.setLine(this.state.line % (this.tour.maxLine || 4) + 1, { auto: true }); }
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
      // Giro lento attorno all'arena: avvicinamento di giorno, poi cala la sera e la telecamera scende verso le facciate illuminate.
      const el = (now - this.intro.start) / 1000, R = Math.max(this.extent.EX, this.extent.EZ) * 3.1, k = ease(Math.min(1, el / 9));
      const k2 = ease(THREE.MathUtils.clamp((el - INTRO.day) / (INTRO.dusk + 5), 0, 1));
      this.setNight(THREE.MathUtils.smoothstep(el, INTRO.day, INTRO.day + INTRO.dusk));
      // A.introAngle: da dove parte il giro (di norma -0,6, cioè da nord-est).
      const a = (this.A.introAngle ?? -0.6) + el * 0.07, r = R * (1.5 - 0.5 * k - 0.16 * k2), h = R * (0.95 - 0.45 * k - 0.2 * k2);
      this.camera.position.set(Math.cos(a) * r, h, Math.sin(a) * r * 0.92); this.target.set(0, this.roofY * (0.35 - 0.12 * k2), 0); this.camera.lookAt(this.target);
    } else if (this.mode === 'tour') {
      if (!this.tour.paused) this.tour.angle += dt * 0.085;
      const p = this.tourPose(this.tour.angle); this.camera.position.copy(p.pos); this.target.copy(p.target); this.camera.lookAt(this.target);
    } else if (this.controls.enabled) {
      this.controls.update();
      if (this.gallery) { this.camera.position.y = Math.max(1.5, this.camera.position.y); return; }
      const c = this.camera.position;
      this.keepInside(c);
      // Inset ellipse follows the rounded bowl, including the corners under the roof.
      const radius = Math.hypot(c.x / (this.extent.EX - 4), c.z / ((c.z < 0 ? this.extent.EZn : this.extent.EZs) - 4));
      if (radius > 1) { c.x /= radius; c.z /= radius; }
      c.y = Math.min(c.y, this.roofY * 0.79);
      this.camera.lookAt(this.controls.target);
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
    this.leds = []; this.cubeCanvas = null; this.cube = null; this.archRise = 0; this.ceiling = null; this.outside = null; this.outsideRoof = null; this.tween = null; this.nightList = []; this.sky = null; this.lights = null;
    this.select(null, true);
  }
}
