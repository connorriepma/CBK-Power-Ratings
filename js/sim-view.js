// Rendering for the three simulation pages. Which page it is comes from <body data-sim="wins|odds|champ">.
(function () {
  'use strict';

  var C = window.CBK, S = window.CBKSim, esc = C.esc;
  var SIM = S.SIM, CH = S.CH;
  var mode = document.body.getAttribute('data-sim');
  var model = null;
  function $(id) { return document.getElementById(id); }

  // Odds to two decimals (0.01% = one simulated season in 10,000).
  function pct2(p) { return p <= 0 ? '0.00%' : p < 0.00005 ? '&lt;0.01%' : (p * 100).toFixed(2) + '%'; }
  function wl(w, l) { return w.toFixed(1) + '-' + l.toFixed(1); }
  function range(lo, hi) { return lo === hi ? String(lo) : lo + '&ndash;' + hi; }
  function ordered(confs) {
    function rank(c) { var i = S.CONF_ORDER.indexOf(c.name); return i < 0 ? 999 : i; }
    return confs.slice().sort(function (a, b) { return rank(a) - rank(b); });
  }

  function shiftText() {
    return SIM.TAU > 0
      ? 'Ratings are estimates, so every simulated season first shifts each team’s strength by a random amount (standard deviation ' + SIM.TAU + ' rating points); games are then played independently, so the numbers are still a bit more confident than real life.'
      : 'Ratings are held fixed for the rest of the season and games are treated as independent, which makes these numbers a bit more confident than real life.';
  }
  function warnChip(c) { return c.comp.warn ? '<span class="sim-warn" title="' + esc(c.comp.msg) + '">&#9888; Schedule incomplete</span>' : ''; }
  function confHead(c) { return '<div class="sim-confhead"><div class="conf-strip">' + esc(c.name) + '</div>' + warnChip(c) + '</div>'; }
  function warnBox(c) {
    return c.comp.warn ? '<div class="sim-warnbox">&#9888; ' + esc(c.comp.msg) + ' (' + c.comp.loaded + ' of ' +
      (c.comp.expected !== undefined ? c.comp.expected * c.rows.length / 2 : '?') + ' loaded.)</div>' : '';
  }
  function metaLine(m) {
    return m.runs.toLocaleString() + ' simulated seasons &middot; fixed seed ' + m.seed + ' &middot; strength shift sd ' + m.tau + ' &middot; ' +
      m.simGames.toLocaleString() + ' unplayed games simulated, ' + m.played.toLocaleString() + ' played. ' + m.tbd +
      ' bracket games are not simulated' + (m.excluded ? '; ' + m.excluded + ' games with an unrated opponent left out' : '') + '. Computed in ' + Math.round(m.ms) + ' ms.';
  }

  function allTeamsHTML(m) {
    var all = [];
    m.confs.forEach(function (c) { c.rows.forEach(function (r) { all.push({ r: r, conf: c.name }); }); });
    all.sort(function (a, b) { return b.r.oW - a.r.oW || b.r.exact - a.r.exact || a.r.team.localeCompare(b.r.team); });
    var warn = m.confs.filter(function (c) { return c.comp.warn; }).map(function (c) { return c.name; });
    var rows = all.map(function (x, i) {
      return '<tr><td class="rk">' + (i + 1) + '</td><td>' + esc(x.r.team) + '</td><td class="sim-cf">' + esc(x.conf) + '</td>' +
        '<td class="num sim-tip" title="Overall wins, 10th to 90th percentile: ' + range(x.r.oLo, x.r.oHi).replace('&ndash;', ' to ') + '"><b>' + wl(x.r.oW, x.r.oL) + '</b></td>' +
        '<td class="num sim-rt">' + x.r.rating + '</td></tr>';
    }).join('');
    return '<section class="sim-conf"><div class="sim-confhead"><div class="conf-strip">All Teams</div></div>' +
      (warn.length ? '<div class="sim-warnbox">&#9888; Incomplete schedule data in: ' + esc(warn.join(', ')) + '. Their win totals are less reliable.</div>' : '') +
      '<div class="sim-scroll"><table class="sim-table sim-wins"><thead><tr><th class="rk">#</th><th>Team</th><th>Conference</th><th class="num">Overall W-L</th><th class="num sim-rt">Rating</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></section>';
  }

  function winsHTML(m, filter) {
    if (filter === '__all') return allTeamsHTML(m);
    return ordered(m.confs).filter(function (c) { return !filter || c.name === filter; }).map(function (c) {
      var rows = c.rows.slice().sort(function (a, b) { return b.cW - a.cW || b.oW - a.oW || a.team.localeCompare(b.team); }).map(function (r, i) {
        return '<tr><td class="rk">' + (i + 1) + '</td><td>' + esc(r.team) + '</td>' +
          '<td class="num sim-tip" title="Conference wins, 10th to 90th percentile: ' + range(r.cLo, r.cHi).replace('&ndash;', ' to ') + '"><b>' + wl(r.cW, r.cL) + '</b></td>' +
          '<td class="num sim-tip" title="Overall wins, 10th to 90th percentile: ' + range(r.oLo, r.oHi).replace('&ndash;', ' to ') + '"><b>' + wl(r.oW, r.oL) + '</b></td>' +
          '<td class="num sim-rt">' + r.rating + '</td></tr>';
      }).join('');
      return '<section class="sim-conf">' + confHead(c) + warnBox(c) + '<div class="sim-scroll"><table class="sim-table sim-wins"><thead><tr>' +
        '<th class="rk">#</th><th>Team</th><th class="num">Conference W-L</th><th class="num">Overall W-L</th><th class="num sim-rt">Rating</th></tr></thead><tbody>' +
        rows + '</tbody></table></div></section>';
    }).join('');
  }

  function oddsHTML(m, filter) {
    return ordered(m.confs).filter(function (c) { return !filter || c.name === filter; }).map(function (c) {
      var top = Math.max.apply(null, c.rows.map(function (r) { return r.odds; })) || 1;
      var rows = c.rows.slice().sort(function (a, b) { return b.odds - a.odds || b.exact - a.exact || a.team.localeCompare(b.team); }).map(function (r, i) {
        return '<tr><td class="rk">' + (i + 1) + '</td><td>' + esc(r.team) + '</td>' +
          '<td class="num sim-oddscell"><span class="sim-bar" style="width:' + (r.odds / top * 100).toFixed(1) + '%"></span><b>' + pct2(r.odds) + '</b></td></tr>';
      }).join('');
      return '<section class="sim-conf">' + confHead(c) + warnBox(c) + '<div class="sim-scroll"><table class="sim-table"><thead><tr>' +
        '<th class="rk">#</th><th>Team</th><th class="num">Regular-season title odds</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }).join('');
  }

  function pctText(p) { return (Math.round(p * 100 * 100) / 100) + '%'; }
  function champExplain(nC) {
    var field = nC + CH.AT_LARGE;
    var ex = Object.keys(CH.TOURN).filter(function (c) { return CH.TOURN[c].n; }).map(function (c) { return c + ' ' + CH.TOURN[c].n; });
    var shift = SIM.TAU > 0
      ? 'Ratings are estimates, so every simulated season first shifts each team’s strength by a random amount (standard deviation ' + SIM.TAU + ' rating points), the same shift for the regular season and the postseason. Games are then played independently, so the odds are still somewhat more confident than real life and lean toward the top teams.'
      : 'Ratings are held fixed for the whole season and games are independent, so the odds are more confident than real life and pile up in the top teams.';
    var form = CH.FORM_K > 0 ? ', ranked by strength plus ' + CH.FORM_K + ' rating points for every game won above expectation that season' : ', ranked by rating';
    return '<p>Each of ' + CH.RUNS.toLocaleString() + ' simulated seasons plays out every unplayed game with the same win chances as the Projected Wins page, then plays a tournament in every conference, builds the field of ' + field +
      ' teams and plays the NCAA tournament to a champion. Each percentage is the share of simulated seasons in which that happened. The NCAA grows the field from 68 to 76 teams starting with the 2027 tournament.</p>' +
      '<p><b>What this simplifies.</b> ' + shift + ' Conference tournaments are generic: single elimination at neutral sites, every team in the conference plays' + (ex.length ? ' except where noted (' + ex.join(', ') + ' teams)' : '') +
      ', seeded by simulated conference record with ties broken at random. The ' + nC + ' conference tournament winners take the automatic bids. The best ' + CH.AT_LARGE + ' other teams take the at-large bids' + form +
      '; this is not the selection committee’s process. The ' + CH.PLAYIN_AUTO + ' lowest automatic and ' + CH.PLAYIN_AL + ' lowest at-large teams play an Opening Round (automatic against automatic, at-large against at-large) and the 64 survivors are seeded by that same score into four regions. Same-conference matchups and geography are ignored, and every tournament game is at a neutral site.</p>' +
      '<p><b>Reading the table.</b> Make Field is the chance of being one of the ' + field + ' teams. Round of 64 is the chance of getting into the 64-team bracket, which differs from Make Field only for teams that could land in the Opening Round. Teams show only if their chance of reaching the round of 64 is at least ' + pctText(CH.SHOW_R64) + '.</p>';
  }

  function champHTML(m) {
    var warned = Object.keys(m.comp).filter(function (c) { return m.comp[c].warn; });
    var rows = m.rows.slice().sort(function (a, b) {
      return b.title - a.title || b.final - a.final || b.field - a.field || b.exact - a.exact || a.team.localeCompare(b.team);
    });
    var shown = rows.filter(function (r) { return r.r64 >= CH.SHOW_R64; }), hidden = rows.length - shown.length;
    var note = warned.length ? '<div class="sim-warnbox">&#9888; Schedule incomplete in ' + warned.map(esc).join(' and ') +
      ': conference games are missing from the site, so those conferences’ champions, and the odds of their teams, are unreliable. Their teams are marked &#9888;.</div>' : '';
    var body = shown.map(function (r, i) {
      function p(x) { return '<td class="num">' + pct2(x) + '</td>'; }
      return '<tr><td class="rk">' + (i + 1) + '</td><td>' + esc(r.team) + (r.warn ? ' <span class="sim-warn sim-warn-sm" title="' + esc(r.warn) + '">&#9888;</span>' : '') +
        '</td><td class="champ-conf">' + esc(r.conf) + '</td><td class="num">' + r.rating + '</td>' +
        p(r.field) + p(r.r64) + p(r.r32) + p(r.s16) + p(r.e8) + p(r.f4) + p(r.final) + '<td class="num champ-title"><b>' + pct2(r.title) + '</b></td></tr>';
    }).join('');
    return note + '<div class="sim-scroll"><table class="sim-table champ-table"><thead><tr><th class="rk">#</th><th>Team</th><th>Conference</th><th class="num">Rating</th><th class="num">Make Field</th><th class="num">Round of 64</th><th class="num">Round of 32</th><th class="num">Sweet 16</th><th class="num">Elite Eight</th><th class="num">Final Four</th><th class="num">Title Game</th><th class="num">Title</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="sim-meta">All other ' + hidden + ' teams: round of 64 chance under ' + pctText(CH.SHOW_R64) + '. They still count in every total.</div>';
  }
  function champMeta(m) {
    return m.runs.toLocaleString() + ' simulated seasons &middot; strength shift sd ' + m.tau + ' &middot; ' + m.formK + ' per extra win &middot; regular season on seed ' + m.seed1 +
      ' (same stream as the other simulation pages) &middot; conference and NCAA tournaments on seed ' + m.seed2 + ' &middot; ' + m.tbd + ' bracket games not simulated &middot; computed in ' + Math.round(m.ms) + ' ms';
  }

  function paint() {
    if (mode === 'champ') {
      var nC = model.teams.reduce(function (a, t) { if (a.indexOf(t.conference) < 0) a.push(t.conference); return a; }, []).length;
      $('ex-champ').innerHTML = champExplain(nC);
      var bad = S.champCheckSettings(nC);
      if (bad) { $('champ-body').innerHTML = '<div class="sim-warnbox">' + esc(bad) + '</div>'; $('champ-meta').innerHTML = ''; return; }
      var cm = S.champModel(model);
      $('champ-body').innerHTML = champHTML(cm);
      $('champ-meta').innerHTML = champMeta(cm.meta);
      return;
    }
    var m = S.simModel(model), f = $('filter');
    var warned = {};
    m.confs.forEach(function (c) { if (c.comp.warn) warned[c.name] = true; });
    Array.prototype.forEach.call(f.options, function (o) {
      if (o.value && o.value !== '__all') o.textContent = o.value + (warned[o.value] ? ' ⚠' : '');
    });
    $('sim-body').innerHTML = mode === 'wins' ? winsHTML(m, f.value) : oddsHTML(m, f.value);
    $('sim-meta').innerHTML = metaLine(m.meta);
  }

  var timer = null;
  function show() {
    // Paint the "running" message first so the page does not look frozen while 10,000 seasons are simulated.
    var body = mode === 'champ' ? $('champ-body') : $('sim-body');
    body.innerHTML = '<div class="sim-empty">Running ' + (mode === 'champ' ? CH.RUNS : SIM.RUNS).toLocaleString() + ' simulated seasons&hellip;</div>';
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { paint(); } catch (e) { body.innerHTML = '<div class="sim-empty">The simulation could not run.</div>'; if (window.console) console.error(e); }
    }, 30);
  }

  C.load().then(function (m) {
    model = m;
    if (mode !== 'champ') {
      var f = $('filter');
      var confs = ordered(m.teams.reduce(function (a, t) { if (a.indexOf(t.conference) < 0) a.push(t.conference); return a; }, []).map(function (n) { return { name: n }; }));
      f.innerHTML = '<option value="">All Conferences</option>' + confs.map(function (c) { return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>'; }).join('') +
        (mode === 'wins' ? '<option value="__all">All Teams (ranked by wins)</option>' : '');
      f.addEventListener('change', function () { try { paint(); } catch (e) { /* keep the page usable */ } });
      $('ex-sim').innerHTML = mode === 'wins'
        ? '<p>Each unplayed game is played out ' + SIM.RUNS.toLocaleString() + ' times using the Schedule page’s win chances. ' + shiftText() + ' Played games keep their real result, unplayed non-D1 games count as wins, and bracket games with no known opponent are left out of the totals. Hover a record to see the range of wins (10th to 90th percentile) across the simulated seasons. Ties for first split title credit (see Conference Title Odds).</p>'
        : '<p>Every unplayed game is played out ' + SIM.RUNS.toLocaleString() + ' times using the same win chances shown on the Schedule page. ' + shiftText() + ' Games already played keep their real result. Unplayed games against non-D1 opponents count as wins. Bracket and event games with no known opponent are not simulated, so overall win totals leave them out.</p>' +
          '<p>Odds are the share of simulated seasons in which a team finishes first in its conference in the regular season. There is no tiebreaker: if teams tie for first, each gets an equal share of that season, so the odds in a conference add up to 100%. This is the regular-season title only, not the conference tournament or the NCAA tournament. A conference with a warning is missing games and its odds are unreliable.</p>';
    }
    show();
    document.addEventListener('cbk-results', show);
  }).catch(function () { $('load-error').hidden = false; });
})();
