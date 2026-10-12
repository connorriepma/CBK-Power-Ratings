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
  // mods (optional): game id -> { key, pts } from buildMods. A modified home court adds pts to the
  // boosted team's side of that one game: +pts if it is the home row, -pts if it is the away row.
  function homeBonus(mods, g) {
    if (!mods) return 0;
    var list = mods[gameId(g.date, g.home, g.away)] || [], tot = 0;
    list.forEach(function (m) { tot += m.key === g.home ? m.pts : m.key === g.away ? -m.pts : 0; });
    return tot;
  }

  // Modified-HCA games from schedule.json (optional hcaMod: { team, pct }). pts = pct x that team's home court.
  function buildMods(schedule, byName) {
    var mods = {};
    schedule.forEach(function (g) {
      if (!g.hcaMod) return;
      var id = gameId(g.date, g.home, g.away);
      [].concat(g.hcaMod).forEach(function (e) {
        var t = byName[e.team];
        if (!t) return;
        (mods[id] = mods[id] || []).push({ key: t.key, pts: e.pct * t.home_court });
      });
    });
    return mods;
  }

  function replay(start, hca, rows, cfg, log, mods) {
    var r = Object.assign({}, start), played = {};
    Object.keys(start).forEach(function (k) { played[k] = 0; });
    var ordered = rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var x = a.home + a.away, y = b.home + b.away;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    ordered.forEach(function (g) {
      if (!(g.home in r) || !(g.away in r)) {
        if (log) log.push({ skip: true, date: g.date, home: g.home, away: g.away, neutral: !!g.neutral,
          hs: g.homeScore, as: g.awayScore, hr: r[g.home], ar: r[g.away] });
        return;
      }
      var hb = r[g.home], ab = r[g.away];
      var pred = r[g.home] + (g.neutral ? 0 : hca[g.home]) - r[g.away] + homeBonus(mods, g);
      var cap = Math.abs(pred) >= cfg.mismatchSpread ? cfg.missCap.mismatch : cfg.missCap.normal;
      var miss = Math.max(-cap, Math.min(cap, (g.homeScore - g.awayScore) - pred));
      var kh = kFor(played[g.home], cfg), ka = kFor(played[g.away], cfg);
      r[g.home] += kh * miss;
      r[g.away] -= ka * miss;
      played[g.home]++;
      played[g.away]++;
      if (log) log.push({ skip: false, date: g.date, home: g.home, away: g.away, neutral: !!g.neutral,
        hs: g.homeScore, as: g.awayScore, pred: pred, miss: miss, kh: kh, ka: ka,
        hb: hb, ha: r[g.home], ab: ab, aa: r[g.away] });
    });
    return { current: r, played: played };
  }

  // Records and record against the model's own spread, keyed by team name.
  // The spread used is the one locked when the result was first saved (game.lineAtEntry, the home team's line:
  // negative means the home team was favored). d = actual home margin + line: d > 0 home covered, d < 0 away covered.
  function computeRecords(games) {
    var rec = {}, ats = {}, any = false;
    function getR(t) { return rec[t] || (rec[t] = { w: 0, l: 0, cw: 0, cl: 0, hw: 0, hl: 0, aw: 0, al: 0, nw: 0, nl: 0 }); }
    function getA(t) {
      return ats[t] || (ats[t] = { w: 0, l: 0, p: 0, cw: 0, cl: 0, cp: 0, hw: 0, hl: 0, hp: 0,
        aw: 0, al: 0, ap: 0, nw: 0, nl: 0, np: 0, sum: 0, n: 0 });
    }
    function addA(T, r, conf, site, margin) { T[r]++; if (conf) T['c' + r]++; T[site + r]++; T.sum += margin; T.n++; }
    games.forEach(function (g) {
      if (!g.result) return;
      any = true;
      if (typeof g.lineAtEntry === 'number') {
        var d = (g.result.home - g.result.away) + g.lineAtEntry;
        var hr = Math.abs(d) < 1e-9 ? 'p' : d > 0 ? 'w' : 'l';
        var ar = hr === 'w' ? 'l' : hr === 'l' ? 'w' : 'p';
        addA(getA(g.home), hr, g.conf, g.neutral ? 'n' : 'h', d);
        addA(getA(g.away), ar, g.conf, g.neutral ? 'n' : 'a', -d);
      }
      var homeWon = g.result.home > g.result.away;
      var H = getR(g.home), A = getR(g.away);
      if (homeWon) { H.w++; A.l++; } else { A.w++; H.l++; }
      if (g.conf) { if (homeWon) { H.cw++; A.cl++; } else { A.cw++; H.cl++; } }
      if (g.neutral) { if (homeWon) { H.nw++; A.nl++; } else { A.nw++; H.nl++; } }
      else { if (homeWon) { H.hw++; A.al++; } else { A.aw++; H.hl++; } }
    });
    return { rec: rec, ats: ats, any: any };
  }

  function build(teamList, cfgRaw, schedule, tbdGames, resultRows) {
    var cfg = parseConfig(cfgRaw);
    var byName = {}, byKey = {}, start = {}, hca = {};
    teamList.forEach(function (t) {
      byName[t.team] = t; byKey[t.key] = t;
      start[t.key] = t.preseason_rating; hca[t.key] = t.home_court;
    });

    var mods = buildMods(schedule, byName);
    var games = schedule.map(function (g) {
      return Object.assign({}, g, { id: gameId(g.date, g.home, g.away) });
    });

    var model = {
      mods: mods, teams: teamList, byName: byName, byKey: byKey, start: start,
      games: games, tbd: tbdGames, results: [], current: {}, played: {}, log: [], records: { rec: {}, ats: {}, any: false }
    };

    // Replace the stored results: re-attach scores to games and recompute every rating.
    model.setResults = function (rows) {
      model.results = rows;
      var byId = {};
      rows.forEach(function (r) { byId[r.date + '_' + [r.home, r.away].sort().join('_')] = r; });
      games.forEach(function (g) {
        var r = byId[g.id];
        if (!r) { delete g.result; delete g.lineAtEntry; return; }
        var homeIsHome = r.home === teamKey(g.home);
        g.result = {
          home: homeIsHome ? r.homeScore : r.awayScore,
          away: homeIsHome ? r.awayScore : r.homeScore
        };
        if (typeof r.line === 'number') g.lineAtEntry = r.line; else delete g.lineAtEntry;
      });
      var log = [];
      var out = replay(start, hca, rows, cfg, log, mods);
      model.current = out.current;
      model.played = out.played;
      model.log = log;
      model.records = computeRecords(games);
      if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('cbk-results'));
    };

    // Exact predicted home margin from current ratings, or null if either team is unrated.
    model.exactMargin = function (g) {
      var hk = teamKey(g.home), ak = teamKey(g.away);
      var h = model.current[hk], a = model.current[ak], t = byKey[hk];
      if (typeof h !== 'number' || typeof a !== 'number' || !t) return null;
      return h + (g.neutral ? 0 : t.home_court) - a + homeBonus(mods, { date: g.date, home: hk, away: ak });
    };

    // Modified home court on this game: a list of { team, pct, pts, mins } (empty if none).
    model.hcaMod = function (g) {
      return [].concat(g.hcaMod || []).filter(function (e) { return byName[e.team]; }).map(function (e) {
        return { team: e.team, pct: e.pct, pts: e.pct * byName[e.team].home_court, mins: e.mins };
      });
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

    // Line from `team`'s side: negative means that team is favored. Null if either team is unrated.
    model.teamLine = function (g, team) {
      var s = model.homeSpread(g);
      if (s === null) return null;
      var line = team === g.home ? -s : s;
      return line === 0 ? 0 : line;
    };

    model.setResults(resultRows);
    return model;
  }

  var loading = null;
  function load() {
    if (loading) return loading;
    loading = Promise.all([
      getJSON('data/teams.json'),
      getJSON('data/rating_config.json'),
      getJSON('data/schedule.json'),
      getJSON('data/tbd_games.json'),
      getJSON('data/results.json')
    ]).then(function (d) { return build(d[0], d[1], d[2], d[3], d[4]); });
    loading.catch(function () { loading = null; });
    return loading;
  }

  return {
    SIGMA: SIGMA, NON_D1: NON_D1, normCdf: normCdf, teamKey: teamKey, esc: esc, getJSON: getJSON,
    fmtRating: fmtRating, fmtPct: fmtPct, roundHalf: roundHalf, parseDate: parseDate,
    gameId: gameId, homeBonus: homeBonus, buildMods: buildMods, replay: replay, parseConfig: parseConfig, load: load
  };
})();
