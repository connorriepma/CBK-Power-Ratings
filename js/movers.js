// Movers page: biggest risers and fallers by rating change over a time period.
// Uses the same replay log as Ratings History: a team's change is the sum of its rating changes in the window.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TOP = 10;
  var model, latest = '', period = 'today', showAll = false;

  var PERIODS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'd7', label: 'Last 7 Days' },
    { id: 'd30', label: 'Last 30 Days' },
    { id: 'season', label: 'Season' }
  ];

  function fmtDate(d) { var p = d.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
  function shift(iso, days) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  // [from, to] inclusive, relative to the most recent day with scores.
  function windowFor(id) {
    if (id === 'today') return [latest, latest];
    if (id === 'yesterday') { var y = shift(latest, -1); return [y, y]; }
    if (id === 'd7') return [shift(latest, -6), latest];
    if (id === 'd30') return [shift(latest, -29), latest];
    return ['0000-00-00', latest];
  }

  function changes(from, to) {
    var by = {};
    model.log.forEach(function (e) {
      if (e.skip || e.date < from || e.date > to) return;
      [[e.home, e.ha - e.hb], [e.away, e.aa - e.ab]].forEach(function (x) {
        var r = by[x[0]] || (by[x[0]] = { key: x[0], delta: 0, games: 0 });
        r.delta += x[1]; r.games++;
      });
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  function sgn(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(2); }

  function tableHTML(rows, cls) {
    if (!rows.length) return '<tr><td class="mv-empty">No teams moved this way in this period.</td></tr>';
    return '<thead><tr><th class="rk">#</th><th>Team</th><th class="num">Change</th><th class="num">Rating</th><th class="num">Games</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var t = model.byKey[r.key];
        return '<tr><td class="rk">' + (i + 1) + '</td><td>' + esc(t.team) + '<span class="conf">' + esc(t.conference) + '</span></td>' +
          '<td class="num ' + cls + '">' + sgn(r.delta) + '</td><td class="num">' + C.fmtRating(C.roundHalf(model.current[r.key])) + '</td><td class="num">' + r.games + '</td></tr>';
      }).join('') + '</tbody>';
  }

  function render() {
    var w = windowFor(period);
    var all = changes(w[0], w[1]).filter(function (r) { return model.byKey[r.key]; });
    var up = all.filter(function (r) { return r.delta > 0; }).sort(function (a, b) { return b.delta - a.delta; });
    var down = all.filter(function (r) { return r.delta < 0; }).sort(function (a, b) { return a.delta - b.delta; });
    var n = showAll ? Infinity : TOP;
    document.getElementById('mv-up').innerHTML = tableHTML(up.slice(0, n), 'mv-pos');
    document.getElementById('mv-down').innerHTML = tableHTML(down.slice(0, n), 'mv-neg');
    var more = document.getElementById('mv-more');
    more.hidden = Math.max(up.length, down.length) <= TOP;
    more.textContent = showAll ? 'Show top 10' : 'Show all';
    var label = w[0] === w[1] ? fmtDate(w[1]) : (period === 'season' ? 'Season through ' + fmtDate(w[1]) : fmtDate(w[0]) + ' – ' + fmtDate(w[1]));
    document.getElementById('mv-note').textContent = label + '. Change is the total rating movement from games in this period; teams with no games in it are not shown. ' +
      'Windows count back from the most recent day with scores.';
    Array.prototype.forEach.call(document.querySelectorAll('#mv-tabs button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-id') === period ? 'true' : 'false');
    });
  }

  function buildTabs() {
    var wrap = document.getElementById('mv-tabs');
    wrap.textContent = '';
    PERIODS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'conf-tab'; b.textContent = p.label; b.setAttribute('data-id', p.id);
      b.addEventListener('click', function () { period = p.id; showAll = false; render(); });
      wrap.appendChild(b);
    });
    document.getElementById('mv-more').addEventListener('click', function () { showAll = !showAll; render(); });
  }

  C.load().then(function (m) {
    model = m;
    model.log.forEach(function (e) { if (!e.skip && e.date > latest) latest = e.date; });
    buildTabs();
    if (!latest) {
      document.getElementById('mv-range').textContent = 'no scores yet';
      document.getElementById('mv-note').textContent = 'Risers and fallers will show up once scores are entered.';
      document.getElementById('mv-up').innerHTML = tableHTML([], '');
      document.getElementById('mv-down').innerHTML = tableHTML([], '');
      return;
    }
    document.getElementById('mv-range').textContent = 'scores through ' + fmtDate(latest);
    render();
  }).catch(function (err) {
    console.error(err);
    document.getElementById('load-error').hidden = false;
  });
})();
