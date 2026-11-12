// Formazioni. Per ora sono segnaposto generici: stessa forma che avranno i dati veri.
//
// Forma di una formazione
//   { team: 'HCAP',
//     goalies: [{ number, name }],                       // il primo è il titolare
//     lines:   [{ LW, C, RW, LD, RD }]                  // 4 linee, ogni ruolo { number, name }
//   }
// Per usare dati veri basta passare a ArenaView.setLineups() un oggetto con questa forma.

export const POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD'];
export const POSITION_LABEL = { LW: 'Ala sinistra', C: 'Centro', RW: 'Ala destra', LD: 'Difensore sinistro', RD: 'Difensore destro', G: 'Portiere' };
export const POSITION_SHORT = { LW: 'AS', C: 'C', RW: 'AD', LD: 'DS', RD: 'DD', G: 'P' };

function seeded(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function placeholderLineup(team) {
  const rand = seeded(team), used = new Set();
  const number = () => { let n; do n = 2 + Math.floor(rand() * 97); while (used.has(n)); used.add(n); return n; };
  const player = () => { const n = number(); return { number: n, name: `Giocatore ${n}` }; };
  const goalies = [1, 2].map(() => { const n = [1, 30, 35, 31, 29, 33, 40].find(x => !used.has(x)); used.add(n); return { number: n, name: `Portiere ${n}` }; });
  const lines = [1, 2, 3, 4].map(() => Object.fromEntries(POSITIONS.map(p => [p, player()])));
  return { team, goalies, lines, placeholder: true };
}
