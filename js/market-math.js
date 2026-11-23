// Pure helpers for the Model vs Market page: join the model's line on each finished game to the market's closing line
// (data/market_lines.json) and compare them. No DOM, so tests/market-math.test.js can load it in Node.
// Everything is from the home team's side: a model line or market line of +7 means "home wins by 7".
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CBKMarketMath = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var MIN_FIRST_WEEK = 10;
  var GAPS = [[0, 1.5], [1.5, 3], [3, 5], [5, null]];
  var SPREADS = [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24], [24, null]];

  function marketId(date, a, b) { return date + '_' + [a, b].sort().join('_'); }

  // rows: fromLog rows from misses-math.js (pred = the model's published home margin). market: the parsed
  // market_lines.json. provider: the book to use, e.g. 'Draft Kings'. A game with no line from that book is left out.
  // The file's spread is negative when the home team is favored, so the market's expected home margin is its negative.
  function join(rows, market, provider) {
    var out = [];
    (rows || []).forEach(function (r) {
      var e = market && market[marketId(r.date, r.home, r.away)];
      var ln = e && e.lines && e.lines[provider];
      if (!ln || typeof ln.spread !== 'number') return;
      out.push({ date: r.date, home: r.home, away: r.away, model: r.pred, market: -ln.spread, margin: r.margin });
    });
    return out;
  }

  function mean(a, f) { return a.length ? a.reduce(function (s, x) { return s + f(x); }, 0) / a.length : null; }
  function absModel(g) { return Math.abs(g.margin - g.model); }
  function absMarket(g) { return Math.abs(g.margin - g.market); }

  // Betting the model's side against the market line: the model likes the home team more than the market does when
  // model > market. Returns 1 win, -1 loss, 0 push, null when the two agree exactly (no side to take).
  function modelSide(g) {
    if (g.model === g.market) return null;
    var res = (g.margin - g.market) * (g.model > g.market ? 1 : -1);
    return res > 0 ? 1 : res < 0 ? -1 : 0;
  }

  function ats(games) {
    var w = 0, l = 0, p = 0;
    games.forEach(function (g) {
      var s = modelSide(g);
      if (s === 1) w++; else if (s === -1) l++; else if (s === 0) p++;
    });
    return { w: w, l: l, p: p, pct: w + l ? w / (w + l) : null };
  }

  function summary(games) {
    if (!games.length) return null;
    var m = mean(games, absModel), k = mean(games, absMarket);
    return { n: games.length, maeModel: m, maeMarket: k, diff: m - k, ats: ats(games) };
  }

  function bucket(games, edges, key) {
    return edges.map(function (e) {
      var g = games.filter(function (x) { var v = key(x); return v >= e[0] && (e[1] === null || v < e[1]); });
      return { lo: e[0], hi: e[1], n: g.length, maeModel: mean(g, absModel), maeMarket: mean(g, absMarket),
               avgGap: mean(g, function (x) { return Math.abs(x.model - x.market); }), ats: ats(g) };
    });
  }

  // By how far the model's line is from the market's.
  function byGap(games) { return bucket(games, GAPS, function (g) { return Math.abs(g.model - g.market); }); }
  // By the size of the market spread.
  function bySpread(games) { return bucket(games, SPREADS, function (g) { return Math.abs(g.market); }); }

  // Monday-start weeks, like the accuracy page.
  function weekStart(iso) {
    var d = new Date(iso + 'T00:00:00Z'), back = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  }

  function byWeek(games) {
    var map = {};
    games.forEach(function (g) { (map[weekStart(g.date)] = map[weekStart(g.date)] || []).push(g); });
    var keys = Object.keys(map).sort();
    // A stray game or two before the first full week is folded into the next week, as on the accuracy page.
    if (keys.length > 1 && map[keys[0]].length < MIN_FIRST_WEEK) { map[keys[1]] = map[keys[0]].concat(map[keys[1]]); delete map[keys[0]]; keys.shift(); }
    return keys.map(function (w) {
      var s = summary(map[w]);
      return { week: w, n: s.n, maeModel: s.maeModel, maeMarket: s.maeMarket, diff: s.diff };
    });
  }

  return { marketId: marketId, join: join, summary: summary, ats: ats, byGap: byGap, bySpread: bySpread, byWeek: byWeek, modelSide: modelSide, weekStart: weekStart };
});
