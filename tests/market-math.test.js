// Tests for js/market-math.js. Run from the repo root:  node --test tests/market-math.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/market-math.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
const mk = (spread) => ({ lines: { 'Draft Kings': { spread: spread }, Bovada: { spread: spread + 1 } } });
const row = (date, home, away, pred, margin) => ({ date, home, away, pred, margin });

test('join pairs by date and teams in either order, uses the chosen book, and flips the sign to a home margin', () => {
  const market = { '2026-11-20_duke_vermont': mk(-21.5) };
  const g = X.join([row('2026-11-20', 'duke', 'vermont', 20, 25), row('2026-11-20', 'a', 'b', 3, 1)], market, 'Draft Kings');
  assert.equal(g.length, 1);
  near(g[0].market, 21.5);
  near(X.join([row('2026-11-20', 'duke', 'vermont', 20, 25)], market, 'Bovada')[0].market, 20.5);
  assert.equal(X.join([row('2026-11-20', 'duke', 'vermont', 20, 25)], market, 'Caesars').length, 0);
  assert.equal(X.marketId('2026-11-20', 'vermont', 'duke'), '2026-11-20_duke_vermont');
});

test('summary: MAE of each line against the final margin', () => {
  const g = [{ model: 10, market: 12, margin: 14 }, { model: -4, market: -2, margin: -3 }];
  const s = X.summary(g);
  near(s.maeModel, (4 + 1) / 2);
  near(s.maeMarket, (2 + 1) / 2);
  near(s.diff, 1);
  assert.equal(X.summary([]), null);
});

test('model side ATS: home side when the model likes home more, away side otherwise, pushes and agreement handled', () => {
  assert.equal(X.modelSide({ model: 10, market: 7, margin: 9 }), 1);    // model on home -7, home won by 9
  assert.equal(X.modelSide({ model: 10, market: 7, margin: 5 }), -1);
  assert.equal(X.modelSide({ model: 4, market: 7, margin: 5 }), 1);     // model on away +7, home won by only 5
  assert.equal(X.modelSide({ model: 4, market: 7, margin: 7 }), 0);
  assert.equal(X.modelSide({ model: 7, market: 7, margin: 9 }), null);
  const a = X.ats([{ model: 10, market: 7, margin: 9 }, { model: 10, market: 7, margin: 5 }, { model: 7, market: 7, margin: 1 }]);
  assert.deepEqual([a.w, a.l, a.p], [1, 1, 0]);
  near(a.pct, 0.5);
});

test('byGap and bySpread put each game in exactly one bucket', () => {
  const g = [{ model: 10, market: 10.5, margin: 8 }, { model: 10, market: 7, margin: 8 }, { model: 25, market: 17, margin: 30 }, { model: -30, market: -26, margin: -20 }];
  const gap = X.byGap(g);
  assert.deepEqual(gap.map(b => b.n), [1, 0, 2, 1]);
  const sp = X.bySpread(g);
  assert.equal(sp.reduce((s, b) => s + b.n, 0), 4);
  assert.deepEqual(sp.map(b => b.n), [0, 0, 1, 1, 0, 1, 0, 0, 1]);
});

test('byWeek groups Monday-start weeks in order', () => {
  const g = [{ date: '2026-11-22', model: 5, market: 5, margin: 5 }, { date: '2026-11-23', model: 5, market: 5, margin: 5 }, { date: '2026-11-17', model: 5, market: 5, margin: 5 }];
  const w = X.byWeek(g);
  assert.deepEqual(w.map(x => [x.week, x.n]), [['2026-11-23', 3]]);   // the 2-game first week folds into the next
  const many = Array.from({ length: 10 }, () => ({ date: '2026-11-17', model: 5, market: 5, margin: 5 })).concat(g.slice(1, 2));
  assert.deepEqual(X.byWeek(many).map(x => [x.week, x.n]), [['2026-11-16', 10], ['2026-11-23', 1]]);
});
