// "Today's Games" rail: the next day with games, shown in the left margin on wide screens (CSS hides it below 1850px).
(function () {
  'use strict';

  var C = window.CBK;
  var G = window.CBKGames;
  var esc = C.esc;
  var host = document.getElementById('rail-games');
  if (!host) return;

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var model = null, paintedFor = null;

  function z(n) { return (n < 10 ? '0' : '') + n; }
  function localISO() {
    var d = new Date();
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function dayLabel(iso) {
    var p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return DOW[d.getDay()] + ' ' + MON[p[1] - 1] + ' ' + p[2];
  }

  function paint() {
    if (!model) return;
    var today = localISO();
    paintedFor = today;
    var dates = [];
    model.games.forEach(function (g) { if (dates.indexOf(g.date) < 0) dates.push(g.date); });
    dates.sort();
    var day = dates.filter(function (d) { return d >= today; })[0];
    if (!day) {
      host.innerHTML = '<div class="rail-h">Today&rsquo;s Games</div><div class="rail-sub">&nbsp;</div>' +
        '<div class="rail-p"><div class="rail-empty">No games left on the schedule.</div></div>';
      return;
    }
    var list = model.games.filter(function (g) { return g.date === day; })
      .sort(function (a, b) { return a.home.localeCompare(b.home); });
    var rows = list.map(function (g) {
      var m = g.neutral
        ? esc(g.away) + ' <span class="rl-vs">vs</span> ' + esc(g.home) + '*' + (g.site ? '<span class="g-site">' + esc(g.site) + '</span>' : '')
        : esc(g.away) + ' <span class="rl-vs">@</span> ' + esc(g.home);
      return '<div class="rl-row"><div class="rl-m">' + m + (g.dateTbd ? ' <span class="g-site">Date TBA</span>' : '') +
        '</div><div class="rl-b">' + G.lineHTML(model, g) + G.probHTML(model, g) + '</div></div>';
    }).join('');
    host.innerHTML = '<div class="rail-h">' + (day === today ? 'Today&rsquo;s Games' : 'Next games') + '</div>' +
      '<div class="rail-sub">' + dayLabel(day) + ' &middot; ' + list.length + ' game' + (list.length === 1 ? '' : 's') + '</div>' +
      '<div class="rail-p"><div class="rail-scroll' + (list.length >= 50 ? ' big' : '') + '">' + rows + '</div></div>';
  }

  C.load().then(function (m) {
    model = m;
    paint();
    document.addEventListener('cbk-results', paint);
    setInterval(function () { if (localISO() !== paintedFor) paint(); }, 60000);
  }).catch(function () {});
})();
