// The expandable schedule panel under a team on the Ratings page: record bars, projected record, and every game.
window.CBKPanel = (function () {
  'use strict';

  var C = window.CBK;
  var esc = C.esc;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(iso) {
    var p = iso.split('-');
    return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]);
  }

  // Rotation players (display only), keyed by team key. Loaded once; if the file is missing the panel is unchanged.
  var rotations = {};
  C.getJSON('data/rotations.json').then(function (d) { rotations = d || {}; }).catch(function () { /* optional file */ });

  function statNum(v) { return typeof v === 'number' ? v.toFixed(1) : null; }

  function rotationHtml(team) {
    var r = rotations[C.teamKey(team)];
    if (!r || !r.players || !r.players.length) return '';
    var rows = r.players.map(function (p) {
      var has = statNum(p.ppg) !== null;
      var stats = has ? statNum(p.ppg) + ' / ' + statNum(p.rpg) + ' / ' + statNum(p.apg) : '&mdash;';
      var tip = has && p.gp ? ' title="' + esc(p.gp + ' games played last season') + '"' : '';
      return '<tr><td class="rt-name">' + esc(p.name) + '</td><td>' + esc(p.pos || '') + '</td><td>' + esc(p.yr || '') + '</td>' +
        '<td class="rt-ht">' + esc(p.ht || '') + '</td><td class="rt-num"' + tip + '>' + stats + '</td>' +
        '<td class="rt-num"' + tip + '>' + (statNum(p.mpg) !== null ? statNum(p.mpg) : '&mdash;') + '</td>' +
        '<td class="rt-note">' + esc(p.note || '') + '</td></tr>';
    }).join('');
    return '<div class="rotation-box"><div class="rec-bar"><b>Roster</b></div>' +
      '<table class="rotation-table"><thead><tr><th>Player</th><th>Pos</th><th>Yr</th><th>Ht</th>' +
      '<th class="rt-num" title="Last season: points / rebounds / assists per game">P / R / A</th>' +
      '<th class="rt-num" title="Last season minutes per game">MPG</th><th>Notes</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (r.updated ? '<div class="g-footnote">Updated ' + esc(usDate(r.updated)) + '</div>' : '') + '</div>';
  }

  // 2026-10-16 -> 10-16-2026
  function usDate(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? p[1] + '-' + p[2] + '-' + p[0] : String(iso);
  }

  function atsStr(w, l, p) { return w + '-' + l + (p ? '-' + p : ''); }
  function atsAvg(a) {
    var v = a.sum / a.n, t = v.toFixed(1);
    return (v > 0 && t !== '0.0' ? '+' : '') + (t === '-0.0' ? '0.0' : t);
  }

  // The four record cells (Record, Conf, ATS, Avg vs Line) for a team's row in the ratings table.
  function recordCells(model, team) {
    var r = model.records.rec[team], a = model.records.ats[team];
    var overall = r ? r.w + '-' + r.l : '&mdash;';
    var conf = r && (r.cw + r.cl) ? r.cw + '-' + r.cl : '&mdash;';
    var counted = a && a.n;
    var tip = counted
      ? a.n + ' game' + (a.n === 1 ? '' : 's') + ' counted of ' + (r ? r.w + r.l : 0) + ' played'
      : 'No games counted yet';
    return '<td class="num rec-col">' + overall + '</td><td class="num rec-col">' + conf + '</td>' +
      '<td class="num rec-col" title="' + esc(tip) + '">' + (counted ? atsStr(a.w, a.l, a.p) : '&mdash;') + '</td>' +
      '<td class="num rec-col" title="' + esc(tip) + '">' + (counted ? atsAvg(a) : '&mdash;') + '</td>';
  }

  function recBar(model, team) {
    var r = model.records.rec[team];
    if (!r) return '';
    var parts = ['Record <b>' + r.w + '-' + r.l + '</b>'];
    if (r.cw + r.cl) parts.push('Conf <b>' + r.cw + '-' + r.cl + '</b>');
    if (r.hw + r.hl) parts.push('Home <b>' + r.hw + '-' + r.hl + '</b>');
    if (r.aw + r.al) parts.push('Away <b>' + r.aw + '-' + r.al + '</b>');
    if (r.nw + r.nl) parts.push('Neutral <b>' + r.nw + '-' + r.nl + '</b>');
    var atsBar = '';
    var a = model.records.ats[team];
    if (a && a.n) {
      var ap = ['Vs my line <b>' + atsStr(a.w, a.l, a.p) + '</b>'];
      if (a.cw + a.cl + a.cp) ap.push('Conf <b>' + atsStr(a.cw, a.cl, a.cp) + '</b>');
      if (a.hw + a.hl + a.hp) ap.push('Home <b>' + atsStr(a.hw, a.hl, a.hp) + '</b>');
      if (a.aw + a.al + a.ap) ap.push('Away <b>' + atsStr(a.aw, a.al, a.ap) + '</b>');
      if (a.nw + a.nl + a.np) ap.push('Neutral <b>' + atsStr(a.nw, a.nl, a.np) + '</b>');
      ap.push('Avg vs line <b>' + atsAvg(a) + '</b>');
      atsBar = '<div class="rec-bar">' + ap.join(' &middot; ') + '</div>';
    }
    return '<div class="rec-bar">' + parts.join(' &middot; ') + '</div>' + atsBar;
  }

  // Actual record plus win probabilities summed over the unplayed rated games.
  function projBar(model, team) {
    var r = model.records.rec[team];
    var w = r ? r.w : 0, l = r ? r.l : 0, rated = 0, nonD1 = 0;
    var excluded = model.tbd.filter(function (t) { return t.team === team; }).length;
    model.games.forEach(function (g) {
      if (g.result || (g.home !== team && g.away !== team)) return;
      var wp = model.winProb(g);
      if (!wp) {
        if (g.home === C.NON_D1 || g.away === C.NON_D1) { w += 1; nonD1++; } else excluded++;
        return;
      }
      var p = g.home === team ? wp.home : wp.away;
      w += p; l += 1 - p; rated++;
    });
    if (!rated && !nonD1 && !r) return '';
    var note = rated + ' unplayed rated game' + (rated === 1 ? '' : 's') + ' counted by win probability' +
      (nonD1 ? '; ' + nonD1 + ' unplayed non-D1 game' + (nonD1 === 1 ? '' : 's') + ' counted as wins' : '') +
      (excluded ? '; ' + excluded + ' with an unrated or TBD opponent left out' : '');
    return '<div class="rec-bar">Projected record <b>' + w.toFixed(1) + '-' + l.toFixed(1) + '</b> &middot; ' + esc(note) + '</div>';
  }

  function lineCell(model, g, team) {
    if (g.result) {
      var isHome = g.home === team;
      var own = isHome ? g.result.home : g.result.away, opp = isHome ? g.result.away : g.result.home;
      var won = own > opp;
      return '<div class="g-line final ' + (won ? 'fav' : 'dog') + '">' + (won ? 'W' : 'L') + ' ' + own + '-' + opp + '</div>';
    }
    var line = model.teamLine(g, team);
    if (line === null) return '<div class="g-line none">&mdash;</div>';
    if (line === 0) return '<div class="g-line pk" title="Exact line: PK (0.00)">PK</div>';
    var m = model.exactMargin(g);
    var tip = 'Exact line: ' + (m > 0 ? g.home : g.away) + ' -' + Math.abs(m).toFixed(2);
    var txt = line > 0 ? '+' + line.toFixed(1) : line.toFixed(1);
    return '<div class="g-line ' + (line < 0 ? 'fav' : 'dog') + '" title="' + esc(tip) + '">' + txt + '</div>';
  }

  function winCell(model, g, team) {
    if (g.result) return '<div class="g-wp"></div>';
    var wp = model.winProb(g);
    if (!wp) {
      if (g.home === C.NON_D1 || g.away === C.NON_D1) {
        return '<div class="g-wp fav" title="Non D1 opponent: counted as a win">&gt;99%</div>';
      }
      return '<div class="g-wp"></div>';
    }
    var p = g.home === team ? wp.home : wp.away;
    return '<div class="g-wp ' + (p >= 0.5 ? 'fav' : 'dog') + '" title="Exact: ' + (p * 100).toFixed(1) + '%">' + C.fmtPct(p) + '</div>';
  }

  function build(model, team) {
    var exact = model.current[C.teamKey(team)];
    var exactNote = typeof exact === 'number' ? '<div class="g-footnote">Exact rating: ' + exact.toFixed(2) + '</div>' : '';
    var tbdRows = model.tbd.filter(function (t) { return t.team === team; })
      .map(function (t) { return Object.assign({}, t, { isTbd: true }); });
    var games = model.games.filter(function (g) { return g.home === team || g.away === team; })
      .concat(tbdRows).sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!games.length) return '<div class="schedule-empty">Schedule not loaded yet</div>' + exactNote;

    var rows = games.map(function (g) {
      if (g.isTbd) {
        return '<div class="g-row has-wp"><div class="g-tag nc">OOC</div><div class="g-date">' + fmtDate(g.date) + '</div>' +
          '<div class="g-opp"><span class="side">vs</span>TBD* <span class="g-site">' + esc(g.event) +
          (g.site ? ' &middot; ' + esc(g.site) : '') + '</span></div><div class="g-line none">&mdash;</div><div class="g-wp"></div></div>';
      }
      var isHome = g.home === team;
      var opp = isHome ? g.away : g.home;
      var side = g.neutral ? 'vs' : (isHome ? 'vs' : '@');
      var site = g.neutral && g.site ? ' <span class="g-site">' + esc(g.site) + '</span>' : '';
      return '<div class="g-row has-wp">' +
        '<div class="g-tag ' + (g.conf ? '' : 'nc') + '">' + esc(model.confTag(g)) + '</div>' +
        '<div class="g-date">' + fmtDate(g.date) + (g.dateTbd ? '&dagger;' : '') + '</div>' +
        '<div class="g-opp"><span class="side">' + side + '</span>' + esc(opp) + (g.neutral ? '*' : '') + (!g.isTbd && model.hcaMod(g).length ? '&Dagger;' : '') + site +
        (!g.isTbd && !isHome && model.altitude(g) ? ' <span class="g-site" title="Plays at ' + model.altitude(g).toLocaleString('en-US') + ' ft elevation">&#9968;&#xFE0F;</span>' : '') +
        (g.travelMiles && g.away === team ? ' <span class="g-site">&#9992;&#xFE0E; ' + g.travelMiles.toLocaleString('en-US') + ' mi</span>' : '') + '</div>' +
        lineCell(model, g, team) + winCell(model, g, team) + '</div>';
    }).join('');

    var hasNeutral = games.some(function (g) { return g.neutral || g.isTbd; });
    var hasDateTbd = games.some(function (g) { return g.dateTbd; });
    var hcaTxt = [];
    games.forEach(function (g) {
      (g.isTbd ? [] : model.hcaMod(g)).forEach(function (m) {
        hcaTxt.push(esc(m.team) + ' ' + Math.round(m.pct * 100) + '% of its home court (+' + (Math.round(m.pts * 100) / 100) + ' pts)');
      });
    });
    var hasAlt = games.some(function (g) { return !g.isTbd && g.home !== team && model.altitude(g); });
    var hasTravel = games.some(function (g) { return g.travelMiles && g.away === team; });
    var foot = (hasNeutral ? '<div class="g-footnote">* designates neutral site</div>' : '') +
      (hcaTxt.length ? '<div class="g-footnote">&Dagger; modified HCA: ' + hcaTxt.filter(function (t, i) { return hcaTxt.indexOf(t) === i; }).join('; ') + '</div>' : '') +
      (hasTravel ? '<div class="g-footnote">&#9992;&#xFE0E; long conference trip: miles the road team travels (a note only; ratings and spreads are not adjusted)</div>' : '') +
      (hasAlt ? '<div class="g-footnote">&#9968;&#xFE0F; played at altitude (host campus at or above ' + C.ALTITUDE_FT.toLocaleString('en-US') + ' ft). A note only; ratings and spreads are not adjusted.</div>' : '') +
      (hasDateTbd ? '<div class="g-footnote">&dagger; Exact date not yet announced (the league has released a window of days)</div>' : '') +
      '<div class="g-footnote">Win % comes from the predicted margin: a typical game lands about ' + C.SIGMA +
      ' points away from it. The spread is the exact predicted margin rounded to the nearest 0.5, so win % and spread agree. Hover a spread to see the exact line.</div>' +
      exactNote;
    var sched = '<div class="schedule-list">' + recBar(model, team) + projBar(model, team) +
      '<div class="g-head panel"><div></div><div>Date</div><div>Opponent</div><div class="r">Line</div><div class="r">Win %</div></div>' +
      rows + foot + '</div>';
    var rot = rotationHtml(team);
    return rot ? '<div class="panel-split"><div class="panel-sched">' + sched + '</div>' + rot + '</div>' : sched;
  }

  return { build: build, recordCells: recordCells };
})();
