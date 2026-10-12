// Plays tab: the owner's hypothetical spread plays. Reads data/plays.json and grades each play against the final
// scores the model already holds from data/results.json. It never touches a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var M = window.CBKPlaysMath;
  var Store = window.CBKStore;
  var esc = C.esc;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CONFIDENCE = ['Low', 'Medium', 'High'];
  var BADGE = {
    win: ['pl-b-win', '✓', 'Win'], loss: ['pl-b-loss', '✕', 'Loss'],
    push: ['pl-b-push', '=', 'Push'], pending: ['pl-b-pend', '○', 'Pending']
  };

  var model, raw = [], rows = [], gamesById = {}, byDate = {}, dates = [];
  var coll = Store.collection('plays.json'), editMode = false, owner, form, addBtn, editingId = null;
  function $(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) : String(iso);
  }
  function todayISO() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function gameLabel(g) { return g.neutral ? g.away + ' vs ' + g.home + '*' : g.away + ' @ ' + g.home; }
  function signed(n) { return (n > 0 ? '+' : '') + String(n); }
  function tone(n) { return n > 0.004 ? 'pos' : n < -0.004 ? 'neg' : ''; }

  function norm(d) {
    if (!d || !d.id || !d.gameId || !d.date || !d.home || !d.away || !d.pick) return null;
    if (typeof d.line !== 'number' || typeof d.odds !== 'number' || typeof d.units !== 'number') return null;
    return {
      id: String(d.id), gameId: String(d.gameId), date: String(d.date), home: String(d.home), away: String(d.away),
      neutral: !!d.neutral, pick: String(d.pick), line: d.line, odds: d.odds, units: d.units,
      book: d.book ? String(d.book) : '', confidence: d.confidence ? String(d.confidence) : '',
      modelLine: typeof d.modelLine === 'number' ? d.modelLine : null, ts: d.ts ? String(d.ts) : ''
    };
  }

  // Attach the grade: the pick's score and the opponent's, win/loss/push against the line, and the units won or lost.
  function evaluate(p) {
    var g = gamesById[p.gameId], r = g && g.result;
    var e = { p: p, result: null, net: null, pickScore: null, oppScore: null, opp: '' };
    if (!r) return e;
    var pk = C.teamKey(p.pick), hk = C.teamKey(g.home), ak = C.teamKey(g.away);
    if (pk !== hk && pk !== ak) return e;
    var homePick = pk === hk;
    e.pickScore = homePick ? r.home : r.away;
    e.oppScore = homePick ? r.away : r.home;
    e.opp = homePick ? g.away : g.home;
    e.result = M.grade(e.pickScore, e.oppScore, p.line);
    e.net = M.net(e.result, p.units, p.odds);
    return e;
  }

  // Your line minus the model's line, both from the side you took. Positive: you got a better number than the model.
  function edgeOf(p) { return p.modelLine === null ? null : p.line - p.modelLine; }

  function filtered() {
    var st = $('pl-status').value, cf = $('pl-conf').value, bk = $('pl-book').value;
    var from = $('pl-from').value, to = $('pl-to').value;
    return rows.map(evaluate).filter(function (e) {
      return (!st || (e.result || 'pending') === st) && (!cf || e.p.confidence === cf) && (!bk || e.p.book === bk) &&
        (!from || e.p.date >= from) && (!to || e.p.date <= to);
    }).sort(function (a, b) {
      var ga = a.result ? 1 : 0, gb = b.result ? 1 : 0;
      if (ga !== gb) return ga - gb;                                      // ungraded plays first
      if (a.p.date !== b.p.date) {
        var older = a.p.date < b.p.date;
        return ga === 0 ? (older ? -1 : 1) : (older ? 1 : -1);            // pending: soonest game first, graded: newest first
      }
      return (b.p.ts || '').localeCompare(a.p.ts || '');
    });
  }

  function summaryHTML(s) {
    function box(val, label, cls) { return '<div><b class="' + (cls || '') + '">' + val + '</b><span>' + label + '</span></div>'; }
    return box(s.w + '-' + s.l + '-' + s.p, 'ATS record (W-L-P)') +
      box(s.winPct === null ? '&mdash;' : M.fmtPct(s.winPct, false), 'Win %') +
      box(M.fmtUnits(s.net, true) + 'u', 'Net units', tone(s.net)) +
      box(s.roi === null ? '&mdash;' : M.fmtPct(s.roi, true), 'ROI', s.roi === null ? '' : tone(s.roi)) +
      box(String(s.pending), 'Pending');
  }

  function rowHTML(e) {
    var p = e.p, b = BADGE[e.result || 'pending'], edge = edgeOf(p);
    var mdl = p.modelLine === null ? '&mdash;'
      : '<span class="pl-num">' + M.fmtLine(p.modelLine) + '</span>' +
        '<small class="' + tone(edge) + '">edge ' + signed(edge) + '</small>';
    var res = '<span class="pl-badge ' + b[0] + '"><span aria-hidden="true">' + b[1] + '</span>' + b[2] + '</span>' +
      (e.result ? '<small>' + esc(p.pick) + ' ' + e.pickScore + ', ' + esc(e.opp) + ' ' + e.oppScore + '</small>' : '');
    var netCell = e.result ? '<span class="pl-num ' + tone(e.net) + '">' + M.fmtUnits(e.net, true) + '</span>' : '<span class="pl-none">&mdash;</span>';
    return '<tr class="pl-row">' +
      '<td data-l="Date" class="pl-date"><span>' + fmtDate(p.date) + (editMode ? '<br><a href="#" data-edit="' + esc(p.id) + '">edit</a>' : '') + '</span></td>' +
      '<td data-l="Game">' + (p.neutral ? esc(p.away) + ' vs ' + esc(p.home) + '*' : esc(p.away) + ' @ ' + esc(p.home)) + '</td>' +
      '<td data-l="Play" class="pl-play"><span><b>' + esc(p.pick) + '</b> <span class="pl-num">' + M.fmtLine(p.line) + '</span></span></td>' +
      '<td data-l="Odds" class="pl-num">' + M.fmtOdds(p.odds) + '</td>' +
      '<td data-l="Units" class="pl-un"><span><span class="pl-num">' + String(p.units) + '</span><small>risks ' + M.fmtUnits(M.risk(p.units, p.odds), false) + '</small></span></td>' +
      '<td data-l="Conf.">' + esc(p.confidence) + '</td>' +
      '<td data-l="Book">' + esc(p.book) + '</td>' +
      '<td data-l="Model" class="pl-mdl"><span>' + mdl + '</span></td>' +
      '<td data-l="Result" class="pl-res"><span>' + res + '</span></td>' +
      '<td data-l="Net units" class="pl-net">' + netCell + '</td></tr>';
  }

  function render() {
    if (!model) return;
    var list = filtered();
    $('pl-count').textContent = rows.length + ' play' + (rows.length === 1 ? '' : 's');
    $('pl-sum').innerHTML = summaryHTML(M.summarize(list.map(function (e) {
      return { result: e.result, units: e.p.units, odds: e.p.odds };
    })));
    $('pl-foot').textContent = list.length
      ? 'Units are units to win: a win pays that many units at any price, a loss costs the stake the odds imply (1u at -110 loses 1.10u), a push returns the stake (0u). ' +
        'Net units and ROI count graded plays only; ROI is net units over the units risked on wins and losses. ' +
        'Edge is your line minus the model’s line from the same side, saved when the play was entered: positive means you got a better number than the model.'
      : '';
    if (!list.length) {
      var filteredOut = rows.length > 0;
      $('pl-body').innerHTML = '<div class="pl-empty"><b>' + (filteredOut ? 'No plays match these filters' : 'No plays yet') + '</b>' +
        (filteredOut ? 'Clear a filter to see the rest.' : 'Plays are picked from the schedule by the site owner. Each one grades itself once the final score is saved.') + '</div>';
      return;
    }
    $('pl-body').innerHTML = '<div class="pl-scroll"><table><thead><tr><th>Date</th><th>Game</th><th>Play</th><th>Odds</th><th>Units</th>' +
      '<th>Conf.</th><th>Book</th><th>Model</th><th>Result</th><th>Net units</th></tr></thead><tbody>' +
      list.map(rowHTML).join('') + '</tbody></table></div>';
  }

  function find(id) { return raw.filter(function (r) { return r.id === id; })[0]; }

  // Keep the Book filter and the entry form's suggestions in step with the books used so far.
  function refreshBooks() {
    var seen = {}, books = [];
    rows.forEach(function (p) { if (p.book && !seen[p.book.toLowerCase()]) { seen[p.book.toLowerCase()] = 1; books.push(p.book); } });
    books.sort(function (a, b) { return a.localeCompare(b); });
    var sel = $('pl-book'), cur = sel.value;
    sel.innerHTML = '<option value="">All books</option>' + books.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('');
    sel.value = books.indexOf(cur) >= 0 ? cur : '';
    var dl = $('ed-books');
    if (dl) dl.innerHTML = books.map(function (b) { return '<option value="' + esc(b) + '">'; }).join('');
  }

  function setRaw(list) { raw = list; rows = raw.map(norm).filter(Boolean); refreshBooks(); render(); }

  // ---- Owner entry ----
  function fillSelect(sel, items, selected) {
    sel.innerHTML = '<option value=""></option>' + items.map(function (i) {
      return '<option value="' + esc(i.v) + '">' + esc(i.t) + '</option>';
    }).join('');
    sel.value = selected || '';
    if (sel.selectedIndex < 0) sel.selectedIndex = 0;
  }
  function fillDates(selected) {
    fillSelect($('ed-date'), dates.map(function (d) {
      var n = byDate[d].length;
      return { v: d, t: C.parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + n + ' game' + (n === 1 ? '' : 's') };
    }), selected);
  }
  function fillGames(date, selected) {
    var games = (byDate[date] || []).slice().sort(function (a, b) { return a.home.localeCompare(b.home); });
    fillSelect($('ed-game'), games.map(function (g) { return { v: g.id, t: gameLabel(g) }; }), selected);
  }
  function fillPicks(gameId, selected) {
    var g = gamesById[gameId];
    fillSelect($('ed-pick'), g ? [{ v: g.away, t: g.away }, { v: g.home, t: g.home }] : [], selected);
  }
  function openForm(v, isEdit) {
    form.open(v, isEdit);
    fillDates(v.date);
    fillGames($('ed-date').value, v.game);
    fillPicks($('ed-game').value, v.pick);
  }
  function defaultDate() {
    var t = todayISO();
    return dates.filter(function (d) { return d >= t; })[0] || dates[dates.length - 1] || '';
  }
  function startAdd() { editingId = null; openForm({ date: defaultDate() }, false); }
  function startEdit(id) {
    var p = find(id);
    if (!p) return;
    editingId = id;
    openForm({
      date: p.date, game: p.gameId, pick: p.pick, line: M.fmtLine(p.line), odds: M.fmtOdds(p.odds), book: p.book,
      units: String(p.units), confidence: p.confidence
    }, true);
  }

  function label(p) { return p.pick + ' ' + M.fmtLine(p.line) + ' (' + p.away + (p.neutral ? ' vs ' : ' @ ') + p.home + ', ' + p.date + ')'; }

  // Always returns a promise, so a validation message shows in the form instead of throwing out of the submit handler.
  function save(v, editing) {
    return Promise.resolve().then(function () {
      var old = editing ? find(editingId) : null;
      var g = gamesById[v.game];
      if (!g) throw new Error('Pick a day, then a game from the schedule.');
      if (v.pick !== g.home && v.pick !== g.away) throw new Error('Pick the side you took.');
      var line = M.parseLine(v.line);
      if (isNaN(line)) throw new Error('Enter the line in half points, like -4.5 or +3 (PK for pick ’em).');
      var odds = M.parseOdds(v.odds);
      if (isNaN(odds)) throw new Error('Enter the odds as American odds, like -110 or +105.');
      if (!v.book) throw new Error('Enter the book.');
      var units = M.parseUnits(v.units);
      if (isNaN(units)) throw new Error('Enter units to win as a number above 0, like 1 or 0.5.');
      if (CONFIDENCE.indexOf(v.confidence) < 0) throw new Error('Pick Low, Medium or High confidence.');
      var id = g.id + '_' + C.teamKey(v.pick);
      if (!editing && g.result) throw new Error('That game already has a final score. Plays have to be entered before the game.');
      if (!editing && find(id)) throw new Error('There is already a play on ' + v.pick + ' in this game. Edit that one instead.');
      var snap = old ? old.modelLine : model.teamLine(g, v.pick);   // the model’s line is saved once, when the play is first entered
      var entry = {
        id: id, gameId: g.id, date: g.date, home: g.home, away: g.away, neutral: !!g.neutral, pick: v.pick,
        line: line, odds: odds, units: units, book: v.book, confidence: v.confidence,
        modelLine: typeof snap === 'number' ? snap : null,
        ts: old && old.ts ? old.ts : new Date().toISOString()
      };
      owner.setNote('Saving…', false);
      return coll.mutate(function (list) {
        var hit = false;
        var out = list.map(function (r) { if (r.id === id) { hit = true; return entry; } return r; });
        if (!hit) out.push(entry);
        return out;
      }, 'Plays: ' + (old ? 'update ' : 'add ') + label(entry)).then(function (list) {
        setRaw(list); owner.setNote('Saved.', false);
      }, function (err) { owner.setNote('', false); throw new Error(owner.errorText(err)); });
    });
  }

  function del() {
    var id = editingId, p = find(id);
    owner.setNote('Saving…', false);
    return coll.mutate(function (list) { return list.filter(function (r) { return r.id !== id; }); },
      'Plays: remove ' + (p ? label(p) : id)).then(function (list) {
      setRaw(list); owner.setNote('Deleted.', false);
    }, function (err) { owner.setNote('', false); throw new Error(owner.errorText(err)); });
  }

  function setupOwner() {
    var O = window.CBKOwner, bar = $('pl-bar');
    var dl = document.createElement('datalist'); dl.id = 'ed-books';
    document.body.appendChild(dl);
    refreshBooks();
    form = O.form({
      host: $('pl-form-host'), noun: 'play', onSave: save, onDelete: del,
      fields: [
        { k: 'date', label: 'Day', type: 'select', options: [''], lockOnEdit: true },
        { k: 'game', label: 'Game', type: 'select', options: [''], lockOnEdit: true },
        { k: 'pick', label: 'Side you took', type: 'select', options: [''], lockOnEdit: true },
        { k: 'line', label: 'Line you found (your side, e.g. -4.5 or +3)' },
        { k: 'odds', label: 'Odds (American, e.g. -110)' },
        { k: 'book', label: 'Book', list: 'ed-books' },
        { k: 'units', label: 'Units to win' },
        { k: 'confidence', label: 'Confidence', type: 'select', options: [''].concat(CONFIDENCE) }
      ]
    });
    $('ed-date').addEventListener('change', function () { fillGames(this.value); fillPicks(''); });
    $('ed-game').addEventListener('change', function () { fillPicks(this.value); });
    owner = O.init({
      bar: bar, before: bar, coll: coll,
      onActive: function (list) {
        editMode = true;
        setRaw(list);
        // Pull the latest scores straight from GitHub so grades and the saved model line are not a deploy behind.
        Store.refresh().then(function (res) { model.setResults(res); }, function () { /* keep the scores the page loaded with */ })
          .then(function () {
            if (!editMode || addBtn) return;
            addBtn = document.createElement('button');
            addBtn.type = 'button'; addBtn.className = 'entry-toggle'; addBtn.textContent = 'Add play';
            addBtn.addEventListener('click', startAdd);
            bar.appendChild(addBtn);
          });
      },
      onExit: function () {
        editMode = false; form.close();
        if (addBtn) { addBtn.remove(); addBtn = null; }
        render();
      }
    });
  }

  function init(m, data) {
    model = m;
    m.games.forEach(function (g) { gamesById[g.id] = g; (byDate[g.date] = byDate[g.date] || []).push(g); });
    dates = Object.keys(byDate).sort();
    $('pl-status').innerHTML = '<option value="">All results</option><option value="pending">Pending</option>' +
      '<option value="win">Win</option><option value="loss">Loss</option><option value="push">Push</option>';
    $('pl-conf').innerHTML = '<option value="">All confidence</option>' + CONFIDENCE.map(function (c) { return '<option>' + c + '</option>'; }).join('');
    ['pl-status', 'pl-conf', 'pl-book', 'pl-from', 'pl-to'].forEach(function (id) { $(id).addEventListener('change', render); });
    document.addEventListener('cbk-results', render);
    $('pl-body').addEventListener('click', function (ev) {
      var t = ev.target.closest('a');
      if (t && t.dataset.edit) { ev.preventDefault(); startEdit(t.dataset.edit); }
    });
    setupOwner();
    setRaw(Array.isArray(data) ? data : []);
  }

  Promise.all([C.load(), C.getJSON('data/plays.json')]).then(function (d) { init(d[0], d[1]); }).catch(function (err) {
    console.error(err);
    $('load-error').hidden = false;
  });
})();
