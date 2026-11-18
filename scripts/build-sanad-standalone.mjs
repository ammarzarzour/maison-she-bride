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
if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
  throw new Error('Sanad source directory must be a real directory');
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
  if (name.endsWith('.js') && /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b)/.test(text)) {
    throw new Error('Network behavior found in static preview: ' + name);
  }
}
if (check) {
  console.log('Sanad standalone asset validation passed (' + files.length + ' files)');
} else {
  // Never recursively remove a caller-selected directory: unrelated files may live there.
  if (existsSync(destination)) {
    const { readdirSync, lstatSync } = await import('node:fs');
    if (lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory() ||
        readdirSync(destination).some(name => !paths.has(name) || !lstatSync(join(destination, name)).isFile())) {
      throw new Error('Destination contains files outside the approved Sanad release');
    }
  }
  mkdirSync(destination, { recursive: true });
  for (const name of files) cpSync(join(source, name), join(destination, name));
  console.log('Built portable Sanad preview at ' + relative(root, destination));
}
