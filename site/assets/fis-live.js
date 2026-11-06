import { readSource, recordClient } from './client-diagnostics.js';
// Public FIS timing feed. No proxy, API key, eval, or paid data service.
export function deserialize(xml) {
  if (xml.length > 2_000_000) throw new Error('Timing troppo grande');
  const envelope = xml.trim();
  if (!envelope.startsWith('<lt>') || !envelope.endsWith('</lt>')) throw new Error('Formato timing non valido');
  const source = envelope.slice(4, -5).replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&apos;', "'");
  let position = 0;
  const until = char => {
    const end = source.indexOf(char, position);
    if (end < 0) throw new Error('Timing incompleto');
    const value = source.slice(position, end); position = end + char.length; return value;
  };
  function parse(depth = 0) {
    if (depth > 30) throw new Error('Timing non valido');
    const type = source[position]; position += 2;
    if (type === 'N') return null;
    if (['i', 'd', 'b'].includes(type)) { const value = Number(until(';')); if (!Number.isFinite(value)) throw new Error('Numero non valido'); return type === 'b' ? Boolean(value) : value; }
    if (type === 's') {
      const length = Number(until(':'));
      if (!Number.isInteger(length) || length < 0 || source[position++] !== '"') throw new Error('Testo non valido');
      const value = source.slice(position, position + length); position += length;
      if (source.slice(position, position + 2) !== '";') throw new Error('Lunghezza timing non valida');
      position += 2; return value;
    }
    if (type === 'a') {
      const length = Number(until(':')); const value = Object.create(null);
      if (!Number.isInteger(length) || length < 0 || length > 20000 || source[position++] !== '{') throw new Error('Elenco non valido');
      for (let i = 0; i < length; i++) { const key = parse(depth + 1); value[key] = parse(depth + 1); }
      if (source[position++] !== '}') throw new Error('Elenco incompleto');
      return value;
    }
    throw new Error('Tipo timing non supportato');
  }
  const value = parse();
  if (position !== source.length) throw new Error('Timing con dati residui');
  return value;
}

const values = value => Object.values(value || {});
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
export const FINISHED = new Set(['finish', 'dnf', 'dq', 'dqp', 'dns', 'nps', 'dic', 'dqb']);
export const STARTED = new Set(['start', 'finish', 'dnf', 'dq', 'dqp', 'dic', 'dqb']);
export const STATUS = { finish: 'Arrivato', start: 'In pista', nextstart: 'Al cancelletto', dnf: 'Ritirato', dns: 'Non partito', dq: 'Squalificato', dqp: 'Squalificato', nps: 'Non partito' };

export function venueInstant(info, zone) {
  try {
    if (info[5] === '' || info[6] === '' || info[5] == null || info[6] == null) return null;
    if (Number(info[3]) < 1 || Number(info[3]) > 12 || Number(info[4]) < 1 || Number(info[4]) > 31 || Number(info[5]) < 0 || Number(info[5]) > 23 || Number(info[6]) < 0 || Number(info[6]) > 59) return null;
    const base = Date.UTC(Number(info[2]), Number(info[3]) - 1, Number(info[4]), Number(info[5]), Number(info[6]));
    if (!Number.isFinite(base)) return null;
    let value = base;
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
      value = base - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - value);
    }
    return new Date(value).toISOString();
  } catch { return null; }
}

export function normalise(main, race) {
  const phase = String(main.runno?.[0] ?? '0');
  if (phase === 'D') throw new Error('È in corso il sorteggio: lista di partenza non definitiva');
  const definition = main.runinfo?.[phase]?.[0];
  if (!definition) throw new Error('Programma del timing non ancora disponibile');
  const date = `${definition[2]}-${String(definition[3]).padStart(2, '0')}-${String(definition[4]).padStart(2, '0')}`;
  if (date !== race.date || main.raceinfo?.[3] !== race.discipline || main.raceinfo?.[4] !== race.gender || main.raceinfo?.[5] !== 'WC') {
    throw new Error('Il timing non corrisponde ancora a questa gara');
  }
  const athletes = new Map(values(main.racers).map(a => [String(a[0]), { id: String(a[0]), surname: a[1], name: `${a[2]} ${a[1]}`, country: a[3] }]));
  const runs = {};
  for (const [number, points] of Object.entries(main.racedef?.[phase] || {})) {
    const starts = values(main.startlist?.[phase]).flatMap(heat => values(heat?.[number]));
    runs[number] = {
      number: Number(number) + 1,
      info: main.runinfo?.[phase]?.[number],
      scheduledStart: venueInstant(main.runinfo?.[phase]?.[number] || {}, race.timezone || 'Europe/Zurich'),
      points: values(points).map(p => ({ type: p[0], number: p[1] })),
      rows: starts.map((s, index) => ({ ...athletes.get(String(s[0])), id: String(s[0]), bib: s[1], status: s[2] || '', index,
        values: { ...main.result?.[phase]?.[number]?.[index] } })),
    };
  }
  return { phase, activeRun: Math.max(0, Number(main.runno?.[1] || 1) - 1), runs,
    message: main.message || '', weather: main.meteo, update: main.live?.[1],
    delay: Math.max(6, Number(main.live?.[0] || 3)), receivedAt: Date.now(), intervals: [], lastStartAt: null };
}

