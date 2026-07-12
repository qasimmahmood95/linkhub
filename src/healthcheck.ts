// Docker HEALTHCHECK probe: the slim base image has no curl/wget.
import http from 'node:http';

const port = Number(process.env.PORT ?? 3000);

const req = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 2500 }, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
