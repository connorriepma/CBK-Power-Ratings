// Pure math for the Quad Records page: which quadrant a game falls in and each team's record by quadrant.
// No DOM and no globals beyond the export, so tests/quad-math.test.js can load it in Node.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CBKQuadMath = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Opponent rank cutoffs by site: a game is Q1 if the opponent's rank is <= the first number, Q2 if <= the second, Q3 if <= the third, else Q4.
  // These are the NCAA's quadrant lines. Home, neutral and away each have their own.
  var CUTS = {
    home:    [30, 75, 160],
    neutral: [50, 100, 200],
    away:    [75, 135, 240]
  };

  // site: 'home' | 'neutral' | 'away', from the point of view of the team whose record this is.
  // rank: the opponent's rank (1 = best). Returns 1, 2, 3 or 4.
  function quadFor(rank, site) {
    var c = CUTS[site];
    return rank <= c[0] ? 1 : rank <= c[1] ? 2 : rank <= c[2] ? 3 : 4;
  }

  // ranks: team name -> rank. Teams missing from `ranks` (non-Division I opponents) are not counted.
  // games: model.games, each with home, away, neutral and, once played, result = { home, away }.
  // Returns team name -> { 1: {w,l}, 2: {w,l}, 3: {w,l}, 4: {w,l} } for every team in `ranks`.
  function buildQuads(games, ranks) {
    var out = {};
    Object.keys(ranks).forEach(function (t) { out[t] = { 1: { w: 0, l: 0 }, 2: { w: 0, l: 0 }, 3: { w: 0, l: 0 }, 4: { w: 0, l: 0 } }; });
    games.forEach(function (g) {
      if (!g.result) return;
      if (!(g.home in ranks) || !(g.away in ranks)) return;
      var homeWon = g.result.home > g.result.away;
      var hSite = g.neutral ? 'neutral' : 'home', aSite = g.neutral ? 'neutral' : 'away';
      var hq = out[g.home][quadFor(ranks[g.away], hSite)];
      var aq = out[g.away][quadFor(ranks[g.home], aSite)];
      if (homeWon) { hq.w++; aq.l++; } else { aq.w++; hq.l++; }
    });
    return out;
  }

  // Rank every team by rating, best first. Ties break by name so the ranking is stable.
  // ratings: team name -> rating. Returns team name -> rank (1-based).
  function rankTeams(ratings) {
    var names = Object.keys(ratings).filter(function (n) { return typeof ratings[n] === 'number'; });
    names.sort(function (a, b) { return ratings[b] - ratings[a] || a.localeCompare(b); });
    var ranks = {};
    names.forEach(function (n, i) { ranks[n] = i + 1; });
    return ranks;
  }

  return { CUTS: CUTS, quadFor: quadFor, buildQuads: buildQuads, rankTeams: rankTeams };
});
