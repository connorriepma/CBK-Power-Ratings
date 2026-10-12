// Eligibility page: a read-only log from data/eligibility.json. It never touches a rating, spread or simulation.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var BADGE = { 'Eligible': ['el-b-yes', '✓'], 'Not eligible': ['el-b-no', '✕'], 'Unknown': ['el-b-unk', '?'] };
  var model, rows = [];
  function $(id) { return document.getElementById(id); }

  function norm(d) {
    if (!d || !d.team || !d.player || !BADGE[d.status]) return null;
    return {
      id: d.id, team: String(d.team), player: String(d.player), rank: typeof d.rank === 'number' ? d.rank : null, status: d.status,
      basis: d.basis || '', stats: d.stats || '', prior: d.prior || '', note: d.note || ''
    };
  }
  function nameOf(e) { var t = model.byKey[e.team]; return t ? t.team : e.team; }
  function baseOf(e) { return e.basis.split(/\s\+\s/)[0] || '—'; }

  function render() {
    var s = $('el-status').value, b = $('el-basis').value, q = $('el-q').value.trim().toLowerCase();
    function n(k) { return rows.filter(function (r) { return r.status === k; }).length; }
    $('el-sum').innerHTML = [['Eligible', n('Eligible')], ['Not eligible', n('Not eligible')], ['Unknown', n('Unknown')], ['Tracked', rows.length]]
      .map(function (x) { return '<div><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');
    var list = rows.filter(function (r) {
      return (s === 'all' || (s === 'attn' ? r.status !== 'Eligible' : r.status === s)) && (!b || baseOf(r) === b) &&
        (!q || (nameOf(r) + ' ' + r.player).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, c) {
      return ((a.rank == null ? 9999 : a.rank) - (c.rank == null ? 9999 : c.rank)) || a.player.localeCompare(c.player);
    });
    $('el-count').textContent = list.length + ' shown of ' + rows.length;
    if (!list.length) {
      var any = rows.length > 0;
      $('el-body').innerHTML = '<div class="el-empty"><b>' + (any ? 'No players match these filters' : 'No eligibility entries yet') + '</b>' +
        (any ? 'Clear a filter or change the status.' : 'Entries show up here as they are logged.') + '</div>';
      $('el-foot').textContent = '';
      return;
    }
    var h = '<div class="el-scroll"><table><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Status</th><th>State / ruling</th><th>2025 stats</th><th>Note</th></tr></thead><tbody>';
    list.forEach(function (r) {
      var L = BADGE[r.status];
      h += '<tr class="el-row"><td data-l="Rank" class="el-rk">' + (r.rank == null ? '—' : r.rank) + '</td>' +
        '<td data-l="Player"><span><b>' + esc(r.player) + '</b></span></td>' +
        '<td data-l="Team" class="el-team"><span><a href="#" data-team="' + esc(nameOf(r)) + '">' + esc(nameOf(r)) + '</a></span></td>' +
        '<td data-l="Status"><span class="el-badge ' + L[0] + '"><span aria-hidden="true">' + L[1] + '</span>' + esc(r.status) + '</span></td>' +
        '<td data-l="State / ruling">' + esc(r.basis || '—') + '</td>' +
        '<td data-l="2025 stats" class="el-num"><span>' + esc(r.stats) + (r.prior ? '<small>' + esc(r.prior) + '</small>' : '') + '</span></td>' +
        '<td data-l="Note"><span>' + esc(r.note) + '</span></td></tr>';
    });
    $('el-body').innerHTML = h + '</tbody></table></div>';
    $('el-foot').textContent = 'Rank is the Miya rank from the owner’s sheet. Stats are PTS / REB / AST from 2025-26; the school or league is shown where it was a different team.';
  }

  function fillBasis() {
    var cur = $('el-basis').value, seen = {}, bases = [];
    rows.forEach(function (r) { var x = baseOf(r); if (!seen[x]) { seen[x] = 1; bases.push(x); } });
    bases.sort();
    $('el-basis').innerHTML = '<option value="">All rulings / states</option>' + bases.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    if (bases.indexOf(cur) >= 0) $('el-basis').value = cur;
  }

  function init(m, data) {
    model = m;
    rows = data.map(norm).filter(Boolean);
    $('el-status').innerHTML = '<option value="attn">Needs attention (not eligible + unknown)</option><option value="all">All players</option><option value="Eligible">Eligible</option><option value="Not eligible">Not eligible</option><option value="Unknown">Unknown</option>';
    ['el-status', 'el-basis'].forEach(function (id) { $(id).addEventListener('change', render); });
    $('el-q').addEventListener('input', render);
    $('el-body').addEventListener('click', function (ev) {
      var t = ev.target.closest('a');
      if (t && t.dataset.team) { ev.preventDefault(); $('el-q').value = t.dataset.team; render(); }
    });
    fillBasis();
    render();
  }

  Promise.all([C.load(), C.getJSON('data/eligibility.json')]).then(function (d) { init(d[0], d[1]); }).catch(function () {
    $('load-error').hidden = false;
  });
})();
