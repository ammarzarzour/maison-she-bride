const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/smoke.yml'), 'utf8');
const tests = fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs')).sort();
const invoked = [...workflow.matchAll(/\bnode\s+tests\/([\w.-]+\.cjs)\b/g)].map(match => match[1]);
const missing = tests.filter(name => !invoked.includes(name));
const duplicates = invoked.filter((name, index) => invoked.indexOf(name) !== index);
const nonexistent = invoked.filter(name => !tests.includes(name));
assert.deepEqual(missing, [], 'Tests absent from CI: ' + missing.join(', '));
assert.deepEqual(duplicates, [], 'Tests invoked more than once: ' + duplicates.join(', '));
assert.deepEqual(nonexistent, [], 'CI references missing test files: ' + nonexistent.join(', '));
console.log('PASS all ' + tests.length + ' test scripts are registered exactly once in CI');
