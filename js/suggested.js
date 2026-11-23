// Suggested plays (bottom of the Plays tab): upcoming games where the model line is at least N points from the current market
// line (data/upcoming_lines.json, refreshed three times a day). Read-only. It never changes a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var S = window.CBKSuggestedMath;
  var esc = C.esc;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PROVIDER = 'Draft Kings';
  var GAPS = [2.5, 3, 4, 5];

  var model, feed = null, logged = {};
  function $(id) { return document.getElementById(id); }
  function z(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function fmtDate(iso) { var p = iso.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]); }
  function line(n) { var t = Math.abs(n).toFixed(1); return (+t === 0 ? 'PK' : (n > 0 ? '+' : '−') + t); }
  function stamp(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    var h = d.getHours(), m = d.getMinutes();
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + (h % 12 || 12) + ':' + z(m) + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  function render() {
    var min = Number($('sg-gap').value) || GAPS[0];
    var list = S.suggest(model.games, feed, function (g) { return model.exactMargin(g); },
      { provider: PROVIDER, minGap: min, today: todayISO(), logged: logged, nonD1: C.NON_D1 });
    var when = feed && feed.updated ? ' Lines updated ' + stamp(feed.updated) + '.' : '';
    $('sg-count').textContent = list.length + (list.length === 1 ? ' game' : ' games');
    if (!feed || !feed.games || !Object.keys(feed.games).length) {
      $('sg-body').innerHTML = '<div class="pl-empty"><b>No market lines yet</b>Current lines are pulled about 8 am, noon and 4 pm Pacific.</div>';
      $('sg-foot').textContent = '';
      return;
    }
    if (!list.length) {
      $('sg-body').innerHTML = '<div class="pl-empty"><b>Nothing ' + min + '+ points from the market</b>Try a smaller gap, or check back after the next refresh.</div>';
    } else {
      $('sg-body').innerHTML = '<div class="pl-scroll"><table><thead><tr><th>Game date</th><th>Game</th><th>Take</th><th>Model line</th><th>Gap</th><th>Status</th></tr></thead><tbody>' +
        list.map(function (r) {
          var game = r.neutral ? esc(r.away) + ' vs ' + esc(r.home) + '*' : esc(r.away) + ' @ ' + esc(r.home);
          return '<tr class="pl-row">' +
            '<td data-l="Game date" class="pl-date">' + fmtDate(r.date) + '</td>' +
            '<td data-l="Game">' + game + '</td>' +
            '<td data-l="Take" class="pl-play"><span><b>' + esc(r.side) + '</b> <span class="pl-num">' + line(r.marketLine) + '</span></span></td>' +
            '<td data-l="Model line" class="pl-num">' + esc(r.side) + ' ' + line(r.modelLine) + '</td>' +
            '<td data-l="Gap" class="pl-num"><b>' + r.gap.toFixed(1) + '</b></td>' +
            '<td data-l="Status">' + (r.logged ? 'Logged' : '<span class="pl-none">&mdash;</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    $('sg-foot').textContent = 'Take is the side the model likes at the current ' + PROVIDER + ' number, and Gap is how many points the model line is from it. ' +
      'The model line is the published line, including any adjustment, from the same side. Only games not yet played, today or later, are listed, so check tip times for today.' + when +
      ' This is a list of disagreements with the market, not a recommendation: see Model vs Market for how the model has done when it differs.';
  }

  function json(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  $('sg-gap').innerHTML = GAPS.map(function (n) { return '<option value="' + n + '">' + n + '+ points from the market</option>'; }).join('');
  $('sg-gap').addEventListener('change', function () { if (model) render(); });

  Promise.all([C.load(), json('data/upcoming_lines.json'), json('data/plays.json')]).then(function (res) {
    model = res[0];
    feed = res[1];
    (res[2] || []).forEach(function (p) { if (p && p.gameId) logged[p.gameId] = true; });
    document.addEventListener('cbk-results', render);
    render();
  }).catch(function (err) { console.error(err); });
})();
