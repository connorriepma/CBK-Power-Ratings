// Owner-only storage for game results. Reads and writes data/results.json in the GitHub repo through the
// GitHub contents API, using a personal access token kept in this browser's localStorage. Nothing else
// on the site can write, and the token is never sent anywhere except api.github.com.
window.CBKStore = (function () {
  'use strict';

  var OWNER = 'connorriepma', REPO = 'CBK-Power-Ratings', BRANCH = 'main';
  var FILE = 'data/results.json';
  var TOKEN_KEY = 'cbk_github_token';
  var BASE = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/';

  var state = null;              // { rows, sha } as last read from or written to GitHub
  var chain = Promise.resolve(); // saves run one at a time so file versions never collide

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* storage unavailable */ }
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage unavailable */ }
    state = null;
  }

  function request(url, opts, accept) {
    opts = opts || {};
    opts.cache = 'no-store';
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + getToken(),
      'Accept': accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      if (res.ok) return res;
      var err = new Error('GitHub returned HTTP ' + res.status);
      err.status = res.status;
      throw err;
    });
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var x = a.home + a.away, y = b.home + b.away;
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  // One result per line keeps the file small and its history readable.
  function serialize(rows) {
    if (!rows.length) return '[]\n';
    return '[\n' + sortRows(rows).map(function (r) { return JSON.stringify(r); }).join(',\n') + '\n]\n';
  }

  function toBase64(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  // Read the current file from GitHub: its version (sha) from the folder listing, then its raw contents.
  function refresh() {
    return request(BASE + 'data?ref=' + BRANCH).then(function (res) {
      return res.json();
    }).then(function (listing) {
      var entry = listing.filter(function (f) { return f.name === 'results.json'; })[0];
      if (!entry) throw new Error('data/results.json was not found in the repo');
      return request(BASE + FILE + '?ref=' + BRANCH, {}, 'application/vnd.github.raw+json').then(function (res) {
        return res.text();
      }).then(function (text) {
        state = { rows: JSON.parse(text), sha: entry.sha };
        return state.rows;
      });
    });
  }

  function ensureState() {
    return state ? Promise.resolve() : refresh();
  }

  function put(rows, message) {
    return request(BASE + FILE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, content: toBase64(serialize(rows)), sha: state.sha, branch: BRANCH })
    }).then(function (res) {
      return res.json();
    }).then(function (body) {
      state = { rows: rows, sha: body.content.sha };
      return rows;
    });
  }

  function attempt(change, message, retried) {
    var rows = change(state.rows.slice());
    return put(rows, message).catch(function (err) {
      if (err.status === 409 && !retried) {      // file changed on GitHub since we read it
        state = null;
        return ensureState().then(function () { return attempt(change, message, true); });
      }
      throw err;
    });
  }

  // Apply `change` (rows -> new rows) to the file on GitHub and commit it.
  function mutate(change, message) {
    var p = chain.then(function () {
      return ensureState().then(function () { return attempt(change, message, false); });
    });
    chain = p.catch(function () { /* keep the queue moving after a failure */ });
    return p;
  }

  function upsert(entry, message) {
    return mutate(function (rows) {
      return rows.filter(function (r) {
        return !(r.date === entry.date && [r.home, r.away].sort().join() === [entry.home, entry.away].sort().join());
      }).concat([entry]);
    }, message);
  }

  function remove(date, home, away, message) {
    return mutate(function (rows) {
      return rows.filter(function (r) {
        return !(r.date === date && [r.home, r.away].sort().join() === [home, away].sort().join());
      });
    }, message);
  }

  return {
    getToken: getToken, setToken: setToken, clearToken: clearToken,
    refresh: refresh, upsert: upsert, remove: remove, serialize: serialize
  };
})();
