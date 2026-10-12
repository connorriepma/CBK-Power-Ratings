// Ratings History page: a team's rating after every game, as a chart and a table.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var model, selected = 'Duke';

  function fmtDate(d) { var p = d.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
  function num(x, n) { return x.toFixed(n === undefined ? 2 : n); }
  function sgn(x) { return (x >= 0 ? '+' : '') + num(x); }

  function nameOf(key) {
    var t = model.byKey[key];
    if (t) return t.team;
    return key === C.teamKey(C.NON_D1) ? C.NON_D1 : key;
  }

  // Every game this team played, in replay order, from the team's side.
  function events(team) {
    var key = C.teamKey(team), ev = [];
    model.log.forEach(function (e) {
      var isH = e.home === key, isA = e.away === key;
      if (!isH && !isA) return;
      var us = isH ? e.hs : e.as, them = isH ? e.as : e.hs;
      var opp = nameOf(isH ? e.away : e.home);
      var site = e.neutral ? 'N' : (isH ? 'H' : 'A');
      if (e.skip) {
        var r = isH ? e.hr : e.ar;
        ev.push({ skip: true, date: e.date, opp: opp, site: site, score: us + '-' + them, before: r, after: r });
        return;
      }
      ev.push({
        skip: false, date: e.date, opp: opp, site: site, score: us + '-' + them,
        pm: isH ? e.pred : -e.pred, act: us - them, miss: isH ? e.miss : -e.miss,
        k: isH ? e.kh : e.ka, before: isH ? e.hb : e.ab, after: isH ? e.ha : e.aa
      });
    });
    return ev;
  }

  function chartHTML(team, start, rated) {
    var pts = [start].concat(rated.map(function (e) { return e.after; }));
    var W = 900, H = 260, pl = 48, pr = 16, pt = 14, pb = 28;
    var lo = Math.floor(Math.min.apply(null, pts) - 0.5), hi = Math.ceil(Math.max.apply(null, pts) + 0.5);
    function X(i) { return pl + (W - pl - pr) * (pts.length === 1 ? 0 : i / (pts.length - 1)); }
    function Y(v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(team) + ' rating by game">';
    var step = (hi - lo) > 12 ? 2 : 1;
    for (var v = lo; v <= hi; v += step) {
      s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#4A3208" stroke-opacity="0.35"/>' +
        '<text x="' + (pl - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="#9A6410">' + v + '</text>';
    }
    s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(start) + '" y2="' + Y(start) + '" stroke="#9A6410" stroke-dasharray="4 4"/>';
    s += '<polyline fill="none" stroke="#FFA31A" stroke-width="2.5" points="' +
      pts.map(function (p, i) { return X(i) + ',' + Y(p); }).join(' ') + '"/>';
    var every = Math.ceil(pts.length / 18);
    pts.forEach(function (p, i) {
      var e = i ? rated[i - 1] : null;
      s += '<circle cx="' + X(i) + '" cy="' + Y(p) + '" r="4" fill="#FFA31A"><title>' +
        (e ? fmtDate(e.date) + ' vs ' + esc(e.opp) + ': ' + num(p) : 'Preseason: ' + num(p)) + '</title></circle>';
      if (i % every === 0) {
        s += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#9A6410">' + (i ? i : 'Pre') + '</text>';
      }
    });
    return s + '</svg>';
  }

  function tableHTML(ev) {
    var t = '<thead><tr><th>Date</th><th>Opponent</th><th>Site</th><th>Score</th><th>Spread</th><th>Margin</th><th>Miss</th><th>K</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>';
    if (!ev.length) t += '<tr><td colspan="11" class="hx-empty">No results entered for this team yet.</td></tr>';
    ev.forEach(function (e) {
      if (e.skip) {
        t += '<tr class="skip"><td>' + fmtDate(e.date) + '</td><td>' + esc(e.opp) + '</td><td>' + e.site + '</td><td>' + e.score +
          '</td><td>-</td><td>-</td><td>-</td><td>-</td><td>' + num(e.before) + '</td><td>' + num(e.after) + '</td><td>skipped</td></tr>';
        return;
      }
      var c = e.after - e.before;
      t += '<tr><td>' + fmtDate(e.date) + '</td><td>' + esc(e.opp) + '</td><td>' + e.site + '</td><td>' + e.score + '</td>' +
        '<td>' + (e.pm >= 0 ? '-' : '+') + num(Math.abs(e.pm)) + '</td><td>' + sgn(e.act) + '</td>' +
        '<td class="' + (e.miss >= 0 ? 'up' : 'dn') + '">' + sgn(e.miss) + '</td><td>' + e.k + '</td>' +
        '<td>' + num(e.before) + '</td><td>' + num(e.after) + '</td><td class="' + (c >= 0 ? 'up' : 'dn') + '">' + sgn(c) + '</td></tr>';
    });
    return t + '</tbody>';
  }

  function render() {
    var key = C.teamKey(selected);
    var start = model.start[key], cur = model.current[key];
    var ev = events(selected), rated = ev.filter(function (e) { return !e.skip; });

    document.getElementById('hx-count').textContent = rated.length + (rated.length === 1 ? ' rated game' : ' rated games');
    document.getElementById('hx-stats').innerHTML = [
      ['Preseason', num(start)], ['Current', num(cur)], ['Change', sgn(cur - start)], ['Rated games', rated.length]
    ].map(function (p) { return '<div class="hx-stat"><b>' + p[1] + '</b><span>' + p[0] + '</span></div>'; }).join('');

    document.getElementById('hx-chart').innerHTML = rated.length
      ? chartHTML(selected, start, rated)
      : '<div class="hx-empty">No rated games yet. The line starts at the preseason rating (' + num(start) +
        ') and moves after each result.</div>';
    document.getElementById('hx-table').innerHTML = tableHTML(ev);
  }

  C.load().then(function (m) {
    model = m;
    var names = model.teams.map(function (t) { return t.team; }).sort(function (a, b) { return a.localeCompare(b); });
    var sel = document.getElementById('hx-team');
    sel.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');

    var fromHash = model.byKey[location.hash.slice(1)];
    selected = fromHash ? fromHash.team : (names.indexOf('Duke') >= 0 ? 'Duke' : names[0]);
    sel.value = selected;
    sel.addEventListener('change', function () {
      selected = sel.value;
      history.replaceState(null, '', '#' + C.teamKey(selected));
      render();
    });
    render();
  }).catch(function (err) {
    console.error(err);
    document.getElementById('load-error').hidden = false;
  });
})();
