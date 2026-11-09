import test from 'node:test';
import assert from 'node:assert/strict';
import { countdown, previewStandings, racePreview, seasonPosition, trackStats } from '../site/assets/race-preview.js';

const race = (id, date, discipline, gender = 'W', status = 'scheduled') => ({ id, date, discipline, gender, status, disciplineName: discipline, runs: [{ start: `${date}T09:00:00Z` }] });
const races = [race('b', '2026-11-14', 'SL'), race('a', '2026-10-24', 'GS'), race('m', '2026-11-01', 'SL', 'M'), race('c', '2026-11-20', 'SL'), race('x', '2026-11-02', 'SL', 'W', 'cancelled')];

test('conto alla rovescia', () => {
  assert.equal(countdown('2026-11-14', '2026-11-09'), '5 giorni');
  assert.equal(countdown('2026-11-10', '2026-11-09'), 'Domani');
  assert.equal(countdown('2026-11-09', '2026-11-09'), 'Oggi');
  assert.equal(countdown('2026-11-08', '2026-11-09'), null);
});

test('posizione in stagione per genere, senza gare annullate', () => {
  assert.deepEqual(seasonPosition(races[0], races), { cup: { number: 2, total: 3 }, discipline: { number: 1, total: 2 } });
});

test('statistiche pista: profilo prima, scheda per i buchi, al massimo tre', () => {
  const course = { facts: [{ label: 'Partenza', value: '438 m' }, { label: 'Arrivo', value: '258 m' }, { label: 'Pendenza massima', value: '52%' }] };
  assert.deepEqual(trackStats(course, { metrics: { vertical: '180 m' } }), [['Dislivello', '180 m'], ['Pendenza max', '52%'], ['Quote', '438 → 258 m']]);
  assert.deepEqual(trackStats(null, { metrics: { maxgrad: '85% · Mausefalle' } }), [['Pendenza max', '85%']]);
  assert.deepEqual(trackStats(null, null), []);
});

test('classifica: specialità se ha punti, altrimenti generale', () => {
  const rows = [{ rank: 2, name: 'B', points: 80 }, { rank: 1, name: 'A', points: 100 }];
  const groups = { W: { tables: { SL: [], GS: rows, ALL: rows } } };
  assert.equal(previewStandings(race('g', '2026-11-14', 'GS'), groups).title, 'Coppa di gigante');
  const fallback = previewStandings(race('s', '2026-11-14', 'SL'), groups);
  assert.equal(fallback.title, 'Coppa generale');
  assert.equal(fallback.rows[0].name, 'A');
  assert.equal(previewStandings(race('s', '2026-11-14', 'SL'), {}), null);
});

test('una gara annullata non mostra conto alla rovescia né classifica', () => {
  const view = { esc: String, flag: () => '', safeUrl: String, athleteStyle: () => '', todayKey: '2026-11-01' };
  const html = racePreview(races[4], { races, cups: { W: { tables: { ALL: [{ rank: 1, name: 'A', points: 1 }] } } } }, view);
  assert.ok(!html.includes('preview-tile'));
  assert.ok(!html.includes('mini-table'));
});

test('la pista compare anche senza scheda, se il profilo ha numeri', () => {
  const view = { esc: String, flag: () => '', safeUrl: String, athleteStyle: () => '', todayKey: '2026-11-01', mapCourse: 'Avet', profile: { metrics: { vertical: '210 m' } } };
  assert.ok(racePreview(races[0], { races, cups: {} }, view).includes('Avet'));
  assert.ok(!racePreview(races[0], { races, cups: {} }, { ...view, profile: { metrics: {} } }).includes('Avet'));
});

test('i numeri delle schede usano il formato svizzero', () => {
  const course = { facts: [{ label: 'Lunghezza', value: '3.035 m' }, { label: 'Partenza', value: '1.020 m' }, { label: 'Arrivo', value: '182 m' }] };
  assert.deepEqual(trackStats(course, null), [['Lunghezza', '3’035 m'], ['Quote', '1’020 → 182 m']]);
});
