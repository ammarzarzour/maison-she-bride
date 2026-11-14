# PostgreSQL order adapter — prepared, not activated

The adapter receives an existing node-postgres-compatible Pool. It uses one acquired connection for BEGIN/COMMIT/ROLLBACK, transaction-scoped advisory locking for buyer/request-key pairs, product row locks and store shared locks, guarded stock updates, and parameterized order/item/retry-record inserts. Failed or ambiguous commits are not reported as success; retries must retain the same request key. Do not call pool.query for individual transaction statements. No network request to an exchange-rate provider is made inside the transaction.

Live metadata was inspected without reading personal records. Products, stores, orders and order_items match the required columns. orders.payment_status defaults to unpaid. The retry table private.order_requests is not yet present. A schema proposal is in proposals/order-request-storage.sql; it has NOT been applied. Existing live roles/permissions were NOT changed.

Prerequisites before activation:
1. Review and apply a proper migration for private retry storage; verify the private schema is not exposed in the Data API and review existing schema grants.
2. Provision a server-only database connection and least-privilege backend role after explicit authorization. Never place the database password in GitHub or frontend code. A REST API key is not a PostgreSQL connection password.
3. Implement an authenticated server endpoint that verifies identity independently of the body before calling submitOrder. No endpoint is enabled by these files.
4. Run integration tests on an isolated PostgreSQL database using synthetic fixtures, including independent concurrent connections, rollback, idempotency, commit/network failures, store suspension and concurrent stock changes. Current adapter tests use a query stub; they do not prove real SQL execution or locking correctness.
5. Wire the frontend with a stable request key across retries. Enable request creation only after deployment and end-to-end verification. Keep payments disabled.

Run: node --test backend/order-preparation.test.cjs backend/order-service.test.cjs backend/postgres-order-store.test.cjs

References: https://node-postgres.com/features/transactions and https://www.postgresql.org/docs/17/explicit-locking.html
