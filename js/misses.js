// Biggest Misses page: every rated game ranked by how far the final margin landed from the model's line.
// Read-only. It never changes a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var M = window.CBKMissesMath;
  var esc = C.esc;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MINS = [0, 10, 15, 20];
  var LIMIT = 200;

  var model, rows = [], names = {};
  function $(id) { return document.getElementById(id); }

  function fmtDate(iso) { var p = iso.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]); }
  function nameOf(key) { return names[key] || key; }

  function sgn(x, d) { return (x > 0 ? '+' : x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(d == null ? 1 : d); }

  // Only games that carried a buy-game adjustment: how the plain rating line and the adjusted line each did.
  function renderBuy() {
    var games = M.buyGames(rows, function (r) { return model.buyGame({ date: r.date, home: r.home, away: r.away }); });
    var st = M.buyStats(games), el = $('ms-buy');
    if (!st) {
      el.innerHTML = '<h2>Buy-game adjusted games</h2><div class="ms-empty"><b>No finished buy games yet</b>This fills in once a game with a starred (*) spread is final.</div>';
      return;
    }
    var by = games.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    el.innerHTML = '<h2>Buy-game adjusted games</h2>' +
      '<div class="ms-sum">' +
        '<div><b>' + st.n + '</b><span>Finished games</span></div>' +
        '<div><b>' + st.maeRating.toFixed(1) + ' &rarr; ' + st.maeAdj.toFixed(1) + '</b><span>MAE: rating line &rarr; adjusted line</span></div>' +
        '<div><b>' + sgn(st.biasRating) + ' &rarr; ' + sgn(st.biasAdj) + '</b><span>Favorite vs line (avg): rating &rarr; adjusted</span></div>' +
        '<div><b>' + st.covered + '-' + (st.n - st.covered - st.pushed) + (st.pushed ? '-' + st.pushed : '') + '</b><span>Favorite vs adjusted line</span></div>' +
      '</div>' +
      '<div class="ms-scroll"><table><thead><tr><th>Date</th><th>Game</th><th>Rating line</th><th>Bonus</th><th>Adjusted line</th><th>Final</th><th>Fav vs adjusted</th></tr></thead><tbody>' +
      by.map(function (g) {
        var fav = nameOf(g.favorite), winner = g.hs > g.as ? g.home : g.away, loser = g.hs > g.as ? g.away : g.home;
        return '<tr><td data-l="Date" class="ms-date">' + fmtDate(g.date) + '</td>' +
          '<td data-l="Game">' + esc(nameOf(g.away)) + (g.neutral ? ' vs ' : ' @ ') + esc(nameOf(g.home)) + '</td>' +
          '<td data-l="Rating line" class="ms-num">' + esc(fav) + ' -' + g.ratingLine.toFixed(1) + '</td>' +
          '<td data-l="Bonus" class="ms-num">+' + g.bonus + '</td>' +
          '<td data-l="Adjusted line" class="ms-num">' + esc(fav) + ' -' + g.adjLine.toFixed(1) + '*</td>' +
          '<td data-l="Final" class="ms-num">' + esc(nameOf(winner)) + ' ' + Math.max(g.hs, g.as) + ', ' + esc(nameOf(loser)) + ' ' + Math.min(g.hs, g.as) + '</td>' +
          '<td data-l="Fav vs adjusted" class="ms-num ms-miss">' + sgn(g.missAdj) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="ms-foot">MAE (mean absolute error) is the average number of points the final margin landed from the line, ignoring direction. ' +
      '“Favorite vs line” is the favorite’s margin minus the line: positive means the favorite did better than the line said, so a figure near zero for the adjusted line means the bonus is about right. ' +
      'Only games with a buy-game adjustment are included. Games played before the bonus existed are not.</div>';
  }

  function render() {
    renderBuy();
    var min = Number($('ms-min').value), q = $('ms-team').value.trim().toLowerCase();
    var list = M.rank(rows).filter(function (r) {
      return r.abs >= min && (!q || nameOf(r.home).toLowerCase().indexOf(q) >= 0 || nameOf(r.away).toLowerCase().indexOf(q) >= 0);
    });
    var shown = list.slice(0, LIMIT), avg = M.avgAbs(list);

    $('ms-count').textContent = rows.length + (rows.length === 1 ? ' rated game' : ' rated games');
    $('ms-sum').innerHTML =
      '<div><b>' + list.length + '</b><span>Games' + (min || q ? ' shown' : '') + '</span></div>' +
      '<div><b>' + (avg === null ? '&mdash;' : avg.toFixed(1)) + '</b><span>Average miss (pts)</span></div>' +
      '<div><b>' + (list.length ? list[0].abs.toFixed(1) : '&mdash;') + '</b><span>Biggest miss (pts)</span></div>';

    if (!shown.length) {
      $('ms-body').innerHTML = '<div class="ms-empty"><b>' + (rows.length ? 'No games match these filters' : 'No results yet') + '</b>' +
        (rows.length ? 'Lower the minimum miss or clear the search.' : 'Games show up here once final scores are saved on the Schedule page.') + '</div>';
      $('ms-foot').textContent = '';
      return;
    }
    $('ms-body').innerHTML = '<div class="ms-scroll"><table><thead><tr><th>#</th><th>Date</th><th>Game</th><th>Model line</th><th>Final</th><th>Miss</th><th>Model too high on</th></tr></thead><tbody>' +
      shown.map(function (r, i) {
        var game = r.neutral ? esc(nameOf(r.away)) + ' vs ' + esc(nameOf(r.home)) + '*' : esc(nameOf(r.away)) + ' @ ' + esc(nameOf(r.home));
        var winner = r.hs > r.as ? r.home : r.away, loser = r.hs > r.as ? r.away : r.home;
        var ws = Math.max(r.hs, r.as), ls = Math.min(r.hs, r.as);
        return '<tr><td data-l="#" class="ms-rk">' + (i + 1) + '</td>' +
          '<td data-l="Date" class="ms-date">' + fmtDate(r.date) + '</td>' +
          '<td data-l="Game">' + game + '</td>' +
          '<td data-l="Model line" class="ms-num">' + esc(M.lineText(r, names)) + '</td>' +
          '<td data-l="Final" class="ms-num">' + esc(nameOf(winner)) + ' ' + ws + ', ' + esc(nameOf(loser)) + ' ' + ls + '</td>' +
          '<td data-l="Miss" class="ms-num ms-miss">' + r.abs.toFixed(1) + '</td>' +
          '<td data-l="Too high on">' + esc(nameOf(r.over)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    $('ms-foot').textContent = (list.length > LIMIT ? 'Showing the ' + LIMIT + ' biggest of ' + list.length + '. ' : '') +
      'Miss is how many points the final margin landed from the model’s line going into that game, using the exact rating-based line (not rounded to 0.5, and before any buy-game adjustment). ' +
      'It is the raw miss: the rating update caps it and, for a big favorite beating the line, only counts part of it. This page does neither. “Model too high on” is the team that did worse than the line expected. ' +
      'Games against unrated opponents are left out. * neutral site.';
  }

  C.load().then(function (m) {
    model = m;
    m.teams.forEach(function (t) { names[t.key] = t.team; });
    rows = M.fromLog(m.log);
    $('ms-min').innerHTML = MINS.map(function (n) { return '<option value="' + n + '">' + (n ? n + '+ point miss' : 'All misses') + '</option>'; }).join('');
    $('ms-min').addEventListener('change', render);
    $('ms-team').addEventListener('input', render);
    // Scores saved on the Schedule page in another tab are picked up the same way the other pages do it.
    document.addEventListener('cbk-results', function () { rows = M.fromLog(model.log); render(); });
    render();
  }).catch(function (err) {
    console.error(err);
    $('load-error').hidden = false;
  });
})();
