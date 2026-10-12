// Ratings page: renders data/current_ratings.json joined with data/teams.json.
(function () {
  'use strict';

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

  function getJSON(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error(path + ': HTTP ' + res.status);
      return res.json();
    });
  }

  // 103 -> "103", 102.5 -> "102.5"
  function fmt(n) {
    return String(n);
  }

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

    var tbody = document.getElementById('rows');
    tbody.textContent = '';
    list.forEach(function (t, i) {
      var tr = document.createElement('tr');
      tr.appendChild(cell('rk', String(i + 1)));

      var name = document.createElement('td');
      name.appendChild(document.createTextNode(t.team));
      var conf = document.createElement('span');
      conf.className = 'conf';
      conf.textContent = t.conference;
      name.appendChild(conf);
      tr.appendChild(name);

      tr.appendChild(cell('num rating', fmt(t.display)));
      tr.appendChild(cell('num', fmt(t.home_court)));
      tbody.appendChild(tr);
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

  Promise.all([
    getJSON('data/current_ratings.json'),
    getJSON('data/teams.json'),
    getJSON('data/results.json')
  ]).then(function (data) {
    var hc = {};
    data[1].forEach(function (t) { hc[t.key] = t.home_court; });
    teams = data[0].map(function (r) {
      return { team: r.team, conference: r.conference, display: r.display, home_court: hc[r.key] };
    });
    renderStatus(data[2]);
    renderTabs();
    renderRows();
  }).catch(function (err) {
    console.error(err);
    document.getElementById('load-error').hidden = false;
    renderTabs();
  });
})();
