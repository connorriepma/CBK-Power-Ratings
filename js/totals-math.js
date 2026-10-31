// Pure math for the Totals tab: preseason game totals and the in-season offset replay.
// No DOM and no globals beyond the export, so tests/totals.test.js can load it in Node.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CBKTotals = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function teamKey(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function gameId(date, a, b) { return date + '_' + [a, b].sort().join('_'); }

  function roundHalf(x) { return Math.round(x * 2) / 2; }

  // Possessions and the two teams' points, from base.json team rows.
  function matchup(base, h, a) {
    var poss = h.tempo + a.tempo - base.avgTempo;
    var hp = h.oe * a.de / base.avgEff * poss / 100;
    var ap = a.oe * h.de / base.avgEff * poss / 100;
    return { poss: poss, home: hp, away: ap, total: hp + ap };
  }

  // Same K-by-games-played lookup the rating engine uses (cfg = data/rating_config.json).
  function kFor(gamesBefore, cfg) {
    var n = gamesBefore + 1;
    for (var i = 0; i < cfg.kTiers.length; i++) {
      var t = cfg.kTiers[i];
      if (t.upTo === null || n <= t.upTo) return t.k;
    }
    return cfg.kTiers[cfg.kTiers.length - 1].k;
  }

  // Replay stored results (date order) into per-team total offsets.
  // Returns { off: key -> offset, played: key -> games, log: [{id, pred, actual, miss}] }.
  // Games with a team missing from base.teams (e.g. non-D1) are skipped.
  function replay(base, cfg, results) {
    var off = {}, played = {}, log = [];
    Object.keys(base.teams).forEach(function (k) { off[k] = 0; played[k] = 0; });
    var ordered = results.slice().sort(function (x, y) {
      var a = x.date + x.home + x.away, b = y.date + y.home + y.away;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    ordered.forEach(function (r) {
      var h = base.teams[r.home], a = base.teams[r.away];
      if (!h || !a) return;
      var pred = matchup(base, h, a).total + off[r.home] + off[r.away];
      var actual = r.homeScore + r.awayScore;
      var miss = Math.max(-base.errCap, Math.min(base.errCap, actual - pred));
      off[r.home] += kFor(played[r.home], cfg) * miss * base.share;
      off[r.away] += kFor(played[r.away], cfg) * miss * base.share;
      played[r.home]++; played[r.away]++;
      log.push({ id: gameId(r.date, r.home, r.away), pred: pred, actual: actual, miss: miss });
    });
    return { off: off, played: played, log: log };
  }

  // One row per unique D1-vs-D1 game in the schedule (it lists games from each team's side).
  function buildGames(base, schedule, off) {
    var seen = {}, rows = [];
    schedule.forEach(function (g) {
      var hk = teamKey(g.home), ak = teamKey(g.away);
      var h = base.teams[hk], a = base.teams[ak];
      if (!h || !a) return;
      var id = gameId(g.date, hk, ak);
      if (seen[id]) return;
      seen[id] = true;
      var m = matchup(base, h, a);
      rows.push({
        id: id, date: g.date, home: h.team, away: a.team, hk: hk, ak: ak,
        neutral: !!g.neutral, dateTbd: !!g.dateTbd, site: g.site || '',
        poss: m.poss, pre: m.total, total: m.total + off[hk] + off[ak]
      });
    });
    rows.sort(function (x, y) {
      return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.home + x.away) < (y.home + y.away) ? -1 : 1;
    });
    return rows;
  }

  return { teamKey: teamKey, gameId: gameId, roundHalf: roundHalf, matchup: matchup,
           kFor: kFor, replay: replay, buildGames: buildGames };
});
