// Shared game line and win-probability markup, used by the Schedule page and the Next games rail.
window.CBKGames = (function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;

  function lineHTML(model, g) {
    // Finished games keep the spread that was locked when the score was first saved (the final score
    // itself is shown in the win % column). No locked spread (non-D1 game, or saved without one): a dash.
    if (g.result) {
      var L = g.lineAtEntry;
      if (typeof L !== 'number') return '<div class="g-line none" title="No spread was saved with this result">&mdash;</div>';
      if (L === 0) return '<div class="g-line pk" title="Spread when the score was saved: PK">PK</div>';
      var favL = L < 0 ? g.home : g.away;
      var bgL = model.buyGame && model.buyGame(g);
      return '<div class="g-line fav" title="Spread when the score was saved">' + esc(favL) + ' -' + Math.abs(L).toFixed(1) + (bgL ? '*' : '') + '</div>';
    }
    var spread = model.homeSpread(g);
    if (spread === null) return '<div class="g-line none">&mdash;</div>';
    if (spread === 0) return '<div class="g-line pk" title="Exact line: PK (0.00)">PK</div>';
    var m = model.exactMargin(g);
    var fav = spread > 0 ? g.home : g.away;
    var tip = 'Exact line: ' + (m > 0 ? g.home : g.away) + ' -' + Math.abs(m).toFixed(2);
    var bg = model.buyGame && model.buyGame(g);
    return '<div class="g-line fav" title="' + esc(tip) + '">' + esc(fav) + ' -' + Math.abs(spread).toFixed(1) + (bg ? '*' : '') + '</div>';
  }

  function probHTML(model, g) {
    if (g.result) {
      var homeWon = g.result.home > g.result.away;
      var win = homeWon ? g.home : g.away, winPts = homeWon ? g.result.home : g.result.away;
      var lose = homeWon ? g.away : g.home, losePts = homeWon ? g.result.away : g.result.home;
      return '<div class="g-prob final" title="' + esc(adjustmentTip(model, g)) + '">' +
        '<div class="fin-w">' + esc(win) + ' ' + winPts + '</div><div class="fin-l">' + esc(lose) + ' ' + losePts + '</div></div>';
    }
    var wp = model.winProb(g);
    if (!wp) {
      var nh = g.home === C.NON_D1, na = g.away === C.NON_D1;
      if (nh === na) return '<div class="g-prob"></div>';
      return '<div class="g-prob" title="Non D1 opponent: counted as a win">' +
        '<span class="' + (nh ? 'g-fav' : '') + '">' + (nh ? '&gt;99%' : '&lt;1%') + '</span> / ' +
        '<span class="' + (na ? 'g-fav' : '') + '">' + (na ? '&gt;99%' : '&lt;1%') + '</span></div>';
    }
    var tie = Math.abs(wp.home - wp.away) < 1e-9, homeFav = wp.home > wp.away;
    var exact = 'Exact: ' + (wp.away * 100).toFixed(1) + '% / ' + (wp.home * 100).toFixed(1) + '%';
    return '<div class="g-prob" title="' + exact + '">' +
      '<span class="' + (!tie && !homeFav ? 'g-fav' : '') + '">' + C.fmtPct(wp.away) + '</span> / ' +
      '<span class="' + (!tie && homeFav ? 'g-fav' : '') + '">' + C.fmtPct(wp.home) + '</span></div>';
  }

  // Combined rating of the two teams (exact current ratings added together), or null if either team is unrated
  // (Non D1 Opponent games and any other unrated opponent).
  // Hover text for a final score: what that one game did to each team's rating. Read from the replay log
  // (model.log), so it is exactly what the ratings used. The log is rebuilt on every setResults, so index it per log.
  var logIndex = { log: null, byId: null };
  function logEntry(model, g) {
    if (logIndex.log !== model.log) {
      logIndex.log = model.log; logIndex.byId = {};
      model.log.forEach(function (e) { logIndex.byId[e.date + '|' + e.home + '|' + e.away] = e; });
    }
    return logIndex.byId[g.date + '|' + C.teamKey(g.home) + '|' + C.teamKey(g.away)] || null;
  }
  function signed(x, d) { var v = x.toFixed(d); return (x > 0 ? '+' : '') + v; }
  function adjustmentTip(model, g) {
    var e = logEntry(model, g);
    if (!e) return 'Final score';
    if (e.skip) return 'Final score. No rating change: the opponent is not a Division I team.';
    var lines = [];
    var pm = e.pred, am = e.hs - e.as;
    lines.push('Model: ' + (Math.abs(pm) < 0.005 ? 'even' : (pm > 0 ? g.home : g.away) + ' by ' + Math.abs(pm).toFixed(2)));
    lines.push('Actual: ' + (am === 0 ? 'tie' : (am > 0 ? g.home : g.away) + ' by ' + Math.abs(am)));
    var raw = am - pm;
    lines.push((Math.abs(raw) < 0.005 ? 'Matched the model' : (raw > 0 ? g.home : g.away) + ' beat the model by ' + Math.abs(raw).toFixed(2)) +
      (Math.abs(raw - e.miss) > 0.005 ? ' (counted as ' + Math.abs(e.miss).toFixed(2) + ')' : ''));
    if (e.credit < 0.9995) lines.push('Favorite credit cut to ' + Math.round(e.credit * 100) + '% (big mismatch)');
    lines.push('');
    lines.push(g.home + ' ' + signed(e.ha - e.hb, 2) + '  (' + e.hb.toFixed(2) + ' to ' + e.ha.toFixed(2) + ', K ' + e.kh + ')');
    lines.push(g.away + ' ' + signed(e.aa - e.ab, 2) + '  (' + e.ab.toFixed(2) + ' to ' + e.aa.toFixed(2) + ', K ' + e.ka + ')');
    return lines.join('\n');
  }

  function combinedRating(model, g) {
    var h = model.current[C.teamKey(g.home)], a = model.current[C.teamKey(g.away)];
    return (typeof h === 'number' && typeof a === 'number') ? h + a : null;
  }

  // Best games first: highest combined rating on top. Games with an unrated team go last.
  // Ties break alphabetically by home team, then away team, so the order never shuffles.
  function sortBestFirst(model, games) {
    return games.slice().sort(function (x, y) {
      var cx = combinedRating(model, x), cy = combinedRating(model, y);
      if (cx === null && cy !== null) return 1;
      if (cy === null && cx !== null) return -1;
      if (cx !== null && cy !== null && Math.abs(cx - cy) > 1e-9) return cy - cx;
      if (cx !== null && cy !== null) {
      // Same combined rating: closer predicted margin first.
      var mx = Math.abs(model.exactMargin(x)), my = Math.abs(model.exactMargin(y));
      if (Math.abs(mx - my) > 1e-9) return mx - my;
    }
    return x.home.localeCompare(y.home) || x.away.localeCompare(y.away);
    });
  }

  return { lineHTML: lineHTML, probHTML: probHTML, adjustmentTip: adjustmentTip, combinedRating: combinedRating, sortBestFirst: sortBestFirst };
})();
