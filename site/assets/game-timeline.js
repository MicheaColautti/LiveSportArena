// Cronaca di una partita di hockey: striscia dell'andamento, filtri e linea del tempo per periodo.
// I dati arrivano dal play-by-play SIHF, in tedesco: qui vengono tradotti e riorganizzati.

const PENALTIES = {
  'Behinderung': 'Ostruzione',
  'Beinstellen': 'Sgambetto',
  'Hoher Stock': 'Bastone alto',
  'Check gegen den Kopf-/Nackenbereich': 'Carica alla testa o al collo',
  'Check von hinten': 'Carica da dietro',
  'Halten': 'Trattenuta',
  'Haken': 'Uncino',
  'Cross-Check': 'Cross-check',
  'Stockschlag': 'Colpo di bastone',
  'Stockstich': 'Colpo di punta con il bastone',
  'Stockendstoss': 'Colpo con il manico del bastone',
  'Ellbogencheck': 'Colpo di gomito',
  'Kniecheck': 'Carica con il ginocchio',
  'Bandencheck': 'Carica contro la balaustra',
  'Übertriebene Härte': 'Eccessiva durezza',
  'Unsportliches Verhalten': 'Comportamento antisportivo',
  'Unsportliches Verhalten gegenüber Offiziellen': 'Comportamento antisportivo verso gli ufficiali',
  'Unkorrekter Wechsel / Zu viele Spieler auf dem Eis': 'Cambio irregolare o troppi giocatori sul ghiaccio',
  'Unkorrektes Anspiel': 'Ingaggio irregolare',
  'Spielverzögerung': 'Ritardo di gioco',
  'Penaltyschuss': 'Tiro di rigore assegnato',
};

const GOAL_TAGS = {
  EQ: 'Forze pari', PP1: 'Superiorità', PP2: 'Doppia superiorità', SH1: 'Inferiorità', SH2: 'Doppia inferiorità',
  EN: 'Porta vuota', GWG: 'Goal decisivo', PS: 'Su rigore', SO: 'Ai rigori',
};

