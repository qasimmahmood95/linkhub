import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearer, makeApp } from './helpers.js';

// Seed order: 1 GitHub, 2 Personal site, 3 Email (mailto), 4 LinkedIn (disabled).

test('public page renders enabled links, hides disabled ones, and links mailto directly', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /GitHub/);
    assert.match(res.body, /href="\/r\/1"/, 'http links go through the counting redirect');
    assert.match(res.body, /href="mailto:qasimm999@gmail.com"/, 'mailto renders as a direct href');
    assert.doesNotMatch(res.body, /href="\/r\/3"/, 'mailto must not use the redirect');
    assert.doesNotMatch(res.body, /LinkedIn/, 'disabled links are absent');
    assert.doesNotMatch(res.body, /<script/i, 'public page ships no client JS');
  } finally {
    await close();
  }
});

test('public page sets the security headers', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.match(String(res.headers['content-security-policy']), /default-src 'none'/);
    assert.match(String(res.headers['content-security-policy']), /frame-ancestors 'self'/);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  } finally {
    await close();
  }
});

test('redirect endpoint follows enabled links and counts the click', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/r/1' });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, 'https://github.com/qasimmahmood95');

    const exported = await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer });
    const github = exported.json().links.find((l: { label: string }) => l.label === 'GitHub');
    assert.equal(github.click_count, 1);
  } finally {
    await close();
  }
});

test('redirect endpoint 404s for disabled links, mailto links, unknown ids and junk', async () => {
  const { app, close } = await makeApp();
  try {
    for (const url of ['/r/4', '/r/3', '/r/999', '/r/abc', '/r/-1']) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 404, `${url} must 404`);
      assert.equal(res.headers.location, undefined);
    }
    // The refused mailto hit must not have counted.
    const exported = await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer });
    const email = exported.json().links.find((l: { label: string }) => l.label === 'Email me');
    assert.equal(email.click_count, 0);
  } finally {
    await close();
  }
});

test('disabling a link removes it from the page and its redirect', async () => {
  const { app, close } = await makeApp();
  try {
    const disable = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/1',
      headers: { ...bearer, 'content-type': 'application/json' },
      payload: { enabled: false },
    });
    assert.equal(disable.statusCode, 200);

    const page = await app.inject({ method: 'GET', url: '/' });
    assert.doesNotMatch(page.body, /GitHub/);
    const redirect = await app.inject({ method: 'GET', url: '/r/1' });
    assert.equal(redirect.statusCode, 404);

    const enable = await app.inject({
      method: 'PUT',
      url: '/api/admin/links/1',
      headers: { ...bearer, 'content-type': 'application/json' },
      payload: { enabled: true },
    });
    assert.equal(enable.statusCode, 200);
    const pageAgain = await app.inject({ method: 'GET', url: '/' });
    assert.match(pageAgain.body, /GitHub/);
  } finally {
    await close();
  }
});

test('dividers render as section headings and never as buttons', async () => {
  const { app, close } = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { ...bearer, 'content-type': 'application/json' },
      payload: { kind: 'divider', label: 'Elsewhere' },
    });
    assert.equal(created.statusCode, 201);
    const id = created.json().id;

    const page = await app.inject({ method: 'GET', url: '/' });
    assert.match(page.body, /<h2 class="section-heading">Elsewhere<\/h2>/);
    const redirect = await app.inject({ method: 'GET', url: `/r/${id}` });
    assert.equal(redirect.statusCode, 404, 'a divider has no redirect');
  } finally {
    await close();
  }
});

test('link labels are HTML-escaped on the public page', async () => {
  const { app, close } = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { ...bearer, 'content-type': 'application/json' },
      payload: { label: '<img src=x onerror=alert(1)>', url: 'https://example.com' },
    });
    assert.equal(created.statusCode, 201);
    const page = await app.inject({ method: 'GET', url: '/' });
    assert.doesNotMatch(page.body, /<img src=x/);
    assert.match(page.body, /&lt;img src=x/);
  } finally {
    await close();
  }
});

test('the write API rejects javascript: and other non-allowlisted schemes', async () => {
  const { app, close } = await makeApp();
  try {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.example']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/links',
        headers: { ...bearer, 'content-type': 'application/json' },
        payload: { label: 'bad', url },
      });
      assert.equal(res.statusCode, 400, `${url} must be rejected`);
    }
  } finally {
    await close();
  }
});

test('healthcheck responds ok', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok' });
  } finally {
    await close();
  }
});
