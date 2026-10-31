// Totals tab. Read-only: loads its own base file plus the schedule, results and K config,
// replays final scores into per-team total offsets, and lists a projected total for each game.
(function () {
  'use strict';

  var T = window.CBKTotals;
  var C = window.CBK;
  var esc = C.esc;
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function (id) { return document.getElementById(id); };
  var rows = [], finals = {}, daySel = $('tt-day'), q = $('tt-q'), body = $('tt-body');

  function z(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function dayLabel(iso) {
    var p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return DOW[d.getDay()] + ' ' + MON[p[1] - 1] + ' ' + p[2] + ', ' + p[0];
  }
  function mdy(iso) { var p = iso.split('-'); return p[1] + '-' + p[2] + '-' + p[0]; }
  function fmt(x) { return T.roundHalf(x).toFixed(1); }

  function paint() {
    var day = daySel.value, term = q.value.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (term) return (r.home + ' ' + r.away).toLowerCase().indexOf(term) >= 0;
      return day === 'all' || r.date === day;
    });
    $('tt-count').textContent = list.length + ' game' + (list.length === 1 ? '' : 's');
    if (!list.length) {
      body.innerHTML = '<div class="tt-empty"><b>No games</b>Nothing matches.</div>';
      return;
    }
    var trs = list.map(function (r) {
      var f = finals[r.id];
      var matchup = esc(r.away) + ' <span class="tt-at">' + (r.neutral ? 'vs' : '@') + '</span> ' + esc(r.home) +
        (r.neutral ? '*' : '') + (r.site ? '<span class="tt-site">' + esc(r.site) + '</span>' : '');
      return '<tr><td data-l="Date" class="tt-num">' + mdy(r.date) + (r.dateTbd ? ' <span class="tt-site">TBA</span>' : '') +
        '</td><td data-l="Game">' + matchup + '</td>' +
        '<td data-l="Total" class="tt-num tt-total" title="Exact: ' + r.total.toFixed(2) + '">' + fmt(r.total) + '</td>' +
        '<td data-l="Preseason" class="tt-num">' + fmt(r.pre) + '</td>' +
        '<td data-l="Pace" class="tt-num">' + r.poss.toFixed(1) + '</td>' +
        '<td data-l="Final" class="tt-num">' + (f ? f.actual : '') + '</td></tr>';
    }).join('');
    body.innerHTML = '<div class="tt-scroll"><table><thead><tr><th>Date</th><th>Game</th><th>Total</th><th>Preseason</th><th>Pace</th><th>Final</th></tr></thead><tbody>' + trs + '</tbody></table></div>';
  }

  function fillDays() {
    var dates = [];
    rows.forEach(function (r) { if (dates.indexOf(r.date) < 0) dates.push(r.date); });
    var today = todayISO();
    var pick = dates.filter(function (d) { return d >= today; })[0] || dates[0] || 'all';
    daySel.innerHTML = '<option value="all">All days</option>' + dates.map(function (d) {
      return '<option value="' + d + '"' + (d === pick ? ' selected' : '') + '>' + dayLabel(d) + '</option>';
    }).join('');
  }

  Promise.all(['data/totals/base.json', 'data/schedule.json', 'data/results.json', 'data/rating_config.json'].map(function (p) {
    return fetch(p).then(function (res) { if (!res.ok) throw new Error(p); return res.json(); });
  })).then(function (d) {
    var base = d[0], results = d[2].map(function (r) { return r; });
    var rp = T.replay(base, d[3], results);
    rows = T.buildGames(base, d[1], rp.off);
    rp.log.forEach(function (l) { finals[l.id] = l; });
    fillDays();
    paint();
    var n = rp.log.length;
    $('tt-foot').textContent = n
      ? 'Totals include adjustments from ' + n + ' final score' + (n === 1 ? '' : 's') + '. Shown to the nearest 0.5; hover for the exact number.'
      : 'Preseason totals: no final scores entered yet. Shown to the nearest 0.5; hover for the exact number. Games against non-D1 opponents have no total.';
    daySel.addEventListener('change', function () { q.value = ''; paint(); });
    q.addEventListener('input', paint);
  }).catch(function () { $('load-error').hidden = false; });
})();
