import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';

export const TEST_TOKEN = 'correct-horse-battery-staple';

export const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    adminToken: TEST_TOKEN,
    dataDir: mkdtempSync(join(tmpdir(), 'linkhub-test-')),
    loginDelayMs: 25,
    sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    loginRateLimit: { max: 5, windowMs: 15 * 60 * 1000 },
    logger: false,
    ...overrides,
  };
}

export interface TestApp {
  app: FastifyInstance;
  cfg: Config;
  close(): Promise<void>;
}

export async function makeApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const cfg = testConfig(overrides);
  const app = buildApp(cfg);
  await app.ready();
  return {
    app,
    cfg,
    async close() {
      await app.close();
      rmSync(cfg.dataDir, { recursive: true, force: true });
    },
  };
}

/** Logs in with the real token and returns the session cookie value. */
export async function loginCookie(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: `token=${encodeURIComponent(TEST_TOKEN)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  const setCookie = res.headers['set-cookie'];
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!first) throw new Error('login did not set a cookie');
  return first.split(';')[0] ?? '';
}
