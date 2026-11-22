import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Protect the portable Sanad preview's language and independence contract.
const asset = name => readFileSync(new URL(`../sanad/${name}`, import.meta.url), 'utf8');

for (const page of ['index.html', 'admin.html']) {
  test(`${page} exposes the same bilingual language choices`, () => {
    const html = asset(page);
    assert.match(html, /<html\b[^>]*\blang=["']ar["'][^>]*\bdir=["']rtl["']/i);
    assert.match(html, /<select\b[^>]*\bid=["']language["']/i);
    for (const value of ['auto', 'ar', 'en']) {
      assert.match(html, new RegExp(`<option\\s+value=["']${value}["']`, 'i'));
    }
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["'][^"']*(?:maison-she-bride|\.\.\/)/i);
  });
}

test('both independent pages share a language preference and update HTML direction', () => {
  const publicScript = asset('index.html');
  const adminScript = asset('sanad-admin-demo.js');
  for (const script of [publicScript, adminScript]) {
    assert.match(script, /sanad_lang/);
    assert.match(script, /document\.documentElement\.lang\s*=/);
    assert.match(script, /document\.documentElement\.dir\s*=/);
    assert.match(script, /localStorage\.setItem\(/);
  }
});

test('standalone pages identify themselves as previews, not production services', () => {
  assert.match(asset('index.html'), /نسخة تجريبية غير رسمية/);
  assert.match(asset('admin.html'), /تجريبية/);
  assert.match(asset('sanad-admin-demo.js'), /not secure administration/);
});
