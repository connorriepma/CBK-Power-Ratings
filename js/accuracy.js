// Model Accuracy page: how far the published line is from the final margin, overall, by size of spread and by week.
// Read-only. It never changes a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var M = window.CBKMissesMath;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var model, rows = [];
  function lookup(e) { return model.buyGame({ date: e.date, home: e.home, away: e.away }); }
  function $(id) { return document.getElementById(id); }
  function fmtDate(iso) { var p = iso.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]); }
  function sgn(x, d) { var t = Math.abs(x).toFixed(d == null ? 1 : d); return (+t === 0 ? '' : x > 0 ? '+' : '\u2212') + t; }
  var DASH = '<span class="muted">&mdash;</span>';

  function render() {
    var st = M.summary(rows);
    $('ac-count').textContent = rows.length + (rows.length === 1 ? ' rated game' : ' rated games');
    if (!st) {
      $('ac-sum').innerHTML = '';
      $('ac-line').innerHTML = $('ac-week').innerHTML = '<div class="ms-empty"><b>No results yet</b>Games show up here once final scores are saved on the Schedule page.</div>';
      return;
    }
    $('ac-sum').innerHTML =
      '<div><b>' + st.mae.toFixed(2) + '</b><span>MAE (pts)</span></div>' +
      '<div><b>' + sgn(st.bias) + '</b><span>Favorite vs line (avg pts)</span></div>' +
      '<div><b>' + st.n + '</b><span>Games</span></div>';

    var lines = M.byLine(rows).filter(function (b) { return b.n; });
    $('ac-line').innerHTML = '<div class="ms-scroll"><table><thead><tr><th>Spread</th><th>Games</th><th>MAE</th><th>Avg line</th><th>Avg favorite margin</th><th>Favorite vs line</th><th>Favorite vs line (W-L)</th></tr></thead><tbody>' +
      lines.map(function (b) {
        var label = b.hi === null ? b.lo + '+' : b.lo + '\u2013' + b.hi;
        return '<tr><td data-l="Spread" class="ms-date">' + label + '</td>' +
          '<td data-l="Games" class="ms-num">' + b.n + '</td>' +
          '<td data-l="MAE" class="ms-num">' + b.mae.toFixed(2) + '</td>' +
          '<td data-l="Avg line" class="ms-num">' + b.avgLine.toFixed(1) + '</td>' +
          '<td data-l="Avg favorite margin" class="ms-num">' + sgn(b.avgMargin) + '</td>' +
          '<td data-l="Favorite vs line" class="ms-num">' + sgn(b.bias) + '</td>' +
          '<td data-l="Favorite vs line (W-L)" class="ms-num">' + b.covered + '-' + b.lost + (b.pushed ? '-' + b.pushed : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    $('ac-week').innerHTML = '<div class="ms-scroll"><table><thead><tr><th>Week of</th><th>Games</th><th>MAE</th><th>Favorite vs line</th></tr></thead><tbody>' +
      M.byWeek(rows).slice().reverse().map(function (w) {
        return '<tr><td data-l="Week of" class="ms-date">' + fmtDate(w.week) + '</td><td data-l="Games" class="ms-num">' + w.n +
          '</td><td data-l="MAE" class="ms-num">' + w.mae.toFixed(2) + '</td><td data-l="Favorite vs line" class="ms-num">' + sgn(w.bias) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    $('ac-foot').textContent = 'MAE (mean absolute error) is the average number of points the final margin landed from the line, ignoring direction. ' +
      '“Favorite vs line” is the favorite’s margin minus the line: positive means favorites did better than the line said on average, and zero means no bias. ' +
      'Spread is the size of the published line going into the game. Games against unrated opponents are left out.';
  }

  C.load().then(function (m) {
    model = m;
    rows = M.fromLog(m.log, lookup);
    document.addEventListener('cbk-results', function () { rows = M.fromLog(model.log, lookup); render(); });
    render();
  }).catch(function (err) {
    console.error(err);
    $('load-error').hidden = false;
  });
})();
