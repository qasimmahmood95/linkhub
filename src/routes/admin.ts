import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import {
  LoginRateLimiter,
  deriveSessionKey,
  signSession,
  sleep,
  tokenMatches,
  verifySession,
} from '../auth.js';
import { SESSION_COOKIE, type Config } from '../config.js';
import { adminCss, adminJs } from '../admin-assets.js';
import { renderAdminPage } from '../render/admin-page.js';
import { renderLoginPage } from '../render/login-page.js';
import { renderPublicPage } from '../render/public-page.js';
import { findAvatar } from './public.js';
import { ADMIN_CSP } from '../security.js';
import { isThemeChoice } from '../themes.js';
import {
  ValidationError,
  validateImport,
  validateLinkUpdate,
  validateNewLink,
  validateProfile,
} from '../validation.js';
import type { Repo } from '../db.js';

export interface AdminDeps {
  repo: Repo;
  cfg: Config;
}

function parseId(rawId: unknown): number {
  if (typeof rawId !== 'string' || !/^\d{1,10}$/.test(rawId)) {
    throw new ValidationError('invalid id');
  }
  return Number(rawId);
}

/**
 * Every route in this plugin — the whole admin surface — sits behind the
 * onRequest guard below. No mutating route exists outside this plugin, so the
 * token is enforced even if the reverse-proxy block on /admin ever fails.
 */
export const adminRoutes: FastifyPluginCallback<AdminDeps> = (app, { repo, cfg }, done) => {
  const sessionKey = deriveSessionKey(cfg.adminToken);
  const limiter = new LoginRateLimiter(cfg.loginRateLimit.max, cfg.loginRateLimit.windowMs);

  // The login page and its stylesheet are the only unauthenticated routes
  // here; both are non-mutating.
  const OPEN_ROUTES = new Set(['/admin/login', '/admin/admin.css']);

  const hasValidCookie = (req: FastifyRequest): boolean => {
    const cookie = req.cookies[SESSION_COOKIE];
    return typeof cookie === 'string' && verifySession(sessionKey, cookie, cfg.sessionMaxAgeMs);
  };

  app.addHook('onRequest', async (req, reply) => {
    const routePath = req.routeOptions.url ?? '';
    if (OPEN_ROUTES.has(routePath)) return;
    if (routePath.startsWith('/api/admin')) {
      // Bearer auth on the API makes scripted use (NAS backup cron) painless.
      const header = req.headers.authorization;
      if (
        typeof header === 'string' &&
        header.startsWith('Bearer ') &&
        tokenMatches(cfg.adminToken, header.slice('Bearer '.length))
      ) {
        return;
      }
    }
    if (hasValidCookie(req)) return;
    if (routePath.startsWith('/api/')) {
      return reply.code(401).send({ error: 'authentication required' });
    }
    return reply.redirect('/admin/login', 302);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ValidationError) {
      return reply.code(400).send({ error: err.message });
    }
    // Body-parser errors (invalid JSON, wrong content type) carry 4xx codes.
    const known = err as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof known.statusCode === 'number' ? known.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: String(known.message ?? 'bad request') });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal error' });
  });

  const sendHtml = (reply: FastifyReply, body: string, status = 200) =>
    reply
      .code(status)
      .type('text/html; charset=utf-8')
      .header('Content-Security-Policy', ADMIN_CSP)
      .send(body);

  // ---- Pages ----

  app.get('/admin', async (_req, reply) => {
    return sendHtml(reply, renderAdminPage(repo.getProfile(), repo.listLinks()));
  });

  app.get('/admin/login', async (req, reply) => {
    if (hasValidCookie(req)) return reply.redirect('/admin', 302);
    return sendHtml(reply, renderLoginPage());
  });

  app.post('/admin/login', async (req, reply) => {
    const ip = req.ip;
    if (limiter.isBlocked(ip)) {
      return sendHtml(reply, renderLoginPage('Too many attempts. Try again in a few minutes.'), 429);
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token : '';
    if (token !== '' && tokenMatches(cfg.adminToken, token)) {
      limiter.reset(ip);
      reply.setCookie(SESSION_COOKIE, signSession(sessionKey, Date.now()), {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: Math.floor(cfg.sessionMaxAgeMs / 1000),
      });
      return reply.redirect('/admin', 303);
    }
    limiter.recordFailure(ip);
    await sleep(cfg.loginDelayMs); // constant delay: slows brute force, masks timing
    return sendHtml(reply, renderLoginPage('That token is not correct.'), 401);
  });

  app.post('/admin/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.redirect('/admin/login', 303);
  });

  app.get('/admin/preview', async (req, reply) => {
    const requested = (req.query as Record<string, unknown>).theme;
    const page = renderPublicPage(repo.getProfile(), repo.listEnabledLinks(), {
      ...(isThemeChoice(requested) ? { theme: requested } : {}),
      hasAvatar: findAvatar(cfg.dataDir) !== null,
    });
    return sendHtml(reply, page);
  });

  // ---- Admin static assets ----

  app.get('/admin/admin.css', async (_req, reply) => {
    reply.type('text/css; charset=utf-8').header('Cache-Control', 'public, max-age=300');
    return adminCss;
  });

  app.get('/admin/app.js', async (_req, reply) => {
    reply.type('application/javascript; charset=utf-8').header('Cache-Control', 'public, max-age=300');
    return adminJs;
  });

  // ---- API ----

  app.put('/api/admin/profile', async (req) => {
    repo.updateProfile(validateProfile(req.body));
    return { ok: true };
  });

  app.post('/api/admin/links', async (req, reply) => {
    const id = repo.createLink(validateNewLink(req.body));
    reply.code(201);
    return { ok: true, id };
  });

  app.put('/api/admin/links/:id', async (req, reply) => {
    const id = parseId((req.params as Record<string, unknown>).id);
    const existing = repo.getLink(id);
    if (!existing) return reply.code(404).send({ error: 'link not found' });
    repo.updateLink(id, validateLinkUpdate(req.body, existing.kind));
    return { ok: true };
  });

  app.delete('/api/admin/links/:id', async (req, reply) => {
    const id = parseId((req.params as Record<string, unknown>).id);
    if (!repo.deleteLink(id)) return reply.code(404).send({ error: 'link not found' });
    return { ok: true };
  });

  app.post('/api/admin/links/:id/move', async (req, reply) => {
    const id = parseId((req.params as Record<string, unknown>).id);
    const direction = ((req.body ?? {}) as Record<string, unknown>).direction;
    if (direction !== 'up' && direction !== 'down') {
      throw new ValidationError("direction must be 'up' or 'down'");
    }
    const result = repo.moveLink(id, direction);
    if (result === 'not-found') return reply.code(404).send({ error: 'link not found' });
    return { ok: true, moved: result === 'moved' };
  });

  app.get('/api/admin/export', async (_req, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="linkhub-export.json"');
    return repo.exportConfig();
  });

  app.post('/api/admin/import', async (req) => {
    const payload = validateImport(req.body);
    repo.importConfig(payload);
    return { ok: true, links: payload.links.length };
  });

  done();
};
