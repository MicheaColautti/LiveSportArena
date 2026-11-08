import { skiProfiles } from './ski-profiles.js';
import { mapFlags, skiMaps, mapForRace } from './maps-3d.js';
import { readSource } from './client-diagnostics.js';
import { enhanceSelects as upgradeSelects } from './select-control.js';
import { enableTableSorting } from './table-sort.js?v=20261107-compact';
import { hockeyColumn } from './hockey-columns.js';
import { mountCourseMaps } from './course-map.js';
import { raceTime, raceResults, timeSeconds, seasonMetrics } from './alpine-insights.js';
import { TEAM_LOGOS, NATIONS, projectedStandings } from './preferences.js';
import { MODULES } from './modules.js';
import { FisConnection, rowsForRun, alertCandidates, venueInstant, STATUS, STARTED, FINISHED } from './fis-live.js';

const paths = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/>',
  live: '<path d="M8 7a7 7 0 0 0 0 10m8-10a7 7 0 0 1 0 10M5 4a11 11 0 0 0 0 16M19 4a11 11 0 0 1 0 16"/><circle cx="12" cy="12" r="2"/>',
  mountain: '<path d="m2 20 7-14 4 7 3-5 6 12H2Zm4-8 3 2 3-2m3 0 2 2 2-1"/>',
  hockey: '<path d="m6 3 8 14h6l2 4h-9L3 4m14-1-4 7"/><ellipse cx="5" cy="20" rx="3" ry="1.5"/>',
  flame: '<path d="M12 3c1 5-4 5-3 10 1-1 2-2 2-4 4 3 7 5 7 8a6 6 0 0 1-12 0c0-3 2-6 6-14Z"/>',
  chart: '<path d="M3 3v18h18M7 17v-5m5 5V6m5 11V9"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 8-3 7-3 10h18c0-3-3-2-3-10m-9 13h6"/>',
  refresh: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6M4 17a9 9 0 0 0 15 2l3-3m0 6v-6h-6"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  link: '<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm8 2h4v2a4 4 0 0 1-4 4M8 5H4v2a4 4 0 0 0 4 4m4 2v5m-5 3h10m-8-3h6v3"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.info}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? esc(url.href) : '#'; } catch { return '#'; } };
const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`sal:${key}`)) ?? fallback; } catch { return fallback; } };
const saveStore = (key, value) => { try { localStorage.setItem(`sal:${key}`, JSON.stringify(value)); } catch { /* private browser: preferences remain in memory */ } };
const data = { hockeyStats:{tables:{}}, tracks:{courses:[]}, cups: { groups: {} }, alpine: { races: [], events: [] }, hockey: { games: [], teams: [], standings: [], details: {}, leaders: [] }, predictions: { predictions: [], gameIds: [] } };
let hockeyPollTimer;
let scoreReadFailed = false;
const sourceSignatures = new Map();
let hockeyScoreSignature = '';
let hockeyBaseline = null; let hockeyScores = null; let hockeyPollBusy = false;
const state = { route: 'home', sports: [], disciplines: [], gender: 'all', scope: 'upcoming', date: '', query: '', month: '', hockeyTab: 'calendar', teams: readStore('teams', []), alerts: { enabled: false, swiss: true, athletes: [], minutes: 3, ...readStore('alerts', {}) } };
const preferences = { team: '', nations: state.alerts.swiss ? ['SUI'] : [], athletes: [...state.alerts.athletes], stars: true, ...readStore('preferences', {}) };
preferences.teams ||= preferences.team ? [preferences.team] : [];
state.leagueTable = 'player_stats';
const athleteNames = readStore('athleteNames', {});
const navigation = [['home', 'Home', 'home'], ['calendar', 'Calendario', 'calendar'], ['live', 'In diretta', 'live'], ['alpine', 'Sci alpino', 'mountain'], ['maps-3d', 'Mappe 3D', 'mountain'], ['hockey', 'Hockey', 'hockey'], ['predictions', 'Previsioni', 'spark'], ['settings', 'Impostazioni', 'user'], ['alpine-standings', 'Classifiche', 'trophy'], ['alpine-stats', 'Statistiche', 'chart'], ['hockey-stats','Statistiche National League','chart']];
paths.user = '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>';
state.teamFilter = '';
state.alpineExpanded = location.hash.startsWith('#alpine') || location.hash.startsWith('#maps-3d');
state.cupGender = 'W'; state.cupDiscipline = 'ALL'; state.statsGender = 'M';
state.hockeyExpanded = ['hockey', 'predictions'].includes(location.hash.slice(1));
const main = document.querySelector('main');
const dialog = document.querySelector('#detail-dialog');
const content = document.querySelector('#dialog-content');
const connections = new Map(); const timings = new Map(); const timingErrors = new Map(); const news = new Map(); const notified = new Set();
const timingSignatures = new Map();
let activeDetail = null; let detailTab = 'overview'; let selectedRun = null; let toastTimer; let audioContext;

