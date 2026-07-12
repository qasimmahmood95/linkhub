import { document, escapeHtml, html, raw, type Raw } from '../html.js';
import { ICON_NAMES } from '../icons.js';
import { THEME_CHOICES } from '../themes.js';
import { isMailto } from '../validation.js';
import type { LinkRow, Profile } from '../db.js';

function options(values: readonly string[], current: string | null, emptyLabel?: string): Raw {
  return raw(
    values
      .map((v) => {
        const label = v === '' ? (emptyLabel ?? '(none)') : v;
        const selected = v === (current ?? '') ? ' selected' : '';
        return `<option value="${escapeHtml(v)}"${selected}>${escapeHtml(label)}</option>`;
      })
      .join('')
  );
}

function linkMeta(link: LinkRow): Raw {
  if (link.kind === 'divider') return html`<span class="row-meta">Section divider</span>`;
  const url = link.url ?? '';
  const clicks = isMailto(url)
    ? 'email links are not counted'
    : `${link.click_count} ${link.click_count === 1 ? 'click' : 'clicks'}`;
  return html`<span class="row-meta">${url} &middot; ${clicks}</span>`;
}

function editForm(link: LinkRow): Raw {
  return html`<form class="edit-form" hidden>
    <label class="field"><span>Label</span><input type="text" name="label" value="${link.label}" required /></label>
    ${link.kind === 'link'
      ? html`<label class="field"><span>URL</span><input type="text" name="url" value="${link.url ?? ''}" required /></label>
          <label class="field"><span>Icon</span><select name="icon">${options(['', ...ICON_NAMES], link.icon)}</select></label>`
      : null}
    <button type="submit">Save</button>
  </form>`;
}

function linkRow(link: LinkRow): Raw {
  return html`<li
    class="row${link.enabled === 0 ? ' is-disabled' : ''}"
    data-id="${link.id}"
    data-enabled="${link.enabled}"
    data-label="${link.label}"
  >
    <div class="row-head">
      <span class="row-title">${link.label}</span>
      ${linkMeta(link)}
      ${link.enabled === 0 ? html`<span class="badge">disabled</span>` : null}
    </div>
    <div class="row-actions">
      <button type="button" data-action="up" aria-label="Move ${link.label} up">&uarr;</button>
      <button type="button" data-action="down" aria-label="Move ${link.label} down">&darr;</button>
      <button type="button" data-action="toggle">${link.enabled === 1 ? 'Disable' : 'Enable'}</button>
      <button type="button" data-action="edit" aria-expanded="false">Edit</button>
      <button type="button" data-action="delete" class="danger">Delete</button>
    </div>
    ${editForm(link)}
  </li>`;
}

export function renderAdminPage(profile: Profile, links: LinkRow[]): string {
  return document(html`<html lang="en-GB" data-theme="${profile.theme}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>linkhub admin</title>
      <link rel="stylesheet" href="/styles.css" />
      <link rel="stylesheet" href="/admin/admin.css" />
      <script src="/admin/app.js" defer></script>
    </head>
    <body>
      <header class="admin-header">
        <h1>linkhub admin</h1>
        <div class="header-actions">
          <a href="/" target="_blank" rel="noopener">View public page</a>
          <form method="post" action="/admin/logout"><button type="submit">Log out</button></form>
        </div>
      </header>
      <p id="status" role="status" hidden></p>
      <main class="admin-grid">
        <section>
          <h2>Profile</h2>
          <form id="profile-form">
            <label class="field"><span>Name</span><input type="text" name="name" value="${profile.name}" required /></label>
            <label class="field"><span>Title line</span><input type="text" name="title" value="${profile.title}" /></label>
            <label class="field">
              <span>Theme</span>
              <select name="theme" id="profile-theme">${options(THEME_CHOICES, profile.theme)}</select>
            </label>
            <button type="submit">Save profile</button>
          </form>

          <h2>Links</h2>
          <ul id="links" class="rows">
            ${links.map(linkRow)}
          </ul>

          <h2>Add</h2>
          <form id="add-form">
            <label class="field">
              <span>Type</span>
              <select name="kind" id="add-kind">
                <option value="link" selected>Link</option>
                <option value="divider">Section divider</option>
              </select>
            </label>
            <label class="field"><span>Label</span><input type="text" name="label" required /></label>
            <label class="field" id="add-url-field"
              ><span>URL</span><input type="text" name="url" id="add-url" placeholder="https://&hellip;" required
            /></label>
            <label class="field" id="add-icon-field"
              ><span>Icon</span><select name="icon">${options(['', ...ICON_NAMES], null)}</select></label
            >
            <button type="submit">Add</button>
          </form>

          <h2>Backup</h2>
          <div class="backup-actions">
            <a class="button" href="/api/admin/export" download="linkhub-export.json">Export JSON</a>
            <form id="import-form">
              <input type="file" id="import-file" accept="application/json,.json" aria-label="Backup file" />
              <button type="submit">Import</button>
            </form>
          </div>
          <p class="hint">Import replaces the profile and every link with the contents of the file.</p>
        </section>
        <aside>
          <h2>Preview</h2>
          <div class="preview-sticky">
            <iframe id="preview" src="/admin/preview" title="Public page preview"></iframe>
            <p class="hint">Pick a theme to preview it; it is applied when you save the profile.</p>
          </div>
        </aside>
      </main>
    </body>
  </html>`);
}
