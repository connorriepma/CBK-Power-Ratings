// Injuries page: a read-only log from data/injuries.json. It never touches a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var STATUSES = ['Out for season', 'Out', 'Doubtful', 'Questionable', 'Day-to-day', 'Returned'];
  var BADGE = {
    'Out for season': ['inj-b-ofs', '■'], 'Out': ['inj-b-out', '✕'], 'Doubtful': ['inj-b-dbt', '▲'],
    'Questionable': ['inj-b-q', '?'], 'Day-to-day': ['inj-b-dtd', '○'], 'Returned': ['inj-b-ret', '✓']
  };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var model, rows = [], openHist = null, datesByKey = null;
  function $(id) { return document.getElementById(id); }

  function fmt(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) : String(iso);
  }
  function isUrl(s) { return /^https?:\/\/\S+$/i.test(s); }
  function todayISO() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function nameOf(e) { var t = model.byKey[e.team]; return t ? t.team : e.team; }
  function confOf(e) { var t = model.byKey[e.team]; return t ? t.conference : ''; }

  function gameDates(k) {
    if (!datesByKey) {
      datesByKey = {};
      model.games.forEach(function (g) {
        [g.home, g.away].forEach(function (n) {
          var kk = C.teamKey(n);
          (datesByKey[kk] = datesByKey[kk] || []).push(g.date);
        });
      });
    }
    return datesByKey[k] || [];
  }

  function norm(d) {
    if (!d || !d.team || !d.player || !d.status || !d.reported) return null;
    return {
      id: d.id, team: String(d.team), player: String(d.player), pos: d.pos || '', role: d.role || '', status: String(d.status),
      returnDate: d.returnDate || null, reported: String(d.reported), source: d.source || '', note: d.note || '',
      updated: String(d.updated || d.reported), history: Array.isArray(d.history) ? d.history : []
    };
  }

  // Games missed: the team's games on this site, counted by date. Never guessed when the return is unknown.
  function gamesMissed(e, today) {
    var dates = gameDates(e.team), last = dates.reduce(function (m, d) { return d > m ? d : m; }, '');
    function count(fn) { return dates.filter(fn).length; }
    if (e.status === 'Returned') {
      var end = e.returnDate || e.updated, n = count(function (d) { return d >= e.reported && d < end; });
      return { so: n, proj: n, done: true };
    }
    var so = count(function (d) { return d >= e.reported && d < today; });
    if (e.status === 'Out for season') return { so: so, proj: count(function (d) { return d >= e.reported; }), ofs: true };
    if (!e.returnDate) return { so: so, proj: null, unknown: true };
    return { so: so, proj: count(function (d) { return d >= e.reported && d <= e.returnDate; }), afterLast: !!last && e.returnDate > last };
  }

  function gmHTML(e, today) {
    var g = gamesMissed(e, today);
    function n(x) { return x + ' game' + (x === 1 ? '' : 's'); }
    if (g.done) return '<span class="inj-num">' + n(g.so) + '</span><small>missed in total</small>';
    var so = '<span class="inj-num">' + g.so + ' so far</span>';
    if (g.unknown) return so + '<small>projected: unknown</small>';
    if (g.ofs) return so + '<small>rest of schedule: ' + n(g.proj) + '</small>';
    return so + '<small>projected ' + g.proj + (g.afterLast ? ' (return is after the last game on this site)' : '') + '</small>';
  }

  function render() {
    var fc = $('inj-conf').value, ft = $('inj-team').value.trim().toLowerCase(), fs = $('inj-status').value;
    var showRet = $('inj-ret').checked, today = todayISO();
    var list = rows.filter(function (e) {
      return (showRet || e.status !== 'Returned') && (!fc || confOf(e) === fc) &&
        (!ft || nameOf(e).toLowerCase().indexOf(ft) >= 0) && (!fs || e.status === fs);
    }).sort(function (a, b) { return b.updated.localeCompare(a.updated) || nameOf(a).localeCompare(nameOf(b)); });

    $('inj-count').textContent = rows.filter(function (e) { return e.status !== 'Returned'; }).length + ' active';
    $('inj-foot').textContent = list.length
      ? 'Games missed counts this team’s games on this site: dated before today for “so far”, through the expected return date for “projected”. Games not on the site, including tournament games, are not counted. An unknown return is never guessed.'
      : '';
    if (!list.length) {
      var filtered = rows.length > 0;
      $('inj-body').innerHTML = '<div class="inj-empty"><b>' + (filtered ? 'No entries match these filters' : 'No injuries logged yet') + '</b>' +
        (filtered ? 'Clear a filter or turn on “Show returned”.' : 'When a notable player is reported out, the entry shows up here with the source and an expected return date.') + '</div>';
      return;
    }
    var h = '<div class="inj-scroll"><table><thead><tr><th>Team</th><th>Player</th><th>Role</th><th>Status</th><th>Expected return</th><th>Games missed</th><th>Source</th><th>Updated</th></tr></thead><tbody>';
    list.forEach(function (e) {
      var b = BADGE[e.status] || ['inj-b-q', '?'];
      var ret = e.status === 'Returned' ? 'Returned ' + fmt(e.returnDate || e.updated)
        : e.status === 'Out for season' ? 'Season' : (e.returnDate ? fmt(e.returnDate) : 'Unknown / indefinite');
      var src = isUrl(e.source)
        ? '<a href="' + esc(e.source) + '" target="_blank" rel="noopener noreferrer">' + esc(e.source.replace(/^https?:\/\//, '').slice(0, 34)) + '</a>'
        : esc(e.source);
      h += '<tr class="inj-row">' +
        '<td data-l="Team" class="inj-team"><span><a href="#" data-team="' + esc(nameOf(e)) + '">' + esc(nameOf(e)) + '</a><span class="inj-conf">' + esc(confOf(e)) + '</span></span></td>' +
        '<td data-l="Player" class="inj-player"><span><b>' + esc(e.player) + '</b>' + (e.pos ? '<small>' + esc(e.pos) + '</small>' : '') + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</span></td>' +
        '<td data-l="Role">' + esc(e.role) + '</td>' +
        '<td data-l="Status"><span class="inj-badge ' + b[0] + '"><span aria-hidden="true">' + b[1] + '</span>' + esc(e.status) + '</span></td>' +
        '<td data-l="Return" class="inj-num">' + ret + '</td>' +
        '<td data-l="Games missed" class="inj-gm"><span>' + gmHTML(e, today) + '</span></td>' +
        '<td data-l="Source" class="inj-src"><span>' + src + '</span></td>' +
        '<td data-l="Updated" class="inj-upd">' + fmt(e.updated) + '<br><a href="#" data-hist="' + esc(e.id) + '">' + (openHist === e.id ? 'hide history' : 'history') + '</a></td></tr>';
      if (openHist === e.id) {
        h += '<tr class="inj-hist"><td colspan="8">' + (e.history.length
          ? e.history.slice().reverse().map(function (x) {
              return fmt(x.date) + ': ' + esc(x.status) + (x.returnDate ? ' (expected ' + fmt(x.returnDate) + ')' : '');
            }).join(' &nbsp;←&nbsp; ')
          : 'No history recorded.') + '</td></tr>';
      }
    });
    $('inj-body').innerHTML = h + '</tbody></table></div>';
  }

  function init(m, data) {
    model = m;
    rows = data.map(norm).filter(Boolean);
    var confs = [];
    m.teams.forEach(function (t) { if (confs.indexOf(t.conference) < 0) confs.push(t.conference); });
    confs.sort();
    $('inj-conf').innerHTML = '<option value="">All conferences</option>' + confs.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    $('inj-status').innerHTML = '<option value="">All statuses</option>' +
      STATUSES.filter(function (s) { return s !== 'Returned'; }).map(function (s) { return '<option>' + s + '</option>'; }).join('');
    ['inj-conf', 'inj-status', 'inj-ret'].forEach(function (id) { $(id).addEventListener('change', render); });
    $('inj-team').addEventListener('input', render);
    $('inj-body').addEventListener('click', function (ev) {
      var t = ev.target.closest('a');
      if (!t) return;
      if (t.dataset.team) { ev.preventDefault(); $('inj-team').value = t.dataset.team; render(); }
      else if (t.dataset.hist) { ev.preventDefault(); openHist = openHist === t.dataset.hist ? null : t.dataset.hist; render(); }
    });
    render();
  }

  Promise.all([C.load(), C.getJSON('data/injuries.json')]).then(function (d) { init(d[0], d[1]); }).catch(function () {
    $('load-error').hidden = false;
  });
})();
