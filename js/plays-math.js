// Pure math for the Plays tab: grading a spread play, unit accounting and input parsing/formatting.
// No DOM and no globals beyond the export, so tests/plays-math.test.js can load it in Node.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CBKPlaysMath = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var EPS = 1e-9;

  // Units are "to win": a play of u units wins u at any price. The stake is derived from the odds.
  // -110: risk 1.1 to win 1. +120: risk 0.8333 to win 1.
  function risk(units, odds) {
    return odds < 0 ? units * (-odds) / 100 : units * 100 / odds;
  }

  // Grade a spread play. line is from the picked team's side (negative = that team was favored).
  // The pick covers when its margin plus the line is above zero.
  function grade(pickScore, oppScore, line) {
    var d = (pickScore - oppScore) + line;
    return Math.abs(d) < EPS ? 'push' : d > 0 ? 'win' : 'loss';
  }

  // Units won or lost. A push returns the stake: 0.
  function net(result, units, odds) {
    if (result === 'win') return units;
    if (result === 'loss') return -risk(units, odds);
    return 0;
  }

  // plays: [{ result: 'win' | 'loss' | 'push' | null, units, odds }]. A null result is pending.
  // Win % is wins over wins plus losses. ROI is net units over units risked on plays that were not pushes.
  function summarize(plays) {
    var s = { w: 0, l: 0, p: 0, pending: 0, net: 0, risked: 0, winPct: null, roi: null };
    plays.forEach(function (p) {
      if (p.result === 'win') s.w++;
      else if (p.result === 'loss') s.l++;
      else if (p.result === 'push') s.p++;
      else { s.pending++; return; }
      s.net += net(p.result, p.units, p.odds);
      if (p.result !== 'push') s.risked += risk(p.units, p.odds);
    });
    if (s.w + s.l > 0) s.winPct = s.w / (s.w + s.l);
    if (s.risked > 0) s.roi = s.net / s.risked;
    return s;
  }

  // ---- Input parsing: each returns a number, or NaN when the text is not valid ----

  // "-4.5", "+3", "3", "PK". Books quote half points, so anything else is almost certainly a typo.
  function parseLine(text) {
    var t = String(text).trim().toLowerCase().replace(/−/g, '-');
    if (t === 'pk' || t === 'pick' || t === "pick'em") return 0;
    if (!/^[+-]?\d{1,2}(\.\d+)?$/.test(t)) return NaN;
    var n = Number(t);
    if (Math.abs(n * 2 - Math.round(n * 2)) > EPS) return NaN;
    return n === 0 ? 0 : n;
  }

  // American odds: "-110", "+105", "105". Anything between -99 and +99 is not a valid American price.
  function parseOdds(text) {
    var t = String(text).trim().replace(/−/g, '-');
    if (!/^[+-]?\d{3,4}$/.test(t)) return NaN;
    var n = Number(t);
    return Math.abs(n) >= 100 ? n : NaN;
  }

  // Units to win: a positive number, at most two decimals.
  function parseUnits(text) {
    var t = String(text).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    var n = Number(t);
    return n > 0 && n <= 100 ? n : NaN;
  }

  // ---- Formatting ----

  function fmtLine(n) {
    if (n === 0) return 'PK';
    return (n > 0 ? '+' : '') + String(n);
  }
  function fmtOdds(n) { return (n > 0 ? '+' : '') + String(n); }
  function fmtUnits(n, signed) {
    var v = Math.abs(n) < 0.005 ? 0 : n;
    return (signed && v > 0 ? '+' : '') + v.toFixed(2);
  }
  function fmtPct(p, signed) {
    var v = p * 100;
    return (signed && v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  return {
    risk: risk, grade: grade, net: net, summarize: summarize,
    parseLine: parseLine, parseOdds: parseOdds, parseUnits: parseUnits,
    fmtLine: fmtLine, fmtOdds: fmtOdds, fmtUnits: fmtUnits, fmtPct: fmtPct
  };
});
