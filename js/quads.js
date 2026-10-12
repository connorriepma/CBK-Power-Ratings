// Quad Records: every team's record in Q1-Q4 games, with the quad set by the opponent's rank on the current ratings. Display only.
(function () {
  'use strict';

  var C = window.CBK, Q = window.CBKQuadMath;
  var esc = C.esc;
  var sortKey = 'rank'; // 'rank' | 'q1' | 'q2' | 'q3' | 'q4'
  var filter = '';
  var open = {}; // team name -> true while its game list is expanded
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SITE = { home: 'vs', away: '@', neutral: 'N' };

  function rows(model) {
    var ratings = {};
    model.teams.forEach(function (t) { ratings[t.team] = model.current[t.key]; });
    var ranks = Q.rankTeams(ratings);
    var quads = Q.buildQuads(model.games, ranks);
    return model.teams.filter(function (t) { return t.team in ranks; }).map(function (t) {
      return { team: t.team, conf: t.conference, rank: ranks[t.team], rating: ratings[t.team], q: quads[t.team] };
    });
  }

  function cmp(a, b) {
    if (sortKey !== 'rank') {
      var n = sortKey.charAt(1), x = a.q[n], y = b.q[n];
      // most wins first, then fewest losses, then the rating order
      if (x.w !== y.w) return y.w - x.w;
      if (x.l !== y.l) return x.l - y.l;
    }
    return a.rank - b.rank;
  }

  function cell(r) { return '<td class="num' + (r.w + r.l === 0 ? ' cr-sub' : '') + '">' + r.w + '-' + r.l + '</td>'; }

  function gameRow(x) {
    var d = x.dateTbd ? 'TBA' : MONTHS[Number(x.date.split('-')[1]) - 1] + ' ' + Number(x.date.split('-')[2]);
    var res = x.result
      ? '<span style="color:var(--' + (x.result.won ? 'paint' : 'paint-2') + ');font-weight:600">' + (x.result.won ? 'W' : 'L') + ' ' + x.result.us + '-' + x.result.them + '</span>'
      : '<span class="cr-sub" title="Not played yet">&mdash;</span>';
    return '<div style="display:grid;grid-template-columns:44px 14px minmax(0,1fr) auto;gap:4px;padding:0;line-height:1.35"><span class="cr-sub" style="white-space:nowrap">' + d + '</span><span class="cr-sub">' + SITE[x.site] +
      '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.opp) + (x.rank ? ' <span class="cr-sub">(#' + x.rank + ')</span>' : '') + '</span><span style="text-align:right">' + res + '</span></div>';
  }

  function detailHTML(model, team, ranks) {
    var games = Q.teamGames(model.games, ranks, team);
    var by = { 1: [], 2: [], 3: [], 4: [], 0: [] };
    games.forEach(function (x) { by[x.quad || 0].push(x); });
    var block = function (n, title) {
      var list = by[n];
      if (!list.length) return '';
      var w = 0, l = 0;
      list.forEach(function (x) { if (x.result) { if (x.result.won) w++; else l++; } });
      return '<div style="padding:0 10px;border-left:1px solid var(--wood-line, rgba(128,128,128,.35));min-width:0"><div style="font-weight:700;margin-bottom:1px">' + title + (n ? ' &middot; ' + w + '-' + l : '') +
        ' <span class="cr-sub" style="font-weight:400">' + list.length + ' game' + (list.length === 1 ? '' : 's') + '</span></div>' + list.map(gameRow).join('') + '</div>';
    };
    return '<div style="padding:2px 0 0;font-size:12px"><div class="cr-sub" style="margin-bottom:3px">' + esc(team) + ' &middot; ' + games.length + ' games, each in the quad it is for ' + esc(team) +
      ' (&mdash; = not played yet)</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:6px 0">' +
      block(1, 'Quad 1') + block(2, 'Quad 2') + block(3, 'Quad 3') + block(4, 'Quad 4') + block(0, 'Not counted (non-Division I)') + '</div></div>';
  }

  function render(model) {
    var all = rows(model);
    var rankOf = {};
    all.forEach(function (r) { rankOf[r.team] = r.rank; });
    var list = all.filter(function (r) { return !filter || r.conf === filter; }).sort(cmp);
    document.getElementById('q-count').textContent = list.length + ' teams';
    var arrow = function (k) { return sortKey === k ? ' &#9662;' : ''; };
    var th = function (k, label, cls) { return '<th class="' + cls + '" data-sort="' + k + '" style="cursor:pointer" title="Sort by ' + esc(label) + '">' + label + arrow(k) + '</th>'; };
    document.getElementById('q-table').innerHTML =
      '<thead><tr>' + th('rank', '#', 'rk') + '<th>Team</th><th>Conference</th><th class="num">Rating</th>' +
      th('q1', 'Q1', 'num') + th('q2', 'Q2', 'num') + th('q3', 'Q3', 'num') + th('q4', 'Q4', 'num') + '</tr></thead><tbody>' +
      list.map(function (r) {
        var isOpen = !!open[r.team];
        return '<tr><td class="rk cr-rk">' + r.rank + '</td><td data-team="' + esc(r.team) + '" style="cursor:pointer" title="Show ' + esc(r.team) + '\'s games by quad"><span style="text-decoration:underline dotted">' + esc(r.team) + '</span> <span class="cr-sub">' + (isOpen ? '&#9652;' : '&#9662;') + '</span></td><td class="cr-sub">' + esc(r.conf) +
          '</td><td class="num">' + C.fmtRating(C.roundHalf(r.rating)) + '</td>' + cell(r.q[1]) + cell(r.q[2]) + cell(r.q[3]) + cell(r.q[4]) + '</tr>' +
          (isOpen ? '<tr><td colspan="8" style="padding-top:2px;padding-bottom:6px">' + detailHTML(model, r.team, rankOf) + '</td></tr>' : '');
      }).join('') + '</tbody>';
  }

  C.load().then(function (model) {
    var confs = [];
    model.teams.forEach(function (t) { if (confs.indexOf(t.conference) < 0) confs.push(t.conference); });
    confs.sort();
    var sel = document.getElementById('q-filter');
    sel.innerHTML = '<option value="">All Conferences</option>' + confs.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    sel.addEventListener('change', function () { filter = sel.value; render(model); });
    document.getElementById('q-table').addEventListener('click', function (ev) {
      var tm = ev.target.closest('[data-team]');
      if (tm) { var n = tm.getAttribute('data-team'); if (open[n]) delete open[n]; else open[n] = true; render(model); return; }
      var h = ev.target.closest('[data-sort]');
      if (!h) return;
      sortKey = h.getAttribute('data-sort');
      render(model);
    });
    render(model);
    document.addEventListener('cbk-results', function () { render(model); });
  }).catch(function () { document.getElementById('load-error').hidden = false; });
})();