const ICONS = {
  goal: '<ellipse cx="12" cy="9" rx="8" ry="3.5"/><path d="M4 9v6c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V9"/>',
  penalty: '<circle cx="9" cy="14" r="6"/><path d="M9 8h12v4l-6 1.5M9 14h.01"/>',
  goalie: '<path d="M12 3c4 0 7 2 7 7 0 6-4 11-7 11s-7-5-7-11c0-5 3-7 7-7z"/><path d="M8.5 11h7M8.5 15h7M12 7.5v10"/>',
  revoked: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="m10 8 5 2.5-5 2.5zM8 21h8"/>',
  scored: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  missed: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
};
const svg = name => `<svg class="cr-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const seconds = clock => {
  const match = /^(\d+):(\d{2})$/.exec(String(clock ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const REGULATION = 3600, OVERTIME = 3900;

// period_number non è affidabile: un goal in supplementare può arrivare con period_number 3.
export function periodKey(event) {
  const label = String(event.period ?? '');
  if (label === 'Shootout' || event.event_type === 'shootout') return 'so';
  if (label.includes('Verlängerung')) return 'ot';
  const third = /^(\d)\. Drittel/.exec(label);
  return third ? Number(third[1]) : Number(event.period_number) || 1;
}

export const penaltyLabel = name => {
  const key = String(name ?? '').trim();
  return PENALTIES[key] || key || 'Penalità';
};

export function revokeLabel(reason) {
  const text = String(reason ?? '').trim();
  const challenge = text.startsWith('CC-');
  const cause = challenge ? text.slice(3) : text;
  const known = /off-?i?side/i.test(cause) ? 'fuorigioco' : /goalie|goaltender/i.test(cause) ? 'ostruzione al portiere' : cause;
  return challenge ? `Coach’s challenge · ${known}` : known;
}

// Una penalità 5 + 20 arriva come due righe: per chi legge è un solo fallo.
export function mergePenalties(events) {
  const merged = [];
  for (const event of events) {
    const previous = merged.at(-1);
    if (event.event_type === 'penalty' && previous?.event_type === 'penalty' && event.player_id != null
      && previous.player_id === event.player_id && previous.time === event.time
      && String(previous.penalty_name).trim() === String(event.penalty_name).trim()) {
      previous.parts.push(event);
    } else merged.push(event.event_type === 'penalty' ? { ...event, parts: [event] } : event);
  }
  return merged;
}

const seasonCounts = text => {
  const counts = new Map();
  for (const [, name, count] of String(text ?? '').matchAll(/([^,\n*/]+?)\s*\((\d+)\)/g)) counts.set(name.trim(), count);
  return counts;
};

export function buildTimeline(game, detail) {
  const sideOf = event => String(event.team_id) === String(game.home) ? 'home' : 'away';
  const all = [...(detail?.events ?? [])].sort((a, b) => Number(a.event_index) - Number(b.event_index));
  const shootout = all.filter(event => event.event_type === 'shootout');
  // Il goal fittizio «SO» a 65:00 riassume i rigori, già elencati uno per uno.
  const visible = all.filter(event => !(shootout.length && event.event_type === 'goal' && event.goal_tags === 'SO'));
  const events = mergePenalties(visible).map(event => ({ ...event, side: sideOf(event), key: periodKey(event) }));
  const stat = name => (detail?.stats ?? []).find(row => row.statistic === name);
  const played = (game.homePeriods ?? []).filter(value => value != null).length;
  const keys = new Set(events.map(event => event.key));
  for (let period = 1; period <= Math.min(played, 3); period++) keys.add(period);
  if (['OT', 'SO'].includes(game.decision)) keys.add('ot');
  if (game.decision === 'SO') keys.add('so');

  let tally = [0, 0];
  for (const event of events) {
    if (event.event_type !== 'shootout') continue;
    if (event.shootout_scored) tally = event.side === 'home' ? [tally[0] + 1, tally[1]] : [tally[0], tally[1] + 1];
    event.tally = tally;
  }

  const order = key => key === 'so' ? 5 : key === 'ot' ? 4 : key;
  const periods = [...keys].sort((a, b) => order(a) - order(b)).map(key => {
    const rows = events.filter(event => event.key === key);
    const goals = side => rows.filter(event => event.event_type === 'goal' && event.side === side).length;
    const index = typeof key === 'number' ? key - 1 : -1;
    const score = key === 'so' ? tally
      : index >= 0 && game.homePeriods?.[index] != null ? [game.homePeriods[index], game.awayPeriods?.[index] ?? 0]
      : [goals('home'), goals('away')];
    const shots = index >= 0 ? stat(`SOG ${key}P`) : null;
    // I PIM per periodo della SIHF risultano spesso a zero: li ricaviamo dalle penalità della cronaca.
    const minutes = side => rows.filter(event => event.event_type === 'penalty' && event.side === side)
      .reduce((sum, event) => sum + event.parts.reduce((total, part) => total + (Number(part.penalty_minutes) || 0), 0), 0);
    const pim = rows.some(event => event.event_type === 'penalty') ? [minutes('home'), minutes('away')] : null;
    return { key, score, rows, shots, pim, label: key === 'so' ? 'Rigori' : key === 'ot' ? 'Supplementare' : `${key}° periodo` };
  });

  const timed = events.filter(event => event.game_seconds != null && event.key !== 'so');
  const extra = keys.has('ot') || timed.some(event => event.game_seconds > REGULATION);
  return { events, periods, total: extra ? OVERTIME : REGULATION };
}

const matches = (event, filter) => filter === 'goal' ? ['goal', 'revoked_goal', 'shootout'].includes(event.event_type)
  : filter === 'penalty' ? event.event_type === 'penalty' : true;

export function gameTimeline(game, detail, view, filter = 'all') {
  const { esc, mark, team } = view;
  const { events, periods, total } = buildTimeline(game, detail);
  const short = side => esc(team(side === 'home' ? game.home : game.away).short);
  const crest = side => mark(side === 'home' ? game.home : game.away);
  const shirt = event => event.player_jersey != null ? `<span class="cr-jersey">#${Math.trunc(Number(event.player_jersey))}</span> ` : '';
  const player = event => `${shirt(event)}${esc(event.player_name)}`;
  const goalTimes = new Set(events.filter(event => event.event_type === 'goal').map(event => `${event.side}|${event.time}`));
  const people = new Map();
  for (const row of [...(detail?.players ?? []), ...(detail?.lineups ?? [])]) {
    if (row.player_id != null) people.set(Number(row.player_id), { name: row.player_name ?? row.player, shirt: row.player_jersey ?? row.player_number });
  }

  const onIce = ids => (ids ?? []).map(id => people.get(Number(id))).filter(Boolean)
    .map(person => `${person.shirt != null ? `#${Math.trunc(Number(person.shirt))} ` : ''}${esc(person.name)}`).join(', ');

  const goalCard = event => {
    const counts = seasonCounts(event.text);
    const withCount = name => `${esc(name)}${counts.has(name) ? ` <span class="cr-count" title="Totale in stagione">(${counts.get(name)})</span>` : ''}`;
    const tags = String(event.goal_tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean);
    const assists = [event.assist1_player_name, event.assist2_player_name].filter(Boolean);
    const scoring = onIce(event.plus_player_ids), conceding = onIce(event.minus_player_ids);
    const strength = event.players_on_ice;
    const manpower = Array.isArray(strength) && tags.some(tag => /^PP/.test(tag))
      ? `<span class="cr-tag">${esc(strength[0])} contro ${esc(strength[1])}</span>` : '';
    const other = event.side === 'home' ? 'away' : 'home';
    return `<div class="cr-card-top"><span class="cr-score">${Math.trunc(Number(event.score_home ?? 0))} : ${Math.trunc(Number(event.score_away ?? 0))}</span><span class="cr-kind">Goal ${short(event.side)}</span>${crest(event.side)}</div>
      <p class="cr-name">${event.player_name ? `${shirt(event)}${withCount(event.player_name)}` : 'Goal ai rigori'}</p>
      ${assists.length ? `<p class="cr-meta">Assist: ${assists.map(withCount).join(', ')}</p>` : event.player_name ? '<p class="cr-meta">Senza assist</p>' : ''}
      ${tags.length ? `<div class="cr-tags">${tags.map(tag => `<span class="cr-tag">${esc(GOAL_TAGS[tag] || tag)}</span>`).join('')}${manpower}</div>` : ''}
      ${scoring || conceding ? `<details class="cr-ice"><summary>Sul ghiaccio</summary>${scoring ? `<p><b>${short(event.side)}</b> ${scoring}</p>` : ''}${conceding ? `<p><b>${short(other)}</b> ${conceding}</p>` : ''}</details>` : ''}`;
  };

  const penaltyCard = event => {
    const parts = event.parts ?? [event];
    const minutes = parts.map(part => Math.trunc(Number(part.penalty_minutes) || 0));
    const shot = minutes.every(value => value === 0);
    const other = event.side === 'home' ? 'away' : 'home';
    const ranges = parts.filter(part => part.penalty_start && part.penalty_end && part.penalty_start !== part.penalty_end).map(part => {
      const span = (seconds(part.penalty_end) ?? 0) - (seconds(part.penalty_start) ?? 0);
      const stopped = span < Number(part.penalty_minutes) * 60 && goalTimes.has(`${other}|${part.penalty_end}`);
      return `${parts.length > 1 ? `${Math.trunc(Number(part.penalty_minutes))} min: ` : ''}${esc(part.penalty_start)} → ${esc(part.penalty_end)}${stopped ? ' · chiusa dal goal' : ''}`;
    });
    return `<div class="cr-card-top"><span class="cr-minutes${Math.max(...minutes) >= 5 ? ' major' : ''}">${shot ? 'Rigore' : `${minutes.join(' + ')} min`}</span><span class="cr-kind">Penalità ${short(event.side)}</span>${crest(event.side)}</div>
      <p class="cr-name">${event.player_name ? player(event) : 'Penalità di squadra'}</p>
      <p class="cr-offence">${esc(penaltyLabel(event.penalty_name))}</p>
      ${ranges.map(range => `<p class="cr-meta">${range}</p>`).join('')}`;
  };

  const revokedCard = event => `<div class="cr-card-top"><span class="cr-void">Goal annullato</span><span class="cr-kind">${short(event.side)}</span>${crest(event.side)}</div>
    <p class="cr-name">${player(event)}</p>
    ${event.assist1_player_name ? `<p class="cr-meta">Assist: ${[event.assist1_player_name, event.assist2_player_name].filter(Boolean).map(esc).join(', ')}</p>` : ''}
    ${event.revoke_reason ? `<p class="cr-offence">${esc(revokeLabel(event.revoke_reason))}</p>` : ''}`;

  const shootoutCard = event => `<div class="cr-card-top"><span class="cr-score${event.shootout_scored ? '' : ' muted'}">${event.tally[0]} : ${event.tally[1]}</span><span class="cr-kind">${event.shootout_scored ? 'Segnato' : 'Sbagliato'} · ${short(event.side)}</span>${crest(event.side)}</div>
    <p class="cr-name">${player(event)}</p>
    ${event.goalie_name ? `<p class="cr-meta">Portiere: ${esc(event.goalie_name)}</p>` : ''}`;

  const goalieLine = event => `<div class="cr-goalie">${crest(event.side)}<span><b>${event.goalie_change === 'in' ? 'Entra il portiere' : 'Esce il portiere'}</b> ${player(event)}</span></div>`;

  const row = event => {
    const type = event.event_type;
    const kind = type === 'goal' ? 'goal' : type === 'penalty' ? 'penalty' : type === 'goalie' ? 'goalie' : type === 'revoked_goal' ? 'revoked' : type === 'shootout' ? (event.shootout_scored ? 'scored' : 'missed') : 'penalty';
    const body = type === 'goal' ? goalCard(event) : type === 'penalty' ? penaltyCard(event) : type === 'revoked_goal' ? revokedCard(event) : type === 'shootout' ? shootoutCard(event) : type === 'goalie' ? goalieLine(event) : `<p class="cr-name">${esc(event.player_name || event.text || type)}</p>`;
    const time = type === 'shootout' ? `R${Math.ceil(Number(event.shootout_number) / 2) || ''}` : esc(event.time ?? '');
    return `<li class="cr-row ${event.side} is-${kind}"><div class="cr-axis"><span class="cr-time">${time}</span><span class="cr-node">${svg(kind)}</span></div><div class="cr-card">${body}</div></li>`;
  };

  const pair = stat => stat ? `${esc(stat.home_value ?? '–')}–${esc(stat.away_value ?? '–')}` : null;
  const period = item => {
    const shown = item.rows.filter(event => matches(event, filter));
    if (item.key === 'so') shown.reverse();
    const facts = [pair(item.shots) && `Tiri ${pair(item.shots)}`, item.pim && `Penalità ${item.pim[0]}–${item.pim[1]} min`].filter(Boolean).join(' · ');
    const none = item.rows.length ? 'Nessun evento con questo filtro' : 'Nessun evento';
    return `<section class="cr-period"><header class="cr-period-head"><h3>${item.label}</h3><strong>${Math.trunc(Number(item.score[0]))} : ${Math.trunc(Number(item.score[1]))}</strong><span>${facts}</span></header>
      ${shown.length ? `<ol class="cr-events">${shown.map(row).join('')}</ol>` : `<p class="cr-none">${none}</p>`}</section>`;
  };

  const place = value => Math.max(0, Math.min(100, value / total * 100));
  const lane = side => {
    const own = events.filter(event => event.side === side && event.key !== 'so');
    const bars = own.filter(event => event.event_type === 'penalty').flatMap(event => (event.parts ?? [event]).filter(part => Number(part.penalty_minutes) > 0 && Number(part.penalty_minutes) <= 5).map(part => {
      const start = seconds(part.penalty_start), end = seconds(part.penalty_end);
      if (start == null || end == null || end <= start) return '';
      const tip = `${esc(part.penalty_start)} · ${Math.trunc(Number(part.penalty_minutes))} min · ${esc(event.player_name || short(side))} · ${esc(penaltyLabel(event.penalty_name))}`;
      return `<span class="cr-flow-bar" tabindex="0" role="img" aria-label="Penalità ${tip}" data-tip="${tip}" style="left:${place(start)}%;width:${place(end) - place(start)}%"></span>`;
    })).join('');
    const dots = own.filter(event => event.event_type === 'goal' && event.game_seconds != null && event.player_name).map(event => {
      const tip = `${esc(event.time)} · ${esc(event.player_name)} · ${Math.trunc(Number(event.score_home))} : ${Math.trunc(Number(event.score_away))}`;
      const at = place(event.game_seconds);
      return `<span class="cr-flow-dot${at < 18 ? ' tip-start' : at > 82 ? ' tip-end' : ''}" tabindex="0" role="img" aria-label="Goal ${tip}" data-tip="${tip}" style="left:${at}%"><i></i></span>`;
    }).join('');
    return `<div class="cr-flow-lane ${side}"><span class="cr-flow-team">${crest(side)}<b>${short(side)}</b></span><div class="cr-flow-track">${[1200, 2400, 3600].filter(mark => mark < total).map(mark => `<span class="cr-flow-tick" style="left:${place(mark)}%"></span>`).join('')}${bars}${dots}</div></div>`;
  };
  const scale = [[0, '1°'], [1200, '2°'], [2400, '3°'], ...(total > REGULATION ? [[3600, 'Sup.']] : [])];
  const width = from => place(Math.min(from + 1200, total)) - place(from);
  const flow = `<div class="cr-flow"><div class="cr-flow-head"><h3>Andamento</h3><div class="cr-flow-key"><span><i class="dot"></i>Goal</span><span><i class="bar"></i>Penalità fino a 5 min</span></div></div>${lane('home')}${lane('away')}<div class="cr-flow-scale"><span></span><div>${scale.map(([from, label]) => `<span style="left:${place(from)}%;width:${width(from)}%">${label}</span>`).join('')}</div></div></div>`;

  const counts = { all: events.length, goal: events.filter(event => matches(event, 'goal')).length, penalty: events.filter(event => matches(event, 'penalty')).length };
  const filters = [['all', 'Tutto'], ['goal', 'Goal'], ['penalty', 'Penalità']].map(([value, label]) => `<button class="chip${filter === value ? ' active' : ''}" data-cronaca-filter="${value}" aria-pressed="${filter === value}">${label} · ${counts[value]}</button>`).join('');

  return `<div class="cronaca">${flow}<div class="cr-filters" role="group" aria-label="Filtra la cronaca">${filters}</div><div class="cr-sides"><span>${crest('home')}${esc(team(game.home).name)}</span><span>${esc(team(game.away).name)}${crest('away')}</span></div>${periods.slice().reverse().map(period).join('')}</div>`;
}
