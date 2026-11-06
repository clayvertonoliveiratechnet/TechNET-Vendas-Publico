import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const host = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

function safePath(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = resolve(root, relative || 'index.html');
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

async function existingFile(pathname) {
  const candidate = safePath(pathname);
  if (!candidate) return { status: 403 };
  try {
    const info = await stat(candidate);
    if (info.isFile()) return { status: 200, path: candidate };
  } catch {}
  if (!extname(candidate)) {
    return { status: 200, path: resolve(root, 'index.html') };
  }
  return { status: 404 };
}

const server = createServer(async (req, res) => {
  if (!req.url || !['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405).end();
    return;
  }

  const url = new URL(req.url, `http://${host}:${port}`);
  const file = await existingFile(url.pathname);
  if (!file.path) {
    res.writeHead(file.status, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(file.status === 403 ? 'Forbidden' : 'Not found');
    return;
  }

  const type = contentTypes.get(extname(file.path).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file.path).pipe(res);
});

server.listen(port, host, () => {
  console.log(`TECHNET E2E server listening on http://${host}:${port}`);
});
