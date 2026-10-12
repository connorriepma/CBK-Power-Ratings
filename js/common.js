// Shared data loading and rating math for the site. The math mirrors src/cbk_ratings.py.
window.CBK = (function () {
  'use strict';

  var SIGMA = 11; // typical miss of the predicted margin, in points (display only)
  var NON_D1 = 'Non D1 Opponent';

  var CONF_LABELS = {
    'Big Ten': 'B10', 'Big 12': 'B12', 'Missouri Valley': 'MVC', 'Mountain West': 'MWC',
    'America East': 'AE', 'Summit League': 'SUM', 'Big East': 'BE', 'Big Sky': 'BSKY',
    'Big South': 'BSO', 'Big West': 'BW', 'Horizon': 'HOR', 'Patriot': 'PAT',
    'Southern': 'SoCon', 'Southland': 'SLC', 'Sun Belt': 'SBC'
  };

  function teamKey(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getJSON(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error(path + ': HTTP ' + res.status);
      return res.json();
    });
  }

  // Standard normal CDF (Abramowitz and Stegun 7.1.26).
  function normCdf(x) {
    var z = Math.abs(x) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * z);
    var poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    var erf = 1 - poly * Math.exp(-z * z);
    return 0.5 * (1 + (x < 0 ? -erf : erf));
  }

  // 103 -> "103", 102.5 -> "102.5"
  function fmtRating(n) {
    return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1);
  }

  function fmtPct(p) {
    var v = p * 100;
    if (v < 1) return '<1%';
    if (v > 99) return '>99%';
    return Math.round(v) + '%';
  }

  function parseDate(iso) {
    var p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function gameId(date, a, b) {
    var s = [teamKey(a), teamKey(b)].sort();
    return date + '_' + s[0] + '_' + s[1];
  }

  // Loads every data file and returns a model with lookups and per-game helpers.
  function load() {
    return Promise.all([
      getJSON('data/teams.json'),
      getJSON('data/current_ratings.json'),
      getJSON('data/schedule.json'),
      getJSON('data/results.json')
    ]).then(function (d) {
      var teamList = d[0], ratingRows = d[1], schedule = d[2], resultRows = d[3];

      var byName = {}, byKey = {}, current = {};
      teamList.forEach(function (t) { byName[t.team] = t; byKey[t.key] = t; });
      ratingRows.forEach(function (r) { current[r.key] = r.current; });

      var results = {};
      resultRows.forEach(function (r) {
        results[r.date + '_' + [r.home, r.away].sort().join('_')] = r;
      });

      var games = schedule.map(function (g) {
        var game = Object.assign({}, g, { id: gameId(g.date, g.home, g.away) });
        var r = results[game.id];
        if (r) {
          var homeIsHome = r.home === teamKey(g.home);
          game.result = {
            home: homeIsHome ? r.homeScore : r.awayScore,
            away: homeIsHome ? r.awayScore : r.homeScore
          };
        }
        return game;
      });

      // Exact predicted home margin from current ratings, or null if either team is unrated.
      function exactMargin(g) {
        var hk = teamKey(g.home), ak = teamKey(g.away);
        var h = current[hk], a = current[ak], t = byKey[hk];
        if (typeof h !== 'number' || typeof a !== 'number' || !t) return null;
        return h + (g.neutral ? 0 : t.home_court) - a;
      }

      // Displayed home margin: exact margin rounded once to 0.5, ties away from zero.
      function homeSpread(g) {
        var m = exactMargin(g);
        if (m === null) return null;
        return (m < 0 ? -1 : 1) * Math.floor(Math.abs(m) * 2 + 0.5) / 2;
      }

      function winProb(g) {
        var m = exactMargin(g);
        if (m === null) return null;
        var home = normCdf(m / SIGMA);
        return { home: home, away: 1 - home, margin: m };
      }

      // Short tag for the game: conference abbreviation for league games, OOC otherwise.
      function confTag(g) {
        if (!g.conf) return 'OOC';
        var t = byName[g.home];
        if (!t) return 'CONF';
        return CONF_LABELS[t.conference] || t.conference;
      }

      return {
        teams: teamList, byName: byName, byKey: byKey, current: current,
        games: games, exactMargin: exactMargin, homeSpread: homeSpread,
        winProb: winProb, confTag: confTag
      };
    });
  }

  return {
    SIGMA: SIGMA, NON_D1: NON_D1, teamKey: teamKey, esc: esc, getJSON: getJSON,
    fmtRating: fmtRating, fmtPct: fmtPct, parseDate: parseDate, gameId: gameId, load: load
  };
})();
