// Pure helpers for Suggested plays on the Plays tab: upcoming games where the model line and the market line are far apart.
// No DOM, so tests/suggested-math.test.js can load it in Node. Lines are shown from the side being taken:
// negative means that team gives points (-7.5 = favored by 7.5).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CBKSuggestedMath = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // games: model.games rows { id, date, home, away, neutral, result }. upcoming: parsed data/upcoming_lines.json
  // ({ games: { id: { lines: { provider: { spread } } } } }; spread negative = home favored).
  // modelMargin(g): the model's published home margin, or null. opts: { provider, minGap, today (ISO), logged (set of game ids), nonD1 }.
  function suggest(games, upcoming, modelMargin, opts) {
    var feed = (upcoming && upcoming.games) || {}, out = [];
    (games || []).forEach(function (g) {
      if (g.result || g.date < opts.today || g.home === opts.nonD1 || g.away === opts.nonD1) return;
      var e = feed[g.id], ln = e && e.lines && e.lines[opts.provider];
      if (!ln || typeof ln.spread !== 'number') return;
      var m = modelMargin(g);
      if (m === null || m === undefined) return;
      var market = -ln.spread, gap = m - market;       // both are the home team's expected margin
      if (Math.abs(gap) < opts.minGap) return;
      var home = gap > 0;
      out.push({
        id: g.id, date: g.date, home: g.home, away: g.away, neutral: !!g.neutral,
        side: home ? g.home : g.away, other: home ? g.away : g.home,
        marketLine: home ? ln.spread : -ln.spread,     // the number to take on that side
        modelLine: home ? -m : m,                      // the model's number for the same side
        gap: Math.abs(gap),
        logged: !!(opts.logged && opts.logged[g.id])
      });
    });
    out.sort(function (a, b) { return b.gap - a.gap || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.id < b.id ? -1 : 1); });
    return out;
  }

  return { suggest: suggest };
});
