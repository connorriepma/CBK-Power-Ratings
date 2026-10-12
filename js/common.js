// Shared data loading and rating math for the site. The rating math mirrors src/cbk_ratings.py.
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

  // Round to the nearest 0.5, ties up (the display rule for ratings).
  function roundHalf(x) {
    return Math.floor(x * 2 + 0.5) / 2;
  }

  function parseDate(iso) {
    var p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function gameId(date, a, b) {
    var s = [teamKey(a), teamKey(b)].sort();
    return date + '_' + s[0] + '_' + s[1];
  }

  function parseConfig(raw) {
    return {
      kTiers: raw.kTiers.map(function (t) { return { upTo: t.upTo == null ? Infinity : t.upTo, k: t.k }; }),
      mismatchSpread: raw.mismatchSpread,
      missCap: { normal: raw.missCap.normal, mismatch: raw.missCap.mismatch }
    };
  }

  function kFor(gamesBefore, cfg) {
    var n = gamesBefore + 1;
    for (var i = 0; i < cfg.kTiers.length; i++) if (n <= cfg.kTiers[i].upTo) return cfg.kTiers[i].k;
    return cfg.kTiers[cfg.kTiers.length - 1].k;
  }

  // Replay results onto preseason ratings. start: key -> rating, hca: key -> home court.
  // Rows are { date, home, away, neutral, homeScore, awayScore } with team keys.
  // Games with a team that is not in `start` (non-Division I opponents) are skipped.
  function replay(start, hca, rows, cfg) {
    var r = Object.assign({}, start), played = {};
    Object.keys(start).forEach(function (k) { played[k] = 0; });
    var ordered = rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var x = a.home + a.away, y = b.home + b.away;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    ordered.forEach(function (g) {
      if (!(g.home in r) || !(g.away in r)) return;
      var pred = r[g.home] + (g.neutral ? 0 : hca[g.home]) - r[g.away];
      var cap = Math.abs(pred) >= cfg.mismatchSpread ? cfg.missCap.mismatch : cfg.missCap.normal;
      var miss = Math.max(-cap, Math.min(cap, (g.homeScore - g.awayScore) - pred));
      var kh = kFor(played[g.home], cfg), ka = kFor(played[g.away], cfg);
      r[g.home] += kh * miss;
      r[g.away] -= ka * miss;
      played[g.home]++;
      played[g.away]++;
    });
    return { current: r, played: played };
  }

  function build(teamList, cfgRaw, schedule, resultRows) {
    var cfg = parseConfig(cfgRaw);
    var byName = {}, byKey = {}, start = {}, hca = {};
    teamList.forEach(function (t) {
      byName[t.team] = t; byKey[t.key] = t;
      start[t.key] = t.preseason_rating; hca[t.key] = t.home_court;
    });

    var games = schedule.map(function (g) {
      return Object.assign({}, g, { id: gameId(g.date, g.home, g.away) });
    });

    var model = {
      teams: teamList, byName: byName, byKey: byKey, start: start,
      games: games, results: [], current: {}, played: {}
    };

    // Replace the stored results: re-attach scores to games and recompute every rating.
    model.setResults = function (rows) {
      model.results = rows;
      var byId = {};
      rows.forEach(function (r) { byId[r.date + '_' + [r.home, r.away].sort().join('_')] = r; });
      games.forEach(function (g) {
        var r = byId[g.id];
        if (!r) { delete g.result; return; }
        var homeIsHome = r.home === teamKey(g.home);
        g.result = {
          home: homeIsHome ? r.homeScore : r.awayScore,
          away: homeIsHome ? r.awayScore : r.homeScore
        };
      });
      var out = replay(start, hca, rows, cfg);
      model.current = out.current;
      model.played = out.played;
    };

    // Exact predicted home margin from current ratings, or null if either team is unrated.
    model.exactMargin = function (g) {
      var hk = teamKey(g.home), ak = teamKey(g.away);
      var h = model.current[hk], a = model.current[ak], t = byKey[hk];
      if (typeof h !== 'number' || typeof a !== 'number' || !t) return null;
      return h + (g.neutral ? 0 : t.home_court) - a;
    };

    // Displayed home margin: exact margin rounded once to 0.5, ties away from zero.
    model.homeSpread = function (g) {
      var m = model.exactMargin(g);
      if (m === null) return null;
      return (m < 0 ? -1 : 1) * Math.floor(Math.abs(m) * 2 + 0.5) / 2;
    };

    model.winProb = function (g) {
      var m = model.exactMargin(g);
      if (m === null) return null;
      var home = normCdf(m / SIGMA);
      return { home: home, away: 1 - home, margin: m };
    };

    // Short tag for the game: conference abbreviation for league games, OOC otherwise.
    model.confTag = function (g) {
      if (!g.conf) return 'OOC';
      var t = byName[g.home];
      if (!t) return 'CONF';
      return CONF_LABELS[t.conference] || t.conference;
    };

    model.setResults(resultRows);
    return model;
  }

  function load() {
    return Promise.all([
      getJSON('data/teams.json'),
      getJSON('data/rating_config.json'),
      getJSON('data/schedule.json'),
      getJSON('data/results.json')
    ]).then(function (d) { return build(d[0], d[1], d[2], d[3]); });
  }

  return {
    SIGMA: SIGMA, NON_D1: NON_D1, teamKey: teamKey, esc: esc, getJSON: getJSON,
    fmtRating: fmtRating, fmtPct: fmtPct, roundHalf: roundHalf, parseDate: parseDate,
    gameId: gameId, replay: replay, parseConfig: parseConfig, load: load
  };
})();
