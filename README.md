# linkhub

A self-hosted link-in-bio page (think Linktree, minus the account, the tracking
and the bill). One small Node service, server-rendered, SQLite on a volume,
built for a Raspberry Pi k3s cluster or any Docker host.

Two surfaces, separated by design:

- **Public page** (`/`) — avatar, name, title, big tappable link buttons.
  Server-rendered, zero client-side JavaScript, under 30KB excluding the avatar.
- **Admin** (`/admin`) — add/edit/reorder/disable links, profile and theme
  editing with live preview, per-link click counter, JSON export/import.

## Why not Linktree?

Because this page is the front door to everything else you run, it seems odd
to rent it. linkhub keeps the data in a SQLite file you own, on hardware you
own, exportable as JSON whenever you like. Visitors are not tracked: no
cookies, no IP logging, no analytics scripts — just a bare per-link click
counter stored as an integer. And it costs nothing beyond the electricity the
Pi was already using.

## Quick start

```sh
cp .env.example .env
# put a long random secret in .env:
#   openssl rand -base64 32
docker compose up -d --build
```

- Public page: <http://localhost:3000/>
- Admin: <http://localhost:3000/admin> — sign in with your `ADMIN_TOKEN`.

The database is created and seeded on first start, in `./data`. On a Pi, make
sure the bind-mounted directory is writable by uid 1000 (the container runs as
the unprivileged `node` user): `mkdir -p data && sudo chown 1000:1000 data`.

## Intended deployment

```
internet ──► tunnel / reverse proxy ──► linkhub  (public page only; /admin blocked)
LAN / VPN ────────────────────────────► linkhub  (admin reachable, token required)
```

Expose only the public page to the internet. Block the admin surface at the
proxy — in **Nginx Proxy Manager**, open your proxy host → *Advanced* →
*Custom Nginx Configuration* and add:

```nginx
location ~ ^/(admin|api/admin) {
    return 404;
}
```

`404` rather than `403` so the internet does not learn the path exists. Reach
the admin UI directly on the LAN/VPN (e.g. `http://<node-ip>:3000/admin`).

**Defence in depth:** the proxy block is a courtesy, not the security model.
Every request under `/admin` and `/api/admin` is token-checked by the app
itself, so a misconfigured or bypassed proxy still hits an authentication
wall. The only routes that exist outside the admin surface are the public
page, its stylesheet, the avatar, the redirect endpoint and the healthcheck —
none of them mutate anything.

## Configuration

Configuration is environment variables only:

| Variable      | Default | Purpose                                             |
| ------------- | ------- | --------------------------------------------------- |
| `ADMIN_TOKEN` | —       | Required. Shared secret for the admin surface.      |
| `PORT`        | `3000`  | Listen port.                                        |
| `DATA_DIR`    | `/data` | Where the SQLite database and avatar live.          |

### Avatar

Drop an image named `avatar.png`, `avatar.jpg`, `avatar.jpeg` or `avatar.webp`
into the data directory and it is served at `/avatar`. Without one, the page
shows your initials. No upload plumbing — it is a homelab; you have `scp`.

## Backup and restore

**Export** from the admin UI (*Backup → Export JSON*), or script it — the API
accepts the admin token as a bearer token, so a NAS cron job is one line:

```sh
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://linkhub.lan:3000/api/admin/export > linkhub-$(date +%F).json
```

**Restore** via *Backup → Import* (or `POST /api/admin/import`). Import
replaces the profile and all links atomically, preserves click counts, and
runs every row through the same validation as the write APIs — a doctored
backup file cannot smuggle in a `javascript:` URL, an unknown icon or a second
profile. Files with an unrecognised `schema_version` are rejected outright.

## Click counting

Each link visit goes through `/r/:id`, which increments an integer and issues
a 302. That is the entire analytics pipeline: no cookies, no IP addresses, no
user agents, nothing per-visitor. Request logging is disabled so IPs do not
even land in stdout.

**One exception:** email (`mailto:`) links render as direct hrefs and are not
counted, because in-app webviews — where most bio-link traffic lives — handle
a 302-to-mailto unreliably.

## Themes

Four restrained, typography-led themes — `minimal-light`, `minimal-dark`,
`ocean`, `midnight` — plus `auto`, which follows the visitor's
`prefers-color-scheme`. Themes are CSS custom property sets defined in code
([src/themes.ts](src/themes.ts)); all of them meet WCAG AA contrast, and the
layout is tested down to 320px wide.

## Security notes

- **Sessions** are stateless: an HMAC-signed cookie (`HttpOnly`,
  `SameSite=Strict`) keyed from `ADMIN_TOKEN`, carrying its issue time. The
  server enforces a 7-day maximum age, and rotating the token invalidates
  every session. The cookie is not marked `Secure` because the admin surface
  is intended for plain-HTTP LAN/VPN use; add TLS at the proxy if you expose
  it further.
- **Login** is rate limited in memory (5 attempts per IP per 15 minutes) with
  a constant delay on failure, and all token comparisons are constant-time.
  The limiter keys on the direct peer address (`trustProxy` is off, so
  forwarded headers cannot spoof it).
- **Headers**: CSP is `default-src 'none'` on the public page — it ships zero
  JavaScript, so no script source is allowed at all. `frame-ancestors 'self'`
  (rather than `none`) because the admin preview iframes the public page.
  Plus `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer` and
  `X-Content-Type-Options: nosniff` on every response.
- **Redirects**: `/r/:id` only ever redirects to a URL stored in the database,
  and URLs can only enter the database through a validator that allowlists
  `http:`, `https:` and `mailto:`. There is no query-driven redirect.

## Dependencies

Runtime dependencies, one line each:

- **fastify** — routing, hooks and injection-based testing without framework sprawl.
- **better-sqlite3** — synchronous embedded SQLite with ARM64 prebuilds; an ORM would outweigh this two-table schema.
- **@fastify/cookie** — cookie parsing/serialisation for the admin session.

Dev-only: `typescript` (strict build), `tsx` (dev server and test loader),
`@types/*`. Tests use `node --test` — no test framework dependency.

## Development

```sh
npm install
ADMIN_TOKEN=dev-token npm run dev   # http://localhost:3000
npm test                            # API test suite
npm run typecheck
```

On Windows PowerShell: `$env:ADMIN_TOKEN='dev-token'; npm run dev`.

The test suite covers the security-relevant paths: authentication required on
every admin route, rate limiting, session expiry and tampering, disabled links
absent from the page and 404 on redirect, scheme allowlisting on both the
write APIs and import, and an export/import round-trip.
