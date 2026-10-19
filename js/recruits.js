// 2027 Commits page: a read-only table from data/recruits_2027.json. It never touches a rating, spread or simulation.
// Each recruit: { name, state, pos, ht, school, r247, rOn3, posRank }. ht is the digits as sent (66 = 6'6", 610 = 6'10").
// r247 and rOn3 are overall ranks, posRank is the rank at his position. All are numbers or null. Average = mean of whichever ranks exist; one rank means that rank is the average.
(function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var rows = [];
  function $(id) { return document.getElementById(id); }

  function num(v) {
    var n = typeof v === 'number' ? v : (v === '' || v == null ? NaN : Number(v));
    return isFinite(n) && n > 0 ? n : null;
  }

  // "66" -> 6'6", "610" -> 6'10", "511" -> 5'11". Anything that does not look like digits is shown as sent.
  function fmtHt(h) {
    var s = String(h == null ? '' : h).trim();
    if (!/^\d{2,3}$/.test(s)) return s || '—';
    return s.charAt(0) + '′' + Number(s.slice(1)) + '″';
  }

  function norm(d) {
    if (!d || !d.name) return null;
    var a = num(d.r247), b = num(d.rOn3), have = [a, b].filter(function (x) { return x != null; });
    return {
      name: String(d.name), state: String(d.state || ''), pos: String(d.pos || ''), ht: d.ht, school: String(d.school || ''),
      r247: a, rOn3: b, posRank: num(d.posRank),
      avg: have.length ? have.reduce(function (s, x) { return s + x; }, 0) / have.length : null,
      best: have.length ? Math.min.apply(null, have) : null
    };
  }

  function fmtAvg(x) { return x == null ? '—' : (Number.isInteger(x) ? String(x) : x.toFixed(1)); }

  function rank(list) {
    // Lowest average first. Ties go to the better single rank, then name. Unranked recruits go last.
    list.sort(function (a, b) {
      if ((a.avg == null) !== (b.avg == null)) return a.avg == null ? 1 : -1;
      return ((a.avg || 0) - (b.avg || 0)) || ((a.best || 0) - (b.best || 0)) || a.name.localeCompare(b.name);
    });
    list.forEach(function (r, i) { r.order = r.avg == null ? null : i + 1; });
  }

  function render() {
    var p = $('rc-pos').value, q = $('rc-q').value.trim().toLowerCase();
    var hasOn3 = rows.some(function (r) { return r.rOn3 != null; });
    var list = rows.filter(function (r) {
      return (!p || r.pos === p) && (!q || (r.name + ' ' + r.school + ' ' + r.state).toLowerCase().indexOf(q) >= 0);
    });
    $('rc-count').textContent = list.length + ' shown of ' + rows.length;
    if (!list.length) {
      var any = rows.length > 0;
      $('rc-body').innerHTML = '<div class="rc-empty"><b>' + (any ? 'No commits match these filters' : 'No commits yet') + '</b>' +
        (any ? 'Clear the search or change the position.' : 'Commits show up here as they are added.') + '</div>';
      $('rc-foot').textContent = '';
      return;
    }
    var h = '<div class="rc-scroll"><table><thead><tr><th>Rank</th><th>Player</th><th>Pos</th><th>Ht</th><th>State</th><th>School</th>' +
      (hasOn3 ? '<th>247</th><th>On3</th><th>Avg</th>' : '') + '<th>Pos Rank</th></tr></thead><tbody>';
    list.forEach(function (r) {
      // 247 only: Rank is the 247 overall rank itself. With On3 ranks too: Rank is the order by average.
      var overall = hasOn3 ? r.order : r.r247;
      h += '<tr class="rc-row"><td data-l="Rank" class="rc-rk">' + (overall == null ? '—' : overall) + '</td>' +
        '<td data-l="Player"><span><b>' + esc(r.name) + '</b></span></td>' +
        '<td data-l="Pos">' + esc(r.pos || '—') + '</td>' +
        '<td data-l="Ht" class="rc-num">' + esc(fmtHt(r.ht)) + '</td>' +
        '<td data-l="State">' + esc(r.state || '—') + '</td>' +
        '<td data-l="School"><span>' + esc(r.school || '—') + '</span></td>' +
        (hasOn3 ? '<td data-l="247" class="rc-num">' + (r.r247 == null ? '—' : r.r247) + '</td>' +
          '<td data-l="On3" class="rc-num">' + (r.rOn3 == null ? '—' : r.rOn3) + '</td>' +
          '<td data-l="Avg" class="rc-num rc-avg">' + fmtAvg(r.avg) + '</td>' : '') +
        '<td data-l="Pos Rank" class="rc-num">' + (r.posRank == null ? '—' : r.posRank) + '</td></tr>';
    });
    $('rc-body').innerHTML = h + '</tbody></table></div>';
    $('rc-foot').textContent = (hasOn3
      ? 'Rank is the order of the average of the 247 and On3 rankings. A recruit with one ranking uses that ranking as the average (the other shows a dash).'
      : 'Rank is the 247 overall ranking.') + ' Pos Rank is the ranking among players at the same position.';
  }

  function init(data) {
    rows = data.map(norm).filter(Boolean);
    rank(rows);
    var seen = {}, pos = [];
    rows.forEach(function (r) { if (r.pos && !seen[r.pos]) { seen[r.pos] = 1; pos.push(r.pos); } });
    var ORDER = ['PG', 'SG', 'G', 'CG', 'SF', 'WING', 'F', 'PF', 'C'];
    pos.sort(function (a, b) {
      var x = ORDER.indexOf(a.toUpperCase()), y = ORDER.indexOf(b.toUpperCase());
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b);
    });
    $('rc-pos').innerHTML = '<option value="">All positions</option>' + pos.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    $('rc-pos').addEventListener('change', render);
    $('rc-q').addEventListener('input', render);
    render();
  }

  C.getJSON('data/recruits_2027.json').then(init).catch(function () { $('load-error').hidden = false; });
})();
