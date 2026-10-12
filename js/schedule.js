// Schedule page: one day at a time, with spreads and win probabilities.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var model, dates = [], dayIndex = 0;

  var daySelect = document.getElementById('day-select');
  var confFilter = document.getElementById('conf-filter');
  var confOnly = document.getElementById('conf-only');
  var prevBtn = document.getElementById('day-prev');
  var nextBtn = document.getElementById('day-next');
  var master = document.getElementById('schedule-master');

  function fmtDayHeader(iso) {
    return C.parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function fmtDayOption(iso) {
    return C.parseDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function confOf(name) {
    var t = model.byName[name];
    return t ? t.conference : null;
  }

  function filteredGames() {
    var c = confFilter.value;
    return model.games.filter(function (g) {
      if (confOnly.checked && !g.conf) return false;
      if (!c) return true;
      return confOf(g.home) === c || confOf(g.away) === c;
    });
  }

  function lineHTML(g) {
    if (g.result) {
      var homeWon = g.result.home > g.result.away;
      var win = homeWon ? g.home : g.away, winPts = homeWon ? g.result.home : g.result.away;
      var lose = homeWon ? g.away : g.home, losePts = homeWon ? g.result.away : g.result.home;
      return '<div class="g-line final">Final &middot; ' + esc(win) + ' ' + winPts + ', ' + esc(lose) + ' ' + losePts + '</div>';
    }
    var spread = model.homeSpread(g);
    if (spread === null) return '<div class="g-line none">&mdash;</div>';
    if (spread === 0) return '<div class="g-line pk" title="Exact line: PK (0.00)">PK</div>';
    var m = model.exactMargin(g);
    var fav = spread > 0 ? g.home : g.away;
    var tip = 'Exact line: ' + (m > 0 ? g.home : g.away) + ' -' + Math.abs(m).toFixed(2);
    return '<div class="g-line fav" title="' + esc(tip) + '">' + esc(fav) + ' -' + Math.abs(spread).toFixed(1) + '</div>';
  }

  function probHTML(g) {
    if (g.result) return '<div class="g-prob"></div>';
    var wp = model.winProb(g);
    if (!wp) {
      var nh = g.home === C.NON_D1, na = g.away === C.NON_D1;
      if (nh === na) return '<div class="g-prob"></div>';
      return '<div class="g-prob" title="Non D1 opponent: counted as a win">' +
        '<span class="' + (nh ? 'g-fav' : '') + '">' + (nh ? '&gt;99%' : '&lt;1%') + '</span> / ' +
        '<span class="' + (na ? 'g-fav' : '') + '">' + (na ? '&gt;99%' : '&lt;1%') + '</span></div>';
    }
    var tie = Math.abs(wp.home - wp.away) < 1e-9, homeFav = wp.home > wp.away;
    var exact = 'Exact: ' + (wp.away * 100).toFixed(1) + '% / ' + (wp.home * 100).toFixed(1) + '%';
    return '<div class="g-prob" title="' + exact + '">' +
      '<span class="' + (!tie && !homeFav ? 'g-fav' : '') + '">' + C.fmtPct(wp.away) + '</span> / ' +
      '<span class="' + (!tie && homeFav ? 'g-fav' : '') + '">' + C.fmtPct(wp.home) + '</span></div>';
  }

  function gameRowHTML(g) {
    var site = g.neutral && g.site ? ' <span class="g-site">' + esc(g.site) + '</span>' : '';
    var matchup = g.neutral
      ? esc(g.away) + ' vs ' + esc(g.home) + '*' + site
      : esc(g.away) + ' @ ' + esc(g.home);
    if (g.dateTbd) matchup += ' <span class="g-site">Date TBA</span>';
    return '<div class="g-row no-date has-prob">' +
      '<div class="g-tag ' + (g.conf ? '' : 'nc') + '">' + esc(model.confTag(g)) + '</div>' +
      '<div class="g-opp">' + matchup + '</div>' +
      lineHTML(g) + probHTML(g) + '</div>';
  }

  function dayHTML(date, dayGames) {
    var n = dayGames.length;
    return '<div class="day-group">' +
      '<div class="day-header">' + fmtDayHeader(date) + ' &middot; ' + n + ' game' + (n === 1 ? '' : 's') + '</div>' +
      '<div class="schedule-list">' +
      '<div class="g-head day"><div></div><div>Matchup</div><div>Spread / Final</div><div class="r">Win % (away / home)</div></div>' +
      dayGames.map(gameRowHTML).join('') + '</div>' +
      '<div class="g-footnote">* designates neutral site &middot; line shown is the home team&rsquo;s</div>' +
      '<div class="g-footnote">Win % comes from the predicted margin: a typical game lands about ' + C.SIGMA +
      ' points away from it. The spread is the exact predicted margin rounded to the nearest 0.5, so win % and spread agree. Hover a spread to see the exact line.</div>' +
      '</div>';
  }

  function renderDay(index) {
    if (!dates.length) {
      master.innerHTML = '<div class="schedule-empty">No games match this filter</div>';
      prevBtn.disabled = nextBtn.disabled = true;
      return;
    }
    dayIndex = Math.max(0, Math.min(dates.length - 1, index));
    var date = dates[dayIndex];
    var dayGames = filteredGames()
      .filter(function (g) { return g.date === date; })
      .sort(function (a, b) { return a.home.localeCompare(b.home); });
    master.innerHTML = dayHTML(date, dayGames);
    daySelect.value = String(dayIndex);
    prevBtn.disabled = dayIndex === 0;
    nextBtn.disabled = dayIndex === dates.length - 1;
  }

  // Rebuild the date list for the current filters, keeping the same day (or the next day with games).
  function rebuildDates(keepDate) {
    var games = filteredGames();
    var seen = {};
    dates = games.map(function (g) { return g.date; })
      .filter(function (d) { return seen[d] ? false : (seen[d] = true); })
      .sort();
    daySelect.innerHTML = dates.map(function (d, i) {
      return '<option value="' + i + '">' + fmtDayOption(d) + '</option>';
    }).join('');
    var idx = 0;
    if (keepDate) {
      var k = dates.findIndex(function (d) { return d >= keepDate; });
      idx = k === -1 ? dates.length - 1 : k;
    }
    document.getElementById('schedule-count').textContent =
      games.length === model.games.length
        ? model.games.length + ' games loaded'
        : games.length + ' of ' + model.games.length + ' games';
    renderDay(idx);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  C.load().then(function (m) {
    model = m;

    var confs = {};
    model.games.forEach(function (g) {
      [g.home, g.away].forEach(function (n) { var c = confOf(n); if (c) confs[c] = true; });
    });
    confFilter.innerHTML = '<option value="">All Conferences</option>' +
      Object.keys(confs).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');

    daySelect.addEventListener('change', function () { renderDay(Number(daySelect.value)); });
    prevBtn.addEventListener('click', function () { renderDay(dayIndex - 1); });
    nextBtn.addEventListener('click', function () { renderDay(dayIndex + 1); });
    confFilter.addEventListener('change', function () { rebuildDates(dates[dayIndex]); });
    confOnly.addEventListener('change', function () { rebuildDates(dates[dayIndex]); });

    rebuildDates(todayISO());
  }).catch(function (err) {
    console.error(err);
    document.getElementById('load-error').hidden = false;
  });
})();
