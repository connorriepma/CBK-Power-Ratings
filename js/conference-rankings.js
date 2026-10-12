// Conference Rankings: each conference ranked by the average of its teams' current ratings. Display only.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;

  function rows(model) {
    var by = {};
    model.teams.forEach(function (t) {
      var r = model.current[t.key];
      if (typeof r !== 'number') return;
      (by[t.conference] = by[t.conference] || []).push({ team: t.team, r: r });
    });
    var out = Object.keys(by).map(function (cn) {
      var rs = by[cn];
      var avg = rs.reduce(function (a, x) { return a + x.r; }, 0) / rs.length;
      var best = rs.reduce(function (a, x) { return x.r > a.r ? x : a; }, rs[0]);
      var med = rs.map(function (x) { return x.r; }).sort(function (a, b) { return a - b; }), mid = med.length >> 1;
      return { cn: cn, avg: avg, n: rs.length, best: best, median: med.length % 2 ? med[mid] : (med[mid - 1] + med[mid]) / 2 };
    });
    out.sort(function (a, b) { return b.avg - a.avg || a.cn.localeCompare(b.cn); });
    return out;
  }

  function render(model) {
    var rs = rows(model);
    document.getElementById('cr-count').textContent = rs.length + ' conferences';
    document.getElementById('cr-table').innerHTML =
      '<thead><tr><th class="rk">#</th><th>Conference</th><th class="num">Avg rating</th><th class="num">Median</th><th class="num">Teams</th><th>Top team</th></tr></thead><tbody>' +
      rs.map(function (x, i) {
        return '<tr><td class="rk cr-rk">' + (i + 1) + '</td><td>' + esc(x.cn) + '</td><td class="num cr-avg">' + x.avg.toFixed(2) +
          '</td><td class="num">' + x.median.toFixed(2) + '</td><td class="num">' + x.n +
          '</td><td class="cr-sub">' + esc(x.best.team) + ' (' + x.best.r.toFixed(1) + ')</td></tr>';
      }).join('') + '</tbody>';
  }

  C.load().then(function (model) {
    render(model);
    document.addEventListener('cbk-results', function () { render(model); });
  }).catch(function () { document.getElementById('load-error').hidden = false; });
})();
