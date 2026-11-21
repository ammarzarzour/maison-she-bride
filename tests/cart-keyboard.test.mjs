import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual storefront keyboard handler, not a reimplementation.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function trapCartFocus(');
const end = html.indexOf("$('categories').addEventListener", start);
assert.ok(start >= 0 && end > start, 'cart keyboard handler must be present');
const handler = html.slice(start, end);

function harness({ open = true, active = 'first', shiftKey = false, focusables = ['first', 'last'] } = {}) {
  const focused = [];
  const elements = new Map();
  for (const id of ['first', 'last', 'outside', 'closeCart']) {
    elements.set(id, {
      id,
      getClientRects: () => [1],
      focus: () => focused.push(id)
    });
  }
  const drawer = {
    classList: { contains: name => name === 'open' && open },
    contains: node => node?.id !== 'outside',
    querySelectorAll: () => focusables.map(id => elements.get(id))
  };
  const context = {
    document: { activeElement: elements.get(active) },
    $: id => id === 'drawer' ? drawer : elements.get(id)
  };
  vm.runInNewContext(handler + '\nthis.trapCartFocus = trapCartFocus;', context);
  let prevented = false;
  const event = {
    key: 'Tab', shiftKey,
    preventDefault: () => { prevented = true; }
  };
  return {
    run: () => context.trapCartFocus(event),
    focused,
    wasPrevented: () => prevented
  };
}

test('Tab wraps from last visible cart control to first', () => {
  const h = harness({ active: 'last' });
  h.run();
  assert.deepEqual(h.focused, ['first']);
  assert.equal(h.wasPrevented(), true);
});

test('Shift+Tab wraps from first visible cart control to last', () => {
  const h = harness({ active: 'first', shiftKey: true });
  h.run();
  assert.deepEqual(h.focused, ['last']);
  assert.equal(h.wasPrevented(), true);
});

test('Tab from outside an open cart moves focus inside', () => {
  const h = harness({ active: 'outside' });
  h.run();
  assert.deepEqual(h.focused, ['first']);
  assert.equal(h.wasPrevented(), true);
});

test('empty cart focusable set falls back to close button', () => {
  const h = harness({ focusables: [] });
  h.run();
  assert.deepEqual(h.focused, ['closeCart']);
  assert.equal(h.wasPrevented(), true);
});

test('closed cart does not intercept Tab', () => {
  const h = harness({ open: false, active: 'last' });
  h.run();
  assert.deepEqual(h.focused, []);
  assert.equal(h.wasPrevented(), false);
});

test('Escape closes only an open cart; closed cart does not change focus or state', () => {
  const marker = "document.addEventListener('keydown',e=>";
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'global keyboard listener must exist');
  const end = html.indexOf(";$('search').addEventListener", start);
  assert.ok(end > start, 'keyboard listener must have a bounded source');
  const listener = html.slice(start, end);
  for (const open of [false, true]) {
    let handler;
    const calls = [];
    const context = {
      document: { addEventListener: (name, fn) => { if (name === 'keydown') handler = fn; } },
      $: id => id === 'drawer' ? { classList: { contains: name => name === 'open' && open } } : null,
      openCart: show => calls.push(['openCart', show]),
      trapCartFocus: () => calls.push(['trapCartFocus'])
    };
    vm.runInNewContext(listener, context);
    assert.equal(typeof handler, 'function');
    handler({ key: 'Escape' });
    assert.deepEqual(calls, open ? [['openCart', false]] : []);
  }
});
