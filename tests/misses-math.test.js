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

test('buy games: misses are from the favorite side, against the rating line and the adjusted line', () => {
  const rows = M.fromLog([
    g('2026-11-05', 'duke', 'coastal', 100, 60, 30),            // fav home: won by 40 vs rating line 30
    g('2026-11-05', 'penn', 'illinois', 60, 85, -22),            // fav away: won by 25 vs rating line 22
    g('2026-11-05', 'a', 'b', 70, 60, 5)                         // not a buy game
  ]);
  const lookup = r => r.home === 'duke' ? { favorite: 'duke', bonus: 4 } : r.home === 'penn' ? { favorite: 'illinois', bonus: 4 } : null;
  const bg = M.buyGames(rows, lookup);
  assert.equal(bg.length, 2);
  near(bg[0].ratingLine, 30); near(bg[0].adjLine, 34); near(bg[0].missRating, 10); near(bg[0].missAdj, 6);
  near(bg[1].ratingLine, 22); near(bg[1].adjLine, 26); near(bg[1].missRating, 3); near(bg[1].missAdj, -1);
  const st = M.buyStats(bg);
  assert.equal(st.n, 2); near(st.maeRating, 6.5); near(st.maeAdj, 3.5); near(st.biasRating, 6.5); near(st.biasAdj, 2.5);
  assert.equal(st.covered, 1);
  assert.equal(M.buyStats([]), null);
});
