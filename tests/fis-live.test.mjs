import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deserialize, normalise, rowsForRun, applyUpdate, alertCandidates, venueInstant } from '../site/assets/fis-live.js';

const race = { date: '2026-10-25', discipline: 'GS', gender: 'M' };
const payload = () => deserialize(readFileSync(new URL('fixtures/fis-al0001-main.xml', import.meta.url), 'utf8'));
test('real FIS snapshot produces the official podium and independent start lists', () => {
  const state = normalise(payload(), race);
  assert.equal(state.runs[0].rows.length, 69);
  assert.equal(state.runs[1].rows.length, 30);
  const podium = rowsForRun(state).filter(r => r.rank <= 3).sort((a, b) => a.rank - b.rank);
  assert.deepEqual(podium.map(r => r.id), ['422729', '512182', '512269']);
  assert.equal(podium[0].total, 104720);
  assert.equal(podium[0].second, 52320);
});
test('reused live URL for another race cannot show an old start list', () => {
  assert.throws(() => normalise(payload(), { ...race, date: '2026-11-15' }), /non corrisponde/);
  assert.throws(() => normalise(payload(), { ...race, gender: 'W' }), /non corrisponde/);
});
test('incremental status marks a start in its own run only', () => {
  const state = normalise(payload(), race);
  const athlete = state.runs[1].rows.find(r => r.bib === 4);
  athlete.status = '';
  applyUpdate(state, { events: { 0: { 0: 'start', 1: 0, 2: 2, 3: 0, 4: 4, 5: '' } }, live: { 0: 2, 1: 716 } }, 1000);
  assert.equal(athlete.status, 'start');
  assert.equal(state.runs[0].rows.find(r => r.bib === 4).status, 'finish');
});
test('a hold message suppresses athlete alerts', () => {
  const state = normalise(payload(), race);
  state.runs[1].rows[0].status = 'start';
  state.runs[1].rows[1].status = '';
  state.runs[1].rows[1].country = 'SUI';
  state.message = 'Race interrupted - start delayed';
  assert.deepEqual(alertCandidates(state, { swiss: true, athletes: [], minutes: 3 }), []);
  state.message = 'Race in progress';
  assert.equal(alertCandidates(state, { swiss: true, athletes: [], minutes: 3 }).length, 1);
});
test('malformed or executable serialization is rejected', () => {
  assert.throws(() => deserialize('<lt>O:4:"Code":0:{}</lt>'));
  assert.throws(() => deserialize('<lt>s:8:"short";</lt>'));
});
test('live run programme is converted from the venue, including North American DST', () => {
  assert.equal(venueInstant({ 2: 2026, 3: 11, 4: 14, 5: 14, 6: 0 }, 'Europe/Helsinki'), '2026-11-14T12:00:00.000Z');
  assert.equal(venueInstant({ 2: 2027, 3: 20, 4: 20, 5: 11, 6: 0 }, 'America/Boise'), null);
  assert.equal(venueInstant({ 2: 2027, 3: 3, 4: 20, 5: 11, 6: 0 }, 'America/Boise'), '2027-03-20T17:00:00.000Z');
});
test('first athletes can be announced before the published run start without inventing individual times', () => {
  const state = normalise(payload(), race);
  state.message = 'Start list';
  state.runs[1].rows.forEach(r => { r.status = ''; });
  state.runs[1].scheduledStart = '2026-10-25T12:00:00Z';
  const first = state.runs[1].rows[0];
  const alerts = alertCandidates(state, { swiss: false, athletes: [first.id], minutes: 3 }, Date.parse('2026-10-25T11:58:00Z'));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].runStartsIn, 120);
  assert.equal(alerts[0].estimatedSeconds, undefined);
});
