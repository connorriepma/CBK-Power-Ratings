// Model vs Market page: the model's published line against the market closing line (data/market_lines.json) on every
// finished game that has one. Read-only. It never changes a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var M = window.CBKMissesMath;
  var X = window.CBKMarketMath;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PROVIDER = 'Draft Kings';

  var model, market = {}, rows = [];
  function lookup(e) { return model.buyGame({ date: e.date, home: e.home, away: e.away }); }
  function $(id) { return document.getElementById(id); }
  function fmtDate(iso) { var p = iso.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]); }
  function sgn(x, d) { var t = Math.abs(x).toFixed(d == null ? 1 : d); return (+t === 0 ? '' : x > 0 ? '+' : '−') + t; }
  function pct(x) { return x === null ? '&mdash;' : (x * 100).toFixed(1) + '%'; }
  function f2(x) { return x === null ? '&mdash;' : x.toFixed(2); }
  function rec(a) { return a.w + '-' + a.l + (a.p ? '-' + a.p : ''); }

  function table(head, body) {
    return '<div class="ms-scroll"><table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function td(label, cls, html) { return '<td data-l="' + label + '" class="' + cls + '">' + html + '</td>'; }

  function render() {
    var games = X.join(rows, market, PROVIDER), st = X.summary(games);
    $('mk-count').textContent = games.length + (games.length === 1 ? ' game with a market line' : ' games with a market line');
    if (!st) {
      $('mk-sum').innerHTML = '';
      $('mk-gap').innerHTML = $('mk-line').innerHTML = $('mk-week').innerHTML = '';
      $('mk-gap').innerHTML = '<div class="ms-empty"><b>No market lines yet</b>Closing lines are saved each morning for finished games.</div>';
      return;
    }
    var far = X.ats(games.filter(function (g) { return Math.abs(g.model - g.market) >= 3; }));
    $('mk-sum').innerHTML =
      '<div><b>' + st.maeModel.toFixed(2) + '</b><span>Model MAE (pts)</span></div>' +
      '<div><b>' + st.maeMarket.toFixed(2) + '</b><span>Market MAE (pts)</span></div>' +
      '<div><b>' + sgn(st.diff, 2) + '</b><span>Model minus market</span></div>' +
      '<div><b>' + pct(far.pct) + '</b><span>Model side ATS, 3+ pt gap (' + rec(far) + ')</span></div>';

    $('mk-gap').innerHTML = table(['Model vs market', 'Games', 'Model MAE', 'Market MAE', 'Model side ATS', 'Win %'],
      X.byGap(games).filter(function (b) { return b.n; }).map(function (b) {
        var label = b.hi === null ? b.lo + '+ pts' : b.lo + '–' + b.hi + ' pts';
        return '<tr>' + td('Model vs market', 'ms-date', label) + td('Games', 'ms-num', b.n) + td('Model MAE', 'ms-num', f2(b.maeModel)) +
          td('Market MAE', 'ms-num', f2(b.maeMarket)) + td('Model side ATS', 'ms-num', rec(b.ats)) + td('Win %', 'ms-num', pct(b.ats.pct)) + '</tr>';
      }).join(''));

    $('mk-line').innerHTML = table(['Market spread', 'Games', 'Model MAE', 'Market MAE', 'Model minus market', 'Avg gap'],
      X.bySpread(games).filter(function (b) { return b.n; }).map(function (b) {
        var label = b.hi === null ? b.lo + '+' : b.lo + '–' + b.hi;
        return '<tr>' + td('Market spread', 'ms-date', label) + td('Games', 'ms-num', b.n) + td('Model MAE', 'ms-num', f2(b.maeModel)) +
          td('Market MAE', 'ms-num', f2(b.maeMarket)) + td('Model minus market', 'ms-num', sgn(b.maeModel - b.maeMarket, 2)) +
          td('Avg gap', 'ms-num', b.avgGap.toFixed(1)) + '</tr>';
      }).join(''));

    $('mk-week').innerHTML = table(['Week of', 'Games', 'Model MAE', 'Market MAE', 'Model minus market'],
      X.byWeek(games).slice().reverse().map(function (w) {
        return '<tr>' + td('Week of', 'ms-date', fmtDate(w.week)) + td('Games', 'ms-num', w.n) + td('Model MAE', 'ms-num', w.maeModel.toFixed(2)) +
          td('Market MAE', 'ms-num', w.maeMarket.toFixed(2)) + td('Model minus market', 'ms-num', sgn(w.diff, 2)) + '</tr>';
      }).join(''));

    $('mk-foot').textContent = 'Market is the ' + PROVIDER + ' line the API shows for the game after it finished, which is treated as the closing line. ' +
      'Model is the published line going into the game. MAE is the average number of points the final margin landed from each line. ' +
      '“Model side ATS” is how the pick on the model’s side of the market line did against the market line; at -110 it takes about 52.4% to break even. ' +
      'A gap of 3+ points means the model line and market line differ by 3 or more. Only games with a saved market line are counted.';
  }

  Promise.all([
    C.load(),
    fetch('data/market_lines.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
  ]).then(function (res) {
    model = res[0];
    market = res[1] || {};
    rows = M.fromLog(model.log, lookup);
    document.addEventListener('cbk-results', function () { rows = M.fromLog(model.log, lookup); render(); });
    render();
  }).catch(function (err) {
    console.error(err);
    $('load-error').hidden = false;
  });
})();
