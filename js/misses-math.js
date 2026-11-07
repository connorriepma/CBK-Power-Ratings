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
  function fromLog(log) {
    return log.filter(function (e) { return !e.skip; }).map(function (e) {
      var margin = e.hs - e.as, miss = margin - e.pred;
      return {
        date: e.date, home: e.home, away: e.away, neutral: !!e.neutral, hs: e.hs, as: e.as,
        pred: e.pred, margin: margin, miss: miss, abs: Math.abs(miss),
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
    return (names[r.pred > 0 ? r.home : r.away] || '') + ' -' + m.toFixed(1);
  }

  // Games that carried a buy-game adjustment. lookup(row) -> { favorite, bonus } or null.
  // Everything is from the favorite's side: margin and lines are positive when the favorite is ahead / favored.
  //   missRating: favorite margin minus the rating-only line.   missAdj: favorite margin minus the published (adjusted) line.
  // A positive miss means the favorite beat that line; a negative one means the line was too high.
  function buyGames(rows, lookup) {
    var out = [];
    rows.forEach(function (r) {
      var b = lookup(r);
      if (!b || !b.bonus) return;
      var sign = b.favorite === r.home ? 1 : -1;
      var favMargin = sign * r.margin, ratingLine = sign * r.pred;
      var missRating = favMargin - ratingLine, missAdj = missRating - b.bonus;
      out.push({
        date: r.date, home: r.home, away: r.away, neutral: r.neutral, hs: r.hs, as: r.as, favorite: b.favorite, bonus: b.bonus,
        favMargin: favMargin, ratingLine: ratingLine, adjLine: ratingLine + b.bonus,
        missRating: missRating, missAdj: missAdj, absRating: Math.abs(missRating), absAdj: Math.abs(missAdj)
      });
    });
    return out;
  }

  function buyStats(games) {
    var n = games.length;
    if (!n) return null;
    var sum = function (f) { return games.reduce(function (s, g) { return s + f(g); }, 0); };
    return {
      n: n,
      maeRating: sum(function (g) { return g.absRating; }) / n,
      maeAdj: sum(function (g) { return g.absAdj; }) / n,
      biasRating: sum(function (g) { return g.missRating; }) / n,
      biasAdj: sum(function (g) { return g.missAdj; }) / n,
      covered: games.filter(function (g) { return g.missAdj > 0; }).length,
      pushed: games.filter(function (g) { return g.missAdj === 0; }).length
    };
  }

  return { fromLog: fromLog, rank: rank, avgAbs: avgAbs, lineText: lineText, buyGames: buyGames, buyStats: buyStats };
});
