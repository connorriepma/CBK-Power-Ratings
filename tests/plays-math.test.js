// Tests for js/plays-math.js. Run from the repo root:
//
//     node --test tests/plays-math.test.js
//
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/plays-math.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);

test('grade: favorite covers, fails, and pushes', () => {
  assert.equal(M.grade(90, 55, -4.5), 'win');     // won by 35, laid 4.5
  assert.equal(M.grade(70, 68, -4.5), 'loss');    // won by 2, laid 4.5
  assert.equal(M.grade(70, 67, -3), 'push');      // won by 3, laid 3
  assert.equal(M.grade(70, 67, -2.5), 'win');
});

test('grade: underdog covers, fails, and pushes', () => {
  assert.equal(M.grade(65, 68, 3.5), 'win');      // lost by 3, got 3.5
  assert.equal(M.grade(60, 68, 3.5), 'loss');     // lost by 8, got 3.5
  assert.equal(M.grade(65, 68, 3), 'push');       // lost by 3, got 3
  assert.equal(M.grade(70, 65, 3.5), 'win');      // outright win always covers
});

test('grade: pick em', () => {
  assert.equal(M.grade(71, 70, 0), 'win');
  assert.equal(M.grade(70, 71, 0), 'loss');
});

test('half-point lines never push', () => {
  for (let m = -40; m <= 40; m++) {
    for (const line of [-10.5, -3.5, -0.5, 0.5, 6.5]) {
      assert.notEqual(M.grade(100 + m, 100, line), 'push');
    }
  }
});

test('risk: units are to-win', () => {
  near(M.risk(1, -110), 1.1);
  near(M.risk(2, -150), 3);
  near(M.risk(1, 120), 100 / 120);
  near(M.risk(1, 100), 1);
  near(M.risk(1, -100), 1);
});

test('net: win pays units, loss costs the stake, push is zero', () => {
  near(M.net('win', 1, -110), 1);
  near(M.net('win', 2.5, 140), 2.5);
  near(M.net('loss', 1, -110), -1.1);
  near(M.net('loss', 1, 120), -100 / 120);
  assert.equal(M.net('push', 3, -110), 0);
});

test('summarize: record, win %, net units, ROI; pushes and pending excluded from risk', () => {
  const s = M.summarize([
    { result: 'win', units: 1, odds: -110 },
    { result: 'win', units: 1, odds: -110 },
    { result: 'loss', units: 1, odds: -110 },
    { result: 'push', units: 5, odds: -110 },
    { result: null, units: 9, odds: -110 }
  ]);
  assert.deepEqual([s.w, s.l, s.p, s.pending], [2, 1, 1, 1]);
  near(s.net, 2 - 1.1);
  near(s.risked, 3.3);
  near(s.winPct, 2 / 3);
  near(s.roi, 0.9 / 3.3);
});

test('summarize: empty and pending-only have no win % or ROI', () => {
  for (const list of [[], [{ result: null, units: 1, odds: -110 }]]) {
    const s = M.summarize(list);
    assert.equal(s.winPct, null);
    assert.equal(s.roi, null);
    assert.equal(s.net, 0);
  }
  const pushOnly = M.summarize([{ result: 'push', units: 1, odds: -110 }]);
  assert.equal(pushOnly.winPct, null);
  assert.equal(pushOnly.roi, null);
});

test('parseLine', () => {
  assert.equal(M.parseLine('-4.5'), -4.5);
  assert.equal(M.parseLine('+3'), 3);
  assert.equal(M.parseLine('3'), 3);
  assert.equal(M.parseLine(' PK '), 0);
  assert.equal(M.parseLine('−4.5'), -4.5);
  assert.equal(M.parseLine('-0'), 0);
  for (const bad of ['', 'abc', '-4.3', '-45.5.1', '450', '--3', '4.25']) {
    assert.ok(Number.isNaN(M.parseLine(bad)), bad);
  }
});

test('parseOdds', () => {
  assert.equal(M.parseOdds('-110'), -110);
  assert.equal(M.parseOdds('+105'), 105);
  assert.equal(M.parseOdds('105'), 105);
  assert.equal(M.parseOdds('-1000'), -1000);
  for (const bad of ['', '-90', '0', '11', '-110.5', 'even', '+99']) {
    assert.ok(Number.isNaN(M.parseOdds(bad)), bad);
  }
});

test('parseUnits', () => {
  assert.equal(M.parseUnits('1'), 1);
  assert.equal(M.parseUnits('0.5'), 0.5);
  assert.equal(M.parseUnits('2.25'), 2.25);
  for (const bad of ['', '0', '-1', '1.234', 'x', '101']) {
    assert.ok(Number.isNaN(M.parseUnits(bad)), bad);
  }
});

test('formatting', () => {
  assert.equal(M.fmtLine(-4.5), '-4.5');
  assert.equal(M.fmtLine(3), '+3');
  assert.equal(M.fmtLine(0), 'PK');
  assert.equal(M.fmtOdds(-110), '-110');
  assert.equal(M.fmtOdds(105), '+105');
  assert.equal(M.fmtUnits(-1.1, true), '-1.10');
  assert.equal(M.fmtUnits(0.9, true), '+0.90');
  assert.equal(M.fmtUnits(0, true), '0.00');
  assert.equal(M.fmtUnits(-0.0001, true), '0.00');
  assert.equal(M.fmtPct(0.5714, false), '57.1%');
  assert.equal(M.fmtPct(-0.042, true), '-4.2%');
});
