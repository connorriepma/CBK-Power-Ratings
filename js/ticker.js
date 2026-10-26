// Top 25 ticker (main page only): the 25 highest current ratings, as team logos, scrolling slowly.
(function () {
  'use strict';
  var C = window.CBK;
  var host = document.getElementById('ticker');
  if (!host) return;

  Promise.all([C.load(), C.getJSON('data/team_logos.json').catch(function () { return {}; })]).then(function (d) {
    var model = d[0], logos = d[1];
    var top = model.teams.slice().sort(function (a, b) { return model.current[b.key] - model.current[a.key]; }).slice(0, 25);
    var items = top.map(function (t, i) {
      var face = logos[t.key]
        ? '<img src="' + C.esc(logos[t.key]) + '" alt="' + C.esc(t.team) + '" loading="lazy">'
        : '<span class="tk-name">' + C.esc(t.team) + '</span>';
      return '<span class="tk-item" title="#' + (i + 1) + ' ' + C.esc(t.team) + '"><span class="tk-rk">' + (i + 1) + '</span>' + face + '</span>';
    }).join('');
    // Two copies side by side so the loop has no gap.
    host.innerHTML = '<div class="tk-label">Top 25 Teams</div><div class="tk-view"><div class="tk-track" aria-label="Top 25 teams by current rating"><div class="tk-set">' + items + '</div><div class="tk-set" aria-hidden="true">' + items + '</div></div></div>';
    // A logo that fails to load falls back to the team name.
    host.addEventListener('error', function (e) {
      var img = e.target;
      if (img && img.tagName === 'IMG') { var s = document.createElement('span'); s.className = 'tk-name'; s.textContent = img.alt; img.replaceWith(s); }
    }, true);
  }).catch(function () { host.hidden = true; });
})();
