// Tests for js/totals-math.js. Run from the repo root:
//
//     node --test tests/totals.test.js
//
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/totals-math.js');

const near = (a, b, e) => assert.ok(Math.abs(a - b) < (e || 1e-9), a + ' vs ' + b);
const CFG = { kTiers: [{ upTo: 8, k: 0.08 }, { upTo: 18, k: 0.05 }, { upTo: null, k: 0.03 }] };
const BASE = {
  avgTempo: 70, avgEff: 100, errCap: 30, share: 0.5,
  teams: {
    a: { team: 'A', tempo: 70, oe: 100, de: 100 },
    b: { team: 'B', tempo: 70, oe: 100, de: 100 },
    fast: { team: 'Fast', tempo: 76, oe: 110, de: 100 },
    slow: { team: 'Slow', tempo: 64, oe: 100, de: 95 }
  }
};

test('average teams at average tempo score average efficiency', () => {
  const m = T.matchup(BASE, BASE.teams.a, BASE.teams.b);
  near(m.poss, 70); near(m.home, 70); near(m.total, 140);
});

test('possessions add the two tempos minus the national average', () => {
  near(T.matchup(BASE, BASE.teams.fast, BASE.teams.slow).poss, 70);
});

test('offense is judged against the opponent defense', () => {
  const m = T.matchup(BASE, BASE.teams.fast, BASE.teams.slow);
  near(m.home, 110 * 95 / 100 * 70 / 100);
  near(m.away, 100 * 100 / 100 * 70 / 100);
});

test('K follows games played', () => {
  assert.equal(T.kFor(0, CFG), 0.08); assert.equal(T.kFor(7, CFG), 0.08);
  assert.equal(T.kFor(8, CFG), 0.05); assert.equal(T.kFor(18, CFG), 0.03);
});

test('replay: a high-scoring game raises both offsets, by K x miss x share', () => {
  const r = T.replay(BASE, CFG, [{ date: '2026-11-03', home: 'a', away: 'b', homeScore: 90, awayScore: 70 }]);
  near(r.off.a, 0.08 * 20 * 0.5); near(r.off.b, 0.08 * 20 * 0.5);
  assert.equal(r.played.a, 1);
});

test('replay: the miss is capped', () => {
  const r = T.replay(BASE, CFG, [{ date: '2026-11-03', home: 'a', away: 'b', homeScore: 150, awayScore: 100 }]);
  near(r.off.a, 0.08 * 30 * 0.5);
});

test('replay: skips non-D1 games and does not count them', () => {
  const r = T.replay(BASE, CFG, [{ date: '2026-11-03', home: 'a', away: 'nope', homeScore: 90, awayScore: 50 }]);
  assert.equal(r.played.a, 0); assert.equal(r.log.length, 0);
});

test('buildGames: dedupes the two team-side listings and drops non-D1', () => {
  const sched = [
    { date: '2026-11-03', home: 'A', away: 'B' },
    { date: '2026-11-03', home: 'B', away: 'A' },
    { date: '2026-11-04', home: 'A', away: 'Non D1 Opponent' }
  ];
  const rows = T.buildGames(BASE, sched, { a: 1, b: 2 });
  assert.equal(rows.length, 1);
  near(rows[0].pre, 140); near(rows[0].total, 143);
});

test('roundHalf rounds to the nearest 0.5', () => {
  assert.equal(T.roundHalf(151.26), 151.5); assert.equal(T.roundHalf(151.24), 151);
});
