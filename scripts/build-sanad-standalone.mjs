#!/usr/bin/env node
// Build a portable, self-contained Sanad Syria preview without Maison She Bride assets.
// This is a static demonstration only; it does not provide authentication or a backend.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'sanad');
const files = ['index.html', 'admin.html', 'sanad-demo.js', 'sanad-admin-demo.js'];
const args = process.argv.slice(2);
const check = args.includes('--check');
const destinations = args.filter(arg => arg !== '--check');
if (destinations.length > 1 || args.some(arg => arg.startsWith('--') && arg !== '--check')) {
  throw new Error('Usage: node scripts/build-sanad-standalone.mjs [destination] [--check]');
}
const outputRoot = join(root, 'dist');
const destination = resolve(destinations[0] || join(outputRoot, 'sanad-syria'));
if (!destination.startsWith(outputRoot + sep)) {
  throw new Error('Destination must be a separate directory inside the repository');
}
// Reject symlinked output ancestors: a lexical dist/ path may otherwise resolve
// into the source tree or outside the repository when copied to disk.
let outputParent = outputRoot;
while (true) {
  if (existsSync(outputParent) && lstatSync(outputParent).isSymbolicLink()) {
    throw new Error('Symlinked build output directory is forbidden');
  }
  if (outputParent === destination) break;
  const remaining = relative(outputParent, destination).split(sep);
  if (remaining.length === 0 || !remaining[0] || remaining[0] === '..') break;
  outputParent = join(outputParent, remaining[0]);
}
const paths = new Set(files);
// Only regular, directly stored assets may enter the portable release.
// Reject links before reading, so a symlink cannot pull files from outside Sanad.
// Validate every source ancestor, not just the final sanad directory.
// A linked repository parent can otherwise redirect reads to an unaudited tree.
let sourceParent = source;
while (true) {
  const stat = lstatSync(sourceParent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Sanad source path must contain real directories only');
  }
  const parent = resolve(sourceParent, '..');
  if (parent === sourceParent) break;
  sourceParent = parent;
}
for (const name of files) {
  const path = join(source, name);
  if (!existsSync(path)) throw new Error('Missing Sanad asset: ' + name);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Sanad asset must be a regular file: ' + name);
  }
  const text = readFileSync(path, 'utf8');
  if (name.endsWith('.html')) {
    for (const match of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const url = match[1].split(/[?#]/)[0];
      if (/^(?:https?:|\/\/|data:|javascript:)/i.test(url)) throw new Error('External asset forbidden: ' + url);
      if (url.startsWith('/') || url.includes('..') || (url && !paths.has(url.replace(/^\.\//, '')) && !url.startsWith('#'))) {
        throw new Error('Non-portable Sanad asset: ' + url);
      }
    }
  }
  // Fail closed on unquoted src/href values: the quoted-URL validator above
  // intentionally handles only quoted attributes, so unquoted URLs must not
  // bypass the portable preview boundary.
  if (name.endsWith('.html') &&
      /\b(?:src|href)\s*=\s*(?!["'])[^ \t\r\n>]+/i.test(text)) {
    throw new Error('Unquoted HTML resource attribute forbidden: ' + name);
  }
  // Embedded documents and base URL rewrites can load resources outside the
  // approved portable assets even when ordinary src/href checks pass.
  if (name.endsWith('.html') && /<(?:iframe|object|embed|base)\b/i.test(text)) {
    throw new Error('Unreviewed embedded document or base URL forbidden: ' + name);
  }
  // Reject HTML URL-bearing surfaces not covered by src/href validation.
  // A srcset candidate or a refresh directive can otherwise escape the portable preview.
  if (name.endsWith('.html') &&
      (/\b(?:srcset|formaction|poster)\s*=/i.test(text) ||
       /<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i.test(text))) {
    throw new Error('Unreviewed HTML navigation or resource directive forbidden: ' + name);
  }
  // Inline scripts and CSS in HTML must obey the same offline boundary as JS files.
  // This is a static preview safeguard, not a substitute for browser CSP or server controls.
  if ((name.endsWith('.js') || name.endsWith('.html')) &&
      /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\s*\(|sendBeacon\s*\()/i.test(text)) {
    throw new Error('Network behavior found in static preview: ' + name);
  }
  // A standalone preview must not open remote pages or spawn remote workers.
  // A service worker can persist beyond the preview and intercept later requests.
  // Guard both HTML inline scripts and bundled JS; these are not backend controls.
  if ((name.endsWith('.js') || name.endsWith('.html')) &&
      /\b(?:window\s*\.\s*open\s*\(|(?:window\s*\.\s*|document\s*\.\s*)?location\s*\.\s*(?:assign|replace)\s*\(|(?:window\s*\.\s*|document\s*\.\s*)?location\s*\.\s*href\s*=|(?:(?:window|document)\s*\.\s*)?location\s*=\s*(?!=)|(?:new\s+(?:SharedWorker|Worker)|importScripts)\s*\(|\bserviceWorker\s*\.\s*register\s*\()/i.test(text)) {
    throw new Error('Unreviewed navigation or worker behavior forbidden: ' + name);
  }
  // Bracket property access can register persistent workers without matching
  // the dot-property guard above. Reject both forms in portable preview assets.
  if ((name.endsWith('.js') || name.endsWith('.html')) &&
      /\b(?:serviceWorker\s*\[\s*['"]register['"]\s*\]|navigator\s*\[\s*['"]serviceWorker['"]\s*\]\s*(?:\.\s*register|\[\s*['"]register['"]\s*\]))\s*\(/i.test(text)) {
    throw new Error('Unreviewed navigation or worker behavior forbidden: ' + name);
  }
  // No CSS url() resources are part of the four-file portable preview.
  // Reject relative, absolute, data and remote CSS resources alike; otherwise
  // an inline style could silently depend on assets outside the release.
  if (name.endsWith('.html') && /\burl\s*\(/i.test(text)) {
    throw new Error('CSS URL resources forbidden in standalone preview: ' + name);
  }
  if (name.endsWith('.html') && /(?:@import\b|url\s*\(\s*['\"]?\s*(?:https?:|\/\/)|<form\b[^>]*\baction\s*=)/i.test(text)) {
    throw new Error('External CSS or form submission forbidden in static preview: ' + name);
  }
}
if (check) {
  console.log('Sanad standalone asset validation passed (' + files.length + ' files)');
} else {
  // Never recursively remove a caller-selected directory: unrelated files may live there.
  if (existsSync(destination)) {
    const { readdirSync, lstatSync } = await import('node:fs');
    if (lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory() ||
        readdirSync(destination).some(name => {
          if (!paths.has(name)) return true;
          const entry = lstatSync(join(destination, name));
          // Refuse hard-linked files: overwriting an approved filename could
          // mutate an unrelated file outside the release directory.
          return !entry.isFile() || entry.nlink !== 1;
        })) {
      throw new Error('Destination contains files outside the approved Sanad release');
    }
  }
  mkdirSync(destination, { recursive: true });
  for (const name of files) cpSync(join(source, name), join(destination, name));
  console.log('Built portable Sanad preview at ' + relative(root, destination));
}