export function applyUpdate(state, update, now = Date.now()) {
  let reload = false;
  if (update.runno) {
    if (String(update.runno[0]) !== state.phase) return true;
    const active = Math.max(0, Number(update.runno[1] || 1) - 1);
    if (active !== state.activeRun) { state.intervals = []; state.lastStartAt = null; }
    state.activeRun = active;
  }
  for (const event of values(update.events)) {
    const e = values(event); const type = e[0];
    if (type === 'reloadmain') { reload = true; continue; }
    if (type === 'message') { state.message = String(e[1] || ''); continue; }
    if (type === 'meteo') continue;
    if (type === 'inprogress') continue;
    const run = state.runs[Number(e[2]) - 1];
    const row = run?.rows.find(r => String(r.bib) === String(e[4]));
    if (!row || String(e[1]) !== state.phase) { reload = true; continue; }
    if (type === 'nextstart' || type === 'start' || FINISHED.has(type)) {
      if (type === 'start' && !STARTED.has(row.status)) {
        if (state.lastStartAt) {
          const seconds = (now - state.lastStartAt) / 1000;
          if (seconds >= 15 && seconds <= 240) state.intervals = [...state.intervals.slice(-5), seconds];
        }
        state.lastStartAt = now;
      }
      row.status = type;
    }
    if (['inter', 'realinter', 'speed', 'finish'].includes(type)) {
      const index = run.points.findIndex(p => p.type === type && Number(p.number) === Number(e[5]));
      if (index < 0) { reload = true; continue; }
      row.values[index] = numeric(e[6]);
      if (type === 'finish') row.status = 'finish';
    }
  }
  state.update = update.live?.[1] ?? state.update;
  state.delay = Math.max(6, Number(update.live?.[0] || state.delay));
  state.receivedAt = now;
  return reload;
}

export function rowsForRun(state, runIndex = state.activeRun) {
  const run = state.runs[runIndex];
  if (!run) return [];
  const finish = run.points.findIndex(p => p.type === 'finish');
  const previous = state.runs[runIndex - 1];
  const previousFinish = previous?.points.findIndex(p => p.type === 'finish');
  const rows = run.rows.map(row => {
    const total = numeric(row.values[finish]);
    const first = previous ? numeric(previous.rows.find(r => r.id === row.id)?.values[previousFinish]) : total;
    return { ...row, total, first, second: previous && total && first ? total - first : null,
      splits: run.points.map((p, i) => ({ ...p, value: numeric(row.values[i]) })) };
  });
  const ranked = rows.filter(r => r.status === 'finish' && r.total).sort((a, b) => a.total - b.total);
  ranked.forEach((r, i) => { r.rank = i && r.total === ranked[i - 1].total ? ranked[i - 1].rank : i + 1; r.diff = r.total - ranked[0].total; });
  return rows;
}

export function alertCandidates(state, preferences, now = Date.now()) {
  if (/delay|hold|stop|interrupt|postpon|suspend|completed|official results/i.test(state.message)) return [];
  const rows = rowsForRun(state);
  const waiting = rows.filter(r => !STARTED.has(r.status) && !FINISHED.has(r.status));
  if (!rows.some(r => STARTED.has(r.status))) {
    // Before the first start, only announce the published RUN start and first
    // three slots; never invent an exact individual start interval.
    const seconds = (new Date(state.runs[state.activeRun]?.scheduledStart).getTime() - now) / 1000;
    if (!(seconds > 0 && seconds <= preferences.minutes * 60)) return [];
    return waiting.slice(0, 3).map((r, index) => ({ ...r, ahead: index, runStartsIn: seconds }))
      .filter(r => (preferences.nations || []).includes(r.country) || preferences.swiss && r.country === 'SUI' || preferences.athletes.includes(r.id));
  }
  const intervals = [...state.intervals].sort((a, b) => a - b);
  const median = intervals.length >= 2 ? intervals[Math.floor(intervals.length / 2)] : null;
  return waiting.map((row, index) => ({ ...row, ahead: index, estimatedSeconds: median ? (index + 1) * median : null }))
    .filter(row => ((preferences.nations || []).includes(row.country) || preferences.swiss && row.country === 'SUI' || preferences.athletes.includes(row.id))
      && (row.estimatedSeconds ? row.estimatedSeconds <= preferences.minutes * 60 : row.ahead < 3));
}

export class FisConnection {
  constructor(race, onChange, onError) {
    const match = /^https:\/\/live\.fis-ski\.com\/lv-(al\d+)\.htm$/.exec(race.liveUrl || '');
    if (!match) throw new Error('Timing FIS non ancora pubblicato');
    this.base = `https://live.fis-ski.com/${match[1]}`;
    this.race = race; this.onChange = onChange; this.onError = onError; this.controller = new AbortController();
    this.closed = false; this.failures = 0; this.lastMain = 0;
  }
  async read(file) {
    const text = await readSource(`${this.base}/${file}.xml?t=${Date.now()}`, { signal: this.controller.signal, cache: 'no-store' }, 'FIS timing', 'text');
    return deserialize(text);
  }
  async tick() {
    if (this.closed) return;
    try {
      if (!this.state || Date.now() - this.lastMain > 60000) {
        const next = normalise(await this.read('main'), this.race);
        if (this.state?.activeRun === next.activeRun) { next.intervals = this.state.intervals; next.lastStartAt = this.state.lastStartAt; }
        this.state = next; this.lastMain = Date.now();
      } else {
        const delta = await this.read(`updt${this.state.update}`);
        if (applyUpdate(this.state, delta)) this.lastMain = 0;
      }
      this.failures = 0; this.onChange(this.state);
    } catch (error) {
      if (this.closed) return;
      recordClient({source:'FIS timing',operation:'apply-update',endpoint:this.base,raceId:this.race.id,outcome:'error',error:error.message});
      this.failures++; if (this.failures >= 2) this.lastMain = 0;
      this.onError(error, this.state);
    }
    if (!this.closed) this.timer = setTimeout(() => this.tick(), this.failures ? Math.min(30000, 3000 * 2 ** this.failures) : this.state.delay * 1000);
  }
  close() { this.closed = true; clearTimeout(this.timer); this.controller.abort(); }
}
