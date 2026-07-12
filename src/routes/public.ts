import type { FastifyPluginCallback } from 'fastify';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicCss } from '../styles.js';
import { renderPublicPage } from '../render/public-page.js';
import type { Config } from '../config.js';
import type { Repo } from '../db.js';

export interface PublicDeps {
  repo: Repo;
  cfg: Config;
}

const AVATAR_CANDIDATES: readonly [string, string][] = [
  ['avatar.png', 'image/png'],
  ['avatar.jpg', 'image/jpeg'],
  ['avatar.jpeg', 'image/jpeg'],
  ['avatar.webp', 'image/webp'],
];

export function findAvatar(dataDir: string): { path: string; mime: string } | null {
  for (const [name, mime] of AVATAR_CANDIDATES) {
    const path = join(dataDir, name);
    if (existsSync(path)) return { path, mime };
  }
  return null;
}

export const publicRoutes: FastifyPluginCallback<PublicDeps> = (app, { repo, cfg }, done) => {
  app.get('/', async (_req, reply) => {
    reply.type('text/html; charset=utf-8');
    return renderPublicPage(repo.getProfile(), repo.listEnabledLinks(), {
      hasAvatar: findAvatar(cfg.dataDir) !== null,
    });
  });

  app.get('/styles.css', async (_req, reply) => {
    reply.type('text/css; charset=utf-8').header('Cache-Control', 'public, max-age=300');
    return publicCss;
  });

  // The redirect target comes only from the database row — never from query
  // input — and only for enabled, non-mailto links. Anything else is a 404.
  app.get('/r/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d{1,10}$/.test(id)) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    }
    const url = repo.recordClick(Number(id));
    if (url === null) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    }
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(url, 302);
  });

  app.get('/avatar', async (_req, reply) => {
    const avatar = findAvatar(cfg.dataDir);
    if (avatar === null) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    }
    reply.type(avatar.mime).header('Cache-Control', 'public, max-age=300');
    return readFile(avatar.path);
  });

  app.get('/healthz', async () => {
    repo.ping();
    return { status: 'ok' };
  });

  done();
};
