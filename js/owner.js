// Owner sign-in for the Injuries and Eligibility pages: adds an "Edit entries" button and a token panel,
// then hands the live rows from GitHub to the page. Same token and storage as score entry on the Schedule page.
window.CBKOwner = (function () {
  'use strict';

  var Store = window.CBKStore;
  var esc = window.CBK.esc;

  function errorText(err) {
    if (err.status === 401) return 'GitHub rejected the token.';
    if (err.status === 403 || err.status === 404) return 'The token cannot edit this repo. It needs Contents set to Read and write.';
    return 'Could not reach GitHub (' + (err.message || 'error') + ').';
  }

  // cfg: { bar, before, coll, onActive(rows), onExit() }
  function init(cfg) {
    var active = false;
    var toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'entry-toggle'; toggle.textContent = 'Edit entries';
    var out = document.createElement('button');
    out.type = 'button'; out.className = 'entry-toggle'; out.textContent = 'Sign out'; out.hidden = true;
    cfg.bar.appendChild(toggle); cfg.bar.appendChild(out);

    var note = document.createElement('div');
    note.className = 'entry-note'; note.setAttribute('role', 'status');
    var panel = document.createElement('section');
    panel.className = 'owner-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Owner sign-in');
    panel.innerHTML = '<h2>Owner sign-in</h2>' +
      '<p>Changes save to this site&rsquo;s GitHub repo. Paste a GitHub token that can edit the repo&rsquo;s contents. It stays in this browser and is sent only to GitHub. If you already use Enter scores on the Schedule page, this browser is already signed in.</p>' +
      '<div class="owner-row"><input type="password" autocomplete="off" placeholder="Paste token" aria-label="GitHub token">' +
      '<button type="button" class="entry-toggle" data-a="save">Save token</button>' +
      '<button type="button" class="entry-toggle" data-a="cancel">Cancel</button></div>' +
      '<div class="owner-msg" role="status"></div>';
    cfg.before.parentNode.insertBefore(note, cfg.before);
    cfg.before.parentNode.insertBefore(panel, cfg.before);
    var input = panel.querySelector('input'), msg = panel.querySelector('.owner-msg');

    function setNote(text, isErr) { note.textContent = text; note.className = 'entry-note' + (isErr ? ' err' : ''); }
    function activate(rows) {
      active = true;
      toggle.classList.add('on'); toggle.textContent = 'Editing';
      out.hidden = false; panel.hidden = true;
      setNote('Changes save to GitHub as you make them and appear on the public site within a couple of minutes.', false);
      cfg.onActive(rows);
    }
    function exit() {
      active = false;
      toggle.classList.remove('on'); toggle.textContent = 'Edit entries';
      out.hidden = true; setNote('', false);
      cfg.onExit();
    }
    function showPanel(m) { panel.hidden = false; msg.textContent = m || ''; input.focus(); }
    function start() {
      if (active) return;
      if (!Store.getToken()) { showPanel(); return; }
      setNote('Loading the latest entries from GitHub…', false);
      cfg.coll.refresh().then(activate).catch(function (err) {
        if (err.status === 401) Store.clearToken();
        setNote('', false);
        showPanel(errorText(err));
      });
    }
    toggle.addEventListener('click', start);
    out.addEventListener('click', function () { Store.clearToken(); cfg.coll.reset(); exit(); });
    panel.addEventListener('click', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (a === 'cancel') { panel.hidden = true; input.value = ''; }
      if (a === 'save') {
        var v = input.value.trim();
        if (!v) return;
        Store.setToken(v); msg.textContent = 'Checking the token…';
        cfg.coll.refresh().then(function (rows) { input.value = ''; activate(rows); }).catch(function (err) {
          Store.clearToken(); msg.textContent = errorText(err);
        });
      }
    });

    return { setNote: setNote, errorText: errorText, isActive: function () { return active; } };
  }

  // A simple entry form built from a field list: [{ k, label, type, options, list, wide, lockOnEdit }].
  // cfg: { host, fields, onSave(values, editing), onDelete(), noun }
  function form(cfg) {
    var editing = false;
    var f = document.createElement('form');
    f.className = 'ed-form'; f.hidden = true; f.setAttribute('autocomplete', 'off');
    var h = '<h2 class="ed-h"></h2><div class="ed-grid">';
    cfg.fields.forEach(function (x) {
      var id = 'ed-' + x.k, ctl;
      if (x.type === 'select') ctl = '<select id="' + id + '">' + x.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
      else if (x.type === 'textarea') ctl = '<textarea id="' + id + '" rows="2"></textarea>';
      else ctl = '<input id="' + id + '" type="' + (x.type || 'text') + '"' + (x.list ? ' list="' + x.list + '"' : '') + ' autocomplete="off">';
      h += '<div class="ed-f' + (x.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(x.label) + '</label>' + ctl + '</div>';
    });
    h += '</div><div class="ed-err" role="alert"></div><div class="owner-row">' +
      '<button type="submit" class="entry-toggle on">Save entry</button>' +
      '<button type="button" class="entry-toggle" data-a="cancel">Cancel</button>' +
      '<button type="button" class="entry-toggle ed-del" data-a="delete" hidden>Delete entry</button></div>';
    f.innerHTML = h;
    cfg.host.appendChild(f);
    var err = f.querySelector('.ed-err'), title = f.querySelector('.ed-h');

    function el(k) { return f.querySelector('#ed-' + k); }
    function open(values, isEdit) {
      editing = !!isEdit;
      cfg.fields.forEach(function (x) {
        var e = el(x.k);
        e.value = values && values[x.k] != null ? values[x.k] : (x.type === 'select' ? x.options[0] : '');
        e.disabled = editing && !!x.lockOnEdit;
      });
      title.textContent = (editing ? 'Edit ' : 'Add ') + cfg.noun;
      f.querySelector('.ed-del').hidden = !editing;
      err.textContent = '';
      f.hidden = false;
      f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var first = f.querySelector('input:not(:disabled), select:not(:disabled)'); if (first) first.focus();
    }
    function close() { f.hidden = true; err.textContent = ''; }
    function values() {
      var v = {};
      cfg.fields.forEach(function (x) { v[x.k] = el(x.k).value.trim(); });
      return v;
    }
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.textContent = '';
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      Promise.resolve(cfg.onSave(values(), editing)).then(close, function (e) { err.textContent = e.message || String(e); })
        .then(function () { btn.disabled = false; });
    });
    f.addEventListener('click', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (a === 'cancel') close();
      if (a === 'delete' && window.confirm('Delete this entry?')) {
        Promise.resolve(cfg.onDelete()).then(close, function (e) { err.textContent = e.message || String(e); });
      }
    });
    return { open: open, close: close };
  }

  return { init: init, form: form, errorText: errorText };
})();
