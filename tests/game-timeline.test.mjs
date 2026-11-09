import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, gameTimeline, mergePenalties, periodKey, penaltyLabel, revokeLabel } from '../site/assets/game-timeline.js';

const game = { home: 1, away: 2, homePeriods: [1, 0, 0, 1], awayPeriods: [0, 1, 0, 0], decision: 'SO' };
const base = { game_id: 9, team_id: 1, team_side: 'home', player_id: 5, player_name: 'Rossi Luca', player_jersey: 7.0 };
const penalty = (event_index, minutes, end) => ({ ...base, event_index, event_type: 'penalty', period: '3. Drittel', period_number: 3, time: '45:35', game_seconds: 2735, penalty_name: 'Beinstellen ', penalty_minutes: minutes, penalty_start: '45:35', penalty_end: end });

test('il supplementare si riconosce dall’etichetta e non da period_number', () => {
  assert.equal(periodKey({ period: '1. Verlängerung', period_number: 3, event_type: 'goal' }), 'ot');
  assert.equal(periodKey({ period: 'Shootout', period_number: 5, event_type: 'shootout' }), 'so');
  assert.equal(periodKey({ period: '2. Drittel', period_number: 2, event_type: 'goal' }), 2);
});

test('una penalità 5 + 20 diventa una sola voce', () => {
  const merged = mergePenalties([penalty(1, 5, '50:35'), penalty(2, 20, '60:00')]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].parts.length, 2);
});

test('i rigori sostituiscono il goal riassuntivo e tengono il conteggio', () => {
  const events = [
    { event_index: 1, event_type: 'goal', team_id: 1, period: '1. Verlängerung / Shootout', goal_tags: 'SO', time: '65:00', game_seconds: 3900, score_home: 2, score_away: 1 },
    { ...base, event_index: 2, event_type: 'shootout', period: 'Shootout', shootout_number: 1, shootout_scored: true },
    { ...base, event_index: 3, team_id: 2, event_type: 'shootout', period: 'Shootout', shootout_number: 2, shootout_scored: false },
  ];
  const timeline = buildTimeline(game, { events });
  assert.equal(timeline.events.length, 2);
  assert.deepEqual(timeline.periods.at(-1).score, [1, 0]);
  assert.deepEqual(timeline.periods.find(period => period.key === 'ot').score, [0, 0]);
  assert.equal(timeline.total, 3900);
});

test('etichette tradotte, con il testo originale se manca la traduzione', () => {
  assert.equal(penaltyLabel('Beinstellen '), 'Sgambetto');
  assert.equal(penaltyLabel('Neue Strafe'), 'Neue Strafe');
  assert.equal(revokeLabel('CC-Offiside'), 'Coach’s challenge · fuorigioco');
});

test('i nomi delle fonti vengono sempre codificati', () => {
  const view = { esc: value => String(value ?? '').replace(/</g, '&lt;'), mark: () => '', team: () => ({ name: 'T', short: 'T' }) };
  const html = gameTimeline(game, { events: [{ ...penalty(1, 2, '47:35'), player_name: '<b>x' }] }, view);
  assert.ok(!html.includes('<b>x'));
  assert.ok(html.includes('Sgambetto'));
});

test('i minuti di penalità del periodo vengono dalla cronaca', () => {
  const timeline = buildTimeline(game, { events: [penalty(1, 5, '50:35'), penalty(2, 20, '60:00')], stats: [{ statistic: 'PIM 3P', home_value: '0', away_value: '0' }] });
  assert.deepEqual(timeline.periods.find(period => period.key === 3).pim, [25, 0]);
});
