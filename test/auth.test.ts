import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSessionKey, signSession } from '../src/auth.js';
import { SESSION_COOKIE } from '../src/config.js';
import { TEST_TOKEN, bearer, loginCookie, makeApp } from './helpers.js';

const MUTATING_ROUTES: { method: 'POST' | 'PUT' | 'DELETE' | 'GET'; url: string }[] = [
  { method: 'PUT', url: '/api/admin/profile' },
  { method: 'POST', url: '/api/admin/links' },
  { method: 'PUT', url: '/api/admin/links/1' },
  { method: 'DELETE', url: '/api/admin/links/1' },
  { method: 'POST', url: '/api/admin/links/1/move' },
  { method: 'POST', url: '/api/admin/import' },
  { method: 'GET', url: '/api/admin/export' },
];

test('every admin API route rejects unauthenticated requests', async () => {
  const { app, close } = await makeApp();
  try {
    for (const route of MUTATING_ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        ...(route.method === 'GET' ? {} : { payload: {}, headers: { 'content-type': 'application/json' } }),
      });
      assert.equal(res.statusCode, 401, `${route.method} ${route.url} must require auth`);
    }
  } finally {
    await close();
  }
});

test('admin API routes reject a wrong bearer token', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/export',
      headers: { authorization: 'Bearer not-the-token' },
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await close();
  }
});

test('admin pages redirect unauthenticated requests to the login page', async () => {
  const { app, close } = await makeApp();
  try {
    for (const url of ['/admin', '/admin/preview', '/admin/app.js']) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 302, `${url} must redirect`);
      assert.equal(res.headers.location, '/admin/login');
    }
  } finally {
    await close();
  }
});

test('a correct bearer token grants API access', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().schema_version, 1);
  } finally {
    await close();
  }
});

test('login flow: wrong token is delayed and rejected, right token sets a working cookie', async () => {
  const { app, cfg, close } = await makeApp({ loginDelayMs: 50 });
  try {
    const started = Date.now();
    const bad = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'token=wrong',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(bad.statusCode, 401);
    assert.ok(Date.now() - started >= cfg.loginDelayMs - 5, 'failed login must be delayed');
    assert.equal(bad.headers['set-cookie'], undefined);

    const cookie = await loginCookie(app);
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
    const page = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Profile/);
  } finally {
    await close();
  }
});

test('login is rate limited per IP after 5 failures, even for the correct token', async () => {
  const { app, close } = await makeApp({ loginDelayMs: 1 });
  try {
    const attacker = '203.0.113.7';
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/login',
        remoteAddress: attacker,
        payload: 'token=wrong',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      assert.equal(res.statusCode, 401);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/admin/login',
      remoteAddress: attacker,
      payload: `token=${encodeURIComponent(TEST_TOKEN)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(blocked.statusCode, 429, 'the correct token must still be blocked once limited');
    assert.equal(blocked.headers['set-cookie'], undefined);

    // A different IP is unaffected.
    const other = await app.inject({
      method: 'POST',
      url: '/admin/login',
      remoteAddress: '198.51.100.9',
      payload: `token=${encodeURIComponent(TEST_TOKEN)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(other.statusCode, 303);
  } finally {
    await close();
  }
});

test('session cookies older than the max age are rejected', async () => {
  const { app, close } = await makeApp();
  try {
    const key = deriveSessionKey(TEST_TOKEN);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const expired = `${SESSION_COOKIE}=${signSession(key, eightDaysAgo)}`;
    const page = await app.inject({ method: 'GET', url: '/admin', headers: { cookie: expired } });
    assert.equal(page.statusCode, 302);
    const api = await app.inject({ method: 'GET', url: '/api/admin/export', headers: { cookie: expired } });
    assert.equal(api.statusCode, 401);
  } finally {
    await close();
  }
});

test('tampered session cookies are rejected', async () => {
  const { app, close } = await makeApp();
  try {
    const cookie = await loginCookie(app);
    const tampered = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');
    const res = await app.inject({ method: 'GET', url: '/api/admin/export', headers: { cookie: tampered } });
    assert.equal(res.statusCode, 401);
  } finally {
    await close();
  }
});
