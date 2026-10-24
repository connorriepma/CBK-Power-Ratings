// Ratings page: current ratings are computed in the browser from the preseason ratings plus data/results.json.
(function () {
  'use strict';

  var C = window.CBK;
  var Panel = window.CBKPanel;
  var model;

  // Display order of the conference filter tabs.
  var CONFERENCES = [
    'All Conferences', 'ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East', 'Pac-12', 'A10', 'AAC',
    'America East', 'ASUN', 'Big Sky', 'Big South', 'Big West', 'CAA', 'C-USA', 'Horizon', 'Ivy',
    'MAAC', 'MAC', 'MEAC', 'Missouri Valley', 'Mountain West', 'NEC', 'OVC', 'Patriot', 'Southern',
    'Southland', 'Summit League', 'Sun Belt', 'SWAC', 'UAC', 'WCC'
  ];

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var teams = [];
  var selected = 'All Conferences';

  function formatDate(iso) {
    var p = iso.split('-');
    return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
  }

  function renderTabs() {
    var wrap = document.getElementById('conf-tabs');
    wrap.textContent = '';
    CONFERENCES.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'conf-tab';
      b.textContent = name;
      b.setAttribute('aria-pressed', String(name === selected));
      b.addEventListener('click', function () {
        selected = name;
        renderTabs();
        renderRows();
      });
      wrap.appendChild(b);
    });
  }

  function cell(className, text) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function renderRows() {
    var list = teams.filter(function (t) {
      return selected === 'All Conferences' || t.conference === selected;
    });

    document.getElementById('conf-strip').textContent = selected;
    document.getElementById('count').textContent = list.length + (list.length === 1 ? ' team' : ' teams');

    var any = model.records.any;
    document.getElementById('ratings-table').classList.toggle('no-results', !any);
    document.getElementById('ats-note').hidden = !any;

    var tbody = document.getElementById('rows');
    tbody.textContent = '';
    list.forEach(function (t, i) {
      var tr = document.createElement('tr');
      tr.className = 'team-row';
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-expanded', 'false');
      tr.innerHTML = '<td class="rk">' + (i + 1) + '</td>' +
        '<td>' + C.esc(t.team) + '<span class="conf">' + C.esc(t.conference) + '</span></td>' +
        '<td class="num rating" title="Exact rating ' + t.exact.toFixed(2) + '">' + C.fmtRating(t.display) + '</td>' +
        '<td class="num pre" title="Exact preseason rating ' + t.pre.toFixed(2) + '">' + C.fmtRating(t.preDisplay) + '</td>' +
        '<td class="num">' + C.fmtRating(t.home_court) + '</td>' + Panel.recordCells(model, t.team);

      var panelRow = document.createElement('tr');
      panelRow.className = 'schedule-row';
      panelRow.hidden = true;
      var td = document.createElement('td');
      td.colSpan = 9;
      panelRow.appendChild(td);

      function toggle() {
        var open = panelRow.hidden;
        if (open && !td.firstChild) td.innerHTML = Panel.build(model, t.team);  // built on first open
        panelRow.hidden = !open;
        tr.classList.toggle('open', open);
        tr.setAttribute('aria-expanded', String(open));
      }
      tr.addEventListener('click', toggle);
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });

      tbody.appendChild(tr);
      tbody.appendChild(panelRow);
    });
  }

  function renderStatus(results) {
    var el = document.getElementById('status');
    if (!results.length) {
      el.textContent = '· preseason';
      return;
    }
    var last = results.reduce(function (m, r) { return r.date > m ? r.date : m; }, '');
    el.textContent = '· games through ' + formatDate(last);
  }

  C.load().then(function (m) {
    model = m;
    teams = model.teams.map(function (t) {
      var exact = model.current[t.key];
      return { team: t.team, conference: t.conference, home_court: t.home_court, exact: exact, display: C.roundHalf(exact),
        pre: t.preseason_rating, preDisplay: C.roundHalf(t.preseason_rating) };
    }).sort(function (a, b) { return b.exact - a.exact; });
    renderStatus(model.results);
    renderTabs();
    renderRows();
  }).catch(function (err) {
    console.error(err);
    document.getElementById('load-error').hidden = false;
    renderTabs();
  });
})();
