// Tests for js/quad-math.js. Run from the repo root:
//
//     node --test tests/quad-math.test.js
//
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/quad-math.js');

test('quadFor: home cutoffs 30 / 75 / 160', () => {
  assert.equal(M.quadFor(1, 'home'), 1);
  assert.equal(M.quadFor(30, 'home'), 1);
  assert.equal(M.quadFor(31, 'home'), 2);
  assert.equal(M.quadFor(75, 'home'), 2);
  assert.equal(M.quadFor(76, 'home'), 3);
  assert.equal(M.quadFor(160, 'home'), 3);
  assert.equal(M.quadFor(161, 'home'), 4);
  assert.equal(M.quadFor(365, 'home'), 4);
});

test('quadFor: neutral cutoffs 50 / 100 / 200', () => {
  assert.equal(M.quadFor(50, 'neutral'), 1);
  assert.equal(M.quadFor(51, 'neutral'), 2);
  assert.equal(M.quadFor(100, 'neutral'), 2);
  assert.equal(M.quadFor(101, 'neutral'), 3);
  assert.equal(M.quadFor(200, 'neutral'), 3);
  assert.equal(M.quadFor(201, 'neutral'), 4);
});

test('quadFor: away cutoffs 75 / 135 / 240', () => {
  assert.equal(M.quadFor(75, 'away'), 1);
  assert.equal(M.quadFor(76, 'away'), 2);
  assert.equal(M.quadFor(135, 'away'), 2);
  assert.equal(M.quadFor(136, 'away'), 3);
  assert.equal(M.quadFor(240, 'away'), 3);
  assert.equal(M.quadFor(241, 'away'), 4);
});

test('rankTeams: best rating is 1, ties break by name', () => {
  const r = M.rankTeams({ B: 90, A: 90, C: 95, D: 80 });
  assert.deepEqual(r, { C: 1, A: 2, B: 3, D: 4 });
});

test('buildQuads: the same game lands in different quads for each team', () => {
  // Duke is rank 1, Army is rank 300. Duke beats Army at home.
  const ranks = { Duke: 1, Army: 300 };
  const q = M.buildQuads([{ home: 'Duke', away: 'Army', neutral: false, result: { home: 90, away: 55 } }], ranks);
  assert.deepEqual(q.Duke[4], { w: 1, l: 0 });   // Army is rank 300: Q4 for Duke
  assert.deepEqual(q.Army[1], { w: 0, l: 1 });   // Duke is rank 1 on the road: Q1 for Army
  assert.deepEqual(q.Duke[1], { w: 0, l: 0 });
});

test('buildQuads: site matters (the same opponent rank is a tougher quad on the road)', () => {
  const ranks = { A: 1, B: 100 };
  // B is rank 100: home vs B for A is Q3, but at B (A away) the same rank 100 is Q2 for A.
  const home = M.buildQuads([{ home: 'A', away: 'B', neutral: false, result: { home: 70, away: 60 } }], ranks);
  assert.deepEqual(home.A[3], { w: 1, l: 0 });
  const away = M.buildQuads([{ home: 'B', away: 'A', neutral: false, result: { home: 60, away: 70 } }], ranks);
  assert.deepEqual(away.A[2], { w: 1, l: 0 });
  const neut = M.buildQuads([{ home: 'A', away: 'B', neutral: true, result: { home: 70, away: 60 } }], ranks);
  assert.deepEqual(neut.A[2], { w: 1, l: 0 });   // rank 100 neutral is the last Q2 slot
});

test('buildQuads: unplayed games and non-Division I opponents are not counted', () => {
  const ranks = { A: 1, B: 2 };
  const q = M.buildQuads([
    { home: 'A', away: 'B', neutral: false },
    { home: 'A', away: 'Non D1 Opponent', neutral: false, result: { home: 90, away: 40 } }
  ], ranks);
  [1, 2, 3, 4].forEach(n => { assert.deepEqual(q.A[n], { w: 0, l: 0 }); assert.deepEqual(q.B[n], { w: 0, l: 0 }); });
});

test('teamGames: every game for the team, with the opponent quad from its own side', () => {
  const ranks = { Duke: 1, Army: 300, Kentucky: 12 };
  const games = [
    { date: '2026-12-01', home: 'Kentucky', away: 'Duke', neutral: false },                                   // upcoming, Duke away at rank 12: Q1
    { date: '2026-11-02', home: 'Duke', away: 'Army', neutral: false, result: { home: 90, away: 55 } },       // played, Duke home vs rank 300: Q4
    { date: '2026-11-10', home: 'Army', away: 'Kentucky', neutral: false },                                    // not Duke's game
    { date: '2026-11-20', home: 'Duke', away: 'Non D1 Opponent', neutral: false, result: { home: 99, away: 40 } }
  ];
  const g = M.teamGames(games, ranks, 'Duke');
  assert.equal(g.length, 3);
  assert.deepEqual(g.map(x => x.opp), ['Army', 'Non D1 Opponent', 'Kentucky']);   // date order
  assert.equal(g[0].quad, 4); assert.equal(g[0].site, 'home');
  assert.deepEqual(g[0].result, { us: 90, them: 55, won: true });
  assert.equal(g[1].quad, null); assert.equal(g[1].rank, null);                  // non-D1: no quad
  assert.equal(g[2].quad, 1); assert.equal(g[2].site, 'away'); assert.equal(g[2].result, null);
});

test('teamGames: a loss is recorded from the team side', () => {
  const g = M.teamGames([{ date: '2026-11-02', home: 'A', away: 'B', neutral: true, result: { home: 60, away: 70 } }], { A: 1, B: 2 }, 'A');
  assert.deepEqual(g[0].result, { us: 60, them: 70, won: false });
  assert.equal(g[0].site, 'neutral');
});
