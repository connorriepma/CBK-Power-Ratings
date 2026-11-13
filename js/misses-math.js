// Pure helpers for the Biggest Misses page: turn the model's replay log into one row per rated game,
// with the raw miss (not capped like the rating update is). No DOM, so tests/misses-math.test.js can load it in Node.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CBKMissesMath = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // log: model.log from common.js. Skipped games (an unrated opponent) have no model line and are left out.
  // pred is the model's home margin going into the game; the raw miss is the actual home margin minus it.
  // miss > 0: the home team did better than the model said. miss < 0: the away team did.
  // lookup (optional): row -> { favorite, bonus } for a buy game. Its line then includes the bonus toward the favorite;
  // predRating keeps the rating-only line.
  function fromLog(log, lookup) {
    return log.filter(function (e) { return !e.skip; }).map(function (e) {
      var b = lookup ? lookup(e) : null, bonus = b && b.bonus ? b.bonus : 0;
      var pred = e.pred + (bonus ? (b.favorite === e.home ? 1 : -1) * bonus : 0);
      var margin = e.hs - e.as, miss = margin - pred;
      return {
        date: e.date, home: e.home, away: e.away, neutral: !!e.neutral, hs: e.hs, as: e.as,
        pred: pred, predRating: e.pred, bonus: bonus, margin: margin, miss: miss, abs: Math.abs(miss),
        // The team the model was too high on: the one that did worse than expected.
        over: miss > 0 ? e.away : e.home
      };
    });
  }

  // Biggest miss first; ties by date then matchup so the order never jumps around.
  function rank(rows) {
    return rows.slice().sort(function (a, b) {
      if (b.abs !== a.abs) return b.abs - a.abs;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var x = a.home + a.away, y = b.home + b.away;
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  function avgAbs(rows) {
    if (!rows.length) return null;
    return rows.reduce(function (s, r) { return s + r.abs; }, 0) / rows.length;
  }

  // "Duke -7.5" style line from the favorite's side, or "PK". names: key -> display name.
  function lineText(r, names) {
    var m = Math.round(Math.abs(r.pred) * 10) / 10;
    if (m === 0) return 'PK';
    return (names[r.pred > 0 ? r.home : r.away] || '') + ' -' + m.toFixed(1) + (r.bonus ? '*' : '');
  }

  // Overall accuracy. Rows come from fromLog(log, lookup), so a buy game's line already includes its adjustment.
  // maeRating is the same games against the rating-only line (the model before any buy-game bonus).
  // bias is from the favorite's side: favorite margin minus the line, so positive means favorites beat the line on average.
  function summary(rows) {
    var n = rows.length;
    if (!n) return null;
    var sum = function (f) { return rows.reduce(function (s, r) { return s + f(r); }, 0); };
    var buy = rows.filter(function (r) { return r.bonus; });
    return {
      n: n, nBuy: buy.length,
      mae: sum(function (r) { return r.abs; }) / n,
      maeRating: sum(function (r) { return Math.abs(r.margin - r.predRating); }) / n,
      bias: sum(function (r) { return (r.pred >= 0 ? 1 : -1) * r.miss; }) / n,
      biasRating: sum(function (r) { return (r.predRating >= 0 ? 1 : -1) * (r.margin - r.predRating); }) / n
    };
  }

  // Monday (UTC) of the week a date falls in, as YYYY-MM-DD.
  function weekStart(iso) {
    var p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  var MIN_FIRST_WEEK = 10;

  // One row per week, oldest first: { week, n, mae, bias }.
  function byWeek(rows) {
    var map = {};
    rows.forEach(function (r) { (map[weekStart(r.date)] = map[weekStart(r.date)] || []).push(r); });
    var keys = Object.keys(map).sort();
    // A thin first week (a stray early game) is folded into the next week instead of standing alone.
    if (keys.length > 1 && map[keys[0]].length < MIN_FIRST_WEEK) {
      map[keys[1]] = map[keys[0]].concat(map[keys[1]]);
      delete map[keys[0]];
      keys.shift();
    }
    return keys.map(function (w) {
      var s = summary(map[w]); return { week: w, n: s.n, mae: s.mae, bias: s.bias };
    });
  }

  return { fromLog: fromLog, rank: rank, avgAbs: avgAbs, lineText: lineText, summary: summary, byWeek: byWeek, weekStart: weekStart };
});
