// Hypothetical Matchups: any team vs any team, using the same model code as the Schedule page. Nothing is saved.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var site = 'neutral'; // 'a' | 'b' | 'neutral'
  var model, byLower = {};
  function $(id) { return document.getElementById(id); }

  function pick(id) { return byLower[$(id).value.trim().toLowerCase()] || null; }
  function sign1(v) { return (v > 0 ? '+' : '') + v.toFixed(1); }
  function shown(team) { return C.fmtRating(C.roundHalf(model.current[C.teamKey(team)])); }

  function drawSite(A, B) {
    var lab = [['a', A ? A + ' home' : 'Team A home'], ['b', B ? B + ' home' : 'Team B home'], ['neutral', 'Neutral site']];
    var html = lab.map(function (l) {
      return '<button type="button" class="mu-btn' + (site === l[0] ? ' on' : '') + '" data-site="' + l[0] + '" aria-pressed="' + (site === l[0]) + '">' + esc(l[1]) + '</button>';
    }).join('');
    // Rewriting identical markup would swallow a click that is mid-flight when the input blurs.
    if ($('mu-site').innerHTML !== html) $('mu-site').innerHTML = html;
  }

  function render() {
    var A = pick('mu-a'), B = pick('mu-b'), out = $('mu-res');
    drawSite(A, B);
    if (!A || !B) {
      var bad = [];
      if ($('mu-a').value.trim() && !A) bad.push($('mu-a').value.trim());
      if ($('mu-b').value.trim() && !B) bad.push($('mu-b').value.trim());
      out.innerHTML = '<div class="mu-msg">' + (bad.length
        ? 'No team named ' + bad.map(function (x) { return '&ldquo;' + esc(x) + '&rdquo;'; }).join(' or ') + '. Pick from the list.'
        : 'Choose two teams.') + '</div>';
      return;
    }
    if (A === B) { out.innerHTML = '<div class="mu-msg">Pick two different teams.</div>'; return; }
    var g = site === 'b' ? { home: B, away: A, neutral: false } : site === 'a' ? { home: A, away: B, neutral: false } : { home: A, away: B, neutral: true };
    var spread = model.homeSpread(g), wp = model.winProb(g);
    if (spread === null || !wp) { out.innerHTML = '<div class="mu-msg">One of these teams has no rating yet.</div>'; return; }
    var lineTxt = spread === 0 ? 'PK' : esc(spread > 0 ? g.home : g.away) + ' -' + Math.abs(spread).toFixed(1);
    var hca = g.neutral ? 0 : model.byName[g.home].home_court;
    var ex = wp.margin;
    var siteTxt = g.neutral ? 'Neutral site' : esc(g.home) + ' home';
    function row(n, p) {
      return '<div class="mu-pr"><span class="nm">' + esc(n) + '</span><span class="bar"><i style="width:' + (p * 100).toFixed(1) +
        '%"></i></span><span class="pc">' + C.fmtPct(p) + '</span></div>';
    }
    var exFav = ex >= 0 ? g.home : g.away;
    var exTxt = Math.abs(ex).toFixed(1) === '0.0' ? 'even' : esc(exFav) + ' by ' + Math.abs(ex).toFixed(1);
    out.innerHTML =
      '<div class="mu-line">' + lineTxt + '</div>' +
      '<div class="mu-sub">' + siteTxt + ' &middot; ' + esc(A) + ' (' + esc(model.byName[A].conference) + ') vs ' + esc(B) + ' (' + esc(model.byName[B].conference) + ')</div>' +
      '<div class="mu-prob">' + row(A, g.home === A ? wp.home : wp.away) + row(B, g.home === B ? wp.home : wp.away) + '</div>' +
      '<table class="mu-tb">' +
      '<tr><td>' + esc(g.home) + ' rating</td><td>' + shown(g.home) + '</td></tr>' +
      '<tr><td>' + (g.neutral ? 'Home court (neutral site)' : esc(g.home) + ' home-court value') + '</td><td>' + (g.neutral ? '0' : sign1(hca)) + '</td></tr>' +
      '<tr><td>' + esc(g.away) + ' rating</td><td>' + shown(g.away) + '</td></tr>' +
      '<tr><td>Exact margin (unrounded ratings)</td><td>' + exTxt + '</td></tr>' +
      '</table>';
  }

  C.load().then(function (m) {
    model = m;
    var names = m.teams.map(function (t) { return t.team; }).sort(function (x, y) { return x.localeCompare(y); });
    names.forEach(function (n) { byLower[n.toLowerCase()] = n; });
    $('mu-dl').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(m.byName[n].conference) + '</option>'; }).join('');
    ['input', 'change'].forEach(function (ev) { $('mu-a').addEventListener(ev, render); $('mu-b').addEventListener(ev, render); });
    $('mu-swap').addEventListener('click', function () {
      var t = $('mu-a').value; $('mu-a').value = $('mu-b').value; $('mu-b').value = t;
      if (site !== 'neutral') site = site === 'a' ? 'b' : 'a';
      render();
    });
    $('mu-site').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-site]');
      if (!b) return;
      site = b.dataset.site;
      render();
    });
    document.addEventListener('cbk-results', render);
    render();
  }).catch(function () { $('load-error').hidden = false; });
})();
