// Smoke-test the exact portable Sanad Syria release as a standalone static site.
// The test server is loopback-only; it never publishes a site or submits requests.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sanad-syria');
const source = path.resolve(root, '..', '..', 'sanad');
const files = ['index.html', 'admin.html', 'sanad-demo.js', 'sanad-admin-demo.js'];
const allowlist = new Set(files);
let server;
let origin;

async function serve(request, response) {
  let pathname;
  try { pathname = new URL(request.url, 'http://localhost').pathname; }
  catch { response.writeHead(400).end(); return; }
  if (pathname.startsWith('/sanad-independent/')) pathname = pathname.slice('/sanad-independent/'.length);
  else pathname = pathname.slice(1);
  const name = pathname || 'index.html';
  if (!allowlist.has(name)) { response.writeHead(404).end('Not part of isolated Sanad release'); return; }
  try {
    response.writeHead(200, {
      'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(await readFile(path.join(root, name)));
  } catch { response.writeHead(500).end('Missing Sanad release file'); }
}

before(async () => {
  server = createServer((request, response) => { void serve(request, response); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});

test('Sanad release contains only four exact audited files', async () => {
  assert.deepEqual((await readdir(root)).sort(), [...files].sort());
  for (const name of files) {
    assert.deepEqual(await readFile(path.join(root, name)), await readFile(path.join(source, name)), name);
  }
});

test('Sanad homepage, demo administration and JS work from a standalone root', async () => {
  const base = await fetch(origin + '/');
  assert.equal(base.status, 200);
  assert.equal(await base.text(), await readFile(path.join(root, 'index.html'), 'utf8'));
  for (const name of files) {
    const response = await fetch(origin + '/' + name);
    assert.equal(response.status, 200, name);
    assert.match(response.headers.get('content-type'), name.endsWith('.html') ? /text\/html/ : /text\/javascript/);
    assert.equal(await response.text(), await readFile(path.join(root, name), 'utf8'));
  }
});

test('Sanad relative links and versioned script URLs work at a separate subpath', async () => {
  const prefix = origin + '/sanad-independent/';
  const cases = [
    ['index.html', './admin.html', 'sanad-demo.js?v=1'],
    ['admin.html', './index.html', 'sanad-admin-demo.js?v=1']
  ];
  for (const [name, href, script] of cases) {
    const response = await fetch(prefix + name);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('href="' + href + '"'), name + ' must link within Sanad');
    assert.ok(html.includes('src="' + script + '"'), name + ' must reference its own script');
    assert.equal((await fetch(new URL(href, prefix + name))).status, 200);
    assert.equal((await fetch(new URL(script, prefix + name))).status, 200);
  }
});

test('other projects, server APIs and arbitrary files are absent from Sanad package', async () => {
  for (const name of [
    '/seller.html', '/admin-preview.html', '/index.php', '/api/requests',
    '/sanad-independent/../../seller.html', '/sanad-independent/maison.css',
    '/sanad-independent/.env', '/sanad-independent/unknown.js'
  ]) {
    const response = await fetch(origin + name);
    assert.equal(response.status, 404, name);
  }
});

test('released public scripts cannot send browser-network requests', async () => {
  for (const name of files) {
    const code = await readFile(path.join(root, name), 'utf8');
    assert.doesNotMatch(code, /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b|sendBeacon\s*\()/i, name);
    assert.doesNotMatch(code, /<\s*(?:iframe|base)\b/i, name);
  }
});
