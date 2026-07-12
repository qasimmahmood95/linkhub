// Admin-only static assets, embedded as strings so the build stays a plain
// `tsc` with no asset-copy step. Served under /admin, so the proxy block that
// hides the admin surface hides these too.

export const adminCss = `
.admin-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;border-bottom:1px solid var(--border);flex-wrap:wrap}
.admin-header h1{font-size:1.125rem;margin:0}
.header-actions{display:flex;gap:1rem;align-items:center}
.header-actions a{color:var(--text)}
.admin-grid{display:grid;gap:2.5rem;padding:1.25rem;max-width:70rem;margin:0 auto}
@media (min-width:56rem){.admin-grid{grid-template-columns:minmax(0,1fr) 22rem}}
h2{font-size:.9375rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:2.25rem 0 .75rem}
section>h2:first-child,aside>h2:first-child{margin-top:0}
.field{display:block;margin-bottom:.75rem}
.field span{display:block;font-size:.8125rem;color:var(--text-muted);margin-bottom:.25rem}
input[type=text],input[type=password],select{width:100%;max-width:26rem;padding:.5rem .625rem;border:1px solid var(--border);border-radius:.5rem;background:var(--surface);color:var(--text);font:inherit}
button,.button{display:inline-block;padding:.5rem .875rem;border:1px solid var(--border);border-radius:.5rem;background:var(--surface);color:var(--text);font:inherit;cursor:pointer;text-decoration:none}
button:hover,.button:hover{background:var(--surface-hover)}
button.danger{color:var(--danger)}
.rows{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}
.row{border:1px solid var(--border);border-radius:.625rem;padding:.625rem .75rem;background:var(--surface)}
.row.is-disabled .row-title{color:var(--text-muted)}
.row-head{display:flex;flex-wrap:wrap;gap:.25rem .625rem;align-items:baseline}
.row-title{font-weight:600}
.row-meta{font-size:.8125rem;color:var(--text-muted);overflow-wrap:anywhere}
.badge{font-size:.6875rem;border:1px solid var(--border);border-radius:99px;padding:.05rem .5rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
.row-actions{display:flex;gap:.375rem;margin-top:.5rem;flex-wrap:wrap}
.row-actions button{padding:.25rem .625rem;font-size:.875rem;min-width:2.25rem}
.edit-form{margin-top:.75rem;border-top:1px solid var(--border);padding-top:.75rem}
.backup-actions{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
#import-form{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.preview-sticky{position:sticky;top:1rem}
#preview{width:100%;aspect-ratio:9/14;max-height:38rem;border:1px solid var(--border);border-radius:1rem;background:var(--bg)}
#status{position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:.5rem 1rem;border-radius:.5rem;margin:0;z-index:10;max-width:90vw}
#status.error{background:var(--danger);color:#fff}
.hint{font-size:.8125rem;color:var(--text-muted)}
.login-wrap{max-width:22rem;margin:15vh auto 0;padding:1rem}
.login-card{border:1px solid var(--border);background:var(--surface);border-radius:1rem;padding:1.5rem}
.login-card h1{font-size:1.125rem;margin:0 0 1rem}
.error-msg{color:var(--danger)}
`;

export const adminJs = `
(function () {
  'use strict';

  var statusEl = document.getElementById('status');
  var statusTimer = null;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.hidden = false;
    statusEl.classList.toggle('error', Boolean(isError));
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.hidden = true; }, 4000);
  }

  function fail(err) {
    setStatus(err && err.message ? err.message : 'Request failed', true);
  }

  function api(method, path, body) {
    var init = { method: method, headers: {} };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(path, init).then(function (res) {
      if (res.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Signed out');
      }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.error || 'Request failed (' + res.status + ')');
        });
      }
      return res.json();
    });
  }

  function reloadPage() { window.location.reload(); }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;
    var row = button.closest('li.row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var label = row.getAttribute('data-label') || 'this entry';
    var action = button.getAttribute('data-action');

    if (action === 'edit') {
      var form = row.querySelector('.edit-form');
      if (form) {
        form.hidden = !form.hidden;
        button.setAttribute('aria-expanded', String(!form.hidden));
      }
      return;
    }
    if (action === 'up' || action === 'down') {
      api('POST', '/api/admin/links/' + id + '/move', { direction: action }).then(reloadPage).catch(fail);
    } else if (action === 'toggle') {
      var enable = row.getAttribute('data-enabled') !== '1';
      api('PUT', '/api/admin/links/' + id, { enabled: enable }).then(reloadPage).catch(fail);
    } else if (action === 'delete') {
      if (window.confirm('Delete "' + label + '"? This cannot be undone.')) {
        api('DELETE', '/api/admin/links/' + id).then(reloadPage).catch(fail);
      }
    }
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;

    if (form.id === 'profile-form') {
      event.preventDefault();
      var theme = form.elements.theme.value;
      api('PUT', '/api/admin/profile', {
        name: form.elements.name.value,
        title: form.elements.title.value,
        theme: theme
      }).then(function () {
        document.documentElement.setAttribute('data-theme', theme);
        var preview = document.getElementById('preview');
        if (preview) preview.src = '/admin/preview';
        setStatus('Profile saved');
      }).catch(fail);
      return;
    }

    if (form.id === 'add-form') {
      event.preventDefault();
      var kind = form.elements.kind.value;
      var body = { kind: kind, label: form.elements.label.value };
      if (kind === 'link') {
        body.url = form.elements.url.value;
        body.icon = form.elements.icon.value || null;
      }
      api('POST', '/api/admin/links', body).then(reloadPage).catch(fail);
      return;
    }

    if (form.classList.contains('edit-form')) {
      event.preventDefault();
      var row = form.closest('li.row');
      var id = row.getAttribute('data-id');
      var patch = { label: form.elements.label.value };
      if (form.elements.url) patch.url = form.elements.url.value;
      if (form.elements.icon) patch.icon = form.elements.icon.value || null;
      api('PUT', '/api/admin/links/' + id, patch).then(reloadPage).catch(fail);
      return;
    }

    if (form.id === 'import-form') {
      event.preventDefault();
      var input = document.getElementById('import-file');
      var file = input && input.files && input.files[0];
      if (!file) { setStatus('Choose a JSON file first', true); return; }
      if (!window.confirm('Importing replaces the profile and every link. Continue?')) return;
      file.text().then(function (text) {
        return fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text
        });
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || 'Import failed (' + res.status + ')');
          });
        }
        reloadPage();
      }).catch(fail);
      return;
    }
  });

  var kindSelect = document.getElementById('add-kind');
  if (kindSelect) {
    kindSelect.addEventListener('change', function () {
      var isDivider = kindSelect.value === 'divider';
      var urlField = document.getElementById('add-url-field');
      var iconField = document.getElementById('add-icon-field');
      if (urlField) urlField.hidden = isDivider;
      if (iconField) iconField.hidden = isDivider;
      var urlInput = document.getElementById('add-url');
      if (urlInput) urlInput.required = !isDivider;
    });
  }

  var themeSelect = document.getElementById('profile-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', function () {
      var preview = document.getElementById('preview');
      if (preview) preview.src = '/admin/preview?theme=' + encodeURIComponent(themeSelect.value);
    });
  }
})();
`;
