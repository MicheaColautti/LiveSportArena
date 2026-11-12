// Le 14 arene della National League, ricostruite dalle piantine ufficiali (club e biglietterie), dalle foto e dalle viste satellite.
// Rilievo completo e fonti: docs/ARENE-RILIEVO.md. Le misure restano stilizzate.
//
// Convenzione (vedi layout.js): north = lato lungo lontano, south = lato lungo con le panchine, west/east = lati corti.
// stands.<lato>   profilo della tribuna: base (muretto davanti alla prima fila) e tiers (anelli):
//                 { rows, rise (m per fila), depth (m per fila), standing, gap: { depth, rise }, fascia: 'led'|'suites'|'vip'|'team'|'plain' }
// corners         false (aperti) | true (girano le tribune laterali) | { west: 'end'|'side', east: 'end'|'side' }
//                 'end' = l'angolo prende il profilo del lato corto (curva che avvolge gli angoli)
//                 'wedge' = cunei d'angolo (Lugano): prisma triangolare con la gradinata che scende verso il ghiaccio; opzioni in wedge
//                 { h0, top, row, edge, stair, at: { 'west-north': {...} } } (vedi layout.js → wedgeSection)
// home            curva di casa { side, from, to } (t da 0 a 1 lungo il lato; vedi layout.js)
// standing        altri settori in piedi di casa [{ side, from, to }]
// guest           settore ospiti { side, from, to, tier, corner, standing }: corner = prosegue nell'angolo verso quel lato,
//                 standing = in piedi anche se l'anello è a sedere
// exterior        involucro e dintorni per l'intro (exterior.js)
// verify          elementi ancora da verificare sul posto

const seated = (rows, rise = 0.44, depth = 0.82, more = {}) => ({ rows, rise, depth, ...more });
const standing = (rows, rise = 0.38, depth = 0.55, more = {}) => ({ rows, rise, depth, standing: true, ...more });
const upper = (rows, rise, depth, fascia = 'led', gap = { depth: 1.8, rise: 2.6 }) => ({ rows, rise, depth, gap, fascia });
// Secondo anello di Berna: muro alto con striscia LED davanti (fascia 'wall'), corridoio largo.
const ring2 = t => ({ gap: { depth: 3.2, rise: 5.5 }, fascia: 'wall', ...t });
// Corridoio in fondo al profilo (nessuna fila): pavimento piano dietro l'ultima fila, dove stanno logge o balconata (vipGlass.behind).
const deck = (depth = 2) => ({ rows: 0, rise: 0, depth: 0, gap: { depth, rise: 0 }, fascia: 'none' });
const suites = (rows = 3) => ({ rows, rise: 0.5, depth: 0.9, gap: { depth: 2, rise: 3.2 }, fascia: 'suites' });

