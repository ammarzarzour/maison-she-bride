# Order preparation boundary

`order-preparation.cjs` prepares exact USD order rows and items from an authenticated buyer ID, a client list containing only product_id/quantity, and server-loaded products. Fetch prices as decimal strings and join the store status as store_status. Supports 1–100 distinct products; quantity and stock follow PostgreSQL INTEGER limits. Request fields cannot override buyer, prices, currency, or order status.

This is not a live checkout endpoint. It neither authenticates a token nor writes orders, reserves stock, charges money, or prevents duplicate HTTP requests. A future trusted writer must authenticate, apply an idempotency key scoped to the buyer, lock and revalidate all relevant inventory and store state, and persist the order/items/inventory atomically. A successful preparation is not a reservation. Do not expose client-side writes or use this helper alone as a security boundary. All tests use synthetic records.

Other currencies remain display requirements; no demo exchange rate is used in order totals. Live FX integration is deferred. Payments and sensitive permission changes remain disabled.

Run: `node --test backend/order-preparation.test.cjs`
