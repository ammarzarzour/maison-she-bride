import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const builder = fileURLToPath(new URL('../scripts/build-sanad-standalone.mjs', import.meta.url));
const names = ['index.html', 'admin.html', 'sanad-demo.js', 'sanad-admin-demo.js'];

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sanad-isolation-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'sanad'));
  cpSync(builder, join(dir, 'scripts', 'build-sanad-standalone.mjs'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of names) writeFileSync(join(dir, 'sanad', name),
    name.endsWith('.html') ? '<script src="./sanad-demo.js"></script>' : 'const preview = true;');
  return dir;
}
function run(dir, ...args) {
  return spawnSync(process.execPath, [join(dir, 'scripts', 'build-sanad-standalone.mjs'), ...args], { encoding: 'utf8' });
}

test('portable preview builds only the approved four assets', t => {
  const dir = fixture(t);
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  for (const name of names) {
    assert.equal(readFileSync(join(dir, 'dist', 'sanad-syria', name), 'utf8'),
      readFileSync(join(dir, 'sanad', name), 'utf8'));
  }
  assert.equal(existsSync(join(dir, 'dist', 'sanad-syria', 'package.json')), false);
});

test('check mode does not create output', t => {
  const dir = fixture(t);
  const result = run(dir, '--check');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validation passed/);
  assert.equal(existsSync(join(dir, 'dist')), false);
});

test('check mode also accepts a destination before the flag without writing output', t => {
  const dir = fixture(t);
  const output = join(dir, 'dist', 'other-preview');
  const result = run(dir, output, '--check');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, 'dist')), false);
});

test('unknown command flags and multiple destinations are rejected', t => {
  const dir = fixture(t);
  assert.notEqual(run(dir, '--not-a-flag').status, 0);
  assert.notEqual(run(dir, join(dir, 'dist', 'a'), join(dir, 'dist', 'b')).status, 0);
});

test('external and parent-relative assets are rejected', t => {
  for (const href of ['https://example.org/x.js', '../store.js', '/shared.js', 'javascript:alert(1)']) {
    const dir = fixture(t);
    writeFileSync(join(dir, 'sanad', 'index.html'), '<script src="' + href + '"></script>');
    assert.notEqual(run(dir, '--check').status, 0, href);
  }
});

test('network-capable scripts and missing assets are rejected', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'sanad', 'sanad-demo.js'), 'fetch("/api")');
  assert.notEqual(run(dir, '--check').status, 0);
  rmSync(join(dir, 'sanad', 'admin.html'));
  assert.notEqual(run(dir, '--check').status, 0);
});

test('network APIs remain forbidden in the isolated demo package', t => {
  for (const code of ['fetch("/api")', 'new XMLHttpRequest()', 'new WebSocket("wss://example.invalid")']) {
    const dir = fixture(t);
    writeFileSync(join(dir, 'sanad', 'sanad-admin-demo.js'), code);
    const result = run(dir, '--check');
    assert.notEqual(result.status, 0, code);
  }
});

test('build destination cannot escape the repository or overwrite its root', t => {
  const dir = fixture(t);
  assert.notEqual(run(dir, join(dir, '..', 'outside-sanad')).status, 0);
  assert.notEqual(run(dir, dir).status, 0);
  // Never delete the standalone source directory or any of its descendants.
  const source = join(dir, 'sanad');
  const nested = join(source, 'nested-output');
  assert.notEqual(run(dir, source).status, 0);
  assert.notEqual(run(dir, nested).status, 0);
  assert.equal(existsSync(join(source, 'index.html')), true);
  assert.equal(existsSync(nested), false);
});

test('build refuses unrelated repository directories and preserves their contents', t => {
  const dir = fixture(t);
  const backend = join(dir, 'backend');
  mkdirSync(backend);
  writeFileSync(join(backend, 'keep.txt'), 'protected');
  assert.notEqual(run(dir, backend).status, 0);
  assert.equal(readFileSync(join(backend, 'keep.txt'), 'utf8'), 'protected');
});

test('build never deletes unrelated files in an existing dist target', t => {
  const dir = fixture(t);
  const output = join(dir, 'dist', 'sanad-syria');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'keep.txt'), 'protected');
  assert.notEqual(run(dir).status, 0);
  assert.equal(readFileSync(join(output, 'keep.txt'), 'utf8'), 'protected');
  assert.equal(existsSync(join(output, 'index.html')), false);
});

test('build can refresh its own four-file output', t => {
  const dir = fixture(t);
  assert.equal(run(dir).status, 0);
  writeFileSync(join(dir, 'sanad', 'index.html'), '<script src="./sanad-demo.js"></script><p>updated</p>');
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, 'dist', 'sanad-syria', 'index.html'), 'utf8'), /updated/);
});


test('build rejects symlinked dist directory without modifying source files', t => {
  const dir = fixture(t);
  const outputRoot = join(dir, 'dist');
  symlinkSync(join(dir, 'sanad'), outputRoot, 'dir');
  const original = readFileSync(join(dir, 'sanad', 'index.html'), 'utf8');
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlinked build output directory/);
  assert.equal(readFileSync(join(dir, 'sanad', 'index.html'), 'utf8'), original);
  assert.equal(existsSync(join(dir, 'sanad', 'sanad-syria')), false);
});

test('build rejects symlinked nested output ancestors', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, 'dist'));
  symlinkSync(join(dir, 'sanad'), join(dir, 'dist', 'redirect'), 'dir');
  const result = run(dir, join(dir, 'dist', 'redirect', 'release'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlinked build output directory/);
  assert.equal(existsSync(join(dir, 'sanad', 'release')), false);
});

test('unquoted src and href attributes cannot bypass portable asset checks', t => {
  for (const html of [
    '<script src=https://example.invalid/x.js></script>',
    '<link href=../maison.css rel=stylesheet>',
    '<script src=./sanad-demo.js></script>'
  ]) {
    const dir = fixture(t);
    writeFileSync(join(dir, 'sanad', 'index.html'), html);
    const result = run(dir, '--check');
    assert.notEqual(result.status, 0, html);
    assert.match(result.stderr, /Unquoted HTML resource attribute forbidden/);
    assert.equal(existsSync(join(dir, 'dist')), false);
  }
});
