import { document, html } from '../html.js';

export function renderLoginPage(error?: string): string {
  return document(html`<html lang="en-GB" data-theme="auto">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>linkhub admin</title>
      <link rel="stylesheet" href="/styles.css" />
      <link rel="stylesheet" href="/admin/admin.css" />
    </head>
    <body>
      <main class="login-wrap">
        <div class="login-card">
          <h1>linkhub admin</h1>
          ${error !== undefined ? html`<p class="error-msg" role="alert">${error}</p>` : null}
          <form method="post" action="/admin/login">
            <label class="field">
              <span>Admin token</span>
              <input type="password" name="token" autofocus autocomplete="current-password" required />
            </label>
            <button type="submit">Sign in</button>
          </form>
        </div>
      </main>
    </body>
  </html>`);
}
