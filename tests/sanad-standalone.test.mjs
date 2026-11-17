import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
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

test('build destination cannot escape the repository or overwrite its root', t => {
  const dir = fixture(t);
  assert.notEqual(run(dir, join(dir, '..', 'outside-sanad')).status, 0);
  assert.notEqual(run(dir, dir).status, 0);
});
