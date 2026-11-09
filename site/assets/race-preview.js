// Contenuti dell'anteprima di una gara di sci: quanto manca, posto in stagione, pista e classifica.

const CUP_NAMES = { DH: 'discesa', SL: 'slalom', GS: 'gigante', SG: 'super-G' };

export function countdown(raceDate, todayKey) {
  const days = Math.round((Date.parse(`${raceDate}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(days) || days < 0) return null;
  return days === 0 ? 'Oggi' : days === 1 ? 'Domani' : `${days} giorni`;
}

const raceOrder = (a, b) => String(a.runs?.[0]?.start || a.date).localeCompare(String(b.runs?.[0]?.start || b.date)) || String(a.id).localeCompare(String(b.id));

export function seasonPosition(race, races) {
  const sameCup = races.filter(item => item.gender === race.gender && item.status !== 'cancelled').sort(raceOrder);
  const sameDiscipline = sameCup.filter(item => item.discipline === race.discipline);
  const place = list => {
    const index = list.findIndex(item => item.id === race.id);
    return index < 0 ? null : { number: index + 1, total: list.length };
  };
  return { cup: place(sameCup), discipline: place(sameDiscipline) };
}

// I profili hanno numeri più precisi: le schede delle piste coprono quello che manca.
export function trackStats(course, profile) {
  const metrics = profile?.metrics ?? {};
  const fact = pattern => (course?.facts ?? []).find(item => pattern.test(item.label))?.value;
  // Le schede scrivono 3.035 m, i profili 3’035 m: in anteprima vale il formato svizzero del sito.
  const swiss = value => String(value).replace(/(\d)\.(\d{3})\b/g, '$1’$2');
  const clean = value => value ? swiss(String(value).split(' · ')[0]) : null;
  const start = fact(/^Partenza/), finish = fact(/^Arrivo/);
  return [
    ['Lunghezza', clean(metrics.length ?? fact(/^Lunghezza/))],
    ['Dislivello', clean(metrics.vertical ?? fact(/^Dislivello/))],
    ['Pendenza max', clean(metrics.maxgrad ?? fact(/^Pendenza massima/))],
    ['Quote', metrics.alt ?? (start && finish ? swiss(`${start.replace(/ m$/, '')} → ${finish}`) : null)],
  ].filter(([, value]) => value).slice(0, 3);
}

export function previewStandings(race, groups) {
  const tables = groups?.[race.gender]?.tables ?? {};
  const top = rows => [...rows].sort((a, b) => Number(a.rank) - Number(b.rank)).slice(0, 3);
  const name = CUP_NAMES[race.discipline];
  if (tables[race.discipline]?.length) return { title: `Coppa di ${name}`, note: '', rows: top(tables[race.discipline]) };
  if (tables.ALL?.length) return { title: 'Coppa generale', note: name ? `Ancora nessun punto in ${name}` : '', rows: top(tables.ALL) };
  return null;
}

export function racePreview(race, data, view) {
  const { esc, flag, safeUrl, athleteStyle, course, profile, mapCourse, todayKey } = view;
  const position = seasonPosition(race, data.races);
  const women = race.gender === 'W';
  const tiles = [];
  const left = race.status === 'scheduled' ? countdown(race.date, todayKey) : null;
  if (left) tiles.push([left === 'Oggi' || left === 'Domani' ? 'Si gara' : 'Mancano', left]);
  if (race.status !== 'cancelled') {
    if (position.discipline) tiles.push([race.disciplineName, `${position.discipline.number}ª di ${position.discipline.total}`]);
    if (position.cup) tiles.push([`Coppa del Mondo ${women ? 'donne' : 'uomini'}`, `Gara ${position.cup.number} di ${position.cup.total}`]);
  }
  const stats = trackStats(course, profile);
  const text = course?.preview;
  const name = course?.name ?? mapCourse;
  const track = name && (stats.length || text) ? `<section class="preview-section"><div class="preview-head"><h3>${esc(name)}</h3><span>La pista</span></div>
    ${stats.length ? `<dl class="preview-stats">${stats.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
    ${text ? `<p class="preview-text">${esc(text.text)} <a class="text-button" href="${safeUrl(text.source)}" target="_blank" rel="noopener">Fonte ↗</a></p>` : ''}</section>` : '';
  const standings = race.status === 'cancelled' ? null : previewStandings(race, data.cups);
  const table = standings ? `<section class="preview-section"><div class="preview-head"><h3>${esc(standings.title)}</h3><span>${esc(standings.note)}</span></div>
    <table class="mini-table"><tbody>${standings.rows.map(row => `<tr ${athleteStyle(row)}><td>${esc(row.rank)}</td><td>${flag(row.country)}${esc(row.name)}</td><td><b>${esc(row.points)}</b></td></tr>`).join('')}</tbody></table></section>` : '';
  return `${tiles.length ? `<div class="preview-tiles">${tiles.map(([label, value]) => `<div class="preview-tile"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>` : ''}<div id="race-snapshot"></div>${track}${table}`;
}
