import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
const app = buildApp(cfg);

try {
  await app.listen({ port: cfg.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
