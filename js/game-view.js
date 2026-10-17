// Shared game line and win-probability markup, used by the Schedule page and the Next games rail.
window.CBKGames = (function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;

  function lineHTML(model, g) {
    if (g.result) {
      var homeWon = g.result.home > g.result.away;
      var win = homeWon ? g.home : g.away, winPts = homeWon ? g.result.home : g.result.away;
      var lose = homeWon ? g.away : g.home, losePts = homeWon ? g.result.away : g.result.home;
      return '<div class="g-line final">Final &middot; ' + esc(win) + ' ' + winPts + ', ' + esc(lose) + ' ' + losePts + '</div>';
    }
    var spread = model.homeSpread(g);
    if (spread === null) return '<div class="g-line none">&mdash;</div>';
    if (spread === 0) return '<div class="g-line pk" title="Exact line: PK (0.00)">PK</div>';
    var m = model.exactMargin(g);
    var fav = spread > 0 ? g.home : g.away;
    var tip = 'Exact line: ' + (m > 0 ? g.home : g.away) + ' -' + Math.abs(m).toFixed(2);
    return '<div class="g-line fav" title="' + esc(tip) + '">' + esc(fav) + ' -' + Math.abs(spread).toFixed(1) + '</div>';
  }

  function probHTML(model, g) {
    if (g.result) return '<div class="g-prob"></div>';
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

  return { lineHTML: lineHTML, probHTML: probHTML, combinedRating: combinedRating, sortBestFirst: sortBestFirst };
})();
