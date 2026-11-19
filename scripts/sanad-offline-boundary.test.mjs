import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'sanad-offline-test-'));
const scripts = join(sandbox, 'scripts');
const sanad = join(sandbox, 'sanad');
mkdirSync(scripts);
try {
  cpSync(join(root, 'scripts/build-sanad-standalone.mjs'), join(scripts, 'build-sanad-standalone.mjs'));
  // The sandbox needs ESM semantics independently of the repository package settings.
  writeFileSync(join(sandbox, 'package.json'), '{"type":"module"}');
  cpSync(join(root, 'sanad'), sanad, { recursive: true });
  const html = join(sanad, 'index.html');
  const original = readFileSync(html, 'utf8');
  const check = () => spawnSync(process.execPath, [join(scripts, 'build-sanad-standalone.mjs'), '--check'], { cwd: sandbox, encoding: 'utf8' });
  assert.equal(check().status, 0, 'Original standalone preview must validate');
  for (const payload of [
    '<script>fetch("/private")</script>',
    '<script>navigator.sendBeacon("/collect", "x")</script>',
    '<style>@import "https://example.com/a.css";</style>',
    '<form action="/submit"></form>',
    '<img srcset="https://example.com/picture.jpg 2x">',
    '<button formaction="https://example.com/submit">Send</button>',
    '<video poster="https://example.com/poster.jpg"></video>',
    '<meta http-equiv="refresh" content="0;url=https://example.com">',

  ]) {
    writeFileSync(html, original.replace('</head>', payload + '</head>'));
    const result = check();
    assert.notEqual(result.status, 0, 'Must reject injected network dependency: ' + payload);
    assert.match(result.stderr, /forbidden|Network behavior/);
  }
  writeFileSync(html, original);
  assert.equal(check().status, 0, 'Restored preview must validate');
  console.log('Sanad offline boundary: 10 assertions passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
