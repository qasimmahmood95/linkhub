import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearer, makeApp } from './helpers.js';

const jsonHeaders = { ...bearer, 'content-type': 'application/json' };

test('export/import round-trip preserves the full config, including click counts', async () => {
  const source = await makeApp();
  const target = await makeApp();
  try {
    // Make the source distinctive: a click, a divider, a profile change.
    await source.app.inject({ method: 'GET', url: '/r/1' });
    await source.app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: jsonHeaders,
      payload: { kind: 'divider', label: 'Elsewhere' },
    });
    await source.app.inject({
      method: 'PUT',
      url: '/api/admin/profile',
      headers: jsonHeaders,
      payload: { name: 'Qasim Mahmood', title: 'Senior SDET', theme: 'midnight' },
    });

    const exported = (await source.app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer })).json();

    const imported = await target.app.inject({
      method: 'POST',
      url: '/api/admin/import',
      headers: jsonHeaders,
      payload: exported,
    });
    assert.equal(imported.statusCode, 200);

    const reExported = (await target.app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer })).json();
    delete exported.exported_at;
    delete reExported.exported_at;
    assert.deepEqual(reExported, exported);
  } finally {
    await source.close();
    await target.close();
  }
});

test('import rejects an unknown schema_version and changes nothing', async () => {
  const { app, close } = await makeApp();
  try {
    const exported = (await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer })).json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/import',
      headers: jsonHeaders,
      payload: { ...exported, schema_version: 2 },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /schema_version/);
  } finally {
    await close();
  }
});

test('import rejects a javascript: URL and leaves the database untouched', async () => {
  const { app, close } = await makeApp();
  try {
    const before = (await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer })).json();

    const payload = structuredClone(before);
    payload.links[0].url = 'javascript:alert(document.cookie)';
    const res = await app.inject({ method: 'POST', url: '/api/admin/import', headers: jsonHeaders, payload });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /scheme/);

    const after = (await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer })).json();
    delete before.exported_at;
    delete after.exported_at;
    assert.deepEqual(after, before, 'a rejected import must not modify anything');
  } finally {
    await close();
  }
});

test('import enforces the same row-level rules as the write APIs', async () => {
  const { app, close } = await makeApp();
  try {
    const base = (await app.inject({ method: 'GET', url: '/api/admin/export', headers: bearer })).json();

    const cases: { mutate: (p: typeof base) => void; expect: RegExp }[] = [
      { mutate: (p) => (p.links[0].icon = 'sparkles'), expect: /icon/ },
      { mutate: (p) => p.links.push({ kind: 'divider', label: 'x', url: 'https://a.example' }), expect: /divider/ },
      { mutate: (p) => (p.links[0].click_count = -5), expect: /click_count/ },
      { mutate: (p) => (p.profile = [p.profile]), expect: /profile/ },
      { mutate: (p) => (p.profile.theme = 'glitter'), expect: /theme/ },
    ];
    for (const { mutate, expect } of cases) {
      const payload = structuredClone(base);
      mutate(payload);
      const res = await app.inject({ method: 'POST', url: '/api/admin/import', headers: jsonHeaders, payload });
      assert.equal(res.statusCode, 400);
      assert.match(res.json().error, expect);
    }
  } finally {
    await close();
  }
});

test('import replaces the previous configuration entirely', async () => {
  const { app, close } = await makeApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/import',
      headers: jsonHeaders,
      payload: {
        schema_version: 1,
        profile: { name: 'Someone Else', title: '', theme: 'ocean' },
        links: [{ kind: 'link', label: 'Only link', url: 'https://only.example', icon: null, enabled: true }],
      },
    });
    assert.equal(res.statusCode, 200);

    const page = await app.inject({ method: 'GET', url: '/' });
    assert.match(page.body, /Someone Else/);
    assert.match(page.body, /Only link/);
    assert.doesNotMatch(page.body, /GitHub/);
  } finally {
    await close();
  }
});
