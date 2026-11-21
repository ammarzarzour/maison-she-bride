import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('let cartPreviousFocus=null;');
const end = html.indexOf('function trapCartFocus(', start);
assert.ok(start >= 0 && end > start, 'cart controller must be present');
const controller = html.slice(start, end);

function harness(previous = 'toggle') {
  const events = [];
  const elements = new Map();
  const element = (id) => {
    const attributes = new Map();
    const classes = new Set();
    return {
      id, isConnected: true, inert: false,
      classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
      setAttribute(name, value) { attributes.set(name, value); events.push(id + ':set:' + name + ':' + value); },
      removeAttribute(name) { attributes.delete(name); events.push(id + ':remove:' + name); },
      getAttribute(name) { return attributes.get(name); },
      focus() { events.push(id + ':focus'); },
      contains(node) { return node?.id === 'internal'; }
    };
  };
  for (const id of ['drawer', 'overlay', 'cartToggle', 'closeCart', 'external', 'internal']) elements.set(id, element(id));
  elements.get('drawer').inert = true;
  const context = { document: { activeElement: elements.get(previous) }, $: id => elements.get(id) };
  vm.runInNewContext(controller + '\nthis.openCart = openCart;', context);
  return { openCart: context.openCart, elements, events };
}

test('closed cart is initially excluded from assistive technology and keyboard', () => {
  assert.match(html, /<aside[^>]*id="drawer"[^>]*aria-hidden="true"[^>]*inert/);
});

test('opening cart removes isolation before focusing close control', () => {
  const { openCart, elements, events } = harness();
  openCart(true);
  assert.equal(elements.get('drawer').inert, false);
  assert.equal(elements.get('drawer').getAttribute('aria-hidden'), undefined);
  assert.ok(events.indexOf('drawer:remove:aria-hidden') < events.indexOf('closeCart:focus'));
});

test('closing restores external focus before isolating drawer', () => {
  const { openCart, elements, events } = harness('external');
  openCart(true);
  events.length = 0;
  openCart(false);
  assert.equal(elements.get('drawer').inert, true);
  assert.equal(elements.get('drawer').getAttribute('aria-hidden'), 'true');
  assert.ok(events.indexOf('external:focus') < events.indexOf('drawer:set:aria-hidden:true'));
});

test('closing never restores focus to an element inside the drawer', () => {
  const { openCart, events } = harness('internal');
  openCart(true);
  events.length = 0;
  openCart(false);
  assert.ok(events.includes('cartToggle:focus'));
  assert.ok(!events.includes('internal:focus'));
});

test('closing falls back to cart toggle if previous focus target was removed', () => {
  const { openCart, elements, events } = harness('external');
  openCart(true);
  elements.get('external').isConnected = false;
  events.length = 0;
  openCart(false);
  assert.ok(events.includes('cartToggle:focus'));
  assert.ok(!events.includes('external:focus'));
  assert.equal(elements.get('drawer').inert, true);
});

test('closing without a previous focus target still isolates the drawer', () => {
  const { openCart, elements, events } = harness('missing');
  openCart(true);
  events.length = 0;
  openCart(false);
  assert.ok(events.includes('cartToggle:focus'));
  assert.equal(elements.get('drawer').getAttribute('aria-hidden'), 'true');
  assert.ok(events.indexOf('cartToggle:focus') < events.indexOf('drawer:set:aria-hidden:true'));
});
