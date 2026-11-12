// Statistiche FINTE per la demo del tour: stessa forma che avranno i dati veri.
// Con i dati reali (site/data/hockey.json) basterà calcolare questi stessi campi e passarli alla pagina.

import { TEAMS } from './teams.js?v=184';
import { seeded } from './common.js?v=184';

const pad = n => String(n).padStart(2, '0');

export function makeStats(home, away, lineups) {
  const r = seeded(home + '|' + away + '|stats'), int = (a, b) => a + Math.floor(r() * (b - a + 1));

  // Date solo nei mesi di stagione (settembre–marzo), dalla più recente.
  const SEASON = [[2026, 10], [2026, 9], [2026, 3], [2026, 2], [2026, 1], [2025, 12], [2025, 11], [2025, 10]];
  let slot = 0;
  const meetings = Array.from({ length: 5 }, (_, i) => {
    slot += 1 + int(0, 1);
    const [year, m] = SEASON[Math.min(slot, SEASON.length - 1)], atHome = i % 2 === 0, ot = r() < 0.2;
    let a = int(0, 5), b = int(0, 5); if (a === b) b += 1;
    return { date: `${pad(int(1, 28))}.${pad(m)}.${year}`, host: atHome ? home : away, guest: atHome ? away : home, score: [a, b], ot };
  });

  const h2h = { games: 12, wins: { [home]: int(3, 7), [away]: 0 }, ot: int(1, 3) };
  h2h.wins[away] = h2h.games - h2h.wins[home] - h2h.ot;
  h2h.goals = { [home]: int(28, 42), [away]: int(26, 40) };

  const team = id => ({
    rank: 0, points: int(18, 44), gp: 20, gf: int(48, 78), ga: int(44, 74),
    pp: (14 + r() * 14).toFixed(1), pk: (74 + r() * 14).toFixed(1), shots: (26 + r() * 9).toFixed(1),
    form: Array.from({ length: 5 }, () => (r() < 0.55 ? 'V' : r() < 0.4 ? 'S' : 'P')).join(''),
  });
  const compare = { [home]: team(home), [away]: team(away) };
  const ranks = [int(1, 7), int(8, 14)];
  if (r() < 0.5) ranks.reverse();
  compare[home].rank = ranks[0]; compare[away].rank = ranks[1];

  const scorer = id => {
    const L = lineups[id], p = L?.lines?.[0]?.C || { number: int(10, 99), name: 'Giocatore' };
    const g = int(6, 15), a = int(7, 18);
    return { team: id, number: p.number, name: p.name, gp: 20, g, a, pts: g + a, pm: int(-4, 12), shots: int(40, 80) };
  };
  const scorers = { [home]: scorer(home), [away]: scorer(away) };

  return { home, away, meetings, h2h, compare, scorers, sample: true, names: { [home]: TEAMS[home].name, [away]: TEAMS[away].name } };
}