export const ARENAS = {
  HCAP: {
    team: 'HCAP', name: 'Gottardo Arena', city: 'Ambrì', capacity: 6775, opened: 2021,
    note: 'Progetto di Mario Botta in fondovalle, tra aerodromo, autostrada e il versante boscoso. Volta ribassata sopra la pista, tribune blu, Curva Sud in piedi che avvolge gli angoli.',
    facts: ['Progetto di Mario Botta', 'Volta a botte con pannelli sopra la pista', 'Curva Sud: circa 3000 posti in piedi', 'Ospiti nell\'angolo sinistro della curva opposta'],
    gaps: { side: 2.2, bench: 4.2, end: 3 },
    stands: {
      // Un solo anello di spalti (stessa profondità e quota di prima); sopra gira l'anello della balconata, con le logge
      // VIP vetrate sul lato sud (extras.vipGlass).
      north: { base: 1.3, tiers: [seated(21, 0.56, 0.8)] },
      south: { base: 1.3, tiers: [seated(19, 0.56, 0.8)] },
      west: { base: 2.4, tiers: [standing(24, 0.42, 0.55)] },
      east: { base: 2.2, tiers: [seated(18, 0.56, 0.8)] },
    },
    corners: { west: 'end', east: 'side' },
    home: { side: 'west' },
    guest: { side: 'east', from: 0, to: 0.14, tier: 0, corner: 'north', cornerTo: 0.65, rowFrom: 3, glass: true },
    led: { boards: true, rim: true },
    roof: { type: 'vault', rise: 0.16, clear: 6, color: '#c3c7cc', steel: '#8d939b' },
    cube: { w: 6, h: 3.6 },
    extras: { vipGlass: { sides: ['south'], h: 3.2, low: 1.4, balcony: 1.4, people: 0.35 } },
    style: { concrete: '#8e9297', riser: '#777b80', wall: '#3a3e44', floor: '#24272c', seats: ['#1f5fc8', '#2766cf'], seatPattern: 'blocks' },
    light: { tint: '#eef3ff', ambient: 1, key: 1.1 },
    exterior: { shape: 'rect', wall: '#85878b', facade: 'slots', line: '#3c64ff', uScale: 22, height: 15, podium: { h: 3.5, out: 7, color: '#bdbcb7' }, recess: { h: 4, in: 2.5 },
      roof: 'barrel', roofMat: 'solar', inset: 3, rimMat: 'membrane', roofColor: '#9a9c9e', caps: '#1d2025', rise: 5.5, signAt: 0.78, sideGlow: '#3d6bff', ground: 'alpine', meadows: { r: 560, cell: 44 }, mountains: 26, trees: 60, conifers: true,
      features: [{ type: 'walkers', side: 'north', dist: 0.8, w: 5, len: 90, n: 25, y: 3.5 }, { type: 'walkers', side: 'south', dist: 0.8, w: 5, len: 110, n: 40, y: 3.5 }, { type: 'parking', side: 'east', dist: 10, w: 60, len: 90, cars: 80 }, { type: 'parking', side: 'south', dist: 10, w: 9, len: 150, cars: 45 }, { type: 'runway', side: 'south', dist: 45, len: 300, offset: 0 }, { type: 'hall', side: 'south', dist: 82, offset: 160, w: 16, len: 34, h: 7, color: '#e3e1dc', roof: 'gable', roofColor: '#6a5a4a', rise: 2 }, { type: 'hall', side: 'south', dist: 82, offset: 205, w: 14, len: 22, h: 6, color: '#f0eee9', roof: 'gable', roofColor: '#5a4a3c', rise: 2 },
        { type: 'river', side: 'north', dist: 56, w: 12, len: 1400 }, { type: 'silos', side: 'west', dist: 140, offset: 30 },
        { type: 'motorway', side: 'north', dist: 26, len: 420, offset: 20, tunnels: ['start', 'end'] }, { type: 'slope', side: 'north', dist: 62, angle: 0.62, depth: 340, trees: 900, houses: 6 }] },
  },
  HCL: {
    team: 'HCL', name: 'Cornèr Arena', city: 'Lugano', capacity: 7200, opened: 1995,
    note: 'La Resega di Pregassona: capannone dal tetto appena arcuato con un corpo basso e scuro davanti, il pendio alberato a ridosso di una testata. Dentro, grandi travi chiare incrociate sopra il ghiaccio.',
    facts: ['Curva Nord, Curva San Salvatore e Curva Ospiti', 'Ospiti sul lato corto, accanto alla San Salvatore', 'Tribune su due livelli ai lati', 'Acustica tra le più famose della lega'],
    gaps: { side: 2.4, bench: 4.4, end: 3.2 },
    stands: {
      // Due anelli; i box e il terzo anello con il pubblico sono diventati la fascia delle logge: vetrate VIP sui lati lunghi
      // e balconata su testate e cunei (extras.vipGlass). Secondo anello più lungo e ripido: ingombro e quote come prima.
      north: { base: 1.4, tiers: [seated(10, 0.42, 0.82), upper(13, 0.6, 0.8, 'led', { depth: 1.4, rise: 2.4 })] },
      south: { base: 1.4, tiers: [seated(10, 0.42, 0.82), upper(13, 0.6, 0.8, 'led', { depth: 1.4, rise: 2.4 })] },
      west: { base: 2.4, tiers: [standing(22, 0.38, 0.55), upper(9, 0.6, 0.8, 'led', { depth: 1.4, rise: 2.4 })] },
      east: { base: 2.2, tiers: [standing(18, 0.38, 0.55), upper(13, 0.6, 0.8, 'led', { depth: 1.4, rise: 2.4 })] },
    },
    corners: 'wedge',
    // Tribune continue, tranne una scala tra la curva di casa in piedi e gli ospiti (stairs); ospiti dietro il vetro.
    noAisles: true, stairs: { east: [0.52] },
    home: { side: 'west' },
    standing: [{ side: 'east', from: 0, to: 0.5, tier: 0 }],
    guest: { side: 'east', from: 0.54, to: 1, tier: 0, glass: true },
    led: { boards: true, rim: false },
    roof: { type: 'truss', clear: 6.5, color: '#2a2d32', steel: '#d5d8dc', cross: true },
    cube: { w: 6, h: 3.4 },
    extras: { vipGlass: { sides: ['north', 'south'], h: 3.2, balcony: 1.4, people: 0.35 } },
    style: { concrete: '#5c5f64', riser: '#4a4d52', wall: '#2c2f34', floor: '#24262a', seats: ['#25282d', '#25282d', '#c98a1c'], seatPattern: 'rows' },
    light: { tint: '#fff6e6', ambient: 1, key: 1 },
    exterior: { shape: 'rect', wall: '#d3cfc6', facade: 'hallglass', uScale: 30, roof: 'barrel', roofMat: 'metal', roofColor: '#9ea2a6', rise: 7.5, eaveOut: 1.2, capsGlass: true, glow: '#f6f2e4', ledges: [0.5, 0.995], ledgeColor: '#e6e3dc',
      ground: 'urban', mountains: 22, mountainDist: 470, trees: 50, conifers: false,
      features: [{ type: 'walkers', side: 'west', dist: 2, w: 20, len: 60, n: 30 }, { type: 'walkers', side: 'south', dist: 1, w: 12, len: 100, n: 40 }, 
        { type: 'hall', side: 'south', dist: 14, w: 36, len: 64, h: 12, color: '#3b3f45', roof: 'gable', solar: true, rise: 2.5, offset: -6 },
        { type: 'plaza', side: 'south', dist: 0, w: 14, len: 120, color: '#cfcbc2' },
        { type: 'plaza', side: 'west', dist: 0, w: 40, len: 70, color: '#c9c5bc' },
        { type: 'gates', side: 'west', dist: 30, len: 50, at: [-12, 12] },
        { type: 'parking', side: 'west', dist: 42, w: 40, len: 70, cars: 60 },
        { type: 'plaza', side: 'south', dist: 50, w: 6, len: 70, color: '#b5584a', offset: -40, lampEvery: 8, light: '#ffd0b0' },
        { type: 'trucks', side: 'east', dist: 14, len: 34, n: 5, offset: -18 },
        { type: 'ducts', side: 'east', dist: 0.6, len: 12, n: 3, r: 0.4, y: 8, offset: 8 },
        { type: 'drum', side: 'east', dist: 0, r: 8, h: 11, offset: 22 },
        { type: 'slope', side: 'north', dist: 6, angle: 0.62, depth: 300, trees: 900, conifers: false, houses: 14 },
        { type: 'road', side: 'south', dist: 74 },
        { type: 'road', side: 'east', dist: 40 },
        { type: 'parking', side: 'south', dist: 86, w: 36, len: 70, cars: 50, offset: 80 },
        { type: 'city', side: 'east', dist: 56, n: 22, height: 26, depth: 90, spread: 110 },
        { type: 'city', side: 'south', dist: 92, n: 60, height: 20, depth: 220, spread: 260 },
        { type: 'city', side: 'west', dist: 96, n: 60, height: 16, depth: 220, spread: 240 },
        { type: 'road', side: 'west', dist: 88 },
      ] },
  },
  HCA: {
    team: 'HCA', name: 'Raiffeisen Arena', city: 'Porrentruy', capacity: 5078, opened: 2020,
    note: 'Prisma lungo e basso a doghe grigie, tetto piano coperto di pannelli. Dentro, capriate in legno a triangoli e pareti a telaio di legno; tribune scure con i settori gialli.',
    facts: ['Struttura in legno: capriate a triangoli', 'Kop giallonero dietro la porta', 'Ospiti nell\'angolo della curva opposta', 'Aperta nel 2020'],
    gaps: { side: 2, bench: 4.2, end: 3 },
    stands: {
      // Lato lungo opposto alle panchine: un muro lungo e alto di tribune. Lato delle panchine: poche file a bordo pista,
      // con i tifosi dell'Ajoie in piedi accanto alla loro panchina (a ovest) e gli ospiti accanto alla panchina ospite (a est).
      north: { base: 1.2, tiers: [seated(19, 0.5, 0.8)] },
      south: { base: 1.1, tiers: [seated(6, 0.4, 0.8)] },
      // Testata ovest: la curva lunga e dritta in piedi (angoli aperti) e sopra, arretrata, una balconata con due file a sedere.
      west: { base: 2.2, tiers: [standing(16, 0.38, 0.55), upper(3, 0.5, 0.8, 'plain', { depth: 2.4, rise: 3.2 })] },
      // Testata est: in verticale prima due balconi aperti (due file ciascuno) e in cima le logge VIP vetrate, sul corridoio.
      east: { base: 1.2, tiers: [seated(3, 0.45, 0.8), upper(2, 0.45, 0.8, 'plain', { depth: 0.6, rise: 2.6 }), upper(2, 0.45, 0.8, 'plain', { depth: 0.6, rise: 2.6 }), deck(1.6)] },
    },
    corners: false,
    home: { side: 'west', tier: 0 },
    standing: [{ side: 'south', from: 0, to: 0.24, tier: 0, force: true, curve: true }],
    guest: { side: 'south', from: 0.76, to: 1, tier: 0, standing: true, glass: true },
    led: { boards: true, rim: false },
    roof: { type: 'wood-truss', clear: 6, color: '#d9b483', steel: '#c4945a' },
    cube: { w: 4.6, h: 2.8 },
    style: { concrete: '#9a9da2', riser: '#7f8287', wall: '#e3ddd0', floor: '#2b2d31', seats: ['#2a2a2a', '#f0b400', '#2a2a2a'], seatPattern: 'blocks' },
    light: { tint: '#ffffff', ambient: 1.15, key: 1 },
    // Negli angoli aperti: quattro torri di cemento con le aperture sovrapposte (parapetti in legno) che guardano la pista.
    extras: { timberWalls: true, cornerTowers: { levels: 3 }, vipGlass: { sides: ['east'], behind: true, balconies: false, h: 4, low: 0.3 } },
    // Esterno dalle foto: prisma a doghe grigie con il tetto di pannelli e, a filo del fronte sulla strada, la sala
    // d'allenamento più bassa con la stessa pelle. Davanti la strada con i lampioni e, oltre, la scarpata erbosa; parcheggio
    // con le aiuole e gli alberelli; dietro la collina boscosa, la ferrovia, campi a riquadri, la città e il castello sul poggio.
    exterior: { shape: 'rect', wall: '#8f9296', facade: 'hslats', accent: '#f2c200', uScale: 20, roof: 'flat', roofMat: 'solar', ground: 'grass', meadows: { r: 680, cell: 46 }, trees: 60, conifers: false,
      features: [{ type: 'walkers', side: 'north', dist: 2, w: 8, len: 80, n: 20 }, { type: 'walkers', side: 'south', dist: 1, w: 8, len: 100, n: 40 },
        { type: 'road', side: 'south', dist: 10, len: 2600, traffic: true }, { type: 'slope', side: 'south', dist: 22, angle: 0.3, depth: 28, width: 900, trees: 0, color: '#6f9a4a', clear: true },
        { type: 'hall', side: 'west', dist: 0, w: 62, len: 44, h: 11, offset: 8.4, facade: true, top: '#4a4d52' },
        { type: 'parking', side: 'west', dist: 70, w: 40, len: 64, cars: 36, islands: true, offset: 6 }, { type: 'parking', side: 'east', dist: 12, w: 30, len: 50, cars: 20, islands: true },
        { type: 'rail', side: 'north', dist: 34, tracks: 2, len: 2600 }, { type: 'slope', side: 'north', dist: 60, angle: 0.3, depth: 260, trees: 700, conifers: false, clear: true },
        { type: 'city', side: 'west', dist: 130, depth: 220, grid: 30, n: 40, height: 11, spread: 300 }, { type: 'castle', side: 'west', dist: 340, offset: -90, h: 30 },
        { type: 'city', side: 'east', dist: 170, depth: 160, grid: 32, n: 20, height: 9, spread: 260 }] },
  },
  SCB: {
    team: 'SCB', name: 'PostFinance Arena', city: 'Berna', capacity: 17031, opened: 1967,
    note: "L'arena più grande d'Europa per l'hockey: la Stehrampe in piedi occupa un intero lato lungo e finisce con lo Stehplatz Gast nell'angolo. Fuori, una scatola a pannelli con la grande volta bianca.",
    facts: ['Stehrampe SCB lungo tutto un lato lungo', 'Stehplatz Gast in fondo alla stessa rampa', 'Volta bianca sopra il ghiaccio', 'Di sera facciata azzurra e bianca'],
    // Interno imponente (misure volutamente esagerate): due anelli su tutti e quattro i lati, separati da un muro alto con
    // una striscia LED larga. Primo anello a sedere che gira negli angoli (cunei bassi); il secondo anello è diviso in
    // quattro parti: a nord la massa in piedi dei bernesi con gli ospiti in fondo, a sud le logge VIP vetrate (Lime Lounge),
    // sulle testate altre tribune con qualche bandiera. Nel secondo anello poche scale e ingressi neri con le spalle gialle.
    gaps: { side: 3.2, bench: 5.2, end: 4.4 },
    stands: {
      north: { base: 1.8, tiers: [seated(18, 0.46, 0.84), ring2({ rows: 44, rise: 0.42, depth: 0.56, standing: true })] },
      south: { base: 1.8, tiers: [seated(18, 0.46, 0.84), ring2(seated(18, 0.5, 0.8)), deck(3.6)] },
      west: { base: 1.8, tiers: [seated(18, 0.46, 0.84), ring2({ rows: 28, rise: 0.5, depth: 0.8 })] },
      east: { base: 1.8, tiers: [seated(18, 0.46, 0.84), ring2({ rows: 28, rise: 0.5, depth: 0.8 })] },
    },
    corners: 'wedge', wedge: { match: true, tip: 4 },
    home: { side: 'north', tier: 1 },
    guest: { side: 'north', from: 0.86, to: 1, tier: 1 },
    entrances: { every: 15, color: '#f2c500', sides: ['north', 'west', 'east'], from: 6, rows: 4 },
    extras: { suiteBays: 8, suiteLevels: 2, upperScreenHeight: 4.5 },
    upperAisles: 4, sideFlags: 0.03,
    led: { boards: true, rim: true },
    roof: { type: 'vault', rise: 0.08, clear: 8, color: '#cfd2d4', steel: '#6e5440', skylight: true },
    cube: { w: 11, h: 6.6 },
    style: { concrete: '#7c8087', riser: '#62666c', wall: '#2f3238', floor: '#25272b', seats: ['#b3192b', '#c99a00', '#b3192b'], seatPattern: 'blocks', vipSeat: '#c8d400' },
    light: { tint: '#f4f7ff', ambient: 1, key: 1.05 },
    // Esterno: sala in vetro opalino a pieghe (il bordo alto sale, scende e risale), volta bianca sopra,
    // blocco uffici rialzato lungo il lato sud con il piazzale e la scalinata; strada ad anello e città fitta attorno.
    exterior: { shape: 'rect', wall: '#dfe2e5', facade: 'opal', uScale: 40, nightPower: 0.9, roofColor: '#eef0f2', signColor: '#f4a300', ground: 'urban', trees: 40, conifers: false, haloColor: '#cfe2ff',
      // relative: bordo alto in metri sopra il muro interno, pieghe in frazione della sua altezza (la sala segue le tribune).
      folded: { relative: true, out: 3.5, topOut: 0, lift: { side: 'east', len: 72, h: 13 },
        top: [[0, 9], [0.06, 11], [0.14, 7], [0.19, 7], [0.25, 12], [0.2715, 10], [0.4, 4], [0.5, 2.5], [0.7715, 2.5], [0.88, 5], [1, 9]],
        fold: [[0, 0.42], [0.1, 0.7], [0.2, 0.32], [0.2715, 0.56], [0.4, 0.28], [0.5, 0.49], [0.7715, 0.49], [0.88, 0.28], [1, 0.42]] },
      block: { depth: 22, h: 'hall', ground: 7, over: 6 },
      features: [{ type: 'walkers', side: 'east', dist: 11, w: 8, len: 100, n: 30 }, { type: 'walkers', side: 'south', dist: 2, w: 16, len: 140, n: 50 }, 
        { type: 'ring', dist: 22 },
        { type: 'motorway', side: 'east', dist: 62, len: 1400, tunnels: ['start', 'end'] },
        { type: 'hall', side: 'west', dist: 42, w: 60, len: 120, h: 16, color: '#c3c7cb', top: '#a8705a' },
        { type: 'plaza', side: 'south', dist: 0, w: 20, len: 150, color: '#b9b6ae', lampEvery: 14 },
        { type: 'city', side: 'north', palette: ['#e4ddd0', '#d6cfc2', '#ece8df', '#c9c1b3', '#b9b4ab', '#dcd2bf'], grid: 26, dist: 46, depth: 280, spread: 340, height: 22 },
        { type: 'city', side: 'south', palette: ['#e4ddd0', '#d6cfc2', '#ece8df', '#c9c1b3', '#b9b4ab', '#dcd2bf'], grid: 26, dist: 46, depth: 280, spread: 340, height: 24 },
        { type: 'city', side: 'west', palette: ['#e4ddd0', '#d6cfc2', '#ece8df', '#c9c1b3', '#b9b4ab', '#dcd2bf'], grid: 26, dist: 118, depth: 220, spread: 340, height: 20 },
        { type: 'city', side: 'east', palette: ['#e4ddd0', '#d6cfc2', '#ece8df', '#c9c1b3', '#b9b4ab', '#dcd2bf'], grid: 26, dist: 104, depth: 220, spread: 340, height: 26 },
        { type: 'slope', side: 'north', dist: 340, angle: 0.3, depth: 420, trees: 800, conifers: false },
      ] },
  },
  EHCB: {
    team: 'EHCB', name: 'Tissot Arena', city: 'Bienne', capacity: 6562, opened: 2015,
    note: 'Un unico stabile lungo: la pista sotto un tetto coperto di pannelli solari e, attaccato, lo stadio di calcio aperto con l\'anello del tetto e i fari. Dentro, catino grigio ad angoli arrotondati; ospiti in piedi nell\'angolo destro della curva opposta.',
    facts: ['Hockey e calcio nello stesso complesso', 'Tribune grigie fino alle balaustre', 'Ospiti in piedi in un angolo, dietro il vetro', 'Tetto coperto di pannelli solari'],
    gaps: { side: 2.4, bench: 4.4, end: 3 },
    stands: {
      // Come la Gottardo ma su due livelli. Primo anello uguale ovunque (fascia LED e corridoio combaciano negli angoli): curva
      // di casa in piedi a ovest che avvolge i suoi angoli, ospiti in piedi nell'angolo sud-est. Secondo anello di sole 5 file
      // a sedere, giro completo; dietro, sul corridoio, le logge VIP vetrate sui lati lunghi e sulle curve una balconata con
      // il fondo vetrato sul cielo notturno (extras.vipGlass con behind).
      north: { base: 1.3, tiers: [seated(13, 0.5, 0.82), upper(5, 0.5, 0.8, 'led', { depth: 1.4, rise: 2.2 }), deck(2)] },
      south: { base: 1.3, tiers: [seated(13, 0.5, 0.82), upper(5, 0.5, 0.8, 'led', { depth: 1.4, rise: 2.2 }), deck(2)] },
      west: { base: 1.3, tiers: [standing(19, 0.333, 0.561), upper(5, 0.5, 0.8, 'led', { depth: 1.4, rise: 2.2 }), deck(2)] },
      east: { base: 1.3, tiers: [seated(13, 0.5, 0.82), upper(5, 0.5, 0.8, 'led', { depth: 1.4, rise: 2.2 }), deck(2)] },
    },
    corners: { west: 'end', east: 'side' },
    home: { side: 'west', tier: 0 },
    guest: { side: 'east', from: 0.78, to: 1, tier: 0, corner: 'south', cornerTo: 0.5, standing: true, glass: true },
    led: { boards: true, rim: false },
    extras: { vipGlass: { sides: ['north', 'south'], behind: true, h: 3.2, low: 0.05, people: 0.4 } },
    occupancy: 0.99,
    sectors: { north: 3, south: 3 },
    roof: { type: 'truss', clear: 6.5, color: '#2c2f34', steel: '#b9bec4' },
    cube: { w: 6, h: 3.6 },
    style: { concrete: '#9a9da1', riser: '#808388', wall: '#2c2f34', floor: '#222428', seats: ['#8e9196', '#83868b'], seatPattern: 'blocks' },
    light: { tint: '#f2f6ff', ambient: 1, key: 1.05 },
    // Esterno dalle foto: stabile lungo e largo uguale, sala della pista a est (tetto di pannelli solari) e stadio di calcio
    // a ovest (anello del tetto attorno al campo aperto, pali dei fari inclinati). Fascia champagne sporgente, pareti grigie
    // a nastri vetrati, finestre accese in alto sulle testate, cunei bianchi delle scale lungo il fianco nord sulla strada.
    // Attorno prati e campi, la strada, la città sullo sfondo e le colline.
    exterior: { shape: 'rect', wall: '#9aa0a6', height: 21.3, ground: 'grass', meadows: { r: 640, cell: 48 }, trees: 50, conifers: false,
      tissot: { width: 104, stadiumLen: 140, gap: 4, endPad: 4, inset: 4, fascia: 3.6, masts: 6, mastH: 17 },
      features: [{ type: 'walkers', side: 'north', dist: 8, w: 5, len: 220, n: 50, offset: -60 }, { type: 'road', side: 'north', dist: 16, traffic: true }, { type: 'parking', side: 'east', dist: 14, w: 46, len: 80, cars: 60 },
        { type: 'pitch', side: 'south', dist: 26, offset: -130 }, { type: 'pitch', side: 'south', dist: 26, offset: 0 }, { type: 'road', side: 'west', dist: 30 },
        { type: 'city', side: 'south', dist: 150, depth: 260, grid: 34, height: 26, spread: 420 }, { type: 'city', side: 'north', dist: 110, depth: 200, grid: 36, height: 18, spread: 360 },
        { type: 'slope', side: 'north', dist: 360, angle: 0.3, depth: 300, trees: 500, conifers: false }] },
  },
  HCD: {
    team: 'HCD', name: 'VAT Arena', formerName: 'Eisstadion Davos', city: 'Davos', capacity: 6795, opened: 1979,
    note: 'Il "castello di legno": tetto a falde incrociate con i colmi che convergono al centro, timpani vetrati che di sera brillano d\'oro, nervature di legno come volte incrociate sopra le tribune blu. Accanto, la grande pista all\'aperto.',
    facts: ['Tetto a falde incrociate con timpani vetrati', 'Volte incrociate in legno lamellare', 'Curva in piedi W19 per la squadra di casa', 'Ospiti nel settore S12'],
    gaps: { side: 2.4, bench: 4.4, end: 3.2 },
    stands: {
      north: { base: 1.3, tiers: [seated(11, 0.46, 0.8), upper(10, 0.54, 0.8, 'plain', { depth: 1.4, rise: 1.8 })] },
      // Fascia tra i due anelli del lato sud: logge vetrate (fascia 'vip'); niente balconata, la volta scende sulle tribune.
      south: { base: 1.3, tiers: [seated(15, 0.44, 0.8), upper(7, 0.52, 0.8, 'vip', { depth: 1.4, rise: 2.4 })] },
      west: { base: 2.3, tiers: [standing(26, 0.4, 0.55)] },
      east: { base: 2.1, tiers: [seated(10, 0.46, 0.8), upper(11, 0.54, 0.8, 'plain', { depth: 1.6, rise: 1.6 })] },
    },
    corners: 'wedge', wedge: { match: true, tip: 4 },
    home: { side: 'west' },
    guest: { side: 'south', from: 0.7, to: 1, tier: 0, glass: true },
    led: { boards: true, rim: false },
    roof: { type: 'wood-cross', clear: 3.5, color: '#a9673a', bulge: 1, vault: { lift: 0, rise: 14, point: 0.9, soft: 1.2, ax: 0.45, az: 0.7, hip: 0.6, rib: 0.5, ribH: 1.5, ribStep: 3.4 } },
    cube: { w: 5, h: 3 },
    style: { concrete: '#8a6a4a', riser: '#6d4f33', wall: '#7a5236', floor: '#2a2420', seats: ['#1f4f9e', '#1a468f'], seatPattern: 'blocks', wood: true },
    light: { tint: '#fff1dc', ambient: 1.05, key: 1 },
    extras: { glassGables: 'ends' },
    // Esterno: base ottagonale vetrata con la gronda bianca, sala arretrata con il tetto a falde incrociate morbido
    // e i grandi timpani vetrati che di sera brillano d'oro insieme alla fascia del piano terra.
    exterior: { shape: 'octagon', octCut: 0.3, octPad: 12, octaStar: { base: 7.5, inset: 2.5, rise: 28, ledge: 2.2, soft: 0.1, hip: 0.65, plateau: 0.9, gx: 0.4, gz: 0.6 }, wall: '#3a2c22', glow: '#ffc879', roofColor: '#eef2f5', eaveColor: '#3a2c22', ground: 'snow', mountains: 30, trees: 200, conifers: true, haloColor: '#ffd59a',
      features: [{ type: 'walkers', side: 'west', dist: 2, w: 10, len: 70, n: 25 }, { type: 'walkers', side: 'south', dist: 2, w: 12, len: 90, n: 40 }, { type: 'icerink', side: 'south', dist: 26, w: 70, len: 120, track: true, lines: false }, { type: 'hall', side: 'east', dist: 4, w: 22, len: 90, h: 9, color: '#6d4a36', top: '#eef2f5' }, { type: 'parking', side: 'north', dist: 10, w: 30, len: 70, cars: 40 },
        { type: 'road', side: 'south', dist: 130 }, { type: 'city', side: 'west', palette: ['#e8a4b4', '#9fc89a', '#e7d9b8', '#d8cfc0', '#c9534a', '#f0ece4', '#b9c7d6', '#e9c46a'], roofColor: '#eef2f5', dist: 50, n: 30, height: 14 }, { type: 'city', side: 'south', palette: ['#e8a4b4', '#9fc89a', '#e7d9b8', '#d8cfc0', '#c9534a', '#f0ece4', '#b9c7d6', '#e9c46a'], roofColor: '#eef2f5', dist: 150, n: 34, height: 14 }, { type: 'slope', side: 'north', dist: 120, angle: 0.5, depth: 320, trees: 700, houses: 12 }] },
  },
  HCFG: {
    team: 'HCFG', name: 'BCF Arena', city: 'Friburgo', capacity: 9009, opened: 1983,
    note: '"Cattedrale dell\'hockey": due scatole sovrapposte rivestite di rete metallica a rombi, di sera blu con una linea ambra. Dentro, gradinate scure e ripide e un grande anello sospeso sotto le travi.',
    facts: ['Facciata a rete metallica, blu di sera', 'Anello luminoso sospeso sotto il tetto', 'Kop in piedi dietro la porta', 'Ospiti sulla curva opposta, staccati dal ghiaccio'],
    // Interno (dalla foto): gradinate scure e ripide a blocchi, divise da scale grigio chiaro; lati lunghi alti su due anelli
    // con la fascia bianca davanti al secondo; angoli tagliati in diagonale (cunei a punta piatta) con le cabine vetrate.
    // Kop in piedi a ovest in blu, bianco e nero con qualche tocco di rosso; ospiti a est, più stretti e staccati dal ghiaccio.
    gaps: { side: 2.2, bench: 4.2, end: 3 },
    stands: {
      north: { base: 1.3, tiers: [seated(15, 0.52, 0.8), upper(14, 0.6, 0.78, 'white', { depth: 2, rise: 2.6 })] },
      south: { base: 1.3, tiers: [seated(15, 0.52, 0.8), upper(14, 0.6, 0.78, 'white', { depth: 2, rise: 2.6 })] },
      west: { base: 2.4, tiers: [standing(20, 0.44, 0.54), upper(9, 0.6, 0.78, 'white', { depth: 2, rise: 2.6 })] },
      east: { base: 2.2, tiers: [seated(13, 0.52, 0.8), upper(9, 0.6, 0.78, 'white', { depth: 2, rise: 2.6 })] },
    },
    corners: 'wedge', wedge: { match: true, tip: 5 },
    home: { side: 'west', tier: 0 },
    guest: { side: 'east', from: 0.72, to: 0.96, tier: 0, rowFrom: 3, standing: true, glass: true },
    occupancy: 0.96,
    led: { boards: true, rim: true },
    roof: { type: 'truss', clear: 7, color: '#141518', steel: '#3a3d42', cross: true },
    cube: { w: 7, h: 4.2 },
    style: { concrete: '#3c3e43', riser: '#2c2e32', wall: '#16171a', floor: '#1b1c1f', seats: ['#1d1e21', '#2a2b2f'], seatPattern: 'solid', aisle: '#a3a9b0', detail: '#c8102e' },
    light: { tint: '#ffffff', ambient: 0.8, key: 1.35 },
    extras: { ring: { rx: 17, rz: 11 }, cornerBoxes: { w: 7, h: 2.8, label: '#1f5aa8' } },
    // Esterno a tre livelli con stacchi netti: base sfaccettata che sporge con la terrazza sopra, piano grigio arretrato
    // con la fascia vetrata (ambra di sera), scatola alta in pannelli sfaccettati a forte sbalzo. Sul fronte sud la tettoia
    // lunga sugli ingressi e la torre cilindrica all'angolo; piazzale in ghiaia, terrazza con la scalinata, stadio St-Léonard.
    exterior: { shape: 'rect', wall: '#b9bdc2', glow: '#3d7bff', line: '#ffb04a', signColor: '#1d2024', roofMat: 'metal', roofColor: '#9ea3a8', ground: 'urban', trees: 90, conifers: false, haloColor: '#bcd2ff',
      stack: { base: { h: 8, out: 4 }, top: { from: 15, out: 8 }, mid: { color: '#8a9096' }, front: { from: 24, to: 8 }, canopy: { h: 6.6, depth: 12 }, drum: { r: 6.5, x: 11, z: 2 },
        labels: ['VIP Sud', 'Entrée principale', 'Fanshop', 'Tickets', 'SportCafé', 'VIP Nord'] },
      features: [{ type: 'walkers', side: 'east', dist: 5, w: 8, len: 80, n: 30 }, 
        { type: 'plaza', side: 'south', dist: 0, w: 46, len: 170, color: '#cfccc4', lampEvery: 16 },
        { type: 'terrace', side: 'south', dist: 6, offset: -96, w: 34, len: 26, h: 3.2, stairs: 'east', stairW: 14 },
        { type: 'road', side: 'south', dist: 48, len: 900 },
        { type: 'walkers', side: 'south', dist: 14, w: 32, len: 120, n: 60, offset: 4 },
        { type: 'trees', side: 'south', dist: 26, len: 130, n: 9, offset: 10 },
        { type: 'trees', side: 'south', dist: 38, len: 130, n: 9, offset: 14 },
        { type: 'road', side: 'east', dist: 30, len: 700 },
        { type: 'pitch', side: 'north', dist: 22, track: true, masts: 34 },
        { type: 'garage', side: 'west', dist: 28, w: 34, len: 70, h: 10 },
        { type: 'hall', side: 'east', dist: 50, w: 30, len: 60, h: 11, color: '#d8d4cc', top: '#7d8a5c' },
        { type: 'parking', side: 'east', dist: 84, w: 36, len: 70, cars: 40 },
        { type: 'city', side: 'south', palette: ['#e6dfd2', '#d9d1c2', '#efe9de', '#cfc6b6', '#bdb6aa'], grid: 30, dist: 62, depth: 200, spread: 300, height: 16, empty: 0.15 },
        { type: 'city', side: 'west', palette: ['#e6dfd2', '#d9d1c2', '#efe9de', '#cfc6b6', '#bdb6aa'], grid: 30, dist: 70, depth: 200, spread: 300, height: 14, empty: 0.2 },
        { type: 'city', side: 'east', palette: ['#e6dfd2', '#d9d1c2', '#efe9de', '#cfc6b6', '#bdb6aa'], grid: 30, dist: 125, depth: 160, spread: 300, height: 18, empty: 0.15 },
        { type: 'city', side: 'north', n: 30, dist: 180, depth: 160, spread: 300, height: 14 },
      ] },
  },
  GSHC: {
    team: 'GSHC', name: 'Patinoire des Vernets', city: 'Ginevra', capacity: 7135, opened: 1958,
    note: 'Arena storica: un grande tetto chiaro e poco inclinato sporge sulle vetrate, con una fila di puntoni inclinati davanti. Dentro, travi scure e doghe chiare convergono sulla tribuna di fondo.',
    facts: ['Inaugurata nel 1958', 'Tetto sporgente su puntoni inclinati', 'Grande Tribune su un lato lungo', 'Nuova arena prevista: Trèfle-Blanc'],
    gaps: { side: 2.6, bench: 4.6, end: 3.4 },
    stands: {
      north: { base: 1.8, tiers: [seated(21, 0.51, 17.16 / 21)] },
      south: { base: 1.6, tiers: [seated(17, 0.64, 0.80), deck(2.86)] },
      west: { base: 1.8, tiers: [standing(9, 0.37, 0.8), { ...standing(12, 0.44, 0.83), overhang: 6, clearance: 3.1, slab: 0.65 }] },
      east: { base: 1.8, tiers: [seated(9, 0.37, 0.8), { ...seated(12, 0.44, 0.83), overhang: 6, clearance: 3.1, slab: 0.65 }] },
    },
    corners: false,
    home: { side: 'west' },
    guest: { side: 'east', from: 0.76, to: 1, tier: 0, standing: true, glass: true, glassH: 2.2 },
    stairs: { east: [0.3, 0.76] },
    sectors: { north: 6, south: 5 },
    extras: { suiteBays: 5, cornerLandings: true },
    led: { boards: true, rim: false },
    roof: { type: 'slats', clear: 5, color: '#b89a72', steel: '#26282c' },
    cube: { w: 5, h: 3 },
    style: { concrete: '#9b9a95', riser: '#83827d', wall: '#3a3b3d', floor: '#2d2c2a', seats: ['#7b2a3b', '#5a5c60'], seatPattern: 'rows' },
    light: { tint: '#fff5e8', ambient: 1, key: 0.95 },
    introAngle: 0.94,
    exterior: { shape: 'rect', vernets: true, rearExtension: 28, height: 13, wall: '#d4d1c9', roof: 'canopy',
      canopy: { out: { north: 1, south: 5.8, west: 0.8, east: 0.8 }, tilt: 21, lift: 0, thick: 1.7 },
      roofColor: '#ced0cf', ground: 'urban', trees: 50, conifers: false,
      features: [{ type: 'walkers', side: 'west', dist: 2, w: 10, len: 70, n: 25 }, { type: 'walkers', side: 'south', dist: 1, w: 8, len: 100, n: 40 }, { type: 'parking', side: 'south', dist: 10, w: 50, len: 110, cars: 90 }, { type: 'hall', side: 'east', dist: 8, w: 40, len: 60, h: 10, color: '#d9d6cf', top: '#a3a5a8' }, { type: 'river', side: 'north', dist: 70, w: 40 },
        { type: 'city', side: 'south', dist: 70, n: 50, height: 34 }, { type: 'city', side: 'west', dist: 26, n: 40, height: 28 }, { type: 'city', side: 'east', dist: 60, n: 30, height: 24 }] },
  },
  EHCK: {
    team: 'EHCK', name: 'Stimo Arena', formerName: 'Eishalle Schluefweg', city: 'Kloten', capacity: 7624, opened: 1952,
    note: 'La pista nel bosco dello Schluefweg: tetto grigio a due grandi falde poco inclinate, davanti un corpo basso con una grande terrazza. Dentro, tribune blu con le file alte rosse e un intero lato corto in piedi.',
    facts: ['Circondata dal bosco', 'Tetto a padiglione e grande terrazza', 'Muro «JETZT WIRD\'S Glatt» sotto la curva in piedi', 'Ospiti nella stessa curva, nell\'angolo, dietro il vetro'],
    gaps: { side: 2.4, bench: 4.4, end: 3.2 },
    stands: {
      // Dalla mappa: un solo anello di sedili su tre lati (dietro il lato nord, sul corridoio, le logge VIP). Testata ovest:
      // davanti il muro bianco alto con la scritta «JETZT WIRD'S Glatt» e la fascia blu «STEHPLATZ SCHLUEFWEG» (home.wall),
      // sopra un'unica curva in piedi: il Kloten e, a fianco nell'angolo sud-ovest, gli ospiti dietro il vetro. Niente LED.
      // Tribune alte che salgono verso il buio del tetto, tutte con la stessa profondità (16 m) e la stessa quota in cima
      // (15 m): la curva sopra il muro e i lati ripidi si uniscono negli angoli senza gradini. Dietro l'ultima fila un
      // corridoio: logge VIP sul lato nord, altrove la balconata con le finestre sul cielo notturno (come la Tissot).
      north: { base: 2.2, tiers: [seated(20, 0.674, 0.8), deck(2)] },
      south: { base: 2.2, tiers: [seated(20, 0.674, 0.8), deck(2)] },
      west: { base: 4.5, tiers: [standing(29, 0.375, 0.5517), deck(2)] },
      // Testata est: una tribuna unica lunga e alta come i lati, che gira negli angoli.
      east: { base: 2.2, tiers: [seated(20, 0.674, 0.8), deck(2)] },
    },
    corners: { west: 'end', east: 'side' },
    home: { side: 'west', wall: ['JETZT WIRD\'S', 'Glatt', 'STEHPLATZ SCHLUEFWEG'] },
    // Ospiti solo nell'angolo sud-ovest, nella sua metà verso il lato lungo (a sinistra guardando la curva).
    guest: { side: 'west', cornerOnly: true, corner: 'south', cornerFrom: 0.4, cornerTo: 1, tier: 0, standing: true, glass: true },
    led: { boards: true, rim: false },
    extras: { vipGlass: { sides: ['north'], behind: true, h: 4.4, low: 1.2, people: 0.4 } },
    roof: { type: 'truss', clear: 6.5, color: '#dfe2e6', steel: '#a3a9b0' },
    cube: { w: 6, h: 3.6 },
    style: { concrete: '#868a90', riser: '#6c7076', wall: '#34383e', floor: '#26282c', seats: ['#1f47a0', '#1c4296'], seatPattern: 'blocks', upperSeats: { color: '#c0182c', from: 0.68 } },
    light: { tint: '#f6f8ff', ambient: 1, key: 1 },
    // Esterno dalle foto: nel bosco dello Schluefweg, due corpi attaccati. La sala alta (lamiera grecata argento, piano terra a
    // campate vetrate, nastro di finestre e ballatoio d'acciaio sotto la gronda, scale a zigzag a est) con il tetto a padiglione
    // grigio chiaro a nervature; a nord il corpo basso antracite con il grande piano scoperto, le rampe d'acciaio e la gradinata
    // a est. A ovest la piscina all'aperto nel prato, a est l'antenna rossa e bianca; bosco fitto misto, città lontana a sud.
    exterior: { shape: 'rect', wall: '#b3b8bd', height: 18.6, roof: 'hip', eaves: 3, rise: 6, ground: 'grass', plazaPad: 3, trees: 2600, forest: 'tight', forestDepth: 200, conifers: 'mixed',
      stimo: { block: { depth: 34, h: 9, from: 4, to: 12 }, mastH: 42, mastAt: [6, -48] },
      features: [{ type: 'walkers', side: 'south', dist: 3, w: 6, len: 90, n: 25 }, { type: 'road', side: 'south', dist: 22, len: 3200 }, { type: 'parking', side: 'south', dist: 34, w: 24, len: 60, cars: 30, offset: 50 },
        { type: 'city', side: 'south', dist: 290, depth: 320, grid: 36, height: 22, spread: 560 }, { type: 'city', side: 'east', dist: 300, depth: 260, grid: 38, height: 16, spread: 420 }] },
  },
  SCLT: {
    team: 'SCLT', name: 'Emmental Versicherung Arena', formerName: 'Ilfishalle', city: 'Langnau', capacity: 6050, opened: 1975,
    note: "Tempio dell'Emmental: lato lungo vetrato con montanti sottili, tetto scuro appena convesso coperto di pannelli, versante boscoso alle spalle. Dentro, archi di legno chiaro; ospiti in piedi nell'angolo della curva opposta.",
    facts: ['Archi in legno lamellare', 'Stehplatz Heim con la Raiffeisen-Tribüne alle spalle', 'Jakob-Galerie sul lato lungo', 'Stehplatz Gast nell\'angolo della curva opposta'],
    gaps: { side: 2.2, bench: 4.2, end: 3 },
    stands: {
      north: { base: 1.3, tiers: [seated(10, 0.39, 0.78), { ...seated(6, 0.48, 0.85), overhang: 3.3, clearance: 3.1 }] },
      south: { base: 1.3, tiers: [seated(9, 0.4, 0.78), { ...seated(5, 0.47, 0.85), overhang: 3.1, clearance: 3.1 }] },
      west: { base: 1.5, tiers: [standing(15, 0.37, 0.57), { ...seated(5, 0.49, 0.86), overhang: 3.7, clearance: 3 }] },
      east: { base: 1.2, tiers: [
        seated(8, 0.43, 0.8),
        upper(2, 0.45, 0.8, 'plain', { depth: 0.6, rise: 2.25 }),
        upper(2, 0.45, 0.8, 'plain', { depth: 0.6, rise: 2.25 }),
        deck(1.6),
      ] },
    },
    corners: { west: 'end', east: 'short' },
    home: { side: 'west', tier: 0 },
    standing: ['north', 'south'].map(side => ({ side, tier: 0, from: 0, to: 0.24, force: true, curve: true })),
    guest: { side: 'east', from: 0, to: 1 / 3, tier: 0, standing: true },
    extras: { cornerTowers: { end: 'east', levels: 3, height: 12.4 }, vipGlass: { sides: ['west', 'east'], vipBalcony: true, lift: 0.55, h: 2.8, balcony: 1.8, people: 0.45 } },
    led: { boards: true, rim: false },
    roof: { type: 'wood-arch', clear: 4.5, color: '#777574', ribColor: '#c99962' },
    cube: { w: 4.8, h: 3 },
    style: { concrete: '#acaaa2', riser: '#958a77', wall: '#a48865', floor: '#52504c', seats: ['#373739', '#474545'], seatPattern: 'rows' },
    light: { tint: '#fff0d8', ambient: 1.05, key: 1 },
    // Esterno dalle foto: sala a botte scura coperta di pannelli con i comignoli bianchi; a nord il corpo con le lame argento
    // e il tetto verde con due box; a est l'edificio arrotondato su due livelli legato da un raccordo arrotondato (pianta a L).
    // A sud il fiume Ilfis con gli alberi e il versante boscoso; attorno il paese con le case a falde.
    // Intro da nord-ovest: si vede subito il fronte con le lame, la botte dietro e l'edificio arrotondato in fondo.
    introAngle: -2.54,
    exterior: { shape: 'rect', ground: 'grass', height: 13, rise: 4.5, eaveOut: 0.8, caps: '#2d3035', trees: 120, conifers: true, mountains: 8,
      emmental: { block: { depth: 14, from: 0, to: 8 }, round: { gap: 7, hx: 24, inset: 3.5, r: 14, h1: 5.5, h2: 10, link: 26 } },
      features: [{ type: 'walkers', side: 'north', dist: 2, w: 6, len: 100, n: 30 }, { type: 'road', side: 'north', dist: 6, len: 2400, traffic: true },
        { type: 'river', side: 'south', dist: 12, w: 26, len: 2400 }, { type: 'slope', side: 'south', dist: 44, angle: 0.5, depth: 300, width: 1600, trees: 1400, conifers: true, clear: true },
        { type: 'parking', side: 'west', dist: 8, w: 30, len: 40, cars: 26 },
        { type: 'village', side: 'north', dist: 20, depth: 180, spread: 340, n: 160 }, { type: 'village', side: 'west', dist: 40, depth: 150, spread: 170, n: 60 }, { type: 'village', side: 'east', dist: 6, depth: 130, spread: 130, n: 50 },
        { type: 'rail', side: 'north', dist: 140, tracks: 2, len: 2400 }] },
  },
  LHC: {
    team: 'LHC', name: 'Vaudoise aréna', city: 'Losanna', capacity: 9600, opened: 2019,
    note: 'Due corpi bianchi a L ad angoli arrotondati, uno sopra l\'altro, con il tetto verde coperto di pannelli; nel cortile i cilindri bianchi e la pista all\'aperto, i binari lungo un lato e il Lemano in fondo. Dentro, tribune rosse ripidissime e travi che si accendono di rosso.',
    facts: ['Inaugurata nel 2019', 'Tribune rosse su tutti i lati', 'Pista all\'aperto accanto all\'arena', 'Ospiti nell\'angolo destro della curva opposta'],
    gaps: { side: 2.4, bench: 4.4, end: 3 },
    stands: {
      north: { base: 1.3, tiers: [seated(15, 0.48, 0.82), upper(12, 0.56, 0.8, 'led', { depth: 2, rise: 3 })] },
      south: { base: 1.3, tiers: [seated(15, 0.48, 0.82), upper(12, 0.56, 0.8, 'led', { depth: 2, rise: 3 })] },
      // Curva di casa (Kop) su tutta l'altezza dei due anelli, senza corridoio né striscia LED in mezzo.
      west: { base: 2.4, tiers: [standing(26, 0.56, 0.68)] },
      east: { base: 2.2, tiers: [seated(13, 0.48, 0.82), upper(10, 0.56, 0.8, 'led', { depth: 2, rise: 3 })] },
    },
    // La curva di casa gira anche negli angoli ovest (profilo della testata), così occupa tutta la parte curva.
    corners: { west: 'end', east: 'side' },
    home: { side: 'west', tier: 0 },
    guest: { side: 'east', from: 0.86, to: 1, tier: 0, corner: 'south', cornerTo: 0.5, rowFrom: 3, glass: true },
    led: { boards: true, rim: true, rimSkip: ['west', 'corner-west-north', 'corner-west-south'] },
    roof: { type: 'flat', clear: 7, color: '#1c1f25', steel: '#2e3138', glow: '#ff2b2b' },
    cube: { w: 8, h: 4.8 },
    style: { concrete: '#4e525a', riser: '#3d4047', wall: '#1f2227', floor: '#1d1f23', seats: ['#b3121e', '#a10f1a'], seatPattern: 'blocks' },
    light: { tint: '#fff2f2', ambient: 0.95, key: 1.15 },
    // Esterno dalle foto: un'unica L ad angoli arrotondati (anche l'angolo interno): piano terra vetrato arretrato, basamento
    // bianco con il nastro di finestre, sopra un corpo più piccolo e arretrato a fasce, tetto verde con i pannelli. Nel cortile della L i
    // cilindri bianchi e gli alberi, sulla punta la pista all'aperto illuminata. Ferrovia lungo il lato lungo (nord),
    // città tutt'attorno, il Lemano e le Alpi in fondo a sud.
    exterior: { shape: 'rect', wall: '#efefeb', signColor: '#1f6b45', roofColor: '#7f9a57', ground: 'urban', trees: 40, conifers: false, mountains: 18, mountainDist: 900, haloColor: '#ffe0c0',
      lshape: { main: { grow: 10, base: 13, glass: 4.5, upper: 26, inset: 6, r: 18, rIn: 12 }, wing: { x: [-56, 0], z: [0, 64], tip: 44 },
        court: { from: 8, rink: { len: 56, w: 26 } } },
      features: [{ type: 'walkers', side: 'west', dist: 2, w: 8, len: 70, n: 20 }, { type: 'walkers', side: 'east', dist: 2, w: 10, len: 90, n: 25 },
        { type: 'road', side: 'north', dist: 4 }, { type: 'rail', side: 'north', dist: 18, tracks: 4, trains: 4, catenary: true }, { type: 'road', side: 'north', dist: 44 },
        { type: 'road', side: 'east', dist: 10 }, { type: 'road', side: 'south', dist: 8 }, { type: 'road', side: 'west', dist: 8 },
        { type: 'parking', side: 'west', dist: 22, w: 34, len: 70, cars: 45 },
        { type: 'city', side: 'north', dist: 60, depth: 260, grid: 30, height: 22, spread: 360 }, { type: 'city', side: 'south', dist: 22, depth: 300, grid: 32, height: 26, spread: 380 },
        { type: 'city', side: 'east', dist: 26, depth: 240, grid: 30, height: 24, spread: 260 }, { type: 'city', side: 'west', dist: 64, depth: 220, grid: 32, height: 20, spread: 260 },
        { type: 'tower', side: 'south', dist: 60, offset: 150, w: 22, d: 22, h: 62, lean: 0, tint: '#b9b2a6' }, { type: 'tower', side: 'east', dist: 90, offset: -140, w: 20, d: 20, h: 54, lean: 0, tint: '#a8a49c' },
        { type: 'lake', side: 'south', dist: 360, w: 2600, len: 4000 }] },
  },
  SCRJ: {
    team: 'SCRJ', name: 'St. Galler Kantonalbank Arena', city: 'Rapperswil-Jona', capacity: 6100, opened: 1987,
    note: '"Piccola ma bella": un largo blocco bianco con il corpo basso in legno scuro del Corner, strade che curvano attorno. Dentro, capriate rosse sul soffitto chiaro e il tabellone rotondo; il lato corto in piedi è diviso tra Heim e Gäste.',
    facts: ['Un solo anello', 'Curva in piedi divisa: Heim e Gäste', 'Capriate rosse e tabellone rotondo', 'Nuova sala di allenamento accanto'],
    gaps: { side: 2.2, bench: 4.2, end: 3 },
    stands: {
      // Tribune molto alte su tutti i lati, fin quasi al soffitto, tutte con la stessa profondità e quota (si uniscono negli
      // angoli). Curva ovest in piedi come a Kloten; gli ospiti nell'angolo sud-ovest, accanto alla tribuna del lato lungo, dietro il vetro.
      // Sul lato delle panchine le logge VIP dentro la tribuna, con file di sedili sopra, sotto e ai lati (vipBoxes).
      north: { base: 2, tiers: [seated(21, 0.6, 0.8)] },
      south: { base: 2, tiers: [seated(21, 0.6, 0.8)] },
      west: { base: 2, tiers: [standing(30, 0.414, 0.56)] },
      east: { base: 2, tiers: [seated(21, 0.6, 0.8)] },
    },
    corners: { west: 'end', east: 'side' },
    // Ospiti nell'angolo sud-ovest della curva, attaccati alla tribuna del lato lungo (non dentro la curva di casa).
    home: { side: 'west' },
    guest: { side: 'west', cornerOnly: true, corner: 'south', cornerFrom: 0.2, cornerTo: 1, tier: 0, standing: true, glass: true },
    // Logge VIP nelle ultime file in alto del lato panchine: nessuno sopra.
    vipBoxes: { side: 'south', rowFrom: 16, rows: 5, from: 0.12, to: 0.88, n: 8 },
    led: { boards: true, rim: true },
    roof: { type: 'truss', clear: 3.6, color: '#e6e7e8', steel: '#c41f2e' },
    cube: { w: 6, h: 3, round: true },
    style: { concrete: '#8d9197', riser: '#73777d', wall: '#9ea3aa', floor: '#27292d', seats: ['#c4122a', '#1f3f8f'], seatPattern: 'blocks' },
    light: { tint: '#ffffff', ambient: 1.1, key: 1 },
    // Esterno dalle foto: scatola bianca in lamiera ondulata con il tetto a padiglione chiaro; sul fronte nord la fascia
    // vetrata nera, la scritta, il piano terra vetrato e il Corner in legno scuro. Davanti due piste all'aperto (quella ovale
    // a terra, l'altra sulla piattaforma), di fianco il campo da calcio, verso est il lago; dietro parcheggio, strada,
    // ferrovia e zona industriale, poi la città e le montagne.
    exterior: { shape: 'rect', wall: '#e3e6e8', signColor: '#2c3238', height: 16, roof: 'hip', hipSeams: true, eaves: 0.6, rise: 3.2, hip: 0.75, ridgeAt: 0.72, roofDetails: true, chimneys: 6, ground: 'urban', trees: 90, conifers: false, mountains: 10, mountainDist: 760,
      rj: { ground: 3.8, band: 6.2, cornerAt: 0.55, cornerLen: 34, cornerDepth: 9 },
      features: [{ type: 'walkers', side: 'north', dist: 10, w: 4, len: 100, n: 30 }, { type: 'walkers', side: 'south', dist: 2, w: 6, len: 90, n: 20 },
        { type: 'icerink', side: 'north', dist: 13, w: 28, len: 58, offset: -26, details: true, skaters: 18, mastH: 12 },
        { type: 'icerink', side: 'north', dist: 13, w: 24, len: 42, offset: 40, y: 3.5, details: true, skaters: 10, mastH: 10 },
        { type: 'pitch', side: 'west', dist: 14, details: true },
        { type: 'lake', side: 'east', dist: 90, w: 2400, len: 2400 },
        { type: 'parking', side: 'south', dist: 10, w: 40, len: 110, cars: 70 }, { type: 'road', side: 'south', dist: 56, len: 2600, traffic: true },
        { type: 'rail', side: 'south', dist: 72, tracks: 3, trains: true, len: 2600 },
        { type: 'industry', side: 'south', dist: 92, depth: 170, spread: 360, n: 30 },
        { type: 'city', side: 'west', dist: 160, depth: 260, grid: 32, n: 50, height: 14, spread: 360 }, { type: 'city', side: 'north', dist: 120, depth: 220, grid: 34, n: 40, height: 12, spread: 260, offset: -120 }] },
  },
  ZSC: {
    team: 'ZSC', name: 'Swiss Life Arena', city: 'Zurigo', capacity: 12000, opened: 2022,
    note: 'Pianta a spigoli netti e facciata a pieghe come un sipario, con il bordo ondulato e gli oblò; di sera tratti rossi, bianchi e blu. Dentro, tribune ripide tutte a sedere, cubo 12 × 8 m e, dietro una porta, il muro di cemento con le nicchie colorate.',
    facts: ['Aperta nel 2022', 'Facciata a pieghe con oblò', 'Muro con le nicchie blu, bianche e rosse', 'Logge VIP sul lato delle panchine; ospiti in piedi nell\'angolo, dietro il vetro'],
    gaps: { side: 2.4, bench: 4.4, end: 3.2 },
    stands: {
      north: { base: 1.3, tiers: [seated(16, 0.48, 0.8), upper(14, 0.56, 0.78, 'led', { depth: 2, rise: 3 })] },
      south: { base: 1.3, tiers: [seated(16, 0.48, 0.8), upper(14, 0.56, 0.78, 'led', { depth: 2, rise: 3 })] },
      // Niente curva in piedi: la testata di casa è a sedere come il resto (con qualche bandiera).
      west: { base: 1.3, tiers: [seated(16, 0.48, 0.8), upper(14, 0.56, 0.78, 'led', { depth: 2, rise: 3 })] },
      // Testata opposta: un solo anello, sopra il muro di cemento con le nicchie colorate (extras.nicheWall).
      // il primo anello curva negli angoli; sopra, l'anello superiore dei lati gira l'angolo a scalare (upperArc).
      east: { base: 1.3, tiers: [seated(18, 0.48, 0.8)] },
    },
    // Angoli est: il primo anello curva (profilo della testata); l'anello superiore dei lati gira l'angolo leggermente
    // arcuato e prosegue lungo la testata a scalare: la prima fila fa il giro completo, le altre si fermano sempre prima.
    // Angoli ovest della testata di casa: la curva li avvolge (zona tifosi più larga).
    corners: { west: 'end', east: 'end' },
    upperArc: { end: 'east', wall: 17.9, stepDeg: 6, second: 0.45 },
    home: { side: 'west', seatedCurve: true },
    curveFlags: 0.012,
    // Ospiti (settore C della mappa): in piedi nella parte alta del primo anello, nell'angolo tra la testata delle nicchie e il
    // lato delle panchine, chiusi dal vetro.
    guest: { side: 'east', from: 0.86, to: 1, tier: 0, corner: 'south', cornerTo: 0.6, rowFrom: 8, standing: true, glass: true },
    led: { boards: true, rim: true },
    roof: { type: 'truss', clear: 7, color: '#24272c', steel: '#4a4f57' },
    cube: { w: 12, h: 8 },
    style: { concrete: '#6f737a', riser: '#5a5e65', wall: '#77787a', floor: '#2a2c30', seats: ['#2a2d33', '#33363d'], seatPattern: 'blocks' },
    light: { tint: '#ffffff', ambient: 1.1, key: 1.1 },
    extras: { nicheWall: { side: 'east', back: 3.5, color: '#77787a', n: 8, w: 4.5, h: 8, depth: 0.8, colors: ['#1d4fd8', '#f4f4f2', '#e8202a'] },
      // Lato panchine: sopra il secondo anello una balconata con gente al parapetto e, dietro, le logge VIP vetrate.
      vipGlass: { sides: ['south'], vipBalcony: true, balconies: false, h: 3.4, balcony: 1.6, people: 0.4 } },
    // Esterno dalle foto, dal basso verso l'alto: piano terra vetrato arretrato dietro una fila di colonne, sopra il
    // "sipario" di pieghe chiare con il bordo ad archi. Livelli: sala dell'arena (la più alta, rossa di sera) con sopra il
    // livello arretrato a fasce blu, bianca e rossa con l'insegna; a ovest la sala d'allenamento più bassa (testata blu);
    // a est il lungo corpo degli oblò (con le pieghe blu alle estremità) che sporge dalla sala, poi la terrazza sul tetto. Ferrovia a nord, città e torri a est,
    // orti urbani a sud e a ovest, la collina con le case in fondo.
    exterior: { shape: 'rect', wall: '#e4e6e6', signColor: '#2f343a', roofMat: 'dark-solar', ground: 'urban', trees: 70, conifers: false, haloColor: '#ffd9c0',
      curtain: { base: 5, amp: 2.8, arch: 9, pitch: 2.4, depth: 0.75, recess: 3, nightPower: 1.3,
        main: { h: 34, night: '#e8202a' }, top: { h: 7, inset: 6, from: 0.6 },
        west: { len: 42, h: 25, night: '#ffffff', endNight: '#1d4fd8' },
        east: { len: 44, h: 23, band: 10, rows: 4, ends: 6, night: '#1d4fd8' }, terrace: { len: 30, h: 12, inset: 12, insetS: 6, night: '#1d4fd8' },
        canopy: { h: 11, depth: 8, from: 64, to: 16 } },
      features: [{ type: 'walkers', side: 'south', dist: 2, w: 14, len: 160, n: 60 }, { type: 'walkers', side: 'east', dist: 6, w: 12, len: 70, n: 25 },
        { type: 'road', side: 'north', dist: 6, len: 1400 }, { type: 'rail', side: 'north', dist: 22, tracks: 12, trains: 9, catenary: true },
        { type: 'road', side: 'east', dist: 30, len: 1400 }, { type: 'road', side: 'south', dist: 16, len: 1400 },
        { type: 'tower', side: 'east', dist: 120, offset: 150, w: 24, d: 22, h: 82, lean: 0, tint: '#3b4148' }, { type: 'tower', side: 'east', dist: 160, offset: 120, w: 24, d: 22, h: 74, lean: 0, tint: '#353b42' },
        { type: 'tower', side: 'east', dist: 260, offset: 40, w: 30, d: 30, h: 126, lean: 0, tint: '#5f7a7a' }, { type: 'tower', side: 'east', dist: 200, offset: -170, w: 26, d: 26, h: 96, lean: 0, tint: '#8a8f94' },
        { type: 'city', side: 'east', dist: 40, depth: 260, grid: 30, height: 26, spread: 260 }, { type: 'city', side: 'north', dist: 110, depth: 220, grid: 32, height: 20, spread: 320 },
        { type: 'gardens', side: 'south', dist: 30, depth: 150, len: 360, plots: true }, { type: 'gardens', side: 'west', dist: 14, depth: 120, len: 200, plots: true, offset: 20 },
        { type: 'slope', side: 'south', dist: 230, angle: 0.22, depth: 300, trees: 260, houses: 60, color: '#5f7a48', conifers: false }] },
  },
  EVZ: {
    team: 'EVZ', name: 'OYM hall', formerName: 'Bossard Arena', city: 'Zugo', capacity: 7200, opened: 2010,
    note: 'Volume basso color bronzo sotto una grande copertura sporgente che si alza a punta sopra l\'ingresso, accanto alla torre stretta e altissima. Dentro, sedili blu su due anelli; ospiti in piedi nei settori 127–128.',
    facts: ['Copertura sporgente sopra l\'ingresso', 'Stehplatz Heim 110–119 che avvolge gli angoli', 'Stehplatz Gäste 127–128', 'Accanto alla Park Tower'],
    gaps: { side: 2.4, bench: 4.4, end: 3 },
    // Due anelli distinti su tutti i lati, con il LED che corre senza interruzioni attorno alla pista (curve comprese):
    // il primo anello ha la stessa sezione ovunque, così fascia e corridoio combaciano negli angoli. Curva di casa
    // (110–119, a est) in piedi su entrambi gli anelli e negli angoli; ospiti in piedi a ovest (127–128, metà nord e angolo).
    stands: {
      north: { base: 1.3, tiers: [seated(14, 0.45, 0.82), upper(8, 0.52, 0.8, 'led', { depth: 1.8, rise: 2.8 })] },
      south: { base: 1.3, tiers: [seated(14, 0.45, 0.82), upper(5, 0.52, 0.8, 'led', { depth: 1.8, rise: 2.8 })] },
      west: { base: 1.3, tiers: [seated(14, 0.45, 0.82), upper(7, 0.52, 0.8, 'led', { depth: 1.8, rise: 2.8 })] },
      east: { base: 1.3, tiers: [standing(14, 0.45, 0.82), { ...upper(7, 0.52, 0.8, 'led', { depth: 1.8, rise: 2.8 }), standing: true }] },
    },
    corners: { west: 'side', east: 'end' },
    home: { side: 'east' },
    guest: { side: 'west', from: 0, to: 0.5, tier: 0, standing: true, corner: 'north', cornerTo: 0.6, glass: true },
    // Logge VIP: vetrate sopra il secondo anello sui due rettilinei; sulle curve e negli angoli la fascia prosegue come balconata.
    extras: { vipGlass: { sides: ['south', 'north'], h: 3.2, balcony: 1.4, people: 0.35 } },
    led: { boards: true, rim: false },
    roof: { type: 'truss', clear: 6.5, color: '#20242b', steel: '#5d636b' },
    cube: { w: 6.4, h: 3.8 },
    style: { concrete: '#a0a4aa', riser: '#868a90', wall: '#2c3036', floor: '#282a2e', seats: ['#0d5fa4', '#0a4c86'], seatPattern: 'blocks' },
    light: { tint: '#ffffff', ambient: 1.1, key: 1.05 },
    // Esterno dalle foto: sala bassa color bronzo (piano terra vetrato, nastro di finestre in alto) sotto una lastra
    // bianca che sporge molto a ovest sul piazzale; a nord la Park Tower, con la faccia inclinata in cui il tetto sale in curva.
    // crease: piede della faccia (frazione dello sbalzo), curve: raggio della curva che sale nella faccia, fade: dove si spegne
    // verso sud, slope: pendenza della tettoia verso ovest, extIn: corpo sotto la tettoia.
    // Sotto lo sbalzo la pista all'aperto; di sera l'intradosso viola. Città, il lago di Zugo e le colline.
    exterior: { shape: 'rect', wall: '#7a5d3e', signColor: '#ffffff', roofColor: '#e4e6e8', ground: 'urban', trees: 70, conifers: false, mountains: 12,
      zug: { h: 18, over: 42, crease: 0.5, curve: 18, fade: 26, slope: 0.13, extIn: 15, towerW: 34, towerD: 28, towerH: 81, lean: 12, towerTint: '#8b6a49', glow: '#9d84ff', rink: { len: 30, w: 20, dz: 2 } },
      features: [{ type: 'walkers', side: 'north', dist: 2, w: 10, len: 90, n: 25 }, { type: 'walkers', side: 'south', dist: 2, w: 12, len: 120, n: 45 }, { type: 'walkers', side: 'west', dist: -36, w: 20, len: 50, n: 30, offset: 20 },
        { type: 'road', side: 'south', dist: 26 }, { type: 'road', side: 'east', dist: 12 }, { type: 'road', side: 'north', dist: 16 },
        { type: 'parking', side: 'east', dist: 30, w: 36, len: 70, cars: 40 }, { type: 'hall', side: 'north', dist: 30, w: 30, len: 60, h: 12, color: '#cfd2d6', offset: 40 },
        { type: 'river', side: 'north', dist: 260, w: 500 }, { type: 'city', side: 'west', dist: 30, depth: 220, grid: 32, height: 22, spread: 260 }, { type: 'city', side: 'south', dist: 44, depth: 200, grid: 32, height: 20, spread: 300 },
        { type: 'city', side: 'north', dist: 56, depth: 180, grid: 34, height: 18, spread: 240 }, { type: 'slope', side: 'east', dist: 160, angle: 0.3, depth: 300, trees: 300, conifers: false, houses: 30 }] },
  },
};

export const ARENA_IDS = Object.keys(ARENAS);
