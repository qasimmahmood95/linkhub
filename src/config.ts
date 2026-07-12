export interface Config {
  port: number;
  adminToken: string;
  dataDir: string;
  /** Constant delay applied before responding to a failed login attempt. */
  loginDelayMs: number;
  /** Server-enforced maximum age of a session, measured from issue time. */
  sessionMaxAgeMs: number;
  loginRateLimit: { max: number; windowMs: number };
  logger: boolean;
}

export const SESSION_COOKIE = 'linkhub_session';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const adminToken = env.ADMIN_TOKEN ?? '';
  if (adminToken.trim() === '') {
    throw new Error(
      'ADMIN_TOKEN must be set to a long random string; it protects the admin surface. ' +
        'Generate one with: openssl rand -base64 32'
    );
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid port number');
  }
  return {
    port,
    adminToken,
    dataDir: env.DATA_DIR ?? './data',
    loginDelayMs: 500,
    sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    loginRateLimit: { max: 5, windowMs: 15 * 60 * 1000 },
    logger: true,
  };
}
