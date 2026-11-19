# Offline cart availability preflight

`scripts/cart-policy.mjs` checks a cart against a caller-supplied snapshot of catalog stock, **without reading or writing Supabase**. It aggregates repeated SKUs before checking stock, rejects unknown or duplicate catalog SKUs, invalid quantities and integer overflow, and returns an immutable summary. Identifiers are catalog SKUs only; do not pass customer information.

Run locally with Node.js 22:

```sh
node --test scripts/inventory-policy.test.mjs scripts/cart-policy.test.mjs
```

**Not a reservation or checkout service:** Results always include `authorized: false` and `persisted: false`. They are advisory and may be stale. A future authenticated server-side checkout must atomically recheck and reserve stock within a database transaction, with explicit RLS authorization and concurrency tests. No payment, order, inventory mutation or customer data is handled here.

This module complements `scripts/inventory-policy.mjs` and does not change the independent Sanad Syria build.
