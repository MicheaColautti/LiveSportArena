import test from 'node:test';
import assert from 'node:assert/strict';
import { statLabel, statValue, statAmount, visibleStats } from '../site/assets/hockey-columns.js';

const codes = ['BkS', 'BkS 1P', 'FO Total', 'FO%', 'FO% 1P', 'FO% dz 1P', 'FO% nz Total', 'FO% oz Total', 'FOL Total', 'FOW Total', 'PIM Total', 'PK GA', 'PK SI', 'PK%', 'PKT', 'PP OP', 'PP%', 'PPG', 'PPT', 'SHG', 'SHM 2P', 'SHP Total', 'SOG 3P', 'SOG Total'];

test('tutti i codici SIHF noti hanno un’etichetta italiana', () => {
  for (const code of codes) assert.notEqual(statLabel(code), code, code);
  assert.equal(statLabel('SOG 1P'), 'Tiri in porta · 1° periodo');
  assert.equal(statLabel('SOG Total'), 'Tiri in porta');
  assert.equal(statLabel('FO% oz Total'), 'Ingaggi vinti in zona offensiva');
  assert.equal(statLabel('Nuovo'), 'Nuovo');
});

test('valori: percentuali leggibili e tempi confrontati in secondi', () => {
  assert.equal(statValue('FO%', '62.50'), '62.5%');
  assert.equal(statValue('SOG Total', '34'), '34');
  assert.equal(statValue('PPT', null), '–');
  assert.equal(statAmount('06:56'), 416);
  assert.equal(statAmount('14'), 14);
});

test('nasconde il doppione PP GA e i PIM per periodo azzerati dalla fonte', () => {
  const row = (statistic, home_value, away_value) => ({ statistic, home_value, away_value });
  const shown = rows => visibleStats(rows).map(item => item.statistic);
  assert.deepEqual(shown([row('PIM Total', '6', '10'), row('PIM 1P', '0', '0'), row('PIM 2P', '0', '0'), row('PP GA', '0', '1')]), ['PIM Total']);
  assert.deepEqual(shown([row('PIM Total', '6', '0'), row('PIM 1P', '6', '0')]), ['PIM Total', 'PIM 1P']);
});
