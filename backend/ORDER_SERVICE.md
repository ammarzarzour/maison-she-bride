# Transactional order service (not deployed)

Run `node --test backend/order-preparation.test.cjs backend/order-service.test.cjs`.

The server service accepts a VERIFIED authenticated buyer ID, a UUID request key retained by the client across retries, and product IDs/quantities only. It fingerprints the canonical USD request, scopes retry keys to the buyer, rejects reuse with a different cart, and returns the previous order ID for an identical retry.

## Required production adapter

This repository does not yet contain a production database adapter or HTTP endpoint. No real order creation is enabled by this change. The service calls these methods inside a single store.transaction callback:

- lockRequest(buyer, key): acquire a transaction-scoped lock for this pair, including when the record does not yet exist. A row lock on an absent row is insufficient. Back with a unique buyer/key constraint as well.
- findRequest(buyer, key): read only this buyer's committed retry mapping.
- lockProducts(sorted IDs): read and lock current product stock/prices and relevant store approval state until commit. Return decimal prices as strings and store_status. Apply a consistent locking order to avoid deadlocks.
- reserveInventory(items): decrement all quantities with guards; reject on any mismatch. Must share the transaction with all inserts.
- insertOrder(prepared): insert the order AND its items, returning its generated UUID.
- rememberRequest(record): persist buyer/key/fingerprint/order ID atomically.

transaction must commit before resolving and roll back ALL writes on failure; no network calls or external effects inside the callback. Do not implement this contract as separate Supabase REST writes. A commit with an ambiguous network response is resolved by retrying the SAME key. A cancellation or a deliberate new cart needs its own separately specified workflow; the same key cannot be reused for another order. Keep retry mappings for the supported retry lifetime; expiry/reuse is not implemented.

The in-memory test adapter serializes transactions to test the service control flow and rollback behavior. It does NOT validate PostgreSQL locks, RLS, real concurrent connections, authentication or deployment. Those integration tests remain necessary before activation.

No database, permissions, payment, FX feed, or storefront has been changed. Currency is the USD base order only; display currency conversion remains separate. Use synthetic data for future integration tests.
