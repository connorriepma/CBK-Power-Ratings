// Schedule page: one day at a time, with spreads and win probabilities.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var Store = window.CBKStore;
  var Games = window.CBKGames;
  var model, dates = [], dayIndex = 0, entryMode = false;

  var daySelect = document.getElementById('day-select');
  var confFilter = document.getElementById('conf-filter');
  var confOnly = document.getElementById('conf-only');
  var prevBtn = document.getElementById('day-prev');
  var nextBtn = document.getElementById('day-next');
  var master = document.getElementById('schedule-master');
  var toggle = document.getElementById('entry-toggle');
  var signOut = document.getElementById('owner-signout');
  var entryNote = document.getElementById('entry-note');
  var panel = document.getElementById('owner-panel');
  var gamesById = {};

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

  function lineHTML(g) { return Games.lineHTML(model, g); }
  function probHTML(g) { return Games.probHTML(model, g); }

  function gameRowHTML(g) {
    return '<div class="g-row no-date has-prob">' +
      '<div class="g-tag ' + (g.conf ? '' : 'nc') + '">' + esc(model.confTag(g)) + '</div>' +
      '<div class="g-opp">' + matchupHTML(g) + '</div>' +
      lineHTML(g) + probHTML(g) + '</div>';
  }

  function matchupHTML(g) {
    var site = g.neutral && g.site ? ' <span class="g-site">' + esc(g.site) + '</span>' : '';
    var m = g.neutral ? esc(g.away) + ' vs ' + esc(g.home) + '*' + (model.hcaMod(g).length ? '&Dagger;' : '') + site : esc(g.away) + ' @ ' + esc(g.home) + (model.hcaMod(g).length ? '&Dagger;' : '');
    return g.dateTbd ? m + ' <span class="g-site">Date TBA</span>' : m;
  }

  function entryRowHTML(g) {
    var r = g.result;
    function input(label, v) {
      return '<input class="sc-in" type="text" inputmode="numeric" maxlength="3" autocomplete="off" aria-label="' +
        esc(label) + ' score" value="' + (r ? v : '') + '">';
    }
    return '<div class="g-row no-date entry">' +
      '<div class="g-tag ' + (g.conf ? '' : 'nc') + '">' + esc(model.confTag(g)) + '</div>' +
      '<div class="g-opp">' + matchupHTML(g) + '</div>' +
      '<div class="g-entry" data-gid="' + esc(g.id) + '">' + input(g.away, r && r.away) +
      '<span class="sc-at">' + (g.neutral ? 'vs' : '@') + '</span>' + input(g.home, r && r.home) +
      '<span class="sc-ok" aria-live="polite"></span></div></div>';
  }

  // Footnote for games that carry a modified home court (hcaMod in schedule.json).
  function hcaNote(dayGames) {
    var seen = {}, out = [];
    dayGames.forEach(function (g) {
      model.hcaMod(g).forEach(function (m) {
        var t = m.team + ' ' + Math.round(m.pct * 100) + '% of its home court (+' + (Math.round(m.pts * 100) / 100) + ' pts)';
        if (!seen[t]) { seen[t] = 1; out.push(t); }
      });
    });
    return out.length ? '<div class="g-footnote">&Dagger; modified HCA: ' + out.map(esc).join('; ') + '</div>' : '';
  }

  function dayHTML(date, dayGames) {
    var n = dayGames.length;
    if (entryMode) {
      return '<div class="day-group">' +
        '<div class="day-header">' + fmtDayHeader(date) + ' &middot; ' + n + ' game' + (n === 1 ? '' : 's') + '</div>' +
        '<div class="schedule-list">' + dayGames.map(entryRowHTML).join('') + '</div>' +
        '<div class="g-footnote">* designates neutral site &middot; scores are entered away first, then home</div>' + hcaNote(dayGames) + '</div>';
    }
    return '<div class="day-group">' +
      '<div class="day-header">' + fmtDayHeader(date) + ' &middot; ' + n + ' game' + (n === 1 ? '' : 's') + '</div>' +
      '<div class="schedule-list">' +
      '<div class="g-head day"><div></div><div>Matchup</div><div>Spread / Final</div><div class="r">Win % (away / home)</div></div>' +
      dayGames.map(gameRowHTML).join('') + '</div>' +
      '<div class="g-footnote">* designates neutral site &middot; line shown is the home team&rsquo;s</div>' + hcaNote(dayGames) +
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

  // ---- Owner-only score entry ----
  function setNote(text, isError) {
    entryNote.textContent = text;
    entryNote.className = 'entry-note' + (isError ? ' err' : '');
  }

  function errorText(err) {
    if (err.status === 401) return 'GitHub rejected the token. Sign out and add a new one.';
    if (err.status === 403 || err.status === 404) return 'The token cannot write to this repo. It needs Contents: Read and write on CBK-Power-Ratings.';
    if (err.status === 422) return 'GitHub could not save this change. Reload the page and try again.';
    return 'Could not save: ' + err.message;
  }

  function activate(rows) {
    model.setResults(rows);
    entryMode = true;
    toggle.classList.add('on');
    toggle.textContent = 'Done';
    signOut.hidden = false;
    setNote('Scores save to GitHub as you enter them and appear on the public site within a couple of minutes.', false);
    renderDay(dayIndex);
  }

  function exitEntry() {
    entryMode = false;
    toggle.classList.remove('on');
    toggle.textContent = 'Enter scores';
    signOut.hidden = true;
    setNote('', false);
    renderDay(dayIndex);
  }

  function showPanel(message) {
    panel.hidden = false;
    document.getElementById('owner-msg').textContent = message || '';
    document.getElementById('token-input').focus();
  }

  function startEntry() {
    if (!Store.getToken()) { showPanel(); return; }
    setNote('Loading the latest results from GitHub\u2026', false);
    Store.refresh().then(activate).catch(function (err) {
      if (err.status === 401) Store.clearToken();
      setNote('', false);
      showPanel(err.status === 401 ? 'GitHub rejected the token.' : errorText(err));
    });
  }

  function saveToken() {
    var input = document.getElementById('token-input');
    var value = input.value.trim();
    if (!value) return;
    Store.setToken(value);
    document.getElementById('owner-msg').textContent = 'Checking the token\u2026';
    Store.refresh().then(function (rows) {
      input.value = '';
      panel.hidden = true;
      activate(rows);
    }).catch(function (err) {
      Store.clearToken();
      document.getElementById('owner-msg').textContent =
        err.status === 401 ? 'GitHub rejected that token.' : errorText(err);
    });
  }

  function parseScore(v) {
    v = v.trim();
    if (v === '') return null;
    return /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  }

  function lockedLine(g) {
    var s = model.homeSpread(g);            // home margin: positive means the home team is favored
    return s === null ? null : (s === 0 ? 0 : -s);
  }

  function existingResult(g) {
    var hk = C.teamKey(g.home), ak = C.teamKey(g.away);
    return model.results.filter(function (r) {
      return r.date === g.date && r.home === hk && r.away === ak;
    })[0];
  }

  function onScoreChange(e) {
    var input = e.target;
    if (!input.classList || !input.classList.contains('sc-in')) return;
    var wrap = input.closest('.g-entry');
    var g = gamesById[wrap.getAttribute('data-gid')];
    var fields = wrap.querySelectorAll('.sc-in');
    var mark = wrap.querySelector('.sc-ok');
    var away = parseScore(fields[0].value), home = parseScore(fields[1].value);
    var hk = C.teamKey(g.home), ak = C.teamKey(g.away);
    var label = g.away + ' @ ' + g.home + ' (' + g.date + ')';

    function done(rows) { model.setResults(rows); mark.textContent = '\u2713'; mark.title = 'Saved'; setNote('', false); }
    function failed(err) { mark.textContent = '!'; mark.title = errorText(err); setNote(errorText(err), true); }

    if (away === null && home === null) {
      if (!g.result) { mark.textContent = ''; return; }
      mark.textContent = '\u2026';
      Store.remove(g.date, hk, ak, 'Remove result: ' + label).then(done, failed);
      return;
    }
    if (away === null || home === null) { mark.textContent = ''; setNote('Enter both scores to save this game.', false); return; }
    if (isNaN(away) || isNaN(home)) { mark.textContent = '!'; setNote('Scores must be whole numbers.', true); return; }
    if (away === home) { mark.textContent = '!'; setNote('A basketball game cannot end in a tie.', true); return; }

    var existing = existingResult(g);
    var entry = {
      date: g.date, home: hk, away: ak, neutral: !!g.neutral,
      homeScore: home, awayScore: away,
      line: existing && 'line' in existing ? existing.line : lockedLine(g),
      ts: new Date().toISOString()
    };
    mark.textContent = '\u2026';
    Store.upsert(entry, 'Result: ' + g.away + ' ' + away + ', ' + g.home + ' ' + home + ' (' + g.date + ')').then(done, failed);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  C.load().then(function (m) {
    model = m;
    model.games.forEach(function (g) { gamesById[g.id] = g; });

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

    toggle.addEventListener('click', function () { if (entryMode) exitEntry(); else startEntry(); });
    signOut.addEventListener('click', function () { Store.clearToken(); exitEntry(); });
    master.addEventListener('change', onScoreChange);
    document.getElementById('token-save').addEventListener('click', saveToken);
    document.getElementById('token-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveToken(); });
    document.getElementById('token-cancel').addEventListener('click', function () { panel.hidden = true; });
    // The entry button is shown only to the owner: a saved token, or the #owner link for first-time setup.
    toggle.hidden = !(Store.getToken() || location.hash === '#owner');

    rebuildDates(todayISO());
  }).catch(function (err) {
    console.error(err);
    document.getElementById('load-error').hidden = false;
  });
})();
