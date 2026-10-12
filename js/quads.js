// Quad Records: every team's record in Q1-Q4 games, with the quad set by the opponent's rank on the current ratings. Display only.
(function () {
  'use strict';

  var C = window.CBK, Q = window.CBKQuadMath;
  var esc = C.esc;
  var sortKey = 'rank'; // 'rank' | 'q1' | 'q2' | 'q3' | 'q4'
  var filter = '';

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

  function render(model) {
    var all = rows(model);
    var list = all.filter(function (r) { return !filter || r.conf === filter; }).sort(cmp);
    document.getElementById('q-count').textContent = list.length + ' teams';
    var arrow = function (k) { return sortKey === k ? ' &#9662;' : ''; };
    var th = function (k, label, cls) { return '<th class="' + cls + '" data-sort="' + k + '" style="cursor:pointer" title="Sort by ' + esc(label) + '">' + label + arrow(k) + '</th>'; };
    document.getElementById('q-table').innerHTML =
      '<thead><tr>' + th('rank', '#', 'rk') + '<th>Team</th><th>Conference</th><th class="num">Rating</th>' +
      th('q1', 'Q1', 'num') + th('q2', 'Q2', 'num') + th('q3', 'Q3', 'num') + th('q4', 'Q4', 'num') + '</tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr><td class="rk cr-rk">' + r.rank + '</td><td>' + esc(r.team) + '</td><td class="cr-sub">' + esc(r.conf) +
          '</td><td class="num">' + C.fmtRating(C.roundHalf(r.rating)) + '</td>' + cell(r.q[1]) + cell(r.q[2]) + cell(r.q[3]) + cell(r.q[4]) + '</tr>';
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
      var h = ev.target.closest('[data-sort]');
      if (!h) return;
      sortKey = h.getAttribute('data-sort');
      render(model);
    });
    render(model);
    document.addEventListener('cbk-results', function () { render(model); });
  }).catch(function () { document.getElementById('load-error').hidden = false; });
})();
