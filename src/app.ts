import fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { Config } from './config.js';
import { createRepo, openDb } from './db.js';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes } from './routes/public.js';
import { PUBLIC_CSP } from './security.js';

export function buildApp(cfg: Config): FastifyInstance {
  const app = fastify({
    logger: cfg.logger ? { level: 'info' } : false,
    // No per-request logging: the app stores no IPs and keeps none in its logs.
    disableRequestLogging: true,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  app.register(fastifyCookie);

  // Six-line urlencoded parser for the login form; saves a dependency.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, doneParsing) => {
      const out: Record<string, string> = {};
      for (const [key, value] of new URLSearchParams(body as string)) out[key] = value;
      doneParsing(null, out);
    }
  );

  const db = openDb(cfg.dataDir);
  const repo = createRepo(db);

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    if (!reply.hasHeader('Content-Security-Policy')) {
      reply.header('Content-Security-Policy', PUBLIC_CSP);
    }
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).type('text/plain; charset=utf-8').send('Not found');
  });

  app.register(publicRoutes, { repo, cfg });
  app.register(adminRoutes, { repo, cfg });

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
