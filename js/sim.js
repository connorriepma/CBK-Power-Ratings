// Season simulation core: Projected Wins, Conference Title Odds and Championship Odds. Display only: reads the
// current ratings and results, changes nothing. Ported from the original artifact with the same settings and seeds.
window.CBKSim = (function () {
  'use strict';

  var C = window.CBK;
  var SIGMA = C.SIGMA;
  var NON = C.NON_D1;

  var SIM = {
    RUNS: 10000,
    SEED: 20262027,        // fixed seed: same numbers on every load (generator: mulberry32)
    TAU: 3,                // every simulated season shifts each team's strength by Normal(0, TAU): ratings are estimates. Judgment call, not fitted.
    SHIFT_SEED: 20260901,  // separate random stream for those shifts
    // Conference games expected per team. A conference is flagged if its teams have unequal loaded counts,
    // or if every team is below this number.
    EXPECTED: {
      'SWAC': 18, 'MEAC': 14, 'WCC': 16,
      'America East': 16, 'Big South': 16, 'NEC': 16, 'OVC': 16, 'Pac-12': 16, 'UAC': 16,
      'ASUN': 14, 'Ivy': 14, 'Summit League': 14,
      'AAC': 18, 'A10': 18, 'Big 12': 18, 'CAA': 18, 'C-USA': 18, 'Mountain West': 18, 'Patriot': 18, 'SEC': 18, 'Sun Belt': 18, 'ACC': 18,
      'Big East': 20, 'Big Sky': 20, 'Big Ten': 20, 'Horizon': 20, 'MAAC': 20, 'Missouri Valley': 20, 'Southern': 20,
      'Big West': 22, 'MAC': 22, 'Southland': 22
    },
    cache: null, sig: ''
  };

  // Display order of conferences (same as the tabs on the Ratings page).
  var CONF_ORDER = [
    'ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East', 'Pac-12', 'A10', 'AAC',
    'America East', 'ASUN', 'Big Sky', 'Big South', 'Big West', 'CAA', 'C-USA', 'Horizon', 'Ivy',
    'MAAC', 'MAC', 'MEAC', 'Missouri Valley', 'Mountain West', 'NEC', 'OVC', 'Patriot', 'Southern',
    'Southland', 'Summit League', 'Sun Belt', 'SWAC', 'UAC', 'WCC'
  ];

  var CH = {
    RUNS: 10000,
    SEED: 20270315,    // everything after the regular season (conference + NCAA tournaments); the regular season uses SIM.SEED
    FORM_K: 0.5,       // at-large picks and seeding add FORM_K rating points per game won above expectation that season
    AT_LARGE: 44,      // field = one automatic bid per conference (32) + AT_LARGE = 76 from 2027
    PLAYIN_AUTO: 12,   // lowest automatic-bid teams that play the Opening Round (against each other)
    PLAYIN_AL: 12,     // lowest at-large teams that play the Opening Round (against each other)
    SHOW_R64: 0.10,    // table shows a team only if its chance of reaching the round of 64 is at least this
    // Teams in each conference tournament. A conference not listed = every team in it plays.
    TOURN: {
      'Pac-12': { n: 9 },
      'Big Ten': { n: null },
      'Ivy': { n: 4 }
    },
    cache: null, sig: ''
  };

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Strength shift for one simulated season: D[t] ~ Normal(0, tau), Box-Muller on its own stream.
  function simDraw(D, tau, rs) {
    for (var t = 0; t < D.length; t++) {
      var u = rs(), v = rs();
      D[t] = tau * Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * v);
    }
  }

  // Fast normal CDF (table + linear interpolation) because the shifted win chances are recomputed every season.
  var CDF_TABLE = (function () {
    var T = new Float64Array(16002);
    for (var i = 0; i < 16002; i++) T[i] = C.normCdf(-8 + i / 1000);
    return T;
  })();
  function simCdf(z) {
    if (z <= -8) return 0;
    if (z >= 8) return 1;
    var x = (z + 8) * 1000, i = x | 0, f = x - i;
    return CDF_TABLE[i] + (CDF_TABLE[i + 1] - CDF_TABLE[i]) * f;
  }

  // Pure core. nT teams, nC conferences, confOf[t] = conference index. baseOW/baseCW = wins already banked
  // (played games + non-D1 wins). gh/ga = home/away team index of each simulated game, gp = P(home wins),
  // gc = 1 if conference game. sh = { tau, seed, m, sigma }: m[g] = predicted home margin of game g.
  function simCore(nT, nC, confOf, baseOW, baseCW, gh, ga, gp, gc, runs, seed, sh) {
    var rnd = mulberry32(seed), M = gh.length;
    var rs = sh && sh.tau > 0 ? mulberry32(sh.seed) : null, SD = new Float64Array(nT), pg = rs ? new Float64Array(M) : gp;
    var ow = new Int16Array(nT), cw = new Int16Array(nT);
    var sumO = new Float64Array(nT), sumC = new Float64Array(nT), title = new Float64Array(nT);
    var HO = 64, HC = 48;
    var histO = new Uint32Array(nT * HO), histC = new Uint32Array(nT * HC);
    var maxC = new Int16Array(nC), ties = new Int16Array(nC);
    var r, g, t;
    for (r = 0; r < runs; r++) {
      ow.set(baseOW); cw.set(baseCW);
      if (rs) {
        simDraw(SD, sh.tau, rs);
        for (g = 0; g < M; g++) pg[g] = simCdf((sh.m[g] + SD[gh[g]] - SD[ga[g]]) / sh.sigma);
      }
      for (g = 0; g < M; g++) {
        var w = rnd() < pg[g] ? gh[g] : ga[g];
        ow[w]++; if (gc[g]) cw[w]++;
      }
      maxC.fill(-1); ties.fill(0);
      for (t = 0; t < nT; t++) {
        sumO[t] += ow[t]; sumC[t] += cw[t]; histO[t * HO + ow[t]]++; histC[t * HC + cw[t]]++;
        if (cw[t] > maxC[confOf[t]]) maxC[confOf[t]] = cw[t];
      }
      for (t = 0; t < nT; t++) if (cw[t] === maxC[confOf[t]]) ties[confOf[t]]++;
      for (t = 0; t < nT; t++) if (cw[t] === maxC[confOf[t]]) title[t] += 1 / ties[confOf[t]];
    }
    return { sumO: sumO, sumC: sumC, title: title, histO: histO, histC: histC, HO: HO, HC: HC, runs: runs };
  }

  function simPct(hist, base, H, runs, q) {
    var c = 0;
    for (var w = 0; w < H; w++) { c += hist[base + w]; if (c >= q * runs) return w; }
    return H - 1;
  }

  // Gather what the simulation needs: who is in which conference, banked wins, games to simulate, and what is left out.
  function prepare(model) {
    var confNames = [], names = [], confOf = [], idx = new Map();
    model.teams.forEach(function (t) {
      var ci = confNames.indexOf(t.conference);
      if (ci < 0) { confNames.push(t.conference); ci = confNames.length - 1; }
      idx.set(t.team, names.length); names.push(t.team); confOf.push(ci);
    });
    var nT = names.length;
    var baseOW = new Int16Array(nT), baseCW = new Int16Array(nT), og = new Int16Array(nT), cg = new Int16Array(nT);
    var gh = [], ga = [], gp = [], gc = [], gm = [];
    var excluded = 0, nonD1 = 0, played = 0;
    model.games.forEach(function (g) {
      var hi = idx.get(g.home), ai = idx.get(g.away);
      var conf = !!g.conf && hi !== undefined && ai !== undefined && confOf[hi] === confOf[ai];
      if (g.result) {
        played++;
        var homeWon = g.result.home > g.result.away;
        if (hi !== undefined) { og[hi]++; if (homeWon) baseOW[hi]++; }
        if (ai !== undefined) { og[ai]++; if (!homeWon) baseOW[ai]++; }
        if (conf) { cg[hi]++; cg[ai]++; if (homeWon) baseCW[hi]++; else baseCW[ai]++; }
        return;
      }
      if (g.home === NON || g.away === NON) {
        var d = g.home === NON ? ai : hi;
        if (d !== undefined) { og[d]++; baseOW[d]++; nonD1++; }
        return;
      }
      var wp = model.winProb(g);
      if (!wp || hi === undefined || ai === undefined) { excluded++; return; }
      og[hi]++; og[ai]++; if (conf) { cg[hi]++; cg[ai]++; }
      gh.push(hi); ga.push(ai); gp.push(wp.home); gm.push(wp.margin); gc.push(conf ? 1 : 0);
    });
    return { confNames: confNames, names: names, confOf: confOf, nT: nT, baseOW: baseOW, baseCW: baseCW, og: og, cg: cg,
      gh: gh, ga: ga, gp: gp, gc: gc, gm: gm, excluded: excluded, nonD1: nonD1, played: played };
  }

  // Which conferences have an incomplete slate on the site? Computed from the data, so it clears itself when games load.
  function completeness(P) {
    var out = {};
    P.confNames.forEach(function (c, ci) {
      var ts = [];
      P.names.forEach(function (n, i) { if (P.confOf[i] === ci) ts.push(i); });
      var counts = ts.map(function (i) { return P.cg[i]; });
      var hi = Math.max.apply(null, counts), lo = Math.min.apply(null, counts);
      var loaded = counts.reduce(function (a, b) { return a + b; }, 0) / 2, exp = SIM.EXPECTED[c];
      var unequal = hi !== lo, short = exp !== undefined && hi < exp;
      var missing = 0;
      if (exp !== undefined) missing = Math.max(0, exp * ts.length / 2 - loaded);
      else if (unequal) missing = counts.reduce(function (a, n) { return a + (hi - n); }, 0) / 2;
      var warn = unequal || short;
      out[c] = { warn: warn, unequal: unequal, short: short, loaded: loaded, missing: missing, min: lo, max: hi, expected: exp,
        msg: warn ? 'Schedule incomplete: ' + missing + ' conference game' + (missing === 1 ? '' : 's') + ' not yet on the site; odds are unreliable.' : '' };
    });
    return out;
  }

  function signature(model) {
    return model.teams.map(function (t) { return model.current[t.key].toFixed(6); }).join(',') + '|' +
      model.games.reduce(function (n, g) { return n + (g.result ? 1 : 0); }, 0) + '|' + SIM.TAU;
  }

  function ratingShown(model, name) {
    return C.fmtRating(C.roundHalf(model.current[C.teamKey(name)]));
  }

  // Projected Wins and Conference Title Odds model. Cached until the ratings or finished games change.
  function simModel(model) {
    var sig = signature(model);
    if (SIM.cache && SIM.sig === sig) return SIM.cache;
    var t0 = performance.now();
    var P = prepare(model), comp = completeness(P);
    var R = simCore(P.nT, P.confNames.length, P.confOf, P.baseOW, P.baseCW, P.gh, P.ga, P.gp, P.gc, SIM.RUNS, SIM.SEED,
      { tau: SIM.TAU, seed: SIM.SHIFT_SEED, m: P.gm, sigma: SIGMA });
    var confs = P.confNames.map(function (c, ci) {
      var rows = [];
      P.names.forEach(function (n, i) {
        if (P.confOf[i] !== ci) return;
        var cW = R.sumC[i] / R.runs, oW = R.sumO[i] / R.runs;
        rows.push({ team: n, rating: ratingShown(model, n), exact: model.current[C.teamKey(n)], cW: cW, cL: P.cg[i] - cW, oW: oW, oL: P.og[i] - oW, cG: P.cg[i], oG: P.og[i],
          cLo: simPct(R.histC, i * R.HC, R.HC, R.runs, 0.10), cHi: simPct(R.histC, i * R.HC, R.HC, R.runs, 0.90),
          oLo: simPct(R.histO, i * R.HO, R.HO, R.runs, 0.10), oHi: simPct(R.histO, i * R.HO, R.HO, R.runs, 0.90),
          odds: R.title[i] / R.runs });
      });
      return { name: c, comp: comp[c], rows: rows };
    });
    var ms = performance.now() - t0;
    SIM.cache = { confs: confs, meta: { runs: SIM.RUNS, seed: SIM.SEED, tau: SIM.TAU, excluded: P.excluded, nonD1: P.nonD1,
      tbd: (model.tbd || []).length, simGames: P.gh.length, played: P.played, ms: ms } };
    SIM.sig = sig;
    return SIM.cache;
  }

  // ---- Championship Odds (NCAA tournament simulation) ----
  // Per simulated season: (1) the regular season, drawn from the SAME stream as Projected Wins / Title Odds;
  // (2) generic conference tournaments; (3) the 76-team field; (4) Opening Round and the 64-team bracket.
  // Steps 2-4 use a separate stream (CH.SEED).

  // Standard bracket order for a power-of-two size: adjacent entries play each other, 1 and 2 on opposite halves.
  function champSeedOrder(B) {
    var o = [1];
    while (o.length < B) {
      var m = o.length * 2, n = [];
      o.forEach(function (s) { n.push(s, m + 1 - s); });
      o = n;
    }
    return o;
  }
  // Bracket slots for a tournament of n teams: team positions by seed (0-based), -1 = bye.
  function champSlots(n) {
    var B = 1;
    while (B < n) B <<= 1;
    return champSeedOrder(B).map(function (s) { return s <= n ? s - 1 : -1; });
  }
  // Single elimination. slots: team index or -1 (bye), power-of-two length. Returns the survivors of each round.
  function champElim(slots, pw, rnd) {
    var out = [], cur = slots;
    while (cur.length > 1) {
      var nx = new Array(cur.length >> 1);
      for (var i = 0; i < cur.length; i += 2) {
        var a = cur[i], b = cur[i + 1];
        nx[i >> 1] = a < 0 ? b : b < 0 ? a : (rnd() < pw(a, b) ? a : b);
      }
      out.push(nx); cur = nx;
    }
    return out;
  }

  function champCore(nT, nC, confOf, baseOW, baseCW, gh, ga, gp, gc, R, tn, sigma, cdf, runs, seed1, seed2, cfg) {
    var AL = cfg.atLarge, PA = cfg.playInAuto, PL = cfg.playInAtLarge;
    var r1 = mulberry32(seed1), r2 = mulberry32(seed2), M = gh.length;
    var ow = new Int16Array(nT), cw = new Int16Array(nT);
    // stages: 0 field, 1 round of 64, 2 round of 32, 3 sweet 16, 4 elite 8, 5 final four, 6 title game, 7 title
    var cnt = new Uint32Array(8 * nT);
    var titleReg = new Float64Array(nT), maxC = new Int16Array(nC), ties = new Int16Array(nC);
    var tau = cfg.tau || 0, D = new Float64Array(nT), rs = tau > 0 ? mulberry32(cfg.shiftSeed) : null, pg = rs ? new Float64Array(M) : gp;
    function pw(a, b) { return cdf((R[a] + D[a] - R[b] - D[b]) / sigma); }
    var members = [], c, t, g, i;
    for (c = 0; c < nC; c++) members.push([]);
    for (t = 0; t < nT; t++) members[confOf[t]].push(t);
    var tSlots = members.map(function (_, ci) { return champSlots(tn[ci]); });
    var key = new Float64Array(nT), isAuto = new Uint8Array(nT), sc = new Float64Array(nT), ex = Float64Array.from(baseOW);
    for (g = 0; g < M; g++) { ex[gh[g]] += gp[g]; ex[ga[g]] += 1 - gp[g]; }
    var kk = cfg.k || 0, idx = Array.from({ length: nT }, function (_, j) { return j; });
    var seedOrd16 = champSeedOrder(16);
    var byConf = function (ord) { return function (s) { return s < 0 ? -1 : ord[s]; }; };
    for (var r = 0; r < runs; r++) {
      // 1) regular season: identical draws to simCore
      ow.set(baseOW); cw.set(baseCW);
      if (rs) {
        simDraw(D, tau, rs);
        for (g = 0; g < M; g++) pg[g] = simCdf((cfg.m[g] + D[gh[g]] - D[ga[g]]) / sigma);
      }
      for (g = 0; g < M; g++) { var w = r1() < pg[g] ? gh[g] : ga[g]; ow[w]++; if (gc[g]) cw[w]++; }
      maxC.fill(-1); ties.fill(0);
      for (t = 0; t < nT; t++) if (cw[t] > maxC[confOf[t]]) maxC[confOf[t]] = cw[t];
      for (t = 0; t < nT; t++) if (cw[t] === maxC[confOf[t]]) ties[confOf[t]]++;
      for (t = 0; t < nT; t++) if (cw[t] === maxC[confOf[t]]) titleReg[t] += 1 / ties[confOf[t]];
      // 2) conference tournaments (post-season stream): seeded by conference record, random tiebreak
      for (t = 0; t < nT; t++) key[t] = r2();
      isAuto.fill(0);
      var autos = [];
      for (c = 0; c < nC; c++) {
        var ord = members[c].slice().sort(function (a, b) { return cw[b] - cw[a] || key[b] - key[a]; });
        var slots = tSlots[c].map(byConf(ord));
        var win = champElim(slots, pw, r2), champ = win[win.length - 1][0];
        isAuto[champ] = 1; autos.push(champ);
      }
      // 3) the field: automatic bids + the best AT_LARGE others
      for (t = 0; t < nT; t++) sc[t] = R[t] + D[t] + kk * (ow[t] - ex[t]);
      autos.sort(function (a, b) { return sc[b] - sc[a] || a - b; });
      var ordr = idx.slice().sort(function (a, b) { return sc[b] - sc[a] || a - b; });
      var atl = [];
      for (i = 0; i < nT && atl.length < AL; i++) { var tt = ordr[i]; if (!isAuto[tt]) atl.push(tt); }
      for (i = 0; i < autos.length; i++) cnt[autos[i]]++;
      for (i = 0; i < atl.length; i++) cnt[atl[i]]++;
      // 4) Opening Round: lowest PA automatic teams play each other, lowest PL at-large teams play each other
      var entries = [];
      for (i = 0; i < autos.length - PA; i++) entries.push([autos[i], -1]);
      for (i = 0; i < atl.length - PL; i++) entries.push([atl[i], -1]);
      for (i = autos.length - PA; i + 1 < autos.length; i += 2) entries.push([autos[i], autos[i + 1]]);
      for (i = atl.length - PL; i + 1 < atl.length; i += 2) entries.push([atl[i], atl[i + 1]]);
      entries.sort(function (x, y) { return sc[y[0]] - sc[x[0]] || x[0] - y[0]; });
      var E = entries.length;
      if (E !== 64) throw new Error('settings: the bracket has ' + E + ' teams, not 64');
      var reg = [[], [], [], []];
      for (var k = 0; k < E; k++) {
        var e = entries[k], line = k >> 2, pos = k & 3, region = (line & 1) ? 3 - pos : pos;
        var tm = e[1] < 0 ? e[0] : (r2() < pw(e[0], e[1]) ? e[0] : e[1]);
        reg[region][line] = tm; cnt[nT + tm]++;
      }
      // 5) the four regions, then the Final Four (region 0 v 1, region 2 v 3)
      var champs = [];
      for (g = 0; g < 4; g++) {
        var sl = seedOrd16.map(function (s) { return reg[g][s - 1]; });
        var rounds = champElim(sl, pw, r2);
        for (var q = 0; q < 4; q++) for (i = 0; i < rounds[q].length; i++) cnt[(2 + q) * nT + rounds[q][i]]++;
        champs.push(rounds[3][0]);
      }
      var sf = champElim(champs, pw, r2);
      for (i = 0; i < sf[0].length; i++) cnt[6 * nT + sf[0][i]]++;
      cnt[7 * nT + sf[1][0]]++;
    }
    return { cnt: cnt, titleReg: titleReg, runs: runs, nT: nT };
  }

  var CH_STAGES = ['field', 'r64', 'r32', 's16', 'e8', 'f4', 'final', 'title'];

  // Returns a message if the settings cannot make a 64-team bracket, else ''.
  function champCheckSettings(nConf) {
    var e = nConf + CH.AT_LARGE - (CH.PLAYIN_AUTO + CH.PLAYIN_AL) / 2;
    if (e !== 64 || CH.PLAYIN_AUTO % 2 || CH.PLAYIN_AL % 2) {
      return 'Championship Odds settings do not make a 64-team bracket (' + nConf + ' conferences + ' + CH.AT_LARGE + ' at-large - ' +
        (CH.PLAYIN_AUTO + CH.PLAYIN_AL) / 2 + ' Opening Round games = ' + e + ', needs 64, and each Opening Round group must be an even number).';
    }
    return '';
  }

  function champModel(model) {
    var sig = signature(model);
    if (CH.cache && CH.sig === sig) return CH.cache;
    var t0 = performance.now();
    var P = prepare(model), comp = completeness(P);
    var R = P.names.map(function (n) { return model.current[C.teamKey(n)]; });
    var tn = P.confNames.map(function (c, ci) {
      var size = P.confOf.filter(function (x) { return x === ci; }).length, o = CH.TOURN[c];
      return o && o.n ? Math.min(o.n, size) : size;
    });
    var out = champCore(P.nT, P.confNames.length, P.confOf, P.baseOW, P.baseCW, P.gh, P.ga, P.gp, P.gc, R, tn, SIGMA, C.normCdf,
      CH.RUNS, SIM.SEED, CH.SEED, { k: CH.FORM_K, tau: SIM.TAU, shiftSeed: SIM.SHIFT_SEED, m: P.gm, atLarge: CH.AT_LARGE, playInAuto: CH.PLAYIN_AUTO, playInAtLarge: CH.PLAYIN_AL });
    var rows = P.names.map(function (n, i) {
      var cn = P.confNames[P.confOf[i]];
      var o = { team: n, conf: cn, rating: ratingShown(model, n), exact: R[i], warn: comp[cn].warn ? comp[cn].msg : '' };
      CH_STAGES.forEach(function (s, k) { o[s] = out.cnt[k * P.nT + i] / out.runs; });
      return o;
    });
    var ms = performance.now() - t0;
    CH.cache = { rows: rows, comp: comp, meta: { tau: SIM.TAU, formK: CH.FORM_K, runs: CH.RUNS, seed1: SIM.SEED, seed2: CH.SEED, ms: ms,
      excluded: P.excluded, tbd: (model.tbd || []).length, tn: P.confNames.map(function (c, i) { return [c, tn[i]]; }) } };
    CH.sig = sig;
    return CH.cache;
  }

  return { SIM: SIM, CH: CH, CONF_ORDER: CONF_ORDER, simModel: simModel, champModel: champModel, champCheckSettings: champCheckSettings,
    mulberry32: mulberry32, champSeedOrder: champSeedOrder, champSlots: champSlots };
})();