const swissDay = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Zurich', year:'numeric', month:'2-digit', day:'2-digit' });
const dayKey = value => swissDay.format(new Date(value));
const today = () => dayKey(new Date());
const dateObject = value => new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
const dateFormats = new Map();
const dateLabel = (value, options = {}) => {
  const key = Object.entries(options).map(([field, format]) => field + '=' + format).join('|');
  if (!dateFormats.has(key)) dateFormats.set(key, new Intl.DateTimeFormat('it-CH', {
    timeZone:'Europe/Zurich', day:'numeric', month:'long', ...options
  }));
  return dateFormats.get(key).format(dateObject(value));
};
const swissClock = new Intl.DateTimeFormat('it-CH', { timeZone:'Europe/Zurich', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
const clock = value => value ? swissClock.format(new Date(value)) : 'Da confermare';
const since = value => { if (!value) return 'Non disponibile'; const minutes = Math.max(0, Math.floor((Date.now() - new Date(value)) / 60000)); return minutes < 1 ? 'ora' : minutes < 60 ? `${minutes} min fa` : minutes < 1440 ? `${Math.floor(minutes / 60)} h fa` : `${Math.floor(minutes / 1440)} giorni fa`; };
const countries = { ALB:'AL', LAT:'LV', JPN:'JP', BIH:'BA', HUN:'HU', ISR:'IL', AUT: 'AT', SUI: 'CH', ITA: 'IT', FRA: 'FR', FIN: 'FI', NOR: 'NO', SWE: 'SE', GER: 'DE', USA: 'US', CAN: 'CA', SLO: 'SI', SVK: 'SK', AND: 'AD', BRA: 'BR', NZL: 'NZ', GBR: 'GB', CRO: 'HR', CZE: 'CZ', POL: 'PL', ESP: 'ES', BEL: 'BE' };
const flag = country => countries[country] ? `<span class="flag" aria-label="${esc(country)}">${[...countries[country]].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('')}</span>` : '';
const team = id => data.hockey.teams.find(t => String(t.id) === String(id)) || { id, name: 'Squadra', short: '—' };
const mark = (id, big = false) => TEAM_LOGOS[String(id)] ? `<span class="team-mark logo${big ? ' big' : ''}"><img src="assets/teams/${TEAM_LOGOS[String(id)]}.png" alt="${esc(team(id).name)}" loading="lazy"></span>` : `<span class="team-mark">${esc(team(id).short)}</span>`;
const favouriteGame = g => preferences.teams.some(id => [g.home,g.away].includes(id));
const favouriteAthlete = r => preferences.athletes.includes(String(r.id || r.fisCode)) || state.alerts.athletes.includes(String(r.id || r.fisCode)) || preferences.nations.includes(r.country);
const athleteStyle = r => favouriteAthlete(r) ? `style="--favourite:${NATIONS[r.country]?.color || '#6c8051'}" class="athlete-favourite"` : '';
const leagueLogo = sport => `<img class="league-logo" src="assets/Logos/${sport === 'alpine' ? 'Fis%20Logo.jpeg' : 'National%20League%20Logo.png'}" alt="${sport === 'alpine' ? 'FIS World Cup' : 'National League'}">`;
const liveBadge = () => '<span class="status-tag live"><span class="dot live"></span>LIVE</span>';
const teamName = id => esc(team(id).name);
const liveCount = () => data.alpine.races.filter(r => r.status === 'live').length + data.hockey.games.filter(g => g.status === 'live').length;
const sportSelected = sport => !state.sports.length || state.sports.includes(sport);
const sportActive = sport => sport === 'all' ? !state.sports.length : state.sports.includes(sport);
const sportButton = (sport, title, glyph) => `<button class="chip${sportActive(sport) ? ' active' : ''}" id="sport-${sport}" data-filter="sport" data-value="${sport}" aria-pressed="${sportActive(sport)}">${icon(glyph)}${title}</button>`;
const timezoneLabel = `${icon('clock')}Europe/Zurich`;
const heading = (eyebrow, title, description, action = '') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>${action}</div>`;
const subscribeButton = `<button class="button" data-action="subscribe">${icon('calendar')}<span class="button-text">Aggiungi al calendario</span></button>`;
const sync = sport => sport==='hockey' ? `<span class="sync-note">${icon('refresh')}Punteggi SIHF · ${since(hockeyScores?.updatedAt || data.hockey.updatedAt)} · Statistiche ${since(data.hockey.updatedAt)}</span>` : `<span class="sync-note">${icon('refresh')}${esc(data[sport].source || '')} · aggiornato ${since(data[sport].updatedAt)}</span>`;
const badge = (label, cls = '') => `<span class="status-tag ${cls}">${esc(label)}</span>`;
const raceStatus = r => r.status === 'live' ? '<span class="status-tag live"><span class="dot live"></span>LIVE</span>' : r.status === 'cancelled' ? badge('Annullata', 'muted') : r.status === 'finished' ? badge('Conclusa', 'muted') : '';
const gameStatus = g => g.status === 'live' ? '<span class="status-tag live"><span class="dot live"></span>LIVE</span>' : g.status === 'finished' ? badge(`Finale${g.decision ? ' · ' + g.decision : ''}`, 'muted') : g.status === 'cancelled' ? badge('Annullata', 'muted') : `<span>${clock(g.start)}</span>`;
const empty = (title, description, symbol = 'calendar') => `<div class="empty-state">${icon(symbol)}<h3>${title}</h3>${description ? `<p>${description}</p>` : ''}</div>`;
const sourceNotice = sport => {
  const source = data[sport];
  const lastUpdate = source.updatedAt ? `${dateLabel(source.updatedAt)} alle ${clock(source.updatedAt)}` : 'non disponibile';
  if (source.status === 'stale') {
    const checked = source.lastAttemptAt ? ` Ultima verifica: ${dateLabel(source.lastAttemptAt)} alle ${clock(source.lastAttemptAt)}.` : '';
    return `<div class="notice">${icon('info')}FIS non ha risposto all'ultima verifica.${checked} Calendario disponibile dall'ultimo aggiornamento: ${lastUpdate}.</div>`;
  }
  if (Date.now() - Date.parse(source.updatedAt || 0) > 2 * 3600000) {
    return `<div class="notice">${icon('info')}Calendario FIS aggiornato l'ultima volta il ${lastUpdate}. Gli orari restano quelli dell'ultimo calendario acquisito.</div>`;
  }
  return '';
};

// Files are sprite sheets: DH, SL, giant slalom, Super-G from left to right.
const DISCIPLINE_ART = {
  DH: {file:'DH.png', slot:0, label:'Discesa libera'},
  SL: {file:'SL.png', slot:1, label:'Slalom speciale'},
  GS: {file:'SG.png', slot:2, label:'Slalom gigante'},
  SG: {file:'SP.png', slot:3, label:'Super-G'},
};
function disciplineIcon(code) {
  const art = DISCIPLINE_ART[code];
  if (!art) return `<span class="sport-icon">${esc(code)}</span>`;
  return `<span class="race-discipline-icon discipline-${code}" role="img" aria-label="${art.label}" title="${art.label}"><span class="race-icon-viewport"><img src="assets/RacesIcons/${art.file}" style="--icon-slot:${art.slot}" alt="" aria-hidden="true" loading="lazy"></span></span>`;
}

function calendarPodium(race) {
  const places = raceResults(race).filter(row => Number(row.rank) <= 3)
    .sort((a, b) => Number(a.rank) - Number(b.rank));
  if (!places.length) return '';
  return `<span class="calendar-podium">${places.map(row =>
    `<span class="podium-place" data-place="${Number(row.rank)}"><b>${Number(row.rank)}°</b>${flag(row.country)}<span>${esc(row.name)}</span></span>`
  ).join('')}</span>`;
}

function raceRow(r, showDate = true, showPodium = false) {
  const podium = showPodium ? calendarPodium(r) : '';
  return `<button class="event-row ski-event${podium ? ' with-podium' : ''} gender-${r.gender} discipline-${r.discipline}" data-race="${r.id}">${showDate ? `<span class="event-date"><strong>${Number(r.date.slice(8))}</strong><small>${dateLabel(r.date, { month: 'short', day: undefined })}</small></span>` : ''}${disciplineIcon(r.discipline)}<span class="event-main"><span class="event-title">${flag(r.country)}${esc(r.venue)}<span class="discipline-pill">${r.discipline}</span></span><span class="event-meta">${esc(r.disciplineName)} · ${r.gender === 'W' ? 'Donne' : 'Uomini'} ${r.status === 'live' ? liveBadge() : ''}</span></span>${podium}<span class="event-time">${clock(r.runs[0]?.start)}<small>${r.runs.length > 1 ? '2ª ' + clock(r.runs[1]?.start) : 'Manche unica'}</small></span>${icon('chevron')}</button>`;
}

function matchSections(g) {
  const hasScore = ['live','finished'].includes(g.status) && g.homeScore != null && g.awayScore != null;
  return `<span class="match-sections"><span class="match-teams"><span class="match-side">${mark(g.home,true)}<span>${teamName(g.home)}</span></span><span class="match-center"><strong>${hasScore ? `${esc(g.homeScore)} – ${esc(g.awayScore)}` : ['live','finished'].includes(g.status)?'– : –':'VS'}</strong>${g.decision ? `<small>${esc(g.decision)}</small>` : ''}${g.status==='live' && g.statusText ? `<small>${esc(g.statusText)}</small>` : ''}</span><span class="match-side">${mark(g.away,true)}<span>${teamName(g.away)}</span></span></span></span>`;
}
function matchPrediction(g, compact = false) {
  const p=data.predictions;
  const row=p.status==='ready' && p.predictions?.find(r=>String(r.gameId)===String(g.id));
  const available=row && Number.isFinite(row.homeProbability) && Number.isFinite(row.awayProbability);
  if(compact) return `<span class="fixture-prediction">${icon('spark')}<span><b>Previsione</b> ${available ? `${esc(team(g.home).short)} ${Math.round(row.homeProbability*100)}% · ${esc(team(g.away).short)} ${Math.round(row.awayProbability*100)}%${row.score ? ` · ${esc(row.score)}` : ''}` : 'Non disponibile'}</span></span>`;
  if(!available) return `<div class="prediction-empty">${icon('spark')}<p>Previsione non disponibile per questa partita.</p></div>`;
  return `<div class="match-forecast"><small>${esc(p.model || 'Previsione')} · ${since(p.generatedAt || p.updatedAt)}</small><div class="prediction-probabilities"><span>${teamName(g.home)}<strong>${Math.round(row.homeProbability*100)}%</strong></span><span>${teamName(g.away)}<strong>${Math.round(row.awayProbability*100)}%</strong></span></div>${row.score ? `<span>Risultato previsto: ${esc(row.score)}</span>` : ''}<small>Probabilità di vittoria stimate dal modello.</small></div>`;
}

function matchCard(g, options = {}) {
  return `<button class="match-card hockey-event${favouriteGame(g) ? ' favourite-game' : ''}" data-game="${g.id}" aria-label="${teamName(g.home)} contro ${teamName(g.away)}, ${dateLabel(g.date)}"><span class="match-card-meta"><span>${favouriteGame(g) && preferences.stars ? '★ ' : ''}NATIONAL LEAGUE</span>${gameStatus(g)}</span>${matchSections(g)}${options.showPrediction && g.status==='scheduled' ? matchPrediction(g,true) : ''}<span class="match-footer"><span>${dateLabel(g.date, { month: 'short' })}</span><span>Dettagli ↗</span></span></button>`;
}

function standingsTable(short = false) {
  const table = projectedStandings(data.hockey);
  const rows = short ? table.rows.slice(0, 5) : table.rows;
  if (short) return `<table class="mini-table"><thead><tr><th>#</th><th>Squadra</th><th>PG</th><th>PT</th></tr></thead><tbody>${rows.map(r => `<tr class="${preferences.teams.includes(String(r.team_id)) ? 'favourite-team' : ''}"><td class="rank">${r.rank}</td><td><span class="team-cell">${mark(r.team_id)}${esc(r.team_acronym)}</span></td><td>${r.games_played}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>`;
  return `<div class="standings-caption">${table.live ? liveBadge() + ' Classifica provvisoria al risultato attuale · parità in ordine ufficiale' : 'Classifica ufficiale'} · ${since(data.hockey.updatedAt)}</div><div class="scroll-table standings-table"><table class="data-table"><thead><tr><th>#</th><th>Squadra</th><th>PG</th><th>Punti</th><th>V</th><th>V OT/SO</th><th>P OT/SO</th><th>P</th><th>GF</th><th>GS</th><th>Diff.</th></tr></thead><tbody>${rows.map(r => `<tr class="${preferences.teams.includes(String(r.team_id)) ? 'selected favourite-team' : ''}"><td>${r.rank}</td><td><span class="team-cell">${mark(r.team_id)}${esc(r.team_name)}</span></td><td>${r.games_played}</td><td><b>${r.points}</b></td><td>${r.games_won_in_time}</td><td>${r.games_won_extra_time + r.games_won_penalty}</td><td>${r.games_lost_extra_time + r.games_lost_penalty}</td><td>${r.games_lost_in_time}</td><td>${r.goals_for}</td><td>${r.goals_against}</td><td>${r.goals_difference > 0 ? '+' : ''}${r.goals_difference}</td></tr>`).join('')}</tbody></table></div>`;
}

// Both sports share the same agenda geometry on the dashboard and calendar.
function agendaRow(e) {
 const hockey=e.sport==='hockey';
 const scored=hockey && ['finished','live'].includes(e.status);
 const title=hockey?`${favouriteGame(e) && preferences.stars?'★ ':''}${teamName(e.home)} – ${teamName(e.away)}`:`${flag(e.country)}${esc(e.venue)}`;
 const detail=hockey?'National League':`${esc(e.disciplineName)} · ${e.gender==='W'?'Donne':'Uomini'}`;
 const symbol=hockey?`<span class="agenda-crest-pair">${mark(e.home)}<b>${scored?`${esc(e.homeScore??'–')}:${esc(e.awayScore??'–')}`:'·'}</b>${mark(e.away)}</span>`:disciplineIcon(e.discipline);
 const start=hockey?e.start:e.runs?.[0]?.start;
 const meta=hockey?(e.status==='finished'?`Finale${e.decision?' · '+esc(e.decision):''}`:e.status==='live'?liveBadge():e.status==='cancelled'?'Annullata':''):(raceStatus(e)|| (e.runs?.length>1?`2ª · ${clock(e.runs[1].start)}`:'Manche unica'));
 return `<button class="agenda-row ${hockey?'agenda-hockey':'agenda-ski'}${hockey&&favouriteGame(e)?' favourite-game':''}" data-${hockey?'game':'race'}="${esc(e.id)}"><span class="agenda-symbol">${symbol}</span><span class="agenda-name"><strong>${title}</strong><small>${detail}</small></span><span class="agenda-time"><strong>${clock(start)}</strong>${meta?`<small>${meta}</small>`:''}</span>${icon('chevron')}</button>`;
}
const eventStart=e=>e.runs?.[0]?.start || e.start;
const eventDay=e=>eventStart(e)?dayKey(eventStart(e)):e.date;
const eventTime=e=>eventStart(e)?Date.parse(eventStart(e)):Infinity;
function chronological(a,b) { return eventDay(a).localeCompare(eventDay(b)) || eventTime(a)-eventTime(b) || String(a.id).localeCompare(String(b.id)); }
function homeCupTable(gender) {
 const group=data.cups.groups?.[gender];
 const rows=[...(group?.tables?.ALL || [])].sort((a,b)=>Number(a.rank)-Number(b.rank)).slice(0,3);
 return `<section class="cup-preview"><h3>${gender==='W'?'Donne':'Uomini'}</h3>${rows.length?`<table class="mini-table"><thead><tr><th>#</th><th>Atleta</th><th>PT</th></tr></thead><tbody>${rows.map(r=>`<tr ${athleteStyle(r)}><td>${esc(r.rank)}</td><td>${flag(r.country)}${esc(r.name)}</td><td><b>${esc(r.points)}</b></td></tr>`).join('')}</tbody></table>`:'<p class="tiny">Classifica non disponibile.</p>'}</section>`;
}
function homePage() {
 const now=Date.now(),day=today();
 const future=e=>!['finished','cancelled','live'].includes(e.status) && (eventStart(e)?eventTime(e)>=now:eventDay(e)>=day);
 const events=[...data.alpine.races.filter(future).map(r=>({...r,sport:'alpine'})),...data.hockey.games.filter(future).map(g=>({...g,sport:'hockey'}))].sort(chronological).slice(0,12);
 const nl=projectedStandings(data.hockey);
 return `<section class="home-intro"><div><div class="eyebrow">LIVE SPORT ARENA</div><h1>I tuoi sport.<br><em>Un’unica Arena.</em></h1></div><div class="home-season">Stagione <strong>${esc(data.alpine.seasonLabel || data.hockey.seasonLabel || '–')}</strong>${subscribeButton}</div></section>
 <div class="sport-entry-grid">${[['alpine','Sci alpino','Coppa del Mondo'],['hockey','Hockey','National League']].map(([id,title,sub])=>`<a class="sport-entry ${id}" href="#${id}"><div>${leagueLogo(id)}<h2>${title}</h2><span>${sub} ${icon('arrow')}</span></div></a>`).join('')}</div>
 <div class="home-dashboard"><section class="panel upcoming-events"><div class="panel-head"><h2>Prossimi eventi</h2><a class="text-button" href="#calendar">Calendario ↗</a></div>${Object.entries(groupBy(events,eventDay)).map(([day,items])=>`<div class="date-heading">${dateLabel(day,{weekday:'long'})}</div><div class="agenda-list">${items.map(agendaRow).join('')}</div>`).join('') || empty('Nessun evento in programma','')}</section>
 <aside class="home-rankings" aria-label="Classifiche"><section class="panel"><div class="panel-head"><h2>National League</h2><a class="text-button" href="#hockey/standings" aria-label="Classifica completa National League">Classifica ↗</a></div><div class="panel-body">${nl.live?liveBadge():''}${nl.rows.length?standingsTable(true):'<p class="tiny">Classifica non disponibile.</p>'}</div></section>
 <section class="panel"><div class="panel-head"><h2>Coppa del Mondo</h2><a class="text-button" href="#alpine-standings" aria-label="Classifiche complete Coppa del Mondo">Classifiche ↗</a></div><div class="panel-body">${homeCupTable('W')}${homeCupTable('M')}</div></section></aside></div>`;
}
function sportTabs() {
 return `<div class="sport-tabs" aria-label="Sport">${sportButton('all','Tutti gli sport','home')}${sportButton('alpine','Sci alpino','mountain')}${sportButton('hockey','Hockey','hockey')}</div>`;
}
function alpineTabs() {
 return `<div class="sport-tabs">${[['alpine','Stagione','calendar'],['alpine-standings','Classifiche','trophy'],['alpine-stats','Statistiche','chart']].map(([route,label,glyph])=>`<a class="chip${state.route===route?' active':''}" href="#${route}" ${state.route===route?'aria-current="page"':''}>${icon(glyph)}${label}</a>`).join('')}</div>`;
}

function runCards(r, useLive = false) {
  return `<div class="run-cards">${r.runs.map((run, index) => {
    const info = useLive ? timings.get(r.id)?.runs[index]?.info : null;
    const start = info ? venueInstant(info, r.timezone) || run.start : run.start;
    return `<div class="run-card"><small>${run.label.toUpperCase()}</small><strong>${clock(start)}</strong>${start && dayKey(start) !== r.date ? `<span class="run-day">${dateLabel(start)}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

function teamSelector() {
 return `<label class="field-label team-filter">Squadra hockey<span class="team-select-wrap"><select class="input" data-select="teamFilter" aria-label="Squadra hockey"><option value="">Tutte le squadre</option>${[...data.hockey.teams].sort((a,b)=>a.name.localeCompare(b.name,'it')).map(t=>`<option value="${esc(t.id)}"${state.teamFilter===String(t.id)?' selected':''}>${esc(t.name)}</option>`).join('')}</select>${icon('chevron')}</span></label>`;
}
function filterBar() {
 const isHockey=state.route==='hockey', isSki=state.route==='alpine';
 const ski=isSki || (!isHockey && state.sports.includes('alpine'));
 const hockey=isHockey || (!isSki && state.sports.includes('hockey'));
 const general=!isHockey && !isSki;
 const periods=[['upcoming','Prossime'],['results','Risultati']];
 if(general && !ski && !hockey) return '';
 const venues=[...new Set(data.alpine.races.map(r=>r.venue))].sort((a,b)=>a.localeCompare(b,'it'));
 return `<div class="calendar-filters">${general?'':`<div class="filter-period">${isHockey?teamSelector():''}<div class="segmented">${periods.map(([v,l])=>`<button class="${state.scope===v?'active':''}" data-filter="scope" data-value="${v}" aria-pressed="${state.scope===v}">${l}</button>`).join('')}</div><input class="input filter-date" type="date" aria-label="Filtra per data" data-select="date" value="${state.date}"><button class="text-button reset-filters" data-action="reset-filters">Azzera filtri</button></div>`}${ski || (hockey&&!isHockey) ? `<div class="sport-filter-grid">${ski?`<div class="sport-filter-group">${!isSki?`<span class="filter-caption">${icon('mountain')}Sci alpino</span>`:''}<div class="filters-group">${['all','DH','SG','GS','SL'].map(d=>{const active=d==='all'?!state.disciplines.length:state.disciplines.includes(d);return `<button id="discipline-${d}" class="chip discipline-filter discipline-${d}${active?' active':''}" data-filter="discipline" data-value="${d}" aria-pressed="${active}">${d==='all'?'Tutte le discipline':d}</button>`;}).join('')}</div><div class="filter-fields"><label class="field-label">Categoria<select class="input" data-select="gender"><option value="all"${state.gender==='all'?' selected':''}>Donne e uomini</option><option value="W"${state.gender==='W'?' selected':''}>Donne</option><option value="M"${state.gender==='M'?' selected':''}>Uomini</option></select></label><label class="field-label">Località<select class="input" data-select="query"><option value="">Tutte le località</option>${venues.map(v=>`<option value="${esc(v)}"${state.query===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label></div></div>`:''}${hockey&&!isHockey?`<div class="sport-filter-group">${teamSelector()}</div>`:''}</div>`:''}</div>`;
}

function filteredRaces() {
  const filters=state.route==='alpine' || state.sports.includes('alpine');
  return data.alpine.races.filter(r => (!state.date || dayKey(r.runs?.[0]?.start || r.date+'T12:00:00Z') === state.date) && (!filters || ((!state.disciplines.length || state.disciplines.includes(r.discipline)) && (state.gender==='all' || state.gender===r.gender) && (!state.query || r.venue===state.query))));
}
function filteredGames() {
  const filters=state.route==='hockey' || state.sports.includes('hockey');
  return data.hockey.games.filter(g => (!state.date || dayKey(g.start || g.date+'T12:00:00Z') === state.date) && (!filters || !state.teamFilter || [String(g.home),String(g.away)].includes(state.teamFilter)));
}

function skiSeasonStats() {
  const races = data.alpine.races;
  const finished = races.filter(r => r.status === 'finished').length;
  const latest = [...races].filter(r => raceResults(r).length).sort((a,b) => raceTime(b)-raceTime(a))[0];
  const winners = latest ? raceResults(latest).filter(r => Number(r.rank) === 1) : [];
  const now = Date.now();
  const next = races.filter(r => !['finished', 'cancelled', 'live'].includes(r.status)
    && (r.runs[0]?.start ? new Date(r.runs[0].start).getTime() >= now : r.date >= today()))
    .sort((a,b) => new Date(a.runs[0]?.start || a.date + 'T23:59:59Z') - new Date(b.runs[0]?.start || b.date + 'T23:59:59Z'))[0];
  return `<div class="stats-strip"><div class="stat"><span class="sport-icon">${icon('mountain')}</span><div><strong>${finished}/${races.length}</strong><small>Gare concluse</small></div></div>
  ${next ? `<button class="stat next-race-stat" data-race="${next.id}">${disciplineIcon(next.discipline)}<span><small>Prossima gara</small><strong>${flag(next.country)}${esc(next.venue)}</strong><small>${esc(next.disciplineName)} · ${next.gender === 'W' ? 'Donne' : 'Uomini'}</small><small>${dateLabel(next.runs[0]?.start || next.date, { month:'short' })} · ${clock(next.runs[0]?.start)}</small></span></button>` : `<div class="stat next-race-stat"><span class="sport-icon">${icon('calendar')}</span><div><small>Prossima gara</small><strong>Da annunciare</strong></div></div>`}
  ${latest ? `<button class="stat next-race-stat winner-stat" data-race="${latest.id}"><span class="sport-icon">${icon('trophy')}</span><span><small>${winners.length > 1 ? 'Ultimi vincitori' : 'Ultimo vincitore'}</small><strong>${winners.map(w => flag(w.country)+esc(w.name)).join(' · ')}</strong><small>${esc(latest.venue)} · ${latest.discipline} · ${latest.gender === 'W' ? 'Donne' : 'Uomini'}</small><small>${dateLabel(latest.date,{month:'short'})}</small></span></button>` : `<div class="stat"><span class="sport-icon">${icon('trophy')}</span><div><small>Ultimo vincitore</small><strong>Da assegnare</strong></div></div>`}</div>`;
}

function calendarPage(alpineOnly = false) {
  let events = [];
  if (alpineOnly || sportSelected('alpine')) events.push(...filteredRaces().map(r => ({ ...r, sport: 'alpine' })));
  if (!alpineOnly && sportSelected('hockey')) events.push(...filteredGames().map(g => ({ ...g, sport: 'hockey' })));
  events.sort(chronological);
  const listing = seasonList(events, false, !alpineOnly);
  return `${heading(alpineOnly ? 'COPPA DEL MONDO FIS' : 'SCI ALPINO E HOCKEY', alpineOnly ? 'Sci alpino' : 'Calendario', alpineOnly ? 'Discesa · Super-G · Gigante · Slalom' : timezoneLabel, subscribeButton)}${alpineOnly || sportSelected('alpine') ? sourceNotice('alpine') : ''}${alpineOnly ? `<div class="module-banner alpine">${leagueLogo('alpine')}<strong>Coppa del Mondo</strong></div>` : ''}
  ${alpineOnly ? `${skiSeasonStats()}${alpineTabs()}` : sportTabs()}
  <section class="panel"><div class="panel-head"><h2>${alpineOnly ? 'Il programma delle gare' : 'Programma della stagione'}</h2><div class="calendar-heading-tools"><span class="tiny">${events.length} eventi</span>${!alpineOnly?`<input class="input calendar-heading-date" type="date" aria-label="Filtra il calendario per data" data-select="date" value="${esc(state.date)}">${state.date || state.sports.length?'<button class="text-button" data-action="clear-calendar">Azzera</button>':''}`:''}</div></div>${filterBar()}${listing}<div class="panel-bottom">${alpineOnly || sportSelected('alpine')?sync('alpine'):''}${!alpineOnly && sportSelected('hockey')?sync('hockey'):' '}</div></section>`;
}
function groupBy(items, key) { return items.reduce((all, item) => { (all[key(item)] ||= []).push(item); return all; }, {}); }

function dayGroups(items, layout, renderItem, singular, plural) {
  return Object.entries(groupBy(items, eventDay)).map(([day, group]) =>
    `<div class="date-heading" data-season-day="${esc(day)}">${dateLabel(day, {weekday:'long', year:'numeric'})}<span>${group.length} ${group.length === 1 ? singular : plural}</span></div><div class="${layout}">${group.map(renderItem).join('')}</div>`
  ).join('');
}

function seasonList(events, hockey = false, agenda = false) {
  if (!events.length) return empty('Nessun evento con questi filtri', 'Cambia data o azzera i filtri.');
  const groups = { results: [], upcoming: [] };
  const day = today();
  for (const event of events) {
    const past = event.status === 'finished' || (event.status !== 'live' && eventDay(event) < day) ||
      (event.status === 'cancelled' && eventDay(event) === day);
    groups[past ? 'results' : 'upcoming'].push(event);
  }
  const context = [state.route, state.date, state.gender, state.query, state.teamFilter, ...state.disciplines, ...state.sports];
  const sections = Object.entries(groups).filter(([,items]) => items.length).map(([period, items]) => {
    const content = agenda
      ? dayGroups(items, 'agenda-list', agendaRow, 'evento', 'eventi')
      : hockey
      ? dayGroups(items, 'match-grid', g => matchCard(g, {showPrediction:true}), 'partita', 'partite')
      : dayGroups(items, 'mixed-events', r => raceRow(r, false, true), 'gara', 'gare');
    return `<section data-period="${period}" aria-label="${period === 'results' ? 'Risultati' : 'Prossime'}">${content}</section>`;
  });
  return `<div class="match-list-scroll season-list" data-context="${esc(JSON.stringify(context))}" role="region" tabindex="0" aria-label="${agenda ? 'Eventi' : hockey ? 'Partite' : 'Gare'} della stagione">${sections.join('')}</div>`;
}

// Keep the visible day stable while a background score update repaints the page.
function seasonPosition() {
  const list = document.querySelector('.season-list');
  if (!list) return null;
  const top = list.getBoundingClientRect().top + list.clientTop;
  const heading = [...list.querySelectorAll('[data-season-day]')].reverse().find(el => el.getBoundingClientRect().top <= top + 1);
  return heading && {context:list.dataset.context, period:heading.parentElement.dataset.period,
    day:heading.dataset.seasonDay, offset:top - heading.getBoundingClientRect().top};
}

function scrollToSeasonItem(list, item, offset = 0) {
  if (item) list.scrollTop += item.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop + offset;
}

function jumpToPeriod(list, period) {
  const section = list.querySelector(`[data-period="${period}"]`);
  if (!section) return;
  const target = period === 'results' ? [...section.querySelectorAll('[data-season-day]')].at(-1) : section;
  scrollToSeasonItem(list, target);
}

function bindSeasonList(previous) {
  const list = document.querySelector('.season-list');
  const buttons = [...document.querySelectorAll('[data-filter="scope"]')];
  buttons.forEach(button => { button.disabled = !list?.querySelector(`[data-period="${button.dataset.value}"]`); });
  if (!list) return;
  const upcoming = list.querySelector('[data-period="upcoming"]');
  let visiblePeriod;
  const sync = () => {
    const atUpcoming = upcoming && upcoming.getBoundingClientRect().top <= list.getBoundingClientRect().top + list.clientTop + 1;
    const period = atUpcoming ? 'upcoming' : 'results';
    if (visiblePeriod === period) return;
    visiblePeriod = state.scope = period;
    buttons.forEach(button => {
      const selected = button.dataset.value === state.scope;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  };
  const saved = !state.resetSeasonPosition && previous?.context === list.dataset.context &&
    list.querySelector(`[data-period="${previous.period}"] [data-season-day="${previous.day}"]`);
  if (saved) scrollToSeasonItem(list, saved, previous.offset);
  else {
    const preferred = list.querySelector(`[data-period="${state.scope}"]`);
    const period = preferred?.dataset.period || list.firstElementChild.dataset.period;
    jumpToPeriod(list, period);
  }
  state.resetSeasonPosition = false;
  sync();
  list.addEventListener('scroll', sync, {passive:true});
}


function hockeyPage() {
  return `${heading('NATIONAL LEAGUE · SVIZZERA', 'Hockey', '', `<button class="button" data-action="hockey-calendar">${icon('calendar')}Aggiungi al calendario</button>`)}<div class="module-banner hockey">${leagueLogo('hockey')}<strong>National League</strong></div>${hockeyWidgets()}
  <div class="sport-tabs">${[['calendar', 'Stagione', 'calendar'], ['standings', 'Classifica', 'trophy'], ['stats', '🔥 Top Scorer', '']].map(([v, label, symbol]) => `<button class="chip${state.hockeyTab === v ? ' active' : ''}" data-hockey-tab="${v}">${symbol ? icon(symbol) : ''}${label}</button>`).join('')}</div>
  <section class="panel"><div class="panel-head"><div><h2>${state.hockeyTab === 'calendar' ? 'Il programma della National League' : state.hockeyTab === 'standings' ? 'Classifica generale' : '🔥 PostFinance Top Scorer'}</h2><p>Stagione ${esc(data.hockey.seasonLabel)}</p></div>${badge('NATIONAL LEAGUE')}</div>
  ${state.hockeyTab === 'calendar' ? `${filterBar()}${seasonList(filteredGames().sort(chronological), true)}` : state.hockeyTab === 'standings' ? standingsTable() : `<div class="scorer-section"><div class="scorer-toolbar"><a class="button" href="#hockey-stats">${icon('chart')}Statistiche National League ↗</a></div>${playerLeaders()}</div>`}
  <div class="panel-bottom">${sync('hockey')}<button class="text-button" data-action="csv">Scarica statistiche CSV ↗</button></div></section>`;
}

function playerLeaders() {
 const number = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
 const candidates = (data.hockey.leaders || []).filter(p => p.team_id != null && number(p.points) != null)
   .map((p,index)=>({...p,points:number(p.points),sourceOrder:index}))
   .sort((a,b)=>b.points-a.points || (number(a.rank) ?? Infinity)-(number(b.rank) ?? Infinity) || a.sourceOrder-b.sourceOrder);
 const perTeam = new Map();
 for(const player of candidates) if(!perTeam.has(String(player.team_id))) perTeam.set(String(player.team_id),player);
 const leaders = [...perTeam.values()].map((p,index,all)=>({...p,
   rank: all.findIndex(other=>other.points===p.points)+1, chf:p.points*300}));
 if(!leaders.length && !data.hockey.teams.length) return empty('Top Scorer non disponibili','In attesa dei dati SIHF.','chart');
 const rows=[...leaders,...data.hockey.teams.filter(t=>!perTeam.has(String(t.id))).map(t=>({team_id:t.id,player:'Non disponibile',rank:'–',points:null,chf:null}))];
 const money=value=>new Intl.NumberFormat('it-CH',{style:'currency',currency:'CHF',maximumFractionDigits:0}).format(value);
 const total=rows.reduce((sum,p)=>sum+p.chf,0);
 return `<div class="scorer-summary"><p class="tiny">Stagione ${esc(data.hockey.seasonLabel)} · Statistiche SIHF ${since(data.hockey.updatedAt)}${data.hockey.status==='stale'?' · Ultimi dati in cache':''}</p><p><strong>${leaders.length?money(total):'–'}</strong><br><span class="tiny">Totale · ${leaders.length} squadre con dati</span></p></div>${rows.length ? `<div class="scroll-table"><table class="data-table"><thead><tr><th>#</th><th>Giocatore</th><th>Squadra</th><th>Goal</th><th>Assist</th><th>Punti</th><th>CHF per i giovani</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${p.rank}</td><td>${esc(p.player)}</td><td><span class="team-cell">${mark(p.team_id)}${esc(p.team_acronym || team(p.team_id).short)}</span></td><td>${esc(p.goals ?? '–')}</td><td>${esc(p.assists ?? '–')}</td><td><b>${p.points??'–'}</b></td><td data-sort-value="${p.chf??''}"><b>${p.chf==null?'–':money(p.chf)}</b></td></tr>`).join('')}</tbody></table></div>` : empty('Nessun dato per questa squadra','Prova il filtro «Tutte le squadre».')}`;
}

function generalPlayerLeaders() {
  const rows = data.hockey.leaders.filter(p => !state.teamFilter || state.teamFilter === String(p.team_id)).sort((a,b)=>a.rank-b.rank);
  return `<div class="scroll-table"><table class="data-table" data-table-tools="Giocatore o squadra"><thead><tr><th>#</th><th>Giocatore</th><th>Squadra</th><th>PG</th><th>Goal</th><th>Assist</th><th>Punti</th><th>+/−</th><th>Penalità</th></tr></thead><tbody>${rows.map(p => `<tr><td>${p.rank}</td><td class="athlete-name">${esc(p.player)}</td><td><span class="team-cell">${mark(p.team_id)}${esc(p.team_acronym)}</span></td><td>${p.games_played}</td><td>${p.goals}</td><td>${p.assists}</td><td><b>${p.points}</b></td><td>${esc(p.plus_minus ?? '–')}</td><td>${esc(p.pim_total ?? '–')}</td></tr>`).join('')}</tbody></table></div>`;
}

function liveRacePreview(race) {
  const timing = timings.get(race.id);
  const rows = timing ? rowsForRun(timing) : [];
  const podium = rows.filter(r => r.rank && r.rank <= 3).sort((a,b) => a.rank-b.rank);
  return `<article class="panel live-race">${raceRow(race)}${timingErrors.has(race.id) ? `<p class="tiny">${esc(timingErrors.get(race.id))}</p>` : ''}<div class="live-podium">${podium.map(r => `<div ${athleteStyle(r)}><b>${r.rank}</b> ${flag(r.country)} ${esc(r.name)} <strong>${duration(r.total)}</strong></div>`).join('')}${rows.filter(r => r.status === 'start').map(r => `<div class="on-course">In pista · ${flag(r.country)} ${esc(r.name)}</div>`).join('')}</div></article>`;
}
function livePage() {
  const races = data.alpine.races.filter(r => r.status === 'live');
  const games = data.hockey.games.filter(g => g.status === 'live');
  return `${heading('', 'In diretta', '')}${sportTabs()}<div class="live-sections">${sportSelected('alpine')?`<section><div class="panel-head"><h2>${leagueLogo('alpine')} Sci alpino</h2></div><div id="live-race-previews">${races.map(liveRacePreview).join('') || empty('Nessun evento attuale','','mountain')}</div></section>`:''}${sportSelected('hockey')?`<section><div class="panel-head"><h2>${leagueLogo('hockey')} Hockey</h2><span class="tiny">${since(hockeyScores?.updatedAt || data.hockey.updatedAt)}</span></div>${games.length ? `<div class="match-grid">${games.map(matchCard).join('')}</div>` : empty('Nessun evento attuale','','hockey')}</section>`:''}</div>`;
}

function predictionsPage() {
  const p = data.predictions;
  const games = data.hockey.games.filter(g => (p.gameIds || []).includes(g.id));
  const active = p.status === 'ready';
  return `${heading('NATIONAL LEAGUE', 'Previsioni', 'Prossima giornata')}
  <section class="panel"><div class="panel-head"><div><h2>${p.targetDate ? 'Partite di ' + dateLabel(p.targetDate, { weekday: 'long' }) : 'La prossima giornata'}</h2><p>${active ? `${esc(p.model)} · versione ${esc(p.version)} · elaborato ${since(p.generatedAt)}` : ''}</p></div>${badge(active ? 'PREVISIONI DISPONIBILI' : p.status === 'no_model' ? 'MODELLO NON ATTIVO' : 'IN ATTESA', active ? '' : 'muted')}</div><div class="process"><span class="${p.previousDayComplete ? 'done' : ''}">${icon(p.previousDayComplete ? 'check' : 'clock')}Giornata precedente conclusa</span><span class="next">→</span><span class="${active ? 'done' : ''}">${icon(active ? 'check' : 'spark')}Elaborazione del modello</span><span class="next">→</span><span>Nuove previsioni</span></div>
  ${!active ? `<div class="panel-body"><div class="notice">${icon('info')}${p.status === 'no_model' ? 'Previsioni non attive.' : p.status === 'error' ? 'Previsioni non disponibili per questa giornata.' : 'In attesa dei risultati completi del turno precedente.'}</div></div>` : ''}
  <div class="prediction-grid">${games.map(g => `<article class="prediction-card"><div class="match-card-meta"><span>${clock(g.start)}</span><button class="text-button" data-game="${g.id}">Partita ↗</button></div>${matchSections(g)}${matchPrediction(g)}</article>`).join('')}</div>${!games.length ? empty('Prossimo turno da definire', '') : ''}<div class="panel-bottom"><span>${timezoneLabel}</span>${active ? '<span>Probabilità stimate.</span>' : ''}</div></section>`;
}

function detailPage(type) {
 const item=(type==='game'?data.hockey.games:data.alpine.races).find(r=>r.id===state.detailId);
 return item ? '<section class="panel full-detail" id="full-detail"></section>' : empty('Evento non disponibile','Torna al calendario.');
}
function hockeyWidgets() {
 const games=data.hockey.games, upcoming=games.filter(g=>g.status==='scheduled'&&g.date>=today()).sort((a,b)=>(a.start||a.date).localeCompare(b.start||b.date));
 const next=upcoming[0], leader=[...data.hockey.standings].sort((a,b)=>Number(a.rank)-Number(b.rank))[0];
 return `<div class="stats-strip hockey-widgets"><div class="stat"><div><strong>${games.filter(g=>g.status==='finished').length}/${games.length}</strong><small>Partite disputate</small></div></div><div class="stat"><div><small>Prossima giornata</small><strong>${next?dateLabel(next.date,{month:'short'}):'Da annunciare'}</strong>${preferences.teams.map(id=>{const g=upcoming.find(g=>[g.home,g.away].includes(id));return `<div class="next-team-game">${mark(id)}<span>${teamName(id)}<small>${g?`${dateLabel(g.date,{month:'short'})} · ${clock(g.start)}<br>${teamName(g.home)} – ${teamName(g.away)}`:'Da annunciare'}</small>${g?`<a class="text-button" href="#game/${g.id}">Dettagli ↗</a>`:''}</span></div>`;}).join('')}</div></div><button class="stat" data-action="standings">${leader?mark(leader.team_id):icon('trophy')}<div><small>Prima in classifica</small><strong>${leader?teamName(leader.team_id):'–'}</strong><small>${leader?leader.points+' punti':''}</small></div></button></div>`;
}
const roleLabel=value=>({ 'Stürmer':'Attaccante', 'Verteidiger':'Difensore', 'Torhüter':'Portiere', 'Torwart':'Portiere', 'Forward':'Attaccante', 'Defender':'Difensore', 'Defenseman':'Difensore', 'Goalkeeper':'Portiere', 'Goalie':'Portiere', 'goalkeeper':'Portiere', 'F':'Attaccante', 'D':'Difensore', 'G':'Portiere' }[value] || value);
function tableLegend(){return '<p class="table-legend">PG: partite giocate · G/GF: goal segnati · GS/GA: goal subiti · A: assist · PT: punti · V/P: vittoria/sconfitta · PIM: minuti di penalità · TOI: tempo sul ghiaccio · SOG: tiri in porta · OT: supplementari · SO: rigori · +/−: bilancio goal sul ghiaccio. </p>';}
function allColumns(rows, showAll = false) {
 if(!rows?.length) return empty('Dati non disponibili','');
 const omit=['season','phase_id','row_type','game_id'];
 rows=[...rows].sort((a,b)=>(a.rank??0)-(b.rank??0));
 const available=[...new Set(rows.flatMap(Object.keys))];
 const hasTeamName=rows.some(r=>r.team_name);
 const keys=available.filter(k=>!omit.includes(k)&&!k.endsWith('_id')&&!(k==='team_acronym'&&hasTeamName));
 const labels=keys.map(hockeyColumn);
 return `<div class="scroll-table"><table class="data-table hockey-data-table" data-table-tools="Cerca nei dati"${showAll ? ' data-default-rows="all"' : ''}><thead><tr>${labels.map(([abbr,meaning])=>`<th scope="col" title="${esc(meaning)}">${esc(abbr)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${['team_acronym','team_name'].includes(k) && r.team_id ? `<span class="team-cell">${mark(r.team_id)}${esc(r[k])}</span>` : esc(r[k]==null?'–':['position','player_position','unit'].includes(k)?roleLabel(r[k]):typeof r[k]==='object'?JSON.stringify(r[k]):r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><details class="table-legend"><summary>Legenda delle colonne</summary>${labels.map(([abbr,meaning])=>`<div><b>${esc(abbr)}</b> · ${esc(meaning)}</div>`).join('')}</details>`;
}
const hockeyStatNumber = new Intl.NumberFormat('it-CH', {maximumFractionDigits:2});

function hockeyStatisticsPage() {
  if (state.detailId === 'tabelle') return hockeyTablesPage();
  const {tables} = data.hockeyStats;
  const games = data.hockey.games;
  const finished = games.filter(g => g.status === 'finished');
  const scored = finished.filter(g => Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore));
  const overtime = finished.filter(g => g.decision === 'OT' || g.decision === 'SO').length;
  const awayWins = scored.filter(g => g.awayScore > g.homeScore).length;
  const summary = [
    ['Partite concluse', games.length ? finished.length : '–'],
    ['Vittorie in trasferta', scored.length ? awayWins : '–'],
    ['Partite oltre i 60 minuti', finished.length ? overtime : '–']
  ];
  const headingLink = `<a class="button" href="#hockey-stats/tabelle">${icon('chart')}Vedi tutte le statistiche ${icon('arrow')}</a>`;
  const cards = [
    {title:'Punti dei giocatori', table:'player_stats', metric:'points', unit:' PT', glyph:'trophy',
      caption:r => `${r.goals ?? '–'} G · ${r.assists ?? '–'} A`},
    {title:'Portieri per percentuale di parate', table:'goalie_stats', metric:'saves_percentage', unit:'%', glyph:'hockey',
      qualify:r => r.shots_against >= 100, note:'Almeno 100 tiri in porta subiti.', caption:r => `${r.saves ?? '–'} parate su ${r.shots_against} tiri`},
    {title:'Migliori attacchi', table:'team_goals', metric:'goals_for_quotient', unit:'', glyph:'hockey',
      note:'Goal segnati per partita.', caption:r => `${r.goals_for ?? '–'} goal in ${r.games_played ?? '–'} partite`},
    {title:'Power play', table:'team_power_play', metric:'pp_percent', unit:'%', glyph:'spark',
      qualify:r => r.pp_opportunities > 0, note:'Superiorità numeriche trasformate in goal.'},
    {title:'Box play', table:'team_penalty_kill', metric:'pk_percent', unit:'%', glyph:'chart',
      qualify:r => r.pk_situations > 0, note:'Inferiorità numeriche superate senza subire goal.'}
  ];
  const rankings = cards.map(card => {
    const rows = (tables?.[card.table]?.rows || [])
      .filter(r => Number.isFinite(r[card.metric]) && r[card.metric] >= 0 && (!card.qualify || card.qualify(r)))
      .sort((a,b) => b[card.metric] - a[card.metric] || (a.rank ?? Infinity) - (b.rank ?? Infinity)).slice(0,5);
    return `<section class="panel"><div class="panel-head"><h2>${card.title}</h2>${icon(card.glyph)}</div>
      ${rows.length ? `<ol class="hockey-stat-ranking">${rows.map(row => {
        const name = row.player || row.team_name;
        const detail = [row.player && row.team_acronym, card.caption?.(row)].filter(Boolean).join(' · ');
        const value = hockeyStatNumber.format(row[card.metric]) + card.unit;
        return `<li>${mark(row.team_id)}<div><strong>${esc(name)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div><b>${esc(value)}</b>
          <progress value="${row[card.metric]}" max="${card.unit === '%' ? 100 : Math.max(1, rows[0][card.metric])}" aria-label="${esc(name)} · ${esc(value)}"></progress></li>`;
      }).join('')}</ol>` : '<p class="panel-body">Dati non disponibili.</p>'}
      ${card.note ? `<div class="panel-bottom">${card.note}</div>` : ''}</section>`;
  });
  // A shootout adds a deciding goal to the final score, but no goal to game play.
  const totalGoals = g => g.homeScore + g.awayScore - (g.decision === 'SO' ? 1 : 0);
  const highest = [...scored].sort((a,b) => totalGoals(b)-totalGoals(a) || b.date.localeCompare(a.date)).slice(0,5);
  const matches = `<section class="panel"><div class="panel-head"><h2>Partite con più goal</h2>${icon('hockey')}</div>
    <div class="insight-list">${highest.map(g => `<button data-game="${esc(g.id)}"><span><strong>${teamName(g.home)} – ${teamName(g.away)}</strong><small>${dateLabel(g.date)} · ${totalGoals(g)} goal in gioco</small></span><b>${g.homeScore}–${g.awayScore}${g.decision ? ' ' + esc(g.decision) : ''}</b></button>`).join('') || '<p>Dati non disponibili.</p>'}</div></section>`;
  return `${heading('NATIONAL LEAGUE','Statistiche',esc(data.hockey.seasonLabel || ''),headingLink)}
    <div class="stats-strip hockey-insight-summary">${summary.map(([label,value]) => `<div class="stat"><div><strong>${value}</strong><small>${label}</small></div></div>`).join('')}</div>
    <div class="insights-grid hockey-insights">${rankings.join('')}${matches}</div>`;
}


function hockeyTablesPage() {
 const tables=data.hockeyStats.tables||{};
 const entries=Object.entries(tables).sort(([a],[b])=>a==='player_stats'?-1:b==='player_stats'?1:0);
 const selectedKey = tables[state.leagueTable] ? state.leagueTable : entries[0]?.[0];
 const selected = tables[selectedKey];
 const label=(key,t)=>key==='player_stats'?'Top Scorer · tutti i giocatori':(t?.label||'Statistiche National League').replaceAll('Gol','Goal');
 return `${heading('NATIONAL LEAGUE','Tutte le statistiche',esc(data.hockey.seasonLabel || ''),'<a class="button" href="#hockey-stats">← Panoramica</a>')}<section class="panel"><div class="filter-row statistics-filters"><label class="field-label statistics-category">Categoria<select class="input" data-select="leagueTable">${entries.map(([key,t])=>`<option value="${key}"${key===selectedKey?' selected':''}>${esc(label(key,t))}</option>`).join('')}</select></label><span class="tiny">${selected?.updatedAt?since(selected.updatedAt):''}</span></div><div class="panel-head"><h2>${esc(label(selectedKey,selected))}</h2></div>${selected?.status==='stale'?'<p class="notice">Fonte temporaneamente non disponibile: ultimi dati acquisiti.</p>':''}${allColumns(selected?.rows||[])}</section>`;
}

function teamForm(id,before) {
 return data.hockey.games.filter(g=>g.status==='finished'&&[g.home,g.away].includes(id)&&(!before||(g.start||g.date+'T23:59:59Z')<before)).sort((a,b)=>(b.start||b.date).localeCompare(a.start||a.date)).slice(0,5);
}
function formDots(id,before) {
 const games=teamForm(id,before);
 return `<section class="team-form"><h3>${mark(id)} ${teamName(id)}</h3><div class="form-dots">${games.map(m=>{
  const known=m.homeScore!=null&&m.awayScore!=null;
  const won=known&&(m.home===id ? m.homeScore>m.awayScore : m.awayScore>m.homeScore);
  const result=known?(won?'Vittoria':'Sconfitta'):'Risultato non disponibile';
  const label=`${result}${m.decision?' · '+m.decision:''} · ${dateLabel(m.date,{month:'short'})} · ${team(m.home).name} ${m.homeScore??'–'}–${m.awayScore??'–'} ${team(m.away).name}`;
  return `<button class="form-result" data-game="${m.id}" title="${esc(label)}" aria-label="${esc(label)}"><span class="form-dot ${known?(won?'won':'lost'):'unknown'}">${known?(won?'V':'P'):'–'}</span><small>${dateLabel(m.date,{month:'short'})}</small><span class="form-score">${m.homeScore??'–'}–${m.awayScore??'–'}</span></button>`;
 }).join('')}</div>${games.length?'<p class="tiny">Più recente a sinistra · V = vittoria · P = sconfitta</p>':'<p class="tiny">Nessun risultato precedente disponibile</p>'}</section>`;
}
function gameExtra(g,d,tab) {
 const form=()=>`<div class="form-grid">${[g.home,g.away].map(id=>formDots(id,g.start||g.date+'T00:00:00Z')).join('')}</div>`;
 const info=d?.info?.[0];
 if(tab==='prediction') return matchPrediction(g);
 if(tab==='form') return form()+standingsTable()+tableLegend();
 if(tab==='summary') return `<div class="panel-body"><h3>Riepilogo</h3><p>${esc(info?.venue_name||'')}${info?.venue_city?' · '+esc(info.venue_city):''}${info?.spectators!=null?' · '+info.spectators+' spettatori':''}</p><div class="period-grid">${(g.homePeriods||[]).map((v,i)=>`<div><small>${i<3?(i+1)+'° periodo':i===3?'Supplementari':'Rigori'}</small><strong>${v??'–'} – ${g.awayPeriods?.[i]??'–'}</strong></div>`).join('')}</div>${referees(info)}<h3>Ultime cinque partite prima dell’incontro</h3>${form()}<a class="text-button" href="${safeUrl(g.sourceUrl)}" target="_blank" rel="noopener">Fonte SIHF ↗</a></div>`;
 const stats=d?.stats||[];
 return `<div class="panel-body"><h3>Tiri e gol per periodo</h3><div class="period-grid">${(info?.home_shots_by_period||[]).map((v,i)=>`<div><small>${i+1}° periodo · tiri casa/ospiti</small><strong>${v??'–'} / ${info.away_shots_by_period?.[i]??'–'}</strong></div>`).join('')||'<p>Dati per periodo non disponibili</p>'}</div><div class="stat-bars">${stats.filter(r=>Number.isFinite(Number(r.home_value))&&Number.isFinite(Number(r.away_value))&&r.home_value!=null&&r.away_value!=null&&Number(r.home_value)>=0&&Number(r.away_value)>=0).map(r=>{const a=Number(r.home_value),b=Number(r.away_value),sum=a+b||1;return `<div><div class="stat-bar-head"><b>${a}</b><span>${esc(r.statistic)}</span><b>${b}</b></div><div class="stat-bar-track"><i style="width:${a/sum*100}%"></i><i style="width:${b/sum*100}%"></i></div></div>`;}).join('')}</div>${tableLegend()}</div>`;
}
function mapLink(race) {
  const map = mapForRace(race);
  return map ? `<a class="button map-launch" target="_self" href="maps-3d/${map.id}.html?race=${encodeURIComponent(race.id)}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5m-9 5v10"/></svg>Esplora in 3D</a>`
    : '<span class="tiny">Mappa 3D non disponibile</span>';
}

function mapsPage() {
  const selected = state.detailId || 'all';
  const filters = ['all', 'DH', 'SG', 'GS', 'SL'].map(d =>
    `<a class="chip discipline-filter discipline-${d}${selected === d ? ' active' : ''}" href="#maps-3d${d === 'all' ? '' : '/' + d}" ${selected === d ? 'aria-current="true"' : ''}>${d === 'all' ? 'Tutte le discipline' : cupNames[d]}</a>`
  ).join('');
  const groups = new Map();
  for (const map of skiMaps) {
    if (selected !== 'all' && selected !== map.discipline) continue;
    const key = map.location + ' · ' + map.course;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(map);
  }
  const cards = [...groups].sort(([a], [b]) => a.localeCompare(b, 'it')).map(([label, maps]) =>
    `<article class="map-card"><header><span class="map-flag">${mapFlags[maps[0].iso]}</span><div><h2>${esc(maps[0].location)}</h2><small>${esc(maps[0].course)} · ${esc(maps[0].country)}</small></div></header>
      ${maps.map(m => `<a class="map-discipline" target="_self" href="maps-3d/${m.id}.html"><b data-disc="${m.discipline}">${m.discipline}</b><strong>${esc(m.disciplineLabel)}${maps.some(other => other !== m && other.discipline === m.discipline) ? (m.gender === 'W' ? ' donne' : ' uomini') : ''}</strong><small>${esc(m.terrain)}</small></a>`).join('')}</article>`
  ).join('');
  return `${heading('SCI ALPINO', 'Mappe 3D', 'Diorami interattivi delle piste di Coppa del Mondo. Le geometrie sono illustrative.')}<nav class="filters-group" aria-label="Filtra le mappe per disciplina">${filters}</nav><div class="ski-map-grid">${cards}</div>`;
}

function trackSection(race, course) {
 if(!course) return `<section class="panel track-panel"><div class="panel-head"><h2>Tracciato</h2></div><div class="panel-body"><p>Dati pista non disponibili.</p><a class="text-button" href="${safeUrl(race.sourceUrl)}" target="_blank" rel="noopener">Documenti ufficiali FIS ↗</a></div></section>`;
 return `<section class="panel track-panel"><div class="panel-head"><h2>${esc(course.name)}</h2><span class="tiny">Verificato ${esc(course.verifiedAt)}</span></div><div class="panel-body"><p class="tiny">Tracciato di riferimento. Partenza e lunghezza variano secondo la gara.</p><div class="period-grid">${course.facts.map(f=>`<div><small>${esc(f.label)}</small><strong>${esc(f.value)}</strong><a class="text-button" href="${safeUrl(f.source)}" target="_blank" rel="noopener">Fonte ↗</a></div>`).join('')}</div><p>${esc(course.history.text)} <a class="text-button" href="${safeUrl(course.history.source)}" target="_blank" rel="noopener">Fonte ↗</a></p>${course.geometry?.source ? `<div data-course-map="${course.id}"></div>` : mapLink(race)}${course.pois.map(p=>`<details class="track-poi"><summary>${esc(p.name)} · ${esc(p.category)}</summary><p>${esc(p.description)} <a class="text-button" href="${safeUrl(p.source)}" target="_blank" rel="noopener">Fonte ↗</a></p></details>`).join('')}</div></section>`;
}

function renderNavigation() {
  const childRoutes = ['maps-3d','predictions','settings','alpine-standings','alpine-stats','hockey-stats'];
  document.querySelector('#navigation').innerHTML = navigation.filter(n => !childRoutes.includes(n[0])).map(([route,label,symbol],i) => {
    const children=route==='alpine'?[['alpine','Stagione','calendar'],['alpine-standings','Classifiche','trophy'],['alpine-stats','Statistiche','chart'],['maps-3d','Mappe 3D','mountain']]:route==='hockey'?[['hockey','Stagione','calendar'],['hockey/standings','Classifica','trophy'],['hockey-stats','Statistiche','chart'],['predictions','Previsioni','spark']]:[];
    const expanded=state[route+'Expanded'];
    const current=state.route==='hockey'?hockeyRoute(state.hockeyTab):state.route;
    const active=!children.length && route===current;
    return `${i===3?'<div class="nav-divider"></div><div class="nav-caption">I TUOI SPORT</div>':''}<div class="nav-row"><a class="nav-item${active?' active':''}${route==='live'&&liveCount()?' live-glow':''}" href="#${route}" title="${label}" ${active?'aria-current="page"':''}>${icon(symbol)}<span class="nav-label">${label}</span>${route==='live'&&liveCount()?liveBadge():''}</a>${children.length?`<button class="nav-expand${expanded?' expanded':''}" data-action="expand-${route}" aria-label="Sezioni ${label}" aria-expanded="${!!expanded}" aria-controls="submenu-${route}">${icon('chevron')}</button>`:''}</div>${children.length?`<div id="submenu-${route}" class="nav-submenu${expanded?' expanded':''}" ${expanded?'':'inert'}><div>${children.map(([id,title,glyph])=>`<a class="nav-item nav-child${current===id?' active':''}" href="#${id}" title="${title}" aria-label="${label}: ${title}" ${current===id?'aria-current="page"':''}>${icon(glyph)}<span class="nav-label">${title}</span></a>`).join('')}</div></div>`:''}`;
  }).join('');
}
function toggleSportMenu(sport) {
  state[sport+'Expanded'] = !state[sport+'Expanded'];
  const open = state[sport+'Expanded'];
  const panel = document.getElementById('submenu-'+sport);
  const button = document.querySelector(`[data-action="expand-${sport}"]`);
  panel.classList.toggle('expanded',open); panel.toggleAttribute('inert',!open);
  button.classList.toggle('expanded',open); button.setAttribute('aria-expanded',String(open));
}
const cupNames = {ALL:'Generale', DH:'Discesa', SL:'Slalom', GS:'Gigante', SG:'Super-G'};
function alpineStandingsPage() {
  const group = data.cups.groups?.[state.cupGender];
  const rows = [...(group?.tables?.[state.cupDiscipline] || [])].sort((a,b)=>Number(a.rank)-Number(b.rank));
  const leader = rows[0]?.points || 0;
  return `${heading('COPPA DEL MONDO', 'Classifiche', data.alpine.seasonLabel || '')}<div class="module-banner alpine">${leagueLogo('alpine')}<strong>Coppa del Mondo</strong></div>
  ${alpineTabs()}<section class="panel"><div class="filter-row"><div class="segmented">${[['W','Donne'],['M','Uomini']].map(([id,label]) => `<button data-filter="cupGender" data-value="${id}" class="${state.cupGender === id ? 'active' : ''}" aria-pressed="${state.cupGender === id}">${label}</button>`).join('')}</div><div class="filters-group">${Object.entries(cupNames).map(([id,label]) => `<button class="chip${state.cupDiscipline === id ? ' active' : ''}" data-filter="cupDiscipline" data-value="${id}" aria-pressed="${state.cupDiscipline === id}">${label}</button>`).join('')}</div></div>
  <div class="panel-head"><h2>${cupNames[state.cupDiscipline]} · ${state.cupGender === 'W' ? 'Donne' : 'Uomini'}</h2><span class="tiny">${group?.updatedAt ? 'FIS · '+since(group.updatedAt) : 'FIS'}</span></div>
  ${group?.status === 'stale' ? '<div class="panel-body"><div class="notice">Aggiornamento FIS in ritardo.</div></div>' : ''}
  ${rows.length ? `<div class="scroll-table"><table class="data-table cup-table"><thead><tr><th>#</th><th>Atleta</th><th>Nazione</th><th>Punti</th><th>Distacco punti</th></tr></thead><tbody>${rows.map(r => `<tr ${athleteStyle(r)}><td class="rank">${r.rank}</td><td class="athlete-name"><a href="${safeUrl(r.athleteUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a></td><td>${flag(r.country)}${esc(r.country)}</td><td><div class="cup-points"><strong>${r.points}</strong><span style="width:${leader ? Math.round(r.points/leader*100) : 0}%"></span></div></td><td>${leader-r.points || '—'}</td></tr>`).join('')}</tbody></table></div>` : empty(group?.status === 'ok' ? 'Nessun punto assegnato' : 'Classifica non disponibile', group?.status === 'ok' ? 'In attesa delle prime gare.' : 'In attesa dei dati ufficiali FIS.','trophy')}
  <div class="panel-bottom"><span>Punti ufficiali della stagione</span>${group?.sourceUrl ? `<a class="text-button" href="${safeUrl(group.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte FIS ↗</a>` : ''}</div></section>`;
}
function alpineStatsPage() {
  const m=seasonMetrics(data.alpine.races,state.statsGender);
  const maxVenues=Math.max(1,...m.venues.map(v=>v.total));
  const maxDisc=Math.max(1,...m.disciplines.map(d=>d[1]));
  return `${heading('SCI ALPINO', 'Statistiche', data.alpine.seasonLabel || '')}${alpineTabs()}<div class="sport-tabs">${[['M','Uomini'],['W','Donne']].map(([id,label]) => `<button class="chip${state.statsGender === id ? ' active' : ''}" data-filter="statsGender" data-value="${id}" aria-pressed="${state.statsGender === id}">${label}</button>`).join('')}</div>
  <div class="stats-strip"><div class="stat"><div><strong>${m.covered}/${m.finished}</strong><small>Gare concluse con risultati disponibili</small></div></div><div class="stat"><div><strong>${m.athletes.length}</strong><small>Atleti classificati nelle gare disponibili</small></div></div><div class="stat"><div><strong>${m.venues.length}</strong><small>Località nel calendario</small></div></div></div>
  <div class="insights-grid"><section class="panel"><div class="panel-head"><h2>Vittorie e podi</h2>${icon('trophy')}</div>${m.athletes.length ? `<div class="scroll-table"><table class="data-table"><thead><tr><th>Atleta</th><th>Vittorie</th><th>Podi</th><th>Top 10</th></tr></thead><tbody>${m.athletes.slice(0,15).map(a=>`<tr ${athleteStyle(a)}><td>${flag(a.country)}${esc(a.name)}</td><td><b>${a.wins}</b></td><td>${a.podiums}</td><td>${a.top10}</td></tr>`).join('')}</tbody></table></div>` : empty('Nessun risultato disponibile','','trophy')}<div class="panel-bottom">Primi 15 per vittorie, podi e top 10 · risultati disponibili.</div></section>
  <section class="panel"><div class="panel-head"><h2>Distacchi minimi</h2>${icon('clock')}</div><div class="insight-list">${m.closeRaces.slice(0,5).map(({race,gap,winner})=>`<button data-race="${race.id}"><div>${flag(race.country)}<strong>${esc(race.venue)}</strong><small>${race.discipline} · ${race.gender==='W'?'Donne':'Uomini'} · ${dateLabel(race.date,{month:'short'})}<br>${esc(winner.name)}</small></div><b>${gap.toFixed(2)} s</b></button>`).join('') || empty('Dati non disponibili','','clock')}</div><div class="panel-bottom">Distacco tra il primo e il secondo atleta classificato.</div></section>
  <section class="panel"><div class="panel-head"><h2>Gare per specialità</h2>${icon('calendar')}</div><div class="insight-bars">${m.disciplines.map(([code,count])=>`<div class="discipline-${code}"><div>${disciplineIcon(code)}<span>${cupNames[code]}</span><b>${count}</b></div><progress value="${count}" max="${maxDisc}" aria-label="${cupNames[code]}: ${count} gare"></progress></div>`).join('')}</div><div class="panel-bottom">Programma pubblicato, incluse le eventuali gare annullate.</div></section>
  <section class="panel"><div class="panel-head"><h2>Le località con più gare</h2>${icon('mountain')}</div><div class="insight-bars">${m.venues.slice(0,8).map(v=>`<div><div><span>${flag(v.country)}${esc(v.venue)}</span><b>${v.total}</b></div><progress value="${v.total}" max="${maxVenues}" aria-label="${esc(v.venue)}: ${v.total} gare"></progress><small>${v.finished} concluse</small></div>`).join('')}</div><div class="panel-bottom">Gare per località.</div></section>
  <section class="panel"><div class="panel-head"><h2>Nazioni sul podio</h2>${icon('trophy')}</div><div class="scroll-table"><table class="data-table"><thead><tr><th>Nazione</th><th>Podi</th><th>Vittorie</th></tr></thead><tbody>${m.nations.map(n=>`<tr><td>${flag(n.country)}${esc(n.country)}</td><td>${n.podiums}</td><td>${n.wins}</td></tr>`).join('') || '<tr><td colspan="3">Nessun risultato disponibile</td></tr>'}</tbody></table></div></section></div><p class="tiny">Elaborazioni sui risultati FIS disponibili · ${since(data.alpine.updatedAt)}. I conteggi non includono gare concluse prive di risultati acquisiti.</p>`;
}

function render() {
  const previousDay = seasonPosition();
  const current = document.activeElement; const focusId = current?.id; const selection = current?.selectionStart;
  renderNavigation();
  const eventTitle=state.route==='hockey-stats' && state.detailId==='tabelle' ? 'Tutte le statistiche' : state.route==='game' ? (()=>{const g=data.hockey.games.find(g=>g.id===state.detailId);return g ? team(g.home).name+' – '+team(g.away).name : 'Partita';})() : state.route==='race' ? (()=>{const r=data.alpine.races.find(r=>r.id===state.detailId);return r ? r.venue+' · '+r.disciplineName : 'Gara';})() : navigation.find(n=>n[0]===state.route)?.[1] || 'Home';
  renderBreadcrumb(eventTitle);
  document.body.dataset.route=state.route;
  document.querySelector('#today-label').textContent = dateLabel(new Date().toISOString(), { weekday: 'long', year: 'numeric' });
  document.querySelector('#bell-icon').innerHTML = icon('bell');
  document.querySelector('#user-icon').innerHTML = icon('user');
  document.title = `${eventTitle} · Live Sport Arena`;
  main.innerHTML = ({ 'maps-3d': mapsPage, home: homePage, calendar: () => calendarPage(), alpine: () => calendarPage(true), hockey: hockeyPage, live: livePage, predictions: predictionsPage, settings: settingsPage, 'hockey-stats': hockeyStatisticsPage, game: () => detailPage('game'), race: () => detailPage('race'), 'alpine-standings': alpineStandingsPage, 'alpine-stats': alpineStatsPage }[state.route] || homePage)();
  if (['game','race'].includes(state.route)) { const tab=detailTab; const run=selectedRun; if (state.route==='game') { openGame(state.detailId); detailTab=tab; renderGameTab(); } else { openRace(state.detailId); detailTab=tab; selectedRun=run; renderRaceTab(); } }
  bindSeasonList(previousDay);
  upgradeSelects(main, mark);
  if (focusId) { const replacement = document.getElementById(focusId); replacement?.focus({ preventScroll: true }); if (typeof selection === 'number' && replacement?.type === 'search') replacement.setSelectionRange(selection, selection); }
}

function modalHeader(label) { if (['game','race'].includes(state.route) && activeDetail) return `<div class="dialog-top"><a class="text-button" href="#${state.route==='game'?'hockey':'alpine'}">← ${state.route==='game'?'Hockey':'Sci alpino'}</a><span class="eyebrow">${label}</span></div>`; return `<div class="dialog-top"><span class="eyebrow">${label}</span><button class="icon-button" data-action="close-dialog" aria-label="Chiudi dettagli">${icon('close')}</button></div>`; }
function openDialog(html) { if (['game','race'].includes(state.route) && activeDetail) { document.querySelector('#full-detail').innerHTML=html; return; } content.innerHTML = html; if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0; }

function courseProfile(race, map) {
  const profile = skiProfiles[map?.id];
  if (!profile) return '';
  const { line, marks, metrics } = profile;
  const x = i => 14 + i * 4.9, y = i => 16 + line[i];
  const path = line.map((_, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(i)).join(' ');
  const [start, finish] = (metrics.alt || '').split(' → ');
  const endpoints = ['Partenza', 'Arrivo'].map((label, i) => {
    const altitude = i === 0 ? start : finish;
    return altitude ? label + ' ' + altitude.replace(/\s*m$/, '') + ' m' : label;
  });
  const last = line.length - 1;
  const points = [[0, 'Partenza'], ...marks, [last, 'Arrivo']];
  const facts = [['Lunghezza', metrics.length], ['Dislivello', metrics.vertical], ['Pendenza massima', metrics.maxgrad]].filter(([,v]) => v);
  return `<section class="course-profile"><div class="course-profile-head"><div><small>Profilo schematico</small><h3>${esc(map.course)}</h3></div>${mapLink(race)}</div>
    <svg class="race-elevation" viewBox="0 -9 420 155" role="img" aria-label="Profilo schematico di ${esc(map.course)}. ${esc(endpoints.join(', '))}.">
      <path d="M14 29H406 M14 67H406 M14 105H406" fill="none" stroke="#bfd1c7" stroke-dasharray="3 5"/>
      <path d="${path} V138 H14 Z" fill="#c4d9ca"/><path d="${path}" stroke="#285740" stroke-width="3" fill="none"/>
      ${points.map(([i],k)=>`<circle cx="${x(i)}" cy="${y(i)}" r="8" fill="#163f30"/><text x="${x(i)}" y="${y(i)+3.6}" text-anchor="middle" fill="white" font-size="10">${k+1}</text>`).join('')}
      <g class="race-endpoint-label"><text x="${x(0)+10}" y="${y(0)-6}">${esc(endpoints[0])}</text><text x="${x(last)-10}" y="${y(last)+17}" text-anchor="end">${esc(endpoints[1])}</text></g>
    </svg><div class="profile-marks">${points.map(([,name],k)=>`<span><b>${k+1}</b>${esc(name)}</span>`).join('')}</div>
    ${facts.length ? `<dl class="profile-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}</section>`;
}

function raceSnapshot(race, timing) {
  const sections = [];
  const block = (title, lines) => {
    if (lines.length) sections.push(`<section class="race-stat"><h3>${title}</h3>${lines.join('')}</section>`);
  };
  const athlete = (r, prefix, value = '') => `<div class="race-athlete"><span>${esc(prefix)}</span><strong>${flag(r.country)}${esc(r.name || r.id)}</strong><b>${esc(value)}</b></div>`;
  const finals = raceResults(race).sort((a,b)=>Number(a.rank)-Number(b.rank));
  if (finals.length) {
    const index = race.runs.length === 2 ? 2 : 0;
    const winner = timeSeconds(finals[0].values[index]);
    block('Podio', finals.filter(r=>Number(r.rank)<=3).map(r=>athlete(r,r.rank,Number(r.rank)===1 ? r.values[index] : '+'+(timeSeconds(r.values[index])-winner).toFixed(2))));
    if (index === 2) {
      const best = Math.min(...finals.map(r=>timeSeconds(r.values[1])));
      block('Miglior seconda manche', finals.filter(r=>timeSeconds(r.values[1])===best).map(r=>athlete(r,'',r.values[1])));
    }
  } else if (timing) {
    const rows = rowsForRun(timing);
    const waiting = rows.filter(r=>!STARTED.has(r.status) && !FINISHED.has(r.status));
    let leaders = rows.filter(r=>r.rank && r.rank<=3);
    const previous = !leaders.length && timing.activeRun > 0;
    if (previous) leaders = rowsForRun(timing,timing.activeRun-1).filter(r=>r.rank && r.rank<=3);
    block(previous ? 'Dopo la prima manche' : 'In testa',leaders.sort((a,b)=>a.rank-b.rank).map(r=>athlete(r,r.rank,r.diff ? '+'+(r.diff/1000).toFixed(2) : duration(r.total))));
    block('In pista',rows.filter(r=>r.status==='start').map(r=>athlete(r,r.bib)));
    if (waiting.length) {
      const countries = new Set(rows.map(r=>r.country).filter(Boolean));
      block('Al via',[`<p>${rows.length} in lista · ${countries.size} nazioni</p>`]);
      block('Prossimi al via',waiting.slice(0,3).map(r=>athlete(r,r.bib)));
      block('Preferiti al via',waiting.filter(favouriteAthlete).map(r=>athlete(r,r.bib)));
    }
  }
  return sections.join('');
}

function openRace(id, tab = 'overview') {
  const race = data.alpine.races.find(r => r.id === id); if (!race) return;
  activeDetail = { type: 'race', id }; detailTab = tab; selectedRun = null;
  const full = state.route === 'race';
  const map = mapForRace(race);
  const schedule = `<div id="run-summary">${runCards(race, true)}</div><div class="sync-note">${timezoneLabel}</div>`;
  const title = `<div class="ski-race-title"><h2 id="dialog-title" class="race-detail-title">${disciplineIcon(race.discipline)}${flag(race.country)}${esc(race.venue)}</h2>
    ${full ? '' : `<a class="button primary" href="#race/${encodeURIComponent(id)}" data-full-detail>Dettagli ↗</a>`}</div>`;
  const track = (data.tracks.courses || []).find(c => c.venues.includes(race.venue) && c.disciplines.includes(race.discipline) && (c.gender === 'ALL' || c.gender === race.gender));
  openDialog(`${modalHeader('COPPA DEL MONDO FIS · ' + (race.gender === 'W' ? 'DONNE' : 'UOMINI'))}
    <div class="dialog-body ski-race ${full ? 'ski-page' : 'ski-preview'}">${title}
    <div class="dialog-description">${esc(race.disciplineName)} · ${dateLabel(race.date, { weekday:'long', year:'numeric' })}</div>
    <div id="race-status">${raceStatus(race)}</div><div id="race-bulletin"></div>
    ${full ? `<div class="race-dashboard">${courseProfile(race,map)}<aside class="race-day"><h3>Orari di gara</h3>${schedule}<div id="race-snapshot"></div></aside></div>` : schedule}</div>
    ${full ? `<div id="race-tabs" class="dialog-tabs"></div><div class="detail-content" id="detail-content"></div>
    ${track ? `<details class="race-archive"><summary>Scheda tecnica · ${esc(track.name)}</summary>${trackSection(race, track)}</details>` : ''}
    <div class="race-documents">${documents(race)}<a class="text-button" href="${safeUrl(race.sourceUrl)}" target="_blank" rel="noopener">Pagina ufficiale FIS ↗</a>
    ${race.liveUrl ? `<a class="text-button" href="${safeUrl(race.liveUrl)}" target="_blank" rel="noopener">Timing ufficiale ↗</a>` : ''}</div>` : ''}`);
  if (full && track) mountCourseMaps(data.tracks.courses || []);
  renderRaceTab();
  if (race.liveUrl) startTiming(race);
}

function startTiming(race) {
  const existing = connections.get(race.id);
  if (existing?.race.liveUrl === race.liveUrl) return;
  if (existing) { existing.close(); connections.delete(race.id); timings.delete(race.id); }
  try {
    const connection = new FisConnection(race, timing => {
      // Copy primitive signatures: the incremental feed mutates its state.
      const previous = timingSignatures.get(race.id);
      const signature = { message: timing.message, runs: Object.values(timing.runs).map(r => ({ start: r.scheduledStart, altitude: r.info?.[7] })) };
      const announcements = [];
      if (timing.message && timing.message !== previous?.message) announcements.push(timing.message);
      signature.runs.forEach((r, index) => {
        const old = previous?.runs[index];
        if (old && r.start && old.start && r.start !== old.start) announcements.push(`Programma FIS aggiornato: ${index + 1}ª manche alle ${clock(r.start)} svizzere.`);
        if (old && r.altitude && old.altitude && r.altitude !== old.altitude) announcements.push(`Quota di partenza FIS aggiornata: ${old.altitude} → ${r.altitude} m (${index + 1}ª manche).`);
      });
      if (announcements.length) news.set(race.id, [...announcements.map(message => ({ message, at: new Date().toISOString() })), ...(news.get(race.id) || [])].slice(0, 12));
      timingSignatures.set(race.id, signature);
      timings.set(race.id, timing); timingErrors.delete(race.id);
      Object.values(timing.runs).forEach(run => run.rows.forEach(r => { athleteNames[r.id] = { id:r.id, name:r.name, country:r.country }; }));
      saveStore('athleteNames', athleteNames);
      if (state.route === 'live') { const target = document.querySelector('#live-race-previews'); if (target) target.innerHTML = data.alpine.races.filter(r => r.status === 'live').map(liveRacePreview).join(''); }
      if (race.date >= today()) maybeNotify(race, timing);
      if ((dialog.open || state.route==='race') && activeDetail?.type === 'race' && activeDetail.id === race.id) {
        document.querySelector('#run-summary').innerHTML = runCards(race, true);
        renderRaceTab();
      }
      if (race.date < today()) { connection.close(); connections.delete(race.id); }
    }, error => {
      timingErrors.set(race.id, error.message);
      if ((dialog.open || state.route==='race') && activeDetail?.type === 'race' && activeDetail.id === race.id) renderRaceTab();
    });
    connections.set(race.id, connection); connection.tick();
  } catch (error) { timingErrors.set(race.id, error.message); }
}

function renderRaceTab() {
  const race = data.alpine.races.find(r => r.id === activeDetail?.id); if (!race || activeDetail?.type !== 'race') return;
  const timing = timings.get(race.id);
  const bulletin = document.querySelector('#race-bulletin');
  const latest = timing?.message || news.get(race.id)?.[0]?.message;
  if (bulletin) bulletin.innerHTML = latest ? `<div class="notice fis">${icon('info')}${esc(latest)}</div>` : '';
  if (state.route !== 'race') return;
  const target = document.querySelector('#detail-content'); if (!target) return;
  document.querySelector('#race-snapshot').innerHTML = raceSnapshot(race, timing);
  const underway = timing && (timing.activeRun > 0 || rowsForRun(timing).some(r=>STARTED.has(r.status)));
  const tab = detailTab === 'overview' ? (underway || ['finished','live'].includes(race.status) ? 'results' : 'startlist') : detailTab;
  const scroller = target.querySelector('.scroll-table'); const scrollTop = scroller?.scrollTop; const scrollLeft = scroller?.scrollLeft;
  const focusedAthlete = document.activeElement?.dataset.athlete;
  const error = timingErrors.get(race.id); const run = selectedRun ?? timing?.activeRun ?? 0;
  document.querySelector('#race-tabs').innerHTML = [['startlist', 'Lista di partenza'], ['results', 'Classifica'], ['news', 'Avvisi FIS']].map(([v,label]) => `<button class="chip${tab === v ? ' active' : ''}" data-race-tab="${v}" aria-pressed="${tab === v}">${label}</button>`).join('');
  let html = '';
  const timingHeader = `<div class="timing-top"><span class="timing-status">${error ? icon('info') : timing ? '<span class="dot"></span>' : '<span class="small-loader"></span>'}${error ? esc(error) : timing ? (race.date < today() ? 'Timing FIS · archivio della gara' : 'Collegato a FIS · ' + clock(new Date(timing.receivedAt).toISOString())) : race.liveUrl ? 'Collegamento al timing FIS…' : 'Timing non ancora pubblicato'}</span>${timing ? `<div class="segmented">${Object.entries(timing.runs).map(([index, value]) => `<button data-run="${index}" class="${Number(index) === run ? 'active' : ''}">${value.number}ª manche</button>`).join('')}</div>` : ''}</div>`;
  if (tab === 'news') {
    html = `${timingHeader}${(news.get(race.id) || []).map(n => `<div class="news-item"><small>FIS · rilevato alle ${clock(n.at)}</small>${esc(n.message)}</div>`).join('') || empty('Nessun avviso FIS', '', 'info')}`;
  } else {
    html = timingHeader;
    if (timing) {
      let rows = rowsForRun(timing, run);
      const ranking = tab === 'results';
      if (ranking) rows = rows.filter(r => r.rank).sort((a, b) => a.rank - b.rank);
      html += !ranking ? `<div class="timing-controls"><button class="button" data-action="toggle-swiss">${flag('SUI')}${state.alerts.swiss ? 'Svizzeri selezionati' : 'Segui gli svizzeri'}</button><button class="button${state.alerts.enabled ? ' primary' : ''}" data-action="toggle-alerts">${icon('bell')}${state.alerts.enabled ? 'Avvisi attivi' : 'Attiva avvisi'}</button><span class="tiny">★ per seguire un atleta</span></div><p class="tiny">Gli atleti già partiti sono attenuati. Avvisi sulla manche in corso.</p>` : '';
      html += rows.length ? `<div class="scroll-table"><table class="data-table"><thead><tr><th>${ranking ? '#' : 'Ord.'}</th><th>Pett.</th><th>Atleta</th><th>Naz.</th>${ranking ? `<th>${run ? '1ª manche' : 'Tempo'}</th>${run ? '<th>2ª manche</th><th>Totale</th>' : ''}<th>Distacco</th>` : '<th>Stato</th><th>Segui</th>'}</tr></thead><tbody>${rows.map((r, i) => `<tr style="--favourite:${NATIONS[r.country]?.color || '#6c8051'}" class="${favouriteAthlete(r) ? 'athlete-favourite ' : ''}${!ranking && r.status === 'start' ? 'on-course' : !ranking && STARTED.has(r.status) ? 'gone' : ''}"><td>${ranking ? r.rank : r.index + 1}</td><td>${r.bib}</td><td class="athlete-name">${esc(r.name || r.id)}</td><td>${flag(r.country)}${esc(r.country)}</td>${ranking ? `<td>${duration(run ? r.first : r.total)}</td>${run ? `<td>${duration(r.second)}</td><td><b>${duration(r.total)}</b></td>` : ''}<td>${r.diff ? '+' + (r.diff / 1000).toFixed(2) : '—'}</td>` : `<td>${esc(STATUS[r.status] || (r.status ? r.status.toUpperCase() : 'Da partire'))}</td><td><button class="star-button${state.alerts.athletes.includes(r.id) ? ' on' : ''}" data-athlete="${r.id}" aria-label="${state.alerts.athletes.includes(r.id) ? 'Non seguire più' : 'Segui'} ${esc(r.name)}" aria-pressed="${state.alerts.athletes.includes(r.id)}">${state.alerts.athletes.includes(r.id) ? '★' : '☆'}</button></td>`}</tr>`).join('')}</tbody></table></div>` : empty(ranking ? 'In attesa dei primi arrivi' : 'Lista non ancora disponibile', '');
    } else if (tab === 'results' && race.results.length) {
      html += `<div class="scroll-table"><table class="data-table"><thead><tr><th>#</th><th>Pett.</th><th>Atleta</th><th>Naz.</th><th>1ª</th>${race.runs.length > 1 ? '<th>2ª</th>' : ''}<th>Totale</th></tr></thead><tbody>${race.results.map(r => `<tr ${athleteStyle(r)}><td>${r.rank}</td><td>${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.country)}</td><td>${esc(r.values[0])}</td>${race.runs.length > 1 ? `<td>${esc(r.values[1])}</td>` : ''}<td>${esc(r.values[race.runs.length] || r.values[0])}</td></tr>`).join('')}</tbody></table></div><p class="tiny">Risultato dall’ultimo aggiornamento FIS: ${since(data.alpine.updatedAt)}.</p>`;
    } else html += empty(tab === 'startlist' ? 'Lista di partenza non disponibile' : 'Risultati non disponibili', '', 'live');
  }
  target.innerHTML = html;
  const newScroller = target.querySelector('.scroll-table'); if (newScroller) { newScroller.scrollTop = scrollTop || 0; newScroller.scrollLeft = scrollLeft || 0; }
  if (focusedAthlete) target.querySelector(`[data-athlete="${CSS.escape(focusedAthlete)}"]`)?.focus({ preventScroll: true });
}

function duration(ms) { if (!ms || !Number.isFinite(ms)) return '—'; const seconds = ms / 1000; return seconds >= 60 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}` : seconds.toFixed(2); }
function documents(race, startsOnly = false) {
  const docs = race.documents.filter(d => !startsOnly || d.name.toLowerCase().includes('start list'));
  return docs.length ? `<div class="document-links">${docs.map(d => `<a class="button" href="${safeUrl(d.url)}" target="_blank" rel="noopener noreferrer">${icon('download')}${esc(({ 'Start List 1st run': 'Partenza 1ª manche · PDF', 'Start List 2nd run': 'Partenza 2ª manche · PDF', 'Results 1st run': 'Risultati 1ª manche · PDF', 'Results 2nd run': 'Risultati finali · PDF', 'Event Program': 'Programma · PDF' })[d.name] || d.name)}</a>`).join('')}</div>` : '';
}

function openGame(id) {
  const g = data.hockey.games.find(g => g.id === id); if (!g) return;
  activeDetail = { type: 'game', id }; detailTab = 'stats';
  openDialog(`${modalHeader(state.route === 'game' ? 'NATIONAL LEAGUE · DETTAGLIO PARTITA' : 'NATIONAL LEAGUE · ANTEPRIMA')}<div class="dialog-body" id="game-summary">${gameSummary(g)}</div><div class="dialog-tabs" id="game-tabs"></div><div class="detail-content" id="detail-content"></div>`);
  renderGameTab();
}

function gameSummary(g) {
  return `<h2 id="dialog-title" style="font-size:18px">${dateLabel(g.date, { weekday: 'long', year: 'numeric' })} · ${clock(g.start)}</h2><div class="dialog-description">${timezoneLabel}${state.route !== 'game' ? ` · <a class="text-button" href="#game/${g.id}" data-full-detail>Dettagli ↗</a>` : ''}</div><div class="scoreboard"><div>${mark(g.home, true)}<div class="score-team">${teamName(g.home)}</div></div><div><div class="score-number">${g.status === 'scheduled' ? 'VS' : `${g.homeScore ?? '–'} : ${g.awayScore ?? '–'}`}</div><div class="score-label">${g.status === 'scheduled' ? 'In programma' : g.status === 'finished' ? 'Finale' + (g.decision ? ' · ' + g.decision : '') : esc(g.statusText)}${g.homePeriods?.length ? '<br>' + g.homePeriods.map((s, i) => `${s ?? '–'}–${g.awayPeriods?.[i] ?? '–'}`).join(' / ') : ''}</div></div><div>${mark(g.away, true)}<div class="score-team">${teamName(g.away)}</div></div></div><span class="sync-note">${icon('refresh')}Punteggio SIHF ${since(g.scoreCheckedAt || data.hockey.updatedAt)} · Statistiche ${since(data.hockey.updatedAt)}</span>`;
}

function renderGameTab() {
  const g = data.hockey.games.find(g => g.id === activeDetail?.id); if (!g) return;
  const d = data.hockey.details[g.id]; const info = d?.info?.[0];
  document.querySelector('#game-tabs').innerHTML = [['summary','Riepilogo'],['stats','Squadre'],['events','Cronaca'],...(d?.lineups?.length ? [['lineups','Formazioni']] : []),...(d?.players?.length ? [['players','Giocatori']] : []),['form','Forma e classifica'],['prediction','Previsione']].map(([v, l]) => `<button class="chip${detailTab === v ? ' active' : ''}" data-game-tab="${v}">${l}</button>`).join('');
  if (['summary','prediction','form'].includes(detailTab)) { document.querySelector('#detail-content').innerHTML=gameExtra(g,d,detailTab); return; }
  const rows = d?.[detailTab] || [];
  let html = '';
  if (!rows.length) html = empty('Dati non ancora disponibili', g.status === 'scheduled' ? 'Formazioni e statistiche in attesa di pubblicazione.' : 'Dettagli partita non disponibili.', 'hockey');
  else if (detailTab === 'stats') {
    const labels = { 'SOG Total': 'Tiri in porta', 'PIM': 'Minuti di penalità', 'Face-offs won': 'Ingaggi vinti', 'Shots blocked': 'Tiri bloccati', 'Powerplay': 'Power play' };
    html = `<div class="stat-bars">${rows.map(r => { const a = parseFloat(r.home_value), b = parseFloat(r.away_value); const ratio = a + b > 0 ? a / (a + b) : .5; return `<div><div class="stat-bar-head"><strong>${esc(r.home_value ?? '–')}</strong><span>${esc(labels[r.statistic] || r.statistic)}</span><strong>${esc(r.away_value ?? '–')}</strong></div>${Number.isFinite(a) && Number.isFinite(b) ? `<div class="stat-bar-track"><i style="width:${ratio * 100}%"></i><i style="width:${(1 - ratio) * 100}%"></i></div>` : ''}</div>`; }).join('')}</div>`;
  } else if (detailTab === 'lineups') {
    html = lineupGroups(g, rows, d.topScorers ?? data.rosters?.topScorersByGame?.[g.id] ?? []);
  } else if (detailTab === 'events') {
    html = [...rows].sort((a,b)=>Number(a.period_number||0)-Number(b.period_number||0)||String(a.time||'').localeCompare(String(b.time||''),undefined,{numeric:true})).map(r => `<div class="timeline-event"><span class="timeline-time">${esc(r.time)}</span><div class="timeline-text"><strong>${({ goal: 'GOAL', penalty: 'Penalità', goalie: 'Cambio portiere', shootout: 'Rigore' })[r.event_type] || esc(r.event_type)} · ${r.team_id ? teamName(r.team_id) : ''}</strong>${esc(r.player_name || r.text || '')}${r.assist1_player_name ? ' · Assist: ' + esc([r.assist1_player_name, r.assist2_player_name].filter(Boolean).join(', ')) : ''}${r.penalty_minutes ? ` · ${r.penalty_minutes} min` : ''}<br>${r.period_number ? r.period_number + '° periodo' : ''}${r.score_home != null ? ` · ${r.score_home}–${r.score_away}` : ''}</div></div>`).join('');
  } else if (detailTab === 'players') {
    const players = rows.map(row => {
      const {player, ...stats} = row;
      const nations = playerCountries(row.player_id);
      return {player, nationality:nations.map(code => countryNames.of(code)).join(' / ') || null, ...stats};
    });
    if (state.route === 'game') html = allColumns(players, true);
    else {
      const compact = players.map(p => ({player_number:p.player_number, player:p.player, nationality:p.nationality,
        team_id:p.team_id, team_name:team(p.team_id).name, goals:p.goals, assists:p.assists, points:p.points, time_on_ice:p.time_on_ice}));
      html = allColumns(compact, true);
    }
  }
  if (detailTab !== 'lineups' && detailTab !== 'players') html += tableLegend();
  if (info) html += `<p class="explanation">${esc(info.venue_name || '')}${info.spectators ? ` · ${Number(info.spectators).toLocaleString('it-CH')} spettatori` : ''}${info.broadcasts ? '<br>TV: ' + esc(info.broadcasts) : ''}</p>`;
  html += `<div class="dialog-actions"><a class="text-button" href="${safeUrl(g.sourceUrl)}" target="_blank" rel="noopener noreferrer">Dettaglio ufficiale SIHF ↗</a></div>`;
  document.querySelector('#detail-content').innerHTML = html;
}

function subscribe() {
  activeDetail = null;
  const url = new URL('calendars/alpine-world-cup.ics', location.href.split('#')[0]).href;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const webcal = url.replace(/^https?:/, 'webcal:');
  openDialog(`${modalHeader('COPPA DEL MONDO FIS')}<div class="dialog-body"><h2 id="dialog-title">Calendario sci alpino</h2><p class="explanation">Gare maschili e femminili · Un evento per manche</p>${local ? '<div class="notice">In locale è disponibile il download ICS.</div>' : ''}<div class="dialog-actions">${!local ? `<a class="button primary" href="${esc(webcal)}">${icon('calendar')}Abbonati al calendario</a>` : ''}<a class="button" href="calendars/alpine-world-cup.ics" download="LiveSportArena-Coppa-del-Mondo.ics">${icon('download')}Scarica ICS</a></div><p class="explanation">Indirizzo per Apple Calendar, Google Calendar e Outlook</p><div class="subscribe-url">${esc(url)}</div><div class="dialog-actions"><button class="button" data-action="copy-calendar">${icon('link')}Copia indirizzo</button></div><p class="tiny">Il file ICS contiene gli orari attuali. L’abbonamento riceve le variazioni FIS.</p></div>`);
}

function alerts() {
  activeDetail = null;
  openDialog(`${modalHeader('SCI ALPINO')}<div class="dialog-body"><h2 id="dialog-title">Avvisi di partenza</h2><p class="explanation">Avvisi a sito aperto. Seleziona ★ nella lista di partenza per seguire un atleta.</p><label class="settings-row"><span>Avvisi durante la gara<small>Gare di oggi con timing FIS.</small></span><input type="checkbox" id="alerts-enabled" ${state.alerts.enabled ? 'checked' : ''}></label><label class="settings-row"><span>Segui tutti gli svizzeri ${flag('SUI')}</span><input type="checkbox" id="alerts-swiss" ${state.alerts.swiss ? 'checked' : ''}></label><label class="settings-row"><span>Anticipo<small>Stimato dal ritmo delle partenze.</small></span><select class="input" id="alerts-minutes">${[1, 2, 3, 5].map(n => `<option value="${n}"${n === state.alerts.minutes ? ' selected' : ''}>${n} min</option>`).join('')}</select></label><div class="settings-row"><span>Atleti selezionati<small>${state.alerts.athletes.length} preferiti dalla lista di partenza.</small></span><button class="text-button" data-action="clear-athletes">Azzera</button></div><p class="tiny">Senza una stima dei tempi, l’avviso scatta a tre atleti dal via. Avvisi in pausa durante le sospensioni.</p><div class="dialog-actions"><button class="button primary" data-action="save-alerts">${icon('check')}Salva preferenze</button><button class="button" data-action="notification-permission">${icon('bell')}Abilita notifiche del browser</button></div></div>`);
}

function maybeNotify(race, timing) {
  if (!state.alerts.enabled || Date.now() - timing.receivedAt > 20000) return;
  for (const row of alertCandidates(timing, { ...state.alerts, nations: preferences.nations, athletes: [...new Set([...state.alerts.athletes,...preferences.athletes])] })) {
    const key = `${race.id}:${timing.activeRun}:${row.id}`;
    if (notified.has(key)) continue;
    notified.add(key);
    const message = `${row.name} · ${race.venue}. ${row.runStartsIn ? 'Manche in programma tra ' + Math.max(1, Math.ceil(row.runStartsIn / 60)) + ' min; atleta tra i primi tre.' : row.estimatedSeconds ? 'Partenza stimata tra circa ' + Math.max(1, Math.round(row.estimatedSeconds / 60)) + ' min.' : 'Tra i prossimi ' + (row.ahead + 1) + ' atleti in lista.'}`;
    toast(message, 18000);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Live Sport Arena · Al cancelletto', { body: message, tag: key, icon: 'assets/favicon.svg' }); } catch { /* Some mobile browsers require service workers; in-page alert remains visible. */ }
    }
    if (audioContext?.state === 'running') { const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.connect(gain); gain.connect(audioContext.destination); gain.gain.value = .04; oscillator.frequency.value = 780; oscillator.start(); oscillator.stop(audioContext.currentTime + .16); }
  }
}

function armAlerts() {
  saveStore('alerts', state.alerts);
  if (state.alerts.enabled) {
    try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch { /* visual alerts still work */ }
    data.alpine.races.filter(r => r.date === today() && r.liveUrl).forEach(startTiming);
  }
}
function toast(message, duration = 4000) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), duration); }
function teamsModal() {
  activeDetail = null;
  openDialog(`${modalHeader('NATIONAL LEAGUE')}<div class="dialog-body"><h2 id="dialog-title">Squadre preferite</h2><p class="explanation">Nessuna selezione = tutte le squadre.</p><div class="teams-grid">${data.hockey.teams.sort((a, b) => a.name.localeCompare(b.name)).map(t => `<label class="team-option">${mark(t.id)}<span>${esc(t.name)}</span><input type="checkbox" data-team-option="${t.id}" ${state.teams.includes(t.id) ? 'checked' : ''}></label>`).join('')}</div><div class="dialog-actions"><button class="button primary" data-action="save-teams">Salva selezione ${icon('check')}</button><button class="button" data-action="all-teams">Tutte le squadre</button></div></div>`);
}
function sources() {
  activeDetail = null;
  openDialog(`${modalHeader('LIVE SPORT ARENA')}<div class="dialog-body"><h2 id="dialog-title">Fonti e aggiornamenti</h2><div class="source-links"><a href="${safeUrl(data.alpine.sourceUrl)}" target="_blank" rel="noopener">Calendario ufficiale FIS ↗</a><a href="https://live.fis-ski.com/" target="_blank" rel="noopener">Timing ufficiale FIS ↗</a><a href="https://www.sihf.ch/de/game-center/liga/1-1" target="_blank" rel="noopener">National League · Swiss Ice Hockey Federation ↗</a></div><p class="explanation">Timing FIS in gara · circa ogni 6 secondi. Statistiche hockey · ogni ora durante le partite e dopo gli incontri conclusi.</p><p class="explanation">Sci: ultimo aggiornamento ${data.alpine.updatedAt ? dateLabel(data.alpine.updatedAt) + ', ' + clock(data.alpine.updatedAt) : 'non disponibile'}.<br>Hockey: ultimo aggiornamento ${data.hockey.updatedAt ? dateLabel(data.hockey.updatedAt) + ', ' + clock(data.hockey.updatedAt) : 'non disponibile'}.</p><p class="tiny">Live Sport Arena è un progetto indipendente e non è affiliato a FIS o SIHF. ${timezoneLabel}</p></div>`);
}

document.addEventListener('click', async event => {
  const el = event.target.closest('button, a, .sidebar-scrim'); if (!el) return;
  if (['#hockey','#alpine'].includes(el.getAttribute('href')) && location.hash===el.getAttribute('href')) { readRoute(); closeMenu(); render(); return; }
  if (el.matches('.map-launch') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    const origin = { id: activeDetail.id, tab: detailTab, run: selectedRun, scroll: dialog.scrollTop,
      filters: Object.fromEntries(['date','scope','query','sports','disciplines','gender','teamFilter'].map(key => [key, state[key]])) };
    history.replaceState({ ...history.state, mapOrigin: origin }, '');
    return;
  }
  if (el.hasAttribute('data-full-detail') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { dialog.close(); content.replaceChildren(); activeDetail=null; } 
  if (el.dataset.race) { if (['race','game','live'].includes(state.route) || data.alpine.races.find(r=>r.id===el.dataset.race)?.status==='live') { location.hash='race/'+el.dataset.race; return; } return openRace(el.dataset.race); }
  if (el.dataset.game) { if (['race','game'].includes(state.route)) { location.hash='game/'+el.dataset.game; return; } return openGame(el.dataset.game); }
  if (el.dataset.filter) {
    const key=el.dataset.filter,value=el.dataset.value;
    if (key === 'scope') {
      const list = document.querySelector('.season-list');
      if (list) jumpToPeriod(list, value);
      return;
    }
    if(key==='sport' || key==='discipline') {
      const field=key==='sport'?'sports':'disciplines';
      state[field]=value==='all'?[]:state[field].includes(value)?state[field].filter(v=>v!==value):[...state[field],value];
    } else state[key]=value;
    render(); if(key==='sport') syncLiveConnections(); return;
  }
  if (el.dataset.hockeyTab) { location.hash=hockeyRoute(el.dataset.hockeyTab); return; }
  if (el.dataset.raceTab) { detailTab = el.dataset.raceTab; renderRaceTab(); return; }
  if (el.dataset.gameTab) { detailTab = el.dataset.gameTab; renderGameTab(); return; }
  if (el.dataset.run != null) { selectedRun = Number(el.dataset.run); renderRaceTab(); return; }
  if (el.dataset.athlete) { const id = el.dataset.athlete; state.alerts.athletes = state.alerts.athletes.includes(id) ? state.alerts.athletes.filter(x => x !== id) : [...state.alerts.athletes, id]; preferences.athletes = [...state.alerts.athletes]; saveStore('preferences',preferences); saveStore('alerts', state.alerts); renderRaceTab(); return; }
  const action = el.dataset.action;
  switch (action) {
    case 'expand-hockey': toggleSportMenu('hockey'); break;
    case 'expand-alpine': toggleSportMenu('alpine'); break;
    case 'save-settings': saveSettings(); break;
    case 'menu-toggle': { const open = document.querySelector('#sidebar').classList.toggle('open'); el.setAttribute('aria-expanded', String(open)); break; }
    case 'menu-close': closeMenu(); break;
    case 'close-dialog': dialog.close(); break;
    case 'subscribe': subscribe(); break;
    case 'hockey-calendar': hockeyCalendar(); break;
    case 'copy-hockey-calendar': try { await navigator.clipboard.writeText(new URL(hockeyCalendarPath(),location.href.split('#')[0]).href); toast('Indirizzo copiato.'); } catch { toast('Copia l’indirizzo mostrato.'); } break;
    case 'alerts': alerts(); break;
    case 'sources': sources(); break;
    case 'connection-status': connectionDetails(); break;
    case 'csv': activeDetail = null; openDialog(`${modalHeader('ESPORTAZIONI HOCKEY')}<div class="dialog-body"><h2 id="dialog-title">Dati della stagione</h2><p class="explanation">Statistiche della stagione in formato CSV.</p><div class="document-links">${[['matches', 'Partite'], ['game_stats', 'Statistiche squadre'], ['player_stats', 'Statistiche giocatori'], ['team_features', 'Feature pregara'], ['ml_dataset', 'Dataset per i modelli']].map(([file, name]) => `<a class="button" href="data/csv/${file}.csv" download>${icon('download')}${name}</a>`).join('')}</div></div>`); break;
    case 'teams': teamsModal(); break;
    case 'save-teams': state.teams = [...dialog.querySelectorAll('[data-team-option]:checked')].map(e => e.dataset.teamOption); saveStore('teams', state.teams); dialog.close(); render(); break;
    case 'all-teams': state.teams = []; saveStore('teams', []); dialog.close(); render(); break;
    case 'standings': location.hash='hockey/standings'; break;
    case 'clear-calendar': Object.assign(state,{sports:[],teamFilter:'',date:'',query:'',disciplines:[],gender:'all'}); render(); break;
    case 'reset-filters': Object.assign(state, { teamFilter: '', date: '', query: '', disciplines: [], gender: 'all' }); render(); break;
    case 'copy-calendar': { const url = new URL('calendars/alpine-world-cup.ics', location.href.split('#')[0]).href; try { await navigator.clipboard.writeText(url); toast('Indirizzo del calendario copiato.'); } catch { toast('Copia l’indirizzo mostrato nella scheda.'); } break; }
    case 'toggle-swiss': state.alerts.swiss = !state.alerts.swiss; preferences.nations = state.alerts.swiss ? [...new Set([...preferences.nations,'SUI'])] : preferences.nations.filter(n => n !== 'SUI'); saveStore('preferences',preferences); saveStore('alerts', state.alerts); renderRaceTab(); break;
    case 'toggle-alerts': state.alerts.enabled = !state.alerts.enabled; armAlerts(); renderRaceTab(); toast(state.alerts.enabled ? 'Avvisi attivi mentre il sito è aperto.' : 'Avvisi disattivati.'); break;
    case 'clear-athletes': preferences.athletes = []; saveStore('preferences',preferences); state.alerts.athletes = []; saveStore('alerts', state.alerts); alerts(); break;
    case 'save-alerts': state.alerts.enabled = dialog.querySelector('#alerts-enabled').checked; state.alerts.swiss = dialog.querySelector('#alerts-swiss').checked; preferences.nations = state.alerts.swiss ? [...new Set([...preferences.nations,'SUI'])] : preferences.nations.filter(n => n !== 'SUI'); saveStore('preferences',preferences); state.alerts.minutes = Number(dialog.querySelector('#alerts-minutes').value); armAlerts(); dialog.close(); toast('Preferenze degli avvisi salvate.'); break;
    case 'notification-permission': if ('Notification' in window) { const result = await Notification.requestPermission(); toast(result === 'granted' ? 'Notifiche abilitate mentre il sito è aperto.' : 'Restano disponibili gli avvisi dentro il sito.'); } else toast('Questo browser supporta gli avvisi dentro il sito.'); break;
  }
});
document.addEventListener('change', event => { if (event.target.dataset.select) { state[event.target.dataset.select] = event.target.value; render(); } });
let searchTimer;
document.addEventListener('input', event => { if (event.target.id === 'search-filter') { state.query = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(render, 160); } });
function closeMenu() { document.querySelector('#sidebar').classList.remove('open'); document.querySelector('[data-action="menu-toggle"]').setAttribute('aria-expanded', 'false'); }
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { if (['race','game'].includes(state.route)) return; if (!state.alerts.enabled && state.route !== 'live') { for (const c of connections.values()) c.close(); connections.clear(); } activeDetail = null; });
function hockeyRoute(tab) { return ({standings:'hockey/standings',stats:'hockey/top-scorer'})[tab] || 'hockey'; }
function readRoute() {
 const [route,id]=location.hash.slice(1).split('/');
 state.route=['game','race'].includes(route) ? route : navigation.some(n=>n[0]===route) ? route : 'home';
 state.detailId=id; detailTab=state.route==='game'?'summary':'overview';
 if(state.route==='hockey') {state.hockeyTab=({standings:'standings','top-scorer':'stats'})[id] || 'calendar'; }
 if (state.route==='alpine' || state.route==='hockey') { state.scope='upcoming'; state.resetSeasonPosition=true; }
 if(state.route==='calendar') { state.scope='upcoming'; state.resetSeasonPosition=true; }
 if(['calendar','live'].includes(state.route)) state.sports=[];
 if (state.route.startsWith('hockey') || state.route==='predictions') state.hockeyExpanded=true;
 if (state.route.startsWith('alpine') || state.route === 'maps-3d') state.alpineExpanded=true;
 if (!dialog.open) activeDetail=null;
}
window.addEventListener('hashchange', () => { Object.assign(state,{date:'',query:'',scope:'upcoming',disciplines:[],gender:'all',teamFilter:''}); readRoute(); closeMenu();render();syncLiveConnections();window.scrollTo(0,0); });


function syncLiveConnections() {
  const wanted = new Set(data.alpine.races.filter(r => r.liveUrl && ((state.alerts.enabled && r.date === today()) || (state.route === 'live' && sportSelected('alpine') && r.status === 'live'))).map(r => r.id));
  if (activeDetail?.type === 'race') wanted.add(activeDetail.id);
  for (const [id,c] of connections) if (!wanted.has(id)) { c.close(); connections.delete(id); }
  data.alpine.races.filter(r => wanted.has(r.id) && r.liveUrl).forEach(startTiming);
}
function settingsPage() {
  const known = new Map(Object.values(athleteNames).map(r => [String(r.id),r]));
  data.alpine.races.forEach(race => race.results.forEach(r => { if (r.fisCode) known.set(String(r.fisCode), {id:String(r.fisCode), name:r.name, country:r.country}); }));
  [...preferences.athletes,...state.alerts.athletes].forEach(id => { if (!known.has(id)) known.set(id,{id,name:'Atleta FIS '+id,country:''}); });
  return `${heading('', 'Impostazioni', 'Preferenze salvate su questo dispositivo.')}<div class="settings-grid"><section class="panel"><div class="panel-head"><h2>Hockey</h2>${leagueLogo('hockey')}</div><div class="panel-body"><div class="field-label">Squadre preferite</div><div class="nation-options">${data.hockey.teams.map(t=>`<label>${mark(t.id)}<input type="checkbox" data-preferred-team="${t.id}" ${preferences.teams.includes(t.id)?'checked':''}>${esc(t.name)}</label>`).join('')}</div><label class="settings-row">Mostra la stella sulle partite preferite<input id="preferred-stars" type="checkbox" ${preferences.stars ? 'checked' : ''}></label></div></section>
  <section class="panel"><div class="panel-head"><h2>Sci alpino</h2>${leagueLogo('alpine')}</div><div class="panel-body"><h3>Federazioni</h3><div class="nation-options">${Object.entries(NATIONS).map(([code,n]) => `<label style="--favourite:${n.color}"><input type="checkbox" data-nation="${code}" ${preferences.nations.includes(code) ? 'checked' : ''}>${flag(code)}${n.name}<i class="nation-color"></i></label>`).join('')}</div><h3>Atleti</h3><input class="input" id="athlete-search" type="search" placeholder="Cerca atleta" aria-label="Cerca atleta"><div class="athlete-options">${[...known.values()].sort((a,b) => a.name.localeCompare(b.name)).map(r => `<label data-athlete-name="${esc(r.name.toLowerCase())}"><input type="checkbox" data-preferred-athlete="${r.id}" ${preferences.athletes.includes(r.id) || state.alerts.athletes.includes(r.id) ? 'checked' : ''}>${flag(r.country)}${esc(r.name)}</label>`).join('') || '<p class="tiny">In attesa delle liste FIS.</p>'}</div></div></section></div><div class="settings-actions"><button class="button primary" data-action="save-settings">Salva preferenze</button><button class="button" data-action="alerts">${icon('bell')}Avvisi di partenza</button></div>`;
}
function saveSettings() {
  preferences.teams=[...document.querySelectorAll('[data-preferred-team]:checked')].map(el=>el.dataset.preferredTeam); preferences.team=preferences.teams[0]||'';
  preferences.stars = document.querySelector('#preferred-stars').checked;
  preferences.nations = [...document.querySelectorAll('[data-nation]:checked')].map(el => el.dataset.nation);
  preferences.athletes = [...document.querySelectorAll('[data-preferred-athlete]:checked')].map(el => el.dataset.preferredAthlete);
  state.alerts.athletes = [...preferences.athletes];
  state.alerts.swiss = preferences.nations.includes('SUI');
  saveStore('preferences',preferences); saveStore('alerts',state.alerts); toast('Preferenze salvate.');
}
document.addEventListener('input', e => { if (e.target.id === 'athlete-search') document.querySelectorAll('[data-athlete-name]').forEach(el => { el.hidden = !el.dataset.athleteName.includes(e.target.value.toLowerCase()); }); });

async function loadData(initial = false) {
  const files = [...MODULES, {id:'hockeyStats',file:'data/hockey-statistics.json'}, {id:'tracks',file:'data/tracks.json'}, {id:'cups',file:'data/alpine-standings.json'}, { id: 'predictions', file: 'data/predictions.json' }];
  if (!data.rosters) files.push({id:'rosters', file:'assets/hockey-rosters.json'});
  let changed = initial;
  const outcomes = await Promise.allSettled(files.map(async module => {
    const value = await readSource(`${module.file}?v=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' }, module.id);
    const signature = JSON.stringify(value);
    if (sourceSignatures.get(module.id) === signature) return;
    sourceSignatures.set(module.id, signature);
    if (module.id === 'hockey') hockeyBaseline = value;
    data[module.id] = { ...data[module.id], ...value };
    changed = true;
  }));
  const failed = outcomes.filter(x => x.status === 'rejected');
  if (failed.length && initial) toast('Alcuni dati non sono disponibili. Riproveremo automaticamente.');
  if (!changed) return;
  applyHockeyScores();
  if (state.route !== 'settings' || initial) render();
  syncLiveConnections();
  if (activeDetail?.type === 'race' && (dialog.open || state.route==='race')) {
    const race = data.alpine.races.find(r => r.id === activeDetail.id);
    if (race) {
      document.querySelector('#run-summary').innerHTML = runCards(race, true);
      document.querySelector('#race-status').innerHTML = raceStatus(race);
      renderRaceTab();
      if (race.liveUrl) startTiming(race);
    }
  } else if (activeDetail?.type === 'game' && (dialog.open || ['race','game'].includes(state.route))) {
    const game = data.hockey.games.find(g => g.id === activeDetail.id);
    if (game) {
      const scroll = dialog.scrollTop;
      document.querySelector('#game-summary').innerHTML = gameSummary(game);
      renderGameTab();
      dialog.scrollTop = scroll;
    }
  }
}
readRoute();
const mapOrigin = history.state?.mapOrigin;
function clearMapOrigin() {
  if (!history.state?.mapOrigin) return;
  const { mapOrigin, ...rest } = history.state;
  history.replaceState(rest, '');
}
if (mapOrigin) Object.assign(state, mapOrigin.filters);
window.addEventListener('pageshow', event => { if (event.persisted) clearMapOrigin(); });
loadData(true).then(() => {
  if (mapOrigin && history.state?.mapOrigin) {
    openRace(mapOrigin.id, mapOrigin.tab);
    selectedRun = mapOrigin.run;
    renderRaceTab();
    dialog.scrollTop = mapOrigin.scroll;
    clearMapOrigin();
  }
  return pollHockeyScores();
});
setInterval(() => { if (!document.hidden) loadData(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData().then(pollHockeyScores); });

// Enhance every result table, including tables replaced by live updates.
enableTableSorting();

function hockeyCalendarPath() { return `calendars/hockey-${state.teamFilter || 'national-league'}.ics`; }
function hockeyCalendar() {
 activeDetail=null;
 const path=hockeyCalendarPath(), url=new URL(path,location.href.split('#')[0]).href;
 const local=['localhost','127.0.0.1',''].includes(location.hostname);
 openDialog(`${modalHeader('NATIONAL LEAGUE')}<div class="dialog-body"><h2 id="dialog-title">Aggiungi al calendario</h2><p class="explanation">${state.teamFilter?esc(team(state.teamFilter).name):'Tutte le squadre'} · stagione ${esc(data.hockey.seasonLabel)}</p><div class="dialog-actions">${local?'':`<a class="button primary" href="${esc(url.replace(/^https?:/,'webcal:'))}">${icon('calendar')}Abbonati</a>`}<a class="button" href="${esc(path)}" download>${icon('download')}Scarica ICS</a></div><p class="explanation">${local?'L’abbonamento sarà disponibile dopo la pubblicazione. ':''}Il file ICS contiene gli orari attuali. L’abbonamento riceve le variazioni.</p><div class="subscribe-url">${esc(url)}</div><div class="dialog-actions"><button class="button" data-action="copy-hockey-calendar">${icon('link')}Copia indirizzo</button></div><p class="tiny">Calendario completo della stagione.</p></div>`);
}

function hockeyScoreFresh() {
 const freshness = hockeyScores?.mode === 'github-actions' ? 15 * 60000 : (Number(hockeyScores?.nextPollSeconds || 20) + 45) * 1000;
 return hockeyScores?.status==='ok' && Number(hockeyScores.season)===Number(data.hockey.season) && Date.now()-Date.parse(hockeyScores.updatedAt)<freshness;
}
function scoreUpdateIssue() {
 if (scoreReadFailed) return 'Punteggi SIHF non raggiungibili';
 if (!hockeyScores) return '';
 if (hockeyScores.status === 'stopped') return 'Aggiornamento locale dei punteggi fermo';
 if (hockeyScores.status === 'stale' || hockeyScores.status === 'error') return 'Ultimo aggiornamento SIHF non riuscito';
 return hockeyScoreFresh() ? '' : 'Aggiornamento dei punteggi in ritardo';
}
function applyHockeyScores() {
 if(!hockeyBaseline) return;
 data.hockey={...hockeyBaseline};
 if(!hockeyScores || Number(hockeyScores.season)!==Number(hockeyBaseline.season)) return;
 const patches=new Map((hockeyScores.games||[]).map(g=>[g.id,g]));
 data.hockey.games=hockeyBaseline.games.map(g=>{
   const patch=patches.get(g.id);
   if(!patch || patch.home!==g.home || patch.away!==g.away) return g;
   if(Date.parse(patch.scoreCheckedAt)<Date.parse(hockeyBaseline.updatedAt)) return g;
   if(g.sourceUpdatedAt && patch.sourceUpdatedAt && Date.parse(patch.sourceUpdatedAt)<Date.parse(g.sourceUpdatedAt)) return g;
   return {...g,...patch};
 });
 if(hockeyScoreFresh() && hockeyScores.standings?.length) data.hockey.standings=hockeyScores.standings;
 data.hockey.liveStandings=hockeyScoreFresh() && hockeyScores.baseUpdatedAt===hockeyBaseline.updatedAt ? hockeyScores.liveStandings||[] : [];
}
async function pollHockeyScores() {
 clearTimeout(hockeyPollTimer);
 if(hockeyPollBusy) return;
 hockeyPollBusy=true;
 try {
  if(!document.hidden) {
   let changed = false;
   let next;
   try {
     next=await readSource(`data/hockey-live.json?v=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(10000)},'hockey-live');
   } catch {
     scoreReadFailed = true;
     return;
   }
   {
    const signature = JSON.stringify({ season: next.season, status: next.status, games: (next.games || []).map(g => [g.id, g.status, g.homeScore, g.awayScore, g.homePeriods, g.awayPeriods, g.statusText, g.decision]), standings: next.standings, liveStandings: next.liveStandings });
    changed = signature !== hockeyScoreSignature;
    hockeyScores = next;
    hockeyScoreSignature = signature;
    scoreReadFailed = false;
    if (changed) applyHockeyScores();
   }
   // Keep the current view intact when only the collector timestamp changes.
   const scoreView = ['home','calendar','hockey','live','game','predictions'].includes(state.route) ||
     (state.route === 'hockey-stats' && state.detailId !== 'tabelle');
   if(changed && !document.activeElement?.closest('input,select,.custom-select') && scoreView) {
    const scroll=window.scrollY, modalScroll=dialog.scrollTop;
    render(); window.scrollTo(0,scroll);
    if(dialog.open && activeDetail?.type==='game') {
     const game=data.hockey.games.find(g=>g.id===activeDetail.id);
     if(game) { document.querySelector('#game-summary').innerHTML=gameSummary(game); renderGameTab(); dialog.scrollTop=modalScroll; }
    }
   }
  }
 } finally {
  hockeyPollBusy=false;
  updateConnectionStatus();
  hockeyPollTimer=setTimeout(pollHockeyScores, hockeyScores?.nextPollSeconds===20 ? 5000 : 60000);
 }
}

function updateConnectionStatus() {
 const status = document.querySelector('#connection-status');
 const online = navigator.onLine;
 const issue = scoreUpdateIssue();
 const label = online ? 'Connesso' : 'Non connesso';
 status.classList.toggle('offline', !online);
 status.classList.toggle('score-delay', online && !!issue);
 status.title = [label, issue, 'Stato degli aggiornamenti'].filter(Boolean).join(' · ');
 const connectionLabel = document.querySelector('#connection-label');
 if (connectionLabel.textContent !== label) connectionLabel.textContent = label;
 const hint = document.querySelector('#connection-hint');
 hint.hidden = !online || !issue;
 const scoreInfo = dialog.querySelector('[data-score-connection]');
 if (dialog.open && scoreInfo) {
   const detail = scoreConnectionDetail();
   if (scoreInfo.innerHTML !== detail) scoreInfo.innerHTML = detail;
   const title = dialog.querySelector('#dialog-title');
   if (title.textContent !== label) title.textContent = label;
 }
}
function sourceTime(value) {
 return value && Number.isFinite(Date.parse(value)) ? dateLabel(value,{year:'numeric'}) + ' · ' + clock(value) : 'Non disponibile';
}
function scoreConnectionDetail() {
 const issue = scoreUpdateIssue();
 const scoreTime = hockeyScores?.updatedAt || data.hockey.updatedAt;
 return `<time>${sourceTime(scoreTime)}</time>${issue ? `<span class="status-tag muted">${esc(issue)}</span>` : ''}${hockeyScores?.checkedAt ? `<small>Ultimo controllo · ${sourceTime(hockeyScores.checkedAt)}</small>` : ''}`;
}
window.addEventListener('online',updateConnectionStatus);
window.addEventListener('offline',updateConnectionStatus);
updateConnectionStatus();

function renderBreadcrumb(title) {
 const parent=state.route==='game'||state.route.startsWith('hockey')||state.route==='predictions'?'hockey':state.route==='race'||state.route.startsWith('alpine')?'alpine':null;
 const parts=[['home','Home']];
 if(parent && parent!==state.route) parts.push([parent,parent==='hockey'?'Hockey':'Sci alpino']);
 if(['hockey','alpine'].includes(state.route)) {
  parts.push([state.route,title]);
  const label=state.route==='hockey'?({calendar:'Stagione',standings:'Classifica',stats:'Top Scorer'})[state.hockeyTab]:'Stagione';
  parts.push([state.route==='hockey'?hockeyRoute(state.hockeyTab):state.route,label]);
 } else if(state.route==='hockey-stats' && state.detailId==='tabelle') {
  parts.push(['hockey-stats','Statistiche'],['hockey-stats/tabelle',title]);
 } else if(state.route!=='home') parts.push([state.route+(state.detailId?'/'+state.detailId:''),title]);
 document.querySelector('.breadcrumb').innerHTML=parts.map(([route,label],i)=>`${i?'<span aria-hidden="true">/</span>':''}<a href="#${esc(route)}" ${i===parts.length-1?'aria-current="page"':''}>${esc(label)}</a>`).join('');
}
function referees(info) {
 return `<section class="game-officials"><h3>Ufficiali di gara</h3><dl>
   <div><dt>Arbitri principali</dt><dd>${esc(info?.referees?.trim() || 'Da comunicare')}</dd></div>
   <div><dt>Giudici di linea (Linesmen)</dt><dd>${esc(info?.linesmen?.trim() || 'Da comunicare')}</dd></div>
 </dl></section>`;
}
const countryNames = new Intl.DisplayNames(['it'], {type:'region'});
function playerCountries(id) {
  return (data.rosters?.players?.[id]?.countries || []).filter(code => /^[A-Z]{2}$/.test(code));
}
function lineupBadges(row, topScorers) {
  const nations = playerCountries(row.player_id);
  const flags = nations.includes('CH') ? '' : nations.map(code => {
    const name = esc(countryNames.of(code));
    const emoji = [...code].map(letter => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join('');
    return `<span class="lineup-badge" role="img" aria-label="${name}" title="${name}">${emoji}</span>`;
  }).join('');
  return flags + (topScorers.includes(String(row.player_id)) ? '<span class="lineup-badge" role="img" aria-label="PostFinance Top Scorer" title="PostFinance Top Scorer">🔥</span>' : '');
}
function lineupGroups(g, rows, topScorers) {
 const roles={goalkeeper:'Portiere',defense_left:'Difensore sinistro',defense_right:'Difensore destro',forward_left:'Ala sinistra',forward_center:'Centro',forward_right:'Ala destra',center:'Centro',other:'Altro'};
 return `<div class="lineup-teams">${[g.home,g.away].map(id=>{
  const players=rows.filter(r=>String(r.team_id || (r.team_side==='home'?g.home:g.away))===String(id));
  const groups=groupBy(players,r=>r.absence_code||r.absence_reason?'Assenti':r.unit==='goalkeeper'?'Portieri':['defense_left','defense_right','forward_left','forward_center','forward_right'].includes(r.unit)&&r.slot?`Linea ${r.slot}`:'Altri giocatori');
  const labels=Object.keys(groups).sort((a,b)=>a==='Portieri'?-1:b==='Portieri'?1:a.startsWith('Linea')&&!b.startsWith('Linea')?-1:b.startsWith('Linea')&&!a.startsWith('Linea')?1:a.localeCompare(b,'it',{numeric:true}));
  return `<section class="lineup-team"><h3>${mark(id)}${teamName(id)}</h3>${labels.map(label=>`<section class="lineup-group"><h4>${esc(label)}</h4><ul>${groups[label].map(r=>`<li><span class="jersey">${esc(r.player_jersey??'–')}</span><span><strong>${esc(r.player_name||'–')}${r.is_captain?' · C':''}${lineupBadges(r, topScorers)}</strong><small>${esc(roles[r.unit]||roleLabel(r.unit)||'Ruolo non disponibile')}${r.absence_reason?' · '+esc(({SU:'In soprannumero',IN:'Infortunato',AB:'Assente'})[r.absence_code]||r.absence_reason):''}</small></span></li>`).join('')}</ul></section>`).join('') || '<p>Formazione non disponibile.</p>'}</section>`;
 }).join('')}</div>`;
}
function connectionDetails() {
 activeDetail=null;
 const tables=Object.entries(data.hockeyStats.tables||{});
 const times=tables.map(([,t])=>t.updatedAt).filter(t=>t && Number.isFinite(Date.parse(t))).sort();
 const staleTables=tables.filter(([,t])=>t.status==='stale').length;
 const stats={updatedAt:times[0],status:staleTables?'partial':'ok',staleTables,total:tables.length};
 const entries=[['Calendario e risultati sci',data.alpine],['Classifiche sci · Donne',data.cups.groups?.W],['Classifiche sci · Uomini',data.cups.groups?.M],['Punteggi e classifica hockey',hockeyScores || data.hockey],['Dettagli hockey',data.hockey],['Statistiche hockey',stats],['Previsioni',data.predictions]];
 const rows=items=>items.map(([label,entry])=>label==='Punteggi e classifica hockey' ?
  `<div><dt>${esc(label)}</dt><dd data-score-connection>${scoreConnectionDetail()}</dd></div>` : `<div><dt>${esc(label)}</dt><dd><time>${sourceTime(entry?.updatedAt)}</time>${entry?.status==='stale'?'<span class="status-tag muted">Ultimo tentativo non riuscito</span>':entry?.status==='partial'?`<span class="status-tag muted">${entry.staleTables} di ${entry.total} tabelle da aggiornare</span>`:entry?.status==='stopped'?'<span class="status-tag muted">Aggiornamento locale fermo</span>':''}${entry?.lastAttemptAt?`<small>Ultimo tentativo: ${sourceTime(entry.lastAttemptAt)}</small>`:''}</dd></div>`).join('');
 openDialog(`${modalHeader('STATO DEGLI AGGIORNAMENTI')}<div class="dialog-body"><h2 id="dialog-title">${navigator.onLine?'Connesso':'Non connesso'}</h2><p class="tiny">${timezoneLabel}</p><dl class="update-status-list">${rows(entries)}</dl>${tables.length?`<details class="update-status-tables"><summary>Dettaglio statistiche hockey</summary><dl class="update-status-list">${rows(tables.map(([key,t])=>[(t.label||key).replaceAll('Gol','Goal'),t]))}</dl></details>`:''}</div>`);
}
