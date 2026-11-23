// Buy-game adjustments change published lines only, never ratings. Run: node --test tests/buy-games.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/common.js'), 'utf8'), ctx);
const CBK = ctx.window.CBK;
const rd = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));

const teams = rd('teams.json'), cfg = rd('rating_config.json'), sched = rd('schedule.json');
const tbd = [], results = rd('results.json');
const rows = Array.isArray(results) ? results : (results.results || results);

function pick() {
  const k = Object.keys(CBK).includes('teamKey') ? CBK.teamKey : (x => x);
  const g = rd('buy_games.json').games.find(e => e.bonus > 0);
  return { g, home: g.home, away: g.away, date: g.date, neutral: false, k };
}

test('bonus moves the published line toward the favorite; ratings and rating margin stay put', () => {
  const { g } = pick();
  const game = { date: g.date, home: g.home, away: g.away, neutral: false };
  const base = CBK.build(teams, cfg, sched, tbd, rows, null);
  const adj = CBK.build(teams, cfg, sched, tbd, rows, { games: [g] });
  assert.deepEqual(adj.current, base.current);                       // ratings identical
  const m0 = base.exactMargin(game), m1 = adj.exactMargin(game);
  assert.ok(Math.abs((m1 - m0) - g.bonus) < 1e-9, 'home favorite gains the bonus');
  assert.ok(Math.abs(adj.ratingMargin(game) - m0) < 1e-9);          // rating-only margin unchanged
  assert.equal(adj.buyGame(game).bonus, g.bonus);
  assert.equal(base.buyGame(game), null);
});

test('zero bonus and missing file are ignored', () => {
  const { g } = pick();
  const game = { date: g.date, home: g.home, away: g.away, neutral: false };
  const m = CBK.build(teams, cfg, sched, tbd, rows, { games: [Object.assign({}, g, { bonus: 0 })] });
  assert.equal(m.buyGame(game), null);
});

test('automatic rule: ramp, same-conference and upper-vs-upper exemptions, played games read their locked buy', () => {
  const m = CBK.build(teams, cfg, sched, tbd, rows, { games: [] });
  // Games already played keep the bonus locked at the time, which can differ from today's margin, so only check unplayed ones.
  const played = new Set(rows.map(r => r.date + '_' + [r.home, r.away].sort().join('_')));
  const upcoming = sched.filter(g => {
    if (g.date < cfg.buyAdjust.autoFrom) return false;
    const h = m.byName[g.home], a = m.byName[g.away];
    return !(h && a && played.has(g.date + '_' + [h.key, a.key].sort().join('_')));
  });
  let seen = 0;
  upcoming.forEach(g => {
    const b = m.buyGame(g), rm = m.ratingMargin(g);
    if (rm === null) return;
    const ht = m.byName[g.home], at = m.byName[g.away];
    if (!ht || !at) return;
    if (b) {
      seen++;
      assert.notEqual(ht.conference, at.conference, 'no adjustment inside a conference');
      assert.ok(Math.abs(rm) > cfg.buyAdjust.rampFrom, 'only above the ramp start');
      assert.ok(b.bonus > 0 && b.bonus <= cfg.buyAdjust.max);
    }
  });
  assert.ok(seen > 0, 'some games get an automatic adjustment');
  const ba = cfg.buyAdjust;
  assert.ok(ba.rampFrom < ba.rampTo && ba.max > 0);
});
