// Tests for js/suggested-math.js. Run from the repo root:  node --test tests/suggested-math.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/suggested-math.js');

const g = (id, date, home, away, extra) => Object.assign({ id, date, home, away, neutral: false }, extra);
const feed = (o) => ({ games: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { lines: { DK: { spread: v } } }])) });
const base = { provider: 'DK', minGap: 2.5, today: '2026-11-24', nonD1: 'X' };

test('model likes the home team more than the market: take home at the market number', () => {
  // market: home -7 (expects home by 7); model expects home by 11
  const r = S.suggest([g('a', '2026-11-24', 'Duke', 'Vermont')], feed({ a: -7 }), () => 11, base);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].side, r[0].marketLine, r[0].modelLine, r[0].gap], ['Duke', -7, -11, 4]);
});

test('model likes the away team more: take away, lines flip sign', () => {
  const r = S.suggest([g('a', '2026-11-24', 'Duke', 'Vermont')], feed({ a: -7 }), () => 3, base);
  assert.deepEqual([r[0].side, r[0].marketLine, r[0].modelLine, r[0].gap], ['Vermont', 7, 3, 4]);
});

test('below the minimum gap, played, past, non-D1, no line and no model line are all left out', () => {
  const games = [g('small', '2026-11-24', 'A', 'B'), g('played', '2026-11-24', 'A', 'B', { result: {} }), g('past', '2026-11-23', 'A', 'B'),
    g('nond1', '2026-11-24', 'A', 'X'), g('noline', '2026-11-24', 'A', 'B'), g('nomodel', '2026-11-24', 'A', 'B')];
  const f = feed({ small: -7, played: -7, past: -7, nond1: -7, nomodel: -7 });
  const r = S.suggest(games, f, (x) => (x.id === 'nomodel' ? null : x.id === 'small' ? 8.5 : 14), base);
  assert.equal(r.length, 0);
});

test('exactly the minimum gap counts; sorted by biggest gap; logged flag set', () => {
  const games = [g('a', '2026-11-25', 'A', 'B'), g('b', '2026-11-24', 'C', 'D'), g('c', '2026-11-24', 'E', 'F')];
  const f = feed({ a: -5, b: -5, c: -5 });
  const margin = { a: 7.5, b: 11, c: 5 };
  const r = S.suggest(games, f, (x) => margin[x.id], Object.assign({ logged: { b: true } }, base));
  assert.deepEqual(r.map(x => x.id), ['b', 'a']);
  assert.deepEqual(r.map(x => x.logged), [true, false]);
});

test('missing or empty feed gives nothing', () => {
  assert.deepEqual(S.suggest([g('a', '2026-11-24', 'A', 'B')], null, () => 10, base), []);
  assert.deepEqual(S.suggest([g('a', '2026-11-24', 'A', 'B')], { games: {} }, () => 10, base), []);
});
