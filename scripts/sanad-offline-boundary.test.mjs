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
    "<img attributionsrc=\"https://example.com/collect\" src=\"index.html\">",
    "<a attributionsrc href=\"./admin.html\">Open</a>",
    "<table background=\"https://example.com/background.png\"></table>",
    "<html manifest=\"https://example.com/cache.appcache\">",
    '<button formaction="https://example.com/submit">Send</button>',
    '<video poster="https://example.com/poster.jpg"></video>',
    '<meta http-equiv="refresh" content="0;url=https://example.com">',
    '<img src=https://example.com/unquoted.png>',
    '<script src = https://example.com/unquoted.js></script>',
    '<link href = "../maison/styles.css" rel="stylesheet">',
    '<img src = "/shared/logo.png">',
    '<iframe src="https://example.com/embed"></iframe>',
    '<object data="/private/document"></object>',
    '<embed src="https://example.com/widget">',
    '<base href="https://example.com/">',
    '<script>window.open("https://example.com/escape")</script>',
    '<script>location.assign("https://example.com/escape")</script>',
    '<script>document.location.href = "https://example.com/escape"</script>',
    '<script>new Worker("https://example.com/worker.js")</script>',
    '<script>new SharedWorker("https://example.com/shared-worker.js")</script>',
    '<script>location = "https://example.com/escape"</script>',
    '<script>window.location = "https://example.com/escape"</script>',
    '<script>document.location = "https://example.com/escape"</script>',

  ]) {
    writeFileSync(html, original.replace('</head>', payload + '</head>'));
    const result = check();
    assert.notEqual(result.status, 0, 'Must reject injected network dependency: ' + payload);
    assert.match(result.stderr, /forbidden|Network behavior|Unreviewed navigation or worker behavior|Non-portable Sanad asset/);
  }
  writeFileSync(html, original);
  assert.equal(check().status, 0, 'Restored preview must validate');
  console.log('Sanad offline boundary: boundary assertions passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
