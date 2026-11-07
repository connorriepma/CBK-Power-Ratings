// Tests for js/misses-math.js. Run from the repo root:
//
//     node --test tests/misses-math.test.js
//
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/misses-math.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
const g = (date, home, away, hs, as, pred, extra) => Object.assign({ skip: false, date, home, away, neutral: false, hs, as, pred }, extra);

test('raw miss is actual home margin minus the model line, not capped', () => {
  const [r] = M.fromLog([g('2026-11-02', 'duke', 'army', 90, 55, 38.5)]);   // model: Duke by 38.5, won by 35
  near(r.margin, 35); near(r.miss, -3.5); near(r.abs, 3.5);
  const [big] = M.fromLog([g('2026-11-02', 'a', 'b', 100, 40, 5)]);              // beyond the 30-point rating cap
  near(big.miss, 55);
});

test('over is the team the model was too high on', () => {
  const [homeBeat] = M.fromLog([g('d', 'h', 'a', 80, 70, 2)]);   // model h by 2, h won by 10: too high on the away team
  assert.equal(homeBeat.over, 'a');
  const [awayBeat] = M.fromLog([g('d', 'h', 'a', 60, 75, 2)]);   // away beat the line: too high on the home team
  assert.equal(awayBeat.over, 'h');
});

test('skipped games (unrated opponent) are left out', () => {
  const rows = M.fromLog([{ skip: true, date: 'd', home: 'x', away: 'y', hs: 90, as: 50 }, g('d', 'h', 'a', 70, 60, 1)]);
  assert.equal(rows.length, 1);
});

test('rank: biggest miss first, stable on ties', () => {
  const rows = M.rank(M.fromLog([
    g('2026-11-03', 'b', 'a', 70, 60, 0),   // miss 10
    g('2026-11-02', 'd', 'c', 50, 70, 0),   // miss -20
    g('2026-11-02', 'f', 'e', 70, 60, 0),   // miss 10, earlier date wins the tie
  ]));
  assert.deepEqual(rows.map(r => r.home), ['d', 'f', 'b']);
});

test('avgAbs', () => {
  assert.equal(M.avgAbs([]), null);
  near(M.avgAbs(M.fromLog([g('d', 'h', 'a', 70, 60, 0), g('d', 'x', 'y', 50, 70, 0)])), 15);
});

test('lineText names the favorite, PK when dead even', () => {
  const names = { h: 'Home U', a: 'Away U' };
  assert.equal(M.lineText({ pred: 7.46, home: 'h', away: 'a' }, names), 'Home U -7.5');
  assert.equal(M.lineText({ pred: -3, home: 'h', away: 'a' }, names), 'Away U -3.0');
  assert.equal(M.lineText({ pred: 0.01, home: 'h', away: 'a' }, names), 'PK');
});

test('buy-game rows are measured against the adjusted line; summary reports both MAEs', () => {
  const lookup = e => e.home === 'duke' ? { favorite: 'duke', bonus: 4 } : e.home === 'penn' ? { favorite: 'illinois', bonus: 4 } : null;
  const rows = M.fromLog([
    g('2026-11-05', 'duke', 'coastal', 100, 60, 30),      // buy: rating line 30 -> 34, margin 40
    g('2026-11-05', 'penn', 'illinois', 60, 85, -22),     // buy, away favorite: rating line -22 -> -26, margin -25
    g('2026-11-06', 'a', 'b', 70, 60, 5)                  // not a buy game
  ], lookup);
  near(rows[0].pred, 34); near(rows[0].predRating, 30); near(rows[0].miss, 6);
  near(rows[1].pred, -26); near(rows[1].miss, 1); near(rows[1].abs, 1);
  near(rows[2].pred, 5); near(rows[2].miss, 5);
  const st = M.summary(rows);
  assert.equal(st.n, 3); assert.equal(st.nBuy, 2);
  near(st.mae, (6 + 1 + 5) / 3);
  near(st.maeRating, (10 + 3 + 5) / 3);
  near(st.bias, (6 - 1 + 5) / 3);            // away favorite: miss 1 is toward the away team, so it counts as -1
  assert.equal(M.summary([]), null);
  assert.equal(M.fromLog([g('2026-11-05', 'a', 'b', 70, 60, 5)])[0].pred, 5);   // no lookup: unchanged
});

test('weekly MAE groups by Monday', () => {
  assert.equal(M.weekStart('2026-11-05'), '2026-11-02');
  assert.equal(M.weekStart('2026-11-08'), '2026-11-02');
  assert.equal(M.weekStart('2026-11-09'), '2026-11-09');
  const rows = M.fromLog([g('2026-11-05', 'a', 'b', 70, 60, 4), g('2026-11-09', 'c', 'd', 80, 60, 10)]);
  const w = M.byWeek(rows);
  assert.equal(w.length, 2); assert.equal(w[0].week, '2026-11-02'); near(w[0].mae, 6); near(w[1].mae, 10);
});
