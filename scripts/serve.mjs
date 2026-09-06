import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, 'dist/client');
const portArg = process.argv.indexOf('--port');
const port = Number(
  portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT || 4318,
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Use a port from 1 to 65535.');
if (!existsSync(resolve(root, 'index.html'))) {
  process.stderr.write(
    'LocalFlow is not built yet. Run npm run build, then npm start.\n',
  );
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    const file = resolve(
      root,
      `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`,
    );
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  process.stdout.write(`LocalFlow ready at http://localhost:${port}/\n`),
);
