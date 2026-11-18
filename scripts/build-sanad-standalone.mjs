#!/usr/bin/env node
// Build a portable, self-contained Sanad Syria preview without Maison She Bride assets.
// This is a static demonstration only; it does not provide authentication or a backend.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
const destination = resolve(destinations[0] || join(root, 'dist', 'sanad-syria'));
if (destination === source || destination.startsWith(source + sep) || destination === root || !destination.startsWith(root + sep)) {
  throw new Error('Destination must be a separate directory inside the repository');
}
const paths = new Set(files);
for (const name of files) {
  const path = join(source, name);
  if (!existsSync(path)) throw new Error('Missing Sanad asset: ' + name);
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
  if (name.endsWith('.js') && /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b)/.test(text)) {
    throw new Error('Network behavior found in static preview: ' + name);
  }
}
if (check) {
  console.log('Sanad standalone asset validation passed (' + files.length + ' files)');
} else {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const name of files) cpSync(join(source, name), join(destination, name));
  console.log('Built portable Sanad preview at ' + relative(root, destination));
}
